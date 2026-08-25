/* Service Worker — FASE 3. Caché conservadora para arranque y scroll-back
 * instantáneos, SIN riesgo para la reproducción de vídeo:
 *  - Pósters/imágenes (.jpg/.png/.webp): cache-first -> instantáneos, también
 *    offline.
 *  - Los VÍDEOS NO se interceptan: las peticiones Range (206) las gestiona el
 *    navegador y su caché HTTP. Interceptarlas podría corromper el seek, así que
 *    las dejamos pasar siempre.
 */
const CACHE = 'media-cache-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  // Nunca tocar peticiones de rango (vídeo) -> red / caché HTTP del navegador.
  if (req.headers.has('range')) return

  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return

  // Cache-first SOLO para imágenes/posters.
  if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(req)
      if (hit) return hit
      try {
        const res = await fetch(req)
        if (res && res.ok) cache.put(req, res.clone())
        return res
      } catch {
        return hit || Response.error()
      }
    })())
  }
})
