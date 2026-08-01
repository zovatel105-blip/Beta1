'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ArrowLeft, Cake, Eye, EyeOff, Check } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DateWheelPicker from './DateWheelPicker'

// Gradiente de marca Twyk (morado -> azul), el mismo del botón "+" de la barra.
const BRAND_GRADIENT = 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)'

// Pasos del registro, en orden (estilo TikTok: uno por pantalla).
const REG_STEPS = [
  { key: 'birthdate', title: "What's your date of birth?", subtitle: "Your date of birth won't be shown publicly." },
  { key: 'email', title: "What's your email?", subtitle: "We'll send important information to this email." },
  { key: 'password', title: 'Create password', subtitle: '' },
  { key: 'username', title: 'Create your username', subtitle: 'This is how people will find you on Twyk. You can change it later.' },
  // 5º paso (referencia TikTok): se muestra DESPUÉS de crear la cuenta y
  // guarda los intereses elegidos vía POST /api/profile/interests.
  { key: 'interests', title: 'Choose what you like', subtitle: 'Your feed will be personalized based on what you like.' },
]

// Categorías del paso "Choose what you like" (imagen de referencia).
const INTEREST_OPTIONS = [
  'Science & Education', 'Sports', 'Fitness & Health', 'Music', 'Comedy',
  'Food & Drink', 'Auto & Vehicle', 'DIY', 'Travel', 'Gaming',
  'Beauty & Style', 'Animals',
]

