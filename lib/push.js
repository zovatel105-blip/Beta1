// Notificaciones push (Firebase Cloud Messaging) — llegan al sistema
// (bandeja de notificaciones) incluso con la app cerrada/en segundo plano.
// Este módulo es el ÚNICO punto de entrada para enviar pushes desde el
// backend; se llama desde `createNotification()` (lib/db.js), que ya es el
// punto de entrada único de TODAS las notificaciones in-app (vote, comment,
// follow, challenge, accepted) — así un solo lugar cubre ambos canales sin
// tener que tocar cada endpoint del feed/perfil/retos por separado.
//
// Diseño defensivo: si las credenciales de Firebase (FIREBASE_PROJECT_ID /
// FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) no están configuradas en
// .env, `sendPush()` no hace nada (no lanza error, no bloquea el resto de la
// app) — así el resto del backend sigue funcionando con normalidad mientras
// el usuario configura Firebase.
import { getCollection } from './mongodb'
import { getAllPosts } from './stores'

const DEVICE_TOKENS_COLLECTION = 'deviceTokens'

let firebaseApp = null
let firebaseInitError = null
let warnedMissingConfig = false

function getFirebaseApp() {
  if (firebaseApp || firebaseInitError) return firebaseApp
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  if (!projectId || !clientEmail || !privateKey) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true
      console.warn('[push] Firebase no configurado (faltan FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY en .env) — las notificaciones push están DESACTIVADAS, el resto de la app sigue funcionando con normalidad.')
    }
    return null
  }
  try {
    // Import perezoso (solo si hay credenciales) para no cargar el SDK de
    // Firebase en cada arranque si el usuario todavía no lo configuró.
    const { cert, getApps, initializeApp } = require('firebase-admin/app')
    firebaseApp = getApps()[0] || initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // La clave privada llega desde .env con "\n" literales (no saltos de
        // línea reales) — hay que reemplazarlos antes de pasarla al SDK.
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    })
  } catch (err) {
    firebaseInitError = err
    console.error('[push] Error inicializando Firebase Admin SDK:', err?.message || err)
    return null
  }
  return firebaseApp
}

function getMessaging() {
  const app = getFirebaseApp()
  if (!app) return null
  const { getMessaging: getMessagingSdk } = require('firebase-admin/messaging')
  return getMessagingSdk(app)
}

/**
 * Registra (o actualiza) el token FCM de un dispositivo para un usuario.
 * Un mismo usuario puede tener varios dispositivos (índice único por
 * userId+token, upsert).
 */
export async function registerDeviceToken(userId, token, { platform = 'android', appVersion = null } = {}) {
  if (!userId || !token) return
  const col = await getCollection(DEVICE_TOKENS_COLLECTION)
  await col.updateOne(
    { userId, token },
    { $set: { userId, token, platform, appVersion, enabled: true, updatedAt: new Date() } },
    { upsert: true },
  )
}

/**
 * Desactiva un token (logout desde ese dispositivo) — no lo borra por si el
 * usuario vuelve a iniciar sesión en el mismo dispositivo poco después.
 */
export async function unregisterDeviceToken(userId, token) {
  if (!userId || !token) return
  const col = await getCollection(DEVICE_TOKENS_COLLECTION)
  await col.updateOne({ userId, token }, { $set: { enabled: false, updatedAt: new Date() } })
}

// Copys de cada tipo de notificación — mismos tipos ya usados por
// createNotification()/getNotificationText() (lib/db.js): 'vote', 'comment',
// 'reply', 'follow', 'challenge' (recibido), 'accepted' (reto aceptado).
function buildPushCopy(type, fromUser) {
  const name = fromUser?.name || fromUser?.username || 'Someone'
  switch (type) {
    case 'follow':
      return { title: 'New follower', body: `${name} started following you` }
    case 'vote':
      return { title: 'New vote', body: `${name} voted on your post` }
    case 'comment':
      return { title: 'New comment', body: `${name} commented on your post` }
    case 'reply':
      return { title: 'New reply', body: `${name} replied to your comment` }
    case 'challenge':
      return { title: 'Challenge received', body: `${name} challenged you` }
    case 'accepted':
      return { title: 'Challenge accepted', body: `${name} accepted your challenge` }
    default:
      return { title: 'New activity', body: `${name} interacted with you` }
  }
}

// Las URLs guardadas en la app (avatares subidos, pósters de publicaciones)
// son RUTAS RELATIVAS ("/uploads/xxx.jpg") — el cliente Android necesita la
// URL ABSOLUTA para poder descargarlas (no comparte origen con el backend
// como sí lo hace un <img> en la web). Las URLs que YA son absolutas
// (avatares demo de dicebear/pravatar, o cualquier CDN futuro) se devuelven
// intactas.
function toAbsoluteUrl(url) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  if (!base) return null
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

