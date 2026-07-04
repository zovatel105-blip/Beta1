'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * OptionMedia — muestra el contenido (vídeo/imagen) de una opción del duelo.
 * Solo el contenido puro: sin nombre de usuario ni título/descripción superpuestos.
 */
function OptionMedia({ option, active }) {
  const ref = useRef(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (active) {
      v.play().catch(() => {})
    } else {
      try { v.pause() } catch { /* noop */ }
    }
  }, [active])

  if (!option) return <div className="min-w-full h-full bg-black" />

  return (
    <div className="min-w-full h-full snap-center relative bg-black flex items-center justify-center">
      {option.videoUrl ? (
        <video
          ref={ref}
          src={option.videoUrl}
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
        />
      ) : option.imageUrl ? (
        <img src={option.imageUrl} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black" />
      )}
    </div>
  )
}

/**
 * VSContentCard — tarjeta central que muestra "solo el contenido" de las opciones
 * de un duelo 1vs1. Marco blanco sutil con resplandor (mismo estilo que el círculo
 * de la campana en notificaciones), carrusel deslizable horizontalmente entre A y B
 * e indicadores neutros (sin color). Soporta el botón "atrás" del navegador.
 */
export default function VSContentCard({
  visible = false,
  optionA = null,
  optionB = null,
  initialIndex = 0,
  onClose,
}) {
  const scrollerRef = useRef(null)
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const [activeIdx, setActiveIdx] = useState(initialIndex)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Integración con el historial: el botón "atrás" cierra la card.
  useEffect(() => {
    if (!visible) return undefined
    try {
      window.history.pushState({ vsContentCard: true }, '')
      pushedRef.current = true
    } catch { /* noop */ }
    const onPop = () => { pushedRef.current = false; onCloseRef.current?.() }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (pushedRef.current) {
        try { window.history.back() } catch { /* noop */ }
        pushedRef.current = false
      }
    }
  }, [visible])

  // Posicionar el carrusel en la opción inicial al abrir.
  useEffect(() => {
    if (!visible) return
    setActiveIdx(initialIndex)
    requestAnimationFrame(() => {
      const el = scrollerRef.current
      if (!el) return
      el.scrollTo({ left: initialIndex * el.clientWidth, behavior: 'auto' })
    })
  }, [visible, initialIndex])

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    if (idx !== activeIdx) setActiveIdx(idx)
  }

  if (typeof document === 'undefined' || !visible) return null

  const slides = [optionA, optionB]

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center select-none animate-[fadeIn_180ms_ease-out]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      {/* Card con marco blanco sutil + resplandor tenue (mismo estilo que el círculo
          de la campana en el estado vacío de notificaciones) */}
      <div
        className="vs-content-card-glow relative w-[88vw] max-w-[420px] aspect-[9/16] rounded-3xl overflow-hidden border border-white/10 transition-shadow duration-300"
        style={{
          boxShadow: '0 0 60px 8px rgba(255,255,255,0.35), 0 0 120px 24px rgba(255,255,255,0.15)',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))',
        }}
      >
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex w-full h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {slides.map((opt, i) => (
            <OptionMedia key={i} option={opt} active={i === activeIdx} />
          ))}
        </div>

        {/* Indicadores neutros, sin color (no dependen de la opción activa) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-200"
              style={
                activeIdx === i
                  ? { width: 16, height: 6, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 8px rgba(255,255,255,0.5)' }
                  : { width: 6, height: 6, background: 'rgba(255,255,255,0.35)' }
              }
            />
          ))}
        </div>

        {/* Botón atrás — sin fondo, solo el icono */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose?.() }}
          className="absolute top-3 left-3 z-20 w-9 h-9 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Back"
        >
          <ArrowLeft className="text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]" size={22} />
        </button>
      </div>
    </div>,
    document.body
  )
}
