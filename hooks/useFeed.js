'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeCommentCountChange, patchCommentCountInList } from '@/lib/commentCountBus'

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

  // Carga (inicial Y refresco): SOLO el feed rankeado por el TWYK Engine.
  // ANTES se cargaba /api/uploads (cronológico fijo) + /api/feed en paralelo,
  // con uploads PRIMERO: como /api/uploads contiene TODOS los posts, el dedupe
  // descartaba los del feed rankeado y el usuario veía SIEMPRE el mismo orden
  // cronológico (el algoritmo nunca llegaba a pintarse). /api/feed usa esas
  // mismas publicaciones como candidatos, así que uploads queda solo como
  // FALLBACK si el feed falla o llega vacío.
  const loadInitial = useCallback(async () => {
    const page = await fetchFeedPage(0).catch(() => null)
    let list = page?.posts || []
    if (list.length === 0) {
      list = await fetchUploads()
    }
    cursorRef.current = page?.nextCursor ?? 0
    hasMoreRef.current = page ? page.hasMore !== false : false
    seenRef.current = new Set()
    const merged = []
    for (const p of list) {
      if (p && p.id && !seenRef.current.has(p.id)) {
        seenRef.current.add(p.id)
        merged.push(p)
      }
    }
    setPosts(merged)
    setReady(true)
  }, [])

  useEffect(() => {
    loadInitial().catch(() => {})
  }, [loadInitial])

  // Refresco explícito (1 click en Home): re-descarga desde el principio y
  // SUSTITUYE el feed entero (no acumula) — el llamador (Feed.jsx) además
  // resetea el scroll a la primera tarjeta.
  const refresh = useCallback(async () => {
    await loadInitial()
  }, [loadInitial])

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

  // Actualiza EN MEMORIA el avatar/nombre de un autor en TODOS los posts del
  // feed (author + lados A/B). Se usa cuando el usuario cambia su foto de
  // perfil: el feed ya cargado guarda un snapshot del avatar, así que lo
  // refrescamos al instante sin recargar todo el feed.
  const patchAuthorAvatar = useCallback((username, avatarUrl, name) => {
    if (!username) return
    setPosts((prev) => prev.map((p) => {
      const patch = (a) => (a && a.username === username
        ? { ...a, avatarUrl: avatarUrl || a.avatarUrl, name: name || a.name }
        : a)
      return {
        ...p,
        author: patch(p.author),
        sideA: p.sideA ? { ...p.sideA, author: patch(p.sideA.author) } : p.sideA,
        sideB: p.sideB ? { ...p.sideB, author: patch(p.sideB.author) } : p.sideB,
      }
    }))
  }, [])

  // BUG FIX ("el contador de comentarios debe mostrarse siempre, sin abrir el
  // modal"): ver lib/commentCountBus.js — parchea `stats.comments` del post
  // correspondiente en este mismo array, así una tarjeta que se desmonte por
  // virtualización del scroll y se remonte más tarde en la MISMA sesión
  // arranca ya con el número correcto.
  useEffect(() => subscribeCommentCountChange((postId, count) => {
    setPosts((prev) => patchCommentCountInList(prev, postId, count))
  }), [])

  return { posts, ready, loadMore, prependPost, patchAuthorAvatar, refresh }
}

export default useFeed
