'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ArrowLeft, User, Mail, Lock, LogIn, ShieldAlert, AtSign, Cake, Sparkles, PartyPopper } from 'lucide-react'
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

  const inputCls =
    'w-full bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 px-4 py-4 rounded-xl text-[16px] outline-none focus:bg-white transition-all border border-zinc-200 focus:border-zinc-400'
  const inputWithIcon =
    'w-full bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 pl-12 pr-4 py-4 rounded-xl text-[16px] outline-none focus:bg-white transition-all border border-zinc-200 focus:border-zinc-400'

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
            <div className="max-w-[420px] mx-auto w-full flex flex-col items-center text-center pt-10">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
                <ShieldAlert className="w-8 h-8 text-red-500" strokeWidth={1.7} />
              </div>
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
                <div className="text-center mb-7">
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
                  {isRegister ? <AtSign className="w-5 h-5" strokeWidth={2.2} /> : <User className="w-5 h-5" strokeWidth={2.2} />}
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">{regStepCfg.title}</h1>
                    <p className={`text-zinc-500 text-[14px] mt-2 leading-snug ${regStepCfg.key === 'birthdate' ? 'mb-5' : 'mb-7'}`}>{regStepCfg.subtitle}</p>
                  </div>
                  {regStepCfg.key === 'birthdate' && (
                    <div className="relative shrink-0 mt-1">
                      <Sparkles className="absolute -top-1.5 -left-2.5 w-3.5 h-3.5 text-purple-400 animate-pulse" strokeWidth={2} />
                      <Sparkles className="absolute -bottom-1 -right-1.5 w-3 h-3 text-blue-400 animate-pulse" style={{ animationDelay: '0.5s' }} strokeWidth={2} />
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: BRAND_GRADIENT, boxShadow: '0 10px 24px -8px rgba(168,85,247,0.55)' }}
                      >
                        <Cake className="w-7 h-7 text-white" strokeWidth={1.8} />
                      </div>
                    </div>
                  )}
                </div>

                {regStepCfg.key === 'birthdate' && (() => {
                  const previewAge = computeAge(registerData.birthDate)
                  const underAge = previewAge !== null && previewAge < 13
                  const formatted = formatDateLong(registerData.birthDate)
                  return (
                    <div
                      className="mb-5 rounded-2xl p-3.5 flex items-center gap-3 transition-colors duration-300"
                      style={{
                        background: underAge
                          ? 'rgba(239,68,68,0.06)'
                          : 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(59,130,246,0.08))',
                        border: `1px solid ${underAge ? 'rgba(239,68,68,0.30)' : 'rgba(168,85,247,0.22)'}`,
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: underAge ? '#EF4444' : BRAND_GRADIENT }}
                      >
                        {underAge ? (
                          <ShieldAlert className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                        ) : (
                          <PartyPopper className="w-[18px] h-[18px] text-white" strokeWidth={2} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-zinc-900 truncate">{formatted || 'Select your date'}</p>
                        <p className={`text-[12.5px] mt-0.5 ${underAge ? 'text-red-500 font-semibold' : 'text-zinc-500'}`}>
                          {underAge
                            ? 'You must be 13 or older to join Twyk'
                            : previewAge !== null
                              ? `You're ${previewAge} years old`
                              : 'Scroll to pick day, month and year'}
                        </p>
                      </div>
                    </div>
                  )
                })()}

                {regStepCfg.key === 'birthdate' && (
                  <DateWheelPicker
                    value={registerData.birthDate}
                    onChange={(val) => setRegisterData((prev) => ({ ...prev, birthDate: val }))}
                  />
                )}

                {regStepCfg.key === 'email' && (
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    <input
                      type="email"
                      autoFocus
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      placeholder="you@email.com"
                      className={inputWithIcon}
                      required
                    />
                  </div>
                )}

                {regStepCfg.key === 'password' && (
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    <input
                      type="password"
                      autoFocus
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      placeholder="Password"
                      className={inputWithIcon}
                      required
                      minLength={6}
                    />
                  </div>
                )}

                {regStepCfg.key === 'username' && (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    <input
                      type="text"
                      autoFocus
                      value={registerData.username}
                      onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                      placeholder="username"
                      className={inputWithIcon}
                      required
                      minLength={3}
                    />
                  </div>
                )}

                {error && <p className="text-red-500 text-[13px] mt-3">{error}</p>}

                {isLastRegStep && (
                  <p className="mt-6 text-zinc-400 text-[12px] leading-relaxed">
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
              <div className="max-w-[420px] mx-auto w-full pt-2">
                <h1 className="text-[26px] font-extrabold tracking-tight leading-tight mb-1">Log in</h1>
                <p className="text-zinc-500 text-[14px] mb-7">Enter your username or email and password.</p>

                <div className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    <input
                      type="text"
                      autoFocus
                      value={loginData.username}
                      onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                      placeholder="Username or email"
                      className={inputWithIcon}
                      required
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" strokeWidth={1.5} />
                    <input
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      placeholder="Password"
                      className={inputWithIcon}
                      required
                    />
                  </div>
                </div>

                {error && <p className="text-red-500 text-[13px] mt-3">{error}</p>}
              </div>
            </div>

            <div className="border-t border-zinc-200 px-6 py-4 shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              <button type="submit" disabled={loading} className={gradientBtn} style={{ background: BRAND_GRADIENT }}>
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" strokeWidth={2.2} />
                    Log in
                  </>
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
