'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MOCK_FEED } from '@/lib/mockFeed'
import VotingCard from './VotingCard'

type Side = 'a' | 'b'

// ──────────────────────────────────────────────────────────────────────────
// 🚨 REGLA #4 — SMART PRELOADING
// Dedupe a nivel de módulo: cada URL se precarga UNA sola vez por sesión.
// Vídeos: <link rel="prefetch" as="video"> -> el navegador lo descarga con
//   prioridad BAJA en hueco de red libre, sin bloquear el main thread ni
//   competir con el vídeo activo. Al activarse la tarjeta, el src se sirve
//   desde la caché HTTP (arranque instantáneo).
// Imágenes: new Image() dispara la descarga + decodificación async fuera del
//   árbol de render.
// ──────────────────────────────────────────────────────────────────────────
const prefetched = new Set<string>()

function prefetchMedia(url: string | undefined, kind: 'video' | 'image') {
  if (!url || prefetched.has(url)) return
  prefetched.add(url)
  if (kind === 'image') {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
  } else {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'video'
    link.href = url
    document.head.appendChild(link)
  }
}

/**
 * VotingFeed — motor de scroll vertical de alto rendimiento (nivel TikTok Web).
 *
 * 🚨 REGLA #1 — VENTANA DOM DE 3:
 * Solo se montan VotingCard en activeIndex-1, activeIndex y activeIndex+1.
 * El resto de índices devuelve null. Los <section> contenedores (vacíos, sin
 * media, sin listeners propios) se mantienen para preservar la geometría del
 * scroll nativo (scrollHeight estable -> el snap nunca salta). Un <section>
 * vacío cuesta ~0 RAM; un <video> montado cuesta un decoder de hardware.
 *
 * 🚨 REGLA #3 — ZERO-JANK STATE MANAGEMENT:
 * CERO listeners de scroll. Un ÚNICO IntersectionObserver (threshold 0.7)
 * observa los 12 slots; setActiveIndex se dispara SOLO al cruzar el umbral
 * del 70% (1 setState por cambio de tarjeta, nunca por píxel desplazado).
 * El scroll en sí es 100% nativo del compositor del navegador: ningún código
 * JS corre durante el gesto -> imposible perder frames por React.
 */
const VotingFeed = () => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const slotRefs = useRef<(HTMLElement | null)[]>([])
  // Espejo en ref del índice activo: el observer y onAdvance leen SIEMPRE el
  // valor actual sin re-suscribirse (callbacks estables -> React.memo intacto).
  const activeIndexRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(0)

  // Votos en Map dentro de un ref: persisten cuando las tarjetas salen de la
  // ventana de 3 y se desmontan, sin provocar ni un solo re-render del feed.
  const votesRef = useRef<Map<string, Side>>(new Map())
  const getVote = useCallback((id: string): Side | null => votesRef.current.get(id) ?? null, [])
  const setVote = useCallback((id: string, side: Side) => {
    votesRef.current.set(id, side)
  }, [])

  // Callback ESTABLE de auto-avance (lee el índice desde el ref, deps vacías).
  const onAdvance = useCallback(() => {
    const el = containerRef.current
    const next = activeIndexRef.current + 1
    if (!el || next >= MOCK_FEED.length) return
    // scrollTo nativo con smooth: la animación corre en el compositor, no en JS.
    el.scrollTo({ top: next * el.clientHeight, behavior: 'smooth' })
  }, [])

  // ÚNICO IntersectionObserver para todo el feed (Regla #3).
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Solo reaccionamos cuando un slot SUPERA el 70% de visibilidad.
          if (!entry.isIntersecting) continue
          const idx = Number((entry.target as HTMLElement).dataset.index)
          if (!Number.isNaN(idx) && idx !== activeIndexRef.current) {
            activeIndexRef.current = idx
            setActiveIndex(idx) // 1 único setState por cambio de tarjeta
          }
        }
      },
      { root, threshold: 0.7 }
    )
    for (const slot of slotRefs.current) {
      if (slot) io.observe(slot)
    }
    return () => io.disconnect()
  }, [])

  // 🚨 REGLA #4 — Precarga silenciosa del SIGUIENTE duelo al cambiar de tarjeta.
  useEffect(() => {
    const next = MOCK_FEED[activeIndex + 1]
    if (!next) return
    for (const opt of [next.optionA, next.optionB]) {
      if (opt.poster) prefetchMedia(opt.poster, 'image')
      prefetchMedia(opt.src, opt.type)
    }
  }, [activeIndex])

  return (
    <div
      ref={containerRef}
      // h-[100dvh]: altura dinámica del viewport -> cero saltos cuando la barra
      //   de URL del navegador móvil se colapsa/expande.
      // snap-y snap-mandatory: scroll-snap NATIVO del compositor (0 JS por frame).
      // [contain:strict]: aísla layout+paint+size del resto de la página; el
      //   navegador nunca recalcula nada fuera de este subárbol durante el scroll.
      // no-scrollbar: oculta scrollbars (webkit + firefox).
      // overscroll-y-contain: bloquea el pull-to-refresh accidental del navegador.
      className="fixed inset-0 h-[100dvh] w-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar bg-black text-white [contain:strict] overscroll-y-contain"
    >
      {MOCK_FEED.map((item, i) => {
        // 🚨 REGLA #1 — máximo 3 tarjetas montadas (anterior, activa, siguiente).
        const inWindow = Math.abs(i - activeIndex) <= 1
        return (
          <section
            key={item.id}
            data-index={i}
            ref={(el) => {
              slotRefs.current[i] = el
            }}
            className="h-[100dvh] w-full snap-start snap-always relative flex"
          >
            {inWindow ? (
              <VotingCard
                item={item}
                index={i}
                total={MOCK_FEED.length}
                isActive={i === activeIndex}
                onAdvance={onAdvance}
                getVote={getVote}
                setVote={setVote}
              />
            ) : null /* fuera de la ventana: slot vacío -> 0 media, 0 decoders */}
          </section>
        )
      })}
    </div>
  )
}

export default VotingFeed
