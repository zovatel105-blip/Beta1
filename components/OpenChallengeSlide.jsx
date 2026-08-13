'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swords, Globe, Loader2, X, Check, Play, MessageCircle, Bookmark, MoreVertical, Music } from 'lucide-react'
import ShareIcon from './icons/ShareIcon'
import Avatar from './Avatar'
import CaptionText from './CaptionText'
import CommentsModal from './CommentsModal'
import ShareModal from './ShareModal'
import OptionsModal from './OptionsModal'
import AuthModal from './AuthModal'
import { useAuth } from '@/contexts/AuthContext'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}
function countLabel(n, placeholder) {
  return (Number(n) || 0) === 0 ? placeholder : formatCount(n)
}

/**
 * OpenChallengeSlide — tarjeta de un RETO ABIERTO ("a todos") dentro del feed
 * principal. Es una publicación de UN SOLO vídeo/foto (no hay "otro lado" con
 * el que comparar), pero visualmente debe sentirse IGUAL que cualquier otra
 * publicación (mismo header abajo-izquierda con avatar+seguir, misma columna
 * social derecha con comentar/compartir/guardar/más, mismo disco de música) —
 * la ÚNICA diferencia real de esta tarjeta es que el hueco donde normalmente
 * iría "Votar" se sustituye por "Responder" (Swords), que es la acción que le
 * da sentido a una publicación única dentro del ADN de Twyk (comparar/votar/
 * retar): al responder, esta publicación se convierte en un versus real.
 */
