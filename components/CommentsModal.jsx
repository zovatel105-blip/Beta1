'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Send, ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from './AuthModal'
import BottomSheet from './BottomSheet'
import Avatar from './Avatar'

// Colores de equipo (reutilizan los del resultado de votación VS).
const SIDE_A = '#A855F7' // morado (Lado A)
const SIDE_B = '#3B82F6' // azul (Lado B)
const sideColor = (s) => (s === 'a' ? SIDE_A : s === 'b' ? SIDE_B : null)

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

const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}min`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return date.toLocaleDateString()
}

// Fila de un comentario o de una respuesta (mismo diseño, avatar más pequeño
// para las respuestas). Incluye las acciones "Reply" y, si `canDelete`,
// "Delete" con una confirmación inline de 1 paso.
function CommentRow({ c, isReply, votedSide, onReply, onAskDelete, onConfirmDelete, onCancelDelete, confirming, deleting, showConnector }) {
  // Para mis propios comentarios, el punto de color sigue el voto ACTUAL
  // (prop en vivo), no el que tenía guardado al comentar.
  const effectiveSide = c.isOwn && votedSide ? votedSide : c.votedSide
  const color = sideColor(effectiveSide)
  const avatarSize = isReply ? 28 : 36

  return (
    <div className="flex gap-3">
      {/* Columna del avatar: se estira a la altura real de la fila (texto +
          acciones) para que el conector, si lo hay, pueda ir del borde
          inferior de ESTE avatar hasta cerca del borde superior del
          SIGUIENTE avatar (respuesta), sin llegar a tocar ninguno de los
          dos. Solo se dibuja entre respuestas consecutivas, nunca a partir
          o hacia el comentario principal. */}
      <div className="relative flex-shrink-0 self-stretch" style={{ width: avatarSize }}>
        <div
          className="rounded-full overflow-hidden bg-zinc-200 absolute top-0 left-0"
          style={{ width: avatarSize, height: avatarSize }}
        >
          <Avatar src={c.author?.avatarUrl} alt={c.author?.username || ''} className="w-full h-full rounded-full" />
        </div>
        {showConnector && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 w-[1.5px] bg-zinc-200 rounded-full"
            style={{ top: avatarSize + 6, bottom: -6 }}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Burbuja neutral: el color del voto solo se indica con el punto */}
        <div className="rounded-2xl px-3.5 py-2.5 bg-zinc-100">
          <div className="flex items-center gap-1.5 mb-0.5">
            {color && (
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            )}
            <span className="text-zinc-900 text-[13px] font-semibold truncate">
              {c.author?.username || 'User'}
            </span>
            <span className="text-zinc-400 text-[11px]">{formatTime(c.timestamp)}</span>
          </div>
          <p className="text-zinc-700 text-[14px] leading-snug break-words">{c.text}</p>
        </div>

        {confirming ? (
          <div className="flex items-center gap-3 mt-1.5 pl-1">
            <span className="text-[12px] text-zinc-500">Delete this comment?</span>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={deleting}
              className="text-[12px] font-semibold text-red-600 active:scale-95 transition disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={deleting}
              className="text-[12px] font-medium text-zinc-400 active:scale-95 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 mt-1 pl-1">
            <button
              type="button"
              onClick={onReply}
              className="text-[12px] font-semibold text-zinc-500 hover:text-zinc-700 active:scale-95 transition"
            >
              Reply
            </button>
            {c.canDelete && (
              <button
                type="button"
                onClick={onAskDelete}
                className="text-[12px] font-semibold text-zinc-400 hover:text-red-500 active:scale-95 transition"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * CommentsModal — Hoja inferior de comentarios estilo Instagram (blanco, ~75%).
 * Cada comentario se colorea segun el lado por el que voto su autor.
 * Soporta RESPUESTAS anidadas (un solo nivel, estilo Instagram) y ELIMINAR
 * comentarios (el propio autor, o el dueño de la publicación).
 */
export default function CommentsModal({ open, postId, onClose, votedSide = null, onCountChange }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null) // { id, username } | null
  const [expandedReplies, setExpandedReplies] = useState(() => new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const { user } = useAuth()

  useEffect(() => {
    if (!open || !postId) return
    loadComments()
  }, [open, postId])

  // Reiniciar estado de interacción (respuesta en curso / confirmación de
  // borrado / hilos abiertos) cada vez que se abre o cierra la hoja.
  useEffect(() => {
    if (!open) {
      setReplyingTo(null)
      setConfirmDeleteId(null)
      setExpandedReplies(new Set())
    }
  }, [open])

  const loadComments = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?postId=${postId}`, { headers: { ...authHeaders() } })
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments || [])
        onCountChange?.(data.comments?.length || 0)
      }
    } catch (err) {
      console.error('Error loading comments:', err)
    } finally {
      setLoading(false)
    }
  }, [postId])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!user) { setShowAuthModal(true); return }
    if (!newComment.trim() || submitting) return

    const parentId = replyingTo?.id || null
    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ postId, text: newComment.trim(), votedSide, parentId }),
      })
      if (res.ok) {
        const data = await res.json()
        setComments((prev) => {
          const next = [data.comment, ...prev]
          onCountChange?.(next.length)
          return next
        })
        // Si era una respuesta, abrir el hilo RAÍZ (el que devuelve el
        // backend ya aplanado en data.comment.parentId) para que se vea al
        // instante, sin importar si respondiste a la raíz o a otra respuesta.
        if (data.comment.parentId) {
          setExpandedReplies((prev) => new Set(prev).add(data.comment.parentId))
        }
        setNewComment('')
        setReplyingTo(null)
      } else if (res.status === 401) {
        setShowAuthModal(true)
      }
    } catch (err) {
      console.error('Error posting comment:', err)
    } finally {
      setSubmitting(false)
    }
  }, [postId, newComment, submitting, user, votedSide, onCountChange, replyingTo])

  const handleDelete = useCallback(async (commentId) => {
    setDeletingId(commentId)
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: { ...authHeaders() },
      })
      if (res.ok) {
        setComments((prev) => {
          // Borrado en cascada en el cliente (refleja al backend): si era un
          // comentario "padre", sus respuestas también desaparecen.
          const toRemove = new Set([commentId])
          prev.forEach((c) => { if (c.parentId === commentId) toRemove.add(c.id) })
          const next = prev.filter((c) => !toRemove.has(c.id))
          onCountChange?.(next.length)
          return next
        })
      }
    } catch (err) {
      console.error('Error deleting comment:', err)
    } finally {
      setDeletingId(null)
      setConfirmDeleteId((id) => (id === commentId ? null : id))
    }
  }, [onCountChange])

  const startReply = useCallback((c) => {
    if (!user) { setShowAuthModal(true); return }
    // Se envía el id EXACTO del comentario pulsado (puede ser el comentario
    // raíz o una respuesta concreta). El backend es quien aplana a 1 nivel
    // para el hilo plano (parentId=raíz) SIN perder el dato de a quién se
    // respondió realmente (replyToId), que es lo que necesita el frontend
    // para saber entre qué 2 avatares dibujar la línea vertical de conexión.
    setReplyingTo({ id: c.id, username: c.author?.username || 'user' })
  }, [user])

  const toggleReplies = useCallback((id) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // Comentarios raíz (más reciente primero, igual que antes) + mapa de
  // respuestas por comentario padre (orden cronológico ascendente).
  const topLevel = useMemo(() => comments.filter((c) => !c.parentId), [comments])
  const repliesByParent = useMemo(() => {
    const map = {}
    for (const c of comments) {
      if (!c.parentId) continue
      if (!map[c.parentId]) map[c.parentId] = []
      map[c.parentId].push(c)
    }
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    }
    return map
  }, [comments])

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        hideHandle
        className={`transition-[height] duration-300 ease-out ${expanded ? 'h-[95vh]' : 'h-[75vh]'}`}
      >
        {/* Flecha expandir/contraer: arriba si puede expandirse, abajo si ya está al máximo */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'collapse' : 'expand'}
          className="flex justify-center items-center pt-1.5 pb-0.5 shrink-0 active:scale-90 transition"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-zinc-500" strokeWidth={2.2} />
          ) : (
            <ChevronUp className="w-4 h-4 text-zinc-500" strokeWidth={2.2} />
          )}
        </button>

        {/* Header */}
        <div className="px-5 pb-1.5 border-b border-zinc-100 shrink-0">
          <h3 className="text-center text-[12px] font-semibold text-zinc-800">
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </h3>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-zinc-200 border-t-zinc-500 animate-spin" />
            </div>
          ) : topLevel.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-zinc-500 text-[15px] font-medium">No comments yet</p>
              <p className="text-zinc-400 text-[13px] mt-1">Be the first to comment</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topLevel.map((c) => {
                const replies = repliesByParent[c.id] || []
                const isExpanded = expandedReplies.has(c.id)
                return (
                  <div key={c.id}>
                    <CommentRow
                      c={c}
                      isReply={false}
                      votedSide={votedSide}
                      onReply={() => startReply(c)}
                      onAskDelete={() => setConfirmDeleteId(c.id)}
                      onConfirmDelete={() => handleDelete(c.id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      confirming={confirmDeleteId === c.id}
                      deleting={deletingId === c.id}
                    />

                    {replies.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleReplies(c.id)}
                        className="flex items-center gap-2 mt-2 ml-11 active:scale-95 transition"
                      >
                        <span className="w-6 h-px bg-zinc-300" />
                        <span className="text-[12px] font-semibold text-zinc-500">
                          {isExpanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                        </span>
                      </button>
                    )}

                    {isExpanded && replies.length > 0 && (
                      <div className="ml-11 mt-3 space-y-3">
                        {/* Conector: pequeña línea vertical de avatar a avatar,
                            SOLO cuando la respuesta siguiente fue dirigida
                            específicamente a ESTA respuesta (replyToId),
                            nunca por simple cercanía/orden. Nunca toca el
                            comentario principal (la raíz no participa aquí)
                            ni llega a tocar ninguno de los 2 avatares que une. */}
                        {replies.map((r, idx) => {
                          const next = replies[idx + 1]
                          const connectsToNext = Boolean(next && next.replyToId === r.id)
                          return (
                            <CommentRow
                              key={r.id}
                              c={r}
                              isReply
                              votedSide={votedSide}
                              onReply={() => startReply(r)}
                              onAskDelete={() => setConfirmDeleteId(r.id)}
                              onConfirmDelete={() => handleDelete(r.id)}
                              onCancelDelete={() => setConfirmDeleteId(null)}
                              confirming={confirmDeleteId === r.id}
                              deleting={deletingId === r.id}
                              showConnector={connectsToNext}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pill "Replying to @username" (solo si se está respondiendo) */}
        {replyingTo && (
          <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5 border-t border-zinc-100 bg-white shrink-0">
            <span className="text-[12.5px] text-zinc-500">
              Replying to <span className="font-semibold text-zinc-700">@{replyingTo.username}</span>
            </span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="cancel reply"
              className="p-1 text-zinc-400 hover:text-zinc-600 active:scale-90 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Input fijo abajo */}
        <form onSubmit={handleSubmit} className={cn('flex items-center gap-2 px-4 py-3 shrink-0 bg-white', !replyingTo && 'border-t border-zinc-100')}>
          {user ? (
            <>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment...'}
                className="flex-1 bg-zinc-100 text-zinc-900 placeholder:text-zinc-400 px-4 py-3 rounded-full text-[14px] outline-none focus:bg-zinc-200/70 transition-all"
                maxLength={500}
                disabled={submitting}
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                aria-label="send"
                className={cn(
                  'w-11 h-11 rounded-full flex items-center justify-center transition-all',
                  newComment.trim() && !submitting
                    ? 'bg-zinc-900 text-white hover:scale-105 active:scale-95'
                    : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                )}
              >
                {submitting ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4" strokeWidth={2} />
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 rounded-full bg-zinc-900 text-white font-medium text-[14px] hover:bg-zinc-800 transition-all"
            >
              Log in to comment
            </button>
          )}
        </form>
      </BottomSheet>

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} defaultTab="login" />
    </>
  )
}
