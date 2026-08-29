'use client'
/* eslint-disable react-hooks/set-state-in-effect -- reseteo de estado al cerrar; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Film, Check, Swords, Upload, Flame, Images, SwitchCamera } from 'lucide-react'
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

  useEffect(() => {
    if (!open) {
      setFile(null); setMessage(''); setError(null)
      setRecording(false); setCameraError(null); setFacingMode('environment')
    }
  }, [open])

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
        <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-7 space-y-5"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 28px)' }}>
          <>
              {/* Enfrentamiento: tu vídeo (A, morado) vs el contenido retado (B, azul) */}
              <div className="relative grid grid-cols-2 gap-3.5">
                <input ref={inputRef} type="file" accept={requiredAccept} className="hidden" onChange={handleFileChange} />

                {/* Tu vídeo */}
                <div
                  className="group relative w-full aspect-[4/5] rounded-2xl overflow-hidden transition"
                  style={{
                    background: file || !cameraError ? '#000' : 'linear-gradient(160deg, rgba(168,85,247,0.16), rgba(168,85,247,0.04))',
                    boxShadow: file ? `0 0 0 2px ${PURPLE}` : `inset 0 0 0 1.5px rgba(168,85,247,0.45)`,
                  }}
                >
                  <span className="absolute top-2 left-2 z-20 text-[10px] font-bold rounded-full px-2.5 py-0.5 text-white" style={{ background: PURPLE }}>You</span>
                  {file ? (
                    <button onClick={pickFile} className="absolute inset-0 w-full h-full active:scale-[0.98] transition">
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
                      {/* Cámara EN VIVO — petición del usuario: "también
                          tendría que tener la opción de usar la cámara".
                          El disparador se adapta al tipo exigido (ver
                          handleShutterDown/Up más arriba). */}
                      <video ref={videoPreviewRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                      {recording && (
                        <span className="absolute top-2 right-2 z-20 inline-flex items-center gap-1 text-white text-[9px] font-bold bg-red-500 px-2 py-0.5 rounded-full">
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
          </>
        </div>
      </div>
    </div>
  )
}
