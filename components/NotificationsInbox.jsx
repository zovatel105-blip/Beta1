'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, Swords, UserPlus, MessageCircle, Check, ChevronLeft, Send, CornerDownRight } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'
import Avatar from './Avatar'
import { useAuth } from '@/contexts/AuthContext'

/**
 * NotificationsInbox — Página de notificaciones (diseño premium minimalista, móvil).
 * Ahora con datos reales de MongoDB. Permite responder directamente a
 * comentarios/respuestas desde la propia notificación (sin tener que abrir
 * la publicación).
 */
const TWYK_A = '#A855F7' // opción A (morado)
const TWYK_B = '#3B82F6' // opción B (azul)

// Cabecera de autorización por token (respaldo de la cookie httpOnly,
// necesaria dentro del iframe del preview donde se bloquean cookies de
// terceros). Mismo patrón que el resto de la app (OptionsModal, Feed, etc).
function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

const iconFor = (n) => {
  switch (n.type) {
    case 'challenge': return { Icon: Swords, color: '#FFFFFF' }
    case 'vote': return { Icon: VoteIcon, color: n.side === 'b' ? TWYK_B : TWYK_A }
    case 'accepted': return { Icon: Check, color: '#6EE7A8' }
    case 'follow': return { Icon: UserPlus, color: '#7DB7FF' }
    case 'comment': return { Icon: MessageCircle, color: '#FFFFFF' }
    case 'reply': return { Icon: MessageCircle, color: '#FFFFFF' }
    default: return { Icon: Bell, color: '#A1A1AA' }
  }
}

// Solo las notificaciones de comentario/respuesta con un post+comentario
// identificables se pueden responder directamente desde aquí.
const isReplyable = (n) => (n.type === 'comment' || n.type === 'reply') && n.postId && n.commentId

const FILTERS = [
  { key: 'all', label: 'All', types: null },
  { key: 'challenge', label: 'Challenges', types: ['challenge', 'accepted'] },
  { key: 'vote', label: 'Votes', types: ['vote'] },
  { key: 'follow', label: 'Followers', types: ['follow'] },
  { key: 'comment', label: 'Comments', types: ['comment', 'reply'] },
]

