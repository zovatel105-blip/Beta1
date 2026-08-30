'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Lock } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'

/**
 * StripePaymentModal — modal de pago EMBEBIDO (Stripe Elements / Payment
 * Element) reutilizable por WalletSheet.jsx (pago único, créditos) y
 * AIBillingSheet.jsx (suscripción mensual del editor de IA). Petición
 * explícita del usuario: "que el pago se efectúe desde un modal de la app,
 * sin abrir una página de Stripe" — antes ambas hojas redirigían a una
 * Checkout Session hospedada (`window.location.href = data.url`); ahora la
 * tarjeta se introduce AQUÍ MISMO, sin salir nunca de la app (solo se
 * ofrece 'card' como método de pago, que nunca requiere redirect).
 *
 * Props:
 *  - open, onClose
 *  - kind: 'wallet' | 'subscription'
 *  - endpoint: string — POST que crea el PaymentIntent/Subscription y
 *    devuelve { clientSecret } (ver /api/wallet/payment-intent,
 *    /api/stripe/subscription)
 *  - body: object — body del POST anterior (ej. {packageKey} o {plan})
 *  - title: string — cabecera del modal (ej. "150 credits — $0.99")
 *  - submitLabel: string — texto del botón de pago
 *  - onSuccess: () => void — pago confirmado (el crédito/suscripción real
 *    se otorga vía webhook en el backend, esto solo cierra el modal y
 *    avisa al padre para refrescar sus datos)
 */
function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

let stripePromiseSingleton = null
function getStripePromise() {
  if (!stripePromiseSingleton) {
    stripePromiseSingleton = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
  }
  return stripePromiseSingleton
}

// Tema oscuro monocromático de Stripe Elements, alineado con el resto de la
// app (fondos casi negros, texto blanco/zinc, sin colores de marca sueltos
// — mismo criterio ya aplicado al rediseño de WalletSheet.jsx).
const STRIPE_APPEARANCE = {
  theme: 'night',
  variables: {
    colorPrimary: '#ffffff',
    colorBackground: '#141416',
    colorText: '#ffffff',
    colorTextSecondary: '#a1a1aa',
    colorDanger: '#f87171',
    fontFamily: 'inherit',
    borderRadius: '12px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
    '.Input:focus': { border: '1px solid rgba(255,255,255,0.3)', boxShadow: 'none' },
    '.Tab': { border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
    '.Tab--selected': { border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.08)' },
    '.Label': { color: '#a1a1aa' },
  },
}

function PaymentForm({ submitLabel, onSuccess, onClose }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements || busy) return
    setBusy(true)
    setError(null)
    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message || 'Check your payment details')
        setBusy(false)
        return
      }
      // redirect:'if_required' + solo 'card' en el backend -> en la práctica
      // NUNCA redirige (tarjeta se confirma inline). Sin return_url real
      // porque no debería usarse, pero Stripe lo exige como parámetro.
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      })
      if (confirmError) {
        setError(confirmError.message || 'Payment failed')
        setBusy(false)
        return
      }
      if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
        onSuccess?.()
        return
      }
      setError('Payment could not be completed')
      setBusy(false)
    } catch {
      setError('Payment failed, please try again')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && <p className="text-red-400 text-[12.5px] text-center">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || !elements || busy}
        className="w-full h-12 rounded-full bg-white text-black font-bold text-[15px] disabled:opacity-40 active:scale-[0.99] transition flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={14} strokeWidth={2.2} />}
        {submitLabel}
      </button>
      <p className="flex items-center justify-center gap-1 text-zinc-500 text-[11px]">
        <Lock size={10} /> Secured by Stripe — your card details never touch our servers
      </p>
    </form>
  )
}

export default function StripePaymentModal({ open, onClose, endpoint, body, title, submitLabel = 'Pay now', onSuccess }) {
  const [clientSecret, setClientSecret] = useState(null)
  const [error, setError] = useState(null)
  const stripePromise = useMemo(() => getStripePromise(), [])

  useEffect(() => {
    if (!open) { setClientSecret(null); setError(null); return }
    let cancelled = false
    fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body || {}),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (ok && data?.clientSecret) {
          setClientSecret(data.clientSecret)
        } else {
          setError(data?.message || 'Could not start payment')
        }
      })
      .catch(() => { if (!cancelled) setError('Could not start payment') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, endpoint, JSON.stringify(body || {})])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[99] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="w-full sm:max-w-sm bg-[#0f0f11] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white text-[16px] font-bold truncate pr-2">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-90 transition text-zinc-400 hover:text-white"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        </div>

        {error ? (
          <p className="text-red-400 text-[13px] text-center py-6">{error}</p>
        ) : !clientSecret ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 rounded-full border-2 border-white/10 border-t-white animate-spin" />
          </div>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: STRIPE_APPEARANCE }}>
            <PaymentForm submitLabel={submitLabel} onSuccess={onSuccess} onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>
  )
}
