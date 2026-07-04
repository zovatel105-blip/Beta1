'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * CaptionText — caption del feed estilo Instagram Reels.
 *   - Colapsado: 1 sola línea. Si el texto desborda, se recorta SIEMPRE por
 *     PALABRAS COMPLETAS (nunca a mitad de una palabra) y "…" aparece
 *     inmediatamente DESPUÉS de la última palabra completa que cupo, nunca
 *     antes ni separado. Se calcula con un <span> medidor invisible (misma
 *     fuente) que prueba palabra a palabra hasta que deja de caber.
 *   - Al tocar el texto truncado (o el "…") se expande el texto completo y
 *     se muestra "less" para volver a colapsar.
 */
export default function CaptionText({ text, className = '' }) {
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [displayText, setDisplayText] = useState(text || '')
  const pRef = useRef(null)
  const measureRef = useRef(null)

  // Si cambia el texto (otra tarjeta reciclada), volvemos a colapsar.
  useEffect(() => { setExpanded(false) }, [text])

  // Calculamos el recorte por palabras completas (solo en estado colapsado).
  useEffect(() => {
    if (expanded || !text) return
    const p = pRef.current
    const m = measureRef.current
    if (!p || !m) return

    const containerWidth = p.clientWidth
    m.textContent = text
    const fullWidth = m.scrollWidth

    // Cabe entero en la línea: sin recorte.
    if (fullWidth <= containerWidth + 1) {
      setTruncated(false)
      setDisplayText(text)
      return
    }

    // No cabe entero: probamos palabra a palabra (con "…" ya incluido en la
    // prueba) y nos quedamos con el último conjunto de palabras COMPLETAS
    // que sí cupo, antes de que la siguiente palabra desborde la línea.
    const words = text.split(/\s+/).filter(Boolean)
    let result = ''
    for (let i = 0; i < words.length; i++) {
      const candidate = result ? `${result} ${words[i]}` : words[i]
      m.textContent = `${candidate}…`
      if (m.scrollWidth > containerWidth) {
        if (!result) result = candidate // ni la 1ª palabra entra entera; la mostramos igual completa
        break
      }
      result = candidate
    }
    setDisplayText(`${result}…`)
    setTruncated(true)
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
      <p
        ref={pRef}
        onClick={truncated ? expand : undefined}
        className={`overflow-hidden whitespace-nowrap ${truncated ? 'cursor-pointer' : ''}`}
      >
        {displayText}
      </p>
      {/* Medidor invisible (misma fuente heredada) para calcular el recorte por palabras. */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="whitespace-nowrap invisible pointer-events-none"
        style={{ position: 'absolute', top: 0, left: 0, zIndex: -1 }}
      />
    </div>
  )
}
