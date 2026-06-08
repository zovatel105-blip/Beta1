'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState en efectos de carga/reset async; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Loader2, Film, Swords, Users, Rows3, Columns3, ArrowLeft, X } from 'lucide-react'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'

/**
 * UploadDialog — flujo multi-paso para crear publicaciones de votación: Versus
 * (carrusel de 2 vídeos A/B) o 1vs1 (dueto). Diseño premium minimalista (móvil).
 *
 * Pasos para Versus:  mode -> file -> upload
 * Pasos para 1vs1:    mode -> layout -> pair -> file -> upload
 */
const GOLD = '#E4C79B'

/**
 * PreviewSlot — un "slot" de vídeo a pantalla completa con el mismo estilo que
 * los Retos activos: vídeo en object-cover, degradado oscuro, etiqueta del lado
 * y botón "Cambiar". Si no hay vídeo, muestra el estado para subir.
 */
const PreviewSlot = ({ url, badge, badgeColor, onPick }) => (
  <div className="relative w-full h-full bg-black">
    {url ? (
      <>
        <video src={url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/40" />
        <span className="absolute top-3 left-3 z-10 text-[11px] font-bold bg-black/45 backdrop-blur rounded-full px-2.5 py-1" style={{ color: badgeColor }}>{badge}</span>
        <button onClick={onPick} className="absolute top-3 right-3 z-10 text-[11px] font-semibold text-white bg-black/55 hover:bg-black/80 active:scale-95 rounded-full px-3 py-1 transition">Cambiar</button>
      </>
    ) : (
      <button onClick={onPick} className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2.5 bg-white/[0.02] hover:bg-white/[0.05] transition">
        <span className="absolute top-3 left-3 z-10 text-[11px] font-bold bg-black/45 rounded-full px-2.5 py-1" style={{ color: badgeColor }}>{badge}</span>
        <div className="w-14 h-14 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <Film size={26} strokeWidth={1.5} className="text-zinc-400" />
        </div>
        <span className="text-sm font-medium text-zinc-300">Toca para subir el vídeo</span>
        <span className="text-[10px] text-zinc-500">MP4 / WebM · max 80MB</span>
      </button>
    )}
  </div>
)

export default function UploadDialog({ open, onClose, onUploaded, onChallengeCreated }) {
  const inputRef = useRef(null)
  const inputBRef = useRef(null)
  const [step, setStep] = useState('mode') // mode | layout | pair | file | uploading
  const [mode, setMode] = useState(null) // 'versus' | 'duet'
  const [layout, setLayout] = useState('horizontal') // 'horizontal' | 'vertical'
  const [pair, setPair] = useState(null)
  const [options, setOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState('versus')
  const [previewA, setPreviewA] = useState(null)
  const [previewB, setPreviewB] = useState(null)
  const [pvSide, setPvSide] = useState(0)

  // URLs de previsualización memorizadas (evita recrearlas en cada render,
  // lo que reiniciaría el vídeo al escribir la descripción).
  useEffect(() => {
    if (!file) { setPreviewA(null); return }
    const url = URL.createObjectURL(file)
    setPreviewA(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    if (!fileB) { setPreviewB(null); return }
    const url = URL.createObjectURL(fileB)
    setPreviewB(url)
    return () => URL.revokeObjectURL(url)
  }, [fileB])

  const reset = () => {
    setStep('mode'); setMode(null); setLayout('horizontal'); setPair(null)
    setFile(null); setFileB(null); setDescription(''); setProgress(0); setError(null)
    setSelected('versus')
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
    if (mode === 'versus') {
      if (!file || !fileB) { setError('Sube los 2 vídeos (A y B)'); return }
    } else if (mode === 'challenge') {
      if (!file || !pair) { setError('Elige un rival y sube tu vídeo'); return }
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
      } else if (mode === 'challenge') {
        xhr.open('POST', '/api/challenges')
        fd.append('file', file)
        fd.append('targetVideoUrl', pair.videoUrl)
        fd.append('targetAuthor', JSON.stringify(pair.author))
        fd.append('targetDescription', pair.description || '')
        fd.append('targetMusic', pair.music || '')
        fd.append('message', description || '')
      } else {
        xhr.open('POST', '/api/versus')
        fd.append('fileA', file)
        fd.append('fileB', fileB)
        fd.append('description', description || '¿Cuál prefieres? 🅰️🆚🅱️')
      }
      xhr.send(fd)
      const data = await promise
      if (mode === 'challenge') {
        if (onChallengeCreated) onChallengeCreated()
      } else if (onUploaded && data?.post) {
        onUploaded(data.post)
      }
      onClose()
    } catch (err) {
      console.error(err)
      setError('Error al subir')
      setStep('file')
    }
  }

  if (!open) return null

  const goBack = () => {
    if (step === 'layout') setStep('mode')
    else if (step === 'pair') setStep(mode === 'duet' ? 'layout' : 'mode')
    else if (step === 'file') setStep(mode === 'versus' ? 'mode' : 'pair')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0b] flex flex-col text-white">
      {/* Glow superior sutil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(214,178,122,0.07), transparent 70%)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-1">
          {step !== 'mode' && step !== 'uploading' ? (
            <button onClick={goBack} aria-label="Atrás" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition">
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
          ) : (
            <span className="w-1.5" />
          )}
          <h1 className="text-[17px] font-semibold tracking-tight">
            {step === 'mode' && 'Crear contenido'}
            {step === 'layout' && 'Elige el formato'}
            {step === 'pair' && 'Elige el rival'}
            {step === 'file' && (mode === 'versus' ? 'Tus 2 vídeos' : mode === 'challenge' ? 'Tu vídeo del reto' : 'Tu lado del duelo')}
            {step === 'uploading' && (mode === 'challenge' ? 'Enviando reto' : 'Subiendo')}
          </h1>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-zinc-400 hover:text-white">
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pt-2 pb-10">
        {/* STEP: mode — control segmentado (estilo referencia) */}
        {step === 'mode' && (
          <div className="max-w-md mx-auto">
            {/* Control segmentado */}
            <div className="flex justify-center mb-9">
              <div className="inline-flex p-1 rounded-full bg-white/[0.06] border border-white/10">
                <button
                  onClick={() => setSelected('versus')}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ${selected === 'versus' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  Versus
                </button>
                <button
                  onClick={() => setSelected('duet')}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ${selected === 'duet' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  1 vs 1
                </button>
                <button
                  onClick={() => setSelected('challenge')}
                  className={`px-4 py-2 rounded-full text-[13px] font-semibold transition ${selected === 'challenge' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'}`}
                >
                  Retos
                </button>
              </div>
            </div>

            {/* Preview del modo seleccionado */}
            <div className="flex flex-col items-center text-center">
              <div
                className="w-20 h-20 rounded-3xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-6"
                style={{ boxShadow: '0 0 48px -14px rgba(214,178,122,0.42)' }}
              >
                {selected === 'versus' && <Film className="w-9 h-9" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'duet' && <Users className="w-9 h-9" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'challenge' && <Swords className="w-9 h-9" strokeWidth={1.25} style={{ color: GOLD }} />}
              </div>

              <h2 className="text-white text-[22px] font-semibold tracking-tight">
                {selected === 'versus' && 'Versus (carrusel)'}
                {selected === 'duet' && '1 vs 1 (Dueto)'}
                {selected === 'challenge' && 'Reto a un creador'}
              </h2>
              <p className="text-zinc-400 text-[15px] mt-2 max-w-[18rem] leading-relaxed">
                {selected === 'versus' && 'Sube 2 vídeos (A y B) y deja que la gente vote deslizando entre ellos.'}
                {selected === 'duet' && 'Empareja tu vídeo con el de otro creador y que la gente decida quién gana.'}
                {selected === 'challenge' && 'Sube tu vídeo y reta a un creador. Aparecerá en sus retos activos para que lo acepte.'}
              </p>

              {/* Mini ilustración del formato */}
              {selected === 'challenge' ? (
                <div className="mt-7 flex items-center gap-3">
                  <div className="w-16 h-24 rounded-2xl border border-white/[0.08] bg-white/[0.06] flex items-center justify-center text-white/80 text-[11px] font-bold">TÚ</div>
                  <span className="text-white/60 font-black text-sm">VS</span>
                  <div className="w-16 h-24 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-white/40 text-[11px] font-bold">RIVAL</div>
                </div>
              ) : (
                <div className="mt-7 w-40 h-28 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2 flex gap-2">
                  <div className="flex-1 rounded-xl bg-white/10 flex items-center justify-center text-white/70 text-sm font-bold">A</div>
                  <div className="flex-1 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/50 text-sm font-bold">B</div>
                </div>
              )}

              <button
                onClick={() => {
                  if (selected === 'versus') { setMode('versus'); setStep('file') }
                  else if (selected === 'duet') { setMode('duet'); setStep('layout') }
                  else { setMode('challenge'); setStep('pair') }
                }}
                className="mt-8 w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition"
              >
                Continuar
                <ChevronRight size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* STEP: layout */}
        {step === 'layout' && (
          <div className="max-w-md mx-auto grid grid-cols-2 gap-3">
            <button
              onClick={() => { setLayout('horizontal'); setStep('pair') }}
              className={`p-4 rounded-2xl border bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.98] transition flex flex-col items-center gap-3 ${layout === 'horizontal' ? 'border-white/70' : 'border-white/[0.08]'}`}
            >
              <div className="w-20 h-32 rounded-xl bg-zinc-900 overflow-hidden flex flex-col gap-[2px] p-[2px]">
                <div className="flex-1 bg-white/10 rounded-md flex items-center justify-center text-xs font-bold text-white/80">A</div>
                <div className="flex-1 bg-white/[0.06] rounded-md flex items-center justify-center text-xs font-bold text-white/60">B</div>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Rows3 size={14} /> Horizontal
              </div>
              <div className="text-[11px] text-zinc-500 -mt-2">Arriba / Abajo</div>
            </button>
            <button
              onClick={() => { setLayout('vertical'); setStep('pair') }}
              className={`p-4 rounded-2xl border bg-white/[0.03] hover:bg-white/[0.06] active:scale-[0.98] transition flex flex-col items-center gap-3 ${layout === 'vertical' ? 'border-white/70' : 'border-white/[0.08]'}`}
            >
              <div className="w-20 h-32 rounded-xl bg-zinc-900 overflow-hidden flex gap-[2px] p-[2px]">
                <div className="flex-1 bg-white/10 rounded-md flex items-center justify-center text-xs font-bold text-white/80">A</div>
                <div className="flex-1 bg-white/[0.06] rounded-md flex items-center justify-center text-xs font-bold text-white/60">B</div>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Columns3 size={14} /> Vertical
              </div>
              <div className="text-[11px] text-zinc-500 -mt-2">Izquierda / Derecha</div>
            </button>
          </div>
        )}

        {/* STEP: pair */}
        {step === 'pair' && (
          <div className="max-w-md mx-auto">
            <p className="text-[13px] text-zinc-500 mb-4">Elige el vídeo contra el que vas a competir.</p>
            {optionsLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { setPair(opt); setStep('file') }}
                    className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.08] hover:border-white/60 active:scale-95 transition"
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
                        <span className="text-[10px] font-medium truncate">@{opt.author?.username}</span>
                      </div>
                    </div>
                    {opt.source === 'upload' && (
                      <span className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-black" style={{ background: GOLD }}>TUYO</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP: file */}
        {step === 'file' && (
          <div className="max-w-md mx-auto space-y-4">
            {(mode === 'duet' || mode === 'challenge') && pair && (
              <div className="flex items-center gap-2 p-2.5 bg-white/[0.03] rounded-xl border border-white/[0.08]">
                <span className="text-[11px] text-zinc-500">vs</span>
                <img src={pair.author?.avatarUrl} className="w-7 h-7 rounded-full" alt="" />
                <div className="text-[13px] font-medium">@{pair.author?.username}</div>
                <div className="ml-auto text-[11px] text-zinc-500">{layout === 'horizontal' ? 'Arriba/Abajo' : 'Izq/Der'}</div>
              </div>
            )}

            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange('a')} />
            <input ref={inputBRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange('b')} />

            {mode === 'versus' ? (
              <div className="relative w-full aspect-[9/16] max-h-[70vh] mx-auto rounded-3xl overflow-hidden border border-white/10 bg-black">
                <Swiper
                  direction="horizontal"
                  slidesPerView={1}
                  spaceBetween={0}
                  onSlideChange={(s) => setPvSide(s.activeIndex)}
                  className="w-full h-full"
                >
                  <SwiperSlide>
                    <PreviewSlot url={previewA} badge="A · @tu_canal" badgeColor={GOLD} onPick={pickFile} />
                  </SwiperSlide>
                  <SwiperSlide>
                    <PreviewSlot url={previewB} badge="B · @tu_canal" badgeColor="#FFFFFF" onPick={pickFileB} />
                  </SwiperSlide>
                </Swiper>

                {/* Pista para deslizar */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-black/45 backdrop-blur text-white/90 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                  Desliza para ver A / B
                </div>

                {/* Panel inferior premium (estilo retos activos) */}
                <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pointer-events-none">
                  <div className="flex items-center justify-center gap-1.5 mb-2.5">
                    {[0, 1].map((i) => (
                      <span key={i} className={`rounded-full transition-all duration-200 ${pvSide === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`} />
                    ))}
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold" style={{ color: GOLD }}>Opción A</span>
                      <span className="text-white/90 font-black text-sm">VS</span>
                      <span className="text-[12px] font-bold text-white">Opción B</span>
                    </div>
                    <p className="text-[13px] text-zinc-200 mt-2 line-clamp-2">{description || '¿Cuál prefieres? 🅰️🆚🅱️'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full aspect-[9/16] max-h-[70vh] mx-auto rounded-3xl overflow-hidden border border-white/10 bg-black">
                <PreviewSlot url={previewA} badge={mode === 'challenge' ? 'TÚ · @tu_canal' : 'A · @tu_canal'} badgeColor={GOLD} onPick={pickFile} />

                {/* Panel inferior premium (estilo retos activos) */}
                {file && (
                  <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-3 pointer-events-none">
                    <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl p-3.5">
                      {(mode === 'duet' || mode === 'challenge') && pair && (
                        <div className="flex items-center justify-between gap-3 mb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <img src={pair.author?.avatarUrl} className="w-7 h-7 rounded-full shrink-0" alt="" />
                            <span className="text-[13px] font-semibold text-white truncate">
                              {mode === 'challenge' ? 'Reto a' : 'vs'} @{pair.author?.username}
                            </span>
                          </div>
                          <span className="text-white/90 font-black text-sm shrink-0">VS</span>
                        </div>
                      )}
                      <p className="text-[13px] text-zinc-200 line-clamp-2">
                        {description || (mode === 'duet' ? '¿Quién gana? 🥊 #1vs1' : mode === 'challenge' ? 'Reto 🔥 ¿Aceptas?' : '¿Cuál prefieres? 🅰️🆚🅱️')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={mode === 'duet' ? '¿Quién gana? 🥊 #1vs1' : '¿Cuál prefieres? 🅰️🆚🅱️'}
              rows={2}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition resize-none"
            />

            {error && <div className="text-xs text-rose-400">{error}</div>}

            <button
              onClick={doUpload}
              disabled={mode === 'versus' ? (!file || !fileB) : !file}
              className="w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] disabled:bg-white/10 disabled:text-white/40 hover:bg-zinc-100 active:scale-[0.99] transition"
            >
              {mode === 'duet' ? 'Publicar 1vs1' : mode === 'challenge' ? 'Enviar reto' : 'Publicar versus'}
            </button>
          </div>
        )}

        {/* STEP: uploading */}
        {step === 'uploading' && (
          <div className="max-w-xs mx-auto flex flex-col items-center justify-center pt-28 gap-5 text-center">
            <div className="w-16 h-16 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center"
                 style={{ boxShadow: '0 0 48px -14px rgba(214,178,122,0.45)' }}>
              <Loader2 size={28} className="animate-spin" style={{ color: GOLD }} />
            </div>
            <div className="text-2xl font-semibold tracking-tight">{progress}%</div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${progress}%`, background: GOLD }} />
            </div>
            <div className="text-[13px] text-zinc-500">{mode === 'challenge' ? 'Enviando tu reto…' : mode === 'duet' ? 'Creando tu 1vs1…' : 'Subiendo tu versus…'}</div>
          </div>
        )}
      </div>
    </div>
  )
}
