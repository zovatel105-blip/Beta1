'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * CommentsModal — Modal premium minimalista de comentarios.
 * z-index alto para estar sobre todo, incluyendo BottomNav.
 */
export default function CommentsModal({ open, postId, onClose }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !postId) return
    loadComments()
  }, [open, postId])

  const loadComments = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?postId=${postId}`)
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments || [])
      }
    } catch (err) {
      console.error('Error loading comments:', err)
    } finally {
      setLoading(false)
    }
  }, [postId])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!newComment.trim() || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, text: newComment.trim() }),
      })

      if (res.ok) {
        const data = await res.json()
        setComments((prev) => [data.comment, ...prev])
        setNewComment('')
      }
    } catch (err) {
      console.error('Error posting comment:', err)
    } finally {
      setSubmitting(false)
    }
  }, [postId, newComment, submitting])

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Ahora'
    if (minutes < 60) return `${minutes}min`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return date.toLocaleDateString()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center sm:justify-center"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal Premium */}
      <div
        className="relative w-full sm:w-[440px] max-h-[80vh] bg-zinc-900/95 backdrop-blur-xl sm:rounded-3xl rounded-t-3xl flex flex-col border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header minimalista */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h3 className="text-white text-[16px] font-medium tracking-tight">
            Comentarios
          </h3>
          <button
            onClick={onClose}
            aria-label="cerrar"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5 text-white/60" strokeWidth={1.5} />
          </button>
        </div>

        {/* Lista de comentarios */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-white/40 text-[14px]">Sin comentarios</p>
              <p className="text-white/25 text-[13px] mt-1">Sé el primero en comentar</p>
            </div>
          ) : (
            <div className="space-y-5">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-500 flex-shrink-0">
                    {comment.author?.avatarUrl ? (
                      <img
                        src={comment.author.avatarUrl}
                        alt={comment.author.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                        {comment.author?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-white/90 text-[13px] font-medium">
                        {comment.author?.username || 'Usuario'}
                      </span>
                      <span className="text-white/30 text-[11px]">
                        {formatTime(comment.timestamp)}
                      </span>
                    </div>
                    <p className="text-white/70 text-[14px] leading-snug break-words">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulario minimalista */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-6 py-4 border-t border-white/5"
        >
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escribe un comentario..."
            className="flex-1 bg-white/5 text-white placeholder:text-white/30 px-4 py-3 rounded-full text-[14px] outline-none focus:bg-white/10 transition-all border border-white/5 focus:border-white/20"
            maxLength={500}
            disabled={submitting}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            aria-label="enviar"
            className={cn(
              'w-11 h-11 rounded-full flex items-center justify-center transition-all',
              newComment.trim() && !submitting
                ? 'bg-white text-black hover:scale-105 active:scale-95'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            )}
          >
            {submitting ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            ) : (
              <Send className="w-4 h-4" strokeWidth={2} />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
