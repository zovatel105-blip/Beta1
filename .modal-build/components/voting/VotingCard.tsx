'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { FeedItem, MediaOption } from '@/lib/mockFeed'

type Side = 'a' | 'b'

interface VotingCardProps {
  item: FeedItem
  index: number
  total: number
  isActive: boolean
  /** Callback ESTABLE (useCallback sin deps variables) -> React.memo efectivo */
  onAdvance: () => void
  getVote: (id: string) => Side | null
  setVote: (id: string, side: Side) => void
}

interface MediaSideProps {
  option: MediaOption
  side: Side
  isActive: boolean
  voted: Side | null
  onVote: (side: Side) => void
}

/**
 * MediaSide — un lado (A o B) del duelo. Renderiza <video> o <img> NATIVOS.
 *
 * 🚨 REGLA #2 — LIBERACIÓN AGRESIVA DEL DECODER:
 * Los navegadores móviles NO liberan el decoder de hardware con un simple
 * pause(). Mantener 3-6 <video> con src asignado agota el presupuesto de
 * decoders (4-6 en Android/iOS) y provoca stutters y pantallas negras.
 * Solución: el atributo src NUNCA se declara en JSX; se asigna de forma
 * imperativa SOLO cuando la tarjeta está activa, y se elimina
 * (removeAttribute('src') + load()) en cuanto deja de estarlo o se desmonta.
 * load() tras quitar el src es lo que fuerza al navegador a abortar la
 * descarga y devolver el decoder + RAM al sistema.
 */
const MediaSide = memo(function MediaSide({ option, side, isActive, voted, onVote }: MediaSideProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v || option.type !== 'video') return

    if (isActive) {
      // Re-asignar el src solo si fue liberado (evita re-descargas en re-renders).
      if (!v.getAttribute('src')) {
        v.src = option.src
        v.load()
      }
      // play() devuelve una promesa: capturamos el rechazo (política de autoplay)
      // para no generar unhandled rejections que ensucien el main thread.
      const p = v.play()
      if (p !== undefined) p.catch(() => {})
    } else {
      // Tarjeta adyacente (pre-montada): solo muestra el poster. CERO decoders.
      v.pause()
      v.removeAttribute('src')
      v.load()
    }

    return () => {
      // Desmontaje (sale de la ventana de 3): liberación garantizada.
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
  }, [isActive, option.src, option.type])

  const isWinner = voted === side
  const isLoser = voted !== null && voted !== side

  return (
    <div
      className={[
        'relative w-1/2 h-full overflow-hidden bg-zinc-900',
        // Micro-interacción de voto: el lado elegido escala sutilmente (GPU-only:
        // transform no dispara layout/paint), el perdedor se atenúa.
        'transition-[transform,opacity,filter] duration-300 ease-out will-change-transform',
        isWinner ? 'scale-105 z-10' : '',
        isLoser ? 'opacity-40 grayscale-[40%]' : '',
      ].join(' ')}
    >
      {option.type === 'video' ? (
        <video
          ref={videoRef}
          // ⚠️ SIN atributo src en JSX: gestión 100% imperativa (Regla #2).
          poster={option.poster}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img
          src={option.src}
          alt={option.label}
          // decoding async: la decodificación JPEG ocurre fuera del main thread
          // -> no roba ms al frame budget de 8.3ms (120fps) durante el scroll.
          decoding="async"
          loading="eager"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover select-none"
        />
      )}

      {/* Gradiente inferior para legibilidad del botón (estático: capa compuesta una sola vez) */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

      {/* Checkmark central al votar este lado */}
      {isWinner && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-emerald-500/90 backdrop-blur-sm flex items-center justify-center animate-[likePop_700ms_ease-out_forwards] shadow-2xl">
            <Check className="w-9 h-9 text-white" strokeWidth={3} />
          </div>
        </div>
      )}

      {/* Botón de voto semitransparente sobre la base del media */}
      <div className="absolute inset-x-0 bottom-0 pb-[max(env(safe-area-inset-bottom),20px)] px-3 flex flex-col items-center gap-2">
        <span className="text-[13px] font-semibold text-white/90 drop-shadow">{option.label}</span>
        <button
          type="button"
          onClick={() => onVote(side)}
          disabled={voted !== null}
          className={[
            'w-full max-w-[150px] h-11 rounded-full font-bold text-sm tracking-wide',
            'backdrop-blur-md border transition-all duration-300 ease-out active:scale-95',
            isWinner
              ? 'bg-emerald-500 border-emerald-400 text-white scale-105 shadow-lg shadow-emerald-500/30'
              : voted !== null
                ? 'bg-white/5 border-white/10 text-white/40'
                : 'bg-white/15 border-white/25 text-white hover:bg-white/25',
          ].join(' ')}
        >
          {isWinner ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="w-4 h-4" strokeWidth={3} /> Votado
            </span>
          ) : (
            `Votar ${side === 'a' ? 'A' : 'B'}`
          )}
        </button>
      </div>
    </div>
  )
})

/**
 * VotingCard — tarjeta de duelo 50/50 (A | B) a pantalla completa.
 *
 * 🚨 REGLA #5 — RENDER OPTIMIZATION:
 * Envuelta en React.memo. Todas las props son primitivas (index, total,
 * isActive), referencias estables de módulo (item del MOCK_FEED) o callbacks
 * memoizados con useCallback en el feed (onAdvance, getVote, setVote).
 * Resultado: la tarjeta SOLO re-renderiza cuando cambia isActive o su voto,
 * nunca por renders colaterales del padre durante el scroll.
 */
const VotingCard = memo(function VotingCard({ item, index, total, isActive, onAdvance, getVote, setVote }: VotingCardProps) {
  // El voto vive en un Map (ref) del feed: sobrevive al desmontaje cuando la
  // tarjeta sale de la ventana de 3 y se restaura al volver a montarse.
  const [voted, setVoted] = useState<Side | null>(() => getVote(item.id))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Limpieza del timer de auto-avance si la tarjeta se desmonta antes de 600ms.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleVote = useCallback(
    (side: Side) => {
      if (timerRef.current) return // ya votado: ignora taps repetidos
      setVoted(side)
      setVote(item.id, side)
      // Auto-avance a los 600ms: deja respirar la animación de la marca de
      // verificación y luego desplaza el scroll-snap al siguiente duelo.
      timerRef.current = setTimeout(() => {
        onAdvance()
      }, 600)
    },
    [item.id, setVote, onAdvance]
  )

  return (
    <div className="relative w-full h-full flex bg-black">
      <MediaSide option={item.optionA} side="a" isActive={isActive} voted={voted} onVote={handleVote} />

      {/* Separador vertical de 1px entre ambos lados */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10 pointer-events-none" />

      <MediaSide option={item.optionB} side="b" isActive={isActive} voted={voted} onVote={handleVote} />

      {/* Título del duelo */}
      <div className="absolute top-0 inset-x-0 z-20 pt-[max(env(safe-area-inset-top),16px)] pb-8 px-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <p className="text-center text-[15px] font-bold text-white drop-shadow-md">{item.title}</p>
        <p className="text-center text-[11px] text-white/50 mt-0.5 font-medium">
          {index + 1} / {total}
        </p>
      </div>

      {/* Badge VS — glassmorphism, centrado absoluto */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/25 shadow-2xl flex items-center justify-center">
          <span className="text-lg font-black italic text-white tracking-tighter drop-shadow">VS</span>
        </div>
      </div>
    </div>
  )
})

export default VotingCard
