'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, X, ArrowLeft, Wand2, RotateCcw, Check, ChevronDown } from 'lucide-react'

/**
 * AIImageEditor — editor de fotos con IA, EN EL MISMO SITIO (bottom sheet).
 *
 * BUG UX (usuario: 'cuando hago click en el boton no debe abrir otra pagina
 * debe editarse desde el mismo sitio'): la versión anterior abría una
 * pantalla completa nueva (con su propio header/foto/back), lo que se sentía
 * como navegar a "otra página". AHORA: este componente es solo una hoja
 * inferior (bottom sheet) con los controles (instrucción, sugerencias,
 * generar/reintentar/usar) — la FOTO en sí NUNCA se mueve de donde ya
 * estaba (la vista previa a pantalla completa de UploadDialog, detrás de
 * esta hoja). Este componente NO renderiza ninguna imagen: en su lugar
 * informa su estado al padre vía `onStatusChange(status, url)` para que
 * UploadDialog sustituya la miniatura ahí mismo:
 *   - onStatusChange(null)                -> mostrar la foto original
 *   - onStatusChange('loading')           -> mostrar la foto original + spinner
 *   - onStatusChange('result', dataUrl)   -> mostrar la foto editada, en el mismo lugar
 *
 * Props:
 *  - open: boolean
 *  - imageFile: File — la foto original ya seleccionada en ese slot (solo se
 *    usa para enviarla a la IA, nunca se muestra dentro de este componente)
 *  - onClose: () => void — cerrar sin aplicar ningún cambio (revierte a la original)
 *  - onApply: (newFile: File) => void — usar la foto editada como reemplazo
 *  - onStatusChange: (status: null|'loading'|'result', url?: string) => void
 */

const SUGGESTIONS = [
  'Add a private jet flying in the background',
  'Change the background to a sunset beach',
  'Add fireworks in the sky',
  'Make it look cinematic and dramatic',
  'Add falling snow',
]

async function dataUrlToFile(dataUrl, filename) {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

export default function AIImageEditor({ open, imageFile, onClose, onApply, onStatusChange }) {
  const [prompt, setPrompt] = useState('')
  const [stage, setStage] = useState('input') // input | loading | result | error
  const [resultUrl, setResultUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    if (!open) return
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
    setPrompt('')
  }, [open])

  if (!open) return null

  const generate = async () => {
    const trimmed = prompt.trim()
    if (trimmed.length < 3 || !imageFile) return
    setStage('loading')
    setErrorMsg(null)
    onStatusChange?.('loading')
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
      onStatusChange?.('result', data.image)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong, please try again')
      setStage('error')
      onStatusChange?.(null)
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
    onStatusChange?.(null) // vuelve a mostrar la foto original en el mismo sitio
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center pointer-events-none">
      <div
        className="pointer-events-auto w-full sm:max-w-md rounded-t-3xl bg-[#121214] border-t border-x border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.55)]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {/* Asa para cerrar (mismo patrón que MusicPicker) */}
        <button type="button" onClick={onClose} aria-label="close" className="w-full flex justify-center items-center pt-3 pb-1 active:scale-90 transition">
          <ChevronDown className="w-5 h-5 text-zinc-500" strokeWidth={2.2} />
        </button>

        <div className="px-5 pb-1">
          {/* Header de la hoja */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white text-[16px] font-bold tracking-tight flex items-center gap-2">
              <Sparkles size={16} className="text-white/80" />
              Edit with AI
            </h2>
            {(stage === 'result' || stage === 'error') ? (
              <button onClick={tryAnotherPrompt} aria-label="Back" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-zinc-400 hover:text-white">
                <ArrowLeft size={17} strokeWidth={1.9} />
              </button>
            ) : (
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-zinc-400 hover:text-white">
                <X size={17} strokeWidth={1.9} />
              </button>
            )}
          </div>

          {/* STAGE: input — instrucción + sugerencias */}
          {(stage === 'input' || stage === 'loading') && (
            <div className="space-y-3 pb-4">
              <p className="text-zinc-400 text-[13px]">
                Describe what you want to add or change — you&apos;ll see it update above.
              </p>
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 focus-within:border-white/30 transition px-4 py-3">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={stage === 'loading'}
                  placeholder="Add a private jet flying in the background…"
                  rows={2}
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
                    className="text-[11.5px] font-medium px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-zinc-300 hover:text-white hover:border-white/30 active:scale-95 transition disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <button
                onClick={generate}
                disabled={prompt.trim().length < 3 || stage === 'loading'}
                className="mt-1 w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition disabled:bg-white/20 disabled:text-white/40"
              >
                {stage === 'loading' ? (
                  <><Loader2 size={17} className="animate-spin" /> Editing your photo…</>
                ) : (
                  <><Wand2 size={17} strokeWidth={2} /> Generate with AI</>
                )}
              </button>
            </div>
          )}

          {/* STAGE: error */}
          {stage === 'error' && (
            <div className="space-y-2.5 pb-4">
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
                className="w-full h-11 rounded-full bg-white/[0.06] border border-white/10 text-white font-semibold text-[14px] hover:bg-white/[0.1] active:scale-[0.99] transition"
              >
                Edit instruction
              </button>
            </div>
          )}

          {/* STAGE: result — la foto editada ya se muestra ARRIBA, en el mismo
              sitio donde estaba la original; aquí solo se confirma o se
              reintenta. */}
          {stage === 'result' && (
            <div className="space-y-2.5 pb-4">
              <div className="flex items-center gap-1.5 text-[12px] text-zinc-400 mb-1">
                <Sparkles size={12} /> AI result — shown above
              </div>
              <button
                onClick={useThisPhoto}
                className="w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition"
              >
                <Check size={17} strokeWidth={2.5} /> Use this photo
              </button>
              <button
                onClick={tryAnotherPrompt}
                className="w-full h-11 rounded-full bg-white/[0.06] border border-white/10 text-white font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-white/[0.1] active:scale-[0.99] transition"
              >
                <RotateCcw size={15} strokeWidth={2} /> Try another instruction
              </button>
              <button
                onClick={onClose}
                className="w-full h-10 rounded-full text-zinc-400 hover:text-white text-[13.5px] font-medium transition"
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
