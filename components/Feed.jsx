'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dirigido por IntersectionObserver y handlers (no por píxel de scroll). */

import { useCallback, useEffect, useRef, useState } from 'react'
import DuetSlide from './DuetSlide'
import CarouselSlide from './CarouselSlide'
import BottomNav from './BottomNav'
import UploadDialog from './UploadDialog'
import ChallengeDialog from './ChallengeDialog'
import NotificationsInbox from './NotificationsInbox'
import ProfilePage from './ProfilePage'
import CompletedBattlesPage from './CompletedBattlesPage'
import ActiveChallengesPage from './ActiveChallengesPage'
import { notificationsUnreadCount } from '@/lib/notifications'
import { startNetworkMonitor, pickQuality } from '@/lib/networkQuality'
import { useFeed } from '@/hooks/useFeed'

// ──────────────────────────────────────────────────────────────────────────
// SMART PREFETCH (dedupe a nivel de módulo): cada URL se precarga UNA vez.
//   Vídeos: petición Range de los primeros ~512 KB (solo el arranque, sin
//     malgastar datos) -> al activarse la tarjeta el inicio ya está en caché.
//   Imágenes (pósters): new Image() -> descarga + decode async fuera del render.
// ──────────────────────────────────────────────────────────────────────────
const prefetched = new Set()
function prefetchImg(url) {
  if (!url || prefetched.has(url)) return
  prefetched.add(url)
  const i = new Image()
  i.decoding = 'async'
  i.src = url
}
function warmVideo(url, controllers) {
  if (!url || prefetched.has(url)) return
  prefetched.add(url)
  const ctrl = new AbortController()
  controllers.push(ctrl)
  fetch(url, { headers: { Range: 'bytes=0-524287' }, signal: ctrl.signal }).catch(() => {})
}

/**
 * Feed — motor de scroll vertical de alto rendimiento (nivel TikTok Web) con
 * las tarjetas ricas de SnapTok (CarouselSlide / DuetSlide).
 *
 *  REGLA #1 — VENTANA DOM DE 3: solo se montan tarjetas en activeIndex-1,
 *    activeIndex y activeIndex+1. El resto son <section> vacíos que preservan
 *    la geometría del scroll-snap (scrollHeight estable -> el snap no salta).
 *  REGLA #3 — ZERO-JANK: CERO listeners de scroll. Un ÚNICO IntersectionObserver
 *    (threshold 0.7) cambia activeIndex (1 setState por tarjeta, nunca por píxel).
 *    El scroll-snap es 100% nativo del compositor -> imposible perder frames.
 *  REGLA #2 — la liberación agresiva del decoder vive DENTRO de las tarjetas.
 */
