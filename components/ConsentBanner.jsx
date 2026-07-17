'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

/**
 * ConsentBanner — Modal de consentimiento de Términos de Uso / Privacidad /
 * Cookies, centrado en pantalla (estilo diálogo nativo, bloqueante).
 *
 * Regla de visibilidad (ÚNICA fuente de verdad: la cuenta, no el navegador):
 * - Invitado SIN sesión: NUNCA se muestra (no hay cuenta donde persistir
 *   la aceptación, así que no tiene sentido pedirla todavía).
 * - Usuario CON sesión (justo después de un registro exitoso, o justo
 *   después de iniciar sesión): se muestra si su cuenta aún no tiene
 *   `termsAccepted === true` en el servidor (campo persistido en Mongo).
 *
 * El banner NUNCA desaparece por sí solo ni se puede cerrar de ninguna otra
 * forma (sin botón de cerrar, sin cerrar al tocar fuera, sin tecla Esc): la
 * ÚNICA acción que lo hace desaparecer es pulsar "Accept and Continue", que
 * persiste termsAccepted=true en el servidor (POST /api/auth/accept-terms)
 * para esa cuenta. Mientras esté visible, cubre toda la pantalla con un
 * z-index muy alto, bloqueando cualquier interacción con el resto de la app.
 */
export default function ConsentBanner() {
  const { user, loading, updateUser } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  // Mientras el AuthContext no haya resuelto si hay sesión (loading), no se
  // decide nada todavía (evita mostrar/ocultar en falso durante el 1er render).
  const visible = !loading && !!user && user.termsAccepted !== true

  const accept = async () => {
    if (submitting || !user) return
    setSubmitting(true)
    try {
      const token = localStorage.getItem('twyk_token')
      await fetch('/api/auth/accept-terms', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch {
      // Si falla la red, no bloqueamos la UI local; el servidor seguirá
      // marcando termsAccepted=false y se reintentará en la próxima carga.
    }
    updateUser({ termsAccepted: true })
    setSubmitting(false)
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
