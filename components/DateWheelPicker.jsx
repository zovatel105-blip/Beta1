'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

// Altura de cada fila de la rueda (px). 5 filas visibles -> alto total 200px.
const ITEM_H = 40
const VISIBLE = 5
const PAD = ITEM_H * Math.floor(VISIBLE / 2) // relleno arriba/abajo para centrar

const MONTHS_ES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate()
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * Una columna de la rueda. Desplazamiento vertical con "snap" al centro.
 * El elemento centrado (resaltado) es el seleccionado.
 */
function WheelColumn({ items, selectedIndex, onChange, width }) {
  const ref = useRef(null)
  const timer = useRef(null)
  const programmatic = useRef(false)

  // Sincroniza la posición de scroll cuando cambia el índice desde fuera.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = selectedIndex * ITEM_H
    if (Math.abs(el.scrollTop - target) > 1) {
      programmatic.current = true
      el.scrollTop = target
      // libera el flag tras el frame de scroll
      window.setTimeout(() => { programmatic.current = false }, 60)
    }
  }, [selectedIndex, items.length])

  const handleScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (programmatic.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const raw = Math.round(el.scrollTop / ITEM_H)
      const idx = Math.max(0, Math.min(items.length - 1, raw))
      const target = idx * ITEM_H
      if (Math.abs(el.scrollTop - target) > 1) {
        el.scrollTo({ top: target, behavior: 'smooth' })
      }
      if (idx !== selectedIndex) onChange(idx)
    }, 110)
  }, [items.length, selectedIndex, onChange])

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="no-scrollbar overflow-y-scroll snap-y snap-mandatory"
      style={{ height: ITEM_H * VISIBLE, width, WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ height: PAD }} />
      {items.map((item, i) => {
        const dist = Math.abs(i - selectedIndex)
        const isSel = i === selectedIndex
        return (
          <div
            key={i}
            className="snap-center flex items-center justify-center select-none"
            style={{ height: ITEM_H }}
            onClick={() => onChange(i)}
          >
            <span
              className="transition-all duration-200"
              style={{
                fontSize: isSel ? 20 : 17,
                fontWeight: isSel ? 800 : 500,
                color: isSel ? '#000000' : `rgba(24,24,27,${Math.max(0.22, 0.55 - dist * 0.15)})`,
                transform: isSel ? 'scale(1.04)' : 'scale(1)',
              }}
            >
              {item}
            </span>
          </div>
        )
      })}
      <div style={{ height: PAD }} />
    </div>
  )
}

/**
 * DateWheelPicker — selector de fecha tipo TikTok con 3 columnas (Día / Mes / Año).
 * value: 'YYYY-MM-DD' | ''   onChange: (str 'YYYY-MM-DD') => void
 */
export default function DateWheelPicker({ value, onChange }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const minYear = currentYear - 100
  // años en orden descendente (el más reciente arriba, estilo común)
  const years = Array.from({ length: currentYear - minYear + 1 }, (_, i) => currentYear - i)

  // Estado interno desglosado.
  const parse = (v) => {
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-').map(Number)
      return { y, m, d }
    }
    return { y: currentYear - 18, m: 1, d: 1 } // valor por defecto razonable
  }

  const init = parse(value)
  const [year, setYear] = useState(init.y)
  const [month, setMonth] = useState(init.m) // 1-12
  const [day, setDay] = useState(init.d)

  const dim = daysInMonth(year, month)
  const days = Array.from({ length: dim }, (_, i) => i + 1)

  // Si el día queda fuera de rango al cambiar mes/año, lo ajustamos.
  useEffect(() => {
    if (day > dim) setDay(dim)
  }, [dim, day])

  // Emite el valor combinado hacia el formulario.
  useEffect(() => {
    const d = Math.min(day, dim)
    onChange(`${year}-${pad2(month)}-${pad2(d)}`)
  }, [year, month, day, dim, onChange])

  const dayItems = days.map((d) => pad2(d))
  const monthItems = MONTHS_ES
  const yearItems = years.map((y) => String(y))

  return (
    <div className="relative w-full rounded-2xl bg-white px-2 py-1 overflow-hidden">
      {/* Banda de selección central: minimalista, solo una línea superior e
          inferior sutil en gris/negro (sin morado/azul), sin relleno ni sombra. */}
      <div
        className="pointer-events-none absolute left-2 right-2"
        style={{
          top: PAD,
          height: ITEM_H,
          borderTop: '1px solid rgba(24,24,27,0.35)',
          borderBottom: '1px solid rgba(24,24,27,0.35)',
        }}
      />
      {/* Degradados superior/inferior para el efecto "rueda" */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[60px] z-10"
           style={{ background: 'linear-gradient(to bottom, #ffffff 0%, rgba(255,255,255,0) 100%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60px] z-10"
           style={{ background: 'linear-gradient(to top, #ffffff 0%, rgba(255,255,255,0) 100%)' }} />

      <div className="relative flex items-stretch justify-center gap-1">
        <WheelColumn
          items={dayItems}
          selectedIndex={Math.min(day, dim) - 1}
          onChange={(i) => setDay(i + 1)}
          width={64}
        />
        <WheelColumn
          items={monthItems}
          selectedIndex={month - 1}
          onChange={(i) => setMonth(i + 1)}
          width={140}
        />
        <WheelColumn
          items={yearItems}
          selectedIndex={years.indexOf(year) === -1 ? 0 : years.indexOf(year)}
          onChange={(i) => setYear(years[i])}
          width={80}
        />
      </div>
    </div>
  )
}
