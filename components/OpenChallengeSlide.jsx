'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swords, Play, MessageCircle, Bookmark, MoreVertical, Music } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import Avatar from './Avatar'
import CaptionText from './CaptionText'
import CommentsModal from './CommentsModal'
import ShareModal from './ShareModal'
import OptionsModal from './OptionsModal'
import AuthModal from './AuthModal'
import QuickCommentInput from './QuickCommentInput'
import CommentOrViewsBar from './CommentOrViewsBar'
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
 * SIN VOTO (petición explícita del usuario: "quitar el boton de voto de las
 * publicaciones single"): estas publicaciones solo existen para ser
 * RETADAS (ver "Challenge" arriba) — no llevan ningún botón/gesto de voto,
 * a diferencia de las publicaciones versus/1vs1 (que sí comparan 2 lados).
 * El toque simple sobre el vídeo solo pausa/reanuda.
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
  const [following, setFollowing] = useState(!!post.author?.isFollowing)
  const [commentCount, setCommentCount] = useState(post.stats?.comments || 0)
  const [shareCount, setShareCount] = useState(post.stats?.shares || 0)
  const [saveCount, setSaveCount] = useState(post.stats?.saves || 0)
  const [saved, setSaved] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

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

  const isImage = post.mediaType === 'image'
  const mediaUrl = isImage ? post.imageUrl : post.videoUrl
  const headAuthor = post.author || {}
  const isOwnChallenge = !!user?.username && user.username === headAuthor?.username

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

  // Gestos sobre el vídeo: SOLO toque simple = play/pausa (sin voto, ver
  // comentario del componente) — se conserva el guard de distancia (dx/dy >
  // 12px = fue un ARRASTRE/scroll, no un toque) para no interferir con el
  // scroll del feed.
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
    togglePlay()
  }, [togglePlay])

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
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
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

      {/* Header — MISMA posición/estilo que el resto de publicaciones
          (abajo-izquierda): avatar + nombre + Seguir, sin ningún distintivo
          adicional. Si se abre desde el visor del grid del perfil
          (showCommentInput), se sube para dejar sitio a la barra de abajo. */}
      <div
        className={`absolute z-20 px-4 left-0 right-16 ${showCommentInput ? '' : 'bottom-20'} pt-10 pointer-events-none`}
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
      <div className="absolute z-20 right-1 flex flex-col items-center gap-4 pointer-events-auto" style={showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 6px)` } : { bottom: 72 }}>
        {!isOwnChallenge && (
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
        onShared={() => setShareCount((n) => { const next = n + 1; lsSet(`shrN_${post.id}`, next); return next })}
        onClose={() => setShareOpen(false)}
      />
      <OptionsModal
        open={menuOpen}
        postId={post.id}
        author={headAuthor}
        isOwner={false}
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
