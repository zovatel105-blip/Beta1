'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Bookmark, Play, Swords, MoreVertical, Flag, EyeOff, Link2 } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'
import VSWinnerCard from './VSWinnerCard'
import VSContentCard from './VSContentCard'
import { pickQuality, reportStall } from '@/lib/networkQuality'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

// Si el contador es 0, mostramos un mensaje (estilo TikTokScrollView) en vez de "0".
function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

const webmFor = (url) => (typeof url === 'string' ? url.replace(/\.mp4$/, '.webm') : '')
// Solo los vídeos integrados (/videos/) tienen .webm garantizado.
const hasWebm = (url) => typeof url === 'string' && url.startsWith('/videos/')

/**
 * DuetSlide — 1vs1 (dueto) slide.
 * Renders two videos side-by-side (horizontal = top/bottom, vertical = left/right),
 * both synced for play/pause. The user votes by tapping directly on a video side:
 *   - single tap  -> vota por ese lado (y ese lado pasa a tener el audio). Si ya
 *                    votaste, el tap simple alterna play/pause.
 *   - double tap  -> like (corazón flotante).
 * La UI (cabecera superior + columna social derecha) es idéntica a la del vídeo normal.
 */
function DuetSlide({ post, isActive, isNear, isAdjacent, muted: globalMuted, onRequestNext, onChallenge, infoBottom = false }) {
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [challengePickOpen, setChallengePickOpen] = useState(false)
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
  // Reto 1vs1: cabecera con los DOS creadores (avatar + nombre de cada lado)
  const authorA = sideA.author || post.author || {}
  const authorB = sideB.author || post.author || {}

  // FASE 2: calidad adaptativa a la red (fallback al videoUrl si no hay renditions).
  const srcA = useMemo(() => pickQuality(sideA.qualities, sideA.videoUrl), [sideA.qualities, sideA.videoUrl])
  const srcB = useMemo(() => pickQuality(sideB.qualities, sideB.videoUrl), [sideB.qualities, sideB.videoUrl])

  // Mantener sincronizados mute + play/pausa de los DOS vídeos planos.
  // Mismo enfoque que las publicaciones versus (<video> directos, sin pool),
  // para que AMBOS lados arranquen a la vez y con fluidez. También respeta los
  // overlays (winner / content): si hay uno abierto, se pausan los dos.
  useEffect(() => {
    if (!isNear) return
    const va = videoARef.current
    const vb = videoBRef.current
    if (!va || !vb) return
    // A suena solo si el audio global está activo Y el lado audible es A.
    va.muted = globalMuted || audibleSide !== 'a'
    vb.muted = globalMuted || audibleSide !== 'b'
    if (isActive && !showWinner && !showContent) {
      const playSafe = async (v) => {
        try { await v.play() } catch {
          try { v.muted = true; await v.play() } catch { /* ignore */ }
        }
      }
      playSafe(va)
      playSafe(vb)
    } else {
      try { va.pause() } catch { /* ignore */ }
      try { vb.pause() } catch { /* ignore */ }
    }
  }, [isActive, isNear, globalMuted, audibleSide, showWinner, showContent])

  // Sincroniza el estado "paused" (overlay de play) mirando ambos vídeos.
  const syncPaused = useCallback(() => {
    const va = videoARef.current
    const vb = videoBRef.current
    if (!va || !vb) return
    setPaused(va.paused && vb.paused)
  }, [])

  // Barra de progreso: sigue al lado con audio (A por defecto).
  useEffect(() => {
    if (!isActive) { cancelAnimationFrame(rafRef.current); return }
    const tick = () => {
      const ref = audibleSide === 'b' ? videoBRef.current : videoARef.current
      if (ref && ref.duration > 0) setProgress((ref.currentTime / ref.duration) * 100)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, audibleSide])

  // FASE 1 — Decoder priming: en los duetos adyacentes (±1) no activos calentamos
  // el decodificador de AMBOS vídeos con un play muteado que pausamos enseguida,
  // para que al activarse arranquen los dos al instante. Nunca pausa si ya pasó a
  // activo (evita el bug de "un lado parado").
  const isActiveRef = useRef(isActive)
  useEffect(() => { isActiveRef.current = isActive }, [isActive])
  useEffect(() => {
    if (!isAdjacent || isActive) return
    let cancelled = false
    const prime = (v) => {
      if (!v || v.__primed) return
      const go = () => {
        if (cancelled || v.__primed) return
        v.__primed = true
        try {
          v.muted = true
          const pr = v.play()
          if (pr && pr.then) pr.then(() => { if (!isActiveRef.current) { try { v.pause() } catch { /* ignore */ } } }).catch(() => {})
          else if (!isActiveRef.current) { try { v.pause() } catch { /* ignore */ } }
        } catch { /* ignore */ }
      }
      if (v.readyState >= 2) go()
      else v.addEventListener('canplay', go, { once: true })
    }
    prime(videoARef.current)
    prime(videoBRef.current)
    return () => { cancelled = true }
  }, [isAdjacent, isActive])

  const doLike = useCallback(() => {
    // Like eliminado: el doble toque ahora vota (ver handleTapSide).
  }, [])

  const submitVote = useCallback(async (side, pt) => {
    if (userVote || voting) return
    setVoting(true)
    // Optimistic update
    setUserVote(side)
    setAudibleSide(side)
    setVotes((v) => ({ ...v, [side]: (v[side] || 0) + 1 }))
    // Burst del icono de voto: aparece justo DONDE tocaste (un poco por encima),
    // con el color del lado (A lila / B azul). Si no hay punto, cae sobre el lado.
    const burstColor = side === 'a' ? '#A855F7' : '#3B82F6'
    const burstId = Math.random().toString(36).slice(2)
    setVoteBursts((b) => [...b, { id: burstId, color: burstColor, side, x: pt?.x, y: pt?.y }])
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
  //   doble toque -> vota por ese lado
  //   toque simple -> si el lado tocado NO tiene el audio, cambia el audio a ese
  //                   lado; si ya lo tiene, alterna play/pausa.
  const handleTapSide = useCallback((side) => (e) => {
    if (lpFiredRef.current) { lpFiredRef.current = false; return }
    const now = Date.now()
    const isDouble = lastTapRef.current.side === side && (now - lastTapRef.current.t) < 320
    lastTapRef.current = { side, t: now }
    if (isDouble) {
      clearTimeout(tapTimerRef.current)
      if (!userVote) {
        // Punto del toque relativo al contenedor -> la animación sale ahí.
        const rect = overlayRef.current?.getBoundingClientRect()
        const pt = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null
        submitVote(side, pt)
      }
      return
    }
    tapTimerRef.current = setTimeout(() => {
      const va = videoARef.current; const vb = videoBRef.current
      if (!va || !vb) return
      // Si el lado tocado no es el que suena -> pásale el audio.
      if (audibleSide !== side) {
        setAudibleSide(side)
        return
      }
      // Mismo lado audible -> alterna play/pausa.
      if (va.paused || vb.paused) {
        va.play().catch(() => {})
        vb.play().catch(() => {})
      } else {
        va.pause()
        vb.pause()
      }
    }, 280)
  }, [userVote, submitVote, audibleSide])

  const totalVotes = (votes.a || 0) + (votes.b || 0)
  const pctA = totalVotes > 0 ? Math.round(((votes.a || 0) / totalVotes) * 100) : 50
  const pctB = 100 - pctA

  // La tarjeta tras votar destaca SIEMPRE la opción que eligió el usuario (su
  // voto): vídeo, nombre, % y color. Antes el vídeo era tu voto pero el nombre/%
  // eran los de quien iba ganando -> votar B aparecía como A. La barra de
  // resultados sigue mostrando A% y B% reales por separado.
  const chosenKey = userVote === 'b' ? 'b' : 'a'
  const chosenSide = chosenKey === 'b' ? sideB : sideA
  const otherSide = chosenKey === 'b' ? sideA : sideB
  const chosenPct = chosenKey === 'b' ? pctB : pctA
  const otherPct = 100 - chosenPct
  const chosenName = chosenSide.author?.name || (chosenSide.author?.username ? `@${chosenSide.author.username}` : '')
  const otherName = otherSide.author?.name || (otherSide.author?.username ? `@${otherSide.author.username}` : '')
  const chosenSrc = chosenKey === 'b' ? srcB : srcA

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
        <div className={cn(halfClass, userVote === 'a' && 'ring-2 ring-purple-500 ring-inset')}>
          {/* Poster instantáneo (primer fotograma) */}
          {sideA.posterUrl && (
            <img src={sideA.posterUrl} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-cover" />
          )}
          {isNear && (
            <video
              ref={videoARef}
              className="absolute inset-0 w-full h-full object-cover bg-transparent"
              loop
              muted
              playsInline
              preload="auto"
              poster={sideA.posterUrl || undefined}
              onCanPlay={() => setLoadedA(true)}
              onLoadedData={() => setLoadedA(true)}
              onWaiting={() => { setLoadedA(false); reportStall() }}
              onPlay={() => setPaused(false)}
              onPause={syncPaused}
            >
              <source src={srcA} type="video/mp4" />
              {hasWebm(srcA) && <source src={webmFor(srcA)} type="video/webm" />}
            </video>
          )}
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
        </div>

        <div className={cn(halfClass, userVote === 'b' && 'ring-2 ring-blue-500 ring-inset')}>
          {/* Poster instantáneo (primer fotograma) */}
          {sideB.posterUrl && (
            <img src={sideB.posterUrl} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-cover" />
          )}
          {isNear && (
            <video
              ref={videoBRef}
              className="absolute inset-0 w-full h-full object-cover bg-transparent"
              loop
              muted
              playsInline
              preload="auto"
              poster={sideB.posterUrl || undefined}
              onCanPlay={() => setLoadedB(true)}
              onLoadedData={() => setLoadedB(true)}
              onWaiting={() => { setLoadedB(false); reportStall() }}
              onPlay={() => setPaused(false)}
              onPause={syncPaused}
            >
              <source src={srcB} type="video/mp4" />
              {hasWebm(srcB) && <source src={webmFor(srcB)} type="video/webm" />}
            </video>
          )}
          <div
            className="absolute inset-0 z-10"
            onClick={handleTapSide('b')}
            onPointerDown={startLongPress(1)}
            onPointerMove={moveLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
          />
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

      {/* burst del icono de voto al votar — aparece justo DONDE tocaste (un poco
          por encima del punto) y con su color (A lila / B azul). Si por algún
          motivo no hay coordenadas, cae sobre la mitad del lado votado. */}
      {voteBursts.map((vb) => {
        if (vb.x != null && vb.y != null) {
          return (
            <div
              key={vb.id}
              className="absolute z-30 pointer-events-none"
              style={{ left: vb.x, top: vb.y, transform: 'translate(-50%, -115%)' }}
            >
              <span className="like-pop" style={{ color: vb.color, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))' }}>
                <VoteIcon className="w-24 h-24" strokeWidth={320} filled />
              </span>
            </div>
          )
        }
        const half = isHorizontal
          ? (vb.side === 'b' ? 'left-0 right-0 bottom-0 h-1/2' : 'left-0 right-0 top-0 h-1/2')
          : (vb.side === 'b' ? 'right-0 top-0 bottom-0 w-1/2' : 'left-0 top-0 bottom-0 w-1/2')
        return (
          <div key={vb.id} className={`absolute ${half} z-30 flex items-center justify-center pointer-events-none`}>
            <span className="like-pop" style={{ color: vb.color, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))' }}>
              <VoteIcon className="w-24 h-24" strokeWidth={320} filled />
            </span>
          </div>
        )
      })}

      {/* Header — avatar + nombre (estilo Twyk). Arriba por defecto; abajo si infoBottom. */}
      <div
        className={cn(
          'absolute z-20 px-4 pointer-events-none',
          infoBottom
            ? 'left-0 right-16 bottom-20 bg-gradient-to-t from-black/70 to-transparent pt-10'
            : 'top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent pb-10'
        )}
        style={infoBottom ? undefined : { paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5 w-fit max-w-[calc(100%-4rem)] pointer-events-auto">
          {/* Reto 1vs1 (estilo colaboración): dos avatares solapados + "userA y userB" + Seguir */}
          <div className="relative w-[42px] h-[46px] shrink-0">
            <button onClick={(e) => e.stopPropagation()} className="absolute top-0 right-0 w-[28px] h-[28px] rounded-full overflow-hidden block ring-2 ring-black/50">
              <img src={authorB.avatarUrl} alt={authorB.username} className="w-full h-full object-cover" draggable={false} />
            </button>
            <button onClick={(e) => e.stopPropagation()} className="absolute bottom-0 left-0 w-[28px] h-[28px] rounded-full overflow-hidden block ring-2 ring-black/50">
              <img src={authorA.avatarUrl} alt={authorA.username} className="w-full h-full object-cover" draggable={false} />
            </button>
          </div>
          <span className="min-w-0 max-w-[150px] text-white font-semibold text-[14px] leading-tight drop-shadow-md line-clamp-2">
            {authorA.username || authorA.name} y {authorB.username || authorB.name}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setFollowing((f) => !f) }}
            aria-label="seguir"
            className={cn(
              'shrink-0 px-3 py-1 rounded-lg border text-[13px] font-medium transition-all duration-200 active:scale-95',
              following ? 'border-white/40 bg-white/15 text-white' : 'border-white/90 text-white'
            )}
          >
            {following ? 'Siguiendo' : 'Seguir'}
          </button>
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
        {/* Retar — abre un selector A/B para elegir explícitamente a qué opción retar. */}
        <button aria-label="retar" onClick={(e) => { e.stopPropagation(); setChallengePickOpen(true) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
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
          <ShareIcon className="w-[25px] h-[25px] text-white" strokeWidth={1.1} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.shares, 'Compartir')}</span>
        </button>
        {/* Guardar */}
        <button aria-label="bookmark" onClick={(e) => { e.stopPropagation(); setSaved((s) => !s) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[25px] h-[25px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.saves, 'Guardar')}</span>
        </button>
        {/* Más opciones */}
        <button aria-label="mas-opciones" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MoreVertical className="w-[25px] h-[25px] text-white" strokeWidth={1.5} fill="currentColor" />
        </button>
        {/* Disco de música giratorio */}
        <div className="mt-1 w-10 h-10 rounded-full overflow-hidden border border-white/30 bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center" style={{ animation: 'spin 6s linear infinite' }}>
          <img src={headAuthor.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" draggable={false} />
        </div>
      </div>

      {/* Menú "Más opciones" (hoja inferior) */}
      {menuOpen && (
        <div className="absolute inset-0 z-40 flex items-end pointer-events-auto" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
          <div className="relative w-full bg-[#0a0a0b] border-t border-white/10 rounded-t-2xl pt-2 pb-7 px-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
            <button onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-white hover:bg-white/10 transition-colors">
              <EyeOff className="w-5 h-5 text-white/80" strokeWidth={1.5} />
              <span className="text-[15px]">No me interesa</span>
            </button>
            <button onClick={() => { try { navigator.clipboard?.writeText(window.location.href) } catch (_) { /* noop */ } setMenuOpen(false) }} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-white hover:bg-white/10 transition-colors">
              <Link2 className="w-5 h-5 text-white/80" strokeWidth={1.5} />
              <span className="text-[15px]">Copiar enlace</span>
            </button>
            <button onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-red-400 hover:bg-white/10 transition-colors">
              <Flag className="w-5 h-5" strokeWidth={1.5} />
              <span className="text-[15px]">Reportar</span>
            </button>
            <button onClick={() => setMenuOpen(false)} className="mt-1 w-full px-3 py-3.5 rounded-xl text-white/70 font-medium hover:bg-white/10 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Selector de reto — elige explícitamente la opción A o B a la que retar */}
      {challengePickOpen && (
        <div className="absolute inset-0 z-40 flex items-end pointer-events-auto" onClick={(e) => { e.stopPropagation(); setChallengePickOpen(false) }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full bg-[#0a0a0b] border-t border-white/10 rounded-t-3xl pt-2 pb-7 px-5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Glow superior cálido dorado */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 z-0"
                 style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(214,178,122,0.10), transparent 70%)' }} />

            <div className="relative z-10 mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
            <h3 className="relative z-10 text-white text-[16px] font-semibold tracking-tight text-center">¿A quién quieres retar?</h3>
            <p className="relative z-10 text-zinc-500 text-[12px] text-center mb-4">Elige la opción de este 1vs1</p>

            <div className="relative z-10 grid grid-cols-2 gap-3">
              {[
                { key: 'a', sd: sideA, ring: 'ring-purple-500', dot: '#A855F7', label: 'Opción A' },
                { key: 'b', sd: sideB, ring: 'ring-blue-500', dot: '#3B82F6', label: 'Opción B' },
              ].map(({ key, sd, ring, dot, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setChallengePickOpen(false)
                    onChallenge?.({
                      videoUrl: sd.videoUrl,
                      author: sd.author || headAuthor,
                      description: sd.description || post.description,
                      music: sd.music,
                    })
                  }}
                  className="group flex flex-col items-center gap-2.5 active:scale-[0.98] transition-all"
                >
                  <div className={cn('relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 ring-2 ring-offset-2 ring-offset-[#0a0a0b]', ring)}>
                    {sd.posterUrl && (
                      <img src={sd.posterUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                    )}
                    {sd.videoUrl && (
                      <video src={sd.videoUrl + '#t=0.3'} muted autoPlay loop playsInline preload="metadata" poster={sd.posterUrl || undefined} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-bold rounded-full px-2 py-0.5 bg-black/55 backdrop-blur" style={{ color: dot }}>{label}</span>
                  </div>
                  <span className="text-white text-[13px] font-semibold leading-tight text-center line-clamp-1">
                    {sd.author?.name || (sd.author?.username ? `@${sd.author.username}` : label)}
                  </span>
                </button>
              ))}
            </div>

            <button onClick={() => setChallengePickOpen(false)} className="relative z-10 mt-4 w-full h-11 rounded-full border border-white/15 text-white/80 font-medium text-[14px] hover:bg-white/[0.06] active:scale-[0.99] transition">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* progress bar */}
      <div className="absolute left-0 right-0 bottom-16 z-20 h-[2px] bg-white/15">
        <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
      </div>

      {/* Winner card — aparece automáticamente tras votar */}
      <VSWinnerCard
        visible={showWinner}
        winnerSide={chosenKey}
        winnerName={chosenName}
        winnerPercentage={chosenPct}
        winnerImage={chosenSide.author?.avatarUrl}
        winnerVideoUrl={chosenSrc}
        loserName={otherName}
        loserPercentage={otherPct}
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
