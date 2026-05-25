'use client'

import { Home, Compass, MessageCircle, User } from 'lucide-react'
import UploadButton from './UploadButton'

export default function BottomNav({ onUploaded }) {
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
      <UploadButton onUploaded={onUploaded} />
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
