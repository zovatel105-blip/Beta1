'use client'

import { Home, Compass, MessageCircle, User, Plus } from 'lucide-react'

export default function BottomNav({ onOpenUpload }) {
  return (
    <div className="absolute bottom-0 inset-x-0 z-30 pb-[max(env(safe-area-inset-bottom),6px)] pt-2 px-2 bg-gradient-to-t from-black to-black/0 flex justify-around items-end">
      <button aria-label="Inicio" className="flex flex-col items-center gap-0.5 px-2 py-1 text-white">
        <Home size={26} />
        <span className="text-[10px] mt-0.5">Inicio</span>
      </button>
      <button aria-label="Descubrir" className="flex flex-col items-center gap-0.5 px-2 py-1 text-white/70">
        <Compass size={26} />
        <span className="text-[10px] mt-0.5">Descubrir</span>
      </button>
      <button
        onClick={onOpenUpload}
        aria-label="Crear"
        className="flex flex-col items-center gap-0.5 px-2 py-1 text-white relative"
      >
        <div className="relative">
          <div className="absolute inset-y-0 -left-1 w-3 bg-cyan-400 rounded-l-md" />
          <div className="absolute inset-y-0 -right-1 w-3 bg-rose-500 rounded-r-md" />
          <div className="relative bg-white text-black rounded-md px-3 py-1">
            <Plus size={20} strokeWidth={2.5} />
          </div>
        </div>
        <span className="text-[10px] mt-0.5">Crear</span>
      </button>
      <button aria-label="Bandeja" className="flex flex-col items-center gap-0.5 px-2 py-1 text-white/70">
        <MessageCircle size={26} />
        <span className="text-[10px] mt-0.5">Bandeja</span>
      </button>
      <button aria-label="Perfil" className="flex flex-col items-center gap-0.5 px-2 py-1 text-white/70">
        <User size={26} />
        <span className="text-[10px] mt-0.5">Perfil</span>
      </button>
    </div>
  )
}
