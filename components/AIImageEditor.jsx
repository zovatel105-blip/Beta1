'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, X, Wand2, RotateCcw, Check, Flame } from 'lucide-react'

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

// Space público de FLUX.1 Kontext [dev] (modelo abierto de Black Forest
// Labs) corriendo en GPU GRATUITA (ZeroGPU) — misma estrategia que
// AIVideoEditor.jsx (LUCY_SPACE): se llama DESDE EL NAVEGADOR a propósito,
// así la cuota gratis es por IP del llamante, sin cuentas ni tokens. Probado
// en vivo (script Node real, sin agente de testing): edición precisa
// (ej. "añade gafas de sol") y transformaciones de escena completas (ej.
// "ponme en un yate de lujo al atardecer") preservando la identidad de la
// persona, en ~25-35s. `Qwen/Qwen-Image-Edit` (alternativa evaluada) FALLA
// de inmediato para llamadas anónimas: "The requested GPU duration (240s) is
// larger than the maximum allowed" — no es una opción viable ahora mismo.
// Si el Space gratuito está ocupado/sin cuota, se cae automáticamente al
// editor del servidor (Nano Banana vía Emergent, con presupuesto limitado):
// el usuario SIEMPRE puede seguir editando, nunca se queda sin alternativa.
const FLUX_KONTEXT_SPACE = 'black-forest-labs/FLUX.1-Kontext-Dev'

async function dataUrlToFile(dataUrl, filename) {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function AIImageEditor({ imageFile, initialPrompt = '', onClose, onApply, onStatusChange }) {
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
  // "Modas"/tendencias virales de edición con IA (petición del usuario: "en
  // Gemini se hizo muy de moda subir la foto de tu rostro y crear imágenes
  // de lujo -yate, coche de lujo, mansión- quiero que todas las modas que
  // aparezcan sean recomendadas") — SOLO cuando la foto tiene una
  // cara/persona visible (la propia IA lo decide, ver hasPerson en la
  // respuesta de /api/ai/suggest-edits); generadas por la IA en cada carga
  // (no una lista fija que yo mantenga a mano), así se actualizan solas con
  // el tiempo. Sin respaldo genérico si falla (a diferencia de
  // `suggestions`): si la IA no confirma que hay una persona, mejor no
  // mostrar nada de "moda" que inventar una lista no verificada para esta
  // foto en concreto.
  const [trending, setTrending] = useState([])
  // Aviso no bloqueante cuando la GPU gratuita no está disponible y se cae
  // al editor del servidor (mismo patrón que AIVideoEditor.jsx).
  const [notice, setNotice] = useState(null)

  // Reinicia el formulario y pide sugerencias nuevas cada vez que se entra a
  // editar un archivo distinto. `initialPrompt` (petición del usuario, ver
  // LuxuryBattleSheet.jsx/UploadDialog.jsx): si se entró a esta foto desde
  // un tema de "Luxury Battle", la instrucción arranca YA rellena con la
  // sugerencia del tema (ej. "Put me relaxing on a luxury yacht deck..."),
  // en vez de vacía — el usuario puede editarla libremente antes de generar.
  useEffect(() => {
    setStage('input')
    setResultUrl(null)
    setErrorMsg(null)
    setNotice(null)
    setPrompt(initialPrompt || '')
    setSuggestions([])
    setTrending([])
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
        if (res.ok && data?.hasPerson && Array.isArray(data?.trending) && data.trending.length > 0) {
          setTrending(data.trending)
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
    setNotice(null)
    onStatusChange?.('loading')

    // 1) Intentar primero la GPU GRATUITA (FLUX.1 Kontext, ilimitada, sin
    //    coste, llamada desde este navegador). Si falla por cualquier
    //    motivo (sin cuota, Space ocupado, timeout), se cae al editor del
    //    servidor de inmediato — el usuario nunca ve un fallo, solo puede
    //    tardar un poco más de decidir la ruta.
    try {
      const dataUrl = await editOnFreeGpu(trimmed)
      setResultUrl(dataUrl)
      setStage('result')
      onStatusChange?.('result', dataUrl)
      return
    } catch (e) {
      console.warn('free GPU image editor unavailable, using server AI:', e?.message)
      setNotice('Free GPU is busy right now — using the built-in AI editor instead.')
    }

    // 2) Editor del servidor (Nano Banana vía Emergent LLM Key, presupuesto
    //    limitado) — respaldo automático, mismo endpoint de siempre.
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

  // Edición en la GPU gratuita (Space público de FLUX.1 Kontext) desde el
  // NAVEGADOR. Lanza excepción si no se puede (el llamador hace fallback).
  // Devuelve un data URL (base64), igual que ya devuelve /api/ai/edit-image.
  const editOnFreeGpu = async (trimmed) => {
    const { Client, handle_file } = await import('@gradio/client')
    const client = await Promise.race([
      Client.connect(FLUX_KONTEXT_SPACE),
      new Promise((_, rej) => setTimeout(() => rej(new Error('gpu_connect_timeout')), 25000)),
    ])
    const result = await Promise.race([
      client.predict('/infer', {
        input_image: handle_file(imageFile),
        prompt: trimmed,
        seed: 0,
        randomize_seed: true,
        guidance_scale: 2.5,
        steps: 28,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('gpu_timeout')), 90000)),
    ])
    const out = result?.data?.[0]
    const url = out?.url
    if (!url) throw new Error('gpu_no_result')
    const blob = await (await fetch(url)).blob()
    if (!blob || blob.size < 500) throw new Error('gpu_empty_result')
    return blobToDataUrl(blob)
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
    setNotice(null)
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

          {/* "Trending" — modas virales de edición con IA (petición del
              usuario), SOLO cuando la foto tiene una persona y la IA
              devolvió alguna, ANTES de las sugerencias normales de la foto.
              Estilo distinto (acento ámbar/dorado + icono de fuego) para que
              se note que es una sección aparte, no más sugerencias iguales. */}
          {trending.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 px-1 text-amber-300 text-[11.5px] font-bold uppercase tracking-wide">
                <Flame size={12} className="fill-amber-300" />
                Trending
              </div>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
                {trending.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={stage === 'loading'}
                    onClick={() => setPrompt(s)}
                    className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold px-3 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-200 hover:text-amber-50 hover:border-amber-400/60 active:scale-95 transition disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          {notice && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 text-[12.5px] text-amber-200">
              {notice}
            </div>
          )}
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
