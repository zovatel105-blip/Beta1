'use client'

import { useEffect, useState } from 'react'
import { Bell, Swords, UserPlus, MessageCircle, Check, ChevronLeft } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'
import Avatar from './Avatar'
import { useAuth } from '@/contexts/AuthContext'

/**
 * NotificationsInbox — Página de notificaciones (diseño premium minimalista, móvil).
 * Ahora con datos reales de MongoDB.
 */
const TWYK_A = '#A855F7' // opción A (morado)
const TWYK_B = '#3B82F6' // opción B (azul)

const iconFor = (n) => {
  switch (n.type) {
    case 'challenge': return { Icon: Swords, color: '#FFFFFF' }
    case 'vote': return { Icon: VoteIcon, color: n.side === 'b' ? TWYK_B : TWYK_A }
    case 'accepted': return { Icon: Check, color: '#6EE7A8' }
    case 'follow': return { Icon: UserPlus, color: '#7DB7FF' }
    case 'comment': return { Icon: MessageCircle, color: '#FFFFFF' }
    default: return { Icon: Bell, color: '#A1A1AA' }
  }
}

const FILTERS = [
  { key: 'all', label: 'All', types: null },
  { key: 'challenge', label: 'Challenges', types: ['challenge', 'accepted'] },
  { key: 'vote', label: 'Votes', types: ['vote'] },
  { key: 'follow', label: 'Followers', types: ['follow'] },
  { key: 'comment', label: 'Comments', types: ['comment'] },
]

export default function NotificationsInbox({ open, onClose }) {
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (open && user) {
      loadNotifications(filter)
    } else if (open && !user) {
      setList([])
    }
  }, [open, filter, user])

  const loadNotifications = async (currentFilter) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?filter=${currentFilter}`)
      if (res.ok) {
        const data = await res.json()
        setList(data.notifications || [])
      } else {
        setList([])
      }
    } catch (err) {
      console.error('Error loading notifications:', err)
      setList([])
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (res.ok) {
        setList((prev) => prev.map((n) => ({ ...n, read: true })))
      }
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  const hasUnread = list.some((n) => !n.read)
  const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0]
  const countFor = (f) => {
    if (!f.types) return list.length
    return list.filter((n) => f.types.includes(n.type)).length
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0b] flex flex-col text-white">
      {/* Glow superior sutil */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.07), transparent 70%)' }} />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-2 pb-3"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-1">
          <button onClick={onClose} aria-label="Back" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-white/5 active:scale-90 transition text-white">
            <ChevronLeft size={22} strokeWidth={1.75} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight">Notifications</h1>
        </div>
        {hasUnread && (
          <button onClick={markAllRead} className="text-[13px] font-medium text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/5 transition">
            Mark as read
          </button>
        )}
      </div>

      {/* Pestañas de filtro (tipo de notificación + toda la actividad) */}
      <div className="relative z-10 px-2 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {FILTERS.map((f) => {
            const active = filter === f.key
            const count = countFor(f)
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium border transition-all active:scale-95 ${
                  active
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.04] text-zinc-400 border-white/[0.08] hover:text-white hover:border-white/20'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10.5px] font-semibold ${
                    active ? 'bg-black/10 text-black' : 'bg-white/10 text-zinc-300'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista */}
      <div className="relative z-10 flex-1 overflow-y-auto px-2 pb-10">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center text-center pt-28">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6">
              <Bell className="w-9 h-9" strokeWidth={1.25} style={{ color: '#FFFFFF' }} />
            </div>
            <h2 className="text-white text-[22px] font-semibold tracking-tight">
              Log in
            </h2>
            <p className="text-zinc-400 text-[15px] mt-2 max-w-[16rem] leading-relaxed">
              You need to log in to see your notifications
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center pt-28">
            <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6"
                 style={{ boxShadow: '0 0 48px -14px rgba(255,255,255,0.4)' }}>
              <Bell className="w-9 h-9" strokeWidth={1.25} style={{ color: '#FFFFFF' }} />
            </div>
            <h2 className="text-white text-[22px] font-semibold tracking-tight">
              {filter === 'all' ? 'No notifications' : 'Nothing here'}
            </h2>
            <p className="text-zinc-400 text-[15px] mt-2 max-w-[16rem] leading-relaxed">
              {filter === 'all'
                ? "When there's activity on your challenges, it will appear here."
                : `You have no "${activeFilter.label}" notifications.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-1.5 pt-1">
            {list.map((n) => {
              const { Icon, color } = iconFor(n)
              return (
                <div
                  key={n.id}
                  className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition ${
                    n.read ? 'hover:bg-white/[0.03]' : 'bg-white/[0.04] border border-white/[0.06]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar src={n.user?.avatarUrl} alt="" className="w-11 h-11 rounded-full ring-1 ring-white/10" />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-zinc-900 border border-white/10">
                      <Icon className="w-[12px] h-[12px]" style={{ color }} />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14.5px] text-white leading-snug">
                      <span className="font-semibold">@{n.user?.username}</span>{' '}
                      <span className="text-zinc-300">{n.text}</span>
                    </p>
                    <p className="text-[12px] text-zinc-500 mt-0.5">{n.time}</p>
                  </div>
                  {!n.read && <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
