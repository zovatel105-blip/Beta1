'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Virtual, Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/virtual'
import VideoSlide from './VideoSlide'
import DuetSlide from './DuetSlide'
import BottomNav from './BottomNav'
import UploadDialog from './UploadDialog'

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
    return data.posts || []
  } catch { return [] }
}

export default function Feed() {
  const [posts, setPosts] = useState([])
  const [cursor, setCursor] = useState(0)
  const [activeIdx, setActiveIdx] = useState(0)
  const [muted, setMuted] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const loadingRef = useRef(false)
  const swiperRef = useRef(null)

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

  // initial: load uploads first (pinned at top), then page 1
  useEffect(() => {
    (async () => {
      const uploads = await fetchUploads()
      const data = await fetchPage(0)
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
          virtual={{ enabled: true, addSlidesBefore: 1, addSlidesAfter: 2, cache: true }}
          observer={true}
          observeParents={true}
          onSwiper={(s) => (swiperRef.current = s)}
          onSlideChange={handleSlideChange}
          className="snaptok-swiper"
        >
          {posts.map((post, i) => (
            <SwiperSlide key={post.id} virtualIndex={i}>
              {post.type === 'duet' ? (
                <DuetSlide
                  post={post}
                  isActive={i === activeIdx}
                  isNear={Math.abs(i - activeIdx) <= 1}
                  muted={muted}
                />
              ) : (
                <VideoSlide
                  post={post}
                  isActive={i === activeIdx}
                  isNear={Math.abs(i - activeIdx) <= 1}
                  muted={muted}
                />
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      )}
      <BottomNav onOpenUpload={() => setUploadOpen(true)} />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
    </div>
  )
}
