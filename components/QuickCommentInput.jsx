'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import Avatar from './Avatar'

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
 *
 * Al ENFOCAR el campo (petición del usuario, con imagen de referencia de
 * TikTok pero "con el estilo de mi barra"): se convierte en una tarjeta algo
 * más grande con el avatar propio a la izquierda (igual estructura que la
 * referencia -avatar + input + enviar-, pero SIN fila de emojis/iconos extra
 * y con el estilo oscuro ya existente de la app, no el blanco de la
 * referencia). Además se ancla EXACTAMENTE encima del teclado nativo vía la
 * Virtual Keyboard API (Chrome/Android) o, si no está disponible (iOS
 * Safari), vía `window.visualViewport` — el contenido de la publicación de
 * detrás NO debe moverse/encogerse (eso se corrige aparte en ProfilePage.jsx,
 * sustituyendo la unidad `100dvh` -reactiva al teclado- por `h-full`, fija).
 */
export default function QuickCommentInput({ postId, votedSide = null, onPosted, onRequireAuth }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)
  const [kbInset, setKbInset] = useState(0) // px que el teclado ocupa desde abajo
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  // Ancla la barra JUSTO encima del teclado nativo, sin depender de ninguna
  // unidad de viewport reactiva (evita que el contenido de detrás se mueva).
  useEffect(() => {
    // Chrome/Android: Virtual Keyboard API — le pedimos al navegador que el
    // teclado SUPERPONGA el contenido (en vez de encoger el viewport), y
    // leemos su geometría real para el offset exacto.
    const vk = typeof navigator !== 'undefined' ? navigator.virtualKeyboard : null
    if (vk) {
      try { vk.overlaysContent = true } catch { /* ignore */ }
      const onGeometryChange = () => {
        setKbInset(Math.round(vk.boundingRect?.height || 0))
      }
      vk.addEventListener('geometrychange', onGeometryChange)
      return () => vk.removeEventListener('geometrychange', onGeometryChange)
    }
    // Fallback (iOS Safari y otros): la diferencia entre el alto de la
    // ventana y el visualViewport (que SÍ se reduce con el teclado) es la
    // altura real del teclado.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0))
      setKbInset(inset)
    }
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    onResize()
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])

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
      ref={wrapRef}
      onSubmit={handleSubmit}
      onClick={stop}
      onPointerDown={stop}
      onPointerUp={stop}
      className="absolute left-0 right-0 z-20 px-3 pointer-events-auto transition-[bottom] duration-150 ease-out"
      style={{
        bottom: kbInset > 0 ? kbInset : 0,
        paddingTop: 10,
        paddingBottom: kbInset > 0 ? 10 : 'max(env(safe-area-inset-bottom), 12px)',
      }}
    >
      <div
        className={cn(
          'flex items-center gap-2 border shadow-lg transition-all duration-150',
          focused
            ? 'bg-[#141416]/95 backdrop-blur-md border-white/15 rounded-2xl pl-2 pr-1.5 py-2'
            : 'bg-black/45 backdrop-blur-md border-white/15 rounded-full pl-4 pr-1.5 py-1.5'
        )}
      >
        {focused && (
          <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 shrink-0">
            <Avatar src={user?.avatarUrl} alt={user?.username || ''} className="w-full h-full rounded-full" />
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onClick={stop}
          onFocus={(e) => { stop(e); setFocused(true) }}
          onBlur={() => setFocused(false)}
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
