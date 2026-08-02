'use client'

import { useState, useEffect } from 'react'
import { Home, Swords, Plus, Inbox, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from './AuthModal'

// Avatar por defecto: círculo gris claro con silueta de persona (gris medio)
const DefaultAvatar = ({ className = '' }) => (
  <div className={`rounded-full bg-gray-200 overflow-hidden ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      <circle cx="50" cy="40" r="16" fill="#9ca3af" />
      <path d="M16 100C16 75 31 62 50 62s34 13 34 38z" fill="#9ca3af" />
    </svg>
  </div>
)

/**
 * BottomNav — rediseño basado en el BottomNavigation.jsx de Twyk.
 * Barra negra con esquinas superiores redondeadas (rounded-t-3xl), 5 iconos:
 * Home · Swords (Battle) · Plus (borde degradado lila→azul) · Inbox · Perfil.
 * El botón + abre el diálogo de subida (onOpenUpload). El resto sólo
 * gestiona el estado visual "activo" (la app es de una sola página).
 * 
 * @param {string} activeTab - Tab activo actual ('home', 'explore', 'messages', 'profile')
 */
export default function BottomNav({ onOpenUpload, onOpenInbox, onOpenProfile, onGoHome, onOpenBattles, unreadCount = 0, challengesCount = 0, activeTab = 'home' }) {
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
    // Tanto para invitados como para usuarios autenticados abrimos el perfil.
    // Si no hay sesión, ProfilePage muestra el estado "Inicia sesión" (estilo Twyk).
    onOpenProfile?.()
  }

  const handleInboxClick = () => {
    onOpenInbox?.()
    setNotificationsCount(0) // Reset al abrir
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black rounded-t-3xl"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)', transform: 'translateY(1px)' }}
    >
      <div className="flex items-center justify-around px-4 py-2.5">
        {/* Home */}
        <button
          aria-label="Home"
          onClick={() => { onGoHome?.() }}
          className="flex items-center justify-center w-[38px] h-[38px] transition-all duration-200 active:scale-90"
        >
          <Home
            className={cn(
              'w-[22px] h-[22px] transition-all duration-200',
              activeTab === 'home' ? 'text-white' : 'text-white/50'
            )}
            strokeWidth={activeTab === 'home' ? 2.5 : 1.5}
            fill={activeTab === 'home' ? 'white' : 'none'}
          />
        </button>

        {/* Explorar / Battle */}
        <div className="relative flex items-center justify-center">
          <button
            aria-label="Battle"
            onClick={() => { onOpenBattles?.() }}
            className="flex items-center justify-center w-[38px] h-[38px] transition-all duration-200 active:scale-90"
          >
            <Swords
              className={cn(
                'w-[22px] h-[22px] transition-all duration-200',
                activeTab === 'explore' ? 'text-white' : 'text-white/50'
              )}
              strokeWidth={activeTab === 'explore' ? 2.5 : 1.5}
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
          aria-label="Create"
          onClick={onOpenUpload}
          className="flex items-center justify-center w-[38px] h-[38px] rounded-xl transition-all duration-200 active:scale-90 relative overflow-hidden flex-shrink-0"
          style={{
            border: '2px solid transparent',
            backgroundImage:
              'linear-gradient(#000, #000), linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          }}
        >
          <Plus className="w-[22px] h-[22px] text-white relative z-10" strokeWidth={2} />
        </button>

        {/* Mensajes / Inbox */}
        <div className="relative flex items-center justify-center">
          <button
            aria-label="Inbox"
            onClick={handleInboxClick}
            className="flex items-center justify-center w-[38px] h-[38px] transition-all duration-200 active:scale-90"
          >
            <Inbox
              className={cn(
                'w-[22px] h-[22px] transition-all duration-200',
                activeTab === 'messages' ? 'text-white' : 'text-white/50'
              )}
              strokeWidth={activeTab === 'messages' ? 2.5 : 1.5}
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
          aria-label="Profile"
          onClick={handleProfileClick}
          className="flex items-center justify-center w-[38px] h-[38px] transition-all duration-200 active:scale-90"
        >
          {user ? (
            // Usuario registrado: verificar si tiene foto real o es avatar generado
            user.avatarUrl && !user.avatarUrl.includes('dicebear') && !user.avatarUrl.includes('pravatar') ? (
              // Foto real subida por el usuario: llena el círculo COMPLETO (25px).
              // Antes el padding interior (p-[2px]) encogía la imagen a ~18px y
              // se veía más pequeña que el resto al añadir foto de perfil.
              <div className="w-[25px] h-[25px] rounded-full overflow-hidden bg-zinc-900 ring-1 ring-white/20">
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              // Sin foto actualizada: DefaultAvatar gris (25px)
              <DefaultAvatar className="w-[25px] h-[25px]" />
            )
          ) : (
            // Usuario NO registrado: ícono simple (22px)
            <User
              className={cn(
                'w-[22px] h-[22px] transition-all duration-200',
                activeTab === 'profile' ? 'text-white' : 'text-white/50'
              )}
              strokeWidth={activeTab === 'profile' ? 2.5 : 1.5}
            />
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
