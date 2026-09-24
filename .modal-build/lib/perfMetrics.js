'use client'
/**
 * perfMetrics — instrumentación ligera (RUM local) que valida en producción los
 * puntos críticos del Performance Blueprint v2:
 *  - watchdogTriggers / watchdogTimeouts (C5): cuántas veces entra el watchdog de
 *    drift A/B y cuántas acaban en reset por timeout (señal de red/decoder mala).
 *  - webcodecsSupported / webcodecsFallback (C3): si el dispositivo NO soporta
 *    WebCodecs y caemos al camino <video> nativo + póster.
 *  - backgroundEvents + decoderReleaseMs (C1/G3): nº de veces que la app va a
 *    segundo plano y cuánto tarda en liberar los decoders al ocultar la pestaña.
 * Expone window.__twykMetrics para depuración; getMetrics() para enviar a un RUM.
 */

const M = {
  webcodecsSupported: typeof window !== 'undefined' && 'VideoDecoder' in window,
  webcodecsFallback: 0,
  watchdogTriggers: 0,
  watchdogTimeouts: 0,
  backgroundEvents: 0,
  decoderReleaseMsSamples: [],
}

if (typeof window !== 'undefined') window.__twykMetrics = M

export function reportWebcodecsFallback() { M.webcodecsFallback++ }

export function reportWatchdog(timedOut) {
  M.watchdogTriggers++
  if (timedOut) M.watchdogTimeouts++
}

export function reportBackground() { M.backgroundEvents++ }

export function reportDecoderReleaseMs(ms) {
  if (typeof ms === 'number' && isFinite(ms) && ms >= 0) {
    M.decoderReleaseMsSamples.push(Math.round(ms))
    if (M.decoderReleaseMsSamples.length > 50) M.decoderReleaseMsSamples.shift()
  }
}

export function getMetrics() {
  const s = M.decoderReleaseMsSamples
  const avg = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 0
  return { ...M, decoderReleaseMsAvg: avg }
}
