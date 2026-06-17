'use client'

/**
 * BottomSheet — Hoja inferior estilo Instagram.
 * - Fondo blanco, se desliza desde abajo.
 * - Backdrop oscuro semitransparente; se cierra al tocar fuera.
 * - Asa de arrastre oscura arriba.
 */
export default function BottomSheet({ open, onClose, children, maxWidth = 'max-w-[480px]', className = '', hideHandle = false }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 9999 }}
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
}
