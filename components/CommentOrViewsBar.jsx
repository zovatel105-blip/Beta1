'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import QuickCommentInput from './QuickCommentInput'

// Cada cuántos ms se alterna entre la barra de comentar y la de reproducciones
// (petición del usuario: "cada pocos segundos", 3-4s).
const ROTATE_MS = 3600

function formatViews(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(v)
}

/**
 * CommentOrViewsBar — SOLO para el visor de publicaciones del PROPIO perfil
 * (ver PostViewer en ProfilePage.jsx, prop `viewsCount`). Envuelve la barra
 * de "Añadir comentario" (QuickCommentInput) y una nueva barra de
 * "reproducciones", alternando automáticamente entre ambas cada ~3.6s con un
 * fundido suave (cross-fade). Mientras el usuario esté escribiendo (input
 * enfocado o con texto sin enviar) se queda FIJO en modo comentario -no debe
 * interrumpir la escritura- y retoma la alternancia al dejar de escribir.
 * Ambas barras comparten exactamente el mismo hueco/posicionamiento (las dos
 * son `absolute` sobre el mismo contenedor relativo del Slide, igual que ya
 * hacía QuickCommentInput a solas), así que no afecta a ningún otro cálculo
 * de layout (COMMENT_BAR_RESERVE en CarouselSlide.jsx/DuetSlide.jsx sigue
 * siendo válido para ambos modos).
 */
export default function CommentOrViewsBar({ postId, votedSide, onPosted, onRequireAuth, views = 0 }) {
  const [mode, setMode] = useState('comment') // 'comment' | 'views'
  const lockedRef = useRef(false) // true mientras el usuario escribe/enfoca el campo

  useEffect(() => {
    const id = setInterval(() => {
      if (lockedRef.current) return
      setMode((m) => (m === 'comment' ? 'views' : 'comment'))
    }, ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  const handleActivityChange = useCallback((active) => {
    lockedRef.current = active
    if (active) setMode('comment')
  }, [])

  return (
    <>
      <div
        className="transition-opacity duration-300"
        style={{ opacity: mode === 'comment' ? 1 : 0, pointerEvents: mode === 'comment' ? 'auto' : 'none' }}
      >
        <QuickCommentInput
          postId={postId}
          votedSide={votedSide}
          onPosted={onPosted}
          onRequireAuth={onRequireAuth}
          onActivityChange={handleActivityChange}
        />
      </div>
      <div
        className="transition-opacity duration-300"
        style={{ opacity: mode === 'views' ? 1 : 0, pointerEvents: 'none' }}
        aria-hidden={mode !== 'views'}
      >
        <ViewsBar views={views} />
      </div>
    </>
  )
}

// Misma posición/paddings exactos que la píldora SIN enfocar de
// QuickCommentInput (bg-black/45, rounded-full, py-1.5), para que el
// cross-fade se sienta como una sola barra que "cambia de contenido" en vez
// de dos elementos distintos.
function ViewsBar({ views }) {
  return (
    <div
      className="absolute left-0 right-0 z-20 px-3"
      style={{ bottom: 0, paddingTop: 10, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
    >
      <div className="flex items-center justify-center gap-2 bg-black/45 backdrop-blur-md border border-white/15 rounded-full pl-4 pr-4 py-1.5 shadow-lg w-full">
        <Play className="w-4 h-4 text-white/80 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} />
        <span className="text-white/90 text-[14px] font-medium truncate">{formatViews(views)} plays</span>
      </div>
    </div>
  )
}
