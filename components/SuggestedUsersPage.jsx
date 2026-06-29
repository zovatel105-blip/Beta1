'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Check, Loader2, UserRoundPlus, Users } from 'lucide-react'
import Avatar from './Avatar'

// Página de USUARIOS SUGERIDOS ("personas que quizá conozcas / amigos sugeridos").
// Se abre desde el botón superior izquierdo de la página de retos. Muestra una
// lista priorizada por interacción real (te sigue, interactuó contigo, os habéis
// retado, amigos de amigos, popularidad) con su motivo y un botón Seguir.
export default function SuggestedUsersPage({ open, onClose, onOpenProfile, onRequireAuth }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState({}) // username -> true mientras se procesa el follow

  useEffect(() => {
    if (!open) { setUsers([]); return }
    let active = true
    setLoading(true)
    fetch('/api/users/suggested', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setUsers(Array.isArray(d?.users) ? d.users : []) })
      .catch(() => { if (active) setUsers([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open])

  const toggleFollow = useCallback(async (username) => {
    if (busy[username]) return
    setBusy((b) => ({ ...b, [username]: true }))
    // Optimista
    setUsers((list) => list.map((u) => u.username === username
      ? { ...u, isFollowing: !u.isFollowing, followers: Math.max(0, (u.followers || 0) + (u.isFollowing ? -1 : 1)) }
      : u))
    try {
      const token = (typeof window !== 'undefined' && localStorage.getItem('twyk_token')) || ''
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.status === 401) {
        // Revertir y pedir login
        setUsers((list) => list.map((u) => u.username === username
          ? { ...u, isFollowing: !u.isFollowing, followers: Math.max(0, (u.followers || 0) + (u.isFollowing ? -1 : 1)) }
          : u))
        onRequireAuth?.()
        return
      }
      const data = await res.json().catch(() => null)
      if (data && typeof data.following === 'boolean') {
        setUsers((list) => list.map((u) => u.username === username
          ? { ...u, isFollowing: data.following, followers: typeof data.followers === 'number' ? data.followers : u.followers }
          : u))
      }
    } catch {
      // Revertir en error
      setUsers((list) => list.map((u) => u.username === username
        ? { ...u, isFollowing: !u.isFollowing, followers: Math.max(0, (u.followers || 0) + (u.isFollowing ? -1 : 1)) }
        : u))
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[username]; return n })
    }
  }, [busy, onRequireAuth])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0b] flex flex-col">
      {/* Cabecera */}
      <div
        className="flex items-center gap-2 px-3 pb-3 border-b border-white/10"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          aria-label="cerrar sugerencias"
          onClick={onClose}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-95 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-white text-[17px] font-bold leading-tight">Sugerencias para ti</h1>
          <p className="text-white/45 text-[12px] leading-tight">Personas que quizá conozcas</p>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-white/40" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <Users size={24} className="text-white/30" />
            </div>
            <p className="text-white/70 text-[15px] font-semibold">Aún no hay sugerencias</p>
            <p className="text-white/40 text-[13px] mt-1">Interactúa, sigue y reta a otros para ver personas aquí.</p>
          </div>
        ) : (
          <ul className="py-1">
            {users.map((u) => (
              <li key={u.username} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  onClick={() => { onOpenProfile?.(u.username) }}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left active:opacity-80 transition"
                >
                  <Avatar src={u.avatarUrl} alt={u.username} className="w-12 h-12 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-white text-[15px] font-semibold truncate">{u.name || u.username}</span>
                      {u.verified && <Check size={13} className="text-sky-400 shrink-0" />}
                    </div>
                    <p className="text-white/50 text-[13px] truncate">@{u.username}</p>
                    <p className="text-white/40 text-[12px] truncate mt-0.5">{u.reason}</p>
                  </div>
                </button>
                <button
                  onClick={() => toggleFollow(u.username)}
                  disabled={!!busy[u.username]}
                  className={`shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-60 ${
                    u.isFollowing
                      ? 'bg-white/[0.06] border border-white/15 text-white'
                      : 'bg-white text-black'
                  }`}
                >
                  {busy[u.username] ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : u.isFollowing ? (
                    <>Siguiendo</>
                  ) : (
                    <><UserRoundPlus size={15} strokeWidth={2.2} /> Seguir</>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
