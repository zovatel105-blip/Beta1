'use client'

import { useEffect, useState } from 'react'
import { Loader2, Check, ChevronDown } from 'lucide-react'
import { CreditIcon } from './WalletSheet'

/**
 * TipSheet — enviar una propina en créditos (Wallet, ver WalletSheet.jsx) a
 * otro creador. Petición del usuario: los créditos se usan para "dar
 * propina a otros creadores". Se abre desde el perfil ajeno (botón junto a
 * Seguir/Retar, ver ProfilePage.jsx).
 *
 * Props:
 *  - open, onClose
 *  - toUsername: string — a quién se le da la propina
 *  - onSent?: (newBalance) => void
 *  - onNeedCredits?: () => void — el usuario no tiene saldo suficiente y
 *    pulsó "Add credits" (abre WalletSheet desde el padre)
 */
function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

const PRESETS = [10, 50, 100, 500]

export default function TipSheet({ open, onClose, toUsername, onSent, onNeedCredits }) {
  const [balance, setBalance] = useState(null)
  const [amount, setAmount] = useState(50)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) { setSent(false); setError(null); setAmount(50); return }
    fetch('/api/wallet', { headers: authHeaders(), cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (data?.ok) setBalance(data.balance || 0) })
      .catch(() => {})
  }, [open])

  if (!open) return null

  const insufficient = balance !== null && amount > balance

  const send = async () => {
    if (busy || insufficient || amount < 1) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/wallet/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ toUsername, amount }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        setSent(true)
        setBalance(data.balance)
        onSent?.(data.balance)
        setTimeout(() => onClose?.(), 1400)
        return
      }
      setError(data?.message || 'Could not send tip')
    } catch {
      setError('Could not send tip')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div className="w-full sm:max-w-sm bg-[#0f0f11] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden">
        {/* Cerrar: flecha hacia abajo centrada (mismo patrón que el resto de
            hojas de la app), en vez de una X arriba a la derecha. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-full flex justify-center items-center pt-3 pb-1 active:scale-90 transition"
        >
          <ChevronDown size={20} className="text-zinc-500" strokeWidth={2.2} />
        </button>

        <div className="px-5 pb-5 space-y-4">
        <h2 className="text-white text-[17px] font-bold flex items-center gap-1.5">
          <CreditIcon size={16} /> Tip @{toUsername}
        </h2>

        {sent ? (
          <div className="py-8 flex flex-col items-center gap-2.5">
            <span className="w-12 h-12 rounded-full bg-emerald-400/15 flex items-center justify-center">
              <Check size={22} className="text-emerald-400" strokeWidth={2.6} />
            </span>
            <p className="text-white font-semibold text-[15px]">Tip sent!</p>
            <p className="text-zinc-400 text-[13px]">@{toUsername} received {amount} credits</p>
          </div>
        ) : (
          <>
            <p className="text-zinc-400 text-[13px]">
              Your balance: <span className="text-white font-semibold tabular-nums">{balance === null ? '…' : balance.toLocaleString()}</span> credits
            </p>

            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  className={`h-10 rounded-xl text-[13px] font-bold tabular-nums transition active:scale-95 ${
                    amount === p ? 'bg-white text-black' : 'bg-white/[0.06] text-zinc-300 border border-white/10'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-2 flex items-center gap-2">
              <CreditIcon size={16} />
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="flex-1 bg-transparent text-white text-[15px] font-semibold tabular-nums focus:outline-none"
              />
              <span className="text-zinc-500 text-[12.5px]">credits</span>
            </div>

            {insufficient && (
              <button
                type="button"
                onClick={onNeedCredits}
                className="w-full text-center text-[12.5px] text-amber-300 font-medium py-1"
              >
                Not enough credits — tap to add more
              </button>
            )}
            {error && <p className="text-red-400 text-[12.5px] text-center">{error}</p>}

            <button
              onClick={send}
              disabled={busy || insufficient || amount < 1}
              className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[15px] disabled:opacity-40 active:scale-[0.99] transition flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CreditIcon size={16} />}
              Send tip
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  )
}
