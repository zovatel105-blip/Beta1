'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Cookie } from 'lucide-react'

const CONSENT_KEY = 'twyk_consent'

/**
 * ConsentBanner — Banner de consentimiento de cookies esenciales.
 * Aparece solo la PRIMERA vez que el usuario visita la app (mientras no exista
 * la preferencia en localStorage). Al pulsar "Entendido" se guarda y no vuelve
 * a aparecer.
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_KEY) !== 'accepted') {
        setVisible(true)
      }
    } catch {
      // Si localStorage no está disponible, no mostramos el banner.
    }
  }, [])

  const accept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted')
    } catch { /* ignore */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 px-4 pb-4 flex justify-center"
      style={{ zIndex: 11000 }}
    >
      <div className="w-full max-w-[640px] rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="w-5 h-5 text-white/70 shrink-0 mt-0.5" strokeWidth={1.7} />
          <p className="text-white/75 text-[13px] leading-relaxed">
            Twyk uses essential cookies to work. By continuing, you accept our{' '}
            <Link href="/privacy" className="underline text-white hover:text-white/80">Privacy Policy</Link>.
          </p>
        </div>
        <button
          onClick={accept}
          className="shrink-0 px-5 py-2.5 rounded-full bg-white text-black text-[13px] font-semibold hover:bg-white/90 active:scale-95 transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
