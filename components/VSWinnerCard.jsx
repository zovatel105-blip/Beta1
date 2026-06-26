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
 * votar. Misma medida que la VSContentCard (card 9:16 centrada) y muestra el
 * VÍDEO del ganador de fondo. El borde y el glow lateral se ADAPTAN a la barra
 * de resultados: izquierda = color A hasta el % de A, derecha = color B.
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

  // Degradado que refleja la barra: A (izquierda) y B (derecha), con una zona de
  // transición difuminada alrededor de aPct para que NO se vea una línea de corte.
  const feather = 16
  const lo = Math.max(0, aPct - feather)
  const hi = Math.min(100, aPct + feather)
  const barGradient = `linear-gradient(90deg, ${COLORS.a.primary} 0%, ${COLORS.a.primary} ${lo}%, ${COLORS.b.primary} ${hi}%, ${COLORS.b.primary} 100%)`

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
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center select-none animate-[fadeIn_180ms_ease-out]"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Card 9:16 (misma medida que la VSContentCard). Borde + glow adaptados a la barra. */}
      <div className="relative w-[88vw] max-w-[420px] aspect-[9/16] animate-[winnerPop_280ms_cubic-bezier(0.16,1,0.3,1)]">
        {/* Glow lateral adaptado a la barra (A izquierda / B derecha) */}
        <div
          className="absolute inset-0 rounded-[36px] blur-2xl opacity-75 scale-[1.05] pointer-events-none"
          style={{ background: barGradient }}
        />

        {/* Borde con degradado que refleja la barra */}
        <div className="relative w-full h-full rounded-[28px] p-[2.5px] shadow-[0_18px_60px_-10px_rgba(0,0,0,0.7)]" style={{ background: barGradient }}>
          <div className="relative w-full h-full rounded-[26px] overflow-hidden bg-black">
            {/* Vídeo del ganador de fondo */}
            {winnerVideoUrl ? (
              <video src={winnerVideoUrl} muted loop autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
            ) : winnerImage ? (
              <img src={winnerImage} alt={winnerName} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-black" />
            )}

            {/* Vignette para legibilidad */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/15 to-black/90" />

            {/* Contenido superpuesto */}
            <div className="relative z-10 h-full flex flex-col items-center justify-between py-6 px-5 text-center">
              {/* Top */}
              <div className="flex flex-col items-center gap-2.5">
                <span className="text-white/70 text-[11px] font-bold tracking-[0.4em]">DUEL</span>
                <div
                  className="flex items-center gap-1.5 text-[12px] font-extrabold tracking-wider text-white px-3.5 py-1.5 rounded-full"
                  style={{ background: `${winColor.primary}cc`, boxShadow: `0 0 22px ${winColor.glow}` }}
                >
                  <Trophy size={15} className="stroke-[2.5]" /> WINNER
                </div>
              </div>

              {/* Middle: nombre + porcentaje grande */}
              <div className="flex flex-col items-center">
                {winnerName ? (
                  <h3 className="text-white text-xl font-extrabold drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] max-w-full truncate">{winnerName}</h3>
                ) : null}
                <h4
                  className="text-7xl font-black leading-none text-white"
                  style={{ textShadow: `0 0 28px ${winColor.glow}, 0 2px 12px rgba(0,0,0,0.8)` }}
                >
                  {winnerPercentage}%
                </h4>
              </div>

              {/* Bottom: barra de resultados + acciones */}
              <div className="w-full flex flex-col gap-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold mb-1.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                    <span style={{ color: COLORS.a.primary }}>A · {aPct}%</span>
                    <span className="text-white/60 font-medium">{formatCount(totalVotes)} votes</span>
                    <span style={{ color: COLORS.b.primary }}>B · {bPct}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-white/15">
                    <div className="h-full transition-all duration-700" style={{ width: `${aPct}%`, background: COLORS.a.primary }} />
                    <div className="h-full transition-all duration-700" style={{ width: `${bPct}%`, background: COLORS.b.primary }} />
                  </div>
                  {loserName ? (
                    <p className="text-white/55 text-[11px] mt-1.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">vs {loserName} · {loserPercentage}%</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onShare?.(); onClose?.() }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-semibold text-[13px] py-2.5 rounded-xl active:scale-95 transition-all"
                    >
                      <Share2 size={15} /> Share
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onComments?.(); onClose?.() }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-semibold text-[13px] py-2.5 rounded-xl active:scale-95 transition-all"
                    >
                      <MessageCircle size={15} /> Comments
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onNext?.() }}
                    className="w-full flex items-center justify-center gap-2 text-white font-bold text-sm py-3 rounded-xl active:scale-95 transition-transform"
                    style={{ background: barGradient, boxShadow: `0 8px 24px -6px ${winColor.glow}` }}
                  >
                    Next duel <ChevronDown size={18} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
