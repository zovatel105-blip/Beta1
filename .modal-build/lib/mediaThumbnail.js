'use client'

/**
 * mediaThumbnail — genera una miniatura local (best-effort, sin backend)
 * a partir de un File de imagen o vídeo, para usarla en el placeholder del
 * grid de perfil mientras la subida real ocurre en segundo plano.
 *
 * Devuelve SIEMPRE (nunca rechaza): si algo falla, resuelve `null` y el
 * placeholder usa un degradado genérico en su lugar.
 */

function captureImageThumb(file) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result || null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    } catch {
      resolve(null)
    }
  })
}

function captureVideoThumb(file) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (val) => {
      if (settled) return
      settled = true
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
      resolve(val)
    }
    let url
    try {
      url = URL.createObjectURL(file)
    } catch {
      resolve(null)
      return
    }
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = Math.min(0.15, (video.duration || 1) / 4)
      } catch {
        finish(null)
      }
    })
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 360
        canvas.height = video.videoHeight || 360
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.6))
      } catch {
        finish(null)
      }
    })
    video.addEventListener('error', () => finish(null))
    // Salvaguarda: si el navegador tarda demasiado en decodificar, no
    // bloqueamos el flujo de publicación por una miniatura.
    setTimeout(() => finish(null), 2500)
  })
}

export function captureThumbnail(file) {
  if (!file) return Promise.resolve(null)
  if (file.type?.startsWith('image/')) return captureImageThumb(file)
  if (file.type?.startsWith('video/')) return captureVideoThumb(file)
  return Promise.resolve(null)
}
