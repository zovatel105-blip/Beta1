'use client'
/* eslint-disable react-hooks/set-state-in-effect -- reseteo de estado al cerrar; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { X, Film, Check, Loader2, Swords } from 'lucide-react'

/**
 * ChallengeDialog — "Retar" un contenido (rediseño premium minimalista).
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
const GOLD = '#E4C79B'

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

  const username = target?.author?.username || 'rival'

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl bg-[#0a0a0b] border border-white/10 max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow superior cálido dorado (mismo del perfil / retos) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 z-0"
             style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(214,178,122,0.12), transparent 70%)' }} />

        {/* Asa de arrastre (móvil) */}
        <div className="relative z-10 mx-auto mt-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

        {/* Header minimalista */}
        <div className="relative z-10 flex items-center gap-3 px-5 pt-4 pb-4">
          <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-br from-white/15 to-white/[0.03] shrink-0">
            <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 ring-1 ring-white/10 flex items-center justify-center">
              {target?.author?.avatarUrl ? (
                <img src={target.author.avatarUrl} alt={username} className="w-full h-full object-cover" draggable={false} />
              ) : (
                <Swords className="w-4 h-4 text-white/70" />
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.16em] font-medium" style={{ color: GOLD }}>Reto</p>
            <h2 className="text-white text-[17px] font-semibold tracking-tight leading-tight truncate">@{username}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-zinc-300 hover:bg-white/10 active:scale-95 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-7 space-y-5"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>
          {uploading ? (
            <div className="flex flex-col items-center justify-center py-14 gap-5">
              <Loader2 size={34} className="animate-spin" style={{ color: GOLD }} />
              <div className="text-2xl font-semibold text-white tabular-nums">{progress}%</div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: GOLD }} />
              </div>
              <div className="text-[13px] text-zinc-400">Enviando tu reto…</div>
            </div>
          ) : (
            <>
              {/* Enfrentamiento: tu vídeo (A) vs el contenido retado (B) */}
              <div className="relative grid grid-cols-2 gap-3">
                <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />

                {/* Tu vídeo */}
                <button
                  onClick={pickFile}
                  className={`relative w-full aspect-[9/16] rounded-2xl overflow-hidden border bg-white/[0.04] hover:bg-white/[0.06] active:scale-[0.99] transition flex flex-col items-center justify-center gap-2 ${file ? 'border-transparent ring-2' : 'border-white/10'}`}
                  style={file ? { '--tw-ring-color': GOLD } : undefined}
                >
                  <span className="absolute top-2 left-2 z-10 text-[10px] font-bold rounded-full px-2 py-0.5 bg-black/55 backdrop-blur" style={{ color: GOLD }}>Tú</span>
                  {file ? (
                    <>
                      <video src={URL.createObjectURL(file)} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1">
                        <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: GOLD }}>
                          <Check size={20} className="text-black" strokeWidth={2.5} />
                        </span>
                        <span className="text-[11px] text-white/80 mt-1 underline underline-offset-2">Cambiar</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Film size={24} className="text-zinc-500" strokeWidth={1.5} />
                      <span className="text-[11px] font-medium text-center px-2 text-zinc-300 leading-tight">Grabar o subir tu vídeo</span>
                    </>
                  )}
                </button>

                {/* Vídeo retado */}
                <div className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-white/10">
                  <span className="absolute top-2 left-2 z-10 text-[10px] font-bold rounded-full px-2 py-0.5 bg-black/55 backdrop-blur text-white">@{username}</span>
                  {target?.videoUrl ? (
                    <video src={target.videoUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center"><Film size={24} className="text-white/25" /></div>
                  )}
                </div>

                {/* Insignia VS al centro */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-[#0a0a0b] border border-white/15 flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.6)]">
                    <span className="text-white font-black text-[12px] tracking-wide">VS</span>
                  </div>
                </div>
              </div>

              {/* Mensaje opcional */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Añade un mensaje al reto (opcional)…"
                rows={2}
                className="w-full bg-white/[0.04] border border-white/10 rounded-2xl px-4 py-3 text-[14px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/25 resize-none transition"
              />

              <p className="text-[12px] text-zinc-500 leading-relaxed">
                Se enviará una solicitud de reto a <span className="text-zinc-300">@{username}</span>. Cuando la acepte, se publicará como un versus (tú vs {target?.author?.name || 'rival'}).
              </p>

              {error && <div className="text-[12px] text-rose-400">{error}</div>}

              <button
                onClick={doSend}
                disabled={!file}
                className="w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-100 active:scale-[0.99] transition"
              >
                <Swords className="w-[18px] h-[18px]" strokeWidth={2} />
                Enviar reto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
