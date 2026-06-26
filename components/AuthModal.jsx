'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ArrowLeft, User, Mail, Lock, Cake, LogIn, ShieldAlert, AtSign } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

// Gradiente de marca Twyk (morado -> azul), el mismo del botón "+" de la barra.
const BRAND_GRADIENT = 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)'

// Pasos del registro, en orden (estilo TikTok: uno por pantalla).
const REG_STEPS = [
  { key: 'birthdate', title: '¿Cuál es tu fecha de nacimiento?', subtitle: 'Tu fecha de nacimiento no se mostrará públicamente.' },
  { key: 'email', title: '¿Cuál es tu correo?', subtitle: 'Te enviaremos información importante a este correo.' },
  { key: 'password', title: 'Crea una contraseña', subtitle: 'Usa al menos 6 caracteres.' },
  { key: 'username', title: 'Crea tu nombre de usuario', subtitle: 'Así te encontrarán en Twyk. Podrás cambiarlo más adelante.' },
]

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
 * AuthModal — Hoja inferior (estilo Twyk) de Login/Registro.
 *  - 'methods': splash con título + un único método (correo/usuario).
 *  - Registro: flujo PASO A PASO estilo TikTok (fecha -> correo -> contraseña ->
 *    usuario), cada paso en su propia pantalla con "Continuar" y flecha atrás.
 *  - Login: usuario + contraseña en una pantalla.
 * Mantiene el gating de edad (COPPA) y el footer legal.
 */
