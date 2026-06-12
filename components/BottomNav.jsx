'use client'

import { useState, useEffect } from 'react'
import { Home, Swords, Plus, Inbox, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from './AuthModal'

/**
 * BottomNav — rediseño basado en el BottomNavigation.jsx de Twyk.
 * Barra negra con esquinas superiores redondeadas (rounded-t-3xl), 5 iconos:
 * Home · Swords (Battle) · Plus (borde degradado lila→azul) · Inbox · Perfil.
 * El botón + abre el diálogo de subida (onOpenUpload). El resto sólo
 * gestiona el estado visual "activo" (la app es de una sola página).
 */
export default function BottomNav({ onOpenUpload, onOpenInbox, onOpenProfile, onGoHome, onOpenBattles, unreadCount = 0, challengesCount = 0 }) {
  const [active, setActive] = useState('home')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [notificationsCount, setNotificationsCount] = useState(0)
  const { user } = useAuth()

  // Cargar contador de notificaciones
  useEffect(() => {
    if (user) {
      loadNotificationsCount()
      // Actualizar cada 30 segundos
      const interval = setInterval(loadNotificationsCount, 30000)
      return () => clearInterval(interval)
    } else {
      setNotificationsCount(0)
    }
  }, [user])

  const loadNotificationsCount = async () => {
    try {
      const res = await fetch('/api/notifications/unread')
      if (res.ok) {
        const data = await res.json()
        setNotificationsCount(data.count || 0)
      }
    } catch (err) {
      console.error('Error loading notifications count:', err)
    }
  }

  const handleProfileClick = () => {
    if (!user) {
      setShowAuthModal(true)
    } else {
      setActive('profile')
      onOpenProfile?.()
    }
  }

  const handleInboxClick = () => {
    setActive('inbox')
    onOpenInbox?.()
    setNotificationsCount(0) // Reset al abrir
  }

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
        <div className="relative flex items-center justify-center">
          <button
            aria-label="Battle"
            onClick={() => { setActive('explore'); onOpenBattles?.() }}
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
          {challengesCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {challengesCount > 9 ? '9+' : challengesCount}
            </span>
          )}
        </div>

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
            onClick={handleInboxClick}
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
          {notificationsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
              {notificationsCount > 9 ? '9+' : notificationsCount}
            </span>
          )}
        </div>

        {/* Perfil */}
        <button
          aria-label="Perfil"
          onClick={handleProfileClick}
          className="flex items-center justify-center w-9 h-9 transition-all duration-200 active:scale-90"
        >
          {user ? (
            <div className="w-7 h-7 rounded-full overflow-hidden ring-2 ring-white/20 hover:ring-white/40 transition-all">
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center ring-2 ring-white/20 hover:ring-white/30 transition-all">
              <User
                className="w-4 h-4 text-white"
                strokeWidth={2}
              />
            </div>
          )}
        </button>
      </div>

      {/* Auth Modal */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab="login"
      />
    </nav>
  )
}
