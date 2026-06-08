'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga async al abrir; falso positivo de la regla experimental. */

import { useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { Swords, Check, X, Loader2, User } from 'lucide-react'

/**
 * ActiveChallengesPage — Retos activos (premium minimalista, vista completa).
 * Cada solicitud de reto se muestra a pantalla completa (vídeo del retador de
 * fondo) y se desliza verticalmente entre retos. Se puede Aceptar (publica un
 * versus en el feed) o Rechazar.
 *
 * props: open, onClose, onAccepted(post), onChanged()
 */
const GOLD = '#E4C79B'

const RingAvatar = ({ src, ring }) => (
  <div className="w-11 h-11 rounded-full p-[2px] shrink-0" style={{ background: ring }}>
    <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center">
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <User className="w-5 h-5 text-white/70" />
      )}
    </div>
  </div>
)

const ChallengeSlide = ({ c, busy, onAccept, onReject }) => (
  <div className="relative w-full h-full bg-black overflow-hidden">
    {/* Fondo: vídeo del retador */}
    {c.challengerVideoUrl ? (
      <video
        src={c.challengerVideoUrl + '#t=0.3'}
        muted
        playsInline
        loop
        autoPlay
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover"
      />
    ) : (
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
    )}
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/40" />

    {/* Panel inferior premium */}
    <div className="absolute inset-x-0 bottom-0 z-10 px-4 pt-10"
         style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
      <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl p-4">
        {/* Participantes */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <RingAvatar src={c.from?.avatarUrl} ring={GOLD} />
            <div className="min-w-0">
              <p className="text-white font-semibold text-[14px] truncate">@{c.from?.username}</p>
              <p className="text-[12px] font-medium" style={{ color: GOLD }}>Listo</p>
            </div>
          </div>

          <span className="text-white/90 font-black text-base shrink-0">VS</span>

          <div className="flex items-center gap-2.5 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-white font-semibold text-[14px] truncate">@{c.to?.username}</p>
              <p className="text-[12px] font-medium text-zinc-400">Invitado</p>
            </div>
            <RingAvatar src={c.to?.avatarUrl} ring="rgba(255,255,255,0.25)" />
          </div>
        </div>

        {(c.message || c.targetDescription) && (
          <p className="text-[13.5px] text-zinc-200 mt-3 line-clamp-2">{c.message || c.targetDescription}</p>
        )}

        {/* Estado */}
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[12px] text-zinc-300">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: GOLD }} />
            Esperando · 1/2 listos
          </span>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onAccept(c)}
            disabled={busy}
            className="flex-1 h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-zinc-100 active:scale-[0.99] transition disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} strokeWidth={2.5} />}
            Aceptar
          </button>
          <button
            onClick={() => onReject(c)}
            disabled={busy}
            className="flex-1 h-12 rounded-full border border-white/20 text-white font-medium text-[15px] flex items-center justify-center gap-2 hover:bg-white/[0.06] active:scale-[0.99] transition disabled:opacity-50"
          >
            <X size={18} />
            Rechazar
          </button>
        </div>
      </div>
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
    <div className="fixed inset-0 z-[58] bg-[#0a0a0b] overflow-hidden">
      {/* Header — control segmentado (sobre el contenido) */}
      <div className="absolute top-0 left-0 right-0 z-40 px-6 pb-4 bg-gradient-to-b from-black/70 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1 rounded-full bg-black/40 border border-white/15 backdrop-blur-md">
            <button onClick={onClose} className="px-5 py-1.5 rounded-full text-[13px] font-medium text-zinc-200 hover:text-white transition">
              Completados
            </button>
            <button className="px-5 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black transition">
              Activos
            </button>
          </div>
        </div>
      </div>

      {/* Contenido a pantalla completa */}
      {loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-6">
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
        <Swiper
          direction="vertical"
          slidesPerView={1}
          spaceBetween={0}
          mousewheel
          keyboard
          modules={[Mousewheel, Keyboard]}
          className="w-full h-full"
        >
          {list.map((c) => (
            <SwiperSlide key={c.id}>
              <ChallengeSlide c={c} busy={busyId === c.id} onAccept={accept} onReject={reject} />
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </div>
  )
}
