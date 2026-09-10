'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

/**
 * ChallengeBuilderSheet — constructor del Motor de Challenges Dinámico.
 * Permite al creador añadir varios "momentos" de votación anclados a
 * instantes concretos del vídeo (startTime/endTime en segundos), eligiendo
 * entre las 25 mecánicas del catálogo (ver lib/challengeMechanics.js).
 *
 * Se abre desde UN ÚNICO botón en el panel de publicar (UploadDialog.jsx),
 * igual que "Editar con IA"/"Add music" — sin flujo aparte, todo en el
 * mismo sitio (petición del usuario).
 *
 * Los momentos se guardan en memoria (`onSave`) mientras se compone la
 * publicación; se persisten en el backend justo DESPUÉS de subir el vídeo
 * (cuando ya existe un postId real), vía POST /api/posts/:id/challenge.
 */

const CATEGORY_STYLE = {
  competencia: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
  votacion: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  prediccion: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  especial: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
}

const fmtTime = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0))
  const m = Math.floor(n / 60)
  const sec = n % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function emptyDraft(defaultStart) {
  return {
    id: null,
    mechanic: null,
    startTime: defaultStart,
    endTime: defaultStart + 5,
    question: '',
    options: ['', ''],
    settings: { correctOptionId: null, maxPoints: 10, threshold: 70, allowMultiple: false, reward: { enabled: false, coins: 50 } },
  }
}

