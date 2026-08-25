'use client'

/**
 * commentCountBus — pequeño pub/sub vía CustomEvent en `window` (mismo patrón
 * ya usado en esta app por lib/uploadQueue.js y los eventos
 * 'twyk:postCreated'/'twyk:postDeleted'/'twyk:challenged').
 *
 * BUG QUE RESUELVE ("el contador de comentarios debe mostrarse siempre, sin
 * depender de abrir el modal"): CarouselSlide.jsx/DuetSlide.jsx guardan
 * `commentCount` en un estado LOCAL de React, inicializado una sola vez desde
 * `post.stats.comments` al MONTAR. Ese `post` es un objeto que vive en el
 * array `posts` de un componente ANCESTRO (useFeed.js en el feed principal,
 * o el estado `posts`/`savedPosts` de ProfilePage.jsx/CompletedBattlesPage.jsx)
 * — comentar o borrar un comentario solo actualiza el estado LOCAL de la
 * tarjeta, NUNCA ese array del ancestro. Como el feed desmonta por completo
 * las tarjetas que salen de la ventana de scroll (regla de máx. 3 montadas,
 * "0 media, 0 decoders"), volver a una tarjeta ya vista dentro de la MISMA
 * sesión la remonta desde cero -> su `commentCount` se re-inicializa desde el
 * `post.stats.comments` ORIGINAL (desactualizado), "perdiendo" visualmente el
 * cambio hasta reabrir el modal de comentarios (que sí trae el número real).
 *
 * FIX: cada vez que `commentCount` cambia de verdad (comentar, borrar, o al
 * abrir/cerrar el modal), la tarjeta emite este evento; el ancestro que
 * posee el array (useFeed/ProfilePage/CompletedBattlesPage) lo escucha y
 * PARCHEA `stats.comments` del post correspondiente en su propio array, así
 * que un remount posterior en la MISMA sesión ya arranca con el número
 * correcto, sin depender de una recarga completa ni de reabrir el modal.
 */
export function emitCommentCountChange(postId, count) {
  if (typeof window === 'undefined' || !postId || typeof count !== 'number') return
  window.dispatchEvent(new CustomEvent('twyk:commentCountChanged', { detail: { postId, count } }))
}

// Devuelve una función de cancelación (para useEffect).
export function subscribeCommentCountChange(cb) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e) => cb(e.detail?.postId, e.detail?.count)
  window.addEventListener('twyk:commentCountChanged', handler)
  return () => window.removeEventListener('twyk:commentCountChanged', handler)
}

// Helper puro compartido: aplica el parche a un array de posts sin mutar el
// original (misma forma que patchAuthorAvatar en useFeed.js).
export function patchCommentCountInList(posts, postId, count) {
  if (!Array.isArray(posts) || !posts.length) return posts
  let changed = false
  const next = posts.map((p) => {
    if (!p || p.id !== postId) return p
    if (p.stats?.comments === count) return p
    changed = true
    return { ...p, stats: { ...(p.stats || {}), comments: count } }
  })
  return changed ? next : posts
}
