'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from './AuthModal'
import BottomSheet from './BottomSheet'

// Colores de equipo (reutilizan los del resultado de votación VS).
const SIDE_A = '#A855F7' // morado (Lado A)
const SIDE_B = '#3B82F6' // azul (Lado B)
const sideColor = (s) => (s === 'a' ? SIDE_A : s === 'b' ? SIDE_B : null)

/**
 * CommentsModal — Hoja inferior de comentarios estilo Instagram (blanco, ~75%).
 * Cada comentario se colorea segun el lado por el que voto su autor.
 */
export default function CommentsModal({ open, postId, onClose, votedSide = null }) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { user } = useAuth()

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
    if (!user) { setShowAuthModal(true); return }
    if (!newComment.trim() || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, text: newComment.trim(), votedSide }),
      })
      if (res.ok) {
        const data = await res.json()
        setComments((prev) => [data.comment, ...prev])
        setNewComment('')
      } else if (res.status === 401) {
        setShowAuthModal(true)
      }
    } catch (err) {
      console.error('Error posting comment:', err)
    } finally {
      setSubmitting(false)
    }
  }, [postId, newComment, submitting, user, votedSide])

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const diff = Date.now() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return 'Ahora'
    if (minutes < 60) return `${minutes}min`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return date.toLocaleDateString()
  }

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
          aria-label={expanded ? 'contraer' : 'expandir'}
          className="flex justify-center items-center pt-2.5 pb-1.5 shrink-0 active:scale-90 transition"
        >
          {expanded ? (
            <ChevronDown className="w-6 h-6 text-zinc-500" strokeWidth={2.2} />
          ) : (
            <ChevronUp className="w-6 h-6 text-zinc-500" strokeWidth={2.2} />
          )}
        </button>

        {/* Header */}
        <div className="px-5 pb-3 border-b border-zinc-100 shrink-0">
          <h3 className="text-center text-[15px] font-semibold text-zinc-900">
            {comments.length} {comments.length === 1 ? 'comentario' : 'comentarios'}
          </h3>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-zinc-200 border-t-zinc-500 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-zinc-500 text-[15px] font-medium">Sin comentarios todavia</p>
              <p className="text-zinc-400 text-[13px] mt-1">Se el primero en comentar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => {
                const color = sideColor(c.votedSide)
                return (
                  <div key={c.id} className="flex gap-3">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-200 flex-shrink-0">
                      {c.author?.avatarUrl ? (
                        <img src={c.author.avatarUrl} alt={c.author.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-bold">
                          {c.author?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>

                    {/* Burbuja coloreada por equipo */}
                    <div
                      className="flex-1 min-w-0 rounded-2xl px-3.5 py-2.5"
                      style={{
                        backgroundColor: color ? `${color}14` : '#f4f4f5',
                        borderLeft: color ? `3px solid ${color}` : '3px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {color && (
                          <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        )}
                        <span className="text-zinc-900 text-[13px] font-semibold truncate">
                          {c.author?.username || 'Usuario'}
                        </span>
                        <span className="text-zinc-400 text-[11px]">{formatTime(c.timestamp)}</span>
                      </div>
                      <p className="text-zinc-700 text-[14px] leading-snug break-words">{c.text}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Input fijo abajo */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-zinc-100 shrink-0 bg-white">
          {user ? (
            <>
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Anade un comentario..."
                className="flex-1 bg-zinc-100 text-zinc-900 placeholder:text-zinc-400 px-4 py-3 rounded-full text-[14px] outline-none focus:bg-zinc-200/70 transition-all"
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
              Inicia sesion para comentar
            </button>
          )}
        </form>
      </BottomSheet>

      <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} defaultTab="login" />
    </>
  )
}
