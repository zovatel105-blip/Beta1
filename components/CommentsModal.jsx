'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Send, Heart, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * CommentsModal — Modal de comentarios con lista + formulario para agregar.
 * Funcionalidad real con datos almacenados en BD.
 */
export default function CommentsModal({ open, postId, onClose }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Cargar comentarios al abrir
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

  const handleLikeComment = useCallback(async (commentId) => {
    try {
      const res = await fetch('/api/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      })

      if (res.ok) {
        const data = await res.json()
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? { ...c, likes: data.likes, userLiked: data.userLiked }
              : c
          )
        )
      }
    } catch (err) {
      console.error('Error liking comment:', err)
    }
  }, [])

  const handleDeleteComment = useCallback(async (commentId) => {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId))
      }
    } catch (err) {
      console.error('Error deleting comment:', err)
    }
  }, [])

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
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full sm:w-[500px] max-h-[85vh] bg-[#0a0a0b] sm:rounded-2xl rounded-t-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white text-[17px] font-semibold">
            {comments.length} {comments.length === 1 ? 'Comentario' : 'Comentarios'}
          </h3>
          <button
            onClick={onClose}
            aria-label="cerrar"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Lista de comentarios */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-white/50 text-[15px]">No hay comentarios aún</p>
              <p className="text-white/30 text-[13px] mt-1">Sé el primero en comentar</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-purple-500 to-blue-500 flex-shrink-0">
                    {comment.author?.avatarUrl ? (
                      <img
                        src={comment.author.avatarUrl}
                        alt={comment.author.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                        {comment.author?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>

                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-white/90 text-[14px] font-semibold">
                        {comment.author?.username || 'Usuario'}
                      </span>
                      <span className="text-white/40 text-[12px]">
                        {formatTime(comment.timestamp)}
                      </span>
                    </div>
                    <p className="text-white/80 text-[14px] leading-snug mt-0.5 break-words">
                      {comment.text}
                    </p>

                    {/* Acciones */}
                    <div className="flex items-center gap-4 mt-2">
                      <button
                        onClick={() => handleLikeComment(comment.id)}
                        className="flex items-center gap-1 group"
                      >
                        <Heart
                          className={cn(
                            'w-4 h-4 transition-all',
                            comment.userLiked
                              ? 'text-red-500 fill-current'
                              : 'text-white/40 group-hover:text-red-400'
                          )}
                        />
                        {comment.likes > 0 && (
                          <span className="text-[12px] text-white/50">
                            {comment.likes}
                          </span>
                        )}
                      </button>

                      {comment.isOwn && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="flex items-center gap-1 group"
                        >
                          <Trash2 className="w-4 h-4 text-white/40 group-hover:text-red-400 transition-colors" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulario */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-5 py-4 border-t border-white/10"
        >
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escribe un comentario..."
            className="flex-1 bg-white/5 text-white placeholder:text-white/40 px-4 py-2.5 rounded-full text-[14px] outline-none focus:bg-white/10 transition-colors"
            maxLength={500}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            aria-label="enviar"
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all',
              newComment.trim() && !submitting
                ? 'bg-gradient-to-r from-purple-500 to-blue-500 hover:scale-105 active:scale-95'
                : 'bg-white/10 opacity-50 cursor-not-allowed'
            )}
          >
            {submitting ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-white" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
