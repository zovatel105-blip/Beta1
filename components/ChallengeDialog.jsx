'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Film, Check, Loader2, Swords } from 'lucide-react'

/**
 * ChallengeDialog — "Retar" un contenido.
 * El usuario sube/graba un vídeo para enfrentarlo con el contenido actual
 * (target). Crea una solicitud de reto (POST /api/challenges) que le llega
 * al autor retado en su Bandeja, donde puede aceptar o cancelar.
 *
 * props:
 *   open      bool
 *   onClose   () => void
 *   target    { videoUrl, author, description, music }
 *   onCreated (challenge) => void
 */
export default function ChallengeDialog({ open, onClose, target, onCreated }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setFile(null); setMessage(''); setProgress(0); setUploading(false); setError(null)
    }
  }, [open])

  if (!open) return null

  const pickFile = () => inputRef.current?.click()

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('video/')) { setError('Selecciona un vídeo'); return }
    if (f.size > 80 * 1024 * 1024) { setError('Máximo 80MB'); return }
    setError(null)
    setFile(f)
  }

  const doSend = async () => {
    if (!file || !target) { setError('Sube tu vídeo para retar'); return }
    setUploading(true)
    setProgress(0)
    try {
      const xhr = new XMLHttpRequest()
      const promise = new Promise((resolve, reject) => {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) } catch (err) { reject(err) }
          } else reject(new Error('challenge failed ' + xhr.status))
        }
        xhr.onerror = () => reject(new Error('network'))
      })
      xhr.open('POST', '/api/challenges')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('targetVideoUrl', target.videoUrl || '')
      fd.append('targetAuthor', JSON.stringify(target.author || {}))
      fd.append('targetDescription', target.description || '')
      fd.append('targetMusic', target.music || '')
      fd.append('message', message || '')
      xhr.send(fd)
      const data = await promise
      if (onCreated && data?.challenge) onCreated(data.challenge)
      onClose()
    } catch (err) {
      console.error(err)
      setError('Error al enviar el reto')
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl bg-zinc-950 border border-white/10 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #A855F7, #3B82F6)' }}>
              <Swords size={16} className="text-white" />
            </div>
            <h2 className="font-bold text-base text-white">Retar a @{target?.author?.username}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {uploading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <Loader2 size={36} className="animate-spin text-white" />
              <div className="text-sm font-semibold text-white">{progress}%</div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #A855F7, #3B82F6)' }} />
              </div>
              <div className="text-xs text-white/60">Enviando tu reto…</div>
            </div>
          ) : (
            <>
              {/* Enfrentamiento: tu vídeo (A) vs el contenido retado (B) */}
              <div className="grid grid-cols-2 gap-3">
                <input ref={inputRef} type="file" accept="video/*" capture="user" className="hidden" onChange={handleFileChange} />
                <button
                  onClick={pickFile}
                  className="w-full aspect-[9/16] rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 active:scale-[0.99] transition flex flex-col items-center justify-center gap-2 overflow-hidden relative"
                >
                  <span className="absolute top-1.5 left-1.5 z-10 text-[11px] font-bold text-white bg-black/50 rounded-full px-2 py-0.5" style={{ color: '#C084FC' }}>Tú</span>
                  {file ? (
                    <>
                      <video src={URL.createObjectURL(file)} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                        <Check size={26} className="text-emerald-400" />
                        <span className="text-[10px] text-white/70 mt-1 underline">Cambiar</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Film size={26} className="text-white/40" />
                      <span className="text-[11px] font-semibold text-center px-1 text-white">Grabar / subir tu vídeo</span>
                    </>
                  )}
                </button>

                <div className="w-full aspect-[9/16] rounded-2xl overflow-hidden relative bg-zinc-900 border border-white/10">
                  <span className="absolute top-1.5 left-1.5 z-10 text-[11px] font-bold bg-black/50 rounded-full px-2 py-0.5" style={{ color: '#60A5FA' }}>@{target?.author?.username}</span>
                  {target?.videoUrl ? (
                    <video src={target.videoUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center"><Film size={26} className="text-white/30" /></div>
                  )}
                </div>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Añade un mensaje al reto (opcional)…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-500"
              />

              <p className="text-[11px] text-white/50 leading-snug">
                Se enviará una solicitud de reto a @{target?.author?.username}. Cuando la acepte, se publicará como un versus (tú 🆚 {target?.author?.name || 'rival'}).
              </p>

              {error && <div className="text-xs text-rose-400">{error}</div>}

              <button
                onClick={doSend}
                disabled={!file}
                className="w-full disabled:opacity-40 active:scale-[0.98] transition rounded-full py-3 font-bold text-white"
                style={{ background: 'linear-gradient(90deg, #A855F7, #3B82F6)' }}
              >
                Enviar reto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
