'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

// Fallback SOLO para invitados sin sesión (no hay cuenta donde persistir).
const CONSENT_KEY = 'twyk_consent'

/**
 * ConsentBanner — Modal de consentimiento de Términos de Uso / Privacidad /
 * Cookies, centrado en pantalla (estilo diálogo nativo).
 *
 * Reglas de visibilidad:
 * - Usuario logueado (recién registrado O que acaba de iniciar sesión): se
 *   muestra si su cuenta aún no tiene `termsAccepted === true` (se consulta
 *   en el objeto `user` del AuthContext, que refleja el registro en Mongo).
 *   Al aceptar, se persiste en el servidor (POST /api/auth/accept-terms) y
 *   ya no vuelve a aparecer en ninguna sesión/dispositivo.
 * - Invitado sin sesión: se mantiene el comportamiento anterior basado en
 *   localStorage (no hay cuenta donde guardar la preferencia).
 */
export default function ConsentBanner() {
  const { user, loading, updateUser } = useAuth()
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Esperar a que el AuthContext resuelva si hay sesión antes de decidir,
    // para no mostrar/ocultar el modal en falso durante el primer render.
    if (loading) return

    if (user) {
      setVisible(user.termsAccepted !== true)
      return
    }

    try {
      setVisible(localStorage.getItem(CONSENT_KEY) !== 'accepted')
    } catch {
      setVisible(false)
    }
  }, [user, loading])

  const accept = async () => {
    if (submitting) return

    if (user) {
      setSubmitting(true)
      try {
        const token = localStorage.getItem('twyk_token')
        await fetch('/api/auth/accept-terms', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
      } catch {
        // Si falla la red, no bloqueamos la UI; se reintentará en la próxima carga.
      }
      updateUser({ termsAccepted: true })
      setSubmitting(false)
    } else {
      try {
        localStorage.setItem(CONSENT_KEY, 'accepted')
      } catch { /* ignore */ }
    }

    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center px-5" style={{ zIndex: 11000 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[380px] rounded-3xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="px-6 pt-7 pb-6 text-center">
          <p className="text-white/80 text-[15px] leading-relaxed">
            By continuing to use Twyk, you acknowledge our{' '}
            <Link href="/terms" className="font-bold text-white underline-offset-2 hover:underline">Terms of Use</Link>
            {' '}and confirm that you have reviewed our{' '}
            <Link href="/privacy" className="font-bold text-white underline-offset-2 hover:underline">Privacy Policy</Link>
            , which explains how your personal data is collected, processed and shared. You also consent to our use of essential{' '}
            <Link href="/privacy" className="font-bold text-white underline-offset-2 hover:underline">Cookies</Link>
            {' '}required for the platform to function properly.
          </p>
        </div>
        <button
          onClick={accept}
          disabled={submitting}
          className="w-full py-4 border-t border-white/10 text-white font-bold text-[15px] active:bg-white/5 transition-colors disabled:opacity-60"
        >
          Accept and Continue
        </button>
      </div>
    </div>
  )
}
