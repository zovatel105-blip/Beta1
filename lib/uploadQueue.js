'use client'

/**
 * uploadQueue — cola de subidas EN CURSO, en memoria del navegador (no
 * persiste tras recargar). Permite que la subida real (XHR en
 * components/UploadDialog.jsx) siga corriendo en segundo plano después de
 * cerrar el diálogo de "Publicar", mientras el grid de perfil (ProfilePage)
 * muestra un placeholder con progreso hasta que la publicación real llega
 * del servidor.
 *
 * No usa React Context a propósito (evita re-renderizar todo el árbol): es
 * un pequeño pub/sub vía CustomEvent en `window`, mismo patrón ya usado en
 * esta app para 'twyk:postDeleted'/'twyk:postCreated'.
 */

let queue = []

function emit() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('twyk:uploadQueue', { detail: { queue } }))
}

export function getUploadQueue() {
  return queue
}

// item: { id, mode: 'versus'|'duet', thumbUrl: string|null }
export function addPendingUpload(item) {
  queue = [{ progress: 0, status: 'uploading', ...item }, ...queue]
  emit()
  return item.id
}

export function updateUploadProgress(id, progress) {
  queue = queue.map((q) => (q.id === id ? { ...q, progress } : q))
  emit()
}

export function markUploadFailed(id) {
  queue = queue.map((q) => (q.id === id ? { ...q, status: 'error' } : q))
  emit()
  // Autolimpieza: el placeholder de error desaparece solo tras un momento
  // (el diálogo de subida ya está cerrado, no hay dónde mostrar un botón
  // de reintentar todavía).
  setTimeout(() => removePendingUpload(id), 4000)
}

export function removePendingUpload(id) {
  queue = queue.filter((q) => q.id !== id)
  emit()
}

// Devuelve una función de cancelación (para useEffect).
export function subscribeUploadQueue(cb) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e) => cb(e.detail.queue)
  window.addEventListener('twyk:uploadQueue', handler)
  return () => window.removeEventListener('twyk:uploadQueue', handler)
}
