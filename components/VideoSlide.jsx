'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Heart, MessageCircle, Bookmark, Share2, Play, Plus, CheckCircle } from 'lucide-react'
import { getVideoPool } from '@/lib/videoPool'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

// Si el contador es 0, mostramos un mensaje (estilo TikTokScrollView) en vez de "0".
function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

function VideoSlide({ post, isActive, isNear, muted }) {
  const mountRef = useRef(null)
  const overlayRef = useRef(null)
  const playerRef = useRef(null)
  const lastTapRef = useRef(0)
  const tapTimerRef = useRef(null)
  const rafRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const [progress, setProgress] = useState(0)
  const [likes, setLikes] = useState(post.stats.likes)
  const [liked, setLiked] = useState(false)
  const [saved, setSaved] = useState(false)
  const [following, setFollowing] = useState(false)
  const [floatingHearts, setFloatingHearts] = useState([])

  // Acquire / release video player from the pool whenever this slide is near.
  useEffect(() => {
    if (!isNear) return
    const pool = getVideoPool()
    if (!pool) return
    const player = pool.acquire(post.id, post.videoUrl)
    playerRef.current = player
    const v = player.video
    // mount into our slot (this auto-detaches from any previous parent)
    try {
      if (v.parentNode !== mountRef.current && mountRef.current) {
        mountRef.current.appendChild(v)
      }
    } catch (e) {}
    v.muted = muted

    // CRITICAL: sync React state with the actual video element state, otherwise
    // a re-acquired player can leave the UI showing stale "paused/loaded/errored" flags.
    setLoaded(v.readyState >= 3)
    setPaused(v.paused)
    setErrored(false)

    const onCanPlay = () => { setLoaded(true); setErrored(false) }
    const onLoadedData = () => { setLoaded(true); setErrored(false) }
    const onLoadStart = () => { setLoaded(false) }
    const onWaiting = () => { setLoaded(false) }
    const onError = () => {
      if (v.networkState === 3 /* NO_SOURCE */ && v.readyState === 0) {
        setErrored(true)
      }
    }
    const onPlay = () => setPaused(false)
    const onPause = () => setPaused(true)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('loadeddata', onLoadedData)
    v.addEventListener('loadstart', onLoadStart)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('error', onError, true)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)

    return () => {
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('loadeddata', onLoadedData)
      v.removeEventListener('loadstart', onLoadStart)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('error', onError, true)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      try {
        // Only detach if WE still own the element (it may have been moved by another slide).
        if (mountRef.current && mountRef.current.contains(v)) {
          mountRef.current.removeChild(v)
        }
      } catch (e) {}
      pool.release(post.id)
      playerRef.current = null
    }
  }, [isNear, post.id, post.videoUrl])

  // Play / pause based on isActive. Also re-runs when this slide (re)acquires a player,
  // so a returning slide always either resumes playback or pauses cleanly.
  useEffect(() => {
    if (!isNear) return
    const p = playerRef.current
    if (!p) return
    const v = p.video
    v.muted = muted
    // Ensure the element is actually mounted in our slot (it may have been moved away
    // by a sibling slide stealing the player from the pool LRU).
    try {
      if (v.parentNode !== mountRef.current && mountRef.current) {
        mountRef.current.appendChild(v)
      }
    } catch (e) {}
    if (isActive) {
      const tryPlay = async () => {
        try { await v.play() } catch {
          try { v.muted = true; await v.play() } catch {}
        }
      }
      tryPlay()
    } else {
      try { v.pause() } catch {}
    }
  }, [isActive, muted, isNear, post.id, post.videoUrl])

  // progress bar via rAF
  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      const p = playerRef.current
      if (p) {
        const v = p.video
        if (v.duration > 0) setProgress((v.currentTime / v.duration) * 100)
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
      const rect = overlayRef.current?.getBoundingClientRect()
      const x = rect ? evt.clientX - rect.left : 100
      const y = rect ? evt.clientY - rect.top : 200
      const id = Math.random().toString(36).slice(2)
      setFloatingHearts((h) => [...h, { id, x, y }])
      setTimeout(() => setFloatingHearts((h) => h.filter((p) => p.id !== id)), 850)
    }
  }, [liked])

  const toggleLike = useCallback(() => {
    setLiked((prev) => { setLikes((n) => n + (prev ? -1 : 1)); return !prev })
  }, [])

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
      const p = playerRef.current
      if (!p) return
      const v = p.video
      if (v.paused) v.play().catch(() => {}); else v.pause()
    }, 260)
  }, [doLike])

  return (
    <div ref={overlayRef} className="relative w-full h-full bg-black overflow-hidden select-none">
      {/* Pool mounts the <video> element here */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* tap layer */}
      <div className="absolute inset-0 z-10" onClick={handleTap} />

      {/* skeleton */}
      {!loaded && !errored && (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}

      {errored && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
          <div className="text-center">
            <div className="text-white/80 mb-3">Error al cargar el vídeo</div>
            <button
              className="px-4 py-2 bg-white text-black rounded-full text-sm font-semibold"
              onClick={(e) => { e.stopPropagation(); setErrored(false); const p = playerRef.current; if (p) { p.video.load() } }}
            >Reintentar</button>
          </div>
        </div>
      )}

      {paused && loaded && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Play size={42} className="text-white" fill="white" />
          </div>
        </div>
      )}

      {floatingHearts.map((h) => (
        <Heart key={h.id} size={120} fill="#ff2d55" color="#ff2d55"
          className="absolute z-30 like-pop pointer-events-none"
          style={{ left: h.x, top: h.y, transform: 'translate(-50%, -50%)' }}
        />
      ))}

      {/* Top header — avatar + nombre (estilo Twyk) */}
      <div
        className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pointer-events-none"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 w-fit pointer-events-auto">
          {/* Avatar + botón seguir (sin anillo de historia) */}
          <div className="group relative">
            <button onClick={(e) => e.stopPropagation()} className="w-12 h-12 rounded-full overflow-hidden block">
              <img src={post.author.avatarUrl} alt={post.author.username} className="w-full h-full object-cover" draggable={false} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setFollowing((f) => !f) }}
              aria-label="seguir"
              className="absolute bottom-0 right-0 rounded-full p-[3px] shadow-lg transition-all duration-200 hover:scale-125 active:scale-95"
              style={following ? { background: '#fff' } : { background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              {following
                ? <CheckCircle className="w-3.5 h-3.5 text-indigo-500" />
                : <Plus className="w-3.5 h-3.5 text-white stroke-[3]" />}
            </button>
          </div>
          {/* Nombre + usuario */}
          <div className="drop-shadow-md">
            <h3 className="text-white font-semibold text-base leading-tight">{post.author.name}</h3>
            <p className="text-sm text-white/70 leading-tight">@{post.author.username}</p>
          </div>
        </div>
        {/* Título / descripción */}
        <div className="mt-1 pointer-events-auto">
          <h2 className="text-white text-sm leading-tight line-clamp-2">{post.description}</h2>
        </div>
      </div>

      {/* Columna social derecha — estilo Twyk (centrada vertical) */}
      <div
        className="absolute z-20 right-2 flex flex-col items-center gap-5 pointer-events-auto"
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      >
        {/* Votos */}
        <button aria-label="votos" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <VoteIcon className="w-[40px] h-[40px] text-white" filled={false} />
          <span className="text-[8px] font-medium text-white leading-none">
            {countLabel(post.stats.votes, 'Votar')}
          </span>
        </button>
        {/* Like */}
        <button aria-label="like" onClick={(e) => { e.stopPropagation(); toggleLike() }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Heart className={cn('w-[23px] h-[23px] transition-all duration-200', liked ? 'fill-current text-red-500 scale-110' : 'text-white')} />
          <span className="text-[8px] font-medium text-white leading-none">{countLabel(likes, 'Me gusta')}</span>
        </button>
        {/* Comentar */}
        <button aria-label="comments" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MessageCircle className="w-[23px] h-[23px] text-white" />
          <span className="text-[8px] font-medium text-white leading-none">{countLabel(post.stats.comments, 'Comentar')}</span>
        </button>
        {/* Compartir */}
        <button aria-label="share" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Share2 className="w-[23px] h-[23px] text-white" />
          <span className="text-[8px] font-medium text-white leading-none">{countLabel(post.stats.shares, 'Compartir')}</span>
        </button>
        {/* Guardar */}
        <button aria-label="bookmark" onClick={(e) => { e.stopPropagation(); setSaved((s) => !s) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[23px] h-[23px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} />
          <span className="text-[8px] font-medium text-white leading-none">{countLabel(post.stats.saves, 'Guardar')}</span>
        </button>
        {/* Disco de música giratorio */}
        <div className="mt-1 w-10 h-10 rounded-full overflow-hidden border border-white/30 bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center" style={{ animation: 'spin 6s linear infinite' }}>
          <img src={post.author.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" draggable={false} />
        </div>
      </div>

      <div className="absolute left-0 right-0 bottom-16 z-20 h-[2px] bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
      </div>
    </div>
  )
}

export default memo(VideoSlide)
