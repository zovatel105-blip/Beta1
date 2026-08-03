'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeCommentCountChange, patchCommentCountInList } from '@/lib/commentCountBus'

// ──────────────────────────────────────────────────────────────────────────
// Feed "Siguiendo" (nueva página, doble-click en Home del BottomNav) — SOLO
// publicaciones de las cuentas que el usuario sigue. Fuente: GET
// /api/feed/following (feed cronológico, sin ranking del recomendador).
//
// `enabled`: mientras es false, el hook NO hace ninguna petición (evita
// gastar red/DB en usuarios que nunca abren esta página) — Feed.jsx solo lo
// activa cuando el usuario entra a esta vista por primera vez en la sesión.
// `unauthorized` se pone a true si el backend responde 401 (sin sesión): el
// llamador debe pedir login en vez de mostrar un feed vacío.
// ──────────────────────────────────────────────────────────────────────────

async function fetchFollowingPage(cursor, limit = 8) {
  const res = await fetch(`/api/feed/following?cursor=${cursor}&limit=${limit}`, { cache: 'no-store' })
  if (res.status === 401) {
    const err = new Error('unauthorized')
    err.unauthorized = true
    throw err
  }
  if (!res.ok) throw new Error('following feed fetch failed')
  return res.json()
}

export function useFollowingFeed(enabled) {
  const [posts, setPosts] = useState([])
  const [ready, setReady] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)

  const cursorRef = useRef(0)
  const hasMoreRef = useRef(true)
  const loadingRef = useRef(false)
  const seenRef = useRef(new Set())
  const startedRef = useRef(false)

  const loadInitial = useCallback(async () => {
    try {
      const page = await fetchFollowingPage(0)
      cursorRef.current = page.nextCursor ?? 0
      hasMoreRef.current = page.hasMore !== false
      seenRef.current = new Set()
      const merged = []
      for (const p of page.posts || []) {
        if (p && p.id && !seenRef.current.has(p.id)) {
          seenRef.current.add(p.id)
          merged.push(p)
        }
      }
      setPosts(merged)
      setUnauthorized(false)
    } catch (err) {
      setPosts([])
      hasMoreRef.current = false
      if (err?.unauthorized) setUnauthorized(true)
    } finally {
      setReady(true)
    }
  }, [])

  // Solo se dispara la PRIMERA vez que `enabled` pasa a true en esta sesión
  // del componente (startedRef) — reabrir la página no repite la carga
  // (misma filosofía que useFeed: la actualización explícita es refresh()).
  useEffect(() => {
    if (!enabled || startedRef.current) return
    startedRef.current = true
    loadInitial()
  }, [enabled, loadInitial])

  const refresh = useCallback(async () => {
    await loadInitial()
  }, [loadInitial])

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

  // MEJORA E ("No me interesa"): quita una publicación concreta de esta
  // lista en memoria (el registro del backend es independiente de qué feed
  // estaba viendo el usuario en ese momento).
  const removePost = useCallback((postId) => {
    if (!postId) return
    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return
    loadingRef.current = true
    try {
      const page = await fetchFollowingPage(cursorRef.current)
      cursorRef.current = page.nextCursor ?? cursorRef.current
      hasMoreRef.current = page.hasMore !== false
      appendUnique(page.posts || [])
    } catch {
      /* swallow: reintentará en el próximo cruce de umbral del observer */
    } finally {
      loadingRef.current = false
    }
  }, [appendUnique])

  // Mismo parche en vivo del contador de comentarios que useFeed.js.
  useEffect(() => subscribeCommentCountChange((postId, count) => {
    setPosts((prev) => patchCommentCountInList(prev, postId, count))
  }), [])

  return { posts, ready, loadMore, refresh, removePost, unauthorized }
}

export default useFollowingFeed
