'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trophy, Share2, MessageCircle, ChevronDown } from 'lucide-react'

// Colores del diseño (TWYK): opción A morado / opción B azul.
const COLORS = {
  a: { primary: '#A855F7', glow: 'rgba(168,85,247,0.65)' },
  b: { primary: '#3B82F6', glow: 'rgba(59,130,246,0.65)' },
}

function formatCount(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(v)
}

/**
 * VSWinnerCard — overlay de "ganador" que se muestra sobre un duelo (VS) tras
 * votar. Fondo con el vídeo/imagen del ganador + una card de cristal centrada
 * con glow del color del ganador (A morado / B azul), trofeo, porcentaje grande,
 * barra de resultados A vs B y acciones.
 *
 * Interacción:
 *  - Click fuera de la card (backdrop) -> onClose
 *  - Swipe vertical (>60px)            -> onNext
 */
export default function VSWinnerCard({
  visible = false,
  winnerSide = 'a', // 'a' | 'b'
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

  const winColor = COLORS[winnerSide] || COLORS.a
  // Porcentajes alineados a las opciones A/B para la barra de resultados.
  const aPct = winnerSide === 'a' ? winnerPercentage : loserPercentage
  const bPct = winnerSide === 'a' ? loserPercentage : winnerPercentage

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
  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return
    if (touchMoved.current) { touchMoved.current = false; return }
    onClose?.()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-hidden select-none animate-[fadeIn_180ms_ease-out] flex items-center justify-center"
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
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 to-black" />
      )}
      {/* Vignette + tinte del color del ganador */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />
      <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(120% 60% at 50% 18%, ${winColor.glow}, transparent 60%)` }} />

      {/* Card de cristal con glow del color del ganador */}
      <div
        className="relative z-10 w-[88vw] max-w-[380px] rounded-[28px] px-6 pt-7 pb-6 flex flex-col items-center text-center bg-white/[0.06] backdrop-blur-2xl border border-white/15 animate-[winnerPop_280ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{ boxShadow: `0 0 0 1.5px ${winColor.primary}55, 0 18px 60px -10px ${winColor.glow}, 0 8px 30px rgba(0,0,0,0.6)` }}
      >
        {/* Etiqueta superior */}
        <span className="text-white/55 text-[11px] font-bold tracking-[0.4em]">DUELO</span>

        {/* Trofeo con halo */}
        <div
          className="mt-4 w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${winColor.primary}, ${winColor.primary}99)`, boxShadow: `0 0 28px 2px ${winColor.glow}` }}
        >
          <Trophy size={30} className="text-white stroke-[2]" />
        </div>

        {/* Badge GANADOR */}
        <div
          className="mt-3 text-[12px] font-extrabold tracking-wider text-white px-4 py-1 rounded-full"
          style={{ background: `${winColor.primary}33`, border: `1px solid ${winColor.primary}` }}
        >
          GANADOR
        </div>

        {/* Nombre ganador */}
        {winnerName ? (
          <h3 className="mt-3 text-white text-xl font-extrabold drop-shadow-lg max-w-full truncate">{winnerName}</h3>
        ) : null}

        {/* Porcentaje grande */}
        <h4
          className="mt-1 text-6xl font-black leading-none"
          style={{ color: '#fff', textShadow: `0 0 24px ${winColor.glow}` }}
        >
          {winnerPercentage}%
        </h4>

        {/* Barra de resultados A vs B */}
        <div className="w-full mt-5">
          <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
            <span style={{ color: COLORS.a.primary }}>A · {aPct}%</span>
            <span className="text-white/45 font-medium">{formatCount(totalVotes)} votos</span>
            <span style={{ color: COLORS.b.primary }}>B · {bPct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-white/10">
            <div className="h-full transition-all duration-700" style={{ width: `${aPct}%`, background: COLORS.a.primary }} />
            <div className="h-full transition-all duration-700" style={{ width: `${bPct}%`, background: COLORS.b.primary }} />
          </div>
          {loserName ? (
            <p className="text-white/40 text-[11px] mt-2">vs {loserName} · {loserPercentage}%</p>
          ) : null}
        </div>

        {/* Acciones */}
        <div className="w-full mt-6 flex flex-col gap-2.5">
          <div className="flex gap-2.5">
            <button
              onClick={(e) => { e.stopPropagation(); onShare?.(); onClose?.() }}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-3 rounded-2xl active:scale-95 transition-all"
            >
              <Share2 size={16} /> Compartir
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onComments?.(); onClose?.() }}
              className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm py-3 rounded-2xl active:scale-95 transition-all"
            >
              <MessageCircle size={16} /> Comentarios
            </button>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onNext?.() }}
            className="w-full flex items-center justify-center gap-2 text-white font-bold text-sm py-3.5 rounded-2xl active:scale-95 transition-transform"
            style={{ background: `linear-gradient(135deg, ${COLORS.a.primary}, ${COLORS.b.primary})`, boxShadow: `0 8px 24px -6px ${winColor.glow}` }}
          >
            Siguiente duelo <ChevronDown size={18} className="stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
