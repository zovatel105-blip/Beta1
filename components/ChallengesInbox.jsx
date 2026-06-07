'use client'

import { useEffect, useState } from 'react'
import { X, Swords, Check, Loader2, Inbox } from 'lucide-react'

/**
 * ChallengesInbox — Bandeja de retos (solicitudes de enfrentamiento).
 * Muestra los retos pendientes. Cada uno se puede Aceptar (se publica como
 * versus y aparece en el feed) o Cancelar (se descarta).
 *
 * props:
 *   open        bool
 *   onClose     () => void
 *   onAccepted  (post) => void   // publica el versus en el feed
 *   onChanged   () => void       // refresca el contador del badge
 */
export default function ChallengesInbox({ open, onClose, onAccepted, onChanged }) {
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl bg-zinc-950 border border-white/10 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #A855F7, #3B82F6)' }}>
              <Swords size={16} className="text-white" />
            </div>
            <h2 className="font-bold text-base text-white">Retos recibidos</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-white" /></div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Inbox className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white font-semibold">No tienes retos pendientes</p>
              <p className="text-white/50 text-sm mt-1">Cuando alguien te rete, aparecerá aquí.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {list.map((c) => (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <img src={c.from?.avatarUrl} className="w-8 h-8 rounded-full object-cover" alt="" />
                    <div className="text-sm text-white">
                      <span className="font-bold">@{c.from?.username}</span> te ha retado
                    </div>
                  </div>

                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 aspect-[9/16] rounded-xl overflow-hidden relative bg-zinc-900">
                      <span className="absolute top-1 left-1 z-10 text-[10px] font-bold bg-black/50 rounded-full px-1.5" style={{ color: '#C084FC' }}>@{c.from?.username}</span>
                      {c.challengerVideoUrl && (
                        <video src={c.challengerVideoUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex items-center text-white/60 font-black text-xs">VS</div>
                    <div className="flex-1 aspect-[9/16] rounded-xl overflow-hidden relative bg-zinc-900">
                      <span className="absolute top-1 left-1 z-10 text-[10px] font-bold bg-black/50 rounded-full px-1.5" style={{ color: '#60A5FA' }}>@{c.to?.username}</span>
                      {c.targetVideoUrl && (
                        <video src={c.targetVideoUrl + '#t=0.2'} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                    </div>
                  </div>

                  {c.message && (
                    <p className="text-xs text-white/70 mt-2 italic">“{c.message}”</p>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => reject(c)}
                      disabled={busyId === c.id}
                      className="flex-1 rounded-full py-2.5 text-sm font-bold text-white bg-white/10 hover:bg-white/20 active:scale-[0.98] transition disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => accept(c)}
                      disabled={busyId === c.id}
                      className="flex-1 rounded-full py-2.5 text-sm font-bold text-white active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                      style={{ background: 'linear-gradient(90deg, #A855F7, #3B82F6)' }}
                    >
                      {busyId === c.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Aceptar reto
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