export default function OpenChallengeSlide({
  post,
  isActive,
  warm = false,
  muted: globalMuted,
  playbackEnabled = true,
  onOpenProfile,
  onResponded,
  onNotInterested,
}) {
  const { user } = useAuth()
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [respCount, setRespCount] = useState(post.responsesCount || 0)
  const [following, setFollowing] = useState(!!post.author?.isFollowing)
  const [commentCount, setCommentCount] = useState(post.stats?.comments || 0)
  const [shareCount, setShareCount] = useState(post.stats?.shares || 0)
  const [saveCount, setSaveCount] = useState(post.stats?.saves || 0)
  const [saved, setSaved] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  const lsNum = (k) => { try { return parseInt(localStorage.getItem(k) || '0', 10) || 0 } catch { return 0 } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)) } catch { /* ignore */ } }
  useEffect(() => {
    setShareCount((c) => Math.max(c, lsNum(`shrN_${post.id}`)))
    setSaveCount((c) => Math.max(c, lsNum(`savN_${post.id}`)))
  }, [post.id])
  useEffect(() => { setFollowing(!!post.author?.isFollowing) }, [post.author?.username, post.author?.isFollowing])

  const isImage = post.mediaType === 'image'
  const mediaUrl = isImage ? post.imageUrl : post.videoUrl
  const acceptType = isImage ? 'image/*' : 'video/*'
  const headAuthor = post.author || {}
  const isOwnChallenge = !!user?.username && user.username === headAuthor?.username

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

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

  const openPicker = () => {
    if (isOwnChallenge) return
    if (!user) { setAuthModalOpen(true); return }
    fileRef.current?.click()
  }

  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const kind = f.type?.startsWith('image/') ? 'image' : (f.type?.startsWith('video/') ? 'video' : '')
    const required = isImage ? 'image' : 'video'
    if (kind !== required) {
      setError(required === 'image' ? 'This challenge needs a photo' : 'This challenge needs a video')
      return
    }
    setError(null)
    setPickedFile(f)
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
  }

  const cancelResponse = () => { setPickedFile(null); setPreviewUrl(null); setError(null) }

  const sendResponse = async () => {
    if (!pickedFile || sending) return
    setSending(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', pickedFile)
      let auth = {}
      try { const t = localStorage.getItem('twyk_token'); if (t) auth = { Authorization: `Bearer ${t}` } } catch { /* ignore */ }
      const res = await fetch(`/api/challenges/${post.challengeId}/respond`, { method: 'POST', body: fd, headers: auth })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.message || data?.detail || "Couldn't send your response")
        setSending(false)
        return
      }
      setDone(true)
      setRespCount((n) => n + 1)
      setPickedFile(null)
      setPreviewUrl(null)
      onResponded?.(data.post)
    } catch {
      setError('Network error, try again')
    } finally {
      setSending(false)
    }
  }

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

  const showBottomPanel = pickedFile || done

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      <input ref={fileRef} type="file" accept={acceptType} className="hidden" onChange={onFileChange} />

      {/* Media a pantalla completa */}
      <div className="absolute inset-0" onClick={togglePlay}>
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

      {!isOwnChallenge && !showBottomPanel && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Tap the swords to respond with your own {isImage ? 'photo' : 'video'}
        </div>
      )}

      {/* Header — MISMA posición/estilo que el resto de publicaciones
          (abajo-izquierda, con Seguir), solo con la insignia extra "Open
          challenge" junto al nombre. */}
      {!showBottomPanel && (
        <div className="absolute z-20 px-4 left-0 right-16 bottom-20 pt-10 pointer-events-none">
          <div className="flex items-center gap-2.5 w-fit max-w-[calc(100%-4rem)] pointer-events-auto">
            <button onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="w-[30px] h-[30px] rounded-full overflow-hidden block shrink-0">
              <Avatar src={headAuthor.avatarUrl} alt={headAuthor.username} className="w-full h-full" />
            </button>
            <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(headAuthor.username) }} className="text-white font-semibold text-[13px] leading-tight drop-shadow-md truncate max-w-[120px] cursor-pointer">
              {headAuthor.username || headAuthor.name}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-white/15 backdrop-blur text-white border border-white/20 shrink-0 whitespace-nowrap">
              <Globe size={10} strokeWidth={2.2} /> Open challenge
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
      )}

      {/* Columna social derecha — MISMA columna que el resto de publicaciones
          (comentar/compartir/guardar/más), con "Responder" en el hueco que
          normalmente ocupa "Votar" (aquí no hay 2 lados que comparar todavía). */}
      {!showBottomPanel && (
        <div className="absolute z-20 right-1 flex flex-col items-center gap-4 pointer-events-auto" style={{ bottom: 72 }}>
          <button
            aria-label="Respond to this challenge"
            onClick={(e) => { e.stopPropagation(); openPicker() }}
            disabled={isOwnChallenge}
            className="flex flex-col items-center gap-1 w-14 hover:scale-110 transition-all duration-200 disabled:opacity-50"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.7))' }}
          >
            <Swords className="w-[30px] h-[30px] text-white" strokeWidth={1.5} />
            <span className={`${respCount > 0 ? 'text-[9px] font-semibold' : 'text-[8px] font-bold'} max-w-[30px] overflow-hidden text-white leading-none text-center whitespace-nowrap`}>
              {isOwnChallenge ? 'Yours' : countLabel(respCount, 'Respond')}
            </span>
          </button>
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
      )}

      {/* Panel inferior: previsualización + enviar/cancelar (tras elegir archivo) */}
      {pickedFile && !done && (
        <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-6 pt-10 bg-gradient-to-t from-black via-black/85 to-transparent">
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/15 p-2.5">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-800 shrink-0">
              {isImage ? (
                <img src={previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={previewUrl} className="w-full h-full object-cover" muted playsInline />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-[13px] font-semibold">Your response is ready</p>
              <p className="text-zinc-400 text-[11.5px]">Send it to turn this into a versus</p>
            </div>
            <button onClick={cancelResponse} disabled={sending} aria-label="Cancel" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-white/10 transition disabled:opacity-40">
              <X size={18} />
            </button>
            <button onClick={sendResponse} disabled={sending} className="shrink-0 h-9 px-4 rounded-full bg-white text-black text-[13px] font-bold flex items-center gap-1.5 active:scale-95 transition disabled:opacity-60">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Swords size={14} />}
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          {error && <p className="text-rose-400 text-[12px] font-medium mt-2 text-center">{error}</p>}
        </div>
      )}

      {/* Confirmación tras enviar */}
      {done && (
        <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-8 pt-10 bg-gradient-to-t from-black via-black/85 to-transparent">
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 border border-white/20 p-3">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
              <Check size={18} className="text-black" strokeWidth={2.6} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-[13px] font-semibold leading-tight">Response sent!</p>
              <p className="text-zinc-300 text-[12px] leading-tight">It&apos;s now a versus — check Battles to see it get votes.</p>
            </div>
          </div>
        </div>
      )}

      {error && !pickedFile && !done && (
        <div className="absolute inset-x-0 bottom-24 z-30 px-6 pointer-events-none">
          <p className="text-rose-400 text-[12px] font-medium text-center bg-black/50 rounded-full py-1.5 px-3">{error}</p>
        </div>
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
