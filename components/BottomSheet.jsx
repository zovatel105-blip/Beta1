'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * BottomSheet — Hoja inferior estilo Instagram.
 * - Fondo blanco, se desliza desde abajo.
 * - Backdrop oscuro semitransparente; se cierra al tocar fuera.
 * - Asa de arrastre oscura arriba.
 * - Se renderiza mediante PORTAL a document.body para aparecer SIEMPRE por
 *   encima de todo (incluida la barra de navegación), escapando de cualquier
 *   contexto de apilamiento (contain:strict, z-index de slides, etc.).
 */
export default function BottomSheet({ open, onClose, children, maxWidth = 'max-w-[480px]', className = '', hideHandle = false }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!open || !mounted || typeof document === 'undefined') return null

  const node = (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 2147483000 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 animate-sheet-fade" />

      {/* Hoja */}
      <div
        className={`relative w-full ${maxWidth} bg-white rounded-t-3xl shadow-2xl animate-sheet-up overflow-hidden flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Asa de arrastre (oscura) */}
        {!hideHandle && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1.5 w-10 rounded-full bg-zinc-400" />
          </div>
        )}
        {children}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
