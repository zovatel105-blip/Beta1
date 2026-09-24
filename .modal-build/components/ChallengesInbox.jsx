'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga async al abrir; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { X, Swords, Check, Loader2, Inbox, Film } from 'lucide-react'
import Avatar from './Avatar'

/**
 * InboxChallengeCard — una tarjeta de reto recibido en la bandeja. Si el reto
 * es "con mención" (sin targetVideoUrl), el retado puede subir su vídeo de
 * respuesta ANTES de aceptar (botón) o DESPUÉS (al pulsar Aceptar se abre el
 * selector y se envía automáticamente).
 */
function InboxChallengeCard({ c, busy, onAccept, onReject }) {
  const fileRef = useRef(null)
  const pendingAcceptRef = useRef(false)
  const [responseFile, setResponseFile] = useState(null)
  const [responsePreview, setResponsePreview] = useState(null)

  const needsVideo = !c.targetVideoUrl && !c.targetImageUrl

  useEffect(() => () => { if (responsePreview) URL.revokeObjectURL(responsePreview) }, [responsePreview])

  const pickFile = () => fileRef.current?.click()
  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('video/') && !f.type.startsWith('image/')) return
    setResponseFile(f)
    setResponsePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    if (pendingAcceptRef.current) {
      pendingAcceptRef.current = false
      onAccept(c, f)
    }
  }
  const handleAccept = () => {
    if (needsVideo && !responseFile) {
      pendingAcceptRef.current = true
      pickFile()
      return
    }
    onAccept(c, responseFile)
  }

  const responseFileIsImage = !!responseFile && responseFile.type?.startsWith('image/')
  const challengerUrl = c.challengerVideoUrl || c.challengerImageUrl || c.challengerPosterUrl
  const challengerIsImage = c.challengerMediaType === 'image' || (!c.challengerVideoUrl && !!c.challengerImageUrl)
  const targetUrl = c.targetVideoUrl || c.targetImageUrl || c.targetPosterUrl
  const targetIsImage = c.targetMediaType === 'image' || (!c.targetVideoUrl && !!c.targetImageUrl)
  const responseUrl = needsVideo ? responsePreview : targetUrl
  const responseIsImage = needsVideo ? responseFileIsImage : targetIsImage

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={onFileChange} />
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0">
          <Avatar src={c.from?.avatarUrl} className="w-full h-full rounded-full" />
        </div>
        <div className="text-sm text-white">
          <span className="font-bold">@{c.from?.username}</span> challenged you
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="flex-1 aspect-[9/16] rounded-xl overflow-hidden relative bg-zinc-900">
          <span className="absolute top-1 left-1 z-10 text-[10px] font-bold bg-black/50 rounded-full px-1.5" style={{ color: '#C084FC' }}>@{c.from?.username}</span>
          {challengerUrl && (
            challengerIsImage ? (
              <img src={challengerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <video src={challengerUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
            )
          )}
        </div>
        <div className="flex items-center text-white/60 font-black text-xs">VS</div>
        <div className="flex-1 aspect-[9/16] rounded-xl overflow-hidden relative bg-zinc-900">
          <span className="absolute top-1 left-1 z-10 text-[10px] font-bold bg-black/50 rounded-full px-1.5" style={{ color: '#60A5FA' }}>@{c.to?.username}</span>
          {responseUrl ? (
            responseIsImage ? (
              <img src={responseUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <video src={responseUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
            )
          ) : (
            <button onClick={pickFile} className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center px-2 active:bg-white/5 transition">
              <Film className="w-6 h-6 text-zinc-400" strokeWidth={1.5} />
              <span className="text-[11px] font-semibold text-white leading-tight">Upload your media</span>
            </button>
          )}
        </div>
      </div>

      {c.message && (
        <p className="text-xs text-white/70 mt-2 italic">“{c.message}”</p>
      )}

      {/* Subir mi media ANTES de aceptar (retos con mención) */}
      {needsVideo && (
        <button
          onClick={pickFile}
          disabled={busy}
          className="w-full rounded-full py-2.5 mt-3 text-sm font-bold text-white border border-white/20 hover:bg-white/10 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Film size={15} strokeWidth={2} />
          {responseFile ? 'Change my media' : 'Upload my media'}
        </button>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onReject(c)}
          disabled={busy}
          className="flex-1 rounded-full py-2.5 text-sm font-bold text-white bg-white/10 hover:bg-white/20 active:scale-[0.98] transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleAccept}
          disabled={busy}
          className="flex-1 rounded-full py-2.5 text-sm font-bold text-white active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          style={{ background: 'linear-gradient(90deg, #A855F7, #3B82F6)' }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {needsVideo && !responseFile ? 'Upload & accept' : 'Accept challenge'}
        </button>
      </div>
    </div>
  )
}

/**
 * ChallengesInbox — Bandeja de retos (solicitudes de enfrentamiento).
 * Muestra los retos pendientes. Cada uno se puede Aceptar (se publica como
 * versus y aparece en el feed) o Cancelar (se descarta).
 *
 * props:
 *   open        bool
 *   onClose     () => void
 *   onAccepted  (post) => void   // publica el versus en el feed
 *   onChanged   () => void       // refresca el contador del badge
 */
export default function ChallengesInbox({ open, onClose, onAccepted, onChanged }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      const data = await res.json()
      setList(data.challenges || [])
    } catch { setList([]) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  if (!open) return null

  const accept = async (c, file = null) => {
    setBusyId(c.id)
    try {
      let res
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        res = await fetch(`/api/challenges/${c.id}/accept`, { method: 'POST', body: fd })
      } else {
        res = await fetch(`/api/challenges/${c.id}/accept`, { method: 'POST' })
      }
      if (res.ok) {
        const data = await res.json()
        setList((prev) => prev.filter((x) => x.id !== c.id))
        if (onAccepted && data?.post) onAccepted(data.post)
        if (onChanged) onChanged()
      }
    } catch { /* ignore */ } finally { setBusyId(null) }
  }

  const reject = async (c) => {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/challenges/${c.id}/reject`, { method: 'POST' })
      if (res.ok) {
        setList((prev) => prev.filter((x) => x.id !== c.id))
        if (onChanged) onChanged()
      }
    } catch { /* ignore */ } finally { setBusyId(null) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl bg-zinc-950 border border-white/10 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #A855F7, #3B82F6)' }}>
              <Swords size={16} className="text-white" />
            </div>
            <h2 className="font-bold text-base text-white">Challenges received</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-white" /></div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white font-semibold">No pending challenges</p>
              <p className="text-white/50 text-sm mt-1">When someone challenges you, it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((c) => (
                <InboxChallengeCard
                  key={c.id}
                  c={c}
                  busy={busyId === c.id}
                  onAccept={accept}
                  onReject={reject}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
