'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState en efectos de carga/reset async; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Loader2, Film, Swords, Users, Rows3, Columns3, ArrowLeft, X } from 'lucide-react'

/**
 * UploadDialog — flujo multi-paso para crear publicaciones de votación: Versus
 * (2 vídeos A/B), 1vs1 (2 vídeos A/B con formato) o Reto (tu vídeo + elegir a quién retar).
 * Diseño premium minimalista (móvil) con vista previa a pantalla completa.
 */
const GOLD = '#E4C79B'

export default function UploadDialog({ open, onClose, onUploaded, onChallengeCreated }) {
  const inputRef = useRef(null)
  const inputBRef = useRef(null)
  const versusTouchX = useRef(0)
  const [step, setStep] = useState('mode') // mode | layout | target | file | uploading
  const [mode, setMode] = useState(null) // 'versus' | 'duet' | 'challenge'
  const [layout, setLayout] = useState('horizontal') // 'horizontal' | 'vertical'
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [target, setTarget] = useState(null) // usuario al que retar
  const [file, setFile] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState('versus')
  const [previewA, setPreviewA] = useState(null)
  const [previewB, setPreviewB] = useState(null)
  const [versusIdx, setVersusIdx] = useState(0) // slide activo en la vista previa carrusel (versus)

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
    setStep('mode'); setMode(null); setLayout('horizontal'); setTarget(null); setUsers([])
    setFile(null); setFileB(null); setDescription(''); setProgress(0); setError(null)
    setSelected('versus'); setVersusIdx(0)
  }

  useEffect(() => {
    if (!open) reset()
  }, [open])

  // Carga la lista de creadores al entrar en el paso 'target' (a quién retar).
  useEffect(() => {
    if (step !== 'target') return
    setUsersLoading(true)
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false))
  }, [step])

  const pickFile = () => inputRef.current?.click()
  const pickFileB = () => inputBRef.current?.click()

  // Versus: cambiar entre vídeo A / B deslizando (un toque sin movimiento abre el selector).
  const onVersusTouchStart = (e) => { versusTouchX.current = e.touches[0]?.clientX ?? 0 }
  const onVersusTouchEnd = (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - versusTouchX.current
    if (dx < -40) setVersusIdx(1)
    else if (dx > 40) setVersusIdx(0)
  }

  const handleFileChange = (slot) => (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('video/')) { setError('Selecciona un vídeo'); return }
    if (f.size > 80 * 1024 * 1024) { setError('Máximo 80MB'); return }
    setError(null)
    if (slot === 'b') setFileB(f)
    else setFile(f)
  }

  const goToTarget = () => {
    if (!file) { setError('Sube tu vídeo del reto'); return }
    setError(null)
    setStep('target')
  }

  const doUpload = async (targetUser) => {
    const tgt = targetUser || target
    if (mode === 'versus' || mode === 'duet') {
      if (!file || !fileB) { setError('Sube los 2 vídeos (A y B)'); return }
    } else if (mode === 'challenge') {
      if (!file) { setError('Sube tu vídeo'); return }
      if (!tgt) { setError('Elige a quién retar'); return }
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
        fd.append('fileA', file)
        fd.append('fileB', fileB)
        fd.append('layout', layout)
        fd.append('description', description || '¿Quién gana? 🥊 #1vs1')
      } else if (mode === 'challenge') {
        xhr.open('POST', '/api/challenges')
        fd.append('file', file)
        fd.append('targetAuthor', JSON.stringify(tgt))
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
      setStep(mode === 'challenge' ? 'target' : 'file')
    }
  }

  if (!open) return null

  const goBack = () => {
    if (step === 'target') setStep('file')
    else if (step === 'file') setStep('mode')
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
            {step === 'target' && 'Elige a quién retar'}
            {step === 'file' && (mode === 'versus' ? 'Tus 2 vídeos' : mode === 'challenge' ? 'Tu vídeo del reto' : 'Tu 1vs1')}
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
          <div className="max-w-md mx-auto w-full min-h-full flex flex-col">
            {/* Control segmentado */}
            <div className="flex justify-center mt-2 mb-2">
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

            {/* Preview del modo seleccionado — centrado y ocupando el alto disponible */}
            <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
              <div
                className="w-24 h-24 rounded-[28px] bg-white/[0.04] border border-white/10 flex items-center justify-center mb-7"
                style={{ boxShadow: '0 0 60px -14px rgba(214,178,122,0.45)' }}
              >
                {selected === 'versus' && <Film className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'duet' && <Users className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
                {selected === 'challenge' && <Swords className="w-11 h-11" strokeWidth={1.25} style={{ color: GOLD }} />}
              </div>

              <p className="text-zinc-400 text-[15px] max-w-[19rem] leading-relaxed">
                {selected === 'versus' && 'Sube 2 vídeos (A y B) y deja que la gente vote deslizando entre ellos.'}
                {selected === 'duet' && 'Sube 2 vídeos (A y B) con el formato que elijas y deja que la gente vote quién gana.'}
                {selected === 'challenge' && 'Sube tu vídeo y reta a un creador. Aparecerá en sus retos activos para que lo acepte.'}
              </p>

              {/* Mini ilustración del formato */}
              {selected === 'challenge' ? (
                <div className="mt-10 flex items-center gap-4">
                  <div className="w-20 h-28 rounded-2xl border border-white/[0.08] bg-white/[0.06] flex items-center justify-center text-white/80 text-[12px] font-bold">TÚ</div>
                  <span className="text-white/60 font-black text-base">VS</span>
                  <div className="w-20 h-28 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-center text-white/40 text-[12px] font-bold">RIVAL</div>
                </div>
              ) : (
                <div className="mt-10 w-48 h-32 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-2.5 flex gap-2.5">
                  <div className="flex-1 rounded-xl bg-white/10 flex items-center justify-center text-white/70 text-base font-bold">A</div>
                  <div className="flex-1 rounded-xl bg-white/[0.06] flex items-center justify-center text-white/50 text-base font-bold">B</div>
                </div>
              )}
            </div>

            {/* Botón fijado abajo */}
            <button
              onClick={() => {
                if (selected === 'versus') { setMode('versus'); setStep('file') }
                else if (selected === 'duet') { setMode('duet'); setStep('file') }
                else { setMode('challenge'); setStep('file') }
              }}
              className="mt-4 mb-2 w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition"
            >
              Continuar
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* STEP: target — elegir a quién retar (después de subir tu vídeo) */}
        {step === 'target' && (
          <div className="max-w-md mx-auto">
            <p className="text-[13px] text-zinc-500 mb-4">Elige a quién retar. Le aparecerá en sus retos activos para aceptar.</p>
            {usersLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <button
                    key={u.username}
                    onClick={() => { setTarget(u); doUpload(u) }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/40 active:scale-[0.99] transition text-left"
                  >
                    <img src={u.avatarUrl} className="w-11 h-11 rounded-full object-cover ring-1 ring-white/10 shrink-0" alt="" />
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold truncate">{u.name || u.username}</div>
                      <div className="text-[12px] text-zinc-500 truncate">@{u.username}</div>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full text-black shrink-0" style={{ background: GOLD }}>
                      <Swords size={13} strokeWidth={2.2} /> Retar
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && <div className="text-xs text-rose-400 mt-4">{error}</div>}
          </div>
        )}

        {/* STEP: file — vista previa a PANTALLA COMPLETA */}
        {step === 'file' && (
          <div className="fixed inset-0 z-30 bg-black flex flex-col">
            <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange('a')} />
            <input ref={inputBRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange('b')} />

            {(() => {
              const isAB = mode === 'versus' || mode === 'duet'

              // Una mitad del split (lado A o B): vídeo o estado para subir.
              const renderSlot = (idx, rootClass = 'relative flex-1 min-h-0 min-w-0 overflow-hidden bg-black') => {
                const url = idx === 0 ? previewA : previewB
                const pick = idx === 0 ? pickFile : pickFileB
                const label = idx === 0 ? 'A' : 'B'
                const labelColor = idx === 0 ? GOLD : '#FFFFFF'
                return (
                  <div className={rootClass}>
                    {url ? (
                      <video key={label + url} src={url} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <button onClick={pick} className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 bg-white/[0.02] active:bg-white/[0.06] transition">
                        <div className="w-12 h-12 rounded-xl border border-white/10 bg-white/[0.05] flex items-center justify-center">
                          <Film size={22} strokeWidth={1.5} className="text-zinc-300" />
                        </div>
                        <span className="text-[13px] font-medium text-zinc-200">Subir vídeo {label}</span>
                        <span className="text-[10px] text-zinc-500">MP4 / WebM · max 80MB</span>
                      </button>
                    )}
                    <span className="absolute top-2 left-2 z-10 text-[11px] font-bold bg-black/55 backdrop-blur rounded-full px-2.5 py-1" style={{ color: labelColor }}>{label}</span>
                    {url && (
                      <button onClick={pick} className="absolute top-2 right-2 z-10 text-[11px] font-semibold text-white bg-black/55 hover:bg-black/80 active:scale-95 rounded-full px-2.5 py-1 transition">
                        Cambiar
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <>
                  {/* Media: dueto = split con formato; versus = carrusel (1 vídeo a la vez); reto = vídeo único */}
                  {mode === 'duet' ? (
                    <div
                      className={`absolute inset-0 flex bg-white/20 ${layout === 'vertical' ? 'flex-row' : 'flex-col'}`}
                      style={{ gap: '2px' }}
                    >
                      {renderSlot(0)}
                      {renderSlot(1)}
                    </div>
                  ) : mode === 'versus' ? (
                    <div
                      className="absolute inset-0 overflow-hidden bg-black"
                      onTouchStart={onVersusTouchStart}
                      onTouchEnd={onVersusTouchEnd}
                    >
                      {renderSlot(versusIdx, 'relative w-full h-full overflow-hidden bg-black')}
                    </div>
                  ) : (
                    <div className="absolute inset-0">
                      {previewA ? (
                        <video src={previewA} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      ) : (
                        <button onClick={pickFile} className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white/[0.02] active:bg-white/[0.05] transition">
                          <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/[0.05] flex items-center justify-center">
                            <Film size={28} strokeWidth={1.5} className="text-zinc-300" />
                          </div>
                          <span className="text-[15px] font-medium text-zinc-200">Toca para subir el vídeo</span>
                          <span className="text-[11px] text-zinc-500">MP4 / WebM · max 80MB</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Degradados para legibilidad */}
                  <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black via-black/65 to-transparent pointer-events-none" />

                  {/* Header propio */}
                  <div className="relative z-20 flex items-center justify-between px-3"
                       style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: '10px' }}>
                    <button onClick={goBack} aria-label="Atrás" className="w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition">
                      <ArrowLeft size={20} strokeWidth={1.75} />
                    </button>
                    <h1 className="text-[16px] font-semibold tracking-tight">
                      {mode === 'versus' ? 'Tus 2 vídeos' : mode === 'duet' ? 'Tu 1vs1' : 'Tu vídeo del reto'}
                    </h1>
                    <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full flex items-center justify-center bg-black/35 backdrop-blur hover:bg-black/55 active:scale-90 transition text-zinc-200">
                      <X size={20} strokeWidth={1.75} />
                    </button>
                  </div>

                  {/* Dueto: conmutador de formato Horizontal / Vertical */}
                  {mode === 'duet' && (
                    <div className="relative z-20 px-3 flex items-center justify-center">
                      <div className="inline-flex p-1 rounded-full bg-black/45 backdrop-blur border border-white/10">
                        <button
                          onClick={() => setLayout('horizontal')}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition ${layout === 'horizontal' ? 'bg-white text-black' : 'text-white/85'}`}
                        >
                          <Rows3 size={14} /> Horizontal
                        </button>
                        <button
                          onClick={() => setLayout('vertical')}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold transition ${layout === 'vertical' ? 'bg-white text-black' : 'text-white/85'}`}
                        >
                          <Columns3 size={14} /> Vertical
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Versus: la vista previa es un carrusel; se cambia de vídeo con swipe (ver puntitos abajo) */}

                  {/* Panel inferior: descripción + publicar */}
                  <div className="relative z-20 mt-auto px-4 space-y-3"
                       style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}>
                    {/* Versus: puntitos del carrusel */}
                    {mode === 'versus' && (
                      <div className="flex items-center justify-center gap-1.5">
                        {[0, 1].map((i) => (
                          <button
                            key={i}
                            aria-label={`vídeo ${i === 0 ? 'A' : 'B'}`}
                            onClick={() => setVersusIdx(i)}
                            className={`rounded-full transition-all duration-200 ${versusIdx === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
                          />
                        ))}
                      </div>
                    )}
                    {error && <div className="text-xs text-rose-300">{error}</div>}
                    <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3">
                      {isAB && (
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] font-bold" style={{ color: GOLD }}>Opción A</span>
                          <span className="text-white/90 font-black text-xs">VS</span>
                          <span className="text-[12px] font-bold text-white">Opción B</span>
                        </div>
                      )}
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={mode === 'duet' ? '¿Quién gana? 🥊 #1vs1' : mode === 'challenge' ? 'Reto 🔥 ¿Aceptas?' : '¿Cuál prefieres? 🅰️🆚🅱️'}
                        rows={1}
                        className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-none"
                      />
                    </div>
                    <button
                      onClick={() => (mode === 'challenge' ? goToTarget() : doUpload())}
                      disabled={isAB ? (!file || !fileB) : !file}
                      className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] disabled:bg-white/20 disabled:text-white/40 active:scale-[0.99] transition"
                    >
                      {mode === 'duet' ? 'Publicar 1vs1' : mode === 'challenge' ? 'Elegir a quién retar' : 'Publicar versus'}
                    </button>
                  </div>
                </>
              )
            })()}
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
