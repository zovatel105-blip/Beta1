'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, X, Wand2, RotateCcw, Check } from 'lucide-react'

/**
 * AIImageEditor — controles de edición con IA, 100% EN LÍNEA (sin modal, sin
 * hoja inferior, sin overlay de ningún tipo).
 *
 * HISTORIAL UX (usuario): 1) 'el boton no funciona' -> era un solape de
 * z-index, arreglado. 2) 'no debe abrir otra pagina, debe editarse desde el
 * mismo sitio' -> se cambió de pantalla completa a hoja inferior (bottom
 * sheet) que sustituía la foto por un overlay. 3) 'tampoco debe ser desde UN
 * modal' -> AHORA: este componente ya NO es un overlay de ningún tipo (nada
 * de `fixed`/`z-index`/fondo oscuro propio) — es simplemente el CONTENIDO
 * que UploadDialog.jsx inserta, EN EL MISMO panel inferior donde normalmente
 * están la descripción/música/publicar (mismo sitio exacto, mismo flujo
 * normal del documento), sustituyéndolo temporalmente mientras se edita. La
 * FOTO en sí sigue estando arriba, sin moverse, y el spinner/resultado se
 * pintan directamente sobre ella (lo gestiona UploadDialog vía
 * `onStatusChange`, ver ese archivo) — aquí solo viven los controles.
 *
 * Props:
 *  - imageFile: File — la foto original ya seleccionada en ese slot
 *  - onClose: () => void — salir sin aplicar (vuelve al panel normal)
 *  - onApply: (newFile: File) => void — usar la foto editada
 *  - onStatusChange: (status: null|'loading'|'result', url?: string) => void
 */

const FALLBACK_SUGGESTIONS = [
  'Add a private jet flying in the background',
  'Change the background to a sunset beach',
  'Add fireworks in the sky',
  'Make it look cinematic and dramatic',
]

async function dataUrlToFile(dataUrl, filename) {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

export default function AIImageEditor({ imageFile, onClose, onApply, onStatusChange }) {
  const [prompt, setPrompt] = useState('')
  const [stage, setStage] = useState('input') // input | loading | result | error
  const [resultUrl, setResultUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  // Sugerencias RELEVANTES a la foto (usuario: 'las sugerencias deben ser de
  // algo que tenga que ver con la imagen') — se piden a la IA (visión) en
  // cuanto se entra a editar esta foto; mientras llegan se muestra un
  // esqueleto, y si fallan se usa una lista genérica de respaldo (nunca
  // bloquea poder escribir una instrucción manual).
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Reinicia el formulario y pide sugerencias nuevas cada vez que se entra a
  // editar un archivo distinto.
  useEffect(() => {
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
    setPrompt('')
    setSuggestions([])
    if (!imageFile) return
    let cancelled = false
    setSuggestionsLoading(true)
    ;(async () => {
      try {
        const fd = new FormData()
        fd.append('image', imageFile)
        const res = await fetch('/api/ai/suggest-edits', { method: 'POST', body: fd })
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions)
        } else {
          setSuggestions(FALLBACK_SUGGESTIONS)
        }
      } catch {
        if (!cancelled) setSuggestions(FALLBACK_SUGGESTIONS)
      } finally {
        if (!cancelled) setSuggestionsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [imageFile])

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
    onStatusChange?.(null) // vuelve a mostrar la foto original, arriba, en el mismo sitio
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-[14px] font-bold tracking-tight flex items-center gap-1.5">
          <Sparkles size={14} className="text-white/80" />
          Edit with AI
        </h2>
        <button onClick={onClose} aria-label="Close AI editor" className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition text-zinc-400 hover:text-white">
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>

      {/* STAGE: input / loading — instrucción + sugerencias (mismo estilo que
          la caja de descripción del panel normal, para que se sienta parte
          del mismo sitio). */}
      {(stage === 'input' || stage === 'loading') && (
        <>
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
          <button
            onClick={generate}
            disabled={prompt.trim().length < 3 || stage === 'loading'}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] disabled:bg-white/20 disabled:text-white/40 active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            {stage === 'loading' ? (
              <><Loader2 size={17} className="animate-spin" /> Editing your photo…</>
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

      {/* STAGE: result — la foto editada ya se ve ARRIBA, en el mismo sitio;
          aquí solo se confirma o se reintenta. */}
      {stage === 'result' && (
        <>
          <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3 flex items-center gap-2 text-[13px] text-zinc-300">
            <Sparkles size={14} className="text-white/80 shrink-0" /> AI result shown above — keep it?
          </div>
          <button
            onClick={useThisPhoto}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            <Check size={18} strokeWidth={2.5} /> Use this photo
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
