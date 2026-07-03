'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * CaptionText — caption del feed estilo Instagram Reels.
 *   - Colapsado: máximo 1 línea. Si el texto desborda, aparece "…more" al final
 *     de la línea (sobre un degradado para que se lea bien sobre el vídeo).
 *   - Al tocar "…more" se expande el texto completo y se muestra "less".
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
        <p ref={ref} className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}>
          {text}
          {expanded && (
            <button
              type="button"
              onClick={collapse}
              className="ml-1 font-semibold text-white/60 align-baseline"
            >
              less
            </button>
          )}
        </p>
        {!expanded && truncated && (
          <button
            type="button"
            onClick={expand}
            className="absolute bottom-0 right-0 pl-6 font-semibold text-white/80 bg-gradient-to-l from-black/70 via-black/60 to-transparent"
          >
            …more
          </button>
        )}
      </div>
    </div>
  )
}
