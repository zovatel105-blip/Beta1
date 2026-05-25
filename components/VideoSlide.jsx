'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Heart, MessageCircle, Bookmark, Share2, Music, Play } from 'lucide-react'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function VideoSlide({ post, isActive, isNear, muted }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const lastTapRef = useRef(0)
  const tapTimerRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [progress, setProgress] = useState(0)
  const [likes, setLikes] = useState(post.stats.likes)
  const [liked, setLiked] = useState(false)
  const [floatingHearts, setFloatingHearts] = useState([])
  const rafRef = useRef(0)

  // mount video src only when near (virtualization-friendly even if Swiper keeps node)
  const srcToUse = isNear ? post.videoUrl : ''

  // play/pause based on isActive
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isActive) {
      v.muted = muted
      const tryPlay = async () => {
        try {
          await v.play()
          setPaused(false)
        } catch (err) {
          // autoplay blocked: try muted
          try {
            v.muted = true
            await v.play()
            setPaused(false)
          } catch (e) {
            setPaused(true)
          }
        }
      }
      tryPlay()
    } else {
      v.pause()
      // keep time for resume on scroll-back
    }
  }, [isActive, muted])

  // sync muted prop changes
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
  }, [muted])

  // progress with rAF
  useEffect(() => {
    const v = videoRef.current
    if (!v || !isActive) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      if (v.duration > 0) {
        setProgress((v.currentTime / v.duration) * 100)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive])

  const doLike = useCallback((fromDoubleTap, evt) => {
    if (!liked) {
      setLiked(true)
      setLikes((n) => n + 1)
    }
    if (fromDoubleTap && evt) {
      const rect = containerRef.current?.getBoundingClientRect()
      const x = rect ? evt.clientX - rect.left : 100
      const y = rect ? evt.clientY - rect.top : 200
      const id = Math.random().toString(36).slice(2)
      setFloatingHearts((h) => [...h, { id, x, y }])
      setTimeout(() => {
        setFloatingHearts((h) => h.filter((p) => p.id !== id))
      }, 850)
    }
  }, [liked])

  const toggleLike = useCallback(() => {
    setLiked((prev) => {
      setLikes((n) => n + (prev ? -1 : 1))
      return !prev
    })
  }, [])

  // tap vs double-tap
  const handleTap = useCallback((e) => {
    const now = Date.now()
    const isDouble = now - lastTapRef.current < 300
    lastTapRef.current = now
    if (isDouble) {
      clearTimeout(tapTimerRef.current)
      doLike(true, e)
      return
    }
    tapTimerRef.current = setTimeout(() => {
      const v = videoRef.current
      if (!v) return
      if (v.paused) {
        v.play().then(() => setPaused(false)).catch(() => {})
      } else {
        v.pause()
        setPaused(true)
      }
    }, 260)
  }, [doLike])

  const description = post.description || ''

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden select-none">
      {/* video */}
      {srcToUse ? (
        <video
          ref={videoRef}
          poster={post.thumbnailUrl}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          loop
          preload="auto"
          muted={muted}
          onLoadedData={() => { setLoaded(true); setErrored(false) }}
          onCanPlay={() => { setLoaded(true); setErrored(false) }}
          onError={(e) => {
            // Only count as a real error if the <video> itself has no playable source.
            // Errors on individual <source> tags also bubble here but don't mean total failure.
            const v = e.currentTarget
            if (v && v.networkState === 3 /* NO_SOURCE */ && v.readyState === 0) {
              setErrored(true)
            }
          }}
          onClick={handleTap}
        >
          <source src={srcToUse} type="video/mp4" />
          <source src={srcToUse.replace(/\.mp4$/, '.webm')} type="video/webm" />
        </video>
      ) : (
        <img
          src={post.thumbnailUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-70"
          onClick={handleTap}
          draggable={false}
        />
      )}

      {/* tap layer covering most of the screen (so double tap registers) */}
      <div
        className="absolute inset-0 z-10"
        onClick={handleTap}
      />

      {/* skeleton while loading */}
      {!loaded && !errored && (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}

      {errored && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="text-white/80 mb-3">Error al cargar el vídeo</div>
            <button
              className="px-4 py-2 bg-white text-black rounded-full text-sm font-semibold"
              onClick={(e) => { e.stopPropagation(); setErrored(false); const v = videoRef.current; if (v) v.load() }}
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* paused indicator */}
      {paused && loaded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Play size={42} className="text-white" fill="white" />
          </div>
        </div>
      )}

      {/* floating hearts on double tap */}
      {floatingHearts.map((h) => (
        <Heart
          key={h.id}
          size={120}
          fill="#ff2d55"
          color="#ff2d55"
          className="absolute z-30 like-pop pointer-events-none"
          style={{ left: h.x, top: h.y, transform: 'translate(-50%, -50%)' }}
        />
      ))}

      {/* right action buttons */}
      <div className="absolute right-2 bottom-28 z-20 flex flex-col items-center gap-5">
        <div className="relative">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white bg-gradient-to-br from-pink-500 to-cyan-400 p-[2px]">
            <img src={post.author.avatarUrl} alt={post.author.username} className="w-full h-full rounded-full object-cover" draggable={false} />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white text-sm font-bold leading-none">+</div>
        </div>

        <button
          aria-label="like"
          onClick={(e) => { e.stopPropagation(); toggleLike() }}
          className="flex flex-col items-center gap-0.5"
        >
          <Heart
            size={36}
            className={liked ? 'heart-bump' : ''}
            fill={liked ? '#ff2d55' : 'none'}
            color={liked ? '#ff2d55' : 'white'}
            strokeWidth={1.7}
          />
          <span className="text-xs font-semibold drop-shadow">{formatCount(likes)}</span>
        </button>

        <button aria-label="comments" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
          <MessageCircle size={36} fill="white" color="white" strokeWidth={0} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(post.stats.comments)}</span>
        </button>

        <button aria-label="bookmark" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
          <Bookmark size={34} fill="white" color="white" strokeWidth={0} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(post.stats.saves)}</span>
        </button>

        <button aria-label="share" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
          <Share2 size={34} color="white" strokeWidth={2} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(post.stats.shares)}</span>
        </button>

        {/* rotating disc */}
        <div className="mt-2 w-10 h-10 rounded-full bg-gradient-to-br from-zinc-700 to-black border border-white/30 flex items-center justify-center animate-spin-slow" style={{ animation: 'spin 6s linear infinite' }}>
          <Music size={16} />
        </div>
      </div>

      {/* bottom info */}
      <div className="absolute left-0 right-16 bottom-20 z-20 px-3 pb-1">
        <div className="font-bold text-[15px] mb-1">@{post.author.username}</div>
        <div className="text-[13px] leading-snug max-h-10 overflow-hidden desc-fade">{description}</div>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-white/90">
          <Music size={14} />
          <span className="truncate max-w-[200px]">{post.music}</span>
          {/* audio wave */}
          <div className="flex items-end gap-[2px] h-3 ml-1">
            <span className="bar bar-1 w-[2px] h-full bg-white inline-block" />
            <span className="bar bar-2 w-[2px] h-full bg-white inline-block" />
            <span className="bar bar-3 w-[2px] h-full bg-white inline-block" />
            <span className="bar bar-1 w-[2px] h-full bg-white inline-block" />
          </div>
        </div>
      </div>

      {/* progress bar */}
      <div className="absolute left-0 right-0 bottom-16 z-20 h-[2px] bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
      </div>
    </div>
  )
}

export default memo(VideoSlide)
