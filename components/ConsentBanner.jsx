'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const CONSENT_KEY = 'twyk_consent'

/**
 * ConsentBanner — Modal de consentimiento de cookies esenciales, centrado en
 * pantalla (estilo diálogo nativo). Aparece solo la PRIMERA vez que el
 * usuario visita la app (mientras no exista la preferencia en localStorage).
 * Al pulsar "Accept and continue" se guarda y no vuelve a aparecer.
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
    <div className="fixed inset-0 flex items-center justify-center px-5" style={{ zIndex: 11000 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-[380px] rounded-3xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="px-6 pt-7 pb-6 text-center">
          <p className="text-white/80 text-[15px] leading-relaxed">
            By tapping <span className="font-bold text-white">Accept and continue</span>, you agree to our{' '}
            <Link href="/terms" className="font-bold text-white underline-offset-2 hover:underline">Terms of Use</Link>
            {' '}and confirm you&apos;ve read our{' '}
            <Link href="/privacy" className="font-bold text-white underline-offset-2 hover:underline">Privacy Policy</Link>
            {' '}to see how we collect, use and share your data, and our{' '}
            <Link href="/privacy" className="font-bold text-white underline-offset-2 hover:underline">Cookie Policy</Link>
            {' '}to see how we use cookies.
          </p>
        </div>
        <button
          onClick={accept}
          className="w-full py-4 border-t border-white/10 text-white font-bold text-[15px] active:bg-white/5 transition-colors"
        >
          Accept and continue
        </button>
      </div>
    </div>
  )
}
