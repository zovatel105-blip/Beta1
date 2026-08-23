'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Loader2, X, Wand2, RotateCcw, Check, Flame, LayoutGrid, ArrowLeft } from 'lucide-react'
import { AI_STYLE_PRESETS } from '@/lib/aiStylePresets'

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
 * GALERÍA DE ESTILOS (petición del usuario: "en las publicaciones single
 * quiero que añadas una función como larpgpt editar y te muestra varios
 * modelos de edición, tú eliges ese modelo y la ia lo genera" — confirmado:
 * plantillas/estilos visuales con imagen de ejemplo, lista fija con MÁS y
 * MEJORES estilos que larpgpt, un botón junto a la lista de sugerencias).
 * Solo se muestra cuando `showStyleGallery` es true (pasado por
 * UploadDialog.jsx SOLO para `mode === 'solo'`, publicaciones Single/reto
 * abierto — no aparece en versus/duet/challenge). Elegir una tarjeta aplica
 * su instrucción y genera de inmediato, sin pasos extra.
 *
 * Props:
 *  - imageFile: File — la foto original ya seleccionada en ese slot
 *  - onClose: () => void — salir sin aplicar (vuelve al panel normal)
 *  - onApply: (newFile: File) => void — usar la foto editada
 *  - onStatusChange: (status: null|'loading'|'result', url?: string) => void
 *  - showStyleGallery?: boolean — muestra el botón/galería de estilos (solo
 *    publicaciones Single)
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

export default function AIImageEditor({ imageFile, initialPrompt = '', onClose, onApply, onStatusChange, showStyleGallery = false }) {
  const [prompt, setPrompt] = useState('')
  const [stage, setStage] = useState('input') // input | gallery | loading | result | error
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

  const generate = async (explicitPrompt) => {
    const trimmed = (explicitPrompt ?? prompt).trim()
    if (trimmed.length < 3 || !imageFile) return
    setStage('loading')
    setErrorMsg(null)
    setNotice(null)
    onStatusChange?.('loading')

    // Petición del usuario: "Elimina flux y usa el modelo más potente de
    // nano banana y cuando se agoten las ediciones bajar un modelo y
    // cuando se vuelvan a restaurar las ediciones volver al modelo más
    // potente" — FLUX eliminado por completo; toda la cadena de
    // "bajar de nivel" (Nano Banana Pro -> Nano Banana 2 -> Nano Banana 1)
    // vive ahora DENTRO de /api/ai/edit-image (ver handleAiEditImage,
    // route.js) — este componente solo hace UNA llamada al servidor, que
    // ya se encarga de intentar el modelo más potente primero y bajar
    // automáticamente si no está disponible. Como cada edición NUEVA
    // vuelve a intentar el más potente desde cero, "vuelve solo" al
    // restaurarse sin necesitar ningún cambio de código.
    try {
      const fd = new FormData()
      fd.append('image', imageFile)
      fd.append('prompt', trimmed)
      const res = await fetch('/api/ai/edit-image', { method: 'POST', body: fd })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.image) {
        throw new Error(data?.message || data?.error || 'server_ai_failed')
      }
      setResultUrl(data.image)
      setStage('result')
      onStatusChange?.('result', data.image)
    } catch (err) {
      setErrorMsg('The AI could not edit this photo, please try again')
      setStage('error')
      onStatusChange?.(null)
    }
  }

  // GUARD contra selección "fantasma" (bug reportado por el usuario: "a
  // veces cuando hago click en un estilo se selecciona otro"). CAUSA RAÍZ:
  // `generate()` pone `stage='loading'` de forma síncrona, pero React NO
  // pinta ese cambio en el DOM al instante — si el usuario, impaciente
  // porque las miniaturas de la galería tardaban en cargar (ver fix de
  // lib/aiStylePresets.js: ahora piden versiones pequeñas en vez de fotos a
  // resolución completa), tocaba una 2ª tarjeta DISTINTA justo antes de ese
  // repintado, `pickStyle` se ejecutaba una 2ª vez con OTRO preset mientras
  // la 1ª llamada a generate() seguía en curso — dos ediciones en paralelo
  // compitiendo por pisar `resultUrl`, y la que terminara más tarde
  // "ganaba" aunque no fuera la tarjeta que el usuario creía haber
  // elegido. `pickedRef` (un ref, no un estado — se lee/escribe al
  // instante, sin esperar ningún repintado) se pone a `true` en el PRIMER
  // toque válido y bloquea cualquier toque posterior hasta que se vuelve a
  // abrir la galería desde cero.
  const pickedRef = useRef(false)
  const openStyleGallery = () => {
    pickedRef.current = false
    setStage('gallery')
  }

  // Elegir una tarjeta de la galería de estilos: aplica su instrucción y
  // genera de inmediato (petición del usuario: "tú eliges ese modelo y la
  // ia lo genera" — un solo clic, sin pasos extra).
  const pickStyle = (preset) => {
    if (pickedRef.current) return
    pickedRef.current = true
    setPrompt(preset.promptHint)
    generate(preset.promptHint)
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
            {/* Botón de la galería de estilos (petición del usuario: "un
                botón junto a la lista de sugerencia") — SOLO en
                publicaciones Single, ver showStyleGallery. */}
            {showStyleGallery && (
              <button
                type="button"
                disabled={stage === 'loading'}
                onClick={openStyleGallery}
                className="shrink-0 flex items-center gap-1 whitespace-nowrap text-[11.5px] font-bold px-3 py-1.5 rounded-full active:scale-95 transition disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.16), rgba(245,158,11,0.16))', border: '1px solid rgba(252,211,77,0.35)', color: '#FCD34D' }}
              >
                <LayoutGrid size={12} strokeWidth={2.4} /> Styles
              </button>
            )}
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
            onClick={() => generate()}
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

      {/* STAGE: gallery — galería visual de estilos (petición del usuario,
          ver comentario superior). Solo cuando showStyleGallery=true
          (publicaciones Single). Elegir una tarjeta aplica y genera de
          inmediato. */}
      {stage === 'gallery' && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStage('input')}
              aria-label="Back"
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition text-zinc-300 hover:text-white shrink-0"
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </button>
            <p className="text-white text-[13px] font-semibold">Choose a style</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 max-h-[52vh] overflow-y-auto pb-1">
            {AI_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => pickStyle(preset)}
                className="group relative aspect-square rounded-2xl overflow-hidden border border-white/10 active:scale-95 transition"
              >
                <img src={preset.thumb} alt={preset.label} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <span className="absolute bottom-1.5 left-1.5 right-1.5 text-white text-[11px] font-bold leading-tight text-left drop-shadow">
                  {preset.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* STAGE: error */}
      {stage === 'error' && (
        <>
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 px-4 py-3">
            <p className="text-rose-300 text-[13px]">{errorMsg}</p>
          </div>
          <button
            onClick={() => generate()}
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
