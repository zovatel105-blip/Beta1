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

  // Prefetch de bytes JUSTO MÁS ALLÁ de la ventana de montaje (slides +3 y +4):
  // sus <video> aún no están montados, así que pre-calentamos la caché HTTP del
  // navegador (posters + vídeos) para que al entrar en la ventana de precarga ya
  // estén listos. Usa <link rel="prefetch"> (prioridad baja, no bloquea el activo).
  useEffect(() => {
    if (typeof document === 'undefined' || posts.length === 0) return
    const urls = []
    for (let k = 3; k <= 4; k++) {
      const p = posts[activeIdx + k]
      if (!p) continue
      const sides = [p.sideA, p.sideB].filter(Boolean)
      for (const s of sides) {
        if (s.posterUrl) urls.push({ href: s.posterUrl, as: 'image' })
        if (s.videoUrl) urls.push({ href: s.videoUrl, as: 'video' })
      }
      if (!sides.length && p.videoUrl) urls.push({ href: p.videoUrl, as: 'video' })
    }
    const links = urls.map(({ href, as }) => {
      const l = document.createElement('link')
      l.rel = 'prefetch'
      l.as = as
      l.href = href
      document.head.appendChild(l)
      return l
    })
    return () => { links.forEach((l) => { try { document.head.removeChild(l) } catch { /* ignore */ } }) }
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
          virtual={{ enabled: true, addSlidesBefore: 2, addSlidesAfter: 3, cache: true }}
          observer={true}
          observeParents={true}
          onSwiper={(s) => (swiperRef.current = s)}
          onSlideChange={handleSlideChange}
          className="snaptok-swiper"
        >
          {posts.map((post, i) => {
            // Reproducción: solo el slide activo.
            const isActive = i === activeIdx
            // Precarga: ventana amplia (1 atrás + 2 adelante) para que el vídeo
            // ya esté montado y bufferizado (preload="auto") al llegar, y para que
            // volver atrás 1 sea instantáneo. Los no-activos se montan en PAUSA.
            const isNear = i >= activeIdx - 1 && i <= activeIdx + 2
            return (
              <SwiperSlide key={post.id} virtualIndex={i}>
                {post.type === 'duet' ? (
                  <DuetSlide
                    post={post}
                    isActive={isActive}
                    isNear={isNear}
                    muted={muted}
                    onRequestNext={() => swiperRef.current?.slideNext()}
                    onChallenge={openChallenge}
                  />
                ) : (
                  <CarouselSlide
                    post={post}
                    isActive={isActive}
                    isNear={isNear}
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
