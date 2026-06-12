'use client'

import { useState } from 'react'
import { X, User, Mail, Lock, LogIn, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

/**
 * AuthModal - Modal premium de Login/Registro
 */
export default function AuthModal({ open, onClose, defaultTab = 'login' }) {
  const [tab, setTab] = useState(defaultTab)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login, register } = useAuth()

  // Estados de formularios
  const [loginData, setLoginData] = useState({ username: '', password: '' })
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' })

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(loginData.username, loginData.password)
      if (result.success) {
        onClose()
        window.location.reload()
      } else {
        setError(result.error || 'Error al iniciar sesión')
      }
    } catch (err) {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    // Validaciones
    if (registerData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)

    try {
      const result = await register(registerData.username, registerData.email, registerData.password)
      if (result.success) {
        onClose()
        window.location.reload()
      } else {
        setError(result.error || 'Error al registrarse')
      }
    } catch (err) {
      setError('Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 10000 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Modal */}
      <div
        className="relative w-full max-w-[420px] bg-zinc-900/95 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h3 className="text-white text-[18px] font-semibold tracking-tight">
            {tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5 text-white/60" strokeWidth={1.5} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-5">
          <button
            onClick={() => { setTab('login'); setError('') }}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-all',
              tab === 'login'
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            )}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => { setTab('register'); setError('') }}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[14px] font-medium transition-all',
              tab === 'register'
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            )}
          >
            Registrarse
          </button>
        </div>

        {/* Contenido */}
        <div className="px-6 py-6">
          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-[13px]">{error}</p>
            </div>
          )}

          {/* Login Form */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">
                  Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                  <input
                    type="text"
                    value={loginData.username}
                    onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                    placeholder="tu_usuario"
                    className="w-full bg-white/5 text-white placeholder:text-white/30 pl-12 pr-4 py-3.5 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/5 focus:border-white/20"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                  <input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-white/5 text-white placeholder:text-white/30 pl-12 pr-4 py-3.5 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/5 focus:border-white/20"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-3.5 rounded-xl font-medium text-[14px] transition-all flex items-center justify-center gap-2 mt-6',
                  loading
                    ? 'bg-white/20 text-white/40 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-white/90 active:scale-[0.98]'
                )}
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-4 h-4" strokeWidth={2.5} />
                    <span>Iniciar sesión</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Register Form */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">
                  Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                  <input
                    type="text"
                    value={registerData.username}
                    onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                    placeholder="tu_usuario"
                    className="w-full bg-white/5 text-white placeholder:text-white/30 pl-12 pr-4 py-3.5 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/5 focus:border-white/20"
                    required
                    disabled={loading}
                    minLength={3}
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                  <input
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    placeholder="tu@email.com"
                    className="w-full bg-white/5 text-white placeholder:text-white/30 pl-12 pr-4 py-3.5 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/5 focus:border-white/20"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                  <input
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-white/5 text-white placeholder:text-white/30 pl-12 pr-4 py-3.5 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/5 focus:border-white/20"
                    required
                    disabled={loading}
                    minLength={6}
                  />
                </div>
                <p className="text-white/40 text-[11px] mt-1.5">Mínimo 6 caracteres</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-3.5 rounded-xl font-medium text-[14px] transition-all flex items-center justify-center gap-2 mt-6',
                  loading
                    ? 'bg-white/20 text-white/40 cursor-not-allowed'
                    : 'bg-white text-black hover:bg-white/90 active:scale-[0.98]'
                )}
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" strokeWidth={2.5} />
                    <span>Crear cuenta</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
