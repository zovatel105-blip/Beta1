'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, User, Mail, Lock, LogIn, UserPlus, Cake, ShieldAlert, AtSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// Gradiente de marca Twyk (morado -> azul), el mismo del botón "+" de la barra.
const BRAND_GRADIENT = 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)'

// Calcula la edad en años a partir de 'YYYY-MM-DD'. Devuelve null si no es válida.
function computeAge(birthDate) {
  if (!birthDate) return null
  const dob = new Date(birthDate)
  if (isNaN(dob.getTime())) return null
  const now = new Date()
  if (dob > now) return null
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

/**
 * AuthModal — Modal de Login/Registro a PANTALLA COMPLETA, estilo Twyk.
 * Flujo en dos pasos (como el "Regístrate" de apps tipo TikTok):
 *   1) 'methods' -> pantalla splash con título + subtítulo + el único método que
 *      tenemos ("Usar correo o usuario").
 *   2) 'form'    -> formulario real (login o registro) con mis campos actuales.
 * Mantiene el gating de edad (COPPA) y el footer legal.
 */
export default function AuthModal({ open, onClose, defaultTab = 'register' }) {
  const { login, register } = useAuth()

  const [view, setView] = useState(defaultTab)   // 'login' | 'register'
  const [step, setStep] = useState('methods')    // 'methods' | 'form'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ageBlocked, setAgeBlocked] = useState(false)

  const [loginData, setLoginData] = useState({ username: '', password: '' })
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '', birthDate: '' })

  // Al abrir (o cambiar de pestaña por defecto) reseteamos a la pantalla splash.
  useEffect(() => {
    if (open) {
      setView(defaultTab)
      setStep('methods')
      setError('')
      setAgeBlocked(false)
    }
  }, [open, defaultTab])

  if (!open) return null

  const isRegister = view === 'register'

  const switchMode = (mode) => {
    setView(mode)
    setStep('methods')
    setError('')
    setAgeBlocked(false)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(loginData.username, loginData.password)
      if (result.success) {
        onClose()
      } else {
        setError(result.error || 'Error al iniciar sesión')
      }
    } catch {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')

    if (registerData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    // Gating de edad (COPPA): fecha obligatoria + mínimo 13 años.
    if (!registerData.birthDate) {
      setError('Introduce tu fecha de nacimiento')
      return
    }
    const age = computeAge(registerData.birthDate)
    if (age === null) {
      setError('Fecha de nacimiento no válida')
      return
    }
    if (age < 13) {
      setAgeBlocked(true)
      return
    }

    setLoading(true)
    try {
      const result = await register(
        registerData.username,
        registerData.email,
        registerData.password,
        registerData.birthDate,
      )
      if (result.success) {
        onClose()
      } else if (result.error && /menores de 13/i.test(result.error)) {
        setAgeBlocked(true)
      } else {
        setError(result.error || 'Error al registrarse')
      }
    } catch {
      setError('Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  const inputWrap = 'relative'
  const inputCls =
    'w-full bg-white/[0.06] text-white placeholder:text-white/30 pl-12 pr-4 py-3.5 rounded-xl text-[15px] outline-none focus:bg-white/[0.1] transition-all border border-white/10 focus:border-white/25'

  return (
    <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex: 10000 }}>
      {/* Backdrop: toca fuera para cerrar */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Hoja inferior alta con esquinas superiores redondeadas, dejando margen arriba */}
      <div className="relative w-full max-w-[520px] mx-auto bg-[#0a0a0b] text-white rounded-t-3xl border-t border-white/10 shadow-2xl h-[92dvh] flex flex-col overflow-hidden">
      {/* Glow superior de marca */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 z-0"
           style={{ background: 'radial-gradient(70% 100% at 50% 0%, rgba(168,85,247,0.16), transparent 70%)' }} />

      {/* Header: flecha hacia abajo (cerrar), estilo hoja inferior */}
      <div className="relative z-10 flex items-center justify-center px-3 h-12 shrink-0"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 6px)' }}>
        <button aria-label="cerrar" onClick={onClose} className="p-2 text-white/70 active:scale-90 transition">
          <ChevronDown strokeWidth={2.2} className="w-7 h-7" />
        </button>
      </div>

      {/* Contenido */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6">
        <div className="max-w-[420px] mx-auto w-full pt-1 pb-5">

          {ageBlocked ? (
            /* PANTALLA DE BLOQUEO POR EDAD (COPPA) */
            <div className="flex flex-col items-center text-center pt-10">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
                <ShieldAlert className="w-8 h-8 text-red-400" strokeWidth={1.7} />
              </div>
              <h2 className="text-[19px] font-bold mb-2">Twyk no está disponible para menores de 13 años</h2>
              <p className="text-white/50 text-[14px] leading-relaxed max-w-[320px]">
                De acuerdo con la ley COPPA de EEUU, no permitimos el registro de menores de 13 años. No podemos crear tu cuenta.
              </p>
              <button
                onClick={() => { setAgeBlocked(false); switchMode('login') }}
                className="mt-7 w-full h-12 rounded-full bg-white/10 text-white text-[15px] font-semibold hover:bg-white/15 active:scale-[0.98] transition-all"
              >
                Entendido
              </button>
            </div>
          ) : (
            <>
              {/* Título + subtítulo */}
              <div className="text-center pt-3 mb-6">
                <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">
                  {isRegister ? 'Regístrate en Twyk' : 'Inicia sesión en Twyk'}
                </h1>
                <p className="text-white/50 text-[15px] mt-2 leading-snug max-w-[320px] mx-auto">
                  {isRegister
                    ? 'Crea tu perfil, vota retos, sube tus vídeos y reta a otros creadores.'
                    : 'Accede para votar retos, subir tus vídeos y retar a otros.'}
                </p>
              </div>

              {step === 'methods' ? (
                /* PASO 1: método (único: correo o usuario) */
                <div className="space-y-3">
                  <button
                    onClick={() => { setStep('form'); setError('') }}
                    className="w-full h-[54px] rounded-full text-white font-bold text-[16px] flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-[0_10px_30px_-8px_rgba(168,85,247,0.55)]"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {isRegister ? <AtSign className="w-5 h-5" strokeWidth={2.2} /> : <User className="w-5 h-5" strokeWidth={2.2} />}
                    {isRegister ? 'Usar correo o usuario' : 'Usar usuario y contraseña'}
                  </button>
                </div>
              ) : isRegister ? (
                /* PASO 2: formulario de REGISTRO */
                <form onSubmit={handleRegister} className="space-y-4">
                  {error && (
                    <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-red-400 text-[13px]">{error}</p>
                    </div>
                  )}

                  <div className={inputWrap}>
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="text"
                      value={registerData.username}
                      onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                      placeholder="Usuario"
                      className={inputCls}
                      required
                      minLength={3}
                      disabled={loading}
                    />
                  </div>

                  <div className={inputWrap}>
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="email"
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      placeholder="Email"
                      className={inputCls}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className={inputWrap}>
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="password"
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      placeholder="Contraseña (mín. 6 caracteres)"
                      className={inputCls}
                      required
                      minLength={6}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <div className={inputWrap}>
                      <Cake className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                      <input
                        type="date"
                        value={registerData.birthDate}
                        onChange={(e) => setRegisterData({ ...registerData, birthDate: e.target.value })}
                        max={new Date().toISOString().split('T')[0]}
                        className={inputCls + ' [color-scheme:dark]'}
                        required
                        disabled={loading}
                      />
                    </div>
                    <p className="text-white/40 text-[11px] mt-1.5 px-1">Debes tener al menos 13 años para usar Twyk</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[52px] rounded-full font-bold text-[16px] flex items-center justify-center gap-2 mt-2 active:scale-[0.98] transition-transform disabled:opacity-60 text-white"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {loading ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5" strokeWidth={2.2} />
                        Crear cuenta
                      </>
                    )}
                  </button>
                </form>
              ) : (
                /* PASO 2: formulario de LOGIN */
                <form onSubmit={handleLogin} className="space-y-4">
                  {error && (
                    <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <p className="text-red-400 text-[13px]">{error}</p>
                    </div>
                  )}

                  <div className={inputWrap}>
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="text"
                      value={loginData.username}
                      onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                      placeholder="Usuario"
                      className={inputCls}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className={inputWrap}>
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      placeholder="Contraseña"
                      className={inputCls}
                      required
                      disabled={loading}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[52px] rounded-full font-bold text-[16px] flex items-center justify-center gap-2 mt-2 active:scale-[0.98] transition-transform disabled:opacity-60 text-white"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {loading ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" strokeWidth={2.2} />
                        Iniciar sesión
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Footer legal */}
              {!ageBlocked && (
                <p className="mt-7 text-center text-white/40 text-[12px] leading-relaxed">
                  Al continuar aceptas nuestros{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white/70 underline hover:text-white">Términos de Uso</a>
                  {' '}y{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/70 underline hover:text-white">Política de Privacidad</a>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Barra inferior: alternar login / registro */}
      {!ageBlocked && (
        <div className="relative z-10 border-t border-white/10 px-6 py-4 text-center shrink-0"
             style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
          {isRegister ? (
            <p className="text-white/60 text-[14px]">
              ¿Ya tienes una cuenta?{' '}
              <button onClick={() => switchMode('login')} className={cn('font-bold bg-clip-text text-transparent')} style={{ backgroundImage: BRAND_GRADIENT }}>
                Inicia sesión
              </button>
            </p>
          ) : (
            <p className="text-white/60 text-[14px]">
              ¿No tienes cuenta?{' '}
              <button onClick={() => switchMode('register')} className={cn('font-bold bg-clip-text text-transparent')} style={{ backgroundImage: BRAND_GRADIENT }}>
                Regístrate
              </button>
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
