'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, X, Wand2, RotateCcw, Check } from 'lucide-react'

/**
 * AIVideoEditor — editor de VÍDEO con IA, 100% EN LÍNEA (sin modal/overlay,
 * mismo patrón que AIImageEditor.jsx: este componente vive dentro del panel
 * inferior de UploadDialog.jsx, y el vídeo en sí nunca se mueve de donde ya
 * estaba). A diferencia de la foto (una sola llamada), editar un vídeo es un
 * proceso LARGO (varios minutos, ver lib/aiVideoEditor.js) que corre en
 * segundo plano en el servidor — este componente lanza el "job" y hace
 * polling a /api/ai/edit-video-status hasta que termina, informando el
 * progreso al padre vía `onStatusChange('loading'|'result', url)` igual que
 * la foto, para que el vídeo mostrado arriba se actualice EN EL MISMO SITIO
 * (spinner mientras procesa, vídeo editado al terminar).
 *
 * Props:
 *  - videoFile: File — el vídeo original ya seleccionado en ese slot
 *  - onClose: () => void
 *  - onApply: (newFile: File) => void
 *  - onStatusChange: (status: null|'loading'|'result', url?: string) => void
 */

const FALLBACK_SUGGESTIONS = [
  'Add a private jet flying in the background',
  'Add fireworks in the sky',
  'Make it look cinematic and dramatic',
  'Add falling snow',
]

const STATUS_LABEL = {
  queued: 'Starting…',
  extracting: 'Reading your video…',
  editing_keyframes: 'Editing key moments…',
  synthesizing: 'Applying the edit throughout the video…',
  assembling: 'Putting it all together…',
  gpu_connect: 'Connecting to a free GPU…',
  gpu_queue: 'Waiting in the free GPU queue…',
  gpu_edit: 'Editing your video on a free GPU…',
  gpu_saving: 'Saving your edited video…',
}

// Space público de Lucy Edit (modelo abierto de Decart) corriendo en GPU
// GRATUITA (ZeroGPU). Se llama DESDE EL NAVEGADOR a propósito: la cuota
// diaria gratis de ZeroGPU es por IP del llamante, así cada usuario de la
// app tiene la suya propia — sin cuentas, sin tokens, sin configurar nada.
// Si no hay cuota o el Space está ocupado, se cae automáticamente al editor
// local del servidor (ilimitado): el usuario SIEMPRE puede seguir editando.
const LUCY_SPACE = 'decart-ai/lucy-edit-dev'

async function urlToFile(url, filename, mime) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || mime || 'video/mp4' })
}

// Captura un fotograma del vídeo (a ~10% de su duración) como Blob JPEG, para
// pedir sugerencias RELEVANTES al contenido real del vídeo (mismo endpoint
// /api/ai/suggest-edits que usan las fotos).
function captureVideoFrame(videoFile) {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      const objUrl = URL.createObjectURL(videoFile)
      video.src = objUrl
      const cleanup = () => { try { URL.revokeObjectURL(objUrl) } catch { /* ignore */ } }
      video.addEventListener('loadeddata', () => {
        try { video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1) } catch { cleanup(); resolve(null) }
      })
      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 480
          canvas.height = video.videoHeight || 270
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob((blob) => { cleanup(); resolve(blob) }, 'image/jpeg', 0.85)
        } catch { cleanup(); resolve(null) }
      })
      video.addEventListener('error', () => { cleanup(); resolve(null) })
    } catch { resolve(null) }
  })
}

