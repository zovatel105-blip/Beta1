'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Check, ChevronRight, Copy, Loader2, Maximize2, Minimize2, Pause, Pencil,
  Play, Plus, Redo2, Trash2, Trophy, Undo2, X,
} from 'lucide-react'
import ChallengeMomentPills from './ChallengeMomentPills'
import { MECHANIC_GROUPS } from '@/lib/challengeMechanicGroups'

/**
 * ChallengeTimelineEditor — pantalla de edición dedicada del Motor de
 * Challenges Dinámico (reemplaza al antiguo ChallengeBuilderSheet).
 *
 * Accesible desde el mismo sitio que "Editar con IA" (botón circular junto
 * a la X). Muestra el vídeo + una LÍNEA DE TIEMPO real: cada momento de
 * votación es un bloque que se puede ARRASTRAR (mover) y REDIMENSIONAR
 * (bordes izq/der), igual que un editor de vídeo tipo CapCut. Tocar "+
 * Challenge" abre un selector COMPACTO de mecánica (lista, no un formulario
 * multi-paso) y luego solo pide lo mínimo: pregunta + opciones.
 *
 * El array final `moments` tiene EXACTAMENTE la misma forma que consume el
 * backend ya existente (POST /api/posts/:id/challenge) — mecánicas,
 * timestamps, reglas de resultado y resultados quedan intactos.
 *
 * PASE DE PULIDO VISUAL (esta revisión): la pantalla ahora imita la
 * estructura de un editor de vídeo profesional (vista previa arriba, barra
 * de reproducción, regla de tiempo con miniaturas + "pista" de Challenge
 * claramente distinguida, fila de acciones inferior con icono+etiqueta)
 * usando SOLO los tokens de diseño ya existentes en la app (acento
 * rosa/rojo, tarjetas oscuras con blur, animación fadeIn de tailwind.config,
 * tailwindcss-animate). La vista previa del Challenge activo ahora reutiliza
 * el MISMO componente (`ChallengeMomentPills`) que dibuja el feed publicado
 * (`ChallengeMomentOverlay.jsx`), así que lo que se ve aquí mientras se
 * edita es idéntico, píxel a píxel, a lo que verán los espectadores — cero
 * aproximación separada.
 */

const CATEGORY_COLOR = {
  competencia: 'bg-rose-500',
  votacion: 'bg-sky-500',
  prediccion: 'bg-amber-500',
  especial: 'bg-violet-500',
}

const fmtTime = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0))
  const m = Math.floor(n / 60)
  const sec = n % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
const round1 = (v) => Math.round(v * 10) / 10

