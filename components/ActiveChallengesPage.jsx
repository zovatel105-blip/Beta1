'use client'

import { Trophy, ChevronLeft } from 'lucide-react'

/**
 * ActiveChallengesPage — Retos activos.
 * Por ahora muestra un estado "Próximamente" (igual que el diseño de referencia,
 * donde el resto de la pantalla está detrás de un early-return).
 * Se abre desde el menú lateral de la página de retos completados.
 */
export default function ActiveChallengesPage({ open, onClose }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[58] bg-zinc-900 overflow-y-auto"
         style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}>
      {/* Botón volver */}
      <button
        onClick={onClose}
        aria-label="Volver"
        className="absolute top-3 left-3 z-10 w-10 h-10 rounded-full bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center text-white active:scale-95 transition"
        style={{ top: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      <div className="min-h-full flex flex-col items-center justify-center px-6 pb-24 text-center">
        <div className="w-20 h-20 mb-5 rounded-full bg-zinc-800 flex items-center justify-center">
          <Trophy className="w-10 h-10 text-zinc-500" strokeWidth={1.5} />
        </div>
        <h2 className="font-bold text-white text-2xl">Próximamente</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-xs">
          La sección de retos activos estará disponible muy pronto.
        </p>
      </div>
    </div>
  )
}
