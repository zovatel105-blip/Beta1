'use client'

import { X, Sparkles } from 'lucide-react'
import { useState } from 'react'
import AuthModal from './AuthModal'

/**
 * Modal que invita a usuarios invitados a registrarse para seguir disfrutando.
 * Diseño premium y minimalista, se puede cerrar.
 */
export default function GuestPromptModal({ open, onClose }) {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authTab, setAuthTab] = useState('register')

  if (!open) return null

  const handleRegister = () => {
    setAuthTab('register')
    setShowAuthModal(true)
  }

  const handleLogin = () => {
    setAuthTab('login')
    setShowAuthModal(true)
  }

  return (
    <>
      {/* Backdrop con blur */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div 
          className="relative bg-gradient-to-b from-zinc-900 to-black border border-white/10 rounded-3xl max-w-md w-full p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{
            boxShadow: '0 0 80px -20px rgba(168, 85, 247, 0.4)'
          }}
        >
          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>

          {/* Icono decorativo */}
          <div className="flex justify-center mb-6">
            <div 
              className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center"
              style={{
                boxShadow: '0 0 40px -10px rgba(168, 85, 247, 0.5)'
              }}
            >
              <Sparkles className="w-8 h-8 text-purple-400" strokeWidth={1.5} />
            </div>
          </div>

          {/* Título */}
          <h2 className="text-white text-2xl font-semibold text-center mb-3 tracking-tight">
            Únete a la comunidad
          </h2>

          {/* Descripción */}
          <p className="text-zinc-400 text-center text-[15px] leading-relaxed mb-8">
            Regístrate para votar, comentar, crear retos y seguir a tus creadores favoritos
          </p>

          {/* Botones de acción */}
          <div className="space-y-3">
            {/* Botón Registrarse (principal) */}
            <button
              onClick={handleRegister}
              className="w-full py-3.5 rounded-xl font-medium text-white transition-all duration-200 active:scale-95"
              style={{
                background: 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)',
                boxShadow: '0 4px 20px -4px rgba(168, 85, 247, 0.5)'
              }}
            >
              Crear cuenta gratis
            </button>

            {/* Botón Iniciar Sesión (secundario) */}
            <button
              onClick={handleLogin}
              className="w-full py-3.5 rounded-xl font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200 active:scale-95"
            >
              Ya tengo cuenta
            </button>
          </div>

          {/* Texto pequeño */}
          <p className="text-zinc-500 text-xs text-center mt-6">
            Continúa explorando sin registrarte o crea una cuenta para desbloquear todas las funciones
          </p>
        </div>
      </div>

      {/* Auth Modal */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab={authTab}
      />
    </>
  )
}
