'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Heart, MessageCircle, Bookmark, Share2, Music, Play, Volume2, VolumeX } from 'lucide-react'
import { getVideoPool } from '@/lib/videoPool'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

/**
 * DuetSlide — 1vs1 (dueto) slide.
 * Renders two videos side-by-side (horizontal = top/bottom, vertical = left/right),
 * both synced for play/pause. Side A is audible by default; tapping a side
 * switches the audible side. Voting buttons increment server-side counters
 * and the bar shows live percentages. The user can vote once per duet (tracked in localStorage).
 */
function DuetSlide({ post, isActive, isNear, muted: globalMuted }) {
  const mountARef = useRef(null)
  const mountBRef = useRef(null)
  const playerARef = useRef(null)
  const playerBRef = useRef(null)
  const overlayRef = useRef(null)
  const lastTapRef = useRef({ side: null, t: 0 })
  const tapTimerRef = useRef(null)
  const rafRef = useRef(0)

  const [paused, setPaused] = useState(false)
  const [loadedA, setLoadedA] = useState(false)
  const [loadedB, setLoadedB] = useState(false)
  const [progress, setProgress] = useState(0)
  const [audibleSide, setAudibleSide] = useState('a') // 'a' | 'b'
  const [likes, setLikes] = useState(post.stats?.likes || 0)
  const [liked, setLiked] = useState(false)
  const [floatingHearts, setFloatingHearts] = useState([])

  // Live votes + user vote tracking
  const [votes, setVotes] = useState({
    a: post.votes?.a || 0,
    b: post.votes?.b || 0,
  })
  const [userVote, setUserVote] = useState(null) // 'a' | 'b' | null
  const [voting, setVoting] = useState(false)

  // Read prior vote from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const v = localStorage.getItem(`duet_vote_${post.id}`)
      if (v === 'a' || v === 'b') setUserVote(v)
    } catch {}
  }, [post.id])

  const isHorizontal = (post.layout || 'horizontal') === 'horizontal'

  const sideA = post.sideA || {
    videoUrl: post.videoUrl,
    author: post.author,
    description: post.description,
    music: post.music,
  }
  const sideB = post.sideB || {
    videoUrl: post.videoUrl,
    author: post.author,
    description: '',
    music: '',
  }

  // Acquire / release both video players from the pool.
  useEffect(() => {
    if (!isNear) return
    const pool = getVideoPool()
    if (!pool) return
    const slideIdA = `${post.id}__a`
    const slideIdB = `${post.id}__b`
    const pa = pool.acquire(slideIdA, sideA.videoUrl)
    const pb = pool.acquire(slideIdB, sideB.videoUrl)
    playerARef.current = pa
    playerBRef.current = pb
    const va = pa.video
    const vb = pb.video

    // Mount A & B into their respective slots
    try {
      if (va.parentNode !== mountARef.current && mountARef.current) mountARef.current.appendChild(va)
      if (vb.parentNode !== mountBRef.current && mountBRef.current) mountBRef.current.appendChild(vb)
    } catch (e) {}

    // Sync mute state: A unmuted only if global not muted AND audibleSide === 'a'
    va.muted = globalMuted || audibleSide !== 'a'
    vb.muted = globalMuted || audibleSide !== 'b'

    setLoadedA(va.readyState >= 3)
    setLoadedB(vb.readyState >= 3)
    setPaused(va.paused && vb.paused)

    const onCanPlayA = () => setLoadedA(true)
    const onCanPlayB = () => setLoadedB(true)
    const onWaitingA = () => setLoadedA(false)
    const onWaitingB = () => setLoadedB(false)
    const onPlayBoth = () => setPaused(false)
    const onPauseBoth = () => setPaused(va.paused && vb.paused)

    va.addEventListener('canplay', onCanPlayA)
    va.addEventListener('loadeddata', onCanPlayA)
    va.addEventListener('waiting', onWaitingA)
    va.addEventListener('play', onPlayBoth)
    va.addEventListener('pause', onPauseBoth)
    vb.addEventListener('canplay', onCanPlayB)
    vb.addEventListener('loadeddata', onCanPlayB)
    vb.addEventListener('waiting', onWaitingB)
    vb.addEventListener('play', onPlayBoth)
    vb.addEventListener('pause', onPauseBoth)

    return () => {
      va.removeEventListener('canplay', onCanPlayA)
      va.removeEventListener('loadeddata', onCanPlayA)
      va.removeEventListener('waiting', onWaitingA)
      va.removeEventListener('play', onPlayBoth)
      va.removeEventListener('pause', onPauseBoth)
      vb.removeEventListener('canplay', onCanPlayB)
      vb.removeEventListener('loadeddata', onCanPlayB)
      vb.removeEventListener('waiting', onWaitingB)
      vb.removeEventListener('play', onPlayBoth)
      vb.removeEventListener('pause', onPauseBoth)
      try {
        if (mountARef.current && mountARef.current.contains(va)) mountARef.current.removeChild(va)
        if (mountBRef.current && mountBRef.current.contains(vb)) mountBRef.current.removeChild(vb)
      } catch (e) {}
      pool.release(slideIdA)
      pool.release(slideIdB)
      playerARef.current = null
      playerBRef.current = null
    }
  }, [isNear, post.id, sideA.videoUrl, sideB.videoUrl])

  // Play / pause sync
  useEffect(() => {
    if (!isNear) return
    const pa = playerARef.current
    const pb = playerBRef.current
    if (!pa || !pb) return
    const va = pa.video
    const vb = pb.video
    // re-mount in case stolen
    try {
      if (va.parentNode !== mountARef.current && mountARef.current) mountARef.current.appendChild(va)
      if (vb.parentNode !== mountBRef.current && mountBRef.current) mountBRef.current.appendChild(vb)
    } catch (e) {}
    va.muted = globalMuted || audibleSide !== 'a'
    vb.muted = globalMuted || audibleSide !== 'b'
    if (isActive) {
      const tryPlay = async () => {
        // Play in parallel — if unmuted side fails autoplay, fallback to muted.
        const playSafe = async (v) => {
          try { await v.play() } catch {
            try { v.muted = true; await v.play() } catch {}
          }
        }
        await Promise.all([playSafe(va), playSafe(vb)])
      }
      tryPlay()
    } else {
      try { va.pause() } catch {}
      try { vb.pause() } catch {}
    }
  }, [isActive, isNear, globalMuted, audibleSide, post.id, sideA.videoUrl, sideB.videoUrl])

  // Progress bar follows whichever side is audible (or longest)
  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = () => {
      const pa = playerARef.current
      const pb = playerBRef.current
      if (pa && pb) {
        const va = pa.video
        const vb = pb.video
        const ref = audibleSide === 'b' ? vb : va
        if (ref.duration > 0) setProgress((ref.currentTime / ref.duration) * 100)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, audibleSide])

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

  // Tap handler per side: double-tap -> like; single-tap -> swap audible side
  const handleTapSide = useCallback((side) => (e) => {
    const now = Date.now()
    const isDouble = lastTapRef.current.side === side && (now - lastTapRef.current.t) < 320
    lastTapRef.current = { side, t: now }
    if (isDouble) {
      clearTimeout(tapTimerRef.current)
      doLike(true, e)
      return
    }
    tapTimerRef.current = setTimeout(() => {
      // Swap audible side, but if already this side just toggle pause/play
      if (audibleSide === side) {
        const pa = playerARef.current; const pb = playerBRef.current
        if (!pa || !pb) return
        if (pa.video.paused || pb.video.paused) {
          pa.video.play().catch(() => {})
          pb.video.play().catch(() => {})
        } else {
          pa.video.pause()
          pb.video.pause()
        }
      } else {
        setAudibleSide(side)
      }
    }, 280)
  }, [audibleSide, doLike])

  const submitVote = useCallback(async (side) => {
    if (userVote || voting) return
    setVoting(true)
    // Optimistic update
    setUserVote(side)
    setVotes((v) => ({ ...v, [side]: (v[side] || 0) + 1 }))
    try { localStorage.setItem(`duet_vote_${post.id}`, side) } catch {}
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, side }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.votes) setVotes(data.votes)
      }
    } catch {} finally {
      setVoting(false)
    }
  }, [post.id, userVote, voting])

  const totalVotes = (votes.a || 0) + (votes.b || 0)
  const pctA = totalVotes > 0 ? Math.round(((votes.a || 0) / totalVotes) * 100) : 50
  const pctB = 100 - pctA

  // Split styles
  const splitWrapperClass = isHorizontal
    ? 'absolute inset-0 flex flex-col'
    : 'absolute inset-0 flex flex-row'
  const halfClass = isHorizontal
    ? 'relative flex-1 w-full overflow-hidden'
    : 'relative flex-1 h-full overflow-hidden'
  const dividerClass = isHorizontal
    ? 'absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-white/30 z-10 pointer-events-none'
    : 'absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-white/30 z-10 pointer-events-none'

  return (
    <div ref={overlayRef} className="relative w-full h-full bg-black overflow-hidden select-none">
      {/* split videos */}
      <div className={splitWrapperClass}>
        <div className={halfClass}>
          <div ref={mountARef} className="absolute inset-0" />
          {/* tap layer A */}
          <div className="absolute inset-0 z-10" onClick={handleTapSide('a')} />
          {!loadedA && (
            <div className="absolute inset-0 skeleton-shimmer" />
          )}
          {/* Side A badge */}
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-black/55 backdrop-blur px-2 py-1 rounded-full">
            <span className={`w-2 h-2 rounded-full ${audibleSide === 'a' ? 'bg-rose-500' : 'bg-white/40'}`} />
            <span className="text-[11px] font-bold">A · @{sideA.author?.username || 'tu_canal'}</span>
            {audibleSide === 'a' ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </div>
        </div>

        <div className={halfClass}>
          <div ref={mountBRef} className="absolute inset-0" />
          <div className="absolute inset-0 z-10" onClick={handleTapSide('b')} />
          {!loadedB && (
            <div className="absolute inset-0 skeleton-shimmer" />
          )}
          {/* Side B badge */}
          <div className={`absolute z-20 flex items-center gap-1.5 bg-black/55 backdrop-blur px-2 py-1 rounded-full ${isHorizontal ? 'top-2 left-2' : 'top-2 right-2'}`}>
            <span className={`w-2 h-2 rounded-full ${audibleSide === 'b' ? 'bg-rose-500' : 'bg-white/40'}`} />
            <span className="text-[11px] font-bold">B · @{sideB.author?.username || 'rival'}</span>
            {audibleSide === 'b' ? <Volume2 size={12} /> : <VolumeX size={12} />}
          </div>
        </div>

        <div className={dividerClass} />
        {/* VS badge */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="vs-badge">VS</div>
        </div>
      </div>

      {/* play overlay */}
      {paused && (loadedA || loadedB) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Play size={42} className="text-white" fill="white" />
          </div>
        </div>
      )}

      {/* floating hearts (double-tap) */}
      {floatingHearts.map((h) => (
        <Heart key={h.id} size={120} fill="#ff2d55" color="#ff2d55"
          className="absolute z-30 like-pop pointer-events-none"
          style={{ left: h.x, top: h.y, transform: 'translate(-50%, -50%)' }}
        />
      ))}

      {/* right action panel */}
      <div className="absolute right-2 bottom-44 z-30 flex flex-col items-center gap-5">
        <div className="relative">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white bg-gradient-to-br from-pink-500 to-cyan-400 p-[2px]">
            <img src={sideA.author?.avatarUrl} alt={sideA.author?.username} className="w-full h-full rounded-full object-cover" draggable={false} />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white text-sm font-bold leading-none">+</div>
        </div>

        <button aria-label="like" onClick={(e) => { e.stopPropagation(); toggleLike() }} className="flex flex-col items-center gap-0.5">
          <Heart size={36} className={liked ? 'heart-bump' : ''} fill={liked ? '#ff2d55' : 'none'} color={liked ? '#ff2d55' : 'white'} strokeWidth={1.7} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(likes)}</span>
        </button>
        <button aria-label="comments" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
          <MessageCircle size={36} fill="white" color="white" strokeWidth={0} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(post.stats?.comments || 0)}</span>
        </button>
        <button aria-label="bookmark" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
          <Bookmark size={34} fill="white" color="white" strokeWidth={0} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(post.stats?.saves || 0)}</span>
        </button>
        <button aria-label="share" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
          <Share2 size={34} color="white" strokeWidth={2} />
          <span className="text-xs font-semibold drop-shadow">{formatCount(post.stats?.shares || 0)}</span>
        </button>
      </div>

      {/* Voting panel */}
      <div className="absolute left-2 right-16 bottom-28 z-30">
        {userVote ? (
          <div className="bg-black/50 backdrop-blur rounded-xl px-3 py-2">
            <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
              <span className={userVote === 'a' ? 'text-rose-400' : 'text-white/80'}>A · {pctA}%</span>
              <span className="text-white/60">{totalVotes} votos</span>
              <span className={userVote === 'b' ? 'text-cyan-400' : 'text-white/80'}>B · {pctB}%</span>
            </div>
            <div className="h-2 w-full rounded-full overflow-hidden bg-white/10 flex">
              <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${pctA}%` }} />
              <div className="h-full bg-cyan-400 transition-all duration-500" style={{ width: `${pctB}%` }} />
            </div>
            <div className="text-[10px] text-white/60 mt-1">
              Votaste por {userVote === 'a' ? 'A' : 'B'}
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); submitVote('a') }}
              className="flex-1 bg-rose-500 hover:bg-rose-600 active:scale-95 transition rounded-full py-2 text-sm font-bold shadow-lg"
            >
              👍 Voto A
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); submitVote('b') }}
              className="flex-1 bg-cyan-400 hover:bg-cyan-500 text-black active:scale-95 transition rounded-full py-2 text-sm font-bold shadow-lg"
            >
              Voto B 👍
            </button>
          </div>
        )}
      </div>

      {/* Author + description */}
      <div className="absolute left-0 right-16 bottom-16 z-30 px-3">
        <div className="font-bold text-[14px] mb-0.5">
          @{sideA.author?.username} <span className="text-white/60">vs</span> @{sideB.author?.username}
        </div>
        <div className="text-[12px] leading-snug max-h-8 overflow-hidden desc-fade">{post.description}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/90">
          <Music size={12} />
          <span className="truncate max-w-[200px]">{audibleSide === 'a' ? sideA.music : sideB.music}</span>
        </div>
      </div>

      {/* progress bar */}
      <div className="absolute left-0 right-0 bottom-14 z-30 h-[2px] bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
      </div>
    </div>
  )
}

export default memo(DuetSlide)
