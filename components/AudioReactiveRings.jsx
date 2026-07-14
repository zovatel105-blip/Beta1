'use client'

import { useEffect, useRef } from 'react'
import { getSharedAudioContext } from '@/lib/audioContext'

// Umbral por debajo del cual se considera "silencio" (0..1, sobre el nivel
// medio de amplitud de frecuencia). Si el nivel se mantiene por debajo de
// esto durante SILENCE_FRAMES fotogramas consecutivos, los anillos se
// ocultan (opacity 0) aunque `active` sea true -> "solo funcionan cuando hay
// audio de verdad", no solo cuando el elemento debería estar sonando.
const SILENCE_THRESHOLD = 0.02
const SILENCE_FRAMES = 40 // ~0.6-0.7s a 60fps

/**
 * AudioReactiveRings — anillos circulares que emanan del disco de música al
 * RITMO REAL del audio (Web Audio API AnalyserNode), en vez de una animación
 * CSS en bucle fijo sin relación con el sonido. Solo se muestran cuando:
 *   1) `active` es true (el elemento debería estar sonando: no muteado, no
 *      pausado, tarjeta activa, etc. — lo decide el componente padre), Y
 *   2) el ANÁLISIS REAL del audio detecta amplitud > umbral de silencio (así
 *      un vídeo sin pista de audio, o música que aún no cargó, no muestra
 *      anillos "fantasma").
 *
 * `mediaEl` es el <audio>/<video> que está sonando de verdad en este momento
 * (el preview de música si el post tiene una adjunta, o el propio vídeo si
 * no). Se conecta UNA sola vez por elemento (cacheado en el propio nodo DOM,
 * ya que un HTMLMediaElement solo admite un MediaElementSourceNode en toda su
 * vida) y se reutiliza si el mismo elemento vuelve a activarse.
 */
export default function AudioReactiveRings({ mediaEl, active }) {
  const ring1Ref = useRef(null)
  const ring2Ref = useRef(null)
  const ring3Ref = useRef(null)
  const rafRef = useRef(0)
  const levelRef = useRef(0)
  const silentFramesRef = useRef(0)

  useEffect(() => {
    if (!active || !mediaEl) return
    const ctx = getSharedAudioContext()
    if (!ctx) return

    let analyser
    let data
    try {
      // Cacheado en el propio elemento: createMediaElementSource() solo se
      // puede llamar UNA VEZ por elemento en toda su vida (si la tarjeta se
      // vuelve a activar reutilizamos el analyser ya creado).
      if (!mediaEl.__twykAnalyser) {
        const source = ctx.createMediaElementSource(mediaEl)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        analyser.smoothingTimeConstant = 0.6
        source.connect(analyser)
        // IMPORTANTE: conectar a destination para que el audio SIGA
        // sonando con normalidad (crear un MediaElementSource desvía TODA la
        // salida del elemento hacia el grafo de Web Audio; si no se conecta
        // a destination, el audio se silenciaría).
        analyser.connect(ctx.destination)
        mediaEl.__twykAnalyser = analyser
      } else {
        analyser = mediaEl.__twykAnalyser
      }
      data = new Uint8Array(analyser.frequencyBinCount)
    } catch {
      // CORS bloqueado / elemento no compatible -> degradación silenciosa,
      // sin anillos reactivos, sin romper el resto de la tarjeta.
      return
    }

    let cancelled = false
    silentFramesRef.current = 0

    const applyStyle = (visible, lvl) => {
      const op1 = visible ? Math.min(1, 0.22 + lvl * 0.85) : 0
      const scale1 = 1 + lvl * 0.5
      const scale2 = 1 + lvl * 0.8
      const scale3 = 1 + lvl * 1.15
      if (ring1Ref.current) { ring1Ref.current.style.opacity = op1; ring1Ref.current.style.transform = `scale(${scale1})` }
      if (ring2Ref.current) { ring2Ref.current.style.opacity = op1 * 0.7; ring2Ref.current.style.transform = `scale(${scale2})` }
      if (ring3Ref.current) { ring3Ref.current.style.opacity = op1 * 0.45; ring3Ref.current.style.transform = `scale(${scale3})` }
    }

    const tick = () => {
      if (cancelled) return
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const avg = sum / data.length / 255 // 0..1
      // Suavizado exponencial (evita saltos brutos entre fotogramas).
      levelRef.current = levelRef.current * 0.7 + avg * 0.3

      if (levelRef.current < SILENCE_THRESHOLD) {
        silentFramesRef.current += 1
      } else {
        silentFramesRef.current = 0
      }
      const isSilent = silentFramesRef.current > SILENCE_FRAMES
      applyStyle(!isSilent, levelRef.current)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      // Oculta de inmediato al desactivarse (no dejar anillos "congelados").
      if (ring1Ref.current) ring1Ref.current.style.opacity = 0
      if (ring2Ref.current) ring2Ref.current.style.opacity = 0
      if (ring3Ref.current) ring3Ref.current.style.opacity = 0
    }
  }, [active, mediaEl])

  if (!active || !mediaEl) return null

  return (
    <>
      <span ref={ring1Ref} className="audio-ring" />
      <span ref={ring2Ref} className="audio-ring" />
      <span ref={ring3Ref} className="audio-ring" />
    </>
  )
}
