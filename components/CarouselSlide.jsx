'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Bookmark, Play, Swords, MoreVertical, Music } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import { cn } from '@/lib/utils'
import VoteIcon from './icons/VoteIcon'
import VoteBurstEffect from './VoteBurstEffect'
import CaptionText from './CaptionText'
import VSWinnerCard from './VSWinnerCard'
import CommentsModal from './CommentsModal'
import ShareModal from './ShareModal'
import OptionsModal from './OptionsModal'
import AuthModal from './AuthModal'
import Avatar, { isGeneratedAvatar } from './Avatar'
import QuickCommentInput from './QuickCommentInput'
import CommentOrViewsBar from './CommentOrViewsBar'
import { useAuth } from '@/contexts/AuthContext'
import { pickQuality, reportStall } from '@/lib/networkQuality'
import { emitCommentCountChange } from '@/lib/commentCountBus'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

// Reserva de espacio para la barra de "Añadir comentario" (QuickCommentInput):
// altura aproximada de su propia píldora/paddings + su safe-area-bottom. La
// barra de navegación inferior se OCULTA por completo en este visor (ver
// showCommentInput / ProfilePage.jsx -> Feed.jsx), así que el único elemento
// a despejar es esta barra — un margen pequeño y fijo por elemento (no los
// antiguos 64-80px, pensados para otra barra que ya no está presente).
const COMMENT_BAR_RESERVE = '58px + max(env(safe-area-inset-bottom, 0px), 12px)'

/**
 * CarouselSlide — publicación "versus": carrusel horizontal de 2 vídeos (A / B).
 * Se ve un vídeo a la vez y se desliza horizontalmente entre A y B (con puntitos).
 * Se vota tocando directamente el vídeo (toca = vota la opción visible).
 * La UI (cabecera + columna social) es la misma que la de un vídeo normal.
 */
