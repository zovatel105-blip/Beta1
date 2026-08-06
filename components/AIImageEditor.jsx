'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, X, ArrowLeft, Wand2, RotateCcw, Check } from 'lucide-react'

/**
 * AIImageEditor — editor de fotos con IA dentro del flujo de creación de
 * contenido (UploadDialog). El usuario escribe una instrucción (ej. "añade
 * un jet privado de fondo") y Gemini 2.5 Flash Image ("Nano Banana", vía
 * POST /api/ai/edit-image con la Universal Key de Emergent) genera la foto
 * editada. Permite reintentar con otra instrucción antes de confirmar.
 *
 * Props:
 *  - open: boolean
 *  - imageFile: File — la foto original ya seleccionada en ese slot
 *  - onClose: () => void — cerrar sin aplicar ningún cambio
 *  - onApply: (newFile: File) => void — usar la foto editada como reemplazo
 */

const SUGGESTIONS = [
  'Add a private jet flying in the background',
  'Change the background to a sunset beach',
  'Add fireworks in the sky',
  'Make it look cinematic and dramatic',
  'Add falling snow',
  'Add a luxury sports car next to me',
]

async function dataUrlToFile(dataUrl, filename) {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

export default function AIImageEditor({ open, imageFile, onClose, onApply }) {
  const [prompt, setPrompt] = useState('')
  const [stage, setStage] = useState('input') // input | loading | result | error
  const [resultUrl, setResultUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [originalUrl, setOriginalUrl] = useState(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
    setPrompt('')
  }, [open])

  useEffect(() => {
    if (!imageFile) { setOriginalUrl(null); return }
    const url = URL.createObjectURL(imageFile)
    setOriginalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  if (!open) return null

  const generate = async () => {
    const trimmed = prompt.trim()
    if (trimmed.length < 3 || !imageFile) return
    setStage('loading')
    setErrorMsg(null)
    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      fd.append('prompt', trimmed)
      const res = await fetch('/api/ai/edit-image', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.image) {
        throw new Error(data?.message || 'The AI could not edit this photo')
      }
      setResultUrl(data.image)
      setStage('result')
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong, please try again')
      setStage('error')
    }
  }

  const useThisPhoto = async () => {
    if (!resultUrl) return
    const file = await dataUrlToFile(resultUrl, `ai-edited-${Date.now()}.png`)
    onApply(file)
  }

  const tryAnotherPrompt = () => {
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-[#0a0a0b] flex flex-col text-white">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-1">
          {stage === 'result' || stage === 'error' ? (
            <button onClick={tryAnotherPrompt} aria-label="Back" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition">
              <ArrowLeft size={20} strokeWidth={1.75} />
            </button>
          ) : (
            <span className="w-1.5" />
          )}
          <h1 className="text-[17px] font-semibold tracking-tight flex items-center gap-1.5">
            <Sparkles size={16} className="text-white/80" />
            Edit with AI
          </h1>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-zinc-400 hover:text-white">
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-8">
        <div className="max-w-md mx-auto w-full min-h-full flex flex-col">

          {/* Preview: original (input/loading) o resultado (result/error) */}
          <div className="relative w-full aspect-[4/5] rounded-3xl overflow-hidden bg-white/[0.03] border border-white/10 mb-5 shrink-0">
            {stage === 'result' && resultUrl ? (
              <img src={resultUrl} alt="Edited" className="absolute inset-0 w-full h-full object-cover" />
            ) : originalUrl ? (
              <img src={originalUrl} alt="Original" className="absolute inset-0 w-full h-full object-cover" />
            ) : null}

            {stage === 'loading' && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                <Loader2 size={28} className="animate-spin text-white" />
                <p className="text-[13px] font-medium text-zinc-200">Editing your photo with AI…</p>
                <p className="text-[11px] text-zinc-500">This can take a few seconds</p>
              </div>
            )}

            {stage === 'result' && (
              <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15">
                <Sparkles size={11} /> AI result
              </span>
            )}
          </div>

          {/* STAGE: input — instrucción + sugerencias */}
          {(stage === 'input' || stage === 'loading') && (
            <div className="space-y-3">
              <p className="text-zinc-400 text-[13px]">
                Describe what you want to add or change in the photo.
              </p>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 focus-within:border-white/30 transition px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={stage === 'loading'}
                  placeholder="Add a private jet flying in the background…"
                  rows={3}
                  maxLength={500}
                  className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none disabled:opacity-50"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={stage === 'loading'}
                    onClick={() => setPrompt(s)}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95 transition disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <button
                onClick={generate}
                disabled={prompt.trim().length < 3 || stage === 'loading'}
                className="mt-2 w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition disabled:bg-white/20 disabled:text-white/40"
              >
                {stage === 'loading' ? (
                  <><Loader2 size={17} className="animate-spin" /> Generating…</>
                ) : (
                  <><Wand2 size={17} strokeWidth={2} /> Generate with AI</>
                )}
              </button>
            </div>
          )}

          {/* STAGE: error */}
          {stage === 'error' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 px-4 py-3">
                <p className="text-rose-300 text-[13px]">{errorMsg}</p>
              </div>
              <button
                onClick={generate}
                className="w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition"
              >
                <RotateCcw size={17} strokeWidth={2} /> Try again
              </button>
              <button
                onClick={tryAnotherPrompt}
                className="w-full h-12 rounded-full bg-white/[0.06] border border-white/10 text-white font-semibold text-[15px] hover:bg-white/[0.1] active:scale-[0.99] transition"
              >
                Edit instruction
              </button>
            </div>
          )}

          {/* STAGE: result — usar / reintentar / cancelar */}
          {stage === 'result' && (
            <div className="space-y-2.5">
              <button
                onClick={useThisPhoto}
                className="w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition"
              >
                <Check size={17} strokeWidth={2.5} /> Use this photo
              </button>
              <button
                onClick={tryAnotherPrompt}
                className="w-full h-12 rounded-full bg-white/[0.06] border border-white/10 text-white font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-white/[0.1] active:scale-[0.99] transition"
              >
                <RotateCcw size={16} strokeWidth={2} /> Try another instruction
              </button>
              <button
                onClick={onClose}
                className="w-full h-11 rounded-full text-zinc-400 hover:text-white text-[14px] font-medium transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
