'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Bookmark, Play, Plus, CheckCircle, Volume2, VolumeX, Swords } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import { getVideoPool } from '@/lib/videoPool'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'
import VSWinnerCard from './VSWinnerCard'
import VSContentCard from './VSContentCard'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

// Si el contador es 0, mostramos un mensaje (estilo TikTokScrollView) en vez de "0".
function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

/**
 * DuetSlide — 1vs1 (dueto) slide.
 * Renders two videos side-by-side (horizontal = top/bottom, vertical = left/right),
 * both synced for play/pause. The user votes by tapping directly on a video side:
 *   - single tap  -> vota por ese lado (y ese lado pasa a tener el audio). Si ya
 *                    votaste, el tap simple alterna play/pause.
 *   - double tap  -> like (corazón flotante).
 * La UI (cabecera superior + columna social derecha) es idéntica a la del vídeo normal.
 */
function DuetSlide({ post, isActive, isNear, muted: globalMuted, onRequestNext, onChallenge }) {
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
  const [saved, setSaved] = useState(false)
  const [following, setFollowing] = useState(false)
  const [voteBursts, setVoteBursts] = useState([])

  // Live votes + user vote tracking
  const [votes, setVotes] = useState({
    a: post.votes?.a || 0,
    b: post.votes?.b || 0,
  })
  const [userVote, setUserVote] = useState(null) // 'a' | 'b' | null
  const [voting, setVoting] = useState(false)

  // Overlays: winner card (tras votar) + content card (long-press)
  const [showWinner, setShowWinner] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [contentIdx, setContentIdx] = useState(0)

  // Long-press para abrir la content card
  const lpTimerRef = useRef(null)
  const lpFiredRef = useRef(false)
  const lpStartRef = useRef({ x: 0, y: 0 })
  const cancelLongPress = useCallback(() => {
    if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null }
  }, [])
  const startLongPress = useCallback((idx) => (e) => {
    lpFiredRef.current = false
    lpStartRef.current = { x: e.clientX, y: e.clientY }
    cancelLongPress()
    lpTimerRef.current = setTimeout(() => {
      lpFiredRef.current = true
      setContentIdx(idx)
      setShowContent(true)
    }, 450)
  }, [cancelLongPress])
  const moveLongPress = useCallback((e) => {
    const s = lpStartRef.current
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) cancelLongPress()
  }, [cancelLongPress])

  // Read prior vote from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const v = localStorage.getItem(`duet_vote_${post.id}`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === 'a' || v === 'b') setUserVote(v)
    } catch { /* ignore */ }
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

  // Author principal mostrado en la cabecera (igual que en publicaciones normales)
  const headAuthor = sideA.author || post.author || {}

  // Acquire / release both video players from the pool.
  useEffect(() => {
    if (!isNear) return
    const pool = getVideoPool()
    if (!pool) return
    const slideIdA = `${post.id}__a`
    const slideIdB = `${post.id}__b`
    const pa = pool.acquire(slideIdA, sideA.videoUrl, sideA.posterUrl)
    const pb = pool.acquire(slideIdB, sideB.videoUrl, sideB.posterUrl)
    playerARef.current = pa
    playerBRef.current = pb
    const va = pa.video
    const vb = pb.video

    // Mount A & B into their respective slots
    try {
      if (va.parentNode !== mountARef.current && mountARef.current) mountARef.current.appendChild(va)
      if (vb.parentNode !== mountBRef.current && mountBRef.current) mountBRef.current.appendChild(vb)
    } catch (e) { /* ignore */ }

    // Sync mute state: A unmuted only if global not muted AND audibleSide === 'a'
    va.muted = globalMuted || audibleSide !== 'a'
    vb.muted = globalMuted || audibleSide !== 'b'

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      } catch (e) { /* ignore */ }
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
    } catch (e) { /* ignore */ }
    va.muted = globalMuted || audibleSide !== 'a'
    vb.muted = globalMuted || audibleSide !== 'b'
    if (isActive) {
      const tryPlay = async () => {
        // Play in parallel — if unmuted side fails autoplay, fallback to muted.
        const playSafe = async (v) => {
          try { await v.play() } catch {
            try { v.muted = true; await v.play() } catch { /* ignore */ }
          }
        }
        await Promise.all([playSafe(va), playSafe(vb)])
      }
      tryPlay()
    } else {
      try { va.pause() } catch { /* ignore */ }
      try { vb.pause() } catch { /* ignore */ }
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

  // Pausar los vídeos de fondo mientras hay un overlay (winner / content) abierto.
  useEffect(() => {
    const pa = playerARef.current
    const pb = playerBRef.current
    if (!pa || !pb) return
    const va = pa.video
    const vb = pb.video
    if (showWinner || showContent) {
      try { va.pause() } catch { /* ignore */ }
      try { vb.pause() } catch { /* ignore */ }
    } else if (isActive && isNear) {
      va.play().catch(() => {})
      vb.play().catch(() => {})
    }
  }, [showWinner, showContent, isActive, isNear])

  const doLike = useCallback(() => {
    // Like eliminado: el doble toque ahora vota (ver handleTapSide).
  }, [])

  const submitVote = useCallback(async (side) => {
    if (userVote || voting) return
    setVoting(true)
    // Optimistic update
    setUserVote(side)
    setAudibleSide(side)
    setVotes((v) => ({ ...v, [side]: (v[side] || 0) + 1 }))
    // Burst del icono de voto sobre el vídeo (color del lado: A lila / B azul)
    const burstColor = side === 'a' ? '#A855F7' : '#3B82F6'
    const burstId = Math.random().toString(36).slice(2)
    setVoteBursts((b) => [...b, { id: burstId, color: burstColor }])
    setTimeout(() => setVoteBursts((b) => b.filter((x) => x.id !== burstId)), 850)
    // Mostrar la tarjeta de ganador después de la animación del icono
    setTimeout(() => setShowWinner(true), 650)
    try { localStorage.setItem(`duet_vote_${post.id}`, side) } catch { /* ignore */ }
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
    } catch { /* ignore */ } finally {
      setVoting(false)
    }
  }, [post.id, userVote, voting])

  // Tap handler per side:
  //   double-tap  -> like
  //   single-tap  -> si aún no has votado, vota por ese lado; si ya votaste, play/pause
  const handleTapSide = useCallback((side) => (e) => {
    if (lpFiredRef.current) { lpFiredRef.current = false; return }
    const now = Date.now()
    const isDouble = lastTapRef.current.side === side && (now - lastTapRef.current.t) < 320
    lastTapRef.current = { side, t: now }
    if (isDouble) {
      clearTimeout(tapTimerRef.current)
      if (!userVote) submitVote(side)
      return
    }
    tapTimerRef.current = setTimeout(() => {
      // toque simple = play/pausa
      const pa = playerARef.current; const pb = playerBRef.current
      if (!pa || !pb) return
      if (pa.video.paused || pb.video.paused) {
        pa.video.play().catch(() => {})
        pb.video.play().catch(() => {})
      } else {
        pa.video.pause()
        pb.video.pause()
      }
    }, 280)
  }, [userVote, submitVote])

  const totalVotes = (votes.a || 0) + (votes.b || 0)
  const pctA = totalVotes > 0 ? Math.round(((votes.a || 0) / totalVotes) * 100) : 50
  const pctB = 100 - pctA

  // Determinar ganador (para la winner card)
  const winnerKey = (votes.a || 0) >= (votes.b || 0) ? 'a' : 'b'
  const winnerSide = winnerKey === 'a' ? sideA : sideB
  const loserSide = winnerKey === 'a' ? sideB : sideA
  const winnerPct = winnerKey === 'a' ? pctA : pctB
  const loserPct = 100 - winnerPct
  const winnerName = winnerSide.author?.name || (winnerSide.author?.username ? `@${winnerSide.author.username}` : '')
  const loserName = loserSide.author?.name || (loserSide.author?.username ? `@${loserSide.author.username}` : '')
  // Vídeo a mostrar en la winner card = la opción que ELIGIÓ el usuario (su voto).
  const chosenSide = userVote === 'b' ? sideB : sideA

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
        <div className={cn(halfClass, userVote === 'a' && 'ring-2 ring-rose-500 ring-inset')}>
          <div ref={mountARef} className="absolute inset-0" />
          {/* tap layer A */}
          <div
            className="absolute inset-0 z-10"
            onClick={handleTapSide('a')}
            onPointerDown={startLongPress(0)}
            onPointerMove={moveLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
          />
          {!loadedA && (
            <div className="absolute inset-0 skeleton-shimmer" />
          )}
          {/* Side A badge */}
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-black/55 backdrop-blur px-2 py-1 rounded-full">
            <span className={`w-2 h-2 rounded-full ${audibleSide === 'a' ? 'bg-rose-500' : 'bg-white/40'}`} />
            <span className="text-[11px] font-bold text-white">A · @{sideA.author?.username || 'tu_canal'}</span>
            {userVote
              ? <span className="text-[11px] font-bold text-rose-400">{pctA}%</span>
              : (audibleSide === 'a' ? <Volume2 size={12} className="text-white" /> : <VolumeX size={12} className="text-white" />)}
          </div>
        </div>

        <div className={cn(halfClass, userVote === 'b' && 'ring-2 ring-cyan-400 ring-inset')}>
          <div ref={mountBRef} className="absolute inset-0" />
          <div
            className="absolute inset-0 z-10"
            onClick={handleTapSide('b')}
            onPointerDown={startLongPress(1)}
            onPointerMove={moveLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
          />
          {!loadedB && (
            <div className="absolute inset-0 skeleton-shimmer" />
          )}
          {/* Side B badge */}
          <div className={`absolute z-20 flex items-center gap-1.5 bg-black/55 backdrop-blur px-2 py-1 rounded-full ${isHorizontal ? 'top-2 left-2' : 'top-2 right-2'}`}>
            <span className={`w-2 h-2 rounded-full ${audibleSide === 'b' ? 'bg-rose-500' : 'bg-white/40'}`} />
            <span className="text-[11px] font-bold text-white">B · @{sideB.author?.username || 'rival'}</span>
            {userVote
              ? <span className="text-[11px] font-bold text-cyan-300">{pctB}%</span>
              : (audibleSide === 'b' ? <Volume2 size={12} className="text-white" /> : <VolumeX size={12} className="text-white" />)}
          </div>
        </div>

        <div className={dividerClass} />
        {/* Pista de votación (centro) */}
        {!userVote && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center gap-2">
            <div className="bg-black/55 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
              Doble toque para votar
            </div>
          </div>
        )}
      </div>

      {/* play overlay */}
      {paused && (loadedA || loadedB) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Play size={42} className="text-white" fill="white" />
          </div>
        </div>
      )}

      {/* burst del icono de voto al votar (sobre el vídeo) */}
      {voteBursts.map((vb) => (
        <div key={vb.id} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <span className="like-pop" style={{ color: vb.color, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))' }}>
            <VoteIcon className="w-32 h-32" strokeWidth={320} filled />
          </span>
        </div>
      ))}

      {/* Top header — avatar + nombre (estilo Twyk, igual que el vídeo normal) */}
      <div
        className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pointer-events-none"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 w-fit pointer-events-auto">
          {/* Avatar + botón seguir */}
          <div className="group relative">
            <button onClick={(e) => e.stopPropagation()} className="w-12 h-12 rounded-full relative block">
              <div className="absolute rounded-full overflow-hidden" style={{ inset: '3.5px' }}>
                <img src={headAuthor.avatarUrl} alt={headAuthor.username} className="w-full h-full object-cover" draggable={false} />
              </div>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setFollowing((f) => !f) }}
              aria-label="seguir"
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full p-[3px] shadow-lg transition-all duration-200 hover:scale-125 active:scale-95"
              style={following ? { background: '#fff' } : { background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}
            >
              {following
                ? <CheckCircle className="w-4 h-4 text-indigo-500" />
                : <Plus className="w-4 h-4 text-white stroke-[3]" />}
            </button>
          </div>
          {/* Nombre + usuario */}
          <div className="drop-shadow-md">
            <h3 className="text-white font-semibold text-[15px] leading-tight">{headAuthor.name}</h3>
          </div>
        </div>
        {/* Título / descripción */}
        <div className="mt-1 pointer-events-auto">
          <h2 className="text-white text-sm leading-tight line-clamp-2">{post.description}</h2>
        </div>
      </div>

      {/* Columna social derecha — estilo Twyk (abajo) */}
      <div
        className="absolute z-20 right-2 bottom-20 flex flex-col items-center gap-5 pointer-events-auto"
      >
        {/* Votos */}
        <button aria-label="votos" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <span style={{ color: userVote === 'a' ? '#A855F7' : userVote === 'b' ? '#3B82F6' : '#fff', display: 'inline-flex', transition: 'color 200ms' }}>
            <VoteIcon className="w-[36px] h-[36px]" strokeWidth={180} filled={!!userVote} />
          </span>
          <span className="text-[10px] font-semibold text-white leading-none">
            {countLabel(totalVotes, 'Votar')}
          </span>
        </button>
        {/* Like */}
        <button aria-label="retar" onClick={(e) => { e.stopPropagation(); onChallenge?.({ videoUrl: sideA.videoUrl, author: headAuthor, description: sideA.description || post.description, music: sideA.music }) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Swords className="w-[25px] h-[25px] text-white" strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">Retar</span>
        </button>
        {/* Comentar */}
        <button aria-label="comments" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MessageCircle className="w-[25px] h-[25px] text-white" strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.comments, 'Comentar')}</span>
        </button>
        {/* Compartir */}
        <button aria-label="share" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <ShareIcon className="w-[25px] h-[25px] text-white" strokeWidth={1.6} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.shares, 'Compartir')}</span>
        </button>
        {/* Guardar */}
        <button aria-label="bookmark" onClick={(e) => { e.stopPropagation(); setSaved((s) => !s) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[25px] h-[25px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.saves, 'Guardar')}</span>
        </button>
        {/* Disco de música giratorio */}
        <div className="mt-1 w-10 h-10 rounded-full overflow-hidden border border-white/30 bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center" style={{ animation: 'spin 6s linear infinite' }}>
          <img src={headAuthor.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" draggable={false} />
        </div>
      </div>

      {/* progress bar */}
      <div className="absolute left-0 right-0 bottom-16 z-20 h-[2px] bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
      </div>

      {/* Winner card — aparece automáticamente tras votar */}
      <VSWinnerCard
        visible={showWinner}
        winnerSide={winnerKey}
        winnerName={winnerName}
        winnerPercentage={winnerPct}
        winnerImage={chosenSide.author?.avatarUrl}
        winnerVideoUrl={chosenSide.videoUrl}
        loserName={loserName}
        loserPercentage={loserPct}
        totalVotes={totalVotes}
        onClose={() => setShowWinner(false)}
        onNext={() => { setShowWinner(false); onRequestNext?.() }}
      />

      {/* Content card — solo 1vs1, se abre manteniendo pulsada una opción */}
      <VSContentCard
        visible={showContent}
        optionA={sideA}
        optionB={sideB}
        initialIndex={contentIdx}
        onClose={() => setShowContent(false)}
      />
    </div>
  )
}

export default memo(DuetSlide)