export default function ChallengeBuilderSheet({ open, onClose, videoFile, moments, onSave }) {
  const [categories, setCategories] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [duration, setDuration] = useState(0)
  const [view, setView] = useState('list') // 'list' | 'pick-mechanic' | 'editor'
  const [activeCategory, setActiveCategory] = useState('competencia')
  const [localMoments, setLocalMoments] = useState(moments || [])
  const [draft, setDraft] = useState(null)
  const [draftError, setDraftError] = useState(null)

  useEffect(() => {
    if (!open) return
    setLocalMoments(moments || [])
    setView('list')
    let cancelled = false
    setLoadingCatalog(true)
    fetch('/api/challenge-mechanics')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setCategories(data?.categories || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingCatalog(false) })
    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Duración real del vídeo elegido (para acotar los instantes de inicio/fin).
  useEffect(() => {
    if (!open || !videoFile) { setDuration(0); return }
    const url = URL.createObjectURL(videoFile)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.src = url
    v.onloadedmetadata = () => { setDuration(v.duration || 0); URL.revokeObjectURL(url) }
    v.onerror = () => URL.revokeObjectURL(url)
    return () => { try { URL.revokeObjectURL(url) } catch { /* noop */ } }
  }, [open, videoFile])

  const allMechanics = useMemo(() => categories.flatMap((c) => c.mechanics), [categories])
  const getMech = (id) => allMechanics.find((m) => m.id === id)

  if (!open) return null

  const startAdd = () => {
    const lastEnd = localMoments.length ? Math.max(...localMoments.map((m) => m.endTime)) : 0
    const start = duration ? Math.min(lastEnd, Math.max(0, duration - 5)) : lastEnd
    setDraft(emptyDraft(start))
    setDraftError(null)
    setView('pick-mechanic')
  }

  const startEdit = (m) => {
    setDraft({ ...m, options: m.options.map((o) => o.label), settings: { ...m.settings } })
    setDraftError(null)
    setView('editor')
  }

  const pickMechanic = (mech) => {
    const optCount = Math.max(mech.minOptions, Math.min(2, mech.maxOptions))
    const opts = mech.fixedOptions ? mech.fixedOptions : Array.from({ length: optCount }, () => '')
    setDraft((d) => ({
      ...d,
      mechanic: mech.id,
      options: opts,
      settings: { ...d.settings, allowMultiple: !!mech.allowMultipleDefault, maxPoints: mech.defaultMaxPoints || 10, threshold: mech.defaultThreshold || 70 },
    }))
    setView('editor')
  }

  const updateOption = (idx, val) => {
    setDraft((d) => ({ ...d, options: d.options.map((o, i) => (i === idx ? val : o)) }))
  }
  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, ''] }))
  const removeOption = (idx) => setDraft((d) => ({ ...d, options: d.options.filter((_, i) => i !== idx) }))

  const saveDraft = () => {
    const mech = getMech(draft.mechanic)
    if (!mech) { setDraftError('Elige una mecánica'); return }
    const cleanOptions = draft.options.map((o) => String(o).trim()).filter(Boolean)
    if (cleanOptions.length < mech.minOptions || cleanOptions.length > mech.maxOptions) {
      setDraftError(`${mech.label} necesita entre ${mech.minOptions} y ${mech.maxOptions} opciones`)
      return
    }
    if (!draft.question.trim()) { setDraftError('Escribe la pregunta de este momento'); return }
    const start = Number(draft.startTime)
    const end = Number(draft.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { setDraftError('El instante final debe ser mayor que el inicial'); return }
    const overlaps = localMoments.some((m) => m.id !== draft.id && start < m.endTime && end > m.startTime)
    if (overlaps) { setDraftError('Este momento se superpone con otro que ya añadiste'); return }

    const id = draft.id || `moment_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const finalMoment = {
      id,
      startTime: start,
      endTime: end,
      mechanic: mech.id,
      question: draft.question.trim(),
      options: cleanOptions.map((label, i) => ({ id: draft.id ? (moments?.find((m) => m.id === draft.id)?.options?.[i]?.id || `opt_${id}_${i}`) : `opt_${id}_${i}`, label })),
      settings: draft.settings,
    }
    setLocalMoments((list) => {
      const next = draft.id ? list.map((m) => (m.id === id ? finalMoment : m)) : [...list, finalMoment]
      return next.sort((a, b) => a.startTime - b.startTime)
    })
    setView('list')
    setDraft(null)
  }

  const deleteMoment = (id) => setLocalMoments((list) => list.filter((m) => m.id !== id))

  const finishAndSave = () => {
    onSave(localMoments)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] bg-[#0a0a0b] flex flex-col text-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: '10px' }}>
        <button
          onClick={() => (view === 'list' ? onClose() : setView('list'))}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-90 transition"
        >
          {view === 'list' ? <X size={19} /> : <ArrowLeft size={19} />}
        </button>
        <h2 className="text-[15px] font-bold">
          {view === 'list' ? 'Reto interactivo' : view === 'pick-mechanic' ? 'Elige una mecánica' : 'Configurar momento'}
        </h2>
        {view === 'list' ? (
          <button onClick={finishAndSave} aria-label="Done" className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 active:scale-90 transition">
            <Check size={18} strokeWidth={2.5} />
          </button>
        ) : <span className="w-9 h-9" />}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {view === 'list' && (
          <div className="space-y-3">
            <p className="text-[13px] text-zinc-400 leading-snug">
              Añade uno o varios momentos de votación en instantes concretos del vídeo. Aparecerán como una tarjeta sobre el vídeo, sin recargarlo.
            </p>
            {localMoments.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center text-zinc-400 text-[13.5px]">
                Todavía no hay momentos añadidos.
              </div>
            )}
            {localMoments.map((m) => {
              const mech = getMech(m.mechanic)
              return (
                <div key={m.id} className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-zinc-200">{fmtTime(m.startTime)}–{fmtTime(m.endTime)}</span>
                      {mech && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CATEGORY_STYLE[mech.category] || ''}`}>{mech.label}</span>}
                    </div>
                    <p className="text-[13.5px] font-medium text-white truncate">{m.question}</p>
                    <p className="text-[12px] text-zinc-400 truncate">{m.options.map((o) => o.label).join(' · ')}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => startEdit(m)} aria-label="Edit" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-90 transition"><Pencil size={14} /></button>
                    <button onClick={() => deleteMoment(m.id)} aria-label="Delete" className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-rose-500/40 active:scale-90 transition"><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
            <button
              onClick={startAdd}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-3 text-[14px] font-semibold text-white hover:bg-white/5 active:scale-[0.99] transition"
            >
              <Plus size={17} strokeWidth={2} /> Añadir momento
            </button>
          </div>
        )}

        {view === 'pick-mechanic' && (
          <div className="space-y-3">
            {loadingCatalog ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(c.id)}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition ${activeCategory === c.id ? 'bg-white text-black border-white' : `${CATEGORY_STYLE[c.id]}`}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {(categories.find((c) => c.id === activeCategory)?.mechanics || []).map((mech) => (
                    <button
                      key={mech.id}
                      onClick={() => pickMechanic(mech)}
                      className="w-full flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 text-left hover:bg-white/[0.1] active:scale-[0.99] transition"
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-white">{mech.label}</p>
                        <p className="text-[12px] text-zinc-400 leading-snug">{mech.description}</p>
                      </div>
                      <ChevronRight size={17} className="shrink-0 text-zinc-500" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {view === 'editor' && draft && (() => {
          const mech = getMech(draft.mechanic)
          return (
            <div className="space-y-4">
              {mech && <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border ${CATEGORY_STYLE[mech.category] || ''}`}>{mech.label}</span>}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] text-zinc-400">Inicio (segundos)</span>
                  <input
                    type="number" min={0} step={1} value={draft.startTime}
                    onChange={(e) => setDraft((d) => ({ ...d, startTime: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] focus:outline-none focus:border-white/30"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] text-zinc-400">Fin (segundos)</span>
                  <input
                    type="number" min={0} step={1} value={draft.endTime}
                    onChange={(e) => setDraft((d) => ({ ...d, endTime: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] focus:outline-none focus:border-white/30"
                  />
                </label>
              </div>
              {duration > 0 && <p className="text-[11.5px] text-zinc-500">Duración del vídeo: {fmtTime(duration)}</p>}

              <label className="block">
                <span className="text-[12px] text-zinc-400">Pregunta</span>
                <input
                  type="text" value={draft.question} placeholder="¿Qué le preguntas a la comunidad?"
                  onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </label>

              <div>
                <span className="text-[12px] text-zinc-400">Opciones {mech ? `(${mech.minOptions}–${mech.maxOptions})` : ''}</span>
                <div className="mt-1.5 space-y-2">
                  {draft.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text" value={opt} disabled={!!mech?.fixedOptions}
                        placeholder={`Opción ${idx + 1}`}
                        onChange={(e) => updateOption(idx, e.target.value)}
                        className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30 disabled:opacity-60"
                      />
                      {!mech?.fixedOptions && draft.options.length > (mech?.minOptions || 2) && (
                        <button onClick={() => removeOption(idx)} aria-label="Remove option" className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-rose-500/40 active:scale-90 transition"><Trash2 size={13} /></button>
                      )}
                    </div>
                  ))}
                  {!mech?.fixedOptions && draft.options.length < (mech?.maxOptions || 8) && (
                    <button onClick={addOption} className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-300 hover:text-white px-1"><Plus size={14} /> Añadir opción</button>
                  )}
                </div>
              </div>

              {mech?.inputType === 'points' && (
                <label className="block">
                  <span className="text-[12px] text-zinc-400">Puntos a repartir</span>
                  <input
                    type="number" min={1} value={draft.settings.maxPoints}
                    onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, maxPoints: Number(e.target.value) } }))}
                    className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] focus:outline-none focus:border-white/30"
                  />
                </label>
              )}

              {mech?.resultRule === 'threshold' && (
                <label className="block">
                  <span className="text-[12px] text-zinc-400">% mínimo para aprobar</span>
                  <input
                    type="number" min={1} max={100} value={draft.settings.threshold}
                    onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, threshold: Number(e.target.value) } }))}
                    className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] focus:outline-none focus:border-white/30"
                  />
                </label>
              )}

              {mech?.id === 'poll' && (
                <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-[13.5px] font-semibold leading-tight">Permitir varias opciones</p>
                  </div>
                  <button
                    type="button" role="switch" aria-checked={draft.settings.allowMultiple}
                    onClick={() => setDraft((d) => ({ ...d, settings: { ...d.settings, allowMultiple: !d.settings.allowMultiple } }))}
                    className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${draft.settings.allowMultiple ? 'bg-emerald-500' : 'bg-white/20'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${draft.settings.allowMultiple ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              )}

              {mech?.reveal && (
                <div>
                  <span className="text-[12px] text-zinc-400">Respuesta correcta (opcional, se revela tras votar)</span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {draft.options.map((opt, idx) => opt.trim() && (
                      <button
                        key={idx}
                        onClick={() => setDraft((d) => ({ ...d, settings: { ...d.settings, correctOptionId: d.settings.correctOptionId === opt ? null : opt } }))}
                        className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition ${draft.settings.correctOptionId === opt ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/10 text-white border-white/10'}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mech?.rewardCapable && (
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-[13.5px] font-semibold leading-tight">Vincular recompensa en monedas</p>
                    </div>
                    <button
                      type="button" role="switch" aria-checked={draft.settings.reward.enabled}
                      onClick={() => setDraft((d) => ({ ...d, settings: { ...d.settings, reward: { ...d.settings.reward, enabled: !d.settings.reward.enabled } } }))}
                      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${draft.settings.reward.enabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${draft.settings.reward.enabled ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                  {draft.settings.reward.enabled && (
                    <input
                      type="number" min={1} value={draft.settings.reward.coins}
                      onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, reward: { ...d.settings.reward, coins: Number(e.target.value) } } }))}
                      className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] focus:outline-none focus:border-white/30"
                      placeholder="Monedas"
                    />
                  )}
                </div>
              )}

              {draftError && <p className="text-[12.5px] text-rose-300">{draftError}</p>}

              <button
                onClick={saveDraft}
                className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[15px] active:scale-[0.99] transition"
              >
                Guardar momento
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
