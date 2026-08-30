'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ArrowDownCircle, ArrowUpCircle, Gift, Check } from 'lucide-react'
import StripePaymentModal from './StripePaymentModal'

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
  const [error, setError] = useState(null)
  // Paquete actualmente en pago (abre el modal embebido de Stripe Elements,
  // ver StripePaymentModal.jsx) — petición del usuario: "que el pago se
  // efectúe desde un modal de la app, sin abrir una página de Stripe".
  const [payingPackage, setPayingPackage] = useState(null)
  const [justPurchased, setJustPurchased] = useState(false)

  const loadWallet = () => {
    setError(null)
    return fetch('/api/wallet', { headers: authHeaders(), cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setBalance(data.balance || 0)
          setTransactions(Array.isArray(data.transactions) ? data.transactions : [])
          setPackages(Array.isArray(data.packages) ? data.packages : [])
        } else {
          setError('Could not load your wallet')
        }
      })
      .catch(() => setError('Could not load your wallet'))
  }

  useEffect(() => {
    if (!open) return
    setLoading(true)
    loadWallet().finally(() => setLoading(false))
  }, [open])

  if (!open) return null

  // El pago se confirma DENTRO del modal (Stripe Elements) — el crédito
  // real lo otorga el webhook (payment_intent.succeeded), así que aquí solo
  // cerramos el modal, mostramos una confirmación breve y refrescamos el
  // saldo/historial poco después (el webhook suele tardar <2s en test mode).
  const handlePaymentSuccess = () => {
    setPayingPackage(null)
    setJustPurchased(true)
    setTimeout(() => setJustPurchased(false), 2500)
    loadWallet()
    setTimeout(loadWallet, 2000)
  }

  return (
    <div className="fixed inset-0 z-[95] bg-[#0a0a0b] flex flex-col text-white">
      {/* Header — mismo patrón que los drawers/menús del perfil (sticky,
          fondo translúcido + blur, borde inferior sutil white/[0.06]), sin
          el glow decorativo que no existe en ningún encabezado del perfil. */}
      <div className="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06]"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-1 px-2 pb-3">
          <button onClick={onClose} aria-label="Back" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-white">
            <ChevronLeft size={22} strokeWidth={1.75} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight">Wallet</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-8 space-y-5">
        {loading ? (
          // Mismo spinner exacto que usa ProfilePage.jsx en sus estados de carga
          // (grid, seguidores/siguiendo), en vez del icono Loader2 genérico.
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white animate-spin" />
          </div>
        ) : (
          <>
            {/* Saldo — 100% monocromático (petición del usuario), misma
                superficie que el resto de tarjetas del perfil
                (bg-white/[0.04], border-white/[0.07]), sin ningún degradado
                de marca. */}
            <div className="rounded-2xl p-5 text-center max-w-md mx-auto w-full bg-white/[0.04] border border-white/[0.07]">
              <p className="text-zinc-400 text-[12px] font-medium uppercase tracking-wide">Your balance</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <CreditIcon size={30} />
                <p className="text-white text-[36px] font-black tracking-tight tabular-nums">{balance.toLocaleString()}</p>
              </div>
              <p className="text-zinc-400 text-[12.5px] mt-0.5">credits</p>
            </div>

            {/* Confirmación breve tras un pago exitoso (el saldo de arriba se
                refresca solo unos segundos después, cuando el webhook ya
                otorgó los créditos). */}
            {justPurchased && (
              <div className="flex items-center justify-center gap-1.5 text-emerald-400 text-[12.5px] font-medium max-w-md mx-auto w-full">
                <Check size={14} strokeWidth={2.4} /> Payment successful — credits on their way
              </div>
            )}

            {/* Paquetes para comprar — mismas superficies que el resto del
                perfil (bg-white/[0.04], border-white/[0.07], rounded-2xl). */}
            <div className="max-w-md mx-auto w-full">
              <p className="text-zinc-400 text-[12px] font-semibold uppercase tracking-wide mb-2">Buy credits</p>
              <div className="grid grid-cols-2 gap-2.5">
                {packages.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPayingPackage(p)}
                    className="flex flex-col items-center justify-center gap-1 px-3 py-4 rounded-2xl border border-white/[0.07] bg-white/[0.04] hover:border-white/20 active:scale-[0.98] transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <CreditIcon size={16} />
                      <span className="text-white font-bold text-[16px] tabular-nums">{p.credits.toLocaleString()}</span>
                    </div>
                    <span className="text-zinc-500 text-[11px]">credits</span>
                    <span className="mt-1 text-[13px] font-bold text-white">
                      ${(p.amount / 100).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error — mismo rojo (red-400) que usa el perfil para sus
                mensajes de error y filas "danger" (Logout/Delete account). */}
            {error && <p className="text-red-400 text-[12.5px] text-center">{error}</p>}

            {/* Historial — misma tarjeta con lista dividida (bg-white/[0.04],
                border-white/[0.07], divide-white/[0.06]) que usa el drawer de
                invitado del perfil para Terms/Privacy/DMCA; iconos en círculo
                tenue bg-white/[0.06] text-zinc-300 (mismo tono "default" de
                SettingsRow) — sin verde/rojo financiero, solo blanco/zinc. */}
            <div className="max-w-md mx-auto w-full">
              <p className="text-zinc-400 text-[12px] font-semibold uppercase tracking-wide mb-2">Activity</p>
              {transactions.length === 0 ? (
                <div className="text-center py-6">
                  <span className="w-11 h-11 rounded-full bg-white/[0.06] text-zinc-300 flex items-center justify-center mx-auto mb-2">
                    <Gift size={18} strokeWidth={1.7} />
                  </span>
                  <p className="text-zinc-500 text-[12.5px]">No activity yet</p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
                  {transactions.map((tx) => {
                    const positive = tx.amount > 0
                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-white/[0.06] text-zinc-300">
                          {positive ? (
                            <ArrowDownCircle size={16} strokeWidth={1.8} />
                          ) : (
                            <ArrowUpCircle size={16} strokeWidth={1.8} />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-[14px] font-medium truncate">{formatTxLabel(tx)}</p>
                          <p className="text-zinc-500 text-[11.5px]">{formatTxTime(tx.createdAt)}</p>
                        </div>
                        <span className="flex items-center gap-1 text-[13px] font-bold tabular-nums text-white shrink-0">
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

      <StripePaymentModal
        open={!!payingPackage}
        onClose={() => setPayingPackage(null)}
        endpoint="/api/wallet/payment-intent"
        body={{ packageKey: payingPackage?.key }}
        title={payingPackage ? `${payingPackage.credits.toLocaleString()} credits — $${(payingPackage.amount / 100).toFixed(2)}` : ''}
        submitLabel={payingPackage ? `Pay $${(payingPackage.amount / 100).toFixed(2)}` : 'Pay now'}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
