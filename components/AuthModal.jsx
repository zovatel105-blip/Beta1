'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ArrowLeft, Cake } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DateWheelPicker from './DateWheelPicker'

// Gradiente de marca Twyk (morado -> azul), el mismo del botón "+" de la barra.
const BRAND_GRADIENT = 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)'

// Pasos del registro, en orden (estilo TikTok: uno por pantalla).
const REG_STEPS = [
  { key: 'birthdate', title: "What's your date of birth?", subtitle: "Your date of birth won't be shown publicly." },
  { key: 'email', title: "What's your email?", subtitle: "We'll send important information to this email." },
  { key: 'password', title: 'Create a password', subtitle: 'Use at least 6 characters.' },
  { key: 'username', title: 'Create your username', subtitle: 'This is how people will find you on Twyk. You can change it later.' },
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

// Formatea 'YYYY-MM-DD' a un texto largo en inglés ("July 15, 2005"), usado
// por la tarjeta de vista previa en vivo del paso de fecha de nacimiento.
function formatDateLong(birthDate) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return ''
  const [y, m, d] = birthDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
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

  // Para el portal: solo renderizamos en cliente (document disponible).
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

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

  if (!open || !mounted) return null

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
      } else if (result.error && /under 13|menores de 13/i.test(result.error)) {
        setAgeBlocked(true)
      } else {
        setError(result.error || 'Sign up error')
      }
    } catch {
      setError('Sign up error')
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
      if (!registerData.birthDate) { setError('Enter your date of birth'); return }
      const age = computeAge(registerData.birthDate)
      if (age === null) { setError('Invalid date of birth'); return }
      if (age < 13) { setAgeBlocked(true); return }
    } else if (key === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) { setError('Enter a valid email'); return }
    } else if (key === 'password') {
      if (registerData.password.length < 6) { setError('Password must be at least 6 characters'); return }
    } else if (key === 'username') {
      if (registerData.username.trim().length < 3) { setError('Username must be at least 3 characters'); return }
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
      else setError(result.error || 'Sign in error')
    } catch {
      setError('Sign in error')
    } finally {
      setLoading(false)
    }
  }

  // Input minimalista para TODOS los formularios de este modal (registro
  // paso a paso Y login): sin caja/relleno, solo una línea inferior fina
  // que se resalta en morado de marca al enfocar. Reemplaza los inputs
  // anteriores con icono incrustado dentro de una caja rellena.
  const minimalStepInput =
    'w-full bg-transparent text-zinc-900 placeholder:text-zinc-300 text-center text-[20px] font-bold tracking-tight py-3 outline-none border-0 border-b-2 border-zinc-200 focus:border-purple-400 transition-colors'

  const gradientBtn =
    'w-full h-[52px] rounded-full font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 text-white'

  const regStepCfg = REG_STEPS[regStep]
  const isLastRegStep = regStep === REG_STEPS.length - 1

  return createPortal(
    <div className="fixed inset-0 flex flex-col justify-end" style={{ zIndex: 10000 }}>
      {/* Backdrop: toca fuera para cerrar */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Hoja inferior alta con esquinas superiores redondeadas */}
      <div className="relative w-full max-w-[520px] mx-auto bg-white text-zinc-900 rounded-t-3xl border-t border-zinc-200 shadow-2xl h-[96dvh] flex flex-col overflow-hidden">
        {/* Glow superior de marca */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 z-0"
             style={{ background: 'radial-gradient(70% 100% at 50% 0%, rgba(168,85,247,0.10), transparent 70%)' }} />

        {/* Header: flecha abajo (cerrar) en el splash; flecha atrás en los pasos */}
        <div className="relative z-10 flex items-center h-12 px-3 shrink-0"
             style={{ paddingTop: 'max(env(safe-area-inset-top), 6px)' }}>
          {step === 'methods' || ageBlocked ? (
            <button aria-label="close" onClick={onClose} className="mx-auto p-2 text-zinc-600 active:scale-90 transition">
              <ChevronDown strokeWidth={2.2} className="w-7 h-7" />
            </button>
          ) : (
            <button aria-label="atrás" onClick={goBack} className="p-2 -ml-1 text-zinc-900 active:scale-90 transition">
              <ArrowLeft strokeWidth={2} className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* ── PANTALLA DE BLOQUEO POR EDAD (COPPA) ───────────────────────────── */}
        {ageBlocked ? (
          <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6">
            <div className="max-w-[420px] mx-auto w-full flex flex-col items-center text-center pt-16">
              <h2 className="text-[20px] font-bold mb-2">Twyk isn&apos;t available for users under 13</h2>
              <p className="text-zinc-500 text-[14px] leading-relaxed max-w-[320px]">
                In accordance with the U.S. COPPA law, we don&apos;t allow registration for users under 13. We can&apos;t create your account.
              </p>
              <button
                onClick={() => { setAgeBlocked(false); switchMode('login') }}
                className="mt-7 w-full h-12 rounded-full bg-zinc-100 text-zinc-900 text-[15px] font-semibold hover:bg-zinc-200 active:scale-[0.98] transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        ) : step === 'methods' ? (
          /* ── SPLASH: método único ─────────────────────────────────────────── */
          <>
            <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6">
              <div className="max-w-[420px] mx-auto w-full pt-3">
                <div className="text-center mb-7 flex flex-col items-center">
                  <div className="w-9 h-[3px] rounded-full mb-4" style={{ background: BRAND_GRADIENT }} />
                  <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">
                    {isRegister ? 'Sign up for Twyk' : 'Log in to Twyk'}
                  </h1>
                  <p className="text-zinc-500 text-[15px] mt-2 leading-snug max-w-[320px] mx-auto">
                    {isRegister
                      ? 'Create your profile, vote on challenges, upload your videos and challenge other creators.'
                      : 'Log in to vote on challenges, upload your videos and challenge others.'}
                  </p>
                </div>
                <button
                  onClick={() => { setStep('form'); setRegStep(0); setError('') }}
                  className={gradientBtn + ' h-[54px] shadow-[0_10px_30px_-8px_rgba(168,85,247,0.55)]'}
                  style={{ background: BRAND_GRADIENT }}
                >
                  {isRegister ? 'Use email or username' : 'Use username and password'}
                </button>
                <p className="mt-6 text-center text-zinc-400 text-[12px] leading-relaxed">
                  By continuing you accept our{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline hover:text-zinc-900">Terms of Use</a>
                  {' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline hover:text-zinc-900">Privacy Policy</a>
                </p>
              </div>
            </div>
            <div className="relative z-10 border-t border-zinc-200 px-6 py-4 text-center shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              {isRegister ? (
                <p className="text-zinc-500 text-[14px]">
                  Already have an account?{' '}
                  <button onClick={() => switchMode('login')} className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
                    Log in
                  </button>
                </p>
              ) : (
                <p className="text-zinc-500 text-[14px]">
                  Don&apos;t have an account?{' '}
                  <button onClick={() => switchMode('register')} className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
                    Sign up
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
                {/* Indicador de progreso (1 punto por paso del registro) — ausente en la
                    imagen de referencia, ayuda a orientarse dentro del flujo de 4 pasos. */}
                <div className="flex items-center justify-center gap-1.5 mb-6">
                  {REG_STEPS.map((s, i) => (
                    <div
                      key={s.key}
                      className="h-1.5 rounded-full transition-all duration-300"
                      style={{ width: i === regStep ? 26 : 8, background: i <= regStep ? BRAND_GRADIENT : '#e5e5e5' }}
                    />
                  ))}
                </div>

                {regStepCfg.key === 'birthdate' ? (
                  <>
                    {/* Composición minimalista y centrada: el pastel es solo un icono
                        (sin caja/fondo de color, sin halo ni sparkles) que flota como
                        parte del diseño -> título -> subtítulo -> vista previa tipográfica
                        (líneas finas, sin tarjeta rellena) -> rueda, sin espacio muerto. */}
                    <div className="flex flex-col items-center text-center">
                      <Cake className="w-11 h-11 text-purple-500 mb-3" strokeWidth={1.4} />
                      <h1 className="text-[24px] font-extrabold tracking-tight leading-tight max-w-[300px]">{regStepCfg.title}</h1>
                      <p className="text-zinc-500 text-[14px] mt-2 max-w-[280px] leading-snug">{regStepCfg.subtitle}</p>

                      {(() => {
                        const previewAge = computeAge(registerData.birthDate)
                        const underAge = previewAge !== null && previewAge < 13
                        const formatted = formatDateLong(registerData.birthDate)
                        return (
                          <div className="w-full mt-7 mb-6 py-4 border-t border-b border-zinc-100 text-center">
                            <p className="text-[20px] font-extrabold text-zinc-900 tracking-tight">{formatted || 'Select your date'}</p>
                            <p
                              className={`text-[12.5px] mt-1.5 font-semibold uppercase tracking-wide ${underAge ? 'text-red-500' : 'text-purple-500'}`}
                            >
                              {underAge
                                ? 'You must be 13 or older to join Twyk'
                                : previewAge !== null
                                  ? `You're ${previewAge} years old`
                                  : 'Scroll to pick day, month and year'}
                            </p>
                          </div>
                        )
                      })()}
                    </div>

                    <DateWheelPicker
                      value={registerData.birthDate}
                      onChange={(val) => setRegisterData((prev) => ({ ...prev, birthDate: val }))}
                    />
                  </>
                ) : (
                  <div className="mb-2 text-center flex flex-col items-center">
                    <div className="w-9 h-[3px] rounded-full mb-4" style={{ background: BRAND_GRADIENT }} />
                    <h1 className="text-[24px] font-extrabold tracking-tight leading-tight max-w-[300px] mx-auto">{regStepCfg.title}</h1>
                    <p className="text-zinc-500 text-[14px] mt-2 max-w-[280px] mx-auto leading-snug">{regStepCfg.subtitle}</p>
                  </div>
                )}

                {regStepCfg.key === 'email' && (
                  <div className="flex flex-col items-center text-center mt-8">
                    <input
                      type="email"
                      autoFocus
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      placeholder="you@email.com"
                      className={minimalStepInput}
                      required
                    />
                  </div>
                )}

                {regStepCfg.key === 'password' && (
                  <div className="flex flex-col items-center text-center mt-8">
                    <input
                      type="password"
                      autoFocus
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      placeholder="Password"
                      className={minimalStepInput}
                      required
                      minLength={6}
                    />
                  </div>
                )}

                {regStepCfg.key === 'username' && (
                  <div className="flex flex-col items-center text-center mt-8">
                    <input
                      type="text"
                      autoFocus
                      value={registerData.username}
                      onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                      placeholder="username"
                      className={minimalStepInput}
                      required
                      minLength={3}
                    />
                  </div>
                )}

                {error && <p className="text-red-500 text-[13px] mt-4 text-center">{error}</p>}

                {isLastRegStep && (
                  <p className="mt-6 text-zinc-400 text-[12px] leading-relaxed text-center">
                    By creating your account you accept our{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline hover:text-zinc-900">Terms of Use</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline hover:text-zinc-900">Privacy Policy</a>
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-zinc-200 px-6 py-4 shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              <button type="submit" disabled={loading} className={gradientBtn} style={{ background: BRAND_GRADIENT }}>
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  isLastRegStep ? 'Create account' : 'Continue'
                )}
              </button>
            </div>
          </form>
        ) : (
          /* ── LOGIN ─────────────────────────────────────────────────────────── */
          <form onSubmit={handleLogin} className="relative z-10 flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6">
              <div className="max-w-[420px] mx-auto w-full pt-2 flex flex-col items-center text-center">
                <div className="w-9 h-[3px] rounded-full mb-4" style={{ background: BRAND_GRADIENT }} />
                <h1 className="text-[24px] font-extrabold tracking-tight leading-tight">Log in</h1>
                <p className="text-zinc-500 text-[14px] mt-2 max-w-[280px] leading-snug">Enter your username or email and password.</p>

                <div className="w-full mt-8 space-y-6">
                  <input
                    type="text"
                    autoFocus
                    value={loginData.username}
                    onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                    placeholder="Username or email"
                    className={minimalStepInput}
                    required
                  />
                  <input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    placeholder="Password"
                    className={minimalStepInput}
                    required
                  />
                </div>

                {error && <p className="text-red-500 text-[13px] mt-4">{error}</p>}
              </div>
            </div>

            <div className="border-t border-zinc-200 px-6 py-4 shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              <button type="submit" disabled={loading} className={gradientBtn} style={{ background: BRAND_GRADIENT }}>
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  'Log in'
                )}
              </button>
              <p className="text-zinc-500 text-[14px] text-center mt-4">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => switchMode('register')} className="font-bold bg-clip-text text-transparent" style={{ backgroundImage: BRAND_GRADIENT }}>
                  Sign up
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  )
}
