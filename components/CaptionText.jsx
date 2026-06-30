'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * CaptionText — caption del feed estilo Instagram Reels.
 *   - Colapsado: máximo 2 líneas. Si el texto desborda, aparece "…más" al final
 *     de la 2ª línea (sobre un degradado para que se lea bien sobre el vídeo).
 *   - Al tocar "…más" se expande el texto completo y se muestra "menos".
 *   - Detecta el desbordamiento midiendo scrollHeight vs clientHeight.
 */
export default function CaptionText({ text, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const ref = useRef(null)

  // Si cambia el texto (otra tarjeta reciclada), volvemos a colapsar.
  useEffect(() => { setExpanded(false) }, [text])

  // Medimos si el texto desborda las 2 líneas (solo en estado colapsado).
  useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    setTruncated(el.scrollHeight > el.clientHeight + 1)
  }, [text, expanded])

  const expand = useCallback((e) => { e.stopPropagation(); setExpanded(true) }, [])
  const collapse = useCallback((e) => { e.stopPropagation(); setExpanded(false) }, [])

  if (!text) return null

  return (
    <div className={className}>
      <div className="relative">
        <p ref={ref} className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
          {text}
          {expanded && (
            <button
              type="button"
              onClick={collapse}
              className="ml-1 font-semibold text-white/60 align-baseline"
            >
              menos
            </button>
          )}
        </p>
        {!expanded && truncated && (
          <button
            type="button"
            onClick={expand}
            className="absolute bottom-0 right-0 pl-6 font-semibold text-white/80 bg-gradient-to-l from-black/70 via-black/60 to-transparent"
          >
            …más
          </button>
        )}
      </div>
    </div>
  )
}
