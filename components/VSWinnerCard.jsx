'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trophy, Share2, MessageCircle, ChevronDown } from 'lucide-react'

function formatCount(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(v)
}

/**
 * VSWinnerCard — overlay tipo "winner card" que se muestra sobre un duelo (VS)
 * tras votar. Muestra el ganador (vídeo/avatar de fondo), su porcentaje, votos
 * totales y el perdedor con su %. Acciones: Compartir, Comentarios y Siguiente.
 *
 * Interacción:
 *  - Click en el fondo (backdrop) -> onClose
 *  - Swipe vertical (>60px)       -> onNext (avanza al siguiente duelo)
 */
export default function VSWinnerCard({
  visible = false,
  winnerName = '',
  winnerPercentage = 0,
  winnerImage = null,
  winnerVideoUrl = null,
  loserName = '',
  loserPercentage = 0,
  totalVotes = 0,
  onShare,
  onComments,
  onNext,
  onClose,
}) {
  const touchStartY = useRef(null)
  const touchStartX = useRef(null)
  const touchMoved = useRef(false)
  const SWIPE_THRESHOLD = 60

  if (typeof document === 'undefined' || !visible) return null

  const handleTouchStart = (e) => {
    const t = e.touches?.[0]
    if (!t) return
    touchStartY.current = t.clientY
    touchStartX.current = t.clientX
    touchMoved.current = false
  }
  const handleTouchMove = (e) => {
    if (touchStartY.current === null) return
    const t = e.touches?.[0]
    if (!t) return
    const dy = Math.abs(t.clientY - touchStartY.current)
    const dx = Math.abs(t.clientX - touchStartX.current)
    if (dy > 8 || dx > 8) touchMoved.current = true
  }
  const handleTouchEnd = (e) => {
    if (touchStartY.current === null) return
    const t = e.changedTouches?.[0]
    if (!t) { touchStartY.current = null; return }
    const dy = touchStartY.current - t.clientY // positivo = swipe arriba
    const dx = Math.abs(t.clientX - touchStartX.current)
    touchStartY.current = null
    touchStartX.current = null
    if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > dx) onNext?.()
  }
  const handleBackdropClick = () => {
    if (touchMoved.current) { touchMoved.current = false; return }
    onClose?.()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black overflow-hidden select-none animate-[fadeIn_180ms_ease-out]"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Fondo: vídeo o imagen del ganador */}
      {winnerVideoUrl ? (
        <video
          src={winnerVideoUrl}
          muted
          loop
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : winnerImage ? (
        <img src={winnerImage} alt={winnerName} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black" />
      )}

      {/* Vignette para legibilidad */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/90" />

      {/* Contenido */}
      <div
        className="relative z-10 w-full h-full flex flex-col items-center justify-between px-6 pb-16 text-center"
        style={{ paddingTop: 'max(4rem, env(safe-area-inset-top))' }}
      >
        {/* Top */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-white/70 text-xs font-bold tracking-[0.35em]">DUELO</h1>
          <div className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-extrabold text-sm px-4 py-1.5 rounded-full shadow-lg">
            <Trophy size={16} className="stroke-[2.5]" /> GANADOR
          </div>
        </div>

        {/* Middle */}
        <div className="flex flex-col items-center gap-1">
          {winnerName ? (
            <h3 className="text-white text-2xl font-extrabold drop-shadow-lg max-w-[80vw] truncate">{winnerName}</h3>
          ) : null}
          <h4 className="text-white text-7xl font-black drop-shadow-2xl leading-none">{winnerPercentage}%</h4>
          <p className="text-white/80 text-sm mt-3">{formatCount(totalVotes)} votos</p>
          {loserName ? (
            <p className="text-white/50 text-xs mt-0.5">{loserName} · {loserPercentage}%</p>
          ) : null}
        </div>

        {/* Bottom: acciones */}
        <div className="w-full max-w-xs flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onShare?.(); onClose?.() }}
              className="flex-1 flex items-center justify-center gap-2 bg-white/15 backdrop-blur text-white font-semibold text-sm py-3 rounded-2xl active:scale-95 transition-transform"
            >
              <Share2 size={16} /> Compartir
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onComments?.(); onClose?.() }}
              className="flex-1 flex items-center justify-center gap-2 bg-white/15 backdrop-blur text-white font-semibold text-sm py-3 rounded-2xl active:scale-95 transition-transform"
            >
              <MessageCircle size={16} /> Comentarios
            </button>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onNext?.() }}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold text-sm py-3.5 rounded-2xl shadow-lg active:scale-95 transition-transform"
          >
            Siguiente duelo <ChevronDown size={18} className="stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
