'use client'
/* eslint-disable react-hooks/set-state-in-effect -- reseteo de estado al cerrar; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Film, Check, Swords, Upload } from 'lucide-react'
import Avatar from './Avatar'

// Colores de marca para la identidad "versus" (mismos de la votación A/B).
const PURPLE = '#A855F7' // tu lado
const BLUE = '#3B82F6'   // lado rival

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
export default function ChallengeDialog({ open, onClose, target, onSubmit }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setFile(null); setMessage(''); setError(null)
    }
  }, [open])

  if (!open) return null

  const pickFile = () => inputRef.current?.click()

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const isImg = f.type.startsWith('image/')
    const isVid = f.type.startsWith('video/')
    if (!isImg && !isVid) { setError('Select a video or photo'); return }
    const maxMB = isImg ? 15 : 80
    if (f.size > maxMB * 1024 * 1024) { setError(`Maximum ${maxMB}MB`); return }
    setError(null)
    setFile(f)
  }

  // Enviar el reto: delega la SUBIDA al contenedor (Feed) para que ocurra en
  // segundo plano. El modal se cierra al instante y el usuario puede seguir
  // descubriendo contenido mientras se envía.
  const doSend = () => {
    if (!file || !target) { setError('Upload your video or photo to challenge'); return }
    onSubmit?.({ file, target, message })
    onClose()
  }

  const username = target?.author?.username || 'rival'
  const fileIsImage = !!file && file.type?.startsWith('image/')
  const targetIsImage = target?.mediaType === 'image'
  const targetMediaUrl = target?.posterUrl || target?.imageUrl || target?.videoUrl || null

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl bg-white max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow superior con gradiente de marca (morado -> azul), suave sobre blanco */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 z-0"
             style={{ background: 'radial-gradient(70% 100% at 20% 0%, rgba(168,85,247,0.10), transparent 60%), radial-gradient(70% 100% at 80% 0%, rgba(59,130,246,0.10), transparent 60%)' }} />

        {/* Flecha para cerrar (igual que el modal de Compartir) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="relative z-10 flex justify-center items-center pt-3 pb-1 shrink-0 active:scale-90 transition"
        >
          <ChevronDown className="w-5 h-5 text-zinc-500" strokeWidth={2.2} />
        </button>

        {/* Header */}
        <div className="relative z-10 flex items-center gap-3 px-5 pt-1 pb-4">
          <div className="w-9 h-9 rounded-full p-[2px] shrink-0" style={{ background: `linear-gradient(135deg, ${PURPLE}, ${BLUE})` }}>
            <div className="w-full h-full rounded-full overflow-hidden bg-zinc-100 flex items-center justify-center">
              <Avatar src={target?.author?.avatarUrl} alt={username} className="w-full h-full rounded-full" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-zinc-500 flex items-center gap-1">
              <Swords size={11} strokeWidth={2.4} /> Challenge
            </p>
            <h2 className="text-zinc-900 text-[15px] font-bold tracking-tight leading-tight truncate">Challenge @{username}</h2>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-7 space-y-5"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>
          <>
              {/* Enfrentamiento: tu vídeo (A, morado) vs el contenido retado (B, azul) */}
              <div className="relative grid grid-cols-2 gap-3.5">
                <input ref={inputRef} type="file" accept="video/*,image/*" className="hidden" onChange={handleFileChange} />

                {/* Tu vídeo */}
                <button
                  onClick={pickFile}
                  className="group relative w-full aspect-[4/5] rounded-2xl overflow-hidden transition active:scale-[0.98]"
                  style={{
                    background: file ? '#000' : 'linear-gradient(160deg, rgba(168,85,247,0.16), rgba(168,85,247,0.04))',
                    boxShadow: file ? `0 0 0 2px ${PURPLE}` : `inset 0 0 0 1.5px rgba(168,85,247,0.45)`,
                  }}
                >
                  <span className="absolute top-2 left-2 z-20 text-[10px] font-bold rounded-full px-2.5 py-0.5 text-white" style={{ background: PURPLE }}>You</span>
                  {file ? (
                    <>
                      {fileIsImage ? (
                        <img src={URL.createObjectURL(file)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <video src={URL.createObjectURL(file)} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1.5">
                        <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: PURPLE }}>
                          <Check size={20} className="text-white" strokeWidth={2.6} />
                        </span>
                        <span className="text-[11px] text-white/90 underline underline-offset-2">{fileIsImage ? 'Change photo' : 'Change video'}</span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.2)' }}>
                        <Upload size={22} style={{ color: PURPLE }} strokeWidth={2} />
                      </span>
                      <div className="text-center leading-tight">
                        <p className="text-[12px] font-semibold text-zinc-900">Upload your video or photo</p>
                        <p className="text-[10.5px] text-zinc-500 mt-0.5">Record or pick one</p>
                      </div>
                    </div>
                  )}
                </button>

                {/* Vídeo retado */}
                <div
                  className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden"
                  style={{
                    background: targetMediaUrl ? '#000' : 'linear-gradient(160deg, rgba(59,130,246,0.16), rgba(59,130,246,0.04))',
                    boxShadow: `inset 0 0 0 1.5px rgba(59,130,246,0.4)`,
                  }}
                >
                  <span className="absolute top-2 left-2 z-20 text-[10px] font-bold rounded-full px-2.5 py-0.5 text-white truncate max-w-[80%]" style={{ background: BLUE }}>@{username}</span>
                  {targetMediaUrl ? (
                    targetIsImage ? (
                      <img src={targetMediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <video src={target.videoUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 text-center">
                      <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.18)' }}>
                        <Film size={22} style={{ color: BLUE }} strokeWidth={1.8} />
                      </span>
                      <p className="text-[10.5px] text-zinc-500 leading-tight">They&apos;ll upload their media<br />when accepting the challenge</p>
                    </div>
                  )}
                </div>

                {/* Insignia VS al centro con anillo de gradiente */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${PURPLE}, ${BLUE})`, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                    <span className="text-white font-black text-[13px] tracking-wide italic">VS</span>
                  </div>
                </div>
              </div>

              {/* Mensaje opcional */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message to the challenge (optional)…"
                rows={2}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 resize-none transition"
              />

              <p className="text-[12px] text-zinc-500 leading-relaxed">
                A challenge request will be sent to <span className="text-zinc-700 font-medium">@{username}</span>. When they accept it, it will be published as a versus (you vs {target?.author?.name || 'rival'}).
              </p>

              {error && <div className="text-[12px] text-rose-500">{error}</div>}

              <button
                onClick={doSend}
                disabled={!file}
                className={`w-full h-12 rounded-full font-bold text-[15px] flex items-center justify-center gap-2 disabled:cursor-not-allowed active:scale-[0.99] transition ${file ? 'text-white' : 'text-zinc-400'}`}
                style={file
                  ? { background: `linear-gradient(135deg, ${PURPLE}, ${BLUE})`, boxShadow: '0 10px 30px -8px rgba(99,102,241,0.6)' }
                  : { background: '#e4e4e7' }}
              >
                <Swords className="w-[18px] h-[18px]" strokeWidth={2.2} />
                Send challenge
              </button>
          </>
        </div>
      </div>
    </div>
  )
}
