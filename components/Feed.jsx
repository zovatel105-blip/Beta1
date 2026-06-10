'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState en event handlers (useCallback) y carga inicial async; falso positivo de la regla experimental. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Virtual, Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/virtual'
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

async function fetchPage(cursor) {
  const res = await fetch(`/api/feed?cursor=${cursor}&limit=8`, { cache: 'no-store' })
  if (!res.ok) throw new Error('feed fetch failed')
  return res.json()
}

async function fetchUploads() {
  try {
    const res = await fetch('/api/uploads', { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    // Solo se muestran publicaciones de votación (1vs1 / versus).
    return (data.posts || []).filter((p) => p.type === 'duet' || p.type === 'versus')
  } catch { return [] }
}

export default function Feed() {
  const [posts, setPosts] = useState([])
  const [cursor, setCursor] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [muted, setMuted] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [challengeTarget, setChallengeTarget] = useState(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [battlesOpen, setBattlesOpen] = useState(false)
  const [activeChallengesOpen, setActiveChallengesOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const loadingRef = useRef(false)
  const swiperRef = useRef(null)

  const refreshChallenges = useCallback(async () => {
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      const data = await res.json()
      setPendingCount((data.challenges || []).length)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshChallenges() }, [refreshChallenges])

  // FASE 2: arrancar el medidor de red (estimación de ancho de banda real).
  useEffect(() => { startNetworkMonitor() }, [])

  // FASE 3: registrar el Service Worker (caché de pósters/imágenes).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ })
    }
  }, [])

  const openChallenge = useCallback((target) => {
    setChallengeTarget(target)
    setChallengeOpen(true)
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const data = await fetchPage(cursor)
      setPosts((prev) => [...prev, ...data.posts])
      setCursor(data.nextCursor)
    } catch (e) {
      console.error('loadMore error', e)
    } finally {
      loadingRef.current = false
    }
  }, [cursor])

  // initial: load uploads + page 1 en PARALELO (antes iban en serie y
  // retrasaban el primer render del feed).
  useEffect(() => {
    (async () => {
      const [uploads, data] = await Promise.all([fetchUploads(), fetchPage(0)])
      setPosts([...uploads, ...data.posts])
      setCursor(data.nextCursor)
    })()
  }, [])

  useEffect(() => {
    if (posts.length === 0) return
    if (activeIdx >= posts.length - 3) loadMore()
  }, [activeIdx, posts.length, loadMore])

  const handleSlideChange = useCallback((swiper) => {
    setActiveIdx(swiper.activeIndex)
  }, [])

  // FASE 1 — Pre-calentar el ARRANQUE de los slides justo fuera de la ventana de
  // montaje (+3/+4): primeros ~512 KB del vídeo (en la calidad que se elegirá
  // según la red) vía petición Range, + el poster. Así, al entrar en la ventana,
  // el arranque ya está en caché. Range = solo el inicio, sin malgastar datos.
  useEffect(() => {
    if (typeof window === 'undefined' || posts.length === 0) return
    const controllers = []
    const warmVideo = (url) => {
      if (!url) return
      const ctrl = new AbortController()
      controllers.push(ctrl)
      fetch(url, { headers: { Range: 'bytes=0-524287' }, signal: ctrl.signal }).catch(() => {})
    }
    const warmImg = (url) => { if (url) { const i = new Image(); i.src = url } }
    for (let k = 3; k <= 4; k++) {
      const p = posts[activeIdx + k]
      if (!p) continue
      const sides = [p.sideA, p.sideB].filter(Boolean)
      if (sides.length) {
        for (const s of sides) { warmImg(s.posterUrl); warmVideo(pickQuality(s.qualities, s.videoUrl)) }
      } else if (p.videoUrl) {
        warmImg(p.posterUrl); warmVideo(p.videoUrl)
      }
    }
    return () => controllers.forEach((c) => { try { c.abort() } catch { /* ignore */ } })
  }, [activeIdx, posts])

  const onFirstInteraction = useCallback(() => setMuted(false), [])

  const handleUploaded = useCallback((newPost) => {
    setPosts((prev) => [newPost, ...prev])
    setActiveIdx(0)
    if (swiperRef.current) swiperRef.current.slideTo(0, 0)
  }, [])

  return (
    <div className="feed-container fixed inset-0 bg-black" onPointerDown={muted ? onFirstInteraction : undefined}>
      {posts.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        </div>
      ) : (
        <Swiper
          modules={[Virtual, Mousewheel, Keyboard]}
          direction="vertical"
          slidesPerView={1}
          spaceBetween={0}
          speed={300}
          resistance={false}
          resistanceRatio={0}
          threshold={5}
          shortSwipes={true}
          longSwipes={true}
          longSwipesRatio={0.4}
          longSwipesMs={300}
          touchRatio={1}
          followFinger={true}
          mousewheel={{ forceToAxis: true, sensitivity: 1, releaseOnEdges: false, thresholdDelta: 20 }}
          keyboard={{ enabled: true, onlyInViewport: true }}
          virtual={{ enabled: true, addSlidesBefore: 3, addSlidesAfter: 3, cache: true }}
          observer={true}
          observeParents={true}
          onSwiper={(s) => (swiperRef.current = s)}
          onSlideChange={handleSlideChange}
          className="snaptok-swiper"
        >
          {posts.map((post, i) => {
            // Reproducción: solo el slide activo.
            const isActive = i === activeIdx
            // Precarga: ventana amplia (2 atrás + 2 adelante) para que el vídeo
            // ya esté montado y bufferizado (preload="auto") al llegar, tanto
            // deslizando hacia delante como hacia atrás. Los no-activos se montan
            // en PAUSA. (Las versus solo montan su 2º vídeo al activarse, así no
            // se agota el presupuesto de decodificadores del navegador.)
            const isNear = i >= activeIdx - 2 && i <= activeIdx + 2
            // Adyacente inmediato (±1): se "calienta" el decodificador (priming)
            // para que el arranque al activarse sea instantáneo.
            const isAdjacent = Math.abs(i - activeIdx) <= 1
            return (
              <SwiperSlide key={post.id} virtualIndex={i}>
                {post.type === 'duet' ? (
                  <DuetSlide
                    post={post}
                    isActive={isActive}
                    isNear={isNear}
                    isAdjacent={isAdjacent}
                    muted={muted}
                    onRequestNext={() => swiperRef.current?.slideNext()}
                    onChallenge={openChallenge}
                  />
                ) : (
                  <CarouselSlide
                    post={post}
                    isActive={isActive}
                    isNear={isNear}
                    isAdjacent={isAdjacent}
                    muted={muted}
                    onRequestNext={() => swiperRef.current?.slideNext()}
                    onChallenge={openChallenge}
                  />
                )}
              </SwiperSlide>
            )
          })}
        </Swiper>
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
        onClose={() => setBattlesOpen(false)}
        onOpenActive={() => setActiveChallengesOpen(true)}
        onOpenUpload={() => { setBattlesOpen(false); setUploadOpen(true) }}
        onOpenInbox={() => { setBattlesOpen(false); setInboxOpen(true) }}
        onOpenProfile={() => { setBattlesOpen(false); setProfileOpen(true) }}
      />
      <ActiveChallengesPage
        open={activeChallengesOpen}
        onClose={() => setActiveChallengesOpen(false)}
        onAccepted={handleUploaded}
        onChanged={refreshChallenges}
      />
    </div>
  )
}
