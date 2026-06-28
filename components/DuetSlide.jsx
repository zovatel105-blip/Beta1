'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Bookmark, Play, Swords, MoreVertical, ChevronDown } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'
import VSWinnerCard from './VSWinnerCard'
import VSContentCard from './VSContentCard'
import CommentsModal from './CommentsModal'
import ShareModal from './ShareModal'
import OptionsModal from './OptionsModal'
import BottomSheet from './BottomSheet'
import AuthModal from './AuthModal'
import Avatar, { isGeneratedAvatar } from './Avatar'
import { useAuth } from '@/contexts/AuthContext'
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

/**
 * DuetSlide — 1vs1 (dueto) slide.
 * Renders two videos side-by-side (horizontal = top/bottom, vertical = left/right),
 * both synced for play/pause. The user votes by tapping directly on a video side:
 *   - single tap  -> vota por ese lado (y ese lado pasa a tener el audio). Si ya
 *                    votaste, el tap simple alterna play/pause.
 *   - double tap  -> like (corazón flotante).
 * La UI (cabecera superior + columna social derecha) es idéntica a la del vídeo normal.
 */
function DuetSlide({ post, isActive, isNear, isAdjacent, warm = false, muted: globalMuted, playbackEnabled = true, onRequestNext, onChallenge, onOpenProfile, infoBottom = false, hideChallenge = false }) {
  const { user } = useAuth()
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const overlayRef = useRef(null)
  const lastTapRef = useRef({ side: null, t: 0 })
  const tapTimerRef = useRef(null)
  const rafRef = useRef(0)
  // Token del estado WARM: invalida el pause() diferido del prime si la tarjeta
  // pasa a activa antes de que resuelva (evita pausar vídeos ya en reproducción).
  const warmRef = useRef(null)

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

  // Modales de comentarios, compartir y auth
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // Contadores sociales en vivo: muestran el NÚMERO cuando ya se interactuó y el
  // título sólo si aún no hay interacción. Persisten por post en localStorage.
  const lsNum = (k) => { try { return parseInt(localStorage.getItem(k) || '0', 10) || 0 } catch { return 0 } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)) } catch { /* ignore */ } }
  const [commentCount, setCommentCount] = useState(post.stats?.comments || 0)
  const [shareCount, setShareCount] = useState(post.stats?.shares || 0)
  const [saveCount, setSaveCount] = useState(post.stats?.saves || 0)
  const [challengeCount, setChallengeCount] = useState(post.stats?.challenges || 0)

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

  // ¿La publicación es del usuario actual? El dueño se identifica por author.id
  // (las subidas guardan author.id = user.id) o por userId. Si lo es, el menú de
  // "tres puntos" muestra opciones de dueño (eliminar) en vez de reportar/bloquear.
  const isOwner = !!user && ((post?.author?.id && post.author.id === user.id) || (post?.userId && post.userId === user.id))

  // FASE 2: calidad adaptativa a la red (fallback al videoUrl si no hay renditions).
  const srcA = useMemo(() => pickQuality(sideA.qualities, sideA.videoUrl), [sideA.qualities, sideA.videoUrl])
  const srcB = useMemo(() => pickQuality(sideB.qualities, sideB.videoUrl), [sideB.qualities, sideB.videoUrl])

  // 🚨 REGLA #2 — LIBERACIÓN AGRESIVA DEL DECODER.
  // El src NUNCA se declara en JSX: se asigna imperativamente SOLO cuando la
  // tarjeta está activa. release() ejecuta pause()+removeAttribute('src')+load()
  // para devolver los DOS decoders (el dueto usa 2) y la RAM al sistema en cuanto
  // deja de estar activa o se desmonta (sale de la ventana de 3).
  const acquire = useCallback((v, src) => {
    if (!v || !src) return
    // preload='auto' permite bufferizar el frame 1 en pausa (WARM 1vs1).
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

  // Ref para cancelar arranques atómicos pendientes.
  const atomicRef = useRef(null)

  // Arranca AMBOS vídeos de forma ATÓMICA: espera a que los dos tengan el frame 1
  // (readyState>=2) y los reproduce en el MISMO requestAnimationFrame -> desync < 1
  // frame. Cancela cualquier arranque pendiente anterior (token).
  // Arranca AMBOS vídeos juntos: espera a que los dos tengan el frame 1
  // (readyState>=2) y los reproduce en el MISMO requestAnimationFrame. Con
  // TIMEOUT de seguridad (1200ms): si un lado tarda demasiado, arranca igualmente
  // (nunca deja ambos congelados). NO impone sincronía continua: en Twyk los dos
  // clips son independientes y de distinta duración (por eso no hay watchdog de drift).
  const startBothAtomically = useCallback((a, b) => {
    if (!a || !b) return
    if (atomicRef.current) atomicRef.current.cancelled = true
    const token = { cancelled: false }
    atomicRef.current = token
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0)
    const playBoth = () => {
      if (token.cancelled) return
      Promise.allSettled([a.play(), b.play()]).then((res) => {
        if (!token.cancelled && res.some((r) => r.status === 'rejected')) {
          // autoplay bloqueado -> mutea ambos y reintenta
          try { a.muted = true; b.muted = true; a.play().catch(() => {}); b.play().catch(() => {}) } catch { /* ignore */ }
        }
      })
    }
    const run = () => {
      if (token.cancelled) return
      const bothReady = a.readyState >= 2 && b.readyState >= 2
      const timedOut = (typeof performance !== 'undefined' ? performance.now() : 0) - t0 > 1200
      if (bothReady || timedOut) {
        requestAnimationFrame(playBoth)
      } else {
        requestAnimationFrame(run)
      }
    }
    run()
  }, [])

  // Solo la tarjeta ACTIVA (y con reproducción habilitada, G3) adquiere src y
  // arranca AMBOS lados a la vez (atómico); cualquier otra los libera. Respeta
  // overlays (winner / content): si hay uno abierto, pausa sin soltar el decoder.
  useEffect(() => {
    const va = videoARef.current
    const vb = videoBRef.current
    if (isActive && playbackEnabled) {
      warmRef.current = null
      acquire(va, srcA)
      acquire(vb, srcB)
      // A suena solo si el audio global está activo Y el lado audible es A.
      if (va) va.muted = globalMuted || audibleSide !== 'a'
      if (vb) vb.muted = globalMuted || audibleSide !== 'b'
      if (!showWinner && !showContent) {
        startBothAtomically(va, vb)
      } else {
        if (atomicRef.current) atomicRef.current.cancelled = true
        try { if (va) va.pause() } catch { /* ignore */ }
        try { if (vb) vb.pause() } catch { /* ignore */ }
      }
    } else if (warm && playbackEnabled) {
      // WARM 1vs1: precarga REAL de AMBOS lados (buffer ~1.5s) -> arranque
      // atómico instantáneo al activarse.
      if (atomicRef.current) atomicRef.current.cancelled = true
      const token = {}
      warmRef.current = token
      acquire(va, srcA)
      acquire(vb, srcB)
      primeWarm(va, token)
      primeWarm(vb, token)
    } else {
      warmRef.current = null
      if (atomicRef.current) atomicRef.current.cancelled = true
      release(va)
      release(vb)
    }
  }, [isActive, playbackEnabled, warm, globalMuted, audibleSide, showWinner, showContent, srcA, srcB, acquire, release, primeWarm, startBothAtomically])

  // Cleanup de DESMONTAJE (sale de la ventana de 3) -> liberación garantizada.
  useEffect(() => () => {
    release(videoARef.current)
    release(videoBRef.current)
  }, [release])

  // Sincroniza el estado "paused" (overlay de play) mirando ambos vídeos.
  const syncPaused = useCallback(() => {
    const va = videoARef.current
    const vb = videoBRef.current
    if (!va || !vb) return
    setPaused(va.paused && vb.paused)
  }, [])

  // Barra de progreso: sigue al lado con audio (A por defecto). SIN watchdog de
  // drift: los dos clips de un 1vs1 son independientes (distinta duración) y
  // forzar su sincronía provocaba seeks en bucle ("disco rallado").
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

  const doLike = useCallback(() => {
    // Like eliminado: el doble toque ahora vota (ver handleTapSide).
  }, [])

  const submitVote = useCallback(async (side, pt) => {
    // Verificar autenticación
    if (!user) {
      setAuthModalOpen(true)
      return
    }
    
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
              preload="none"
              poster={sideA.posterUrl || undefined}
              onCanPlay={() => setLoadedA(true)}
              onLoadedData={() => setLoadedA(true)}
              onWaiting={() => { setLoadedA(false); reportStall() }}
              onPlay={() => setPaused(false)}
              onPause={syncPaused}
            />
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
              preload="none"
              poster={sideB.posterUrl || undefined}
              onCanPlay={() => setLoadedB(true)}
              onLoadedData={() => setLoadedB(true)}
              onWaiting={() => { setLoadedB(false); reportStall() }}
              onPlay={() => setPaused(false)}
              onPause={syncPaused}
            />
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
              Double-tap to vote
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
              <button onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="w-[34px] h-[34px] rounded-full overflow-hidden block shrink-0">
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
              following ? 'border-white/40 bg-white/15 text-white' : 'border-white/90 text-white'
            )}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        {/* Título / descripción */}
        <div className="mt-1 pointer-events-auto">
          <h2 className="text-white text-sm leading-tight line-clamp-2">{post.description}</h2>
        </div>
      </div>

      {/* Columna social derecha — estilo Twyk (abajo) */}
      <div
        className="absolute z-20 right-1 bottom-[72px] flex flex-col items-center gap-4 pointer-events-auto"
      >
        {/* Votos */}
        <button aria-label="votes" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <span style={{ color: userVote === 'a' ? '#A855F7' : userVote === 'b' ? '#3B82F6' : '#fff', display: 'inline-flex', transition: 'color 200ms' }}>
            <VoteIcon className="w-[40px] h-[40px]" strokeWidth={240} filled={!!userVote} />
          </span>
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">
            {countLabel(totalVotes, 'Vote')}
          </span>
        </button>
        {/* Retar — abre un selector A/B para elegir explícitamente a qué opción retar. */}
        {!hideChallenge && headAuthor?.username !== user?.username && (
          <button aria-label="challenge" onClick={(e) => { 
            e.stopPropagation(); 
            if (!user) {
              setAuthModalOpen(true);
              return;
            }
            setChallengePickOpen(true);
          }} className="flex flex-col items-center gap-0.5 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
            <Swords className="w-[30px] h-[30px] text-white" strokeWidth={1.5} />
            <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(challengeCount, 'Challenge')}</span>
          </button>
        )}
        {/* Comentar */}
        <button aria-label="comments" onClick={(e) => { 
          e.stopPropagation(); 
          if (!user) {
            setAuthModalOpen(true);
            return;
          }
          setCommentsOpen(true);
        }} className="flex flex-col items-center gap-0.5 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MessageCircle className="w-[30px] h-[30px] text-white" strokeWidth={1.5} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(commentCount, 'Comment')}</span>
        </button>
        {/* Compartir */}
        <button aria-label="share" onClick={(e) => { e.stopPropagation(); setShareOpen(true) }} className="flex flex-col items-center gap-0.5 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <ShareIcon className="w-[30px] h-[30px] text-white" strokeWidth={1.5} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(shareCount, 'Share')}</span>
        </button>
        {/* Guardar */}
        <button aria-label="bookmark" onClick={handleSaveToggle} className="flex flex-col items-center gap-0.5 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[30px] h-[30px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} strokeWidth={1.5} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(saveCount, 'Save')}</span>
        </button>
        {/* Más opciones */}
        <button aria-label="mas-opciones" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MoreVertical className="w-[18px] h-[18px] text-white" strokeWidth={1.25} fill="currentColor" />
        </button>
        {/* Disco de música giratorio */}
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

      {/* Selector de reto — elige explícitamente la opción A o B a la que retar.
          Se renderiza con BottomSheet (portal a body) para aparecer SIEMPRE por
          encima de todo, incluida la barra de navegación inferior. */}
      <BottomSheet open={challengePickOpen} onClose={() => setChallengePickOpen(false)} hideHandle>
        {/* Flecha para cerrar (igual que el modal de Compartir) */}
        <button
          type="button"
          onClick={() => setChallengePickOpen(false)}
          aria-label="close"
          className="flex justify-center items-center w-full pt-2 pb-1 shrink-0 active:scale-90 transition"
        >
          <ChevronDown className="w-5 h-5 text-zinc-500" strokeWidth={2.2} />
        </button>
        <div className="px-5 pb-7">
          <h3 className="text-zinc-900 text-[16px] font-semibold tracking-tight text-center">Who do you want to challenge?</h3>
          <p className="text-zinc-500 text-[12px] text-center mb-4">Choose an option from this 1v1</p>

          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'a', sd: sideA, ring: 'ring-purple-500', dot: '#A855F7', label: 'Option A' },
              { key: 'b', sd: sideB, ring: 'ring-blue-500', dot: '#3B82F6', label: 'Option B' },
            ].map(({ key, sd, ring, dot, label }) => (
              <button
                key={key}
                onClick={() => {
                  setChallengePickOpen(false)
                  onChallenge?.({
                    postId: post.id,
                    videoUrl: sd.videoUrl,
                    author: sd.author || headAuthor,
                    description: sd.description || post.description,
                    music: sd.music,
                  })
                }}
                className="group flex flex-col items-center gap-2.5 active:scale-[0.98] transition-all"
              >
                <div className={cn('relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200 ring-2 ring-offset-2 ring-offset-white', ring)}>
                  {sd.posterUrl && (
                    <img src={sd.posterUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                  )}
                  {sd.videoUrl && (
                    <video src={sd.videoUrl + '#t=0.3'} muted autoPlay loop playsInline preload="metadata" poster={sd.posterUrl || undefined} className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  <span className="absolute top-2 left-2 z-10 text-[10px] font-bold rounded-full px-2 py-0.5 bg-black/55 backdrop-blur" style={{ color: dot }}>{label}</span>
                </div>
                <span className="text-zinc-900 text-[13px] font-semibold leading-tight text-center line-clamp-1">
                  {sd.author?.name || (sd.author?.username ? `@${sd.author.username}` : label)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

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
        winnerImage={isGeneratedAvatar(chosenSide.author?.avatarUrl) ? null : chosenSide.author?.avatarUrl}
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

export default memo(DuetSlide)
