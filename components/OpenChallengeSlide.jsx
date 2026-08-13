'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swords, Globe, Loader2, X, Check, Play, Image as ImageIcon, Film } from 'lucide-react'
import Avatar from './Avatar'
import CaptionText from './CaptionText'

/**
 * OpenChallengeSlide — tarjeta de un RETO ABIERTO ("a todos") dentro del feed
 * principal. A diferencia de un Versus/1vs1, aquí solo hay UN vídeo/foto (el
 * del creador del reto) y NO se vota: la acción principal es "Responder este
 * reto" — cualquiera que la pulse sube su propio vídeo/foto y, al enviarlo,
 * esta publicación se convierte en un versus real (creador vs quien
 * respondió) que aparecerá en el feed y en Batallas > Completados para ambos.
 * El reto original NUNCA se cierra: puede recibir respuestas de más personas.
 */
export default function OpenChallengeSlide({
  post,
  isActive,
  warm = false,
  muted: globalMuted,
  playbackEnabled = true,
  onOpenProfile,
  onRequireAuth,
  onResponded,
  currentUsername = null,
}) {
  const videoRef = useRef(null)
  const fileRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [pickedFile, setPickedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const [respCount, setRespCount] = useState(post.responsesCount || 0)

  const isImage = post.mediaType === 'image'
  const mediaUrl = isImage ? post.imageUrl : post.videoUrl
  const acceptType = isImage ? 'image/*' : 'video/*'
  const isOwnChallenge = !!currentUsername && currentUsername === post.author?.username

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
    return () => {
      if (!isActive) return
      try { el?.pause() } catch { /* ignore */ }
    }
  }, [isActive, warm, playbackEnabled, globalMuted, isImage, mediaUrl])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el || isImage) return
    if (el.paused) el.play().catch(() => {}); else el.pause()
  }, [isImage])

  const openPicker = () => {
    if (isOwnChallenge) return
    if (!currentUsername) { onRequireAuth?.(); return }
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

  const cancelResponse = () => {
    setPickedFile(null)
    setPreviewUrl(null)
    setError(null)
  }

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
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/40 pointer-events-none" />

      {paused && !isImage && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <Play size={72} className="text-white drop-shadow-lg" fill="white" />
        </div>
      )}

      {/* Header — avatar + "Open challenge" */}
      <div className="absolute top-0 left-0 right-16 z-20 px-4 pb-10 pt-10 pointer-events-none bg-gradient-to-b from-black/60 to-transparent"
           style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2.5 w-fit pointer-events-auto">
          <button onClick={(e) => { e.stopPropagation(); onOpenProfile?.(post.author?.username) }} className="w-[30px] h-[30px] rounded-full overflow-hidden block shrink-0">
            <Avatar src={post.author?.avatarUrl} alt={post.author?.username} className="w-full h-full" />
          </button>
          <span onClick={(e) => { e.stopPropagation(); onOpenProfile?.(post.author?.username) }} className="text-white font-semibold text-[13px] leading-tight drop-shadow-md truncate max-w-[140px] cursor-pointer">
            {post.author?.username || post.author?.name}
          </span>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-white border border-white/20 shrink-0">
            <Globe size={11} strokeWidth={2.2} /> Open challenge
          </span>
        </div>
        {post.description ? (
          <div className="mt-1.5 pointer-events-auto">
            <CaptionText text={post.description} className="text-white text-sm leading-tight" />
          </div>
        ) : null}
      </div>

      {/* Columna social derecha — SOLO la acción de responder (sin voto: aquí
          todavía no hay "otro lado" con el que comparar). */}
      <div className="absolute z-20 right-1 bottom-24 flex flex-col items-center gap-1.5 pointer-events-auto">
        <button
          aria-label="Respond to this challenge"
          onClick={(e) => { e.stopPropagation(); openPicker() }}
          disabled={isOwnChallenge}
          className="w-14 h-14 rounded-full bg-white flex items-center justify-center active:scale-90 transition disabled:opacity-40"
          style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.45)' }}
        >
          <Swords className="w-6 h-6 text-black" strokeWidth={2} />
        </button>
        <span className="text-[11px] font-bold text-white drop-shadow-md whitespace-nowrap">
          {isOwnChallenge ? 'Your challenge' : 'Respond'}
        </span>
        {respCount > 0 && (
          <span className="text-[10px] font-semibold text-white/80 drop-shadow-md whitespace-nowrap">
            {respCount} responded
          </span>
        )}
      </div>

      {!isOwnChallenge && !pickedFile && !done && (
        <div className="absolute top-[86px] left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Tap the swords to respond with your own {isImage ? 'photo' : 'video'}
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
    </div>
  )
}
