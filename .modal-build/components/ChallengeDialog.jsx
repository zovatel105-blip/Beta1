'use client'
/* eslint-disable react-hooks/set-state-in-effect -- reseteo de estado al cerrar; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Film, Check, Swords, Upload, Flame, Images, SwitchCamera, Maximize2, Minimize2, Sparkles, Loader2 } from 'lucide-react'
import Avatar from './Avatar'
import AIImageEditor from './AIImageEditor'

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
  // Alto del modal capturado justo antes de expandir (ver toggleExpanded) —
  // petición del usuario: "el modal no debe hacerse mas grande y la
  // tarjeta cuando se expanda debe ocupar todo el modal". En vez de dejar
  // que el modal crezca hasta su tope (max-h-[92vh]) al expandir la
  // tarjeta (lo que SÍ cambiaría su tamaño visible si el contenido normal
  // era más bajo que ese tope), se congela la altura EXACTA que el modal
  // ya tenía en ese instante (getBoundingClientRect, ver toggleExpanded) y
  // la tarjeta "You" (flex-1) rellena ESE mismo espacio ya existente —
  // el modal no cambia de tamaño, solo cambia lo que hay dentro.
  const modalRef = useRef(null)
  const [lockedHeight, setLockedHeight] = useState(null)

  // Cámara EN VIVO (petición del usuario: "también tendría que tener la
  // opción de usar la cámara" — antes este modal solo ofrecía subir desde
  // galería). Mismo enfoque que UploadDialog.jsx (getUserMedia + captura de
  // frame para foto / MediaRecorder para vídeo), adaptado al tamaño de esta
  // tarjeta pequeña (aspect 4:5) en vez de pantalla completa.
  const videoPreviewRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const shutterTimerRef = useRef(null)
  const isHoldingRef = useRef(false)
  const [facingMode, setFacingMode] = useState('environment')
  const [recording, setRecording] = useState(false)
  const [cameraError, setCameraError] = useState(null)

  // Expandir la tarjeta "You" DENTRO del propio modal (petición del
  // usuario: "el boton de expandir tiene que aparecer antes de subir foto
  // o hacer foto y debe expandirse la tarjeta solo en el modal", y luego
  // "el modal no debe hacerse mas grande y la tarjeta cuando se expanda
  // debe ocupar todo el modal") — el botón "Expand" siempre está visible
  // sobre la tarjeta "You", incluso ANTES de tener un archivo -cámara en
  // vivo/estado de error-; al pulsarlo, el resto del contenido (tarjeta
  // rival, insignia VS, mensaje, aviso, botón Enviar) se OCULTA y esta
  // tarjeta ocupa TODO el espacio que el modal ya tenía (ver lockedHeight
  // arriba) — el modal en sí no cambia de tamaño. "Editar con IA" sigue
  // apareciendo solo una vez hay una FOTO (mismo criterio que
  // UploadDialog.jsx: oculto para vídeo), y ese sí abre su propio flujo a
  // pantalla completa (necesita espacio para el prompt/sugerencias/
  // galería de estilos, igual que en UploadDialog.jsx). `aiOverride` sigue
  // el mismo patrón "en el mismo sitio" que UploadDialog.jsx (ver
  // AIImageEditor.jsx/onStatusChange): null = sin edición en curso;
  // {status:'loading'} mientras genera; {status:'result', url} con el
  // resultado ya listo para confirmar.
  const [expanded, setExpanded] = useState(false)
  const [aiEditorOpen, setAiEditorOpen] = useState(false)
  const [aiOverride, setAiOverride] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (!open) {
      setFile(null); setMessage(''); setError(null)
      setRecording(false); setCameraError(null); setFacingMode('environment')
      setExpanded(false); setAiEditorOpen(false); setAiOverride(null); setLockedHeight(null)
    }
  }, [open])

  // URL de previsualización memorizada (evita recrearla en cada render, lo
  // que reiniciaría el vídeo/perdería el blob al escribir el mensaje) —
  // mismo enfoque que UploadDialog.jsx.
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Pide acceso a la cámara mientras el modal está abierto y no hay archivo
  // todavía (se libera en cuanto se elige/captura uno, o se cierra el modal).
  useEffect(() => {
    if (!open || file) {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
        cameraStreamRef.current = null
      }
      return
    }
    // Si el reto ya tiene un tipo de media fijo (foto o vídeo), solo se pide
    // el micrófono cuando realmente se puede grabar vídeo (evita un permiso
    // de más cuando solo se va a poder tomar una foto).
    const targetIsImg = target?.mediaType === 'image'
    const hasMedia = !!(target?.videoUrl || target?.imageUrl)
    const needsAudio = !hasMedia || !targetIsImg
    let cancelled = false
    setCameraError(null)
    navigator.mediaDevices?.getUserMedia?.({ video: { facingMode }, audio: needsAudio })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        if (cameraStreamRef.current) cameraStreamRef.current.getTracks().forEach((t) => t.stop())
        cameraStreamRef.current = stream
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream
      })
      .catch(() => { if (!cancelled) setCameraError('denied') })
    return () => {
      cancelled = true
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
        cameraStreamRef.current = null
      }
    }
  }, [open, file, facingMode, target])

  if (!open) return null

  // El contenido retado ya tiene un tipo de media fijo (vídeo o foto): tu
  // respuesta DEBE ser del MISMO tipo (vídeo<->vídeo, foto<->foto). Si es un
  // reto "de mención" (sin contenido concreto, target.videoUrl === ''), no
  // hay tipo que igualar: se permite subir vídeo O foto libremente.
  const hasTargetMedia = !!(target?.videoUrl || target?.imageUrl)
  const targetIsImage = target?.mediaType === 'image'
  const requiredAccept = !hasTargetMedia ? 'video/*,image/*' : (targetIsImage ? 'image/*' : 'video/*')
  const requiredLabel = targetIsImage ? 'photo' : 'video'

  const pickFile = () => inputRef.current?.click()

  // Alterna la tarjeta "You" expandida — congela la altura ACTUAL del
  // modal (medida real, no un valor fijo inventado) justo antes de
  // expandir, para que el modal no cambie de tamaño (ver comentario junto
  // a `lockedHeight` más arriba); al colapsar, se libera y el modal vuelve
  // a su alto natural de siempre.
  const toggleExpanded = () => {
    if (!expanded) {
      if (!lockedHeight) {
        const h = modalRef.current?.getBoundingClientRect().height
        if (h) setLockedHeight(h)
      }
      setExpanded(true)
    } else {
      setExpanded(false)
      if (!aiEditorOpen) setLockedHeight(null)
    }
  }

  // Abrir/cerrar el editor de IA — petición del usuario tras ver que se
  // abría como una pantalla nueva aparte: "cuando hago click en el
  // editor el modal SE HACE mas grande". Mismo mecanismo EXACTO que
  // toggleExpanded (congela la altura actual del modal, ver
  // `lockedHeight`) — el editor vive DENTRO del mismo modal, nunca en un
  // overlay `fixed inset-0` aparte. Si ya estaba expandida la tarjeta
  // (`expanded`), la altura ya estaba congelada — se reutiliza tal cual;
  // al cerrar el editor, solo se libera si tampoco queda expandida.
  const openAiEditor = () => {
    if (!expanded && !aiEditorOpen && !lockedHeight) {
      const h = modalRef.current?.getBoundingClientRect().height
      if (h) setLockedHeight(h)
    }
    setAiEditorOpen(true)
  }
  const closeAiEditor = () => {
    setAiEditorOpen(false)
    setAiOverride(null)
    if (!expanded) setLockedHeight(null)
  }

  // Captura una FOTO del frame actual de la cámara en vivo (canvas oculto ->
  // File, mismo tipo de objeto que produce el <input type="file">).
  const capturePhoto = () => {
    const video = videoPreviewRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      setError(null)
      setFile(new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  const startRecording = () => {
    const stream = cameraStreamRef.current
    if (!stream) return
    recordedChunksRef.current = []
    let mr
    try { mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' }) }
    catch { try { mr = new MediaRecorder(stream) } catch { return } }
    mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data) }
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mr.mimeType || 'video/webm' })
      setError(null)
      setFile(new File([blob], `video_${Date.now()}.webm`, { type: blob.type }))
      setRecording(false)
    }
    mediaRecorderRef.current = mr
    mr.start()
    setRecording(true)
  }
  const stopRecording = () => { try { mediaRecorderRef.current?.stop() } catch { /* ignore */ } }

  // El disparador se adapta al tipo de media que EXIGE este reto:
  //  - sin tipo fijo (reto abierto/de mención): toque = foto, mantener
  //    pulsado = grabar vídeo (mismo gesto que en UploadDialog.jsx).
  //  - el reto pide FOTO: un solo toque siempre captura foto (no tiene
  //    sentido ofrecer grabar vídeo si no se puede usar).
  //  - el reto pide VÍDEO: un solo toque inicia grabación, otro toque la
  //    detiene (no hace falta mantener pulsado si es la única opción).
  const videoOnly = hasTargetMedia && !targetIsImage
  const photoOnly = hasTargetMedia && targetIsImage
  const handleShutterDown = () => {
    if (photoOnly || videoOnly) return
    isHoldingRef.current = false
    shutterTimerRef.current = setTimeout(() => { isHoldingRef.current = true; startRecording() }, 320)
  }
  const handleShutterUp = () => {
    if (videoOnly) { if (recording) stopRecording(); else startRecording(); return }
    if (photoOnly) { capturePhoto(); return }
    clearTimeout(shutterTimerRef.current)
    if (isHoldingRef.current) stopRecording(); else capturePhoto()
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const isImg = f.type.startsWith('image/')
    const isVid = f.type.startsWith('video/')
    if (!isImg && !isVid) { setError('Select a video or photo'); return }
    // Debe coincidir con el tipo del contenido retado (solo aplica cuando
    // el reto ya tiene un contenido concreto que enfrentar).
    if (hasTargetMedia && ((targetIsImage && !isImg) || (!targetIsImage && !isVid))) {
      setError(`@${target?.author?.username || 'this'} challenge is a ${requiredLabel} — upload a ${requiredLabel} to match`)
      return
    }
    const maxMB = isImg ? 15 : 80
    if (f.size > maxMB * 1024 * 1024) { setError(`Maximum ${maxMB}MB`); return }
    setError(null)
    setFile(f)
  }

  // Enviar el reto: delega la SUBIDA al contenedor (Feed) para que ocurra en
  // segundo plano. El modal se cierra al instante y el usuario puede seguir
  // descubriendo contenido mientras se envía.
  const doSend = () => {
    if (!file || !target) { setError(hasTargetMedia ? `Upload your ${requiredLabel} to challenge` : 'Upload your video or photo to challenge'); return }
    onSubmit?.({ file, target, message })
    onClose()
  }

  const username = target?.author?.username || 'rival'
  const fileIsImage = !!file && file.type?.startsWith('image/')
  const targetMediaUrl = target?.posterUrl || target?.imageUrl || target?.videoUrl || null
  // Foto/vídeo a mostrar en la tarjeta "You": el resultado de la IA (si ya
  // se generó y no se ha vuelto a cambiar el archivo) sustituye la
  // previsualización original, en el mismo sitio (mismo patrón que
  // UploadDialog.jsx).
  const isAiLoading = aiOverride?.status === 'loading'
  const displayUrl = aiOverride?.status === 'result' ? aiOverride.url : previewUrl

  // Contenido de la tarjeta "You" — SIEMPRE el mismo (las 3 ramas
  // file/cameraError/cámara en vivo, más los botones Expand/Editar con
  // IA), tanto si se muestra pequeña dentro del grid como si ocupa el
  // modal completo (expanded=true, ver más abajo) — definido una sola vez
  // para no duplicar este bloque en los 2 sitios donde se usa.
  const youCardBg = {
    background: file || !cameraError ? '#000' : 'linear-gradient(160deg, rgba(168,85,247,0.16), rgba(168,85,247,0.04))',
    boxShadow: file ? `0 0 0 2px ${PURPLE}` : `inset 0 0 0 1.5px rgba(168,85,247,0.45)`,
  }
  const youCardInner = (
    <>
      <span className="absolute top-2 left-2 z-20 text-[10px] font-bold rounded-full px-2.5 py-0.5 text-white" style={{ background: PURPLE }}>You</span>
      {file ? (
        <button onClick={pickFile} className="absolute inset-0 w-full h-full active:scale-[0.98] transition">
          {fileIsImage ? (
            <img key={displayUrl} src={displayUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <video key={displayUrl} src={displayUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          )}
          {isAiLoading ? (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1.5 pointer-events-none">
              <Loader2 size={20} className="animate-spin text-white" />
              <span className="text-[10.5px] font-medium text-zinc-200">Editing with AI…</span>
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/45 flex flex-col items-center justify-center gap-1.5">
              <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: PURPLE }}>
                <Check size={20} className="text-white" strokeWidth={2.6} />
              </span>
              <span className="text-[11px] text-white/90 underline underline-offset-2">{fileIsImage ? 'Change photo' : 'Change video'}</span>
            </div>
          )}
        </button>
      ) : cameraError ? (
        <button onClick={pickFile} className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 px-3 active:scale-[0.98] transition">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.2)' }}>
            <Upload size={22} style={{ color: PURPLE }} strokeWidth={2} />
          </span>
          <div className="text-center leading-tight">
            <p className="text-[12px] font-semibold text-zinc-900">
              {hasTargetMedia ? `Upload your ${requiredLabel}` : 'Upload your video or photo'}
            </p>
            <p className="text-[10.5px] text-zinc-500 mt-0.5">
              {hasTargetMedia ? `@${username} challenged with a ${requiredLabel} — match it` : 'Record or pick one'}
            </p>
          </div>
        </button>
      ) : (
        <>
          {/* Cámara EN VIVO — petición del usuario: "también tendría que
              tener la opción de usar la cámara". El disparador se adapta
              al tipo exigido (ver handleShutterDown/Up más arriba). */}
          <video ref={videoPreviewRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
          {recording && (
            <span className="absolute top-2 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1 text-white text-[9px] font-bold bg-red-500 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> REC
            </span>
          )}
          <button
            type="button"
            onClick={pickFile}
            aria-label="Choose from gallery"
            className="absolute z-20 bottom-2 left-2 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur active:scale-90 transition text-white"
          >
            <Images size={14} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onPointerDown={handleShutterDown}
            onPointerUp={handleShutterUp}
            onPointerLeave={() => { if (isHoldingRef.current) handleShutterUp() }}
            aria-label="Take photo or record video"
            className={`absolute z-20 bottom-2 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full border-[3px] active:scale-90 transition flex items-center justify-center ${recording ? 'bg-red-500 border-white/70' : 'bg-white border-white/50'}`}
          >
            {recording && <span className="w-3.5 h-3.5 rounded-[3px] bg-white" />}
          </button>
          <button
            type="button"
            onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
            aria-label="Flip camera"
            className="absolute z-20 bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 backdrop-blur active:scale-90 transition text-white"
          >
            <SwitchCamera size={14} strokeWidth={1.9} />
          </button>
        </>
      )}

      {/* Expandir (ocupa el modal ENTERO, ver estado `expanded` y el
          comentario en el return) y Editar con IA — petición del usuario:
          "el boton de expandir tiene que aparecer antes de subir foto o
          hacer foto". "Expand"/"Collapse" SIEMPRE visible; "Editar con
          IA" solo una vez hay una FOTO (mismo criterio que
          UploadDialog.jsx: oculto para vídeo). */}
      <div className="absolute top-2 right-2 z-30 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="w-7 h-7 rounded-full flex items-center justify-center bg-black/45 backdrop-blur active:scale-90 transition text-white"
        >
          {expanded ? <Minimize2 size={13} strokeWidth={2.1} /> : <Maximize2 size={13} strokeWidth={2.1} />}
        </button>
        {fileIsImage && (
          <button
            type="button"
            onClick={openAiEditor}
            aria-label="Edit with AI"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-black/45 backdrop-blur active:scale-90 transition text-white"
          >
            <Sparkles size={13} strokeWidth={1.9} />
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={modalRef}
        className="relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl bg-white max-h-[92vh] overflow-hidden flex flex-col"
        style={(expanded || aiEditorOpen) && lockedHeight ? { height: `${lockedHeight}px` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {/* El <input> vive fuera de las 2 ramas de abajo — se necesita
            siempre montado (pickFile lo referencia) sea que la tarjeta
            esté expandida o no. */}
        <input ref={inputRef} type="file" accept={requiredAccept} className="hidden" onChange={handleFileChange} />

        {/* Petición del usuario: "dije que debe ocupar TODO el modal" — al
            expandir, se oculta TODO lo demás (glow, flecha de cerrar,
            header, trending, grid/mensaje/aviso/botón) y la tarjeta "You"
            pasa a ser el ÚNICO contenido del modal, de borde a borde (sin
            padding), sin que el modal cambie de tamaño (ver
            `lockedHeight`, capturado en toggleExpanded). El botón
            "Collapse" dentro de la propia tarjeta (youCardInner) es la
            única forma de volver a la vista normal mientras está así.
            "Editar con IA" (aiEditorOpen) usa el MISMO mecanismo —
            petición del usuario: "cuando hago click en el editor el
            modal SE HACE mas grande" (con el editor viviendo antes en un
            overlay `fixed inset-0` aparte) — ahora vive DENTRO de este
            mismo modal, con la MISMA altura congelada, nunca crece. */}
        {aiEditorOpen ? (
          <div className="relative w-full h-full flex flex-col bg-black overflow-hidden">
            <div className="relative flex-1 min-h-0">
              <img key={displayUrl} src={displayUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
              {isAiLoading && (
                <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-none">
                  <Loader2 size={26} className="animate-spin text-white" />
                  <span className="text-[12.5px] font-medium text-zinc-200">Editing with AI…</span>
                </div>
              )}
              <button
                type="button"
                onClick={closeAiEditor}
                aria-label="Close AI editor"
                className="absolute z-10 top-2 left-2 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 backdrop-blur active:scale-90 transition text-white"
              >
                <ChevronDown className="w-5 h-5" strokeWidth={2.2} />
              </button>
            </div>
            <div className="shrink-0 px-4 pt-3 overflow-y-auto" style={{ maxHeight: '55%', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
              <AIImageEditor
                imageFile={file}
                initialPrompt={target?.luxuryTheme?.promptHint || ''}
                onStatusChange={(status, url) => setAiOverride(status ? { status, url } : null)}
                onClose={closeAiEditor}
                onApply={(newFile) => { setFile(newFile); closeAiEditor() }}
              />
            </div>
          </div>
        ) : expanded ? (
          <div className="group relative w-full h-full overflow-hidden transition" style={youCardBg}>
            {youCardInner}
          </div>
        ) : (
          <>
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

            {/* "Trending Challenge" — petición del usuario: "cuando reto una
                publicación que fue creada mediante un trending challenge, debe
                aparecer en el modal, ejemplo trending Yacht Life". Solo si el
                contenido que se está retando (`target`) lleva un tema adjunto
                (nació de aceptar un reto con un Trending Challenge, ver
                handleAcceptChallenge/route.js — el post guarda `luxuryTheme`). */}
            {target?.luxuryTheme?.title && (
              <div className="relative z-10 px-5 -mt-1 mb-1">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold w-fit"
                     style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.18), rgba(245,158,11,0.18))', border: '1px solid rgba(252,211,77,0.4)', color: '#B45309' }}>
                  <Flame size={12} className="fill-current" />
                  Trending Challenge: {target.luxuryTheme.title}
                </div>
              </div>
            )}

            {/* Body */}
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-5 pb-7 space-y-5"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>
              {/* Enfrentamiento: tu vídeo (A, morado) vs el contenido retado (B, azul) */}
              <div className="relative grid grid-cols-2 gap-3.5">
                {/* Tu vídeo */}
                <div className="group relative w-full aspect-[4/5] rounded-2xl overflow-hidden transition" style={youCardBg}>
                  {youCardInner}
                </div>

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
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
