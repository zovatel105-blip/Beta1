'use client'

import { useState } from 'react'
import { X, Sparkles, Check, Loader2, Settings } from 'lucide-react'

/**
 * AIBillingSheet — paywall del editor de fotos con GEMINI (petición del
 * usuario: "quiero que agregues Gemini pero los usuarios tendran que pagar
 * para poder usar ese editor individualmente" + "como larpgpt" + "Agnes
 * gratuita, Gemini pago"). Suscripción MENSUAL por niveles (ver AI_PLANS en
 * lib/stripe.js: Starter/Pro/Unlimited), igual que LarpGPT. Agnes sigue
 * gratis/ilimitado siempre, sin relación con esta hoja.
 *
 * Props:
 *  - open, onClose
 *  - plans: [{ key, label, amount, credits }] (viene de GET /api/billing/status)
 *  - currentPlan: string|null — plan activo actual (resalta esa tarjeta)
 */
export default function AIBillingSheet({ open, onClose, plans = [], currentPlan = null }) {
  const [busyKey, setBusyKey] = useState(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!open) return null

  const subscribe = async (planKey) => {
    if (busyKey) return
    setBusyKey(planKey)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planKey }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        window.location.href = data.url
        return
      }
      setError('Could not start checkout, please try again')
    } catch {
      setError('Could not start checkout, please try again')
    } finally {
      setBusyKey(null)
    }
  }

  const openPortal = async () => {
    if (portalBusy) return
    setPortalBusy(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.url) {
        window.location.href = data.url
        return
      }
    } finally {
      setPortalBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="w-full sm:max-w-sm bg-[#0f0f11] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-[17px] font-bold flex items-center gap-1.5">
            <Sparkles size={16} className="text-white/80" /> Gemini AI Editor
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition text-zinc-400 hover:text-white"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>
        <p className="text-zinc-400 text-[13px] leading-snug">
          Subscribe to edit your photos with Google Gemini (Nano Banana). Agnes stays free and unlimited either way.
        </p>

        <div className="space-y-2.5">
          {plans.map((p) => {
            const isCurrent = currentPlan === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => subscribe(p.key)}
                disabled={!!busyKey || isCurrent}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition active:scale-[0.99] disabled:active:scale-100 ${
                  isCurrent ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                } disabled:opacity-70`}
              >
                <div className="text-left">
                  <p className="text-white font-bold text-[15px]">{p.label}</p>
                  <p className="text-zinc-400 text-[12.5px] mt-0.5">
                    {p.credits === null ? 'Unlimited edits / month' : `${p.credits} edits / month`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-white font-bold text-[17px]">
                    ${p.amount}<span className="text-zinc-400 text-[12px] font-medium">/mo</span>
                  </span>
                  {busyKey === p.key ? (
                    <Loader2 size={16} className="animate-spin text-white" />
                  ) : isCurrent ? (
                    <Check size={16} className="text-emerald-400" strokeWidth={2.5} />
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>

        {error && <p className="text-rose-400 text-[12.5px] text-center">{error}</p>}

        {currentPlan && (
          <button
            onClick={openPortal}
            disabled={portalBusy}
            className="w-full flex items-center justify-center gap-1.5 text-zinc-400 hover:text-white text-[13px] font-medium py-2 transition disabled:opacity-60"
          >
            {portalBusy ? <Loader2 size={13} className="animate-spin" /> : <Settings size={13} />}
            Manage billing
          </button>
        )}
      </div>
    </div>
  )
}