// Miniatura de la publicación implicada (si la notificación tiene postId) —
// mismo campo `posterUrl`/`thumbnailUrl` ya usado en el resto de route.js
// para las cabeceras de reto/versus. Reutiliza `getAllPosts()` (mismo
// patrón `meta.find(...)` ya usado en todo route.js, sin una colección
// dedicada de posts por id).
async function resolvePostImageUrl(postId) {
  if (!postId) return null
  try {
    const posts = await getAllPosts()
    const post = posts.find((p) => p.id === postId)
    const raw = post?.posterUrl || post?.thumbnailUrl || post?.sideA?.posterUrl || null
    return toAbsoluteUrl(raw)
  } catch {
    return null
  }
}

/**
 * Envía una notificación push a TODOS los dispositivos activos de un
 * usuario. Fire-and-forget por diseño (se llama sin `await` bloqueante desde
 * createNotification) — cualquier fallo se loguea pero NUNCA debe romper el
 * flujo principal (votar/comentar/seguir/retar).
 */
export async function sendPush({ userId, type, fromUser, postId = null, commentId = null }) {
  try {
    const messaging = getMessaging()
    if (!messaging) return
    const col = await getCollection(DEVICE_TOKENS_COLLECTION)
    const devices = await col.find({ userId, enabled: true }).project({ token: 1 }).toArray()
    if (!devices.length) return

    const { title, body } = buildPushCopy(type, fromUser)
    // Avatar de quien interactuó + miniatura de la publicación implicada
    // (petición del usuario: "tienen que... mostrar el avatar y la
    // publicación en la que se interactuó") — se resuelven aquí, en el
    // backend, para no exponer lógica de URLs al cliente.
    const avatarUrl = toAbsoluteUrl(fromUser?.avatarUrl) || ''
    const postImageUrl = (await resolvePostImageUrl(postId)) || ''

    const data = {
      type: String(type || ''),
      postId: postId ? String(postId) : '',
      commentId: commentId ? String(commentId) : '',
      fromUsername: fromUser?.username || '',
      // title/body van DENTRO de `data` (no en un bloque `notification`,
      // ver comentario en `sendEachForMulticast` más abajo) — todos los
      // valores de `data` deben ser string, FCM no acepta otro tipo.
      title,
      body,
      avatarUrl,
      postImageUrl,
    }

    const result = await messaging.sendEachForMulticast({
      tokens: devices.map((d) => d.token),
      // SOLO payload de DATOS (sin bloque `notification`): con `notification`,
      // Android auto-pinta la notificación él mismo mientras la app está en
      // segundo plano/cerrada, SIN pasar por `onMessageReceived` — el cliente
      // nunca tendría oportunidad de descargar el avatar/la miniatura ni de
      // construir la notificación enriquecida en ese caso (solo funcionaría
      // con la app en primer plano). Con SOLO `data`, Android entrega el
      // mensaje a `onMessageReceived` SIEMPRE (primer plano, segundo plano o
      // cerrada — comportamiento documentado de Firebase), y es el propio
      // cliente (TwykFirebaseMessagingService.kt) quien construye la
      // notificación con avatar (largeIcon) e imagen de la publicación
      // (BigPictureStyle) en todos los casos por igual.
      data,
      android: {
        priority: 'high',
      },
    })

    // Limpieza de tokens inválidos/desinstalados/mal formados — FCM los
    // reporta con distintos códigos de error según el motivo exacto:
    // 'messaging/registration-token-not-registered' (app desinstalada),
    // 'messaging/invalid-registration-token' / 'messaging/invalid-argument'
    // (token mal formado, verificado manualmente con un token de prueba
    // falso: FCM autentica bien y devuelve exactamente 'invalid-argument'
    // para una cadena que no tiene forma de token real). En NINGUNO de estos
    // casos el token volverá a funcionar, así que se eliminan todos por igual.
    const PERMANENT_TOKEN_ERRORS = /registration-token|invalid-argument|mismatched-credential/
    const invalidTokens = result.responses
      .map((r, i) => (!r.success && PERMANENT_TOKEN_ERRORS.test(r.error?.code || '') ? devices[i].token : null))
      .filter(Boolean)
    if (invalidTokens.length) {
      await col.deleteMany({ userId, token: { $in: invalidTokens } })
    }
  } catch (err) {
    console.error('[push] Error enviando notificación push:', err?.message || err)
  }
}