export default function AuthModal({ open, onClose, defaultTab = 'register' }) {
  const { login, register } = useAuth()

  const [view, setView] = useState(defaultTab)   // 'login' | 'register'
  const [step, setStep] = useState('methods')    // 'methods' | 'form'
  const [regStep, setRegStep] = useState(0)       // índice dentro de REG_STEPS
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ageBlocked, setAgeBlocked] = useState(false)

  const [loginData, setLoginData] = useState({ username: '', password: '' })
  const [registerData, setRegisterData] = useState({ username: '', email: '', password: '', birthDate: '' })

  // Al abrir (o cambiar de pestaña por defecto) reseteamos al splash.
  useEffect(() => {
    if (open) {
      setView(defaultTab)
      setStep('methods')
      setRegStep(0)
      setError('')
      setAgeBlocked(false)
    }
  }, [open, defaultTab])

  if (!open) return null

  const isRegister = view === 'register'

  const switchMode = (mode) => {
    setView(mode)
    setStep('methods')
    setRegStep(0)
    setError('')
    setAgeBlocked(false)
  }

  const goBack = () => {
    setError('')
    if (view === 'register' && step === 'form') {
      if (regStep > 0) setRegStep(regStep - 1)
      else setStep('methods')
    } else {
      setStep('methods')
    }
  }

  const doRegister = async () => {
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

  // Avanza el flujo de registro paso a paso (valida el campo del paso actual).
  const handleRegisterNext = async (e) => {
    e.preventDefault()
    setError('')
    const key = REG_STEPS[regStep].key

    if (key === 'birthdate') {
      if (!registerData.birthDate) { setError('Introduce tu fecha de nacimiento'); return }
      const age = computeAge(registerData.birthDate)
      if (age === null) { setError('Fecha de nacimiento no válida'); return }
      if (age < 13) { setAgeBlocked(true); return }
    } else if (key === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) { setError('Introduce un correo válido'); return }
    } else if (key === 'password') {
      if (registerData.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    } else if (key === 'username') {
      if (registerData.username.trim().length < 3) { setError('El usuario debe tener al menos 3 caracteres'); return }
      await doRegister()
      return
    }
    setRegStep(regStep + 1)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await login(loginData.username, loginData.password)
      if (result.success) onClose()
      else setError(result.error || 'Error al iniciar sesión')
    } catch {
      setError('Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full bg-white/[0.06] text-white placeholder:text-white/30 px-4 py-4 rounded-xl text-[16px] outline-none focus:bg-white/[0.1] transition-all border border-white/10 focus:border-white/25'
  const inputWithIcon =
    'w-full bg-white/[0.06] text-white placeholder:text-white/30 pl-12 pr-4 py-4 rounded-xl text-[16px] outline-none focus:bg-white/[0.1] transition-all border border-white/10 focus:border-white/25'

  const gradientBtn =
    'w-full h-[52px] rounded-full font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 text-white'

  const regStepCfg = REG_STEPS[regStep]
  const isLastRegStep = regStep === REG_STEPS.length - 1

  return (
    <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex: 10000 }}>
      {/* Backdrop: toca fuera para cerrar */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Hoja inferior alta con esquinas superiores redondeadas */}
      <div className="relative w-full max-w-[520px] mx-auto bg-[#0a0a0b] text-white rounded-t-3xl border-t border-white/10 shadow-2xl h-[96dvh] flex flex-col overflow-hidden">
        {/* Glow superior de marca */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 z-0"
             style={{ background: 'radial-gradient(70% 100% at 50% 0%, rgba(168,85,247,0.16), transparent 70%)' }} />

        {/* Header: flecha abajo (cerrar) en el splash; flecha atrás en los pasos */}
        <div className="relative z-10 flex items-center h-12 px-3 shrink-0"
             style={{ paddingTop: 'max(env(safe-area-inset-top), 6px)' }}>
          {step === 'methods' || ageBlocked ? (
            <button aria-label="cerrar" onClick={onClose} className="mx-auto p-2 text-white/70 active:scale-90 transition">
              <ChevronDown strokeWidth={2.2} className="w-7 h-7" />
            </button>
          ) : (
            <button aria-label="atrás" onClick={goBack} className="p-2 -ml-1 text-white active:scale-90 transition">
              <ArrowLeft strokeWidth={2} className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* ── PANTALLA DE BLOQUEO POR EDAD (COPPA) ───────────────────────────── */}
        {ageBlocked ? (
          <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6">
            <div className="max-w-[420px] mx-auto w-full flex flex-col items-center text-center pt-10">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
                <ShieldAlert className="w-8 h-8 text-red-400" strokeWidth={1.7} />
              </div>
              <h2 className="text-[20px] font-bold mb-2">Twyk no está disponible para menores de 13 años</h2>
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
          </div>
        ) : step === 'methods' ? (
          /* ── SPLASH: método único ─────────────────────────────────────────── */
          <>
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6">
              <div className="max-w-[420px] mx-auto w-full pt-3">
                <div className="text-center mb-7">
                  <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">
                    {isRegister ? 'Regístrate en Twyk' : 'Inicia sesión en Twyk'}
                  </h1>
                  <p className="text-white/50 text-[15px] mt-2 leading-snug max-w-[320px] mx-auto">
                    {isRegister
                      ? 'Crea tu perfil, vota retos, sube tus vídeos y reta a otros creadores.'
                      : 'Accede para votar retos, subir tus vídeos y retar a otros.'}
                  </p>
                </div>
                <button
                  onClick={() => { setStep('form'); setRegStep(0); setError('') }}
                  className={gradientBtn + ' h-[54px] shadow-[0_10px_30px_-8px_rgba(168,85,247,0.55)]'}
                  style={{ background: BRAND_GRADIENT }}
                >
                  {isRegister ? <AtSign className="w-5 h-5" strokeWidth={2.2} /> : <User className="w-5 h-5" strokeWidth={2.2} />}
                  {isRegister ? 'Usar correo o usuario' : 'Usar usuario y contraseña'}
                </button>
                <p className="mt-6 text-center text-white/40 text-[12px] leading-relaxed">
                  Al continuar aceptas nuestros{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white/70 underline hover:text-white">Términos de Uso</a>
                  {' '}y{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/70 underline hover:text-white">Política de Privacidad</a>
                </p>
              </div>
            </div>
            <div className="relative z-10 border-t border-white/10 px-6 py-4 text-center shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              {isRegister ? (
                <p className="text-white/60 text-[14px]">
                  ¿Ya tienes una cuenta?{' '}
                  <button onClick={() => switchMode('login')} className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
                    Inicia sesión
                  </button>
                </p>
              ) : (
                <p className="text-white/60 text-[14px]">
                  ¿No tienes cuenta?{' '}
                  <button onClick={() => switchMode('register')} className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
                    Regístrate
                  </button>
                </p>
              )}
            </div>
          </>
        ) : isRegister ? (
          /* ── REGISTRO PASO A PASO (estilo TikTok) ──────────────────────────── */
          <form onSubmit={handleRegisterNext} className="relative z-10 flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6">
              <div className="max-w-[420px] mx-auto w-full pt-2">
                {/* Indicador de progreso */}
                <div className="flex items-center gap-1.5 mb-6">
                  {REG_STEPS.map((s, i) => (
                    <div
                      key={s.key}
                      className="h-1 flex-1 rounded-full transition-all"
                      style={{ background: i <= regStep ? BRAND_GRADIENT : 'rgba(255,255,255,0.12)' }}
                    />
                  ))}
                </div>

                <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">{regStepCfg.title}</h1>
                <p className="text-white/50 text-[14px] mt-2 mb-7 leading-snug">{regStepCfg.subtitle}</p>

                {regStepCfg.key === 'birthdate' && (
                  <div className="relative">
                    <Cake className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="date"
                      autoFocus
                      value={registerData.birthDate}
                      onChange={(e) => setRegisterData({ ...registerData, birthDate: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                      className={inputWithIcon + ' [color-scheme:dark]'}
                      required
                    />
                  </div>
                )}

                {regStepCfg.key === 'email' && (
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="email"
                      autoFocus
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      placeholder="tu@correo.com"
                      className={inputWithIcon}
                      required
                    />
                  </div>
                )}

                {regStepCfg.key === 'password' && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="password"
                      autoFocus
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      placeholder="Contraseña"
                      className={inputWithIcon}
                      required
                      minLength={6}
                    />
                  </div>
                )}

                {regStepCfg.key === 'username' && (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="text"
                      autoFocus
                      value={registerData.username}
                      onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                      placeholder="usuario"
                      className={inputWithIcon}
                      required
                      minLength={3}
                    />
                  </div>
                )}

                {error && <p className="text-red-400 text-[13px] mt-3">{error}</p>}

                {isLastRegStep && (
                  <p className="mt-6 text-white/40 text-[12px] leading-relaxed">
                    Al crear tu cuenta aceptas nuestros{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-white/70 underline hover:text-white">Términos de Uso</a>
                    {' '}y{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-white/70 underline hover:text-white">Política de Privacidad</a>
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-white/10 px-6 py-4 shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              <button type="submit" disabled={loading} className={gradientBtn} style={{ background: BRAND_GRADIENT }}>
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  isLastRegStep ? 'Crear cuenta' : 'Continuar'
                )}
              </button>
            </div>
          </form>
        ) : (
          /* ── LOGIN ─────────────────────────────────────────────────────────── */
          <form onSubmit={handleLogin} className="relative z-10 flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6">
              <div className="max-w-[420px] mx-auto w-full pt-2">
                <h1 className="text-[26px] font-extrabold tracking-tight leading-tight mb-1">Inicia sesión</h1>
                <p className="text-white/50 text-[14px] mb-7">Introduce tu usuario y contraseña.</p>

                <div className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="text"
                      autoFocus
                      value={loginData.username}
                      onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                      placeholder="Usuario"
                      className={inputWithIcon}
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" strokeWidth={1.5} />
                    <input
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      placeholder="Contraseña"
                      className={inputWithIcon}
                      required
                    />
                  </div>
                </div>

                {error && <p className="text-red-400 text-[13px] mt-3">{error}</p>}
              </div>
            </div>

            <div className="border-t border-white/10 px-6 py-4 shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              <button type="submit" disabled={loading} className={gradientBtn} style={{ background: BRAND_GRADIENT }}>
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" strokeWidth={2.2} />
                    Iniciar sesión
                  </>
                )}
              </button>
              <p className="text-white/60 text-[14px] text-center mt-4">
                ¿No tienes cuenta?{' '}
                <button type="button" onClick={() => switchMode('register')} className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
                  Regístrate
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
