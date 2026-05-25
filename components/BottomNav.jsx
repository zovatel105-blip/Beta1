'use client'

import { Home, Compass, PlusSquare, MessageCircle, User } from 'lucide-react'

export default function BottomNav() {
  const items = [
    { icon: Home, label: 'Inicio', active: true },
    { icon: Compass, label: 'Descubrir' },
    { icon: PlusSquare, label: 'Crear', big: true },
    { icon: MessageCircle, label: 'Bandeja' },
    { icon: User, label: 'Perfil' },
  ]
  return (
    <div className="absolute bottom-0 inset-x-0 z-30 pb-[max(env(safe-area-inset-bottom),6px)] pt-2 px-2 bg-gradient-to-t from-black to-black/0 flex justify-around items-end">
      {items.map((it, i) => {
        const Icon = it.icon
        return (
          <button
            key={i}
            aria-label={it.label}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 ${it.active ? 'text-white' : 'text-white/70'}`}
          >
            {it.big ? (
              <div className="relative">
                <div className="absolute inset-y-0 -left-1 w-3 bg-cyan-400 rounded-l-md" />
                <div className="absolute inset-y-0 -right-1 w-3 bg-rose-500 rounded-r-md" />
                <div className="relative bg-white text-black rounded-md px-3 py-1">
                  <Icon size={20} strokeWidth={2.5} />
                </div>
              </div>
            ) : (
              <Icon size={26} />
            )}
            <span className="text-[10px] mt-0.5">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
