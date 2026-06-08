'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga async en useEffect (carga inicial); falso positivo de la regla experimental. */

import { useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { Swords, ChevronLeft, Check, X, Loader2, User } from 'lucide-react'

/**
 * ActiveChallengesPage — Retos activos.
 * Aquí aparecen ahora las SOLICITUDES de reto (antes en la bandeja).
 * Cada reto se muestra como una tarjeta a pantalla completa (vídeo del retador
 * de fondo) con: participantes (Listo / Invitado), VS, estado "ESPERANDO 1/2
 * listos" y botones Aceptar (verde) / Rechazar.
 * Aceptar publica el versus en el feed; Rechazar lo descarta.
 *
 * props:
 *   open        bool
 *   onClose     () => void
 *   onAccepted  (post) => void  // publica el versus en el feed
 *   onChanged   () => void      // refresca el contador del badge
 */

// Avatar circular con anillo de estado.
const RingAvatar = ({ src, ring }) => (
  <div className="w-14 h-14 rounded-full p-[3px]" style={{ background: ring }}>
    <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center">
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <User className="w-6 h-6 text-white/70" />
      )}
    </div>
  </div>
)

const ChallengeCard = ({ c, busy, onAccept, onReject }) => (
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
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-blue-900" />
    )}
    {/* Overlay para legibilidad */}
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />

    {/* Contenido inferior */}
    <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-28 pt-10">
      {/* Participantes */}
      <div className="flex items-center justify-between gap-3 bg-black/45 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/10">
        {/* Retador (Listo) */}
        <div className="flex items-center gap-2 min-w-0">
          <RingAvatar src={c.from?.avatarUrl} ring="#22C55E" />
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">@{c.from?.username}</p>
            <p className="text-green-400 text-xs font-semibold">Listo</p>
          </div>
        </div>

        <span className="text-white font-black text-lg shrink-0">VS</span>

        {/* Retado (Invitado) */}
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <div className="min-w-0 text-right">
            <p className="text-white font-bold text-sm truncate">@{c.to?.username}</p>
            <p className="text-blue-400 text-xs font-semibold">Invitado</p>
          </div>
          <RingAvatar src={c.to?.avatarUrl} ring="#3B82F6" />
        </div>
      </div>

      {/* Título / mensaje */}
      {(c.message || c.targetDescription) && (
        <p className="text-white/90 text-sm mt-3 line-clamp-2">{c.message || c.targetDescription}</p>
      )}

      {/* Estado */}
      <div className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
           style={{ background: 'linear-gradient(90deg, #F59E0B, #F97316)' }}>
        <span className="text-white font-bold text-xs tracking-wide">ESPERANDO</span>
        <span className="text-white/90 text-xs">· 1/2 listos</span>
      </div>

      {/* Botones */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => onAccept(c)}
          disabled={busy}
          className="flex-1 rounded-full py-3.5 font-bold text-white bg-green-500 hover:bg-green-600 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          Aceptar
        </button>
        <button
          onClick={() => onReject(c)}
          disabled={busy}
          className="flex-1 rounded-full py-3.5 font-bold text-white bg-zinc-700 hover:bg-zinc-600 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <X size={18} />
          Rechazar
        </button>
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
    <div className="fixed inset-0 z-[58] bg-black overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center gap-3 px-3 py-3 bg-gradient-to-b from-black/80 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <button
          onClick={onClose}
          aria-label="Volver"
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 flex items-center justify-center text-white active:scale-95 transition"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-white text-lg font-bold flex items-center gap-2">
          <Swords className="w-5 h-5 text-purple-400" />
          Retos activos
          {list.length > 0 && (
            <span className="text-xs font-bold bg-purple-500 text-white rounded-full px-2 py-0.5">{list.length}</span>
          )}
        </h1>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 mb-5 rounded-full bg-zinc-800 flex items-center justify-center">
            <Swords className="w-10 h-10 text-zinc-500" strokeWidth={1.5} />
          </div>
          <h2 className="font-bold text-white text-2xl">Sin retos activos</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-xs">
            Cuando alguien te rete, la solicitud aparecerá aquí para que la aceptes o la rechaces.
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
              <ChallengeCard
                c={c}
                busy={busyId === c.id}
                onAccept={accept}
                onReject={reject}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </div>
  )
}