export default function AIVideoEditor({ videoFile, onClose, onApply, onStatusChange }) {
  const [prompt, setPrompt] = useState('')
  const [stage, setStage] = useState('input') // input | loading | result | error
  const [jobStatus, setJobStatus] = useState(null)
  const [jobProgress, setJobProgress] = useState(0)
  const [jobTotal, setJobTotal] = useState(0)
  const [resultUrl, setResultUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [notice, setNotice] = useState(null) // aviso no bloqueante (p.ej. fallback a editor local)
  const pollRef = useRef(null)

  useEffect(() => {
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
    setNotice(null)
    setPrompt('')
    setSuggestions([])
    setJobStatus(null)
    setJobProgress(0)
    setJobTotal(0)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (!videoFile) return
    let cancelled = false
    setSuggestionsLoading(true)
    ;(async () => {
      try {
        const blob = await captureVideoFrame(videoFile)
        if (!blob) throw new Error('no_frame')
        const fd = new FormData()
        fd.append('image', blob, 'frame.jpg')
        const res = await fetch('/api/ai/suggest-edits', { method: 'POST', body: fd })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && Array.isArray(data?.suggestions) && data.suggestions.length > 0) setSuggestions(data.suggestions)
        else setSuggestions(FALLBACK_SUGGESTIONS)
      } catch {
        if (!cancelled) setSuggestions(FALLBACK_SUGGESTIONS)
      } finally {
        if (!cancelled) setSuggestionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [videoFile])

  const pollJob = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/edit-video-status?jobId=${encodeURIComponent(jobId)}`)
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.ok) throw new Error(data?.message || 'Could not check progress')
        setJobStatus(data.status)
        setJobProgress(data.progress || 0)
        setJobTotal(data.total || 0)
        if (data.status === 'done') {
          clearInterval(pollRef.current); pollRef.current = null
          setResultUrl(data.resultUrl)
          setStage('result')
          onStatusChange?.('result', data.resultUrl)
        } else if (data.status === 'error') {
          clearInterval(pollRef.current); pollRef.current = null
          setErrorMsg(data.error || 'AI video editing failed, please try again')
          setStage('error')
          onStatusChange?.(null)
        }
      } catch (e) {
        clearInterval(pollRef.current); pollRef.current = null
        setErrorMsg(e.message || 'Could not check progress')
        setStage('error')
        onStatusChange?.(null)
      }
    }, 3000)
  }

  const generate = async () => {
    const trimmed = prompt.trim()
    if (trimmed.length < 3 || !videoFile) return
    setStage('loading')
    setErrorMsg(null)
    setNotice(null)
    setJobStatus('queued')
    setJobProgress(0)
    setJobTotal(0)
    onStatusChange?.('loading')
    try {
      // 1) Clasificar la instrucción para elegir la mejor ruta.
      let mode = 'ADD_STATIC'
      try {
        const res = await fetch('/api/ai/classify-edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: trimmed }),
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.mode) mode = data.mode
      } catch { /* clasificador caído: ruta segura */ }

      // 2) Ediciones GLOBALES (reestilizados): primero la GPU GRATUITA
      //    (llamada desde este navegador — mejor calidad y más rápido).
      if (mode === 'GLOBAL') {
        try {
          await editOnFreeGpu(trimmed)
          return
        } catch (e) {
          // Sin cuota / Space ocupado / cualquier fallo -> editor local, que es
          // ILIMITADO: el usuario puede reintentar hasta quedar satisfecho.
          console.warn('free GPU unavailable, using local editor:', e?.message)
          setNotice('Free GPU is busy right now — using the built-in editor (slower, unlimited retries).')
          setJobStatus('queued')
        }
      }

      // 3) Ruta local del servidor (rápida para añadir elementos; lenta pero
      //    ilimitada para reestilizados cuando la GPU gratis no está).
      const fd = new FormData()
      fd.append('video', videoFile)
      fd.append('prompt', trimmed)
      fd.append('mode', mode)
      const res = await fetch('/api/ai/edit-video', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.jobId) {
        throw new Error(data?.message || 'Could not start the AI video editor')
      }
      pollJob(data.jobId)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong, please try again')
      setStage('error')
      onStatusChange?.(null)
    }
  }

  // Edición en la GPU gratuita (Space público de Lucy Edit) desde el
  // NAVEGADOR. Lanza excepción si no se puede (el llamador hace fallback).
  const editOnFreeGpu = async (trimmed) => {
    setJobStatus('gpu_connect')
    const { Client, handle_file } = await import('@gradio/client')
    const client = await Promise.race([
      Client.connect(LUCY_SPACE),
      new Promise((_, rej) => setTimeout(() => rej(new Error('gpu_connect_timeout')), 30000)),
    ])
    setJobStatus('gpu_queue')
    // predict() espera al resultado (probado de forma fiable con este Space;
    // la iteración de submit() puede terminar en silencio ante errores de
    // cuota). El deadline evita esperas infinitas si la cola se atasca.
    const result = await Promise.race([
      client.predict('/process_video', {
        video_path: { video: handle_file(videoFile), subtitles: null },
        prompt: trimmed,
        negative_prompt: '',
        num_frames: 81,
        auto_resize: true,
        manual_height: 480,
        manual_width: 832,
        guidance_scale: 5,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('gpu_timeout')), 6 * 60 * 1000)),
    ])
    const out = result?.data?.[0]
    const url = out?.video?.url || out?.url
    if (!url) throw new Error('gpu_no_result')
    // Descargar el resultado y guardarlo en NUESTRO servidor (transcodificado
    // a H.264 web-safe) para que el resto del flujo sea idéntico al local.
    setJobStatus('gpu_saving')
    const blob = await (await fetch(url)).blob()
    if (!blob || blob.size < 1000) throw new Error('gpu_empty_result')
    const fd = new FormData()
    fd.append('video', new File([blob], 'lucy-edited.mp4', { type: 'video/mp4' }))
    const res = await fetch('/api/ai/store-edited-video', { method: 'POST', body: fd })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.url) throw new Error('store_failed')
    setResultUrl(data.url)
    setStage('result')
    onStatusChange?.('result', data.url)
  }

  const useThisVideo = async () => {
    if (!resultUrl) return
    const file = await urlToFile(resultUrl, `ai-edited-${Date.now()}.mp4`, 'video/mp4')
    onApply(file)
  }

  const tryAnotherPrompt = () => {
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
    setNotice(null)
    setJobStatus(null)
    setJobProgress(0)
    setJobTotal(0)
    onStatusChange?.(null) // vuelve a mostrar el vídeo original, arriba, en el mismo sitio
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-[14px] font-bold tracking-tight flex items-center gap-1.5">
          <Sparkles size={14} className="text-white/80" />
          Edit video with AI
        </h2>
        <button onClick={onClose} aria-label="Close AI editor" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition text-zinc-400 hover:text-white">
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>

      {/* STAGE: input / loading — instrucción + sugerencias */}
      {(stage === 'input' || stage === 'loading') && (
        <>
          {stage === 'input' && (
            <p className="text-[11.5px] text-zinc-500 -mt-1">
              Adding an element takes under a minute. Full restyles use a free GPU when available. Retry as many times as you like.
            </p>
          )}
          <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={stage === 'loading'}
              placeholder="Add a private jet flying in the background…"
              rows={2}
              maxLength={500}
              className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-none disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
            {suggestionsLoading ? (
              <>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="shrink-0 h-[26px] w-24 rounded-full bg-white/[0.06] border border-white/10 animate-pulse" />
                ))}
              </>
            ) : (
              suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={stage === 'loading'}
                  onClick={() => setPrompt(s)}
                  className="shrink-0 whitespace-nowrap text-[11.5px] font-medium px-3 py-1.5 rounded-full bg-black/45 border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95 transition disabled:opacity-40"
                >
                  {s}
                </button>
              ))
            )}
          </div>

          {stage === 'loading' && (
            <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-zinc-200 font-medium">
                <Loader2 size={15} className="animate-spin shrink-0" />
                {STATUS_LABEL[jobStatus] || 'Processing…'}
              </div>
              {notice && (
                <p className="text-[11.5px] text-amber-300/90">{notice}</p>
              )}
              {jobTotal > 0 && (
                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round((jobProgress / jobTotal) * 100))}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <button
            onClick={generate}
            disabled={prompt.trim().length < 3 || stage === 'loading'}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] disabled:bg-white/20 disabled:text-white/40 active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            {stage === 'loading' ? (
              <><Loader2 size={17} className="animate-spin" /> Editing your video…</>
            ) : (
              <><Wand2 size={17} strokeWidth={2} /> Generate with AI</>
            )}
          </button>
        </>
      )}

      {/* STAGE: error */}
      {stage === 'error' && (
        <>
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 px-4 py-3">
            <p className="text-rose-300 text-[13px]">{errorMsg}</p>
          </div>
          <button
            onClick={generate}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            <RotateCcw size={17} strokeWidth={2} /> Try again
          </button>
          <button
            onClick={tryAnotherPrompt}
            className="w-full py-3 rounded-full bg-black/45 border border-white/10 text-white font-semibold text-[14px] active:scale-[0.99] transition"
          >
            Edit instruction
          </button>
        </>
      )}

      {/* STAGE: result — el vídeo editado ya se ve ARRIBA, en el mismo sitio */}
      {stage === 'result' && (
        <>
          <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3 flex items-center gap-2 text-[13px] text-zinc-300">
            <Sparkles size={14} className="text-white/80 shrink-0" /> AI result shown above — keep it?
          </div>
          <button
            onClick={useThisVideo}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            <Check size={18} strokeWidth={2.5} /> Use this video
          </button>
          <button
            onClick={tryAnotherPrompt}
            className="w-full py-3 rounded-full bg-black/45 border border-white/10 text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.99] transition"
          >
            <RotateCcw size={15} strokeWidth={2} /> Try another instruction
          </button>
        </>
      )}
    </div>
  )
}
