'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swords, Play, MessageCircle, Bookmark, MoreVertical, Music, Heart } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import Avatar from './Avatar'
import CaptionText from './CaptionText'
import CommentsModal from './CommentsModal'
import ShareModal from './ShareModal'
import OptionsModal from './OptionsModal'
import AuthModal from './AuthModal'
import QuickCommentInput from './QuickCommentInput'
import CommentOrViewsBar from './CommentOrViewsBar'
import HeartBurstEffect from './HeartBurstEffect'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

// Reserva de espacio para la barra de "Añadir comentario" (QuickCommentInput)
// cuando esta tarjeta se abre desde el visor del grid del perfil (propio o
// ajeno) — MISMA constante que usan CarouselSlide.jsx/DuetSlide.jsx, para
// que el header y la columna social reserven exactamente el mismo hueco.
const COMMENT_BAR_RESERVE = '58px + max(env(safe-area-inset-bottom, 0px), 12px)'

/**
 * OpenChallengeSlide — tarjeta de un RETO ABIERTO ("a todos") dentro del feed
 * principal. Es una publicación de UN SOLO vídeo/foto, visualmente idéntica a
 * cualquier otra (mismo header abajo-izquierda con avatar+seguir, misma
 * columna social derecha con comentar/compartir/guardar/más, mismo disco).
 *
 * IMPORTANTE (corregido tras feedback del usuario): "Challenge" NO publica
 * nada automáticamente. Abre EXACTAMENTE el mismo `ChallengeDialog` que el
 * botón de reto de cualquier otra publicación (mismo `onChallenge`), con el
 * contenido de este reto abierto como objetivo (target). Eso crea una
 * solicitud de reto NORMAL (from = quien la envía, to = el creador de este
 * reto abierto) que aparece en la bandeja de Retos Activos del creador para
 * que la acepte o la rechace — igual que cualquier otro reto — y SOLO al
 * aceptarla se publica el versus. El reto abierto original nunca se cierra:
 * varias personas distintas pueden enviar su propia solicitud igual, cada
 * una independiente.
 *
 * SIN VOTO A/B (petición explícita del usuario: "quitar el boton de voto de
 * las publicaciones single"): estas publicaciones no comparan 2 lados como
 * versus/1vs1 — el toque simple sobre el vídeo solo pausa/reanuda.
 *
 * BOTÓN "FIRE" 🔥 (petición del usuario: "añadir el botón fire manteniendo
 * los botones que ya están"): reacción tipo "like" con el ADN de Twyk
 * (fuego = trending/hot). Reutiliza el backend de voto único ya existente
 * para publicaciones single (toggleSingleVote / POST /api/single-vote,
 * conteo+estado hidratado vía post.voteCount/post.hasVoted en
 * getOpenChallengeFeedItems) — antes sin UI aquí; ahora vuelve a mostrarse,
 * pero como botón de fuego (no como voto A/B), SUMADO a
 * Retar/Comentarios/Compartir/Guardar/Más, sin quitar ninguno de ellos.
 * Mecánica pedida explícitamente por el usuario (asimétrica, no un simple
 * toggle): DOBLE-toque en el vídeo/foto SOLO AÑADE el fuego (addFire, nunca
 * lo quita — igual que el doble-toque de voto en CarouselSlide.jsx); tocar
 * el icono de la columna social es lo que lo QUITA (removeFire).
 */
