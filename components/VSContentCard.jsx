'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * OptionMedia — muestra el contenido (vídeo/imagen) de una opción del duelo.
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
          className="w-full h-full object-contain"
        />
      ) : option.imageUrl ? (
        <img src={option.imageUrl} alt="" className="w-full h-full object-contain" draggable={false} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-black" />
      )}

      {(option.author?.username || option.description) && (
        <div className="absolute bottom-12 left-0 right-0 px-6 text-center pointer-events-none">
          {option.author?.username && (
            <p className="text-white font-bold drop-shadow-lg">@{option.author.username}</p>
          )}
          {option.description && (
            <p className="text-white/75 text-sm mt-1 line-clamp-2 drop-shadow-md">{option.description}</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * VSContentCard — tarjeta que muestra "solo el contenido" de las opciones de un
 * duelo 1vs1. Se abre manteniendo pulsada una opción. Carrusel deslizable
 * horizontalmente entre A y B. Soporta el botón "atrás" del navegador.
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
    <div className="fixed inset-0 z-[60] bg-black select-none animate-[fadeIn_180ms_ease-out]">
      <div className="absolute inset-0 overflow-hidden">
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
      </div>

      {/* Indicadores */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
        {slides.map((_, i) => (
          <span
            key={i}
            className={`rounded-full transition-all duration-200 ${activeIdx === i ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
          />
        ))}
      </div>

      {/* Botón atrás */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose?.() }}
        className="absolute left-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur flex items-center justify-center active:scale-95 transition-transform"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        aria-label="Atrás"
      >
        <ArrowLeft className="text-white" size={22} />
      </button>
    </div>,
    document.body
  )
}
