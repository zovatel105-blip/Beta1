'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * CaptionText — caption del feed estilo Instagram Reels.
 *   - Colapsado: 1 sola línea. Si el texto desborda, la línea se recorta con
 *     el "…" nativo del navegador (text-ellipsis) y justo después, en la
 *     MISMA línea (sin superposición ni fondo oscuro), aparece "…more".
 *   - Al tocar "…more" se expande el texto completo y se muestra "less".
 *   - Detecta el desbordamiento midiendo scrollWidth vs clientWidth (1 línea).
 */
export default function CaptionText({ text, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const ref = useRef(null)

  // Si cambia el texto (otra tarjeta reciclada), volvemos a colapsar.
  useEffect(() => { setExpanded(false) }, [text])

  // Medimos si el texto desborda la línea (solo en estado colapsado).
  useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    setTruncated(el.scrollWidth > el.clientWidth + 1)
  }, [text, expanded])

  const expand = useCallback((e) => { e.stopPropagation(); setExpanded(true) }, [])
  const collapse = useCallback((e) => { e.stopPropagation(); setExpanded(false) }, [])

  if (!text) return null

  if (expanded) {
    return (
      <div className={className}>
        <p className="whitespace-pre-wrap">
          {text}
          <button
            type="button"
            onClick={collapse}
            className="ml-1 font-semibold text-white/60 align-baseline"
          >
            less
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex items-baseline gap-1">
        <p ref={ref} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
          {text}
        </p>
        {truncated && (
          <button
            type="button"
            onClick={expand}
            className="shrink-0 font-semibold text-white/80"
          >
            …more
          </button>
        )}
      </div>
    </div>
  )
}
