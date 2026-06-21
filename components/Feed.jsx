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
import GuestPromptModal from './GuestPromptModal'
import AuthModal from './AuthModal'
import { useAuth } from '@/contexts/AuthContext'
import { notificationsUnreadCount } from '@/lib/notifications'
import { startNetworkMonitor, pickQuality, shouldConserve } from '@/lib/networkQuality'
import { useFeed } from '@/hooks/useFeed'
import { useGuestTracking } from '@/hooks/useGuestTracking'
import { reportBackground, reportDecoderReleaseMs } from '@/lib/perfMetrics'

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
function warmVideo(url, controllers, full = false) {
  if (!url || prefetched.has(url)) return
  prefetched.add(url)
  const ctrl = new AbortController()
  controllers.push(ctrl)
  // `full`: GET completo (200 cacheable) SOLO para la tarjeta inmediata; el resto
  // solo el init (~512 KB). fetchpriority='low' es CLAVE: la precarga nunca debe
  // robarle conexión/ancho de banda al vídeo ACTIVO (si no, el activo no carga).
  const opts = { signal: ctrl.signal, cache: 'force-cache', priority: 'low' }
  if (!full) opts.headers = { Range: 'bytes=0-524287' }
  fetch(url, opts).catch(() => {})
}

// WARM solo se desactiva en modo conservador (ahorro de datos / batería baja).
// Antes lo limitábamos por deviceMemory/hardwareConcurrency, pero deviceMemory
// es `undefined` en iOS/Safari (y en varios Android) -> el warm quedaba apagado
// justo donde más se nota. Como solo calentamos i+1 (pico ≤4 decoders, con la
// anterior liberada), es seguro en cualquier gama.

