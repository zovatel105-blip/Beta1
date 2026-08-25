'use client'
/**
 * networkQuality — estimador de ancho de banda cross-browser + selección de
 * calidad adaptativa (FASE 2). Sin contras:
 *  - Mide el throughput REAL con la Performance Resource Timing API (vídeos e
 *    imágenes que YA descargamos), así funciona en TODOS los navegadores
 *    (Safari/Firefox incluidos), sin peticiones extra.
 *  - Usa navigator.connection (downlink/effectiveType/saveData) solo como pista.
 *  - reportStall(): red de seguridad reactiva (baja la estimación si un vídeo se
 *    atasca, para que los siguientes clips elijan menor calidad).
 */

let _mbps = null // estimación suavizada (Mbps)
let _saveData = false
let _lowBattery = false
let _started = false

function readConnectionHint() {
  if (typeof navigator === 'undefined') return
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!c) return
  _saveData = !!c.saveData
  if (typeof c.downlink === 'number' && c.downlink > 0) {
    _mbps = _mbps == null ? c.downlink : _mbps * 0.5 + c.downlink * 0.5
  } else if (c.effectiveType) {
    const map = { 'slow-2g': 0.25, '2g': 0.4, '3g': 1.5, '4g': 8 }
    const v = map[c.effectiveType]
    if (v != null && _mbps == null) _mbps = v
  }
}

function ingestEntry(e) {
  if (!e || typeof e.name !== 'string') return
  if (!/\.(mp4|webm|jpg|jpeg|png)(\?|$)/i.test(e.name)) return
  const bytes = e.transferSize || e.encodedBodySize || 0
  const dur = (e.responseEnd || 0) - (e.responseStart || 0)
  // Solo recursos con tamaño/duración significativos (evita ruido de caché).
  if (bytes > 20000 && dur > 5) {
    const mbps = (bytes * 8) / (dur / 1000) / 1e6
    if (isFinite(mbps) && mbps > 0) {
      _mbps = _mbps == null ? mbps : _mbps * 0.7 + mbps * 0.3
    }
  }
}

export function startNetworkMonitor() {
  if (_started || typeof window === 'undefined') return
  _started = true
  readConnectionHint()
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) ingestEntry(e)
    })
    obs.observe({ type: 'resource', buffered: true })
  } catch { /* PerformanceObserver no soportado: usamos solo la pista de connection */ }
  try {
    const c = navigator.connection
    if (c && c.addEventListener) c.addEventListener('change', readConnectionHint)
  } catch { /* ignore */ }
  // Batería: si está baja, activamos el modo conservador (menos prefetch, calidad mínima).
  try {
    if (navigator.getBattery) {
      navigator.getBattery().then((bat) => {
        const update = () => { _lowBattery = !bat.charging && bat.level <= 0.2 }
        update()
        bat.addEventListener('levelchange', update)
        bat.addEventListener('chargingchange', update)
      }).catch(() => { /* ignore */ })
    }
  } catch { /* ignore */ }
}

/** Un vídeo se atascó -> bajamos la estimación (los siguientes clips bajan calidad). */
export function reportStall() {
  if (_mbps == null) _mbps = 1.0
  else _mbps = Math.max(0.3, _mbps * 0.5)
}

/**
 * Devuelve la URL del vídeo a reproducir.
 *
 * POLÍTICA (corrige el bug "las recientes van peor que las antiguas"):
 *  - Por defecto servimos SIEMPRE el vídeo ORIGINAL (`fallbackUrl`). El original
 *    es el que subió el usuario: máxima calidad y, en la práctica, suele PESAR
 *    MENOS que las renditions transcodificadas con `veryfast` (las renditions
 *    540p/720p resultaban más grandes que el original -> más buffering -> jank,
 *    y 360p/540p reescalaban hacia abajo -> se veía borroso). Por eso el original
 *    da mejor calidad Y más fluidez, igual que los vídeos antiguos.
 *  - SOLO en modo conservador (Ahorro de datos del SO o batería ≤20% sin cargar)
 *    usamos la rendition más ligera disponible (360p) para no gastar datos.
 *  - Si no hay `qualities` (vídeos antiguos/integrados) -> original directamente.
 */
export function pickQuality(qualities, fallbackUrl) {
  if (shouldConserve() && Array.isArray(qualities) && qualities.length > 0) {
    const sorted = [...qualities].sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))
    return sorted[0].url || fallbackUrl
  }
  return fallbackUrl
}

export function currentMbps() { return _mbps }

/** ¿Está activo el modo conservador? (Data Saver del SO o batería ≤20% sin cargar.) */
export function isSaveData() { return _saveData }
export function shouldConserve() { return _saveData || _lowBattery }