// Botón icono-arriba/etiqueta-abajo de la fila de acciones inferior — mismo
// patrón visual que la barra de herramientas de referencia (icono en
// círculo + texto pequeño debajo, espaciado uniforme, tema oscuro).
function ActionButton({ icon, label, onClick, danger, accent, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 min-w-[62px] active:scale-90 transition disabled:opacity-30 disabled:active:scale-100"
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
          accent
            ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30'
            : danger
            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            : 'bg-white/10 text-white border border-white/10'
        }`}
      >
        {icon}
      </span>
      <span className={`text-[11px] font-semibold ${danger ? 'text-rose-300' : 'text-zinc-300'}`}>{label}</span>
    </button>
  )
}

export default function ChallengeTimelineEditor({ open, onClose, videoFile, moments: initialMoments, onSave }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const dragRef = useRef(null)
  const durationRef = useRef(0) // espejo de `duration` para que los listeners de pointermove/up (con identidad estable) siempre lean el valor más reciente y no una clausura vieja
  const thumbRunRef = useRef(0)

  const [objectUrl, setObjectUrl] = useState(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [moments, setMoments] = useState(initialMoments || [])
  const [categories, setCategories] = useState([])
  const [view, setView] = useState('timeline') // 'timeline' | 'pick-category' | 'pick-mechanic' | 'config'
  const [pickedGroupId, setPickedGroupId] = useState(null) // categoria de las 7 elegida en el paso 1 del selector de "+ Challenge"
  const [draft, setDraft] = useState(null)
  const [draftError, setDraftError] = useState(null)

  // Selección "ligera" de un bloque (tap sin arrastrar): resalta el bloque y
  // muestra una fila de acciones contextual (Editar/Duplicar/Eliminar) en
  // vez de saltar directo a la pantalla de configuración completa — igual
  // que seleccionar un clip en un editor de vídeo real.
  const [selectedId, setSelectedId] = useState(null)
  const [draggingId, setDraggingId] = useState(null) // solo feedback visual (escala/sombra) mientras se arrastra/redimensiona
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [expanded, setExpanded] = useState(false) // "pantalla completa": colapsa la línea de tiempo para maximizar la vista previa
  const [thumbnails, setThumbnails] = useState([])

  useEffect(() => { durationRef.current = duration }, [duration])

  useEffect(() => {
    if (!open) return
    setMoments(initialMoments || [])
    setView('timeline')
    setPickedGroupId(null)
    setSelectedId(null)
    setDraggingId(null)
    setUndoStack([])
    setRedoStack([])
    setExpanded(false)
    fetch('/api/challenge-mechanics').then((r) => r.json()).then((d) => setCategories(d?.categories || [])).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open || !videoFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(videoFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [open, videoFile])

  // Genera una tira de miniaturas reales del vídeo (referencia del usuario:
  // "video thumbnail frames in a strip"). Usa un <video>+<canvas> OCULTOS
  // (mismo patrón que captureVideoFrame en AIVideoEditor.jsx) para no tocar
  // ni pausar el <video> visible de la vista previa.
  useEffect(() => {
    setThumbnails([])
    if (!objectUrl || !duration) return
    const myRun = ++thumbRunRef.current
    const COUNT = 10
    const vid = document.createElement('video')
    vid.muted = true
    vid.playsInline = true
    vid.preload = 'auto'
    vid.src = objectUrl
    const canvas = document.createElement('canvas')
    canvas.width = 60
    canvas.height = 96
    const ctx = canvas.getContext('2d')

    const captureAt = (i) => new Promise((resolve) => {
      const t = clamp((duration / COUNT) * i, 0.05, Math.max(0.05, duration - 0.05))
      let done = false
      const finish = (val) => {
        if (done) return
        done = true
        vid.removeEventListener('seeked', onSeeked)
        resolve(val)
      }
      const onSeeked = () => {
        try {
          const vw = vid.videoWidth || 60
          const vh = vid.videoHeight || 96
          const scale = Math.max(canvas.width / vw, canvas.height / vh)
          const sw = canvas.width / scale
          const sh = canvas.height / scale
          const sx = (vw - sw) / 2
          const sy = (vh - sh) / 2
          ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
          finish(canvas.toDataURL('image/jpeg', 0.6))
        } catch { finish(null) }
      }
      vid.addEventListener('seeked', onSeeked)
      setTimeout(() => finish(null), 2000)
      try { vid.currentTime = t } catch { finish(null) }
    })

    vid.addEventListener('loadedmetadata', async () => {
      const frames = []
      for (let i = 0; i < COUNT; i++) {
        if (thumbRunRef.current !== myRun) return
        const frame = await captureAt(i)
        if (thumbRunRef.current !== myRun) return
        frames.push(frame)
        setThumbnails([...frames])
      }
    })

    return () => { thumbRunRef.current++ }
  }, [objectUrl, duration])

  const allMechanics = useMemo(() => categories.flatMap((c) => c.mechanics), [categories])
  const getMech = (id) => allMechanics.find((m) => m.id === id)

  // Fuente única de verdad para "qué Challenge se ve ahora mismo": se deriva
  // de los MISMOS `moments`/`currentTime` que dibujan los bloques de la
  // línea de tiempo, así que el overlay de la vista previa queda SIEMPRE
  // sincronizado con lo que se arrastra/redimensiona abajo (sin estado
  // duplicado que se pueda desincronizar).
  const activeMoment = duration > 0 ? moments.find((m) => currentTime >= m.startTime && currentTime < m.endTime) : null

  const tickStep = duration <= 15 ? 2 : duration <= 40 ? 5 : duration <= 120 ? 10 : 30
  const ticks = duration > 0 ? Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, i) => i * tickStep) : []

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play().catch(() => {}); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  const seekTo = (t) => {
    const v = videoRef.current
    if (!v || !durationRef.current) return
    v.currentTime = clamp(t, 0, durationRef.current)
    setCurrentTime(v.currentTime)
  }

  const pxToSec = (dxPx) => {
    const track = trackRef.current
    const dur = durationRef.current
    if (!track || !dur) return 0
    const rect = track.getBoundingClientRect()
    return (dxPx / rect.width) * dur
  }

  const onTrackPointerDown = (e) => {
    if (dragRef.current) return
    setSelectedId(null)
    const track = trackRef.current
    const dur = durationRef.current
    if (!track || !dur) return
    const rect = track.getBoundingClientRect()
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    seekTo(ratio * dur)
  }

  const onBlockPointerDown = (e, moment, mode) => {
    if (dragRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const sorted = [...moments].sort((a, b) => a.startTime - b.startTime)
    const idx = sorted.findIndex((m) => m.id === moment.id)
    const prevEnd = idx > 0 ? sorted[idx - 1].endTime : 0
    const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].startTime : duration
    dragRef.current = {
      id: moment.id, mode, startX: e.clientX, origStart: moment.startTime, origEnd: moment.endTime,
      prevEnd, nextStart, moved: false, historyPushed: false, snapshotMoments: moments,
    }
    setDraggingId(moment.id)
    // Salta la vista previa al inicio del momento nada más tocarlo, para
    // feedback inmediato de qué bloque se está a punto de mover/redimensionar.
    seekTo(moment.startTime)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const deltaSec = pxToSec(e.clientX - d.startX)
    if (!d.moved && Math.abs(e.clientX - d.startX) > 3) {
      d.moved = true
      // Primer movimiento real de este arrastre: registra el estado ANTERIOR
      // en la pila de deshacer (un arrastre completo cuenta como UN solo paso
      // de undo, no uno por cada pointermove). Se usan los setters de estado
      // directamente (identidad SIEMPRE estable) para evitar el mismo bug de
      // clausura vieja que ya afectó a este archivo (ver comentario de
      // `onPointerUp` más abajo).
      if (!d.historyPushed) {
        d.historyPushed = true
        setUndoStack((u) => [...u.slice(-24), d.snapshotMoments])
        setRedoStack([])
      }
    }
    const momentDur = d.origEnd - d.origStart
    let start = d.origStart
    let end = d.origEnd
    if (d.mode === 'move') {
      start = clamp(d.origStart + deltaSec, d.prevEnd, d.nextStart - momentDur)
      end = start + momentDur
    } else if (d.mode === 'resize-start') {
      start = clamp(d.origStart + deltaSec, d.prevEnd, d.origEnd - 1)
    } else if (d.mode === 'resize-end') {
      end = clamp(d.origEnd + deltaSec, d.origStart + 1, d.nextStart)
    }
    start = round1(start)
    end = round1(end)
    setMoments((list) => list.map((m) => (m.id === d.id ? { ...m, startTime: start, endTime: end } : m)))
    // Sincroniza la vista previa del vídeo EN VIVO con el bloque que se está
    // arrastrando/redimensionando (petición del usuario: mover/redimensionar
    // en la línea de tiempo debe verse al instante en el vídeo).
    seekTo(d.mode === 'resize-end' ? Math.max(start, end - 0.15) : start)
  }, [])

  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (d && !d.moved) {
      // Fue un toque, no un arrastre: SELECCIONA el bloque (resalta + muestra
      // la fila de acciones contextual abajo) en vez de abrir de inmediato la
      // configuración completa — coherente con el patrón "seleccionar clip"
      // de un editor de vídeo real.
      setSelectedId(d.id)
    }
  }, [])

  // Red de seguridad: si la pantalla se cierra (o el componente se
  // desmonta) a mitad de un arrastre, retiramos los listeners globales de
  // puntero para que no queden interceptando gestos en el resto de la app.
  useEffect(() => {
    if (open) return
    dragRef.current = null
    setDraggingId(null)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [open])

  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [])

  const nextDefaultRange = () => {
    const dur = duration || 15
    const sorted = [...moments].sort((a, b) => a.startTime - b.startTime)
    const lastEnd = sorted.length ? sorted[sorted.length - 1].endTime : 0
    const len = Math.min(5, Math.max(1, dur - lastEnd))
    const start = Math.min(lastEnd, Math.max(0, dur - len))
    return { start: round1(start), end: round1(start + len) }
  }

  const openPicker = () => { setSelectedId(null); setDraftError(null); setPickedGroupId(null); setView('pick-category') }

  // Paso 1 del selector: elegir una de las 7 categorias simples. Paso 2
  // (mas abajo, vista 'pick-mechanic') solo muestra las mecanicas de ESA
  // categoria - las 25 mecanicas reales, sus ids y su comportamiento no
  // cambian, esto solo decide que subconjunto se enseña primero.
  const openGroup = (group) => { setPickedGroupId(group.id); setView('pick-mechanic') }

  const pickMechanic = (mech) => {
    const range = nextDefaultRange()
    const optCount = Math.max(mech.minOptions, Math.min(2, mech.maxOptions))
    const opts = mech.fixedOptions ? mech.fixedOptions : Array.from({ length: optCount }, () => '')
    setDraft({ id: null, mechanic: mech.id, startTime: range.start, endTime: range.end, question: '', options: opts })
    setDraftError(null)
    setView('config')
  }

  const openEditConfig = (m) => {
    setDraft({ id: m.id, mechanic: m.mechanic, startTime: m.startTime, endTime: m.endTime, question: m.question, options: m.options.map((o) => o.label) })
    setDraftError(null)
    setView('config')
  }

  const updateOption = (idx, val) => setDraft((d) => ({ ...d, options: d.options.map((o, i) => (i === idx ? val : o)) }))
  const addOption = () => setDraft((d) => ({ ...d, options: [...d.options, ''] }))
  const removeOption = (idx) => setDraft((d) => ({ ...d, options: d.options.filter((_, i) => i !== idx) }))

  const saveDraft = () => {
    const mech = getMech(draft.mechanic)
    if (!mech) return
    const clean = draft.options.map((o) => String(o).trim()).filter(Boolean)
    if (clean.length < mech.minOptions || clean.length > mech.maxOptions) {
      setDraftError(`${mech.label} necesita entre ${mech.minOptions} y ${mech.maxOptions} opciones`)
      return
    }
    if (!draft.question.trim()) { setDraftError('Escribe la pregunta de este momento'); return }

    const id = draft.id || `moment_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const prevOptions = draft.id ? moments.find((m) => m.id === draft.id)?.options : null
    const finalMoment = {
      id,
      startTime: draft.startTime,
      endTime: draft.endTime,
      mechanic: mech.id,
      question: draft.question.trim(),
      options: clean.map((label, i) => ({ id: prevOptions?.[i]?.id || `opt_${id}_${i}`, label })),
      settings: {},
    }
    setUndoStack((u) => [...u.slice(-24), moments])
    setRedoStack([])
    setMoments((list) => {
      const next = draft.id ? list.map((m) => (m.id === id ? finalMoment : m)) : [...list, finalMoment]
      return next.sort((a, b) => a.startTime - b.startTime)
    })
    setView('timeline')
    setDraft(null)
  }

  const deleteDraft = () => {
    setUndoStack((u) => [...u.slice(-24), moments])
    setRedoStack([])
    setMoments((list) => list.filter((m) => m.id !== draft.id))
    setView('timeline')
    setDraft(null)
  }

  // --- Acciones de la fila contextual (bloque seleccionado) ---
  const editSelected = () => {
    const m = moments.find((mm) => mm.id === selectedId)
    if (m) openEditConfig(m)
    setSelectedId(null)
  }

  const duplicateSelected = () => {
    const m = moments.find((mm) => mm.id === selectedId)
    if (!m || !duration) return
    const len = Math.max(0.5, m.endTime - m.startTime)
    const start = round1(clamp(m.endTime, 0, Math.max(0, duration - len)))
    const end = round1(Math.min(duration, start + len))
    if (end - start < 0.3) return // sin espacio razonable para duplicar
    setUndoStack((u) => [...u.slice(-24), moments])
    setRedoStack([])
    const id = `moment_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const dup = { ...m, id, startTime: start, endTime: end, options: m.options.map((o, i) => ({ id: `opt_${id}_${i}`, label: o.label })) }
    setMoments((list) => [...list, dup].sort((a, b) => a.startTime - b.startTime))
    setSelectedId(id)
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setUndoStack((u) => [...u.slice(-24), moments])
    setRedoStack([])
    setMoments((list) => list.filter((m) => m.id !== selectedId))
    setSelectedId(null)
  }

  const undo = () => {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack((r) => [...r, moments])
    setUndoStack((u) => u.slice(0, -1))
    setMoments(prev)
    setSelectedId(null)
  }

  const redo = () => {
    if (!redoStack.length) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack((u) => [...u, moments])
    setRedoStack((r) => r.slice(0, -1))
    setMoments(next)
    setSelectedId(null)
  }

  const finish = () => { onSave(moments); onClose() }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] bg-[#0a0a0b] flex flex-col text-white">
      <div className="flex items-center justify-between gap-2 px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: '10px' }}>
        <button
          onClick={() => {
            if (view === 'timeline') { onClose(); return }
            if (view === 'pick-category') { setView('timeline'); return }
            if (view === 'pick-mechanic') { setView('pick-category'); return }
            // view === 'config': si estabamos editando un momento existente
            // volvemos a la timeline (como antes); si era uno nuevo, volvemos
            // a la lista filtrada de la categoria ya elegida (pickedGroupId
            // se conserva) en vez de saltar hasta el primer paso.
            setView(draft?.id ? 'timeline' : 'pick-mechanic')
          }}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-90 transition"
        >
          {view === 'timeline' ? <X size={19} /> : <ArrowLeft size={19} />}
        </button>
        <h2 className="text-[15px] font-bold">
          {view === 'timeline' ? 'Reto interactivo' : view === 'pick-category' ? '¿Qué quieres hacer?' : view === 'pick-mechanic' ? 'Elige una mecánica' : 'Configurar momento'}
        </h2>
        {view === 'timeline' ? (
          <button
            onClick={finish}
            aria-label="Done"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/30 hover:brightness-110 active:scale-90 transition"
          >
            <Check size={18} strokeWidth={2.5} />
          </button>
        ) : <span className="w-9 h-9" />}
      </div>

      {view === 'timeline' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Vista previa del vídeo */}
          <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden" onClick={togglePlay}>
            {objectUrl && (
              <video
                ref={videoRef}
                src={objectUrl}
                className="max-h-full max-w-full"
                playsInline
                muted
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onEnded={() => setPlaying(false)}
              />
            )}
            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center"><Play size={22} fill="white" /></div>
              </div>
            )}
            {/* Capa editable del Challenge EN VIVO sobre el vídeo (antes solo se
                veía en la tira de la línea de tiempo). Se deriva de
                `activeMoment` (mismo estado que los bloques de abajo), así
                que moverlo/redimensionarlo en la línea de tiempo se refleja
                al instante aquí, sin paso de guardado/publicación previo.
                El badge de mecánica es un afordance SOLO del editor (para
                saber qué se está tocando); las pastillas de pregunta+
                opciones en sí reutilizan `ChallengeMomentPills`, EL MISMO
                componente que dibuja el feed publicado — cero deriva
                visual entre "lo que veo editando" y "lo que ve la gente". */}
            {activeMoment && (
              <div className="absolute inset-x-0 bottom-0 p-3 pointer-events-none z-10" data-testid="challenge-preview-overlay">
                {getMech(activeMoment.mechanic) && (
                  <span className={`inline-flex items-center gap-1.5 mb-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${CATEGORY_COLOR[getMech(activeMoment.mechanic).category]} shadow`}>
                    {getMech(activeMoment.mechanic).label}
                  </span>
                )}
                <ChallengeMomentPills
                  className="max-w-[calc(100%-0.5rem)]"
                  question={activeMoment.question || 'Question…'}
                  options={activeMoment.options}
                  getLabel={(o) => o.label || 'Option'}
                />
              </div>
            )}
          </div>

          {/* Barra de reproducción: deshacer/rehacer, tiempo + play centrados,
              pantalla completa (colapsa la línea de tiempo para maximizar la
              vista previa) — misma estructura que un editor de vídeo real. */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={!undoStack.length}
                aria-label="Undo"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-300 disabled:text-zinc-700 hover:bg-white/10 active:scale-90 transition"
              ><Undo2 size={15} /></button>
              <button
                onClick={redo}
                disabled={!redoStack.length}
                aria-label="Redo"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-300 disabled:text-zinc-700 hover:bg-white/10 active:scale-90 transition"
              ><Redo2 size={15} /></button>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11.5px] text-zinc-400 font-mono tabular-nums">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
              <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition">
                {playing ? <Pause size={14} /> : <Play size={14} fill="white" />}
              </button>
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-label="Toggle fullscreen preview"
              className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-300 hover:bg-white/10 active:scale-90 transition"
            >
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>

          {/* Línea de tiempo — colapsable (pantalla completa) */}
          <div
            className={`px-4 pb-2 shrink-0 overflow-hidden transition-all duration-300 ease-out ${
              expanded ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[280px] opacity-100'
            }`}
          >
            {/* Franja de scrubbing SIEMPRE disponible, separada de los
                bloques de Challenge (petición del usuario: que arrastrar o
                redimensionar un Challenge no rompa el scrubbing normal, ni
                siquiera cuando los bloques cubren todo el ancho del track). */}
            <div
              onPointerDown={onTrackPointerDown}
              className="relative h-2.5 mb-2.5 rounded-full bg-white/[0.14] touch-none select-none cursor-pointer"
              aria-label="Scrub playhead"
              data-testid="challenge-scrub-bar"
            >
              {duration > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow pointer-events-none"
                  style={{ left: `calc(${(currentTime / duration) * 100}% - 7px)` }}
                />
              )}
            </div>

            {/* Regla de tiempo (00:00, 00:02, …) */}
            <div className="relative h-3.5 mb-1 select-none" onPointerDown={onTrackPointerDown}>
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute top-0 text-[9px] font-mono text-zinc-500"
                  style={{
                    left: `${(t / duration) * 100}%`,
                    transform: t === 0 ? 'translateX(0)' : t + tickStep >= duration ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  {fmtTime(t)}
                </span>
              ))}
            </div>

            {/* Tira de miniaturas reales del vídeo */}
            <div
              onPointerDown={onTrackPointerDown}
              className="relative h-14 rounded-xl overflow-hidden border border-white/10 bg-zinc-900 flex touch-none select-none"
            >
              {thumbnails.length > 0 ? (
                thumbnails.map((src, i) => (
                  <div
                    key={i}
                    className="flex-1 h-full bg-cover bg-center border-r border-black/30 last:border-r-0"
                    style={src ? { backgroundImage: `url(${src})` } : undefined}
                  />
                ))
              ) : (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex-1 h-full skeleton-shimmer border-r border-black/30 last:border-r-0" />
                ))
              )}
              {duration > 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }} />
              )}
            </div>

            {/* Pista del Challenge — visualmente DISTINTA de la tira de
                miniaturas (fondo violeta + etiqueta con icono), igual que la
                pista de audio se distingue del vídeo en un editor real. */}
            <div
              ref={trackRef}
              onPointerDown={onTrackPointerDown}
              className="relative h-14 mt-1.5 rounded-xl overflow-hidden touch-none select-none bg-gradient-to-r from-violet-600/15 via-indigo-500/15 to-violet-600/15 border border-violet-400/20"
            >
              <span className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-violet-300/60 pointer-events-none z-0">
                <Trophy size={10} /> Challenge
              </span>
              {duration > 0 && moments.map((m) => {
                const mech = getMech(m.mechanic)
                const left = (m.startTime / duration) * 100
                const width = ((m.endTime - m.startTime) / duration) * 100
                const isDragging = draggingId === m.id
                const isSelectedBlock = selectedId === m.id
                return (
                  <div
                    key={m.id}
                    onPointerDown={(e) => onBlockPointerDown(e, m, 'move')}
                    className={`absolute top-1 bottom-1 rounded-lg ${mech ? CATEGORY_COLOR[mech.category] : 'bg-white/30'} bg-opacity-90 flex items-center px-1.5 cursor-grab active:cursor-grabbing overflow-hidden shadow-md ${
                      isDragging ? 'scale-[1.04] shadow-2xl z-20' : 'z-10 transition-all duration-150'
                    } ${isSelectedBlock ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0b]' : ''}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                  >
                    <span
                      onPointerDown={(e) => onBlockPointerDown(e, m, 'resize-start')}
                      className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/40 rounded-l-lg"
                    />
                    <span className="text-[10.5px] font-bold text-white truncate px-1.5 pointer-events-none">{mech?.label || m.mechanic}</span>
                    <span
                      onPointerDown={(e) => onBlockPointerDown(e, m, 'resize-end')}
                      className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/40 rounded-r-lg"
                    />
                  </div>
                )
              })}
              {duration > 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-10" style={{ left: `${(currentTime / duration) * 100}%` }} />
              )}
            </div>

            <p className="mt-2 text-[11px] text-zinc-500 leading-snug">
              Usa la barra fina de arriba para mover el punto de reproducción. Toca un momento para seleccionarlo
              y usa las acciones de abajo, arrástralo para moverlo o usa sus bordes para ajustar la duración.
            </p>
          </div>

          {/* Fila de acciones inferior — icono arriba / etiqueta abajo, misma
              estructura visual que la barra de herramientas de referencia,
              pero con SOLO acciones reales de esta pantalla (Añadir Challenge,
              o Editar/Duplicar/Eliminar sobre el bloque seleccionado). */}
          <div className="px-4 pb-6 pt-2 shrink-0 border-t border-white/5">
            {selectedId ? (
              <div key="sel-actions" className="flex items-center justify-around animate-fadeIn">
                <ActionButton icon={<Pencil size={18} strokeWidth={2} />} label="Edit" onClick={editSelected} />
                <ActionButton icon={<Copy size={18} strokeWidth={2} />} label="Duplicate" onClick={duplicateSelected} />
                <ActionButton icon={<Trash2 size={18} strokeWidth={2} />} label="Delete" onClick={deleteSelected} danger />
                <ActionButton icon={<X size={18} strokeWidth={2} />} label="Done" onClick={() => setSelectedId(null)} />
              </div>
            ) : (
              <div key="add-action" className="flex items-center justify-center animate-fadeIn">
                <ActionButton icon={<Plus size={18} strokeWidth={2} />} label="Add Challenge" onClick={openPicker} accent />
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'pick-category' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 animate-fadeIn">
          <p className="text-[12.5px] text-zinc-500 mb-3">Elige primero qué tipo de reto quieres crear. Luego te enseñamos solo las mecánicas de esa categoría.</p>
          <div className="grid grid-cols-2 gap-3">
            {MECHANIC_GROUPS.map((group, idx) => {
              const Icon = group.icon
              const isLastOdd = idx === MECHANIC_GROUPS.length - 1 && MECHANIC_GROUPS.length % 2 === 1
              return (
                <button
                  key={group.id}
                  onClick={() => openGroup(group)}
                  className={`flex flex-col items-start gap-2.5 rounded-2xl bg-white/[0.06] border border-white/10 px-4 py-4 text-left hover:bg-white/[0.1] active:scale-[0.98] transition ${isLastOdd ? 'col-span-2' : ''}`}
                >
                  <span className="w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30">
                    <Icon size={20} strokeWidth={2} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[13.5px] font-bold text-white">{group.label}</span>
                    <span className="text-[11px] text-zinc-500">{group.subtitle}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'pick-mechanic' && (() => {
        const group = MECHANIC_GROUPS.find((g) => g.id === pickedGroupId)
        const groupMechanics = group ? group.mechanicIds.map((id) => allMechanics.find((m) => m.id === id)).filter(Boolean) : []
        return (
          <div className="flex-1 overflow-y-auto px-4 pb-6 animate-fadeIn">
            {categories.length === 0 ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={22} /></div>
            ) : (
              <div className="space-y-1.5">
                {groupMechanics.map((mech) => (
                  <button
                    key={mech.id}
                    onClick={() => pickMechanic(mech)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-2.5 text-left hover:bg-white/[0.1] active:scale-[0.99] transition"
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${CATEGORY_COLOR[mech.category]}`} />
                      <span className="flex flex-col min-w-0">
                        <span className="text-[13.5px] font-semibold text-white truncate">{mech.label}</span>
                        <span className="text-[11px] text-zinc-500 truncate">{mech.description}</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-zinc-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {view === 'config' && draft && (() => {
        const mech = getMech(draft.mechanic)
        return (
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              {mech && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white"><span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_COLOR[mech.category]}`} />{mech.label}</span>}
              <span className="text-[11.5px] text-zinc-500 font-mono">{fmtTime(draft.startTime)}–{fmtTime(draft.endTime)}</span>
            </div>

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

            {draftError && <p className="text-[12.5px] text-rose-300">{draftError}</p>}

            <div className="flex items-center gap-2">
              {draft.id && (
                <button onClick={deleteDraft} aria-label="Delete moment" className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center bg-rose-500/20 border border-rose-500/40 text-rose-300 active:scale-90 transition"><Trash2 size={17} /></button>
              )}
              <button onClick={saveDraft} className="flex-1 py-3.5 rounded-full bg-white text-black font-bold text-[15px] active:scale-[0.99] transition">
                Guardar momento
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
