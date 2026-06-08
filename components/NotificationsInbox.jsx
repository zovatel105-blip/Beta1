'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga de notificaciones en useEffect al abrir; falso positivo de la regla experimental. */

import { useEffect, useState } from 'react'
import { Bell, Swords, Heart, UserPlus, MessageCircle, Check, ChevronLeft } from 'lucide-react'
import { MOCK_NOTIFICATIONS } from '@/lib/notifications'

/**
 * NotificationsInbox — Página de notificaciones (diseño premium minimalista, móvil).
 *
 * props:
 *   open    bool
 *   onClose () => void
 */
const iconFor = (type) => {
  switch (type) {
    case 'challenge': return { Icon: Swords, color: '#E4C79B' }
    case 'vote': return { Icon: Heart, color: '#F87186' }
    case 'accepted': return { Icon: Check, color: '#6EE7A8' }
    case 'follow': return { Icon: UserPlus, color: '#7DB7FF' }
    case 'comment': return { Icon: MessageCircle, color: '#E4C79B' }
    default: return { Icon: Bell, color: '#A1A1AA' }
  }
}

export default function NotificationsInbox({ open, onClose }) {
  const [list, setList] = useState([])

  useEffect(() => {
    if (open) setList(MOCK_NOTIFICATIONS)
  }, [open])

  if (!open) return null

  const markAllRead = () => setList((prev) => prev.map((n) => ({ ...n, read: true })))
  const hasUnread = list.some((n) => !n.read)

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0b] flex flex-col text-white">
      {/* Glow superior sutil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(214,178,122,0.07), transparent 70%)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-1">
          <button onClick={onClose} aria-label="Volver" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-white">
            <ChevronLeft size={22} strokeWidth={1.75} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight">Notificaciones</h1>
        </div>
        {hasUnread && (
          <button onClick={markAllRead} className="text-[13px] font-medium text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/5 transition">
            Marcar leídas
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-10">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-32">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6"
                 style={{ boxShadow: '0 0 48px -14px rgba(214,178,122,0.4)' }}>
              <Bell className="w-9 h-9" strokeWidth={1.25} style={{ color: '#E4C79B' }} />
            </div>
            <h2 className="text-white text-[22px] font-semibold tracking-tight">Sin notificaciones</h2>
            <p className="text-zinc-400 text-[15px] mt-2 max-w-[16rem] leading-relaxed">
              Cuando haya actividad en tus retos, aparecerá aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1">
            {list.map((n) => {
              const { Icon, color } = iconFor(n.type)
              return (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition ${
                    n.read ? 'hover:bg-white/[0.03]' : 'bg-white/[0.04] border border-white/[0.06]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img src={n.user?.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover ring-1 ring-white/10" />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-zinc-900 border border-white/10">
                      <Icon size={11} style={{ color }} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] text-white leading-snug">
                      <span className="font-semibold">@{n.user?.username}</span>{' '}
                      <span className="text-zinc-300">{n.text}</span>
                    </p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">{n.time}</p>
                  </div>
                  {!n.read && <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: '#E4C79B' }} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
