'use client'

import { useEffect, useRef } from 'react'
import { getSharedAudioContext } from '@/lib/audioContext'

// Número de trazos radiales alrededor del disco (más trazos = anillo más fino).
const TICKS = 40
// Geometría en unidades del viewBox (coincide 1:1 con los px del contenedor
// de 40x40 del disco de música -> viewBox "0 0 40 40", centro en (20,20)).
const CENTER = 20
const BASE_R = 16 // radio donde EMPIEZA cada trazo (justo fuera del borde del disco)
const MIN_LEN = 1.6 // largo de un trazo en reposo (aspecto "punteado", como en la referencia)
const MAX_LEN = 15 // largo máximo de un trazo en un pico de audio ("espiga")

// ¿El elemento reproduce un recurso de OTRO origen (p.ej. la URL de preview
// de iTunes de una canción adjunta, servida desde un CDN externo)? Es clave
// para decidir si es seguro analizarlo con Web Audio API (ver más abajo).
function isCrossOrigin(mediaEl) {
  try {
    const src = mediaEl?.currentSrc || mediaEl?.src
    if (!src || typeof window === 'undefined') return false
    return new URL(src, window.location.origin).origin !== window.location.origin
  } catch {
    // Si no se puede determinar, se trata como cruzado (opción más segura:
    // preferir que el audio SUENE aunque el anillo no reaccione al ritmo
    // real, antes que arriesgarse a silenciarlo).
    return true
  }
}

// Construye el `d` de un único <path> con UN trazo (M...L...) por cada tick:
// un segmento radial corto desde BASE_R hasta BASE_R + lengths[i]. Con
// stroke-linecap="round" cada trazo se ve como una "rayita" con puntas
// redondeadas (igual que la referencia: círculo punteado con algunas
// espigas más largas sobresaliendo).
function buildTicksPath(lengths) {
  const n = lengths.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const x1 = (CENTER + cos * BASE_R).toFixed(2)
    const y1 = (CENTER + sin * BASE_R).toFixed(2)
    const x2 = (CENTER + cos * (BASE_R + lengths[i])).toFixed(2)
    const y2 = (CENTER + sin * (BASE_R + lengths[i])).toFixed(2)
    d += `M ${x1} ${y1} L ${x2} ${y2} `
  }
  return d.trim()
}
const RESTING_PATH = buildTicksPath(new Array(TICKS).fill(MIN_LEN))

/**
 * AudioReactiveRings — UN solo anillo hecho de trazos radiales cortos (estilo
 * ecualizador circular / "sound wave ring", referencia visual compartida por
 * el usuario: círculo punteado con algunas espigas que sobresalen al ritmo
 * de la música), en vez de los 3 anillos concéntricos que solo se escalaban
 * uniformemente. Cada trazo reacciona a su PROPIA banda de frecuencia (o a
 * una fase distinta en el modo de respaldo), así que en cada fotograma unos
 * pocos trazos "saltan" hacia afuera mientras el resto queda corto — el
 * efecto de espigas puntuales de la referencia, no una onda suave uniforme.
 * Visible siempre que `active` sea true (tarjeta activa, sonando, sin
 * overlays encima); no se oculta del todo en silencio (el círculo punteado
 * de base queda sutilmente visible, igual que en la referencia).
 *
 * `mediaEl` es el <audio>/<video> que está sonando de verdad en este momento
 * (el preview de música si el post tiene una adjunta, o el propio vídeo si
 * no). Se conecta UNA sola vez por elemento (cacheado en el propio nodo DOM,
 * ya que un HTMLMediaElement solo admite un MediaElementSourceNode en toda su
 * vida) y se reutiliza si el mismo elemento vuelve a activarse.
 *
 * BUG FIX previo (usuario: "en las publicaciones 1vs1 con música no se
 * escucha el audio"): la música adjunta es la URL de preview de iTunes (CDN
 * externo, OTRO origen). Conectar un elemento de OTRO ORIGEN sin CORS a un
 * MediaElementAudioSourceNode SILENCIA POR COMPLETO su salida de audio hacia
 * `destination` (comportamiento de seguridad del propio estándar Web Audio
 * API) — el audio "se reproduce" (currentTime avanza, no hay error) pero NO
 * se oye NADA. FIX: si el elemento es de OTRO ORIGEN, NUNCA se envuelve en
 * Web Audio API (se evita createMediaElementSource por completo, dejando que
 * el audio se reproduzca por la vía nativa del navegador) y el anillo usa una
 * animación de respaldo (pseudo-aleatoria por trazo, sin analizar el audio
 * real) en vez de quedar apagado.
 */