export default function Feed() {
  const { posts, ready, loadMore, prependPost } = useFeed()

  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [battlesOpen, setBattlesOpen] = useState(false)
  const [activeChallengesOpen, setActiveChallengesOpen] = useState(false)
  const [battlesRefresh, setBattlesRefresh] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const containerRef = useRef(null)
  const slotRefs = useRef([])
  // Espejo en ref del índice activo: el observer y goNext leen SIEMPRE el valor
  // actual sin re-suscribirse (callbacks estables -> React.memo intacto).
  const activeIndexRef = useRef(0)
  const postsLenRef = useRef(0)
  useEffect(() => { postsLenRef.current = posts.length }, [posts.length])

  const refreshChallenges = useCallback(async () => {
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      const data = await res.json()
      setPendingCount((data.challenges || []).length)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshChallenges() }, [refreshChallenges])
  // Medidor de red (estimación de ancho de banda real para la calidad adaptativa).
  useEffect(() => { startNetworkMonitor() }, [])
  // Service Worker (caché de pósters/imágenes; NO intercepta vídeo).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
    }
  }, [])

  const openChallenge = useCallback((target) => {
    setChallengeTarget(target)
    setChallengeOpen(true)
  }, [])

  // Auto-avance al SIGUIENTE duelo (winner card -> "siguiente"). scrollTo nativo:
  // la animación corre en el compositor, no en JS.
  const goNext = useCallback(() => {
    const el = containerRef.current
    const next = activeIndexRef.current + 1
    if (!el || next >= postsLenRef.current) return
    el.scrollTo({ top: next * el.clientHeight, behavior: 'smooth' })
  }, [])

  // ÚNICO IntersectionObserver para todo el feed (Regla #3). Se re-suscribe al
  // crecer la lista (scroll infinito) para observar los nuevos slots.
  useEffect(() => {
    const root = containerRef.current
    if (!root || posts.length === 0) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const idx = Number(entry.target.dataset.index)
          if (Number.isNaN(idx)) continue
          if (idx !== activeIndexRef.current) {
            activeIndexRef.current = idx
            setActiveIndex(idx) // 1 único setState por cambio de tarjeta
          }
          // PREFETCH de la SIGUIENTE página: cuando la tarjeta en activeIndex+2
          // (zona de cola) entra en viewport, pedimos más feed. Mantiene siempre
          // contenido por delante sin romper la ventana DOM de 3.
          if (idx >= postsLenRef.current - 3) loadMore()
        }
      },
      { root, threshold: 0.7 }
    )
    for (const slot of slotRefs.current) {
      if (slot) io.observe(slot)
    }
    return () => io.disconnect()
  }, [posts.length, loadMore])

  // Prefetch silencioso del media de las PRÓXIMAS 2 tarjetas (activeIndex+1/+2),
  // justo por delante de la ventana de montaje -> arranque instantáneo al llegar.
  useEffect(() => {
    if (typeof window === 'undefined' || posts.length === 0) return
    const controllers = []
    for (let k = 1; k <= 2; k++) {
      const p = posts[activeIndex + k]
      if (!p) continue
      const sides = [p.sideA, p.sideB].filter(Boolean)
      if (sides.length) {
        for (const s of sides) { prefetchImg(s.posterUrl); warmVideo(pickQuality(s.qualities, s.videoUrl), controllers) }
      } else if (p.videoUrl) {
        prefetchImg(p.posterUrl); warmVideo(p.videoUrl, controllers)
      }
    }
    return () => controllers.forEach((c) => { try { c.abort() } catch { /* ignore */ } })
  }, [activeIndex, posts])

  const onFirstInteraction = useCallback(() => setMuted(false), [])

  const handleUploaded = useCallback((newPost) => {
    prependPost(newPost)
    activeIndexRef.current = 0
    setActiveIndex(0)
    const el = containerRef.current
    if (el) el.scrollTo({ top: 0, behavior: 'auto' })
  }, [prependPost])

  return (
    <div className="feed-container fixed inset-0 bg-black" onPointerDown={muted ? onFirstInteraction : undefined}>
      {!ready || posts.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : (
        <div
          ref={containerRef}
          // h-[100dvh]: cero saltos al colapsar/expandir la barra de URL móvil.
          // snap-y snap-mandatory: scroll-snap NATIVO (0 JS por frame).
          // [contain:strict]: aísla layout/paint/size del scroll del resto.
          // overscroll-y-contain: bloquea el pull-to-refresh accidental.
          className="absolute inset-0 h-[100dvh] w-full overflow-y-auto snap-y snap-mandatory no-scrollbar overscroll-y-contain [contain:strict]"
        >
          {posts.map((post, i) => {
            // Regla #1: máximo 3 tarjetas montadas (anterior, activa, siguiente).
            const inWindow = Math.abs(i - activeIndex) <= 1
            const isActive = i === activeIndex
            return (
              <section
                key={post.id}
                data-index={i}
                ref={(el) => { slotRefs.current[i] = el }}
                className="h-[100dvh] w-full snap-start snap-always relative"
              >
                {inWindow ? (
                  post.type === 'duet' ? (
                    <DuetSlide
                      post={post}
                      isActive={isActive}
                      isNear={inWindow}
                      isAdjacent={inWindow}
                      muted={muted}
                      onRequestNext={goNext}
                      onChallenge={openChallenge}
                    />
                  ) : (
                    <CarouselSlide
                      post={post}
                      isActive={isActive}
                      isNear={inWindow}
                      isAdjacent={inWindow}
                      muted={muted}
                      onRequestNext={goNext}
                      onChallenge={openChallenge}
                    />
                  )
                ) : null /* fuera de la ventana: slot vacío -> 0 media, 0 decoders */}
              </section>
            )
          })}
        </div>
      )}
      <BottomNav
        onOpenUpload={() => setUploadOpen(true)}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onGoHome={() => setProfileOpen(false)}
        onOpenBattles={() => setBattlesOpen(true)}
        unreadCount={notificationsUnreadCount}
        challengesCount={pendingCount}
      />
      <ProfilePage
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenUpload={() => { setProfileOpen(false); setUploadOpen(true) }}
      />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} onChallengeCreated={refreshChallenges} />
      <ChallengeDialog
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        target={challengeTarget}
        onCreated={() => { refreshChallenges() }}
      />
      <NotificationsInbox
        open={inboxOpen}
        onClose={() => setInboxOpen(false)}
      />
      <CompletedBattlesPage
        open={battlesOpen}
        refreshKey={battlesRefresh}
        onClose={() => setBattlesOpen(false)}
        onOpenActive={() => setActiveChallengesOpen(true)}
        onOpenUpload={() => { setBattlesOpen(false); setUploadOpen(true) }}
        onOpenInbox={() => { setBattlesOpen(false); setInboxOpen(true) }}
        onOpenProfile={() => { setBattlesOpen(false); setProfileOpen(true) }}
      />
      <ActiveChallengesPage
        open={activeChallengesOpen}
        onClose={() => setActiveChallengesOpen(false)}
        onAccepted={(post) => { handleUploaded(post); setBattlesRefresh((k) => k + 1) }}
        onChanged={refreshChallenges}
      />
    </div>
  )
}
