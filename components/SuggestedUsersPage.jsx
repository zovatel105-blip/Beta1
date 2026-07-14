'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Check, Loader2, UserRoundPlus, UserRoundCheck, Users, Swords } from 'lucide-react'
import Avatar from './Avatar'

// Página de USUARIOS SUGERIDOS ("personas que quizá conozcas / amigos sugeridos").
// Se abre desde el botón superior izquierdo de la página de retos. Muestra una
// lista priorizada por interacción real (te sigue, interactuó contigo, os habéis
// retado, amigos de amigos, popularidad) con su motivo y acciones Seguir / Retar.
export default function SuggestedUsersPage({ open, onClose, onOpenProfile, onChallenge, onRequireAuth }) {
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

  const handleChallenge = useCallback((u) => {
    // Reto "con mención" (sin vídeo concreto): el usuario retado subirá su vídeo
    // de respuesta al aceptar. Reutiliza el flujo de ChallengeDialog del Feed.
    onChallenge?.({
      videoUrl: '',
      author: { username: u.username, name: u.name || u.username, avatarUrl: u.avatarUrl || '' },
      description: '',
      music: '',
    })
  }, [onChallenge])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[58] bg-[#0a0a0b] flex flex-col">
      {/* Cabecera */}
      <div
        className="flex items-center gap-2 px-3 pb-3 border-b border-white/10"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          aria-label="close suggestions"
          onClick={onClose}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-95 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-white text-[17px] font-bold leading-tight">Suggested for you</h1>
          <p className="text-white/45 text-[12px] leading-tight">People you may know</p>
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
            <p className="text-white/70 text-[15px] font-semibold">No suggestions yet</p>
            <p className="text-white/40 text-[13px] mt-1">Interact, follow and challenge others to see people here.</p>
          </div>
        ) : (
          <ul className="py-1">
            {users.map((u) => (
              <li key={u.username} className="flex items-center gap-2.5 px-4 py-1.5">
                <button
                  onClick={() => { onOpenProfile?.(u.username) }}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left active:opacity-80 transition"
                >
                  <Avatar src={u.avatarUrl} alt={u.username} className="w-10 h-10 rounded-full shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-white text-[13.5px] font-semibold truncate">{u.name || u.username}</span>
                      {u.verified && <Check size={12} className="text-sky-400 shrink-0" />}
                    </div>
                    <p className="text-white/50 text-[11.5px] truncate">@{u.username}</p>
                    <p className="text-white/40 text-[11px] truncate mt-0.5">{u.reason}</p>
                  </div>
                </button>
                <div className="shrink-0 flex items-center gap-1.5">
                  <button
                    onClick={() => toggleFollow(u.username)}
                    disabled={!!busy[u.username]}
                    aria-label={u.isFollowing ? 'Following' : 'Follow'}
                    title={u.isFollowing ? 'Following' : 'Follow'}
                    className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center transition active:scale-95 disabled:opacity-60 ${
                      u.isFollowing
                        ? 'bg-white/[0.06] border border-white/15 text-white'
                        : 'bg-white text-black'
                    }`}
                  >
                    {busy[u.username] ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : u.isFollowing ? (
                      <UserRoundCheck size={14} strokeWidth={2.2} />
                    ) : (
                      <UserRoundPlus size={14} strokeWidth={2.2} />
                    )}
                  </button>
                  <button
                    onClick={() => handleChallenge(u)}
                    className="h-8 px-3 rounded-full text-[11.5px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap bg-transparent border border-white/15 text-white hover:bg-white/[0.06] active:scale-95 transition"
                  >
                    <Swords size={13} strokeWidth={2.1} /> Challenge
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
