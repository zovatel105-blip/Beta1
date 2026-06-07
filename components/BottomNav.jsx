'use client'

import { useState } from 'react'
import { Home, Swords, Plus, Inbox, User } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * BottomNav — rediseño basado en el BottomNavigation.jsx de Twyk.
 * Barra negra con esquinas superiores redondeadas (rounded-t-3xl), 5 iconos:
 * Home · Swords (Battle) · Plus (borde degradado lila→azul) · Inbox · Perfil.
 * El botón + abre el diálogo de subida (onOpenUpload). El resto sólo
 * gestiona el estado visual "activo" (la app es de una sola página).
 */
export default function BottomNav({ onOpenUpload, onOpenInbox, onOpenProfile, onGoHome, unreadCount = 0 }) {
  const [active, setActive] = useState('home')

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black rounded-t-3xl"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
    >
      <div className="flex items-center justify-around px-4 py-2.5">
        {/* Home */}
        <button
          aria-label="Inicio"
          onClick={() => { setActive('home'); onGoHome?.() }}
          className="flex items-center justify-center w-9 h-9 transition-all duration-200 active:scale-90"
        >
          <Home
            className={cn(
              'w-5 h-5 transition-all duration-200',
              active === 'home' ? 'text-white' : 'text-white/50'
            )}
            strokeWidth={active === 'home' ? 2.5 : 1.5}
            fill={active === 'home' ? 'white' : 'none'}
          />
        </button>

        {/* Explorar / Battle */}
        <button
          aria-label="Battle"
          onClick={() => setActive('explore')}
          className="flex items-center justify-center w-9 h-9 transition-all duration-200 active:scale-90"
        >
          <Swords
            className={cn(
              'w-5 h-5 transition-all duration-200',
              active === 'explore' ? 'text-white' : 'text-white/50'
            )}
            strokeWidth={active === 'explore' ? 2.5 : 1.5}
          />
        </button>

        {/* Crear — borde gradiente lila → azul. Abre el diálogo de subida */}
        <button
          aria-label="Crear"
          onClick={onOpenUpload}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200 active:scale-90 relative overflow-hidden flex-shrink-0"
          style={{
            border: '2px solid transparent',
            backgroundImage:
              'linear-gradient(#000, #000), linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          }}
        >
          <Plus className="w-5 h-5 text-white relative z-10" strokeWidth={2} />
        </button>

        {/* Mensajes / Inbox */}
        <div className="relative flex items-center justify-center">
          <button
            aria-label="Bandeja"
            onClick={() => { setActive('messages'); onOpenInbox?.() }}
            className="flex items-center justify-center w-9 h-9 transition-all duration-200 active:scale-90"
          >
            <Inbox
              className={cn(
                'w-5 h-5 transition-all duration-200',
                active === 'messages' ? 'text-white' : 'text-white/50'
              )}
              strokeWidth={active === 'messages' ? 2.5 : 1.5}
            />
          </button>
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </div>

        {/* Perfil */}
        <button
          aria-label="Perfil"
          onClick={() => { setActive('profile'); onOpenProfile?.() }}
          className="flex items-center justify-center w-9 h-9 transition-all duration-200 active:scale-90"
        >
          <User
            className={cn(
              'w-5 h-5 transition-all duration-200',
              active === 'profile' ? 'text-white' : 'text-white/50'
            )}
            strokeWidth={active === 'profile' ? 2.5 : 1.5}
          />
        </button>
      </div>
    </nav>
  )
}