export default function NotificationsInbox({ open, onClose }) {
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [replyOpenId, setReplyOpenId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [repliedIds, setRepliedIds] = useState(() => new Set())
  const { user } = useAuth()

  // BUG FIX (contadores de las pestañas inconsistentes/"reaparecían" al
  // volver a "All"): antes se volvía a pedir al backend con un `?filter=`
  // distinto EN CADA cambio de pestaña, así que `list` solo contenía las
  // notificaciones del tipo activo en cada momento. `countFor()` calculaba
  // los números de TODAS las pestañas a partir de ese `list` parcial, por lo
  // que las pestañas no activas mostraban 0 (o un número desactualizado) y,
  // al volver a "All" (que sí trae el listado completo), los números
  // "correctos" volvían a aparecer de golpe -> exactamente el bug reportado.
  // FIX: se pide SIEMPRE el listado COMPLETO (sin filtro) una sola vez por
  // apertura/usuario, y el filtrado por pestaña + el cálculo de los
  // contadores se hace en el cliente sobre esa ÚNICA lista completa, así los
  // números son siempre consistentes sin importar qué pestaña esté activa.
  useEffect(() => {
    if (open && user) {
      loadNotifications()
    } else if (open && !user) {
      setList([])
    }
  }, [open, user])

  // Reinicia el estado de "responder" cada vez que se abre/cierra la bandeja
  // o se cambia de pestaña, para no dejar un input abierto de un filtro
  // anterior.
  useEffect(() => {
    setReplyOpenId(null)
    setReplyText('')
  }, [open, filter])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      // `cache: 'no-store'` evita que el navegador sirva una respuesta
      // CACHEADA de una carga anterior (p.ej. al reabrir la bandeja tras
      // marcar todo como leído), mostrando de nuevo el estado `read`
      // ANTIGUO aunque el backend ya las tuviera marcadas como leídas.
      const res = await fetch('/api/notifications?filter=all', {
        cache: 'no-store',
        headers: { ...authHeaders() },
      })
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

  const markAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ all: true }),
      })
      if (res.ok) {
        setList((prev) => prev.map((n) => ({ ...n, read: true })))
      }
    } catch (err) {
      console.error('Error marking all as read:', err)
    }
  }

  // NUEVO (petición del usuario): "Mark as read" queda reservado SOLO para
  // la pestaña "All". En el resto de pestañas (Challenges/Votes/Followers/
  // Comments), con solo ABRIRLAS ya se consideran "vistas" -> se marcan
  // como leídas automáticamente (sin botón), y su insignia desaparece al
  // instante. Optimista en el cliente + fire-and-forget al backend (nuevo
  // parámetro `types` en POST /api/notifications/read).
  const selectFilter = useCallback((f) => {
    setFilter(f.key)
    if (!f.types) return // "All" no se auto-marca; se usa el botón "Mark as read"
    setList((prev) => {
      const hasUnreadOfType = prev.some((n) => f.types.includes(n.type) && !n.read)
      if (!hasUnreadOfType) return prev
      fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ types: f.types }),
      }).catch((err) => console.error('Error marking type as read:', err))
      return prev.map((n) => (f.types.includes(n.type) ? { ...n, read: true } : n))
    })
  }, [])

  const startReply = useCallback((n) => {
    setReplyOpenId(n.id)
    setReplyText('')
  }, [])

  const cancelReply = useCallback(() => {
    setReplyOpenId(null)
    setReplyText('')
  }, [])

  const submitReply = useCallback(async (n) => {
    if (!replyText.trim() || replySubmitting) return
    setReplySubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ postId: n.postId, text: replyText.trim(), parentId: n.commentId }),
      })
      if (res.ok) {
        setRepliedIds((prev) => new Set(prev).add(n.id))
        setReplyOpenId(null)
        setReplyText('')
      }
    } catch (err) {
      console.error('Error replying from notifications:', err)
    } finally {
      setReplySubmitting(false)
    }
  }, [replyText, replySubmitting])

  if (!open) return null

  const hasUnread = list.some((n) => !n.read)
  const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0]
  // BUG FIX #2 (el usuario confirmó que el problema seguía tras la 1ª
  // corrección de consistencia): las insignias contaban el TOTAL histórico
  // de notificaciones de cada categoría (leídas + no leídas), NO solo las
  // no leídas. Por eso, aunque ya eran consistentes entre pestañas, el
  // número NUNCA desaparecía al pulsar "Mark as read" (seguía mostrando el
  // total de siempre) -> al volver a "All" (o a cualquier pestaña) el
  // usuario veía "el número volver a aparecer" porque en realidad nunca se
  // había ido. FIX: la insignia ahora cuenta SOLO las NO LEÍDAS de esa
  // categoría (comportamiento estándar de badge de notificaciones), así al
  // marcar todo como leído desaparece de INMEDIATO en TODAS las pestañas a
  // la vez (no solo en la activa), y no vuelve a aparecer al cambiar de
  // pestaña porque el dato ya es 0 de verdad, no solo mientras estás en "All".
  const countFor = (f) => {
    const items = f.types ? list.filter((n) => f.types.includes(n.type)) : list
    return items.filter((n) => !n.read).length
  }
  // Filtrado 100% en el cliente sobre la ÚNICA lista completa ya cargada
  // (ver comentario en loadNotifications): así lo que se ve en pantalla al
  // cambiar de pestaña siempre coincide con los contadores de arriba.
  const displayList = activeFilter.types
    ? list.filter((n) => activeFilter.types.includes(n.type))
    : list

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
        {filter === 'all' && hasUnread && (
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
                onClick={() => selectFilter(f)}
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
        ) : displayList.length === 0 ? (
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
            {displayList.map((n) => {
              const { Icon, color } = iconFor(n)
              const replyable = isReplyable(n)
              const replying = replyOpenId === n.id
              const replied = repliedIds.has(n.id)
              return (
                <div
                  key={n.id}
                  className={`flex flex-col gap-2 px-3 py-3 rounded-2xl transition ${
                    n.read ? 'hover:bg-white/[0.03]' : 'bg-white/[0.04] border border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-3">
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
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[12px] text-zinc-500">{n.time}</p>
                        {replyable && !replying && (
                          <button
                            onClick={() => startReply(n)}
                            className="text-[12px] font-semibold text-zinc-400 hover:text-white transition active:scale-95"
                          >
                            {replied ? 'Reply sent ✓' : 'Reply'}
                          </button>
                        )}
                      </div>
                    </div>
                    {!n.read && <span className="shrink-0 w-2 h-2 rounded-full" style={{ background: '#EF4444' }} />}
                  </div>

                  {/* Input de respuesta inline (sin salir de Notificaciones) */}
                  {replying && (
                    <div className="flex items-center gap-1.5 pl-[52px] w-full min-w-0 max-w-full">
                      <CornerDownRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      <input
                        type="text"
                        autoFocus
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitReply(n) }}
                        placeholder={`Reply to @${n.user?.username || 'user'}...`}
                        maxLength={500}
                        disabled={replySubmitting}
                        className="flex-1 min-w-0 w-full bg-white/[0.06] text-white placeholder:text-zinc-500 px-3 py-2 rounded-full text-[13px] outline-none focus:bg-white/10 transition-all"
                      />
                      <button
                        onClick={() => submitReply(n)}
                        disabled={!replyText.trim() || replySubmitting}
                        aria-label="send reply"
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                          replyText.trim() && !replySubmitting
                            ? 'bg-white text-black hover:scale-105 active:scale-95'
                            : 'bg-white/10 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        {replySubmitting ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" strokeWidth={2} />
                        )}
                      </button>
                      <button
                        onClick={cancelReply}
                        disabled={replySubmitting}
                        className="text-[12px] text-zinc-500 hover:text-white transition shrink-0 px-1.5 whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