export default function AudioReactiveRings({ mediaEl, active }) {
  const pathRef = useRef(null)
  const rafRef = useRef(0)
  const levelsRef = useRef(new Float32Array(TICKS)) // nivel suavizado POR TRAZO (envolvente ataque-rápido/caída-lenta)

  useEffect(() => {
    if (!active || !mediaEl) return

    const applyPath = (lengths) => {
      const el = pathRef.current
      if (!el) return
      el.setAttribute('d', buildTicksPath(lengths))
    }

    // Recurso de OTRO ORIGEN (p.ej. música de iTunes): NUNCA se conecta a Web
    // Audio API (silenciaría el audio real, ver comentario del componente).
    // Animación de respaldo: cada trazo "pulsa" de forma pseudo-aleatoria
    // (producto de 2 senoides con periodos distintos por trazo), sin
    // análisis real, para imitar espigas puntuales en vez de una onda uniforme.
    if (isCrossOrigin(mediaEl)) {
      let cancelled = false
      const t0 = performance.now()
      const tickFallback = () => {
        if (cancelled) return
        const t = (performance.now() - t0) / 1000
        const lengths = new Array(TICKS)
        for (let i = 0; i < TICKS; i++) {
          const raw = Math.max(0, Math.sin(t * 2.6 + i * 0.7) * Math.sin(t * 1.1 + i * 0.33))
          const shaped = Math.pow(raw, 1.6) // solo los picos fuertes generan espigas largas
          lengths[i] = MIN_LEN + shaped * (MAX_LEN - MIN_LEN)
        }
        applyPath(lengths)
        rafRef.current = requestAnimationFrame(tickFallback)
      }
      rafRef.current = requestAnimationFrame(tickFallback)
      return () => {
        cancelled = true
        cancelAnimationFrame(rafRef.current)
        applyPath(new Array(TICKS).fill(MIN_LEN))
      }
    }

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
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.5
        source.connect(analyser)
        // IMPORTANTE: conectar a destination para que el audio SIGA
        // sonando con normalidad (crear un MediaElementSource desvía TODA la
        // salida del elemento hacia el grafo de Web Audio; si no se conecta
        // a destination, el audio se silenciaría). Esto SOLO es seguro para
        // recursos del MISMO ORIGEN (ver rama cross-origin más arriba).
        analyser.connect(ctx.destination)
        mediaEl.__twykAnalyser = analyser
      } else {
        analyser = mediaEl.__twykAnalyser
      }
      data = new Uint8Array(analyser.frequencyBinCount)
    } catch {
      // CORS bloqueado / elemento no compatible -> degradación silenciosa,
      // sin anillo reactivo, sin romper el resto de la tarjeta.
      return
    }

    let cancelled = false
    levelsRef.current.fill(0)
    const binCount = data.length

    const tick = () => {
      if (cancelled) return
      analyser.getByteFrequencyData(data)

      const lengths = new Array(TICKS)
      for (let i = 0; i < TICKS; i++) {
        // Reparte los trazos por el espectro (evita el bin 0, a menudo
        // desproporcionado) -> cada trazo "vibra" con una banda de
        // frecuencia distinta, de ahí las espigas puntuales reales.
        const binIndex = 1 + Math.floor((i / TICKS) * (binCount - 2))
        const raw = data[binIndex] / 255
        const prev = levelsRef.current[i]
        // Envolvente ataque-rápido / caída-lenta (como un vúmetro): el trazo
        // "salta" de inmediato con el golpe de audio y se desvanece poco a
        // poco, en vez de moverse simétrico -> efecto de espiga puntual.
        const factor = raw > prev ? 0.35 : 0.88
        levelsRef.current[i] = prev * factor + raw * (1 - factor)
        // Exponente > 1: solo los picos fuertes producen espigas largas: el
        // resto del anillo se queda cerca de MIN_LEN (aspecto "punteado").
        const shaped = Math.pow(levelsRef.current[i], 1.8)
        lengths[i] = MIN_LEN + shaped * (MAX_LEN - MIN_LEN)
      }
      applyPath(lengths)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      if (pathRef.current) pathRef.current.setAttribute('d', RESTING_PATH)
    }
  }, [active, mediaEl])

  if (!active || !mediaEl) return null

  return (
    <svg viewBox="0 0 40 40" className="audio-ring-svg" aria-hidden="true">
      <path ref={pathRef} d={RESTING_PATH} className="audio-ring-path" />
    </svg>
  )
}
