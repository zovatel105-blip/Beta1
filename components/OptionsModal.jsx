'use client'

import { useState, useEffect } from 'react'
import { EyeOff, Flag, Ban, Link2, Check, ChevronDown, ChevronLeft, Loader2 } from 'lucide-react'
import BottomSheet from './BottomSheet'
import { useAuth } from '@/contexts/AuthContext'

/**
 * OptionsModal — Hoja inferior de "tres puntos" estilo Instagram.
 * Opciones: No me interesa, Reportar (con motivo), Bloquear usuario, Copiar enlace.
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

export default function OptionsModal({ open, postId, author, onClose }) {
  const { user } = useAuth()
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState('menu') // 'menu' | 'report'
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('') // mensaje de confirmación

  // Reiniciar estado cada vez que se abre.
  useEffect(() => {
    if (open) {
      setView('menu')
      setBusy(false)
      setDone('')
      setCopied(false)
    }
  }, [open])

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?post=${postId}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => { setCopied(false); onClose?.() }, 900)
    } catch {
      onClose?.()
    }
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
    { key: 'ni', label: 'Not interested', icon: <EyeOff className="w-[22px] h-[22px] text-zinc-700" strokeWidth={1.7} />, onClick: () => onClose?.(), danger: false },
    { key: 'report', label: 'Report', icon: <Flag className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: () => { setDone(''); setView('report') }, danger: true },
    { key: 'block', label: 'Block user', icon: <Ban className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: blockUser, danger: true },
    { key: 'copy', label: copied ? 'Link copied' : 'Copy link', icon: copied ? <Check className="w-[22px] h-[22px] text-green-600" strokeWidth={2} /> : <Link2 className="w-[22px] h-[22px] text-zinc-700" strokeWidth={1.7} />, onClick: copyLink, danger: false },
  ]

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
          <span className="ml-1 text-[15px] font-semibold text-zinc-900">Report post</span>
        </div>
      )}

      {done ? (
        <div className="px-6 py-8 text-center">
          <p className="text-[15px] font-medium text-zinc-800">{done}</p>
        </div>
      ) : view === 'menu' ? (
        <div className="px-2 pb-2">
          {rows.map((r) => (
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