// Reglas de contraseña (imagen de referencia): 8-20 caracteres; al menos 1
// letra, 1 número y 1 carácter especial; "Strong password" = todo lo anterior
// con 12+ caracteres (indicador informativo, no bloqueante).
const PW_SPECIAL = /[#?!@$%^&*()_+\-=\[\]{};':"\\|,.<>/~`]/
// Fila de requisito de contraseña (punto + texto que se "encienden" al
// cumplirse la regla) — a nivel de módulo para no recrear el componente en
// cada render (regla react/no-unstable-nested-components).
const PwReq = ({ ok, children }) => (
  <li className="flex items-center gap-3">
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${ok ? 'bg-green-500' : 'bg-zinc-300'}`} />
    <span className={`text-[14.5px] transition-colors ${ok ? 'text-zinc-900' : 'text-zinc-500'}`}>{children}</span>
  </li>
)

function passwordRules(pw) {
  const len = pw.length >= 8 && pw.length <= 20
  const mix = /[A-Za-z]/.test(pw) && /\d/.test(pw) && PW_SPECIAL.test(pw)
  return { len, mix, strong: len && mix && pw.length >= 12 }
}

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
  const [showPw, setShowPw] = useState(false)
  const [interests, setInterests] = useState([])
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
      setShowPw(false)
      setInterests([])
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
      // En el paso de intereses la cuenta YA está creada: no se puede
      // "volver" a los pasos del formulario (re-crearía la cuenta) — la
      // única salida es cerrar (equivalente a Skip).
      if (REG_STEPS[regStep].key === 'interests') { onClose(); return }
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
        // Cuenta creada y sesión iniciada -> avanzar al paso final de
        // intereses ("Choose what you like"), NO cerrar todavía.
        setRegStep(REG_STEPS.findIndex((st) => st.key === 'interests'))
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
      const rules = passwordRules(registerData.password)
      if (!rules.len || !rules.mix) {
        setError('Password must be 8-20 characters with 1 letter, 1 number and 1 special character (# ? ! @)')
        return
      }
    } else if (key === 'username') {
      if (registerData.username.trim().length < 3) { setError('Username must be at least 3 characters'); return }
      await doRegister()
      return
    } else if (key === 'interests') {
      return // este paso usa su propio pie Skip / Next (N)
    }
    setRegStep(regStep + 1)
  }

  const toggleInterest = (cat) =>
    setInterests((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]))

  // Guarda los intereses del paso final (best-effort: si la red falla, la
  // cuenta ya existe y el modal se cierra igualmente).
  const saveInterests = async () => {
    setLoading(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('twyk_token') : null
      await fetch('/api/profile/interests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ interests }),
      })
    } catch { /* best-effort */ }
    setLoading(false)
    onClose()
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

  // Input para TODOS los formularios de este modal (registro paso a paso Y
  // login): caja rellena que se funde con el fondo blanco (gris muy claro,
  // sin línea ni borde visible), en vez de la línea inferior anterior.
  const minimalStepInput =
    'w-full bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 placeholder:font-light text-center text-[17px] font-medium tracking-tight py-2.5 px-4 rounded-xl outline-none border border-transparent focus:bg-zinc-100 focus:ring-2 focus:ring-purple-200 transition-all duration-200'

  const gradientBtn =
    'w-full h-[52px] rounded-full font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 text-white shadow-[0_12px_28px_-10px_rgba(168,85,247,0.5)] hover:shadow-[0_14px_32px_-8px_rgba(168,85,247,0.62)]'

  // Chip de error compartido (registro y login): reemplaza el texto rojo plano
  // por una tarjeta suave, más acorde al resto del rediseño "premium".
  const errorChip = (msg) => (
    <div className="mt-4 max-w-[320px] w-full mx-auto rounded-xl bg-red-50 border border-red-100 px-4 py-2.5 text-red-600 text-[13px] font-medium text-center">
      {msg}
    </div>
  )

  const regStepCfg = REG_STEPS[regStep]

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
          {step === 'methods' || ageBlocked || (isRegister && step === 'form' && regStepCfg.key === 'interests') ? (
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
              <div className="max-w-[420px] mx-auto w-full pt-5">
                <div className="text-center mb-8 flex flex-col items-center">
                  {/* Logo de marca (con su resplandor morado/azul original) sobre
                      el splash de login/registro. */}
                  <img src="/branding/twyk-logo.png" alt="Twyk" className="w-20 h-20 -mb-1 select-none" draggable={false} />
                  <h1 className="text-[29px] font-extrabold tracking-tight leading-tight">
                    {isRegister ? 'Sign up for Twyk' : 'Log in to Twyk'}
                  </h1>
                  <p className="text-zinc-500 text-[15px] mt-2.5 leading-relaxed max-w-[320px] mx-auto">
                    {isRegister
                      ? 'Create your profile, vote on challenges, upload your videos and challenge other creators.'
                      : 'Log in to vote on challenges, upload your videos and challenge others.'}
                  </p>
                </div>
                <button
                  onClick={() => { setStep('form'); setRegStep(0); setError('') }}
                  className={gradientBtn + ' h-[54px]'}
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
            <div className="relative z-10 px-6 py-4 text-center shrink-0"
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
                {/* Indicador de progreso (1 punto por paso del registro). */}
                <div className="flex items-center justify-center gap-2 mb-7">
                  {REG_STEPS.map((s, i) => (
                    <div
                      key={s.key}
                      className="h-2 rounded-full transition-all duration-300"
                      style={{ width: i === regStep ? 28 : 8, background: i <= regStep ? BRAND_GRADIENT : '#e5e5e5' }}
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
                ) : regStepCfg.key === 'interests' ? (
                  /* Cabecera alineada a la IZQUIERDA (imagen de referencia). */
                  <div className="mb-2 text-left">
                    <h1 className="text-[27px] font-extrabold tracking-tight leading-tight">{regStepCfg.title}</h1>
                    <p className="text-zinc-500 text-[14px] mt-2 leading-relaxed">{regStepCfg.subtitle}</p>
                  </div>
                ) : (
                  <div className="mb-2 text-center flex flex-col items-center">
                    <h1 className="text-[25px] font-extrabold tracking-tight leading-tight max-w-[300px] mx-auto">{regStepCfg.title}</h1>
                    {regStepCfg.subtitle ? (
                      <p className="text-zinc-500 text-[14px] mt-2.5 max-w-[280px] mx-auto leading-relaxed">{regStepCfg.subtitle}</p>
                    ) : null}
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

                {regStepCfg.key === 'password' && (() => {
                  const rules = passwordRules(registerData.password)
                  return (
                    <div className="mt-8">
                      <div className="relative w-full">
                        <input
                          type={showPw ? 'text' : 'password'}
                          autoFocus
                          value={registerData.password}
                          onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                          placeholder="Enter password"
                          className={minimalStepInput.replace('text-center', 'text-left') + ' pr-12'}
                          required
                          minLength={8}
                          maxLength={20}
                        />
                        <button
                          type="button"
                          aria-label={showPw ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                        >
                          {showPw ? <Eye className="w-5 h-5" strokeWidth={1.8} /> : <EyeOff className="w-5 h-5" strokeWidth={1.8} />}
                        </button>
                      </div>
                      {/* Requisitos (imagen de referencia): el punto y el texto se
                          "encienden" al cumplirse cada regla. */}
                      <ul className="mt-6 space-y-3 text-left">
                        <PwReq ok={rules.len}>8 characters (20 max)</PwReq>
                        <PwReq ok={rules.mix}>1 letter, 1 number, 1 special character (# ? ! @)</PwReq>
                        <PwReq ok={rules.strong}>Strong password</PwReq>
                      </ul>
                    </div>
                  )
                })()}

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

                {regStepCfg.key === 'interests' && (
                  <div className="mt-6 space-y-3 pb-2">
                    {INTEREST_OPTIONS.map((cat) => {
                      const sel = interests.includes(cat)
                      return (
                        <button
                          type="button"
                          key={cat}
                          onClick={() => toggleInterest(cat)}
                          aria-pressed={sel}
                          className={`w-full flex items-center justify-between rounded-full px-6 py-[15px] text-left text-[16px] font-medium active:scale-[0.99] transition-all duration-150 ${
                            sel ? 'bg-purple-50 ring-1 ring-purple-300 text-zinc-900' : 'bg-zinc-50 text-zinc-800'
                          }`}
                        >
                          <span>{cat}</span>
                          {sel ? (
                            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: BRAND_GRADIENT }}>
                              <Check className="w-4 h-4 text-white" strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="w-6 h-6 rounded-full border-2 border-zinc-200 shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}

                {error && errorChip(error)}

                {regStepCfg.key === 'username' && (
                  <p className="mt-6 text-zinc-400 text-[12px] leading-relaxed text-center">
                    By creating your account you accept our{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline hover:text-zinc-900">Terms of Use</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline hover:text-zinc-900">Privacy Policy</a>
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 shrink-0"
                 style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              {regStepCfg.key === 'interests' ? (
                /* Pie de la imagen de referencia: Skip + "Next (N)" (deshabilitado con 0). */
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-[52px] rounded-full bg-zinc-100 text-zinc-900 font-bold text-[16px] active:scale-[0.98] transition-all hover:bg-zinc-200"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={saveInterests}
                    disabled={interests.length === 0 || loading}
                    className="flex-1 h-[52px] rounded-full font-bold text-[16px] text-white flex items-center justify-center active:scale-[0.98] transition-all disabled:opacity-40"
                    style={{ background: BRAND_GRADIENT }}
                  >
                    {loading ? (
                      <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      `Next (${interests.length})`
                    )}
                  </button>
                </div>
              ) : (
                <button type="submit" disabled={loading} className={gradientBtn} style={{ background: BRAND_GRADIENT }}>
                  {loading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    regStepCfg.key === 'username' ? 'Create account' : 'Continue'
                  )}
                </button>
              )}
            </div>
          </form>
        ) : (
          /* ── LOGIN ─────────────────────────────────────────────────────────── */
          <form onSubmit={handleLogin} className="relative z-10 flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto px-6">
              <div className="max-w-[420px] mx-auto w-full pt-4 flex flex-col items-center text-center">
                <h1 className="text-[25px] font-extrabold tracking-tight leading-tight">Log in</h1>
                <p className="text-zinc-500 text-[14px] mt-2.5 max-w-[280px] leading-relaxed">Enter your username or email and password.</p>

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

                {error && errorChip(error)}
              </div>
            </div>

            <div className="px-6 py-4 shrink-0"
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