function CarouselSlide({ post, isActive, isNear, isAdjacent, warm = false, muted: globalMuted, playbackEnabled = true, onRequestNext, onChallenge, onOpenProfile, onNotInterested, infoBottom = false, hideChallenge = false, showCommentInput = false, viewsCount = null }) {
  const { user } = useAuth()
  const overlayRef = useRef(null)
  const videoARef = useRef(null)
  const videoBRef = useRef(null)
  const rafRef = useRef(0)
  const downRef = useRef({ x: 0, y: 0, t: 0 })
  const lastTapRef = useRef(0)
  const audioRef = useRef(null)
  const swipedRef = useRef(false)
  // Token del estado WARM: invalida el pause() diferido del prime si la tarjeta
  // pasa a activa antes de que resuelva (evita pausar el vídeo ya en reproducción).
  const warmRef = useRef(null)

  const [sideIdx, setSideIdx] = useState(0) // 0 = A, 1 = B
  const [paused, setPaused] = useState(false)
  // BUG FIX ("cuando me topo con una publicación que no ha cargado se queda
  // en negro, debe mostrar un spinner"): antes NINGÚN estado seguía si el
  // <video> estaba bufferizando — `onWaiting` solo llamaba a reportStall()
  // (para la estimación de calidad de red), sin ningún indicador visual. Si
  // la publicación no tenía poster/imagen (o aún no había cargado) y el
  // vídeo tardaba en bufferizar, la pantalla se quedaba lisa en negro, sin
  // ninguna señal de que algo se estuviera cargando (indistinguible de un
  // fallo). Réplica del mismo patrón que DuetSlide.jsx ya usa (loadedA/loadedB
  // vía onWaiting/onCanPlay/onLoadedData), aplicado aquí al lado VISIBLE.
  const [buffering, setBuffering] = useState(false)
  const [progress, setProgress] = useState(0)
  // Arrastrar/tocar la barra de progreso para adelantar/retroceder — la línea
  // se engrosa mientras se toca (grosor "actual" pedido por el usuario, 2px)
  // y vuelve a ser fina (1px) en reposo.
  const [scrubbing, setScrubbing] = useState(false)
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

  // BUG FIX ("el contador de comentarios debe mostrarse siempre, sin abrir el
  // modal"): cada vez que `commentCount` cambia de verdad (comentar, borrar,
  // o al abrir/cerrar el modal de comentarios), se avisa al ancestro que
  // posee el array `posts` (useFeed.js/ProfilePage.jsx/CompletedBattlesPage.jsx)
  // para que lo recuerde ahí también — así, si esta tarjeta se desmonta por
  // virtualización del scroll y se vuelve a montar más tarde en la MISMA
  // sesión, arranca ya con el número correcto (ver lib/commentCountBus.js).
  useEffect(() => {
    emitCommentCountChange(post.id, commentCount)
  }, [commentCount, post.id])

  // Contador de "reproducciones" (stats.views): se registra en el backend
  // SOLO con VER la publicación (isActive=true), en CUALQUIER contexto donde
  // se renderice esta tarjeta (feed principal, Batallas>Completados, visor
  // del perfil propio/ajeno) — sin requerir ninguna acción del usuario.
  // Dedup por post.id con un ref (evita contar de más si isActive parpadea
  // true/false/true sin cambiar de publicación, p.ej. al abrir un overlay).
  const viewedIdRef = useRef(null)
  useEffect(() => {
    if (!isActive || viewedIdRef.current === post.id) return
    viewedIdRef.current = post.id
    fetch('/api/post-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id }),
      keepalive: true,
    }).catch(() => {})
  }, [isActive, post.id])

  // Al montar: fusiona los contadores persistidos del usuario y escucha el
  // evento global 'twyk:challenged' para incrementar "Retar" en la tarjeta cuyo
  // postId coincida (el reto se crea en un diálogo global del Feed).
  // BUG FIX ("el contador de comentarios"): `commentCount` ya NO se fusiona con
  // localStorage — el backend (refreshPostCommentCounts, route.js) recalcula
  // `post.stats.comments` con el conteo REAL en cada carga del feed/perfil, así
  // que este valor inicial YA es exacto. La antigua fusión `Math.max(c,
  // lsNum(...))` solo podía SUBIR el número (nunca bajarlo), así que si un
  // comentario se borraba (por el autor o el dueño del post), el contador se
  // quedaba atascado en el valor más alto ya cacheado en localStorage para
  // siempre, sin importar cuántas veces se recargara. shares/saves/challenges
  // SÍ siguen usando localStorage (el backend no recalcula esos contadores).
  useEffect(() => {
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

  const sideA = post.sideA || { videoUrl: post.videoUrl, posterUrl: post.posterUrl || post.thumbnailUrl, imageUrl: post.imageUrl, mediaType: post.mediaType, author: post.author, description: post.description, music: post.music }
  const sideB = post.sideB || { videoUrl: post.videoUrl, posterUrl: post.posterUrl || post.thumbnailUrl, imageUrl: post.imageUrl, mediaType: post.mediaType, author: post.author, description: '', music: '' }
  const current = sideIdx === 0 ? sideA : sideB
  const headAuthor = current.author || post.author || {}
  // Reto 1vs1: cabecera con los DOS creadores (avatar + nombre de cada lado)
  const authorA = sideA.author || post.author || {}
  const authorB = sideB.author || post.author || {}
  // El "vs" se ubica junto al nombre MÁS CORTO de los dos (arriba si el corto
  // es A, abajo si el corto es B), para no forzar el recorte del nombre largo.
  const shortNameIsA = (authorA.username || authorA.name || '').length <= (authorB.username || authorB.name || '').length
  // Música adjunta (preview de iTunes, 30s). Si existe, el vídeo va en mute y
  // suena la música; respeta el toggle global de sonido del feed.
  const hasMusic = !!post.musicPreviewUrl
  // Audio realmente sonando ahora mismo (música O el propio vídeo sin mute):
  // misma condición que controla el play() del audio/vídeo más abajo. Las
  // ondas del disco solo deben animarse mientras esto sea true. Si hay
  // música adjunta, su <audio> es independiente del tap de play/pausa del
  // vídeo (por eso NO se corta con `paused`); si el audio es el del propio
  // vídeo, sí debe detenerse en cuanto el usuario lo pausa.
  // BUG FIX: al abrir el modal de login/registro (authModalOpen, se abre al
  // votar/seguir/comentar/retar sin sesión) el audio/vídeo de la publicación
  // seguía escuchándose de fondo. Se añade !authModalOpen a la condición.
  const isAudioPlaying = isActive && playbackEnabled && !showWinner && !authModalOpen && !globalMuted && (hasMusic || !paused)

  // Sincroniza el estado de seguimiento con el dato del servidor
  // (headAuthor.isFollowing) para que "Following" persista tras recargar y al
  // reciclarse la tarjeta en la ventana del feed.
  useEffect(() => {
    setFollowing(!!headAuthor?.isFollowing)
  }, [headAuthor?.username, headAuthor?.isFollowing])

  // ¿La publicación es del usuario actual? El dueño se identifica por author.id
  // (las subidas guardan author.id = user.id) o por userId. Si lo es, el menú de
  // "tres puntos" muestra opciones de dueño (eliminar) en vez de reportar/bloquear.
  const isOwner = !!user && ((post?.author?.id && post.author.id === user.id) || (post?.userId && post.userId === user.id))

  // FASE 2: calidad adaptativa a la red (fallback al videoUrl si no hay renditions).
  const srcA = useMemo(() => pickQuality(sideA.qualities, sideA.videoUrl), [sideA.qualities, sideA.videoUrl])
  const srcB = useMemo(() => pickQuality(sideB.qualities, sideB.videoUrl), [sideB.qualities, sideB.videoUrl])

  // Restaurar voto previo — la clave incluye el ID del usuario (antes solo
  // usaba post.id): BUG reportado ("el usuario ajeno debe votar la opción que
  // el propietario no votó para que el voto funcione") causado porque el
  // voto se guardaba SOLO por post.id en localStorage, así que en el MISMO
  // navegador, el voto de una cuenta se leía como "ya votado" al entrar con
  // otra cuenta distinta (el toque en la MISMA opción quedaba como no-op y el
  // toque en la OTRA opción se enviaba como un "cambio" que además restaba el
  // voto real del primer usuario). Al cambiar de cuenta sin voto propio
  // guardado, se limpia el estado en vez de dejar el de la cuenta anterior.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserVote(null)
      return
    }
    try {
      const v = localStorage.getItem(`versus_vote_${post.id}_${user.id}`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserVote(v === 'a' || v === 'b' ? v : null)
    } catch { /* ignore */ }
  }, [post.id, user?.id])

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
        vis.muted = hasMusic ? true : globalMuted
        // BUG FIX: si el modal de login/registro está abierto (authModalOpen),
        // pausar igual que con la winner card -mismo patrón, sin soltar el
        // decoder- para que el audio de la publicación no se siga escuchando
        // mientras el usuario está iniciando sesión/registrándose.
        if (showWinner || authModalOpen) {
          try { vis.pause() } catch { /* ignore */ }
        } else {
          const p = vis.play()
          if (p && p.catch) p.catch(() => { try { vis.muted = true; vis.play().catch(() => {}) } catch { /* ignore */ } })
        }
      }
    } else if (warm && playbackEnabled) {
      // BUGFIX: al RETROCEDER a la publicación anterior, esta misma tarjeta
      // pasa de isActive=true directamente a warm=true (warm = i ===
      // activeIndex+1 relativo al NUEVO índice), sin pasar por el estado
      // "inactiva". El precalentado (warm) SOLO gestiona el lado A
      // (videoARef) — si el usuario se había quedado viendo/escuchando la
      // opción B (sideIdx=1), ese vídeo B quedaba huérfano reproduciéndose
      // (con su audio) para siempre, solapado con la publicación nueva. Hay
      // que liberar el lado VISIBLE (vis) si no es ya el A antes de precargar A.
      if (vis && vis !== videoARef.current) release(vis)
      const token = {}
      warmRef.current = token
      const va = videoARef.current
      acquire(va, srcA)
      primeWarm(va, token)
    } else {
      warmRef.current = null
      release(vis)
    }
  }, [isActive, playbackEnabled, warm, sideIdx, globalMuted, srcA, srcB, showWinner, authModalOpen, acquire, release, primeWarm])

  // Reproducción de la MÚSICA adjunta (preview iTunes). Suena cuando la tarjeta
  // está activa y el feed no está en mute; en mute o al salir, se pausa. El
  // navegador solo permite audio audible tras la 1ª interacción del usuario
  // (igual que el unmute del vídeo), por eso respetamos globalMuted.
  useEffect(() => {
    const a = audioRef.current
    if (!a || !hasMusic) return
    const shouldPlay = isActive && playbackEnabled && !showWinner && !authModalOpen && !globalMuted
    if (shouldPlay) {
      a.muted = false
      const p = a.play()
      if (p && p.catch) p.catch(() => {})
    } else {
      try { a.pause() } catch { /* ignore */ }
      if (!isActive) { try { a.currentTime = 0 } catch { /* ignore */ } }
    }
  }, [isActive, playbackEnabled, showWinner, authModalOpen, globalMuted, hasMusic])


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

  // Burst del icono de voto: aparece justo DONDE tocaste (un poco por encima),
  // con el color del lado (A lila / B azul). Sin punto -> centrado. Es SOLO la
  // animación visual (estilo TikTok/Instagram): se dispara en cada doble-tap,
  // tanto si es el primer voto como si el usuario ya votó antes.
  const spawnVoteBurst = useCallback((s, pt) => {
    const burstColor = s === 'a' ? '#A855F7' : '#3B82F6'
    const burstId = Math.random().toString(36).slice(2)
    setVoteBursts((b) => [...b, { id: burstId, color: burstColor, x: pt?.x, y: pt?.y }])
    setTimeout(() => setVoteBursts((b) => b.filter((x) => x.id !== burstId)), 900)
  }, [])

  // Arrastrar/tocar la barra de progreso para adelantar/retroceder el vídeo
  // VISIBLE (mismo vídeo que alimenta la barra, ver getVisible()).
  const seekFromClientX = useCallback((clientX, el) => {
    const vis = getVisible()
    if (!vis || !(vis.duration > 0) || !el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    try { vis.currentTime = ratio * vis.duration } catch { /* ignore */ }
    setProgress(ratio * 100)
  }, [getVisible])

  const handleProgressPointerDown = useCallback((e) => {
    e.stopPropagation()
    setScrubbing(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    seekFromClientX(e.clientX, e.currentTarget)
  }, [seekFromClientX])

  const handleProgressPointerMove = useCallback((e) => {
    if (!scrubbing) return
    e.stopPropagation()
    seekFromClientX(e.clientX, e.currentTarget)
  }, [scrubbing, seekFromClientX])

  const handleProgressPointerEnd = useCallback((e) => {
    e.stopPropagation()
    setScrubbing(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }, [])

  const submitVote = useCallback(async (s, pt) => {
    // Verificar autenticación
    if (!user) {
      setAuthModalOpen(true)
      return
    }

    if (voting) return
    // Re-tocar la MISMA opción ya votada: no hay cambio (el burst visual ya se
    // dispara aparte, ver onPointerUp), no reenviamos nada al servidor.
    if (userVote === s) return
    const prevVote = userVote // null en el primer voto; 'a'|'b' si se está CAMBIANDO de opción
    setVoting(true)
    setUserVote(s)
    setVotes((v) => {
      const next = { ...v }
      if (prevVote && prevVote !== s) next[prevVote] = Math.max(0, (next[prevVote] || 0) - 1)
      next[s] = (next[s] || 0) + 1
      return next
    })
    spawnVoteBurst(s, pt)
    // Mostrar la tarjeta de ganador después de la animación del icono
    setTimeout(() => setShowWinner(true), 650)
    try { localStorage.setItem(`versus_vote_${post.id}_${user.id}`, s) } catch { /* ignore */ }
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, side: s, previousSide: prevVote || undefined }),
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
      const rect = overlayRef.current?.getBoundingClientRect()
      const pt = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null
      if (userVote !== side) {
        // Sin voto previo -> primer voto. Con voto previo en la OTRA opción
        // (estás viendo el lado contrario al que votaste) -> CAMBIA el voto a
        // este lado (resta al anterior, suma a este, ver submitVote).
        submitVote(side, pt)
      } else {
        // Re-tocar la MISMA opción ya votada: el voto no cambia, pero la
        // animación del icono debe seguir apareciendo en cada doble-tap,
        // igual que el corazón de TikTok/Instagram al volver a dar doble toque.
        spawnVoteBurst(side, pt)
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
  }, [side, userVote, endDrag, doLike, submitVote, spawnVoteBurst, getVisible])

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
  // BUG FIX: en publicaciones normales (type='versus') y 1vs1 (type='duet'),
  // sideA y sideB pertenecen SIEMPRE al MISMO autor (son 2 opciones de la
  // misma persona, no un reto real entre 2 usuarios) -> mostrar "vs {mismo
  // nombre}" en la winner card es una redundancia sin sentido. Solo en un
  // reto ACEPTADO (post.isChallenge===true) sideA/sideB son autores distintos
  // y esa línea sí aporta información real.
  const sameAuthorBothSides = !!(chosenSide.author?.username && chosenSide.author?.username === otherSide.author?.username)
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
          onCanPlay={() => setBuffering(false)}
          onPlaying={() => setBuffering(false)}
          onLoadedData={() => setBuffering(false)}
          onWaiting={() => { setBuffering(true); reportStall() }}
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

      {/* Pista para votar / cambiar de opción */}
      {!userVote && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Swipe to compare · double-tap to vote
        </div>
      )}
      {userVote && userVote !== side && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Double-tap to switch your vote
        </div>
      )}

      {/* play overlay */}
      {paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <Play size={72} className="text-white drop-shadow-lg" fill="white" />
        </div>
      )}

      {/* Spinner de carga: se ve mientras el vídeo del lado visible está
          bufferizando (antes la pantalla se quedaba lisa en negro, sin
          ninguna señal de carga, si esa publicación aún no tenía datos). */}
      {buffering && isActive && !showWinner && !paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border-2 border-white/25 border-t-white animate-spin" />
        </div>
      )}

      {/* burst del icono de voto al votar — aparece justo DONDE tocaste (un poco
          por encima) y con su color (A lila / B azul). Sin coords -> centrado. */}
      {voteBursts.map((vb) => (
        vb.x != null && vb.y != null ? (
          <div
            key={vb.id}
            className="absolute z-30 pointer-events-none"
            style={{ left: vb.x, top: vb.y, transform: 'translate(-50%, -60px)' }}
          >
            <VoteBurstEffect color={vb.color} />
          </div>
        ) : (
          <div key={vb.id} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <VoteBurstEffect color={vb.color} />
          </div>
        )
      ))}

      {/* Header — avatar + nombre (estilo Twyk). Arriba por defecto; abajo si infoBottom. */}
      <div
        className={cn(
          'absolute z-20 px-4 pointer-events-none',
          infoBottom
            ? `left-0 right-16 ${showCommentInput ? '' : 'bottom-20'} pt-10`
            : 'top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent pb-10'
        )}
        style={
          infoBottom
            ? (showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 10px)` } : undefined)
            : { paddingTop: 'max(1rem, env(safe-area-inset-top))' }
        }
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
              <div className="flex flex-col min-w-0 leading-tight">
                {/* Nombres completos (sin truncar); el "vs" se coloca junto al
                    nombre más corto: arriba DESPUÉS del nombre, abajo ANTES. */}
                <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(authorA.username) }} className="text-white font-semibold text-[14px] drop-shadow-md whitespace-nowrap cursor-pointer">
                  {authorA.username || authorA.name}
                  {shortNameIsA && <span className="font-light"> vs</span>}
                </span>
                <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(authorB.username) }} className="text-white font-semibold text-[14px] drop-shadow-md whitespace-nowrap cursor-pointer">
                  {!shortNameIsA && <span className="font-light">vs </span>}
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
              'shrink-0 px-3 py-1 rounded-full border text-[13px] font-medium transition-all duration-200 active:scale-95',
              following ? 'border-white/90 text-white' : 'border-white/90 text-white'
            )}
          >
            {following ? 'Following' : 'Follow'}
          </button>
        </div>
        <div className="mt-1 pointer-events-auto">
          <CaptionText text={current.description || post.description} className="text-white text-sm leading-tight" />
        </div>
      </div>
      {hasMusic && (
        <audio ref={audioRef} src={post.musicPreviewUrl} loop preload="none" />
      )}

      {/* Columna social derecha — estilo Twyk (abajo) */}
      <div
        className="absolute z-20 right-1 flex flex-col items-center gap-4 pointer-events-auto"
        style={showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 6px)` } : { bottom: 72 }}
      >
        <button aria-label="votes" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <span style={{ color: userVote === 'a' ? '#A855F7' : userVote === 'b' ? '#3B82F6' : '#fff', display: 'inline-flex', transition: 'color 200ms' }}>
            <VoteIcon className="w-[40px] h-[40px]" strokeWidth={210} filled={!!userVote} />
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
            onChallenge?.({ postId: post.id, mediaType: current.mediaType, videoUrl: current.videoUrl, imageUrl: current.imageUrl, posterUrl: current.posterUrl, author: headAuthor, description: current.description || post.description, music: current.music || post.music, luxuryThemeId: post.luxuryThemeId || null, luxuryTheme: post.luxuryTheme || null });
          }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
            <Swords className="w-[30px] h-[30px] text-white" strokeWidth={1.25} />
            <span className={`${challengeCount > 0 ? 'text-[9px] font-semibold' : 'text-[8px] font-bold'} max-w-[30px] overflow-hidden text-white leading-none text-center whitespace-nowrap`}>{countLabel(challengeCount, 'Be 1st')}</span>
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
          <span className={`${commentCount > 0 ? 'text-[9px] font-semibold' : 'text-[8px] font-bold'} max-w-[30px] overflow-hidden text-white leading-none text-center whitespace-nowrap`}>{countLabel(commentCount, 'Add 1st')}</span>
        </button>
        <button aria-label="share" onClick={(e) => { e.stopPropagation(); setShareOpen(true) }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <ShareIcon className="w-[30px] h-[30px] text-white" strokeWidth={1.4} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(shareCount, 'Share')}</span>
        </button>
        <button aria-label="bookmark" onClick={handleSaveToggle} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={cn('w-[30px] h-[30px] transition-all duration-200', saved ? 'fill-current text-yellow-400' : 'text-white')} strokeWidth={1.25} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(saveCount, 'Save')}</span>
        </button>
        <button aria-label="mas-opciones" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MoreVertical className="w-[18px] h-[18px] text-white" strokeWidth={1.25} fill="currentColor" />
        </button>
        {/* Disco de música (estilo TikTok) — círculo NORMAL completo (sin
            agujero ni surcos de vinilo, a petición del usuario: "el
            reproductor debe ser normal, no un disco de vinilo, un círculo
            completo"). Sigue GIRANDO mientras se reproduce audio/música (se
            detiene, sin resetear el ángulo, en pausa) — solo cambia el
            aspecto, no el comportamiento. */}
        <div className="relative mt-1 w-10 h-10 shrink-0">
          <div
            aria-label="music"
            title={hasMusic ? [post.musicTitle, post.musicArtist].filter(Boolean).join(' · ') : undefined}
            className="vinyl-spin relative w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center"
            style={{ animationPlayState: isAudioPlaying ? 'running' : 'paused' }}
          >
            {hasMusic ? (
              post.musicArtwork ? (
                <img src={post.musicArtwork} alt="" className="w-full h-full object-cover" />
              ) : (
                <Music size={16} className="text-white" />
              )
            ) : (current.posterUrl || current.imageUrl || post.posterUrl || post.thumbnailUrl) ? (
              <img src={current.posterUrl || current.imageUrl || post.posterUrl || post.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Avatar src={headAuthor.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
            )}
            {/* Viñeta interior sutil para dar profundidad al círculo */}
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: 'inset 0 0 5px 1px rgba(0,0,0,0.55)' }} />
          </div>
        </div>
      </div>

      {/* Menú "Más opciones" (hoja inferior estilo Instagram) */}
      <OptionsModal
        open={menuOpen}
        postId={post.id}
        author={headAuthor}
        isOwner={isOwner}
        onClose={() => setMenuOpen(false)}
        onNotInterested={onNotInterested}
      />

      {/* Puntitos del carrusel */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-1"
        style={showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 2px)` } : { bottom: 70 }}
      >
        {[0, 1].map((i) => (
          <button
            key={i}
            aria-label={`opción ${i === 0 ? 'A' : 'B'}`}
            onClick={(e) => { e.stopPropagation(); goTo(i) }}
            className={cn('rounded-full transition-all duration-200', sideIdx === i ? 'w-4 h-[3px] bg-white' : 'w-[3px] h-[3px] bg-white/40')}
          />
        ))}
      </div>

      {/* Barra de progreso del vídeo — línea FINA en reposo (1px) que se
          engrosa al grosor "actual" pedido por el usuario (2px) mientras se
          toca/arrastra para adelantar o retroceder. El hit-area (16px) es
          más alta que la línea visible para que sea fácil de agarrar con el
          dedo sin desplazar la posición visual de la línea (centrada dentro
          del hit-area, en el mismo sitio de siempre).
          BUG reportado ("no debe aparecer en publicaciones con imágenes"):
          antes solo comprobaba `current.mediaType !== 'image'`, que puede
          quedar `undefined` (ni 'video' ni 'image') según el origen del
          post — se añade `&& current.videoUrl` como segunda comprobación:
          solo se muestra si de verdad hay un vídeo que reproducir. */}
      {current.mediaType !== 'image' && current.videoUrl && (
        <div
          className="absolute left-0 right-0 z-20 flex items-center cursor-pointer"
          style={{
            height: 16,
            touchAction: 'none',
            ...(showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} - 9px)` } : { bottom: 57 }),
          }}
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerEnd}
          onPointerCancel={handleProgressPointerEnd}
        >
          <div className={cn('w-full bg-white/15 transition-[height] duration-150', scrubbing ? 'h-[2px]' : 'h-[1px]')}>
            <div className="h-full bg-white/80" style={{ width: `${progress}%`, transform: 'translateZ(0)' }} />
          </div>
        </div>
      )}

      {/* Barra de "Añadir comentario" — solo cuando se abre desde el grid del
          perfil (propio o ajeno), NO en el feed principal (ver showCommentInput).
          Se posiciona JUSTO ENCIMA de BottomNav (que sigue visible, z-50, mismo
          criterio que el feed principal), no debajo (quedaría oculta).
          En el PROPIO perfil (viewsCount != null) esta barra ALTERNA con una de
          "reproducciones" (ver CommentOrViewsBar.jsx); en perfil ajeno se
          mantiene exactamente igual que antes (solo comentar, sin alternar). */}
      {showCommentInput && (
        viewsCount != null ? (
          <CommentOrViewsBar
            postId={post.id}
            votedSide={userVote}
            onPosted={() => setCommentCount((n) => n + 1)}
            onRequireAuth={() => setAuthModalOpen(true)}
            views={viewsCount}
          />
        ) : (
          <QuickCommentInput
            postId={post.id}
            votedSide={userVote}
            onPosted={() => setCommentCount((n) => n + 1)}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )
      )}

      {/* Winner card — aparece automáticamente tras votar */}
      <VSWinnerCard
        visible={showWinner}
        winnerSide={chosenKey}
        winnerName={chosenName}
        winnerPercentage={chosenPct}
        winnerImage={chosenIsImage ? (chosenSide.posterUrl || chosenSide.imageUrl) : (isGeneratedAvatar(chosenSide.author?.avatarUrl) ? null : chosenSide.author?.avatarUrl)}
        winnerVideoUrl={chosenIsImage ? null : chosenSrc}
        loserName={sameAuthorBothSides ? '' : otherName}
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
        onCountChange={setCommentCount}
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
