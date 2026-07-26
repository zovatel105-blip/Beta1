'use client'

import { useCallback, useState } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// Cabecera de autorización por token (respaldo de la cookie httpOnly, mismo
// patrón que CommentsModal.jsx / OptionsModal.jsx / Feed.jsx).
function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

/**
 * QuickCommentInput — barra de "Añadir comentario" fija en la parte inferior
 * del vídeo (visor de publicaciones del perfil, propio y ajeno). A diferencia
 * de CommentsModal (hoja completa con lista + respuestas), esta barra publica
 * el comentario DIRECTAMENTE aquí, sin abrir ningún modal — solo texto, sin
 * adjuntar imagen/emoji/mención (por diseño, a petición del usuario).
 */
export default function QuickCommentInput({ postId, votedSide = null, onPosted, onRequireAuth }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) { onRequireAuth?.(); return }
    const trimmed = text.trim()
    if (!trimmed || submitting || !postId) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ postId, text: trimmed, votedSide }),
      })
      if (res.ok) {
        setText('')
        onPosted?.()
      } else if (res.status === 401) {
        onRequireAuth?.()
      }
    } catch { /* ignore */ } finally {
      setSubmitting(false)
    }
  }, [postId, text, submitting, user, votedSide, onPosted, onRequireAuth])

  const stop = (e) => e.stopPropagation()

  return (
    <form
      onSubmit={handleSubmit}
      onClick={stop}
      onPointerDown={stop}
      onPointerUp={stop}
      className="absolute left-0 right-0 z-20 px-3 pointer-events-auto"
      style={{ bottom: 'calc(56px + max(env(safe-area-inset-bottom, 0px), 8px))', paddingTop: 10, paddingBottom: 8 }}
    >
      <div className="flex items-center gap-1.5 bg-black/45 backdrop-blur-md border border-white/15 rounded-full pl-4 pr-1.5 py-1.5 shadow-lg">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClick={stop}
          onFocus={stop}
          placeholder="Add a comment..."
          maxLength={500}
          disabled={submitting}
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent text-white placeholder:text-white/50 text-[14px] outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          aria-label="send comment"
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90',
            text.trim() && !submitting ? 'bg-white text-black' : 'bg-white/15 text-white/40'
          )}
        >
          {submitting ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
          ) : (
            <Send className="w-4 h-4" strokeWidth={2.2} />
          )}
        </button>
      </div>
    </form>
  )
}
