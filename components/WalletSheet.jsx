'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, ArrowDownCircle, ArrowUpCircle, Gift } from 'lucide-react'

/**
 * WalletSheet — Cartera de créditos (moneda virtual NUEVA, separada de los
 * créditos del editor de fotos con IA/AIBillingSheet.jsx). Petición del
 * usuario: "cartera con creditos en el menu de los ajustes del perfil",
 * usada para dar propina a otros creadores (ver TipSheet.jsx).
 *
 * Petición del usuario: "el wallet debe abrir una pagina no un modal" ->
 * pantalla completa (mismo patrón que NotificationsInbox.jsx: fixed
 * inset-0, header con flecha "Atrás", cuerpo con scroll), no un bottom
 * sheet/modal como antes. También: "la moneda debe tener el logo de twyk"
 * -> el icono de "crédito" en toda la app (saldo, paquetes, historial) es
 * el logo real (`/branding/twyk-logo.png`), no un icono genérico de
 * monedas.
 *
 * Muestra: saldo actual, paquetes para comprar más créditos (pago ÚNICO
 * vía Stripe Checkout, ver POST /api/wallet/checkout) e historial de
 * movimientos (compras/propinas enviadas/recibidas).
 *
 * Props:
 *  - open, onClose
 */
function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

// Icono de la moneda/crédito en toda la app — el usuario, tras ver varias
// opciones, respondió directamente con el emoji 🪙: se usa ESE emoji
// nativo (nítido a cualquier tamaño, sin depender de ninguna imagen
// externa ni de la marca Twyk) como icono de crédito en toda la app.
export function CreditIcon({ size = 16, className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size, lineHeight: 1 }}
      role="img"
      aria-label="credits"
    >
      🪙
    </span>
  )
}

function formatTxLabel(tx) {
  if (tx.type === 'purchase') return 'Credits purchased'
  if (tx.type === 'tip_sent') return `Tip to @${tx.counterpartyUsername || 'user'}`
  if (tx.type === 'tip_received') return `Tip from @${tx.counterpartyUsername || 'user'}`
  return 'Wallet activity'
}

function formatTxTime(iso) {
  try {
    const d = new Date(iso)
    const now = Date.now()
    const diffMin = Math.floor((now - d.getTime()) / 60000)
    if (diffMin < 1) return 'now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 30) return `${diffD}d ago`
    return d.toLocaleDateString()
  } catch {
    return ''
  }
}

export default function WalletSheet({ open, onClose }) {
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [packages, setPackages] = useState([])
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/wallet', { headers: authHeaders(), cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.ok) {
          setBalance(data.balance || 0)
          setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
          setPackages(Array.isArray(data.packages) ? data.packages : [])
        } else {
          setError('Could not load your wallet')
        }
      })
      .catch(() => { if (!cancelled) setError('Could not load your wallet') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  if (!open) return null

  const buy = async (packageKey) => {
    if (busyKey) return
    setBusyKey(packageKey)
    setError(null)
    try {
      const res = await fetch('/api/wallet/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ packageKey }),
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

  return (
    <div className="fixed inset-0 z-[95] bg-[#0a0a0b] flex flex-col text-white">
      {/* Glow superior sutil (mismo estilo que NotificationsInbox.jsx) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(168,85,247,0.10), transparent 70%)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-1 px-2 pb-3"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <button onClick={onClose} aria-label="Back" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-white">
          <ChevronLeft size={22} strokeWidth={1.75} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight">Wallet</h1>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-8 space-y-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-white/70" />
          </div>
        ) : (
          <>
            {/* Saldo */}
            <div className="rounded-2xl p-5 text-center max-w-md mx-auto w-full" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.16), rgba(59,130,246,0.16))', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-zinc-400 text-[12px] font-medium uppercase tracking-wide">Your balance</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <CreditIcon size={30} />
                <p className="text-white text-[36px] font-black tracking-tight tabular-nums">{balance.toLocaleString()}</p>
              </div>
              <p className="text-zinc-400 text-[12.5px] mt-0.5">credits</p>
            </div>

            {/* Paquetes para comprar */}
            <div className="max-w-md mx-auto w-full">
              <p className="text-zinc-400 text-[12px] font-semibold uppercase tracking-wide mb-2">Buy credits</p>
              <div className="grid grid-cols-2 gap-2.5">
                {packages.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => buy(p.key)}
                    disabled={!!busyKey}
                    className="flex flex-col items-center justify-center gap-1 px-3 py-4 rounded-2xl border border-white/10 bg-white/[0.04] hover:border-white/25 active:scale-[0.98] transition disabled:opacity-60"
                  >
                    <div className="flex items-center gap-1.5">
                      <CreditIcon size={16} />
                      <span className="text-white font-bold text-[16px] tabular-nums">{p.credits.toLocaleString()}</span>
                    </div>
                    <span className="text-zinc-500 text-[11px]">credits</span>
                    <span className="mt-1 text-[13px] font-bold" style={{ color: '#A855F7' }}>
                      {busyKey === p.key ? <Loader2 size={14} className="animate-spin inline text-white" /> : `$${(p.amount / 100).toFixed(2)}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-rose-400 text-[12.5px] text-center">{error}</p>}

            {/* Historial */}
            <div className="max-w-md mx-auto w-full">
              <p className="text-zinc-400 text-[12px] font-semibold uppercase tracking-wide mb-2">Activity</p>
              {transactions.length === 0 ? (
                <div className="text-center py-6">
                  <Gift size={22} className="text-zinc-600 mx-auto mb-1.5" strokeWidth={1.5} />
                  <p className="text-zinc-500 text-[12.5px]">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {transactions.map((tx) => {
                    const positive = tx.amount > 0
                    return (
                      <div key={tx.id} className="flex items-center gap-2.5 py-2">
                        {positive ? (
                          <ArrowDownCircle size={18} className="text-emerald-400 shrink-0" strokeWidth={1.8} />
                        ) : (
                          <ArrowUpCircle size={18} className="text-zinc-400 shrink-0" strokeWidth={1.8} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[13px] font-medium truncate">{formatTxLabel(tx)}</p>
                          <p className="text-zinc-500 text-[11px]">{formatTxTime(tx.createdAt)}</p>
                        </div>
                        <span className={`flex items-center gap-1 text-[13px] font-bold tabular-nums shrink-0 ${positive ? 'text-emerald-400' : 'text-zinc-300'}`}>
                          {positive ? '+' : ''}{tx.amount.toLocaleString()}
                          <CreditIcon size={13} />
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