// G10 — Ventana de PÓSTERS (más amplia que la de vídeo/decoders): las tarjetas
// dentro de ±POSTER_WINDOW muestran su póster (imagen, 0 decoders) aunque no
// estén montadas como tarjeta -> un scroll rápido siempre aterriza sobre un
// póster ya cacheado, nunca en negro ni con spinner.
const POSTER_WINDOW = 3
const slotPoster = (p) => p && (p.posterUrl || p.sideA?.posterUrl || p.thumbnailUrl || null)

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
  const { showGuestPrompt, dismissPrompt, trackVideoView, isGuest } = useGuestTracking()
  const { user } = useAuth()

  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  // G3: cuando la pestaña se oculta, deshabilitamos la reproducción para que las
  // tarjetas LIBEREN los decoders (no consumir batería/CPU en background).
  const [playbackEnabled, setPlaybackEnabled] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Gating de publicación: solo usuarios registrados pueden subir/publicar.
  // Si un invitado pulsa "Crear", abrimos el login; tras autenticarse, se abre
  // automáticamente el diálogo de subida (pendingUpload).
  const [authOpen, setAuthOpen] = useState(false)
  const [pendingUpload, setPendingUpload] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // username del perfil a mostrar: null = mi propio perfil; si no, perfil ajeno.
  const [profileUsername, setProfileUsername] = useState(null)
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

  // Abrir el perfil (ajeno) de un autor al tocar su avatar/nombre en el feed.
  const openAuthorProfile = useCallback((uname) => {
    if (!uname) return
    setProfileUsername(uname)
    setProfileOpen(true)
  }, [])

  // Gating de publicación: si hay sesión abre la subida; si no, abre el login.
  const requestUpload = useCallback(() => {
    if (user) {
      setUploadOpen(true)
    } else {
      setPendingUpload(true)
      setAuthOpen(true)
    }
  }, [user])
  // Tras autenticarse desde el flujo "Crear", abrir automáticamente la subida.
  useEffect(() => {
    if (user && pendingUpload) {
      setPendingUpload(false)
      setUploadOpen(true)
    }
  }, [user, pendingUpload])

  // Medidor de red (estimación de ancho de banda real para la calidad adaptativa).
  useEffect(() => { startNetworkMonitor() }, [])
  // Service Worker (caché de pósters/imágenes; NO intercepta vídeo).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
    }
  }, [])

  // G3 — Ciclo background/foreground: al ocultar la pestaña liberamos decoders
  // (playbackEnabled=false -> las tarjetas hacen release()); al volver, se
  // re-adquieren limpiamente. Instrumentamos el tiempo de liberación (C1/G3).
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => {
      if (document.hidden) {
        reportBackground()
        const t0 = (typeof performance !== 'undefined' ? performance.now() : 0)
        setPlaybackEnabled(false)
        // medir cuándo el árbol ha liberado (2º frame tras el commit de React)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          reportDecoderReleaseMs((typeof performance !== 'undefined' ? performance.now() : 0) - t0)
        }))
      } else {
        setPlaybackEnabled(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const openChallenge = useCallback((target) => {
    // No puedes retarte a ti mismo.
    if (target?.author?.username && user?.username && target.author.username === user.username) {
      return
    }
    setChallengeTarget(target)
    setChallengeOpen(true)
  }, [user])

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
            // Trackear visualización de video para usuarios invitados
            if (isGuest) {
              trackVideoView()
            }
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
  }, [posts.length, loadMore, isGuest, trackVideoView])

  // Prefetch silencioso del media de las PRÓXIMAS tarjetas, por delante de la
  // ventana de montaje -> arranque instantáneo al llegar (aunque deslices rápido).
  useEffect(() => {
    if (typeof window === 'undefined' || posts.length === 0) return
    const controllers = []
    // G4 — Modo ahorro (Data Saver / batería baja): profundidad 1 y SOLO pósters
    // (sin warm de bytes de vídeo) para conservar datos y energía.
    const conserve = shouldConserve()
    // Profundidad 2 (no 3): descargar demasiado por delante satura las ~6
    // conexiones del navegador y el vídeo ACTIVO se queda sin cargar.
    const depth = conserve ? 1 : 2
    for (let k = 1; k <= depth; k++) {
      const p = posts[activeIndex + k]
      if (!p) continue
      // Solo la tarjeta INMEDIATA (k=1) se descarga completa; la k=2 solo el init.
      const full = k === 1
      const sides = [p.sideA, p.sideB].filter(Boolean)
      if (sides.length) {
        for (const s of sides) {
          prefetchImg(s.posterUrl)
          if (!conserve) warmVideo(pickQuality(s.qualities, s.videoUrl), controllers, full)
        }
      } else if (p.videoUrl) {
        prefetchImg(p.posterUrl)
        if (!conserve) warmVideo(p.videoUrl, controllers, full)
      }
    }
    // G10 — pósters de una ventana SIMÉTRICA más amplia (±POSTER_WINDOW), solo
    // imágenes (baratas, deduplicadas): garantiza que un scroll rápido en
    // cualquier dirección aterrice sobre un póster ya cacheado.
    for (let k = -POSTER_WINDOW; k <= POSTER_WINDOW; k++) {
      const p = posts[activeIndex + k]
      if (!p) continue
      prefetchImg(slotPoster(p))
      if (p.sideB?.posterUrl) prefetchImg(p.sideB.posterUrl)
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
            const inPosterWindow = Math.abs(i - activeIndex) <= POSTER_WINDOW
            const isActive = i === activeIndex
            // WARM: la tarjeta SIGUIENTE (i+1) se precarga (buffer real + frame
            // 1) para arrancar con 0 espera al deslizar. En 1vs1 caliente AMBOS
            // lados. Solo se desactiva en modo ahorro (datos/batería baja).
            const warm = i === activeIndex + 1 && !shouldConserve()
            const poster = slotPoster(post)
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
                      warm={warm}
                      muted={muted}
                      playbackEnabled={playbackEnabled}
                      infoBottom
                      onRequestNext={goNext}
                      onChallenge={openChallenge}
                      onOpenProfile={openAuthorProfile}
                    />
                  ) : (
                    <CarouselSlide
                      post={post}
                      isActive={isActive}
                      isNear={inWindow}
                      isAdjacent={inWindow}
                      warm={warm}
                      muted={muted}
                      playbackEnabled={playbackEnabled}
                      infoBottom
                      onRequestNext={goNext}
                      onChallenge={openChallenge}
                      onOpenProfile={openAuthorProfile}
                    />
                  )
                ) : inPosterWindow && poster ? (
                  // G10: tarjeta NO montada pero dentro de la ventana de pósters ->
                  // mostramos su póster (0 decoders). Un scroll rápido nunca cae en
                  // negro ni muestra spinner; al estabilizarse, monta la tarjeta real.
                  <img
                    src={poster}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : null /* muy lejos: slot vacío -> 0 media, 0 decoders */}
              </section>
            )
          })}
        </div>
      )}
      <BottomNav
        onOpenUpload={requestUpload}
        onOpenInbox={() => setInboxOpen(true)}
        onOpenProfile={() => { setProfileUsername(null); setProfileOpen(true) }}
        onGoHome={() => {
          setProfileOpen(false)
          setInboxOpen(false)
          setBattlesOpen(false)
          setActiveChallengesOpen(false)
        }}
        onOpenBattles={() => setBattlesOpen(true)}
        unreadCount={notificationsUnreadCount}
        challengesCount={pendingCount}
        activeTab={
          profileOpen ? 'profile' :
          inboxOpen ? 'messages' :
          (battlesOpen || activeChallengesOpen) ? 'explore' :
          'home'
        }
      />
      <ProfilePage
        open={profileOpen}
        username={profileUsername}
        onClose={() => { setProfileOpen(false); setProfileUsername(null) }}
        onOpenProfile={openAuthorProfile}
        onOpenUpload={() => { setProfileOpen(false); requestUpload() }}
        onChallenge={openChallenge}
        onRequireAuth={() => setAuthOpen(true)}
      />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} onChallengeCreated={refreshChallenges} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} defaultTab="register" />
      <ChallengeDialog
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        target={challengeTarget}
        onCreated={() => {
          refreshChallenges()
          // Notifica a la tarjeta de origen para incrementar su contador "Retar".
          if (challengeTarget?.postId) {
            try { window.dispatchEvent(new CustomEvent('twyk:challenged', { detail: { postId: challengeTarget.postId } })) } catch { /* ignore */ }
          }
        }}
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
        onOpenUpload={() => { setBattlesOpen(false); requestUpload() }}
        onOpenInbox={() => { setBattlesOpen(false); setInboxOpen(true) }}
        onOpenProfile={() => { setBattlesOpen(false); setProfileOpen(true) }}
      />
      <ActiveChallengesPage
        open={activeChallengesOpen}
        onClose={() => setActiveChallengesOpen(false)}
        onAccepted={(post) => { handleUploaded(post); setBattlesRefresh((k) => k + 1) }}
        onChanged={refreshChallenges}
      />
      <GuestPromptModal
        open={showGuestPrompt}
        onClose={dismissPrompt}
      />
    </div>
  )
}
