'use client'

import { Volume2, VolumeX, Search } from 'lucide-react'

export default function TopBar({ muted, onToggleMute }) {
  return (
    <div className="absolute top-0 inset-x-0 z-30 pt-[max(env(safe-area-inset-top),12px)] pb-2 px-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
      <button
        aria-label="toggle mute"
        onClick={onToggleMute}
        className="pointer-events-auto w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <div className="flex gap-6 text-[15px] font-semibold pointer-events-auto">
        <span className="text-white/60">Siguiendo</span>
        <span className="relative">
          Para ti
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-[2px] bg-white rounded-full" />
        </span>
      </div>
      <button aria-label="search" className="pointer-events-auto w-9 h-9 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
        <Search size={18} />
      </button>
    </div>
  )
}
