'use client'

import { useState, useEffect } from 'react'
import { EyeOff, Flag, Ban, ChevronDown, ChevronLeft, Loader2, Trash2, Swords } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { useAuth } from '@/contexts/AuthContext'

/**
 * OptionsModal — Hoja inferior de "tres puntos" estilo Instagram.
 * Opciones: No me interesa, Reportar (con motivo), Bloquear usuario.
 * (La fila "Copy link" se ELIMINÓ a petición del usuario — el enlace se sigue
 * pudiendo copiar desde el modal de Compartir, que no se toca.)
 * Reportar y Bloquear son FUNCIONALES (persisten en MongoDB vía /api/reports y
 * /api/users/block).
 */

const REPORT_REASONS = [
  'Spam',
  'Inappropriate content',
  'Harassment',
  'Violence',
  'Nudity',
  'False information',
  'Other',
]

// Cabecera de autorización por token (respaldo de la cookie httpOnly, necesaria
// dentro del iframe del preview donde se bloquean cookies de terceros).
function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

export default function OptionsModal({ open, postId, author, isOwner = false, onClose, onDeleted, onNotInterested, challengeToggle = null, showDeleteForOwner = true }) {
  const { user } = useAuth()
  const [view, setView] = useState('menu') // 'menu' | 'report'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('') // mensaje de confirmación
  const [toggleBusy, setToggleBusy] = useState(false)

  // Reiniciar estado cada vez que se abre.
  useEffect(() => {
    if (open) {
      setView('menu')
      setBusy(false)
      setDone('')
      setToggleBusy(false)
    }
  }, [open])

  // "Allow challenge" (petición del usuario: poder activar/desactivar el
  // botón de retar en las publicaciones tipo "Your post") — switch en el
  // propio menú, no navega a otra vista ni cierra el modal, cambia al
  // instante (optimista) y llama a `challengeToggle.onChange`, que en
  // OpenChallengeSlide.jsx hace la llamada real al backend y revierte si falla.
  const handleToggleAllowChallenge = async () => {
    if (!challengeToggle || toggleBusy) return
    setToggleBusy(true)
    try {
      await challengeToggle.onChange(!challengeToggle.checked)
    } finally {
      setToggleBusy(false)
    }
  }

  // "No me interesa" — feedback negativo explícito para el TWYK Engine (ver
  // POST /api/feed/not-interested). Fire-and-forget: la tarjeta se quita del
  // feed en el cliente (onNotInterested) sin esperar la respuesta del
  // backend, para que se sienta instantáneo igual que en TikTok/Instagram.
  const notInterested = () => {
    fetch('/api/feed/not-interested', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ postId }),
    }).catch(() => { /* best-effort, la tarjeta ya se quitó igualmente */ })
    onNotInterested?.(postId)
    onClose?.()
  }

  const submitReport = async (reason) => {
    if (!user) { setDone('You must log in to report'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ targetType: 'post', targetId: postId, reason }),
      })
      if (res.ok) {
        setDone("Thanks. We've received your report.")
        setTimeout(() => onClose?.(), 1400)
      } else {
        setDone("Couldn't send the report.")
      }
    } catch {
      setDone("Couldn't send the report.")
    } finally {
      setBusy(false)
    }
  }

  const blockUser = async () => {
    if (!user) { setDone('You must log in to block'); return }
    const username = author?.username
    if (!username) { setDone("Couldn't identify the user."); return }
    if (username === user.username) { setDone("You can't block yourself."); return }
    setBusy(true)
    try {
      const res = await fetch('/api/users/block', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        setDone(`Has bloqueado a @${username}.`)
        setTimeout(() => onClose?.(), 1400)
      } else {
        setDone('No se pudo bloquear al usuario.')
      }
    } catch {
      setDone('No se pudo bloquear al usuario.')
    } finally {
      setBusy(false)
    }
  }

  const rows = [
    { key: 'ni', label: 'Not interested', icon: <EyeOff className="w-[22px] h-[22px] text-zinc-700" strokeWidth={1.7} />, onClick: notInterested, danger: false },
    { key: 'report', label: 'Report', icon: <Flag className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: () => { setDone(''); setView('report') }, danger: true },
    { key: 'block', label: 'Block user', icon: <Ban className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: blockUser, danger: true },
  ]

  // Eliminar la publicación (solo el dueño). Llama al backend que valida la
  // propiedad por author.id y avisa al resto de la app vía evento global para
  // que la quiten del perfil/feed sin recargar.
  const deletePost = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...authHeaders() },
      })
      if (res.ok) {
        try { window.dispatchEvent(new CustomEvent('twyk:postDeleted', { detail: { postId } })) } catch { /* noop */ }
        onDeleted?.(postId)
        setDone('Post deleted.')
        setTimeout(() => onClose?.(), 1000)
      } else {
        setDone("Couldn't delete the post.")
      }
    } catch {
      setDone("Couldn't delete the post.")
    } finally {
      setBusy(false)
    }
  }

  // Menú del DUEÑO de la publicación (estilo Instagram/TikTok): acciones sobre
  // la propia publicación, no de "reportar/bloquear" como en una ajena.
  // `showDeleteForOwner=false` (usado por OpenChallengeSlide.jsx para las
  // publicaciones tipo "Your post", que aún no soportan borrado desde aquí)
  // deja el menú SOLO con el switch de `challengeToggle` (renderizado abajo,
  // fuera de este array), sin la fila de "Delete".
  const ownerRows = showDeleteForOwner
    ? [{ key: 'delete', label: 'Delete', icon: <Trash2 className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: () => { setDone(''); setView('confirmDelete') }, danger: true }]
    : []

  const menuRows = isOwner ? ownerRows : rows

  return (
    <BottomSheet open={open} onClose={onClose} hideHandle>
      {view === 'menu' ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="flex justify-center items-center pt-1.5 pb-0.5 shrink-0 active:scale-90 transition"
        >
          <ChevronDown className="w-4 h-4 text-zinc-500" strokeWidth={2.2} />
        </button>
      ) : (
        <div className="flex items-center px-2 pt-2 pb-1">
          <button type="button" onClick={() => setView('menu')} aria-label="back" className="p-1 active:scale-90 transition">
            <ChevronLeft className="w-5 h-5 text-zinc-700" strokeWidth={2.2} />
          </button>
          <span className="ml-1 text-[15px] font-semibold text-zinc-900">{view === 'confirmDelete' ? 'Delete post' : 'Report post'}</span>
        </div>
      )}

      {done ? (
        <div className="px-6 py-8 text-center">
          <p className="text-[15px] font-medium text-zinc-800">{done}</p>
        </div>
      ) : view === 'menu' ? (
        <div className="px-2 pb-2">
          {challengeToggle && (
            <div className="w-full flex items-center gap-4 px-5 py-4">
              <Swords className="w-[22px] h-[22px] text-zinc-700 shrink-0" strokeWidth={1.7} />
              <span className="flex-1 text-[15px] font-medium text-zinc-900">Allow challenges</span>
              <button
                type="button"
                role="switch"
                aria-checked={challengeToggle.checked}
                aria-label="Allow challenges"
                disabled={toggleBusy}
                onClick={handleToggleAllowChallenge}
                className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 disabled:opacity-50 ${challengeToggle.checked ? 'bg-emerald-500' : 'bg-zinc-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${challengeToggle.checked ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )}
          {menuRows.map((r) => (
            <button
              key={r.key}
              disabled={busy}
              onClick={r.onClick}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl hover:bg-zinc-50 active:bg-zinc-100 transition-colors disabled:opacity-50 ${r.danger ? 'text-red-600' : 'text-zinc-900'}`}
            >
              {busy && r.key === 'block' ? <Loader2 className="w-[22px] h-[22px] animate-spin text-red-600" /> : r.icon}
              <span className="text-[15px] font-medium">{r.label}</span>
            </button>
          ))}
        </div>
      ) : view === 'confirmDelete' ? (
        <div className="px-5 pb-4 pt-1">
          <p className="text-[15px] font-semibold text-zinc-900 text-center">Delete this post?</p>
          <p className="text-[13px] text-zinc-500 text-center mt-1.5 mb-5">This action can&apos;t be undone. Your post will be removed permanently.</p>
          <button
            disabled={busy}
            onClick={deletePost}
            className="w-full h-12 rounded-full bg-red-600 text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-red-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-[18px] h-[18px]" strokeWidth={2} />}
            Delete
          </button>
          <button
            disabled={busy}
            onClick={() => setView('menu')}
            className="w-full h-12 mt-2 rounded-full bg-zinc-100 text-zinc-900 font-semibold text-[15px] hover:bg-zinc-200 active:scale-[0.98] transition disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="px-2 pb-3">
          <p className="px-5 py-2 text-[13px] text-zinc-500">Why are you reporting this post?</p>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              disabled={busy}
              onClick={() => submitReport(reason)}
              className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl hover:bg-zinc-50 active:bg-zinc-100 transition-colors text-zinc-900 disabled:opacity-50"
            >
              <span className="text-[15px] font-medium">{reason}</span>
              {busy ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" /> : <ChevronDown className="w-4 h-4 -rotate-90 text-zinc-300" />}
            </button>
          ))}
        </div>
      )}
    </BottomSheet>
  )
}
