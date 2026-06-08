'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga de notificaciones en useEffect al abrir; falso positivo de la regla experimental. */

import { useEffect, useState } from 'react'
import { Bell, Swords, Heart, UserPlus, MessageCircle, Check, ChevronLeft } from 'lucide-react'
import { MOCK_NOTIFICATIONS } from '@/lib/notifications'

/**
 * NotificationsInbox — Página de notificaciones general.
 * Reemplaza a la antigua bandeja de retos (que ahora vive en "Retos activos").
 * Muestra notificaciones simuladas: votos, retos, aceptaciones, seguidores y comentarios.
 *
 * props:
 *   open    bool
 *   onClose () => void
 */
const iconFor = (type) => {
  switch (type) {
    case 'challenge': return { Icon: Swords, bg: 'linear-gradient(135deg, #A855F7, #3B82F6)' }
    case 'vote': return { Icon: Heart, bg: 'linear-gradient(135deg, #EF4444, #EC4899)' }
    case 'accepted': return { Icon: Check, bg: 'linear-gradient(135deg, #22C55E, #16A34A)' }
    case 'follow': return { Icon: UserPlus, bg: 'linear-gradient(135deg, #3B82F6, #06B6D4)' }
    case 'comment': return { Icon: MessageCircle, bg: 'linear-gradient(135deg, #F59E0B, #F97316)' }
    default: return { Icon: Bell, bg: 'linear-gradient(135deg, #71717A, #52525B)' }
  }
}

export default function NotificationsInbox({ open, onClose }) {
  const [list, setList] = useState([])

  useEffect(() => {
    if (open) setList(MOCK_NOTIFICATIONS)
  }, [open])

  if (!open) return null

  const markAllRead = () => setList((prev) => prev.map((n) => ({ ...n, read: true })))

  return (
    <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col text-white">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
          <div className="flex items-center gap-1.5">
            <button onClick={onClose} aria-label="Volver" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/10 text-white">
              <ChevronLeft size={22} />
            </button>
            <h2 className="font-bold text-base text-white">Notificaciones</h2>
          </div>
          <button onClick={markAllRead} className="text-xs font-semibold text-white/60 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/10">
            Marcar leídas
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Bell className="w-8 h-8 text-white/40" />
              </div>
              <p className="text-white font-semibold">No tienes notificaciones todavía</p>
              <p className="text-white/50 text-sm mt-1">Cuando haya actividad en tus retos, aparecerá aquí.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {list.map((n) => {
                const { Icon, bg } = iconFor(n.type)
                return (
                  <div
                    key={n.id}
                    className={`flex items-center gap-3 px-4 py-3 ${n.read ? '' : 'bg-white/[0.04]'}`}
                  >
                    <div className="relative shrink-0">
                      <img src={n.user?.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                      <span
                        className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-950"
                        style={{ background: bg }}
                      >
                        <Icon size={11} className="text-white" />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white leading-snug">
                        <span className="font-bold">@{n.user?.username}</span>{' '}
                        <span className="text-white/80">{n.text}</span>
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">{n.time}</p>
                    </div>
                    {!n.read && <span className="shrink-0 w-2.5 h-2.5 bg-purple-500 rounded-full" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
    </div>
  )
}
