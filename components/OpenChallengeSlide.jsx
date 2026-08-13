'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swords, Play, MessageCircle, Bookmark, MoreVertical, Music } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import VoteIcon from './icons/VoteIcon'
import VoteBurstEffect from './VoteBurstEffect'
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
  const lastTapRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [following, setFollowing] = useState(!!post.author?.isFollowing)
  const [commentCount, setCommentCount] = useState(post.stats?.comments || 0)
  const [shareCount, setShareCount] = useState(post.stats?.shares || 0)
  const [saveCount, setSaveCount] = useState(post.stats?.saves || 0)
  const [saved, setSaved] = useState(false)
  const [votes, setVotes] = useState(post.voteCount || 0)
  const [userVoted, setUserVoted] = useState(!!post.hasVoted)
  const [voting, setVoting] = useState(false)
  const [voteBursts, setVoteBursts] = useState([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  useEffect(() => { setVotes(post.voteCount || 0); setUserVoted(!!post.hasVoted) }, [post.id, post.voteCount, post.hasVoted])

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

  // Burst del icono de voto (mismo componente/estilo que el resto de
  // publicaciones): aparece justo donde se hizo el doble-toque.
  const spawnVoteBurst = useCallback((pt) => {
    const burstId = Math.random().toString(36).slice(2)
    setVoteBursts((b) => [...b, { id: burstId, x: pt?.x, y: pt?.y }])
    setTimeout(() => setVoteBursts((b) => b.filter((x) => x.id !== burstId)), 900)
  }, [])

  // Voto ÚNICO (toggle, sin lado A/B): doble-toque en el vídeo vota/quita el
  // voto. A diferencia del voto A/B, aquí no hay "cambiar de opción" — solo
  // votado <-> no votado, como un like. El burst SOLO se dispara al votar
  // (no al quitar el voto).
  const submitVote = useCallback(async (pt) => {
    if (!user) { setAuthModalOpen(true); return }
    if (voting) return
    setVoting(true)
    const nextVoted = !userVoted
    setUserVoted(nextVoted)
    setVotes((v) => Math.max(0, v + (nextVoted ? 1 : -1)))
    if (nextVoted) spawnVoteBurst(pt)
    try {
      const res = await fetch('/api/single-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.count === 'number') setVotes(data.count)
        if (typeof data.voted === 'boolean') setUserVoted(data.voted)
      } else {
        setUserVoted(!nextVoted)
        setVotes((v) => Math.max(0, v + (nextVoted ? -1 : 1)))
      }
    } catch {
      setUserVoted(!nextVoted)
      setVotes((v) => Math.max(0, v + (nextVoted ? -1 : 1)))
    } finally {
      setVoting(false)
    }
  }, [user, voting, userVoted, post.id, spawnVoteBurst])

  // Gestos sobre el vídeo: toque simple = play/pausa, doble-toque = votar.
  // Mismo patrón/ventana (300ms) que CarouselSlide.jsx.
  const onMediaPointerUp = useCallback((e) => {
    const now = Date.now()
    const isDouble = now - lastTapRef.current < 300
    lastTapRef.current = now
    if (isDouble) {
      const rect = overlayRef.current?.getBoundingClientRect()
      const pt = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null
      submitVote(pt)
      return
    }
    setTimeout(() => {
      if (Date.now() - lastTapRef.current < 280) return
      togglePlay()
    }, 280)
  }, [submitVote, togglePlay])

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
      {/* Definición del degradado de marca (morado -> azul, el mismo del botón
          "+" de crear y otros acentos de Twyk) reutilizado por el icono de
          voto y su burst — un SVG 0x0 solo para poder referenciarlo con
          url(#voteGradientOpen) desde fill/stroke. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="voteGradientOpen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Media a pantalla completa */}
      <div className="absolute inset-0" onPointerUp={onMediaPointerUp}>
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

      {/* Pista para votar (mismo criterio que el resto de publicaciones) */}
      {!userVoted && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Double-tap to vote
        </div>
      )}

      {/* Burst del icono de voto — aparece justo donde se hizo el doble-toque.
          Degradado de marca (morado -> azul) en vez de un morado plano, para
          que se sienta identidad Twyk y no "el mismo lila del lado A". */}
      {voteBursts.map((vb) => (
        vb.x != null && vb.y != null ? (
          <div key={vb.id} className="absolute z-30 pointer-events-none" style={{ left: vb.x, top: vb.y, transform: 'translate(-50%, -60px)' }}>
            <VoteBurstEffect fillColor="url(#voteGradientOpen)" strokeColor="url(#voteGradientOpen)" />
          </div>
        ) : (
          <div key={vb.id} className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <VoteBurstEffect fillColor="url(#voteGradientOpen)" strokeColor="url(#voteGradientOpen)" />
          </div>
        )
      ))}

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
          (comentar/compartir/guardar/más), con "Challenge" en el hueco que
          normalmente ocupa "Votar" (aquí no hay 2 lados que comparar
          todavía). Abre el MISMO diálogo de reto que cualquier otra
          publicación — NO publica nada por sí solo. */}
      <div className="absolute z-20 right-1 flex flex-col items-center gap-4 pointer-events-auto" style={showCommentInput ? { bottom: `calc(${COMMENT_BAR_RESERVE} + 6px)` } : { bottom: 72 }}>
        <button aria-label="vote" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}>
          <VoteIcon
            className="w-[40px] h-[40px]"
            strokeWidth={210}
            filled={userVoted}
            fillColor={userVoted ? 'url(#voteGradientOpen)' : '#fff'}
            strokeColor={userVoted ? 'url(#voteGradientOpen)' : '#fff'}
          />
          <span className="text-[9px] font-semibold text-white leading-none text-center whitespace-nowrap">{countLabel(votes, 'Vote')}</span>
        </button>
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
