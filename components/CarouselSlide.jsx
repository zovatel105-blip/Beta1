'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Bookmark, Play, Swords, MoreVertical } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'
import CaptionText from './CaptionText'
import VSWinnerCard from './VSWinnerCard'
import CommentsModal from './CommentsModal'
import ShareModal from './ShareModal'
import OptionsModal from './OptionsModal'
import AuthModal from './AuthModal'
import Avatar, { isGeneratedAvatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
import { pickQuality, reportStall } from '@/lib/networkQuality'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

/**
 * CarouselSlide — publicación "versus": carrusel horizontal de 2 vídeos (A / B).
 * Se ve un vídeo a la vez y se desliza horizontalmente entre A y B (con puntitos).
 * Se vota tocando directamente el vídeo (toca = vota la opción visible).
 * La UI (cabecera + columna social) es la misma que la de un vídeo normal.
 */
function CarouselSlide({ post, isActive, isNear, isAdjacent, warm = false, muted: globalMuted, playbackEnabled = true, onRequestNext, onChallenge, onOpenProfile, infoBottom = false, hideChallenge = false }) {
  const { user } = useAuth()
  const overlayRef = useRef(null)
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const rafRef = useRef(0)
  const downRef = useRef({ x: 0, y: 0, t: 0 })
  const lastTapRef = useRef(0)
  const swipedRef = useRef(false)
  // Token del estado WARM: invalida el pause() diferido del prime si la tarjeta
  // pasa a activa antes de que resuelva (evita pausar el vídeo ya en reproducción).
  const warmRef = useRef(null)

  const [sideIdx, setSideIdx] = useState(0) // 0 = A, 1 = B
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saved, setSaved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [following, setFollowing] = useState(false)
  const [voteBursts, setVoteBursts] = useState([])
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Modales de comentarios, compartir y auth
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // Contadores sociales en vivo: muestran el NÚMERO cuando ya se interactuó y el
  // título sólo si aún no hay interacción. Persisten por post en localStorage
  // para que el incremento del usuario se mantenga al desplazar/recargar.
  const lsNum = (k) => { try { return parseInt(localStorage.getItem(k) || '0', 10) || 0 } catch { return 0 } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)) } catch { /* ignore */ } }
  const [commentCount, setCommentCount] = useState(post.stats?.comments || 0)
  const [shareCount, setShareCount] = useState(post.stats?.shares || 0)
  const [saveCount, setSaveCount] = useState(post.stats?.saves || 0)
  const [challengeCount, setChallengeCount] = useState(post.stats?.challenges || 0)

  // Al montar: fusiona los contadores persistidos del usuario y escucha el
  // evento global 'twyk:challenged' para incrementar "Retar" en la tarjeta cuyo
  // postId coincida (el reto se crea en un diálogo global del Feed).
  useEffect(() => {
    setCommentCount((c) => Math.max(c, lsNum(`cmtN_${post.id}`)))
    setShareCount((c) => Math.max(c, lsNum(`shrN_${post.id}`)))
    setSaveCount((c) => Math.max(c, lsNum(`savN_${post.id}`)))
    setChallengeCount((c) => Math.max(c, lsNum(`chlN_${post.id}`)))
    const onChallenged = (e) => {
      if (e.detail?.postId === post.id) {
        setChallengeCount((n) => { const next = n + 1; lsSet(`chlN_${post.id}`, next); return next })
      }
    }
    window.addEventListener('twyk:challenged', onChallenged)
    return () => window.removeEventListener('twyk:challenged', onChallenged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  // Manejar guardar/favorito con API
  const handleSaveToggle = useCallback(async (e) => {
    e.stopPropagation()
    
    // Verificar autenticación
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    
    const newSaved = !saved
    setSaved(newSaved)
    setSaveCount((n) => { const next = Math.max(0, n + (newSaved ? 1 : -1)); lsSet(`savN_${post.id}`, next); return next })
    
    try {
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      })
    } catch (err) {
      console.error('Error saving post:', err)
      // Revertir en caso de error
      setSaved(!newSaved)
      setSaveCount((n) => Math.max(0, n + (newSaved ? -1 : 1)))
    }
  }, [post.id, saved, user])

  const [votes, setVotes] = useState({ a: post.votes?.a || 0, b: post.votes?.b || 0 })
  const [userVote, setUserVote] = useState(null)
  const [voting, setVoting] = useState(false)
  const [showWinner, setShowWinner] = useState(false)

  const side = sideIdx === 0 ? 'a' : 'b'

  const sideA = post.sideA || { videoUrl: post.videoUrl, author: post.author, description: post.description, music: post.music }
  const sideB = post.sideB || { videoUrl: post.videoUrl, author: post.author, description: '', music: '' }
  const current = sideIdx === 0 ? sideA : sideB
  const headAuthor = current.author || post.author || {}
  // Reto 1vs1: cabecera con los DOS creadores (avatar + nombre de cada lado)
  const authorA = sideA.author || post.author || {}
  const authorB = sideB.author || post.author || {}

  // ¿La publicación es del usuario actual? El dueño se identifica por author.id
  // (las subidas guardan author.id = user.id) o por userId. Si lo es, el menú de
  // "tres puntos" muestra opciones de dueño (eliminar) en vez de reportar/bloquear.
  const isOwner = !!user && ((post?.author?.id && post.author.id === user.id) || (post?.userId && post.userId === user.id))

  // FASE 2: calidad adaptativa a la red (fallback al videoUrl si no hay renditions).
  const srcA = useMemo(() => pickQuality(sideA.qualities, sideA.videoUrl), [sideA.qualities, sideA.videoUrl])
  const srcB = useMemo(() => pickQuality(sideB.qualities, sideB.videoUrl), [sideB.qualities, sideB.videoUrl])

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

  // 🚨 REGLA #2 — LIBERACIÓN AGRESIVA DEL DECODER.
  // El src NUNCA se declara en JSX: se asigna imperativamente SOLO en el vídeo
  // VISIBLE de la tarjeta ACTIVA. acquire() lo asigna; release() ejecuta
  // pause() + removeAttribute('src') + load(): load() tras quitar el src es lo
  // que fuerza al navegador a abortar la descarga y devolver el decoder de
  // hardware + la RAM al sistema. Sin esto, mantener varios <video> con src
  // agota el presupuesto de decodificadores en móvil (pantallas negras / jank).
  const acquire = useCallback((v, src) => {
    if (!v || !src) return
    // preload='auto' permite bufferizar el frame 1 aunque el vídeo esté en pausa
    // (WARM). Con preload='none' el navegador no descargaría hasta el play().
    if (v.preload !== 'auto') v.preload = 'auto'
    if (v.getAttribute('src') !== src) {
      v.setAttribute('src', src)
      try { v.load() } catch { /* ignore */ }
    }
  }, [])
  const release = useCallback((v) => {
    if (!v) return
    try { v.pause() } catch { /* ignore */ }
    if (v.getAttribute('src') !== null) {
      v.removeAttribute('src')
      try { v.preload = 'none' } catch { /* ignore */ }
      try { v.load() } catch { /* ignore */ }
    }
  }, [])

  // Prime de WARM: reproduce muteado para FORZAR buffer REAL (~1.5s) y luego
  // pausa + reset a 0. Pausar de inmediato solo bufferiza ~0.1s -> al activarse
  // se quedaba esperando datos (el 1-2s). Con 1.5s en buffer, reanuda sin stalls.
  const primeWarm = useCallback((v, token) => {
    if (!v) return
    v.muted = true
    let done = false
    function finish() {
      if (done) return
      done = true
      v.removeEventListener('canplaythrough', finish)
      v.removeEventListener('timeupdate', onTime)
      if (warmRef.current === token) {
        try { v.pause() } catch { /* ignore */ }
        try { v.currentTime = 0 } catch { /* ignore */ }
      }
    }
    function onTime() { if (v.currentTime >= 1.5) finish() }
    v.addEventListener('canplaythrough', finish, { once: true })
    v.addEventListener('timeupdate', onTime)
    try { const p = v.play(); if (p && p.catch) p.catch(() => {}) } catch { /* ignore */ }
    setTimeout(finish, 5000)
  }, [])

  // Play/pausa + adquisición/liberación del decoder según slide activo + lado
  // visible. El lado OCULTO y los slides NO activos nunca retienen un decoder.
  // WARM: si esta tarjeta es la SIGUIENTE (warm), precargamos el lado A (el
  // primero que se ve) en PAUSA -> al activarse, play() arranca sin espera.
  useEffect(() => {
    const vis = sideIdx === 0 ? videoARef.current : videoBRef.current
    const hid = sideIdx === 0 ? videoBRef.current : videoARef.current
    const visSrc = sideIdx === 0 ? srcA : srcB
    release(hid)
    if (isActive && playbackEnabled) {
      warmRef.current = null
      acquire(vis, visSrc)
      if (vis) {
        vis.muted = globalMuted
        if (showWinner) {
          try { vis.pause() } catch { /* ignore */ }
        } else {
          const p = vis.play()
          if (p && p.catch) p.catch(() => { try { vis.muted = true; vis.play().catch(() => {}) } catch { /* ignore */ } })
        }
      }
    } else if (warm && playbackEnabled) {
      const token = {}
      warmRef.current = token
      const va = videoARef.current
      acquire(va, srcA)
      primeWarm(va, token)
    } else {
      warmRef.current = null
      release(vis)
    }
  }, [isActive, playbackEnabled, warm, sideIdx, globalMuted, srcA, srcB, showWinner, acquire, release, primeWarm])

  // Cleanup de DESMONTAJE (la tarjeta sale de la ventana de 3) -> liberación
  // garantizada de AMBOS vídeos (Regla #2, "cuando la tarjeta salga del viewport").
  useEffect(() => () => {
    release(videoARef.current)
    release(videoBRef.current)
  }, [release])

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

  const onVideoPlay = useCallback(() => setPaused(false), [])
  const onVideoPause = useCallback(() => {
    const vis = getVisible()
    if (vis) setPaused(vis.paused)
  }, [getVisible])

  const doLike = useCallback((evt) => {
    // Like eliminado: el doble toque ahora vota (ver onPointerUp).
  }, [])

  const submitVote = useCallback(async (s, pt) => {
    // Verificar autenticación
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    
    if (userVote || voting) return
    setVoting(true)
    setUserVote(s)
    setVotes((v) => ({ ...v, [s]: (v[s] || 0) + 1 }))
    // Burst del icono de voto: aparece justo DONDE tocaste (un poco por encima),
    // con el color del lado (A lila / B azul). Sin punto -> centrado.
    const burstColor = s === 'a' ? '#A855F7' : '#3B82F6'
    const burstId = Math.random().toString(36).slice(2)
    setVoteBursts((b) => [...b, { id: burstId, color: burstColor, x: pt?.x, y: pt?.y }])
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
        if (data?.votes) {
          // No sobrescribir el conteo optimista con un total MENOR (evita que el
          // número "parpadee" a 0/placeholder si el servidor devolviera menos).
          const srvTotal = (data.votes.a || 0) + (data.votes.b || 0)
          setVotes((cur) => {
            const curTotal = (cur.a || 0) + (cur.b || 0)
            return srvTotal >= curTotal ? data.votes : cur
          })
        }
      }
    } catch { /* ignore */ } finally {
      setVoting(false)
    }
  }, [post.id, userVote, voting, user])

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
    if (isDouble) {
      if (!userVote) {
        const rect = overlayRef.current?.getBoundingClientRect()
        const pt = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null
        submitVote(side, pt)
      }
      return
    }
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

  // La tarjeta tras votar destaca SIEMPRE la opción que eligió el usuario (su
  // voto): vídeo, nombre, % y color. Así votar B muestra B (no quien va ganando).
  const chosenKey = userVote === 'b' ? 'b' : 'a'
  const chosenSide = chosenKey === 'b' ? sideB : sideA
  const otherSide = chosenKey === 'b' ? sideA : sideB
  const chosenPct = chosenKey === 'b' ? pctB : pctA
  const otherPct = 100 - chosenPct
  const chosenName = chosenSide.author?.name || (chosenSide.author?.username ? `@${chosenSide.author.username}` : '')
  const otherName = otherSide.author?.name || (otherSide.author?.username ? `@${otherSide.author.username}` : '')
  const chosenSrc = chosenKey === 'b' ? srcB : srcA
  const chosenIsImage = chosenSide.mediaType === 'image'

  // El <video> se monta sin src en JSX (preload="none"): el src lo gestiona
  // imperativamente el efecto de acquire/release (Regla #2). El poster se ve
  // al instante y las tarjetas adyacentes solo muestran poster -> 0 decoders.
  const renderVideo = (s, ref, mountVideo) => (
    <div className="relative w-1/2 h-full overflow-hidden bg-black">
      {/* Póster / imagen: se ve al instante. Para publicaciones de FOTO este es
          el contenido final (no se monta <video>). */}
      {(s.posterUrl || s.imageUrl) && (
        <img
          src={s.posterUrl || s.imageUrl}
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
          preload="none"
          poster={s.posterUrl || undefined}
          onPlay={onVideoPlay}
          onPause={onVideoPause}
          onWaiting={reportStall}
        />
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
        {/* Ambos lados montan el <video> (sin src) cuando la tarjeta está en la
            ventana: el src se adquiere solo en el lado visible de la activa, así
            deslizar a B es instantáneo sin agotar decodificadores. */}
        {renderVideo(sideA, videoARef, isNear && sideA.mediaType !== 'image')}
        {renderVideo(sideB, videoBRef, isNear && sideB.mediaType !== 'image')}
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
          Swipe to compare · double-tap to vote
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

      {/* burst del icono de voto al votar — aparece justo DONDE tocaste (un poco
          por encima) y con su color (A lila / B azul). Sin coords -> centrado. */}
      {voteBursts.map((vb) => (
        vb.x != null && vb.y != null ? (
          <div
            key={vb.id}
            className="absolute z-30 pointer-events-none"
            style={{ left: vb.x, top: vb.y, transform: 'translate(-50%, -115%)' }}
          >
            <span className="like-pop" style={{ color: vb.color, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))' }}>
              <VoteIcon className="w-24 h-24" strokeWidth={320} filled />
            </span>
          </div>
        ) : (
          <div key={vb.id} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <span className="like-pop" style={{ color: vb.color, filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.55))' }}>
              <VoteIcon className="w-24 h-24" strokeWidth={320} filled />
            </span>
          </div>
        )
      ))}

      {/* Header — avatar + nombre (estilo Twyk). Arriba por defecto; abajo si infoBottom. */}
      <div
        className={cn(
          'absolute z-20 px-4 pointer-events-none',
          infoBottom
            ? 'left-0 right-16 bottom-20 pt-10'
            : 'top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent pb-10'
        )}
        style={infoBottom ? undefined : { paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5 w-fit max-w-[calc(100%-4rem)] pointer-events-auto">
          {post.isChallenge ? (
            <>
              {/* Reto 1vs1 (estilo colaboración): dos avatares solapados + "userA / userB" */}
              <div className="relative w-[39px] h-[39px] shrink-0">
                {/* Avatar secundario (arriba-izquierda, detrás) — hueco abajo-derecha para el principal */}
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenProfile?.(authorB.username) }}
                  className="absolute top-0 left-0 w-[24px] h-[24px] rounded-full overflow-hidden block"
                  style={{
                    WebkitMaskImage: 'radial-gradient(circle 15px at 27px 27px, transparent 0 15px, #000 15px)',
                    maskImage: 'radial-gradient(circle 15px at 27px 27px, transparent 0 15px, #000 15px)',
                  }}
                >
                  <Avatar src={authorB.avatarUrl} alt={authorB.username} className="w-full h-full" />
                </button>
                {/* Avatar principal (abajo-derecha, delante) */}
                <button onClick={(e) => { e.stopPropagation(); onOpenProfile?.(authorA.username) }} className="absolute bottom-0 right-0 w-[24px] h-[24px] rounded-full overflow-hidden block">
                  <Avatar src={authorA.avatarUrl} alt={authorA.username} className="w-full h-full" />
                </button>
              </div>
              <div className="flex flex-col min-w-0 max-w-[160px] leading-tight">
                <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(authorA.username) }} className="text-white font-semibold text-[14px] drop-shadow-md truncate cursor-pointer">
                  {authorA.username || authorA.name} <span className="font-light">vs</span>
                </span>
                <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(authorB.username) }} className="text-white font-semibold text-[14px] drop-shadow-md truncate cursor-pointer">
                  {authorB.username || authorB.name}
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Publicación normal: un solo avatar + nombre */}
              <button onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="w-[30px] h-[30px] rounded-full overflow-hidden block shrink-0">
                <Avatar src={headAuthor.avatarUrl} alt={headAuthor.username} className="w-full h-full" />
              </button>
              <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="text-white font-semibold text-[13px] leading-tight drop-shadow-md truncate max-w-[160px] cursor-pointer">
                {headAuthor.username || headAuthor.name}
              </span>
            </>
          )}
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              if (!user) {
                setAuthModalOpen(true);
                return;
              }
              const target = headAuthor?.username;
              if (!target || target === user?.username) return;
              setFollowing((f) => !f);
              fetch(`/api/users/${encodeURIComponent(target)}/follow`, { method: 'POST' })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => { if (d && typeof d.following === 'boolean') setFollowing(d.following); })
                .catch(() => setFollowing((f) => !f));
            }}
            aria-label="follow"
            className={cn(
              'shrink-0 px-3 py-1 rounded-lg border text-[13px] font-medium transition-all duration-200 active:scale-95',
              following ? 'border-white/40 text-white/80' : 'border-white/90 text-white'
            )}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        <div className="mt-1 pointer-events-auto">
          <CaptionText text={current.description || post.description} className="text-white text-sm leading-tight" />
        </div>
      </div>

      {/* Columna social derecha — estilo Twyk (abajo) */}
      <div
        className="absolute z-20 right-1 bottom-[72px] flex flex-col items-center gap-4 pointer-events-auto"
      >
        <button aria-label="votes" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <span style={{ color: userVote === 'a' ? '#A855F7' : userVote === 'b' ? '#3B82F6' : '#fff', display: 'inline-flex', transition: 'color 200ms' }}>
            <VoteIcon className="w-[40px] h-[40px]" strokeWidth={180} filled={!!userVote} />
          </span>
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(totalVotes, 'Vote')}</span>
        </button>
        {!hideChallenge && headAuthor?.username !== user?.username && (
          <button aria-label="challenge" onClick={(e) => { 
            e.stopPropagation(); 
            if (!user) {
              setAuthModalOpen(true);
              return;
            }
            onChallenge?.({ postId: post.id, videoUrl: current.videoUrl, author: headAuthor, description: current.description || post.description, music: current.music || post.music });
          }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
            <Swords className="w-[30px] h-[30px] text-white" strokeWidth={1.25} />
            <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(challengeCount, 'Challenge')}</span>
          </button>
        )}
        <button aria-label="comments" onClick={(e) => { 
          e.stopPropagation(); 
          if (!user) {
            setAuthModalOpen(true);
            return;
          }
          setCommentsOpen(true);
        }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MessageCircle className="w-[30px] h-[30px] text-white" strokeWidth={1.25} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(commentCount, 'Comment')}</span>
        </button>
        <button aria-label="share" onClick={(e) => { e.stopPropagation(); setShareOpen(true) }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <ShareIcon className="w-[30px] h-[30px] text-white" strokeWidth={1.25} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(shareCount, 'Share')}</span>
        </button>
        <button aria-label="bookmark" onClick={handleSaveToggle} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[30px] h-[30px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} strokeWidth={1.25} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(saveCount, 'Save')}</span>
        </button>
        <button aria-label="mas-opciones" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MoreVertical className="w-[18px] h-[18px] text-white" strokeWidth={1.25} fill="currentColor" />
        </button>
        <div className="mt-1 w-10 h-10 rounded-full overflow-hidden border border-white/30 bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center" style={{ animation: 'spin 6s linear infinite' }}>
          <Avatar src={headAuthor.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
        </div>
      </div>

      {/* Menú "Más opciones" (hoja inferior estilo Instagram) */}
      <OptionsModal
        open={menuOpen}
        postId={post.id}
        author={headAuthor}
        isOwner={isOwner}
        onClose={() => setMenuOpen(false)}
      />

      {/* Puntitos del carrusel */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[70px] z-20 flex items-center gap-1">
        {[0, 1].map((i) => (
          <button
            key={i}
            aria-label={`opción ${i === 0 ? 'A' : 'B'}`}
            onClick={(e) => { e.stopPropagation(); goTo(i) }}
            className={cn('rounded-full transition-all duration-200', sideIdx === i ? 'w-4 h-[3px] bg-white' : 'w-[3px] h-[3px] bg-white/40')}
          />
        ))}
      </div>

      {/* progress bar (solo para vídeo) */}
      {current.mediaType !== 'image' && (
        <div className="absolute left-0 right-0 bottom-16 z-20 h-[2px] bg-white/15">
          <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
        </div>
      )}

      {/* Winner card — aparece automáticamente tras votar */}
      <VSWinnerCard
        visible={showWinner}
        winnerSide={chosenKey}
        winnerName={chosenName}
        winnerPercentage={chosenPct}
        winnerImage={chosenIsImage ? (chosenSide.posterUrl || chosenSide.imageUrl) : (isGeneratedAvatar(chosenSide.author?.avatarUrl) ? null : chosenSide.author?.avatarUrl)}
        winnerVideoUrl={chosenIsImage ? null : chosenSrc}
        loserName={otherName}
        loserPercentage={otherPct}
        totalVotes={totalVotes}
        onClose={() => setShowWinner(false)}
        onNext={() => { setShowWinner(false); onRequestNext?.() }}
      />

      {/* Modales de comentarios, compartir y auth */}
      <CommentsModal
        open={commentsOpen}
        postId={post.id}
        votedSide={userVote}
        onCountChange={(n) => { setCommentCount(n); lsSet(`cmtN_${post.id}`, n) }}
        onClose={() => setCommentsOpen(false)}
      />
      <ShareModal
        open={shareOpen}
        postId={post.id}
        onShared={() => setShareCount((n) => { const next = n + 1; lsSet(`shrN_${post.id}`, next); return next })}
        onClose={() => setShareOpen(false)}
      />
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab="register"
      />
    </div>
  )
}

export default memo(CarouselSlide)
