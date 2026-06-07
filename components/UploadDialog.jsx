'use client'

import { useEffect, useRef, useState } from 'react'
import { X, ChevronRight, Loader2, Film, Swords, Rows3, Columns3, Check, ArrowLeft } from 'lucide-react'

/**
 * UploadDialog — flujo multi-paso para subir vídeos normales o 1vs1 (dueto).
 *
 * Pasos para Normal:  mode -> file -> upload
 * Pasos para 1vs1:    mode -> layout -> pair -> file -> upload
 */
export default function UploadDialog({ open, onClose, onUploaded }) {
  const inputRef = useRef(null)
  const inputBRef = useRef(null)
  const [step, setStep] = useState('mode') // mode | layout | pair | file | uploading
  const [mode, setMode] = useState(null) // 'normal' | 'duet'
  const [layout, setLayout] = useState('horizontal') // 'horizontal' | 'vertical'
  const [pair, setPair] = useState(null)
  const [options, setOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  const reset = () => {
    setStep('mode'); setMode(null); setLayout('horizontal'); setPair(null)
    setFile(null); setFileB(null); setDescription(''); setProgress(0); setError(null)
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  // Fetch pair options when entering 'pair' step
  useEffect(() => {
    if (step !== 'pair') return
    setOptionsLoading(true)
    fetch('/api/feed-options')
      .then((r) => r.json())
      .then((d) => setOptions(d.options || []))
      .catch(() => setOptions([]))
      .finally(() => setOptionsLoading(false))
  }, [step])

  const pickFile = () => inputRef.current?.click()
  const pickFileB = () => inputBRef.current?.click()

  const handleFileChange = (slot) => (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('video/')) { setError('Selecciona un vídeo'); return }
    if (f.size > 80 * 1024 * 1024) { setError('Máximo 80MB'); return }
    setError(null)
    if (slot === 'b') setFileB(f)
    else setFile(f)
  }

  const doUpload = async () => {
    // normal -> versus necesita 2 vídeos; duet necesita 1 + pareja
    if (mode === 'normal') {
      if (!file || !fileB) { setError('Sube los 2 vídeos (A y B)'); return }
    } else if (!file) {
      return
    }
    setStep('uploading')
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
          } else reject(new Error('upload failed ' + xhr.status))
        }
        xhr.onerror = () => reject(new Error('network'))
      })
      const fd = new FormData()
      if (mode === 'duet') {
        xhr.open('POST', '/api/duet')
        fd.append('file', file)
        fd.append('layout', layout)
        fd.append('pairVideoUrl', pair.videoUrl)
        fd.append('pairAuthor', JSON.stringify(pair.author))
        fd.append('pairMusic', pair.music || '')
        fd.append('pairDescription', pair.description || '')
        fd.append('description', description || '¿Quién gana? 🥊 #1vs1')
      } else {
        xhr.open('POST', '/api/versus')
        fd.append('fileA', file)
        fd.append('fileB', fileB)
        fd.append('description', description || '¿Cuál prefieres? 🅰️🆚🅱️')
      }
      xhr.send(fd)
      const data = await promise
      if (onUploaded && data?.post) onUploaded(data.post)
      onClose()
    } catch (err) {
      console.error(err)
      setError('Error al subir')
      setStep('file')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl bg-zinc-950 border border-white/10 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            {step !== 'mode' && step !== 'uploading' && (
              <button
                onClick={() => {
                  if (step === 'layout') setStep('mode')
                  else if (step === 'pair') setStep('layout')
                  else if (step === 'file') setStep(mode === 'duet' ? 'pair' : 'mode')
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="font-bold text-base">
              {step === 'mode' && 'Nueva publicación'}
              {step === 'layout' && 'Elige el formato'}
              {step === 'pair' && 'Elige el rival'}
              {step === 'file' && (mode === 'duet' ? 'Tu lado del duelo' : 'Tus 2 vídeos (A / B)')}
              {step === 'uploading' && 'Subiendo…'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* STEP: mode */}
          {step === 'mode' && (
            <div className="space-y-3">
              <button
                onClick={() => { setMode('normal'); setStep('file') }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
                  <Film size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-bold">Versus (carrusel)</div>
                  <div className="text-xs text-white/60">Sube 2 vídeos (A y B) y deja que voten deslizando</div>
                </div>
                <ChevronRight size={20} className="text-white/40" />
              </button>
              <button
                onClick={() => { setMode('duet'); setStep('layout') }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.98] transition text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-rose-500 flex items-center justify-center">
                  <Swords size={24} />
                </div>
                <div className="flex-1">
                  <div className="font-bold">1 vs 1 (Dueto)</div>
                  <div className="text-xs text-white/60">Empareja tu vídeo con otro y deja que voten</div>
                </div>
                <ChevronRight size={20} className="text-white/40" />
              </button>
            </div>
          )}

          {/* STEP: layout */}
          {step === 'layout' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setLayout('horizontal'); setStep('pair') }}
                className={`p-4 rounded-2xl border bg-white/5 hover:bg-white/10 active:scale-[0.98] transition flex flex-col items-center gap-2 ${layout === 'horizontal' ? 'border-rose-500' : 'border-white/10'}`}
              >
                <div className="w-20 h-32 rounded-lg bg-zinc-900 overflow-hidden flex flex-col gap-[2px] p-[2px]">
                  <div className="flex-1 bg-gradient-to-br from-rose-500 to-pink-500 rounded-md flex items-center justify-center text-xs font-bold">A</div>
                  <div className="flex-1 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-md flex items-center justify-center text-xs font-bold text-black">B</div>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <Rows3 size={14} /> Horizontal
                </div>
                <div className="text-[10px] text-white/50">Arriba / Abajo</div>
              </button>
              <button
                onClick={() => { setLayout('vertical'); setStep('pair') }}
                className={`p-4 rounded-2xl border bg-white/5 hover:bg-white/10 active:scale-[0.98] transition flex flex-col items-center gap-2 ${layout === 'vertical' ? 'border-rose-500' : 'border-white/10'}`}
              >
                <div className="w-20 h-32 rounded-lg bg-zinc-900 overflow-hidden flex gap-[2px] p-[2px]">
                  <div className="flex-1 bg-gradient-to-br from-rose-500 to-pink-500 rounded-md flex items-center justify-center text-xs font-bold">A</div>
                  <div className="flex-1 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-md flex items-center justify-center text-xs font-bold text-black">B</div>
                </div>
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <Columns3 size={14} /> Vertical
                </div>
                <div className="text-[10px] text-white/50">Izquierda / Derecha</div>
              </button>
            </div>
          )}

          {/* STEP: pair */}
          {step === 'pair' && (
            <div>
              <p className="text-xs text-white/60 mb-3">Elige el vídeo contra el que vas a competir.</p>
              {optionsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {options.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => { setPair(opt); setStep('file') }}
                      className="relative aspect-[9/16] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-rose-500 active:scale-95 transition"
                    >
                      <video
                        src={opt.videoUrl + '#t=0.2'}
                        muted
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                        <div className="flex items-center gap-1.5">
                          <img src={opt.author?.avatarUrl} className="w-5 h-5 rounded-full" alt="" />
                          <span className="text-[10px] font-semibold truncate">@{opt.author?.username}</span>
                        </div>
                      </div>
                      {opt.source === 'upload' && (
                        <span className="absolute top-1.5 left-1.5 bg-rose-500 text-[9px] font-bold px-1.5 py-0.5 rounded-full">TUYO</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP: file */}
          {step === 'file' && (
            <div className="space-y-4">
              {mode === 'duet' && pair && (
                <div className="flex items-center gap-2 p-2 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-xs text-white/60">vs</span>
                  <img src={pair.author?.avatarUrl} className="w-7 h-7 rounded-full" alt="" />
                  <div className="text-xs font-semibold">@{pair.author?.username}</div>
                  <div className="ml-auto text-[10px] text-white/50">{layout === 'horizontal' ? 'Arriba/Abajo' : 'Izq/Der'}</div>
                </div>
              )}

              <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange('a')} />
              <input ref={inputBRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange('b')} />

              {mode === 'normal' ? (
                /* Versus: dos cajas (A / B) */
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={pickFile}
                    className="w-full aspect-[9/16] rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 active:scale-[0.99] transition flex flex-col items-center justify-center gap-2 overflow-hidden relative"
                  >
                    <span className="absolute top-1.5 left-1.5 z-10 text-[11px] font-bold text-rose-400 bg-black/50 rounded-full px-2 py-0.5">Opción A</span>
                    {file ? (
                      <>
                        <video src={URL.createObjectURL(file)} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                          <Check size={28} className="text-emerald-400" />
                          <span className="text-[10px] text-white/60 mt-1 underline">Cambiar</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Film size={28} className="text-white/40" />
                        <span className="text-[11px] font-semibold text-center px-1">Elegir vídeo A</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={pickFileB}
                    className="w-full aspect-[9/16] rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 active:scale-[0.99] transition flex flex-col items-center justify-center gap-2 overflow-hidden relative"
                  >
                    <span className="absolute top-1.5 left-1.5 z-10 text-[11px] font-bold text-cyan-300 bg-black/50 rounded-full px-2 py-0.5">Opción B</span>
                    {fileB ? (
                      <>
                        <video src={URL.createObjectURL(fileB)} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                          <Check size={28} className="text-emerald-400" />
                          <span className="text-[10px] text-white/60 mt-1 underline">Cambiar</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Film size={28} className="text-white/40" />
                        <span className="text-[11px] font-semibold text-center px-1">Elegir vídeo B</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Dueto: una caja */
                <button
                  onClick={pickFile}
                  className="w-full aspect-[9/16] max-h-72 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 hover:bg-white/10 active:scale-[0.99] transition flex flex-col items-center justify-center gap-2 overflow-hidden relative"
                >
                  {file ? (
                    <>
                      <video src={URL.createObjectURL(file)} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                        <Check size={32} className="text-emerald-400" />
                        <span className="text-xs font-semibold mt-1">{file.name}</span>
                        <span className="text-[10px] text-white/60 mt-1 underline">Cambiar</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Film size={36} className="text-white/40" />
                      <span className="text-sm font-semibold">Toca para elegir un vídeo</span>
                      <span className="text-[10px] text-white/40">MP4 / WebM · max 80MB</span>
                    </>
                  )}
                </button>
              )}

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === 'duet' ? '¿Quién gana? 🥊 #1vs1' : '¿Cuál prefieres? 🅰️🆚🅱️'}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-rose-500"
              />

              {error && <div className="text-xs text-rose-400">{error}</div>}

              <button
                onClick={doUpload}
                disabled={mode === 'normal' ? (!file || !fileB) : !file}
                className="w-full bg-rose-500 disabled:bg-white/10 disabled:text-white/40 hover:bg-rose-600 active:scale-[0.98] transition rounded-full py-3 font-bold"
              >
                {mode === 'duet' ? 'Publicar 1vs1' : 'Publicar versus'}
              </button>
            </div>
          )}

          {/* STEP: uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <Loader2 size={36} className="animate-spin" />
              <div className="text-sm font-semibold">{progress}%</div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-rose-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-white/60">{mode === 'duet' ? 'Creando 1vs1…' : 'Subiendo tu vídeo…'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