export default function OpenChallengeSlide({
  post,
  isActive,
  warm = false,
  muted: globalMuted,
  playbackEnabled = true,
  onOpenProfile,
  onChallenge,
  onNotInterested,
  showCommentInput = false,
  viewsCount = null,
}) {
  const { user } = useAuth()
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const rafRef = useRef(0)
  // Doble-toque (mismo patrón EXACTO que CarouselSlide/DuetSlide para votar):
  // aquí se usa para dar/quitar "Fire" 🔥 sobre el propio vídeo/foto — el
  // botón de la columna social es SOLO indicador visual (igual que el icono
  // de "Vote" en las publicaciones versus, que tampoco reacciona al click,
  // ver su `onClick={(e) => e.stopPropagation()}`), la acción real es el
  // doble-toque, para mantener el mismo "ADN" (gesto) en toda la app.
  const lastTapRef = useRef(0)
  // BUG reportado por el usuario ("en el feed tengo 3 publicaciones single
  // pero no puedo hacer scrolling"): a diferencia de CarouselSlide.jsx/
  // DuetSlide.jsx (que registran onPointerDown/onPointerMove y comparan la
  // distancia recorrida antes de decidir si un onPointerUp fue un TOQUE real
  // o el final de un ARRASTRE/SWIPE de scroll, ver su guard `Math.abs(dx) >
  // 12 || Math.abs(dy) > 12`), esta tarjeta solo escuchaba `onPointerUp` -
  // que el navegador dispara SIEMPRE al soltar el dedo, incluso al final de
  // un gesto de scroll vertical normal sobre el feed, sin importar cuánto se
  // haya desplazado el dedo. Resultado: cada vez que el usuario deslizaba
  // (scrolleaba) sobre una publicación única, esta tarjeta lo interpretaba
  // como un toque -pausando/reanudando el vídeo- interfiriendo con el gesto
  // de scroll del usuario justo en las tarjetas de este tipo.
  const downRef = useRef({ x: 0, y: 0 })
  const [paused, setPaused] = useState(false)
  // Barra de progreso del vídeo (petición del usuario: "la linea de
  // progreso del publicaciones con video tiene que estar abajo") — antes
  // esta tarjeta (a diferencia de CarouselSlide.jsx/DuetSlide.jsx) no
  // tenía ninguna. Mismo mecanismo EXACTO que esas 2 (requestAnimationFrame
  // sobre videoRef.current mientras isActive, tocar/arrastrar para
  // adelantar/retroceder), posicionada abajo igual que en ellas.
  const [progress, setProgress] = useState(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [following, setFollowing] = useState(!!post.author?.isFollowing)
  const [commentCount, setCommentCount] = useState(post.stats?.comments || 0)
  const [shareCount, setShareCount] = useState(post.stats?.shares || 0)
  const [saveCount, setSaveCount] = useState(post.stats?.saves || 0)
  const [saved, setSaved] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // "Fire" 🔥 — reacción tipo "like" con el ADN de Twyk (fuego = trending/hot),
  // PEDIDA por el usuario como el único botón social NUEVO a añadir, sin
  // quitar ninguno de los ya existentes. Reutiliza el backend de voto único
  // ya construido para publicaciones single (toggleSingleVote /
  // /api/single-vote) — antes sin UI aquí (el botón de voto se había ocultado
  // a petición del usuario); ahora se muestra de nuevo, pero como "Fire" en
  // vez de "Vote", y el conteo/estado inicial viene hidratado por el feed
  // (post.voteCount / post.hasVoted, ver getOpenChallengeFeedItems).
  const [hasFire, setHasFire] = useState(!!post.hasVoted)
  const [fireCount, setFireCount] = useState(post.voteCount || 0)
  const [fireBursts, setFireBursts] = useState([])

  // Contador de "reproducciones" (stats.views) — BUG FIX ("en las
  // publicaciones single las reproducciones/visitas se quedan en 0"): a
  // diferencia de CarouselSlide.jsx/DuetSlide.jsx (que SÍ registran cada
  // vista real vía POST /api/post-view desde siempre), esta tarjeta NUNCA
  // llamaba a ese endpoint — el contador solo podía subir si ALGUIEN la
  // veía desde la app nativa (que sí lo intentaba, aunque hasta este mismo
  // fix el backend tampoco sabía guardarlo para este tipo de publicación,
  // ver handlePostView/incrementSingleView en route.js/lib/db.js). Réplica
  // EXACTA del mismo mecanismo ya usado en CarouselSlide.jsx: dedupe por
  // post.id con un ref (evita contar de más si `isActive` parpadea sin
  // cambiar de publicación), se dispara con solo VER la tarjeta activa, en
  // cualquier contexto (feed principal o visor del grid del perfil), sin
  // requerir ninguna acción del usuario.
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

  const lsNum = (k) => { try { return parseInt(localStorage.getItem(k) || '0', 10) || 0 } catch { return 0 } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)) } catch { /* ignore */ } }
  useEffect(() => {
    setShareCount((c) => Math.max(c, lsNum(`shrN_${post.id}`)))
    setSaveCount((c) => Math.max(c, lsNum(`savN_${post.id}`)))
  }, [post.id])
  useEffect(() => { setFollowing(!!post.author?.isFollowing) }, [post.author?.username, post.author?.isFollowing])

  // Sincroniza "Fire" con el dato hidratado por el servidor (post.hasVoted/
  // post.voteCount) para que persista tras recargar y al reciclarse la
  // tarjeta en la ventana virtualizada del feed — mismo patrón que `following`.
  useEffect(() => {
    setHasFire(!!post.hasVoted)
    setFireCount(post.voteCount || 0)
  }, [post.id, post.hasVoted, post.voteCount])

  // "Allow challenge" (petición del usuario: poder activar/desactivar el
  // botón de retar ⚔️ en las publicaciones tipo "Your post") — hidratado por
  // el servidor (post.allowChallenge, ver getOpenChallengeFeedItems) y
  // editable después de publicada por el propio dueño desde el menú "⋮"
  // (ver challengeToggle más abajo). Por defecto true.
  const [allowChallenge, setAllowChallenge] = useState(post.allowChallenge !== false)
  useEffect(() => { setAllowChallenge(post.allowChallenge !== false) }, [post.id, post.allowChallenge])

  const isImage = post.mediaType === 'image'
  const mediaUrl = isImage ? post.imageUrl : post.videoUrl
  const headAuthor = post.author || {}
  const isOwnChallenge = !!user?.username && user.username === headAuthor?.username

  // Llama al backend para persistir el cambio (POST /api/challenges/:id/
  // allow-toggle, ver route.js) — optimista, revierte si falla. `post.
  // challengeId` es el id REAL del reto en la colección `challenges` (el id
  // de la tarjeta, `post.id`, es el sintético `open_<challengeId>`).
  const handleToggleAllowChallenge = useCallback(async (next) => {
    setAllowChallenge(next)
    try {
      const res = await fetch(`/api/challenges/${encodeURIComponent(post.challengeId)}/allow-toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow: next }),
      })
      if (!res.ok) throw new Error('failed')
      const d = await res.json().catch(() => null)
      if (d && typeof d.allowChallenge === 'boolean') setAllowChallenge(d.allowChallenge)
    } catch {
      setAllowChallenge(!next)
    }
  }, [post.challengeId])

  // Acquire/release del decoder — mismo principio que el resto del feed
  // (Regla #2): solo la tarjeta activa (o la siguiente, en WARM) retiene un
  // <video> con src real; el resto se libera para no agotar decodificadores.
  useEffect(() => {
    const el = videoRef.current
    if (!el || isImage || !mediaUrl) return
    if ((isActive || warm) && playbackEnabled) {
      if (el.getAttribute('src') !== mediaUrl) {
        el.setAttribute('src', mediaUrl)
        try { el.load() } catch { /* ignore */ }
      }
      if (isActive) {
        el.muted = globalMuted
        const p = el.play()
        if (p && p.catch) p.catch(() => { try { el.muted = true; el.play().catch(() => {}) } catch { /* ignore */ } })
      } else {
        try { el.pause() } catch { /* ignore */ }
      }
    } else {
      try { el.pause() } catch { /* ignore */ }
      if (el.getAttribute('src') !== null) {
        el.removeAttribute('src')
        try { el.load() } catch { /* ignore */ }
      }
    }
  }, [isActive, warm, playbackEnabled, globalMuted, isImage, mediaUrl])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el || isImage) return
    if (el.paused) el.play().catch(() => {}); else el.pause()
  }, [isImage])

  // Actualiza la barra de progreso en cada frame mientras esta tarjeta está
  // activa (mismo patrón que CarouselSlide.jsx/DuetSlide.jsx).
  useEffect(() => {
    if (!isActive || isImage) { cancelAnimationFrame(rafRef.current); return }
    const tick = () => {
      const el = videoRef.current
      if (el && el.duration > 0) setProgress((el.currentTime / el.duration) * 100)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, isImage])

  // Arrastrar/tocar la barra de progreso para adelantar/retroceder — mismo
  // mecanismo EXACTO que CarouselSlide.jsx/DuetSlide.jsx.
  const seekFromClientX = useCallback((clientX, el) => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    try { video.currentTime = ratio * video.duration } catch { /* ignore */ }
    setProgress(ratio * 100)
  }, [])

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

  // Burst del icono de fuego — aparece justo DONDE se hizo doble-toque (mismo
  // patrón que spawnVoteBurst en CarouselSlide.jsx). Sin coords -> centrado.
  const spawnFireBurst = useCallback((pt) => {
    const burstId = Math.random().toString(36).slice(2)
    setFireBursts((b) => [...b, { id: burstId, x: pt?.x, y: pt?.y }])
    setTimeout(() => setFireBursts((b) => b.filter((x) => x.id !== burstId)), 900)
  }, [])

  // Llamada al backend de voto único (toggle) — helper compartido por
  // addFire/removeFire. Reconcilia con la respuesta real del servidor y
  // revierte el estado optimista si la llamada falla.
  const callSingleVote = useCallback((expectedNext) => {
    fetch('/api/single-vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: post.id }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.count === 'number') setFireCount(d.count)
        if (d && typeof d.voted === 'boolean') setHasFire(d.voted)
      })
      .catch(() => {
        setHasFire(!expectedNext)
        setFireCount((n) => Math.max(0, n + (expectedNext ? -1 : 1)))
      })
  }, [post.id])

  // AÑADIR "Fire" 🔥 — SOLO con DOBLE-toque sobre el vídeo/foto (ver
  // onMediaPointerUp), igual que el doble-toque de voto en CarouselSlide.jsx
  // (mismo "ADN"/gesto en toda la app). Petición explícita del usuario: el
  // doble-toque únicamente ENCIENDE el fuego (nunca lo apaga) — si ya estaba
  // encendido, solo repite la animación sin volver a llamar al servidor.
  const addFire = useCallback((pt) => {
    if (!user) { setAuthModalOpen(true); return }
    spawnFireBurst(pt)
    if (hasFire) return
    setHasFire(true)
    setFireCount((n) => n + 1)
    callSingleVote(true)
  }, [hasFire, user, spawnFireBurst, callSingleVote])

  // QUITAR "Fire" 🔥 — SOLO al tocar el icono en la columna social (petición
  // explícita del usuario). Si no estaba encendido, no hace nada.
  const removeFire = useCallback((e) => {
    e.stopPropagation()
    if (!user) { setAuthModalOpen(true); return }
    if (!hasFire) return
    setHasFire(false)
    setFireCount((n) => Math.max(0, n - 1))
    callSingleVote(false)
  }, [hasFire, user, callSingleVote])

  // Gestos sobre el vídeo: toque simple = play/pausa; DOBLE toque = AÑADIR
  // "Fire" 🔥 (nunca lo quita, ver addFire) — mismo patrón exacto que el
  // doble-toque de voto en CarouselSlide/DuetSlide: debounce de 280ms para
  // que el primer toque de un doble-toque no dispare también el play/pausa.
  // Se conserva el guard de distancia (dx/dy > 12px = fue un ARRASTRE/scroll,
  // no un toque) para no interferir con el scroll del feed.
  const onMediaPointerDown = useCallback((e) => {
    downRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMediaPointerUp = useCallback((e) => {
    const d = downRef.current
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    downRef.current = { x: 0, y: 0 }
    // Hubo arrastre (scroll vertical del feed, o cualquier swipe) -> no es
    // un toque real: no pausamos/reanudamos. Antes, CUALQUIER gesto de
    // scroll sobre esta tarjeta disparaba de todos modos la lógica de toque
    // de abajo (bug reportado: el scroll se sentía "atascado" al pasar por
    // una publicación única).
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return
    const now = Date.now()
    const isDouble = now - lastTapRef.current < 300
    lastTapRef.current = now
    if (isDouble) {
      const rect = overlayRef.current?.getBoundingClientRect()
      const pt = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null
      addFire(pt)
      return
    }
    setTimeout(() => {
      if (Date.now() - lastTapRef.current < 280) return
      togglePlay()
    }, 280)
  }, [togglePlay, addFire])

  const handleChallengeClick = useCallback((e) => {
    e.stopPropagation()
    if (isOwnChallenge) return
    if (!user) { setAuthModalOpen(true); return }
    onChallenge?.({
      postId: post.id,
      mediaType: post.mediaType,
      videoUrl: post.videoUrl,
      imageUrl: post.imageUrl,
      posterUrl: post.posterUrl,
      author: headAuthor,
      description: post.description,
      music: post.music,
    })
  }, [isOwnChallenge, user, onChallenge, post, headAuthor])

  const toggleFollow = useCallback((e) => {
    e.stopPropagation()
    if (!user) { setAuthModalOpen(true); return }
    const target = headAuthor?.username
    if (!target || target === user?.username) return
    setFollowing((f) => !f)
    fetch(`/api/users/${encodeURIComponent(target)}/follow`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.following === 'boolean') setFollowing(d.following) })
      .catch(() => setFollowing((f) => !f))
  }, [headAuthor?.username, user])

  const handleSaveToggle = useCallback(async (e) => {
    e.stopPropagation()
    if (!user) { setAuthModalOpen(true); return }
    const newSaved = !saved
    setSaved(newSaved)
    setSaveCount((n) => { const next = Math.max(0, n + (newSaved ? 1 : -1)); lsSet(`savN_${post.id}`, next); return next })
    try {
      await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: post.id }) })
    } catch {
      setSaved(!newSaved)
      setSaveCount((n) => Math.max(0, n + (newSaved ? -1 : 1)))
    }
  }, [post.id, saved, user])

  return (
    <div ref={overlayRef} className="relative w-full h-full bg-black overflow-hidden select-none">
      {/* Media a pantalla completa */}
      <div className="absolute inset-0" onPointerDown={onMediaPointerDown} onPointerUp={onMediaPointerUp}>
        {(post.posterUrl || (isImage && mediaUrl)) && (
          <img src={post.posterUrl || mediaUrl} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-cover" />
        )}
        {!isImage && mediaUrl && (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            loop
            playsInline
            preload="none"
            poster={post.posterUrl || undefined}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
        )}
      </div>

      {paused && !isImage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <Play size={72} className="text-white drop-shadow-lg" fill="white" />
        </div>
      )}

      {/* Barra de progreso del vídeo — línea FINA en reposo (1px) que se
          engrosa (2px) mientras se toca/arrastra para adelantar o
          retroceder. Petición REITERADA varias veces por el usuario ("tiene
          que estar abajo" / "abajo del todo" / "debajo de todo" / "Debe
          estar debajo del todo" / "debajo del todo de la publicacion") — la
          línea se alinea AL BORDE INFERIOR del hit-area (`items-end` — antes
          `items-center` la centraba verticalmente, dejando ~7px de hueco
          visual incluso con bottom:0, causa raíz real confirmada con una
          captura de pantalla del usuario) y el hit-area pegado al borde 0
          real de la publicación, sin ningún margen de diseño (a diferencia
          de CarouselSlide.jsx/DuetSlide.jsx, que originalmente sí dejaban
          10px — ya corregidos igual, ver esos archivos). Solo si hay un
          vídeo real que reproducir (nunca en publicaciones tipo foto). */}
      {!isImage && mediaUrl && (
        <div
          className="absolute left-0 right-0 z-30 flex items-end cursor-pointer"
          style={{
            height: 16,
            touchAction: 'none',
            bottom: 0,
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

      {/* Burst del icono de corazón al doble-tocar — aparece justo DONDE se
          tocó (un poco por encima); sin coords -> centrado. Mismo patrón que
          voteBursts en CarouselSlide.jsx. */}
      {fireBursts.map((fb) => (
        fb.x != null && fb.y != null ? (
          <div
            key={fb.id}
            className="absolute z-30 pointer-events-none"
            style={{ left: fb.x, top: fb.y, transform: 'translate(-50%, -60px)' }}
          >
            <HeartBurstEffect />
          </div>
        ) : (
          <div key={fb.id} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <HeartBurstEffect />
          </div>
        )
      ))}


      {/* Header — MISMA posición/estilo que el resto de publicaciones
          (abajo-izquierda): avatar + nombre + Seguir, sin ningún distintivo
          adicional. Si se abre desde el visor del grid del perfil
          (showCommentInput), se sube para dejar sitio a la barra de abajo. */}
      <div
        className={`absolute z-20 px-4 left-0 right-16 ${showCommentInput ? '' : 'bottom-8'} pt-10 pointer-events-none`}
        style={showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 10px)` } : undefined}
      >
        <div className="flex items-center gap-2.5 w-fit max-w-[calc(100%-4rem)] pointer-events-auto">
          <button onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="w-[30px] h-[30px] rounded-full overflow-hidden block shrink-0">
            <Avatar src={headAuthor.avatarUrl} alt={headAuthor.username} className="w-full h-full" />
          </button>
          <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="text-white font-semibold text-[13px] leading-tight drop-shadow-md truncate max-w-[160px] cursor-pointer">
            {headAuthor.username || headAuthor.name}
          </span>
          {!isOwnChallenge && (
            <button
              onClick={toggleFollow}
              aria-label="follow"
              className="shrink-0 px-3 py-1 rounded-full border border-white/90 text-white text-[13px] font-medium transition-all duration-200 active:scale-95"
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
        <div className="mt-1 pointer-events-auto">
          <CaptionText text={post.description} className="text-white text-sm leading-tight" />
        </div>
      </div>

      {/* Columna social derecha — MISMA columna que el resto de publicaciones
          (comentar/compartir/guardar/más), con "Challenge" en el lugar del
          antiguo botón de voto (SIN voto, ver comentario del componente:
          esta publicación solo existe para ser retada). Abre el MISMO
          diálogo de reto que cualquier otra publicación — NO publica nada
          por sí solo. */}
      <div className="absolute z-20 right-1 flex flex-col items-center gap-4 pointer-events-auto" style={showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 6px)` } : { bottom: 24 }}>
        {/* Corazón ❤️ — reacción "like". Único botón NUEVO pedido por el
            usuario, se añade SIN quitar ninguno de los ya existentes
            (Retar/Comentarios/Compartir/Guardar/Más). AÑADIR el like se hace
            con DOBLE-toque sobre el vídeo/foto (ver onMediaPointerUp/addFire,
            mismo "ADN"/gesto que el voto en CarouselSlide.jsx); tocar este
            icono es lo que lo QUITA (removeFire) — petición explícita del
            usuario. */}
        <button aria-label="like" onClick={removeFire} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Heart className={cn('w-[30px] h-[30px] transition-all duration-200', hasFire ? 'fill-current text-red-500' : 'text-white')} strokeWidth={1.25} />
          <span className={`${fireCount > 0 ? 'text-[9px] font-semibold' : 'text-[8px] font-bold'} max-w-[30px] overflow-hidden text-white leading-none text-center whitespace-nowrap`}>{countLabel(fireCount, 'Like')}</span>
        </button>
        {!isOwnChallenge && allowChallenge && (
          <button
            aria-label="challenge"
            onClick={handleChallengeClick}
            className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
          >
            <Swords className="w-[30px] h-[30px] text-white" strokeWidth={1.25} />
            <span className="text-[8px] font-bold max-w-[30px] overflow-hidden text-white leading-none text-center whitespace-nowrap">Be 1st</span>
          </button>
        )}
        <button aria-label="comments" onClick={(e) => { e.stopPropagation(); if (!user) { setAuthModalOpen(true); return }; setCommentsOpen(true) }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <MessageCircle className="w-[30px] h-[30px] text-white" strokeWidth={1.25} />
          <span className={`${commentCount > 0 ? 'text-[9px] font-semibold' : 'text-[8px] font-bold'} max-w-[30px] overflow-hidden text-white leading-none text-center whitespace-nowrap`}>{countLabel(commentCount, 'Add 1st')}</span>
        </button>
        <button aria-label="share" onClick={(e) => { e.stopPropagation(); setShareOpen(true) }} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <ShareIcon className="w-[30px] h-[30px] text-white" strokeWidth={1.4} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(shareCount, 'Share')}</span>
        </button>
        <button aria-label="bookmark" onClick={handleSaveToggle} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <Bookmark className={`w-[30px] h-[30px] transition-all duration-200 ${saved ? 'fill-current text-yellow-400' : 'text-white'}`} strokeWidth={1.25} />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(saveCount, 'Save')}</span>
        </button>
        {!isOwnChallenge && (
          <button aria-label="mas-opciones" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
            <MoreVertical className="w-[18px] h-[18px] text-white" strokeWidth={1.25} fill="currentColor" />
          </button>
        )}
        {/* Publicación PROPIA: mismo botón "⋮", pero abre el switch de
            "Allow challenges" (ver challengeToggle más abajo) en vez de
            reportar/bloquear — petición del usuario: poder desactivar el
            botón de retar también DESPUÉS de publicada. */}
        {isOwnChallenge && (
          <button aria-label="mas-opciones-propia" onClick={(e) => { e.stopPropagation(); setMenuOpen(true) }} className="flex flex-col items-center hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
            <MoreVertical className="w-[18px] h-[18px] text-white" strokeWidth={1.25} fill="currentColor" />
          </button>
        )}
        {/* Disco (estático — este tipo de publicación aún no lleva pista de audio propia) */}
        <div className="relative mt-1 w-10 h-10 shrink-0">
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-zinc-700 to-black flex items-center justify-center">
            {post.posterUrl ? (
              <img src={post.posterUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Music size={16} className="text-white" />
            )}
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: 'inset 0 0 5px 1px rgba(0,0,0,0.55)' }} />
          </div>
        </div>
      </div>

      {/* Barra de "Añadir comentario" — SOLO cuando esta tarjeta se abre desde
          el grid del perfil (propio o ajeno), NO en el feed principal (ver
          showCommentInput). Mismo componente/comportamiento que
          CarouselSlide.jsx/DuetSlide.jsx: en el PROPIO perfil alterna con una
          barra de "reproducciones" (viewsCount != null); en perfil ajeno solo
          comentar. */}
      {showCommentInput && (
        viewsCount != null ? (
          <CommentOrViewsBar
            postId={post.id}
            votedSide={null}
            onPosted={() => setCommentCount((n) => n + 1)}
            onRequireAuth={() => setAuthModalOpen(true)}
            views={viewsCount}
          />
        ) : (
          <QuickCommentInput
            postId={post.id}
            votedSide={null}
            onPosted={() => setCommentCount((n) => n + 1)}
            onRequireAuth={() => setAuthModalOpen(true)}
          />
        )
      )}

      <CommentsModal
        open={commentsOpen}
        postId={post.id}
        votedSide={null}
        onCountChange={setCommentCount}
        onClose={() => setCommentsOpen(false)}
      />
      <ShareModal
        open={shareOpen}
        postId={post.id}
        mediaUrl={isImage ? (post.imageUrl || post.posterUrl) : post.videoUrl}
        onShared={() => setShareCount((n) => { const next = n + 1; lsSet(`shrN_${post.id}`, next); return next })}
        onClose={() => setShareOpen(false)}
      />
      <OptionsModal
        open={menuOpen}
        postId={post.id}
        author={headAuthor}
        isOwner={isOwnChallenge}
        challengeToggle={isOwnChallenge ? { checked: allowChallenge, onChange: handleToggleAllowChallenge } : null}
        onClose={() => setMenuOpen(false)}
        onNotInterested={onNotInterested}
      />
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultTab="register"
      />
    </div>
  )
}
