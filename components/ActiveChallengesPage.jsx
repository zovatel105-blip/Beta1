'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga async al abrir; falso positivo de la regla experimental. */

import { useEffect, useState } from 'react'
import { Swords, Check, X, Loader2, User } from 'lucide-react'

/**
 * ActiveChallengesPage — Retos activos (diseño premium minimalista, móvil).
 * Aquí aparecen las SOLICITUDES de reto pendientes. Cada una se puede Aceptar
 * (se publica como versus en el feed) o Rechazar.
 *
 * props:
 *   open        bool
 *   onClose     () => void   // vuelve a "Completados"
 *   onAccepted  (post) => void
 *   onChanged   () => void
 */
const GOLD = '#E4C79B'

const Side = ({ url, author, label, labelColor }) => (
  <div className="relative flex-1 aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-900 ring-1 ring-white/[0.06]">
    {url ? (
      <video src={url + '#t=0.3'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
    ) : (
      <div className="absolute inset-0 bg-zinc-800" />
    )}
    <div className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/85 to-transparent">
      <div className="flex items-center gap-1.5">
        {author?.avatarUrl ? (
          <img src={author.avatarUrl} className="w-5 h-5 rounded-full object-cover" alt="" />
        ) : (
          <span className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center"><User size={11} className="text-white/70" /></span>
        )}
        <span className="text-[11px] font-semibold text-white truncate">@{author?.username}</span>
      </div>
      <span className="text-[10px] font-semibold" style={{ color: labelColor }}>{label}</span>
    </div>
  </div>
)

const ChallengeCard = ({ c, busy, onAccept, onReject }) => (
  <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] p-3">
    {/* Preview versus */}
    <div className="relative flex gap-2">
      <Side url={c.challengerVideoUrl} author={c.from} label="Listo" labelColor={GOLD} />
      <Side url={c.targetVideoUrl} author={c.to} label="Invitado" labelColor="#A1A1AA" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#0a0a0b] border border-white/15 flex items-center justify-center text-white font-black text-[11px]">VS</div>
    </div>

    {(c.message || c.targetDescription) && (
      <p className="text-[13.5px] text-zinc-300 text-center mt-3 line-clamp-2">{c.message || c.targetDescription}</p>
    )}

    {/* Estado */}
    <div className="flex justify-center mt-3">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[12px] text-zinc-300">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
        Esperando · 1/2 listos
      </span>
    </div>

    {/* Acciones */}
    <div className="flex gap-2 mt-4">
      <button
        onClick={() => onAccept(c)}
        disabled={busy}
        className="flex-1 h-11 rounded-full bg-white text-black font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
        Aceptar
      </button>
      <button
        onClick={() => onReject(c)}
        disabled={busy}
        className="flex-1 h-11 rounded-full border border-white/15 text-white font-medium text-[14px] flex items-center justify-center gap-1.5 hover:bg-white/[0.04] active:scale-[0.99] transition disabled:opacity-50"
      >
        <X size={16} />
        Rechazar
      </button>
    </div>
  </div>
)

export default function ActiveChallengesPage({ open, onClose, onAccepted, onChanged }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      const data = await res.json()
      setList(data.challenges || [])
    } catch { setList([]) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  if (!open) return null

  const accept = async (c) => {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/challenges/${c.id}/accept`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setList((prev) => prev.filter((x) => x.id !== c.id))
        if (onAccepted && data?.post) onAccepted(data.post)
        if (onChanged) onChanged()
      }
    } catch { /* ignore */ } finally { setBusyId(null) }
  }

  const reject = async (c) => {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/challenges/${c.id}/reject`, { method: 'POST' })
      if (res.ok) {
        setList((prev) => prev.filter((x) => x.id !== c.id))
        if (onChanged) onChanged()
      }
    } catch { /* ignore */ } finally { setBusyId(null) }
  }

  return (
    <div className="fixed inset-0 z-[58] bg-[#0a0a0b] flex flex-col text-white">
      {/* Glow superior sutil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(214,178,122,0.08), transparent 70%)' }} />

      {/* Header — control segmentado */}
      <div className="relative z-10 px-6 pb-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md">
            <button onClick={onClose} className="px-5 py-1.5 rounded-full text-[13px] font-medium text-zinc-300 hover:text-white transition">
              Completados
            </button>
            <button className="px-5 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black transition">
              Activos
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="relative z-10 flex-1 overflow-y-auto px-5 pb-28">
        {loading ? (
          <div className="flex justify-center pt-32"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-28">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6"
                 style={{ boxShadow: '0 0 48px -14px rgba(214,178,122,0.42)' }}>
              <Swords className="w-9 h-9" strokeWidth={1.25} style={{ color: GOLD }} />
            </div>
            <h2 className="text-white text-[22px] font-semibold tracking-tight">Sin retos activos</h2>
            <p className="text-zinc-400 text-[15px] mt-2 max-w-[17rem] leading-relaxed">
              Cuando alguien te rete, la solicitud aparecerá aquí para aceptarla o rechazarla.
            </p>
          </div>
        ) : (
          <div className="max-w-md mx-auto pt-1">
            <p className="text-zinc-400 text-[12px] uppercase tracking-[0.14em] font-medium mb-3">
              {list.length} {list.length === 1 ? 'reto pendiente' : 'retos pendientes'}
            </p>
            <div className="space-y-4">
              {list.map((c) => (
                <ChallengeCard key={c.id} c={c} busy={busyId === c.id} onAccept={accept} onReject={reject} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
