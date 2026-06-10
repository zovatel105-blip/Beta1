'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Bookmark, Play, Swords, MoreVertical, Flag, EyeOff, Link2 } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'
import VSWinnerCard from './VSWinnerCard'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

const webmFor = (url) => (typeof url === 'string' ? url.replace(/\.mp4$/, '.webm') : '')
// Solo los vídeos integrados (/videos/) tienen .webm garantizado. Los uploads
// pueden no tenerlo aún -> no añadimos un <source> webm que dé 404 (en dev
// cada 404 dispara un render de página completo y ralentiza la carga del feed).
const hasWebm = (url) => typeof url === 'string' && url.startsWith('/videos/')

/**
 * CarouselSlide — publicación "versus": carrusel horizontal de 2 vídeos (A / B).
 * Se ve un vídeo a la vez y se desliza horizontalmente entre A y B (con puntitos).
 * Se vota tocando directamente el vídeo (toca = vota la opción visible).
 * La UI (cabecera + columna social) es la misma que la de un vídeo normal.
 */
function CarouselSlide({ post, isActive, isNear, muted: globalMuted, onRequestNext, onChallenge }) {
  const overlayRef = useRef(null)
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const rafRef = useRef(0)
  const downRef = useRef({ x: 0, y: 0, t: 0 })
  const lastTapRef = useRef(0)
  const swipedRef = useRef(false)

  const [sideIdx, setSideIdx] = useState(0) // 0 = A, 1 = B
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saved, setSaved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [following, setFollowing] = useState(false)
  const [voteBursts, setVoteBursts] = useState([])
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

  const [votes, setVotes] = useState({ a: post.votes?.a || 0, b: post.votes?.b || 0 })
  const [userVote, setUserVote] = useState(null)
  const [voting, setVoting] = useState(false)
  const [showWinner, setShowWinner] = useState(false)

  const side = sideIdx === 0 ? 'a' : 'b'

  const sideA = post.sideA || { videoUrl: post.videoUrl, author: post.author, description: post.description, music: post.music }
  const sideB = post.sideB || { videoUrl: post.videoUrl, author: post.author, description: '', music: '' }
  const current = sideIdx === 0 ? sideA : sideB
  const headAuthor = current.author || post.author || {}

  // Restaurar voto previo
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const v = localStorage.getItem(`versus_vote_${post.id}`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === 'a' || v === 'b') setUserVote(v)
    } catch { /* ignore */ }
  }, [post.id])

  const getVisible = useCallback(() => (sideIdx === 0 ? videoARef.current : videoBRef.current), [sideIdx])
  const getHidden = useCallback(() => (sideIdx === 0 ? videoBRef.current : videoARef.current), [sideIdx])

  // Play / pause según slide activo + lado visible
  useEffect(() => {
    if (!isNear) return
    const vis = getVisible()
    const hid = getHidden()
    if (hid) { try { hid.pause() } catch { /* ignore */ } }
    if (!vis) return
    vis.muted = globalMuted
    if (isActive) {
      const tryPlay = async () => {
        try { await vis.play() } catch {
          try { vis.muted = true; await vis.play() } catch { /* ignore */ }
        }
      }
      tryPlay()
    } else {
      try { vis.pause() } catch { /* ignore */ }
    }
  }, [isActive, isNear, globalMuted, sideIdx, getVisible, getHidden])

  // Barra de progreso del vídeo visible
  useEffect(() => {
    if (!isActive) { cancelAnimationFrame(rafRef.current); return }
    const tick = () => {
      const vis = getVisible()
      if (vis && vis.duration > 0) setProgress((vis.currentTime / vis.duration) * 100)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, getVisible])

  // Pausar el vídeo visible mientras la winner card está abierta.
  useEffect(() => {
    const vis = getVisible()
    if (!vis) return
    if (showWinner) {
      try { vis.pause() } catch { /* ignore */ }
    } else if (isActive && isNear) {
      vis.play().catch(() => {})
    }
  }, [showWinner, isActive, isNear, getVisible])

  const onVideoPlay = useCallback(() => setPaused(false), [])
  const onVideoPause = useCallback(() => {
    const vis = getVisible()
    if (vis) setPaused(vis.paused)
  }, [getVisible])

  const doLike = useCallback((evt) => {
    // Like eliminado: el doble toque ahora vota (ver onPointerUp).
  }, [])

  const submitVote = useCallback(async (s) => {
    if (userVote || voting) return
    setVoting(true)
    setUserVote(s)
    setVotes((v) => ({ ...v, [s]: (v[s] || 0) + 1 }))
    // Burst del icono de voto sobre el vídeo (color del lado: A lila / B azul)
    const burstColor = s === 'a' ? '#A855F7' : '#3B82F6'
    const burstId = Math.random().toString(36).slice(2)
    setVoteBursts((b) => [...b, { id: burstId, color: burstColor }])
    setTimeout(() => setVoteBursts((b) => b.filter((x) => x.id !== burstId)), 850)
    // Mostrar la tarjeta de ganador después de la animación del icono
    setTimeout(() => setShowWinner(true), 650)
    try { localStorage.setItem(`versus_vote_${post.id}`, s) } catch { /* ignore */ }
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, side: s }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.votes) setVotes(data.votes)
      }
    } catch { /* ignore */ } finally {
      setVoting(false)
    }
  }, [post.id, userVote, voting])

  const goTo = useCallback((idx) => {
    setSideIdx(Math.max(0, Math.min(1, idx)))
  }, [])

  const endDrag = useCallback(() => {
    setDragging(false)
    setDragX(0)
  }, [])

  // Gesto: arrastrar horizontal = deslizar/cambiar lado; toque = votar / like / play-pause
  const onPointerDown = useCallback((e) => {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() }
    swipedRef.current = false
  }, [])

  const onPointerMove = useCallback((e) => {
    if (swipedRef.current) return
    const d = downRef.current
    if (!d.t) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    // intención vertical -> dejamos pasar el scroll del feed
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      if (dragging) endDrag()
      return
    }
    if (Math.abs(dx) < 6) return
    const w = overlayRef.current?.clientWidth || 360
    // limitar el arrastre según el lado actual
    const nx = sideIdx === 0 ? Math.max(-w, Math.min(0, dx)) : Math.min(w, Math.max(0, dx))
    if (!dragging) setDragging(true)
    setDragX(nx)
    // superado el umbral -> cambiar de lado (no esperamos al pointerup)
    if (Math.abs(dx) > w * 0.18) {
      swipedRef.current = true
      setDragging(false)
      setDragX(0)
      if (dx < 0) goTo(sideIdx + 1)
      else goTo(sideIdx - 1)
    }
  }, [dragging, sideIdx, goTo, endDrag])

  const onPointerUp = useCallback((e) => {
    const d = downRef.current
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    const wasSwipe = swipedRef.current
    endDrag()
    downRef.current = { x: 0, y: 0, t: 0 }
    if (wasSwipe) { swipedRef.current = false; return }
    // si hubo arrastre que no cruzó el umbral, solo recolocamos (sin tap)
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return
    const now = Date.now()
    const isDouble = now - lastTapRef.current < 300
    lastTapRef.current = now
    if (isDouble) { if (!userVote) submitVote(side); return }
    setTimeout(() => {
      if (Date.now() - lastTapRef.current < 280) return
      // toque simple = play/pausa
      const vis = getVisible()
      if (!vis) return
      if (vis.paused) vis.play().catch(() => {}); else vis.pause()
    }, 280)
  }, [side, userVote, endDrag, doLike, submitVote, getVisible])

  const onPointerCancel = useCallback(() => {
    endDrag()
    downRef.current = { x: 0, y: 0, t: 0 }
  }, [endDrag])

  const totalVotes = (votes.a || 0) + (votes.b || 0)
  const pctA = totalVotes > 0 ? Math.round(((votes.a || 0) / totalVotes) * 100) : 50
  const pctB = 100 - pctA

  // Ganador para la winner card
  const winnerKey = (votes.a || 0) >= (votes.b || 0) ? 'a' : 'b'
  const winnerSide = winnerKey === 'a' ? sideA : sideB
  const loserSide = winnerKey === 'a' ? sideB : sideA
  const winnerPct = winnerKey === 'a' ? pctA : pctB
  const loserPct = 100 - winnerPct
  const winnerName = winnerSide.author?.name || (winnerSide.author?.username ? `@${winnerSide.author.username}` : '')
  const loserName = loserSide.author?.name || (loserSide.author?.username ? `@${loserSide.author.username}` : '')
  // Vídeo a mostrar en la winner card = la opción que ELIGIÓ el usuario (su voto).
  const chosenSide = userVote === 'b' ? sideB : sideA

  const renderVideo = (s, ref, mountVideo) => (
    <div className="relative w-1/2 h-full overflow-hidden bg-black">
      {/* Poster: primer fotograma -> la publicación se ve al instante. */}
      {s.posterUrl && (
        <img
          src={s.posterUrl}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {mountVideo && (
        <video
          ref={ref}
          className="absolute inset-0 w-full h-full object-cover bg-transparent"
          loop
          muted
          playsInline
          preload="auto"
          poster={s.posterUrl || undefined}
          onPlay={onVideoPlay}
          onPause={onVideoPause}
        >
          <source src={s.videoUrl} type="video/mp4" />
          {hasWebm(s.videoUrl) && <source src={webmFor(s.videoUrl)} type="video/webm" />}
        </video>
      )}
    </div>
  )

  return (
    <div ref={overlayRef} className="relative w-full h-full bg-black overflow-hidden select-none">
      {/* Carrusel: track de 2 vídeos que se desliza horizontalmente */}
      <div
        className="absolute inset-0 flex w-[200%] h-full"
        style={{
          transform: `translateX(calc(${sideIdx === 0 ? '0%' : '-50%'} + ${dragX}px))`,
          transition: dragging ? 'none' : 'transform 280ms ease-out',
        }}
      >
        {/* Lado A: se monta/bufferiza en toda la ventana de precarga (es el que se
            ve primero). Lado B: solo cuando el slide está activo (o ya estabas en
            B), para no agotar el presupuesto de decodificadores del navegador. */}
        {renderVideo(sideA, videoARef, isNear)}
        {renderVideo(sideB, videoBRef, isNear && (isActive || sideIdx === 1))}
      </div>

      {/* Capa de gestos (swipe + tap) */}
      <div
        className="absolute inset-0 z-10"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />

      {/* Pista para votar */}
      {!userVote && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Desliza para comparar · doble toque para votar
        </div>
      )}

      {/* play overlay */}
      {paused && (
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
        <div className="flex items-center gap-2.5 w-fit pointer-events-auto">
          <button onClick={(e) => e.stopPropagation()} className="w-[38px] h-[38px] rounded-full overflow-hidden block shrink-0">
            <img src={headAuthor.avatarUrl} alt={headAuthor.username} className="w-full h-full object-cover" draggable={false} />
          </button>
          <span className="text-white font-semibold text-[13px] leading-tight drop-shadow-md">{headAuthor.username || headAuthor.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setFollowing((f) => !f) }}
            aria-label="seguir"
            className={cn(
              'px-2.5 py-0.5 rounded-lg border text-[12px] font-medium transition-all duration-200 active:scale-95',
              following ? 'border-white/40 bg-white/15 text-white' : 'border-white/90 text-white'
            )}
          >
            {following ? 'Siguiendo' : 'Seguir'}
          </button>
        </div>
        <div className="mt-1 pointer-events-auto">
          <h2 className="text-white text-sm leading-tight line-clamp-2">{current.description || post.description}</h2>
        </div>
      </div>

      {/* Columna social derecha — estilo Twyk (abajo) */}
      <div
        className="absolute z-20 right-2 bottom-20 flex flex-col items-center gap-5 pointer-events-auto"
      >
        <button aria-label="votos" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <span style={{ color: userVote === 'a' ? '#A855F7' : userVote === 'b' ? '#3B82F6' : '#fff', display: 'inline-flex', transition: 'color 200ms' }}>
            <VoteIcon className="w-[36px] h-[36px]" strokeWidth={180} filled={!!userVote} />
          </span>
          <span className="text-[11px] font-semibold text-white leading-none">{countLabel(totalVotes, 'Votar')}</span>
        </button>
        <button aria-label="retar" onClick={(e) => { e.stopPropagation(); onChallenge?.({ videoUrl: current.videoUrl, author: headAuthor, description: current.description || post.description, music: current.music || post.music }) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Swords className="w-[25px] h-[25px] text-white" strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">Retar</span>
        </button>
        <button aria-label="comments" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MessageCircle className="w-[25px] h-[25px] text-white" strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.comments, 'Comentar')}</span>
        </button>
        <button aria-label="share" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <ShareIcon className="w-[25px] h-[25px] text-white" strokeWidth={1.1} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.shares, 'Compartir')}</span>
        </button>
        <button aria-label="bookmark" onClick={(e) => { e.stopPropagation(); setSaved((s) => !s) }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[25px] h-[25px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} strokeWidth={1.25} />
          <span className="text-[10px] font-semibold text-white leading-none">{countLabel(post.stats?.saves, 'Guardar')}</span>
        </button>
        <button aria-label="mas-opciones" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MoreVertical className="w-[25px] h-[25px] text-white" strokeWidth={1.5} fill="currentColor" />
        </button>
        <div className="mt-1 w-10 h-10 rounded-full overflow-hidden border border-white/30 bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center" style={{ animation: 'spin 6s linear infinite' }}>
          <img src={headAuthor.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" draggable={false} />
        </div>
      </div>

      {/* Menú "Más opciones" (hoja inferior) */}
      {menuOpen && (
        <div className="absolute inset-0 z-40 flex items-end pointer-events-auto" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
          <div className="relative w-full bg-zinc-900 rounded-t-2xl pt-2 pb-7 px-3" onClick={(e) => e.stopPropagation()}>
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

      {/* Puntitos del carrusel */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-20 z-20 flex items-center gap-1.5">
        {[0, 1].map((i) => (
          <button
            key={i}
            aria-label={`opción ${i === 0 ? 'A' : 'B'}`}
            onClick={(e) => { e.stopPropagation(); goTo(i) }}
            className={cn('rounded-full transition-all duration-200', sideIdx === i ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40')}
          />
        ))}
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
    </div>
  )
}

export default memo(CarouselSlide)
