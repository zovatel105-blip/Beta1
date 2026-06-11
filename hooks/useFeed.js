'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ──────────────────────────────────────────────────────────────────────────
// FUENTE DE DATOS (2a): /api/uploads + /api/feed
//
// - Carga INICIAL: GET /api/uploads (publicaciones propias/destacadas) + la
//   PRIMERA página de GET /api/feed en PARALELO. Las uploads se muestran
//   primero; si no hay ninguna, el feed garantiza contenido inmediato.
// - SCROLL INFINITO: loadMore() pagina GET /api/feed con el cursor, y se
//   dispara desde el feed cuando la tarjeta activeIndex+2 entra en viewport.
//   Transición "seamless": el usuario nunca percibe el cambio de fuente.
// - Dedupe por id (un Set en ref) -> nunca se montan dos tarjetas con el mismo
//   id (rompería el scroll-snap y el IntersectionObserver).
// ──────────────────────────────────────────────────────────────────────────

async function fetchFeedPage(cursor, limit = 8) {
  const res = await fetch(`/api/feed?cursor=${cursor}&limit=${limit}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('feed fetch failed')
  return res.json()
}

async function fetchUploads() {
  try {
    const res = await fetch('/api/uploads', { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json()
    // Solo publicaciones de votación (1vs1 / versus) entran al feed principal.
    return (data.posts || []).filter((p) => p.type === 'duet' || p.type === 'versus')
  } catch {
    return []
  }
}

export function useFeed() {
  const [posts, setPosts] = useState([])
  const [ready, setReady] = useState(false)

  const cursorRef = useRef(0)
  const hasMoreRef = useRef(true)
  const loadingRef = useRef(false)
  const seenRef = useRef(new Set())

  // Añade solo los ids no vistos (mantiene el orden de llegada).
  const appendUnique = useCallback((incoming) => {
    const fresh = []
    for (const p of incoming || []) {
      if (p && p.id && !seenRef.current.has(p.id)) {
        seenRef.current.add(p.id)
        fresh.push(p)
      }
    }
    if (fresh.length) setPosts((prev) => [...prev, ...fresh])
  }, [])

  // Carga inicial: uploads + primera página del feed (en paralelo).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [uploads, page] = await Promise.all([
        fetchUploads(),
        fetchFeedPage(0).catch(() => ({ posts: [], nextCursor: 0, hasMore: false })),
      ])
      if (cancelled) return
      cursorRef.current = page.nextCursor ?? 0
      hasMoreRef.current = page.hasMore !== false
      const merged = []
      for (const p of [...uploads, ...(page.posts || [])]) {
        if (p && p.id && !seenRef.current.has(p.id)) {
          seenRef.current.add(p.id)
          merged.push(p)
        }
      }
      setPosts(merged)
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  // Paginación del feed (scroll infinito). Idempotente y con guard de concurrencia.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    try {
      const page = await fetchFeedPage(cursorRef.current)
      cursorRef.current = page.nextCursor ?? cursorRef.current
      hasMoreRef.current = page.hasMore !== false
      appendUnique(page.posts || [])
    } catch {
      /* swallow: reintentará en el próximo cruce de umbral del observer */
    } finally {
      loadingRef.current = false
    }
  }, [appendUnique])

  // Inserta una publicación recién subida al principio del feed.
  const prependPost = useCallback((post) => {
    if (!post || !post.id) return
    seenRef.current.add(post.id)
    setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)])
  }, [])

  return { posts, ready, loadMore, prependPost }
}

export default useFeed
