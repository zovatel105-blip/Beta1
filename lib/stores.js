import { getCollection } from './mongodb'

/**
 * Capa de persistencia en MongoDB para los tres recursos que antes vivían en
 * archivos JSON reescritos enteros en disco (causaban pérdida de datos en
 * redeploy y race conditions):
 *
 *   posts       <- _meta.json       (publicaciones subidas: versus / 1vs1 / retos)
 *   challenges  <- _challenges.json (solicitudes de reto pendientes)
 *   votes       <- _votes.json      (votos de los posts del feed integrado)
 *
 * La ESTRUCTURA de cada documento es idéntica a la del JSON original. Se añade
 * un campo interno `_seq` para preservar el orden "más reciente primero" que
 * antes daba `array.unshift(...)`; se elimina al devolver al exterior.
 */

const POSTS = 'posts'
const CHALLENGES = 'challenges'
const VOTES = 'votes'

// Quita los campos internos de Mongo antes de devolver al resto de la app, de
// modo que la forma sea EXACTAMENTE la misma que tenía en el JSON.
function strip(doc) {
  if (!doc) return doc
  const { _id, _seq, ...rest } = doc
  return rest
}

// Secuencia monótona para nuevas inserciones: siempre mayor que cualquier `_seq`
// asignado durante la migración (que usa valores pequeños 1..N), de modo que las
// publicaciones nuevas quedan arriba (equivalente a unshift).
function nextSeq() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000)
}

// ────────────────────────────────────────────────────────────────────────────
// POSTS (antes _meta.json) — publicaciones subidas
// ────────────────────────────────────────────────────────────────────────────

// Devuelve TODAS las publicaciones (más reciente primero). Equivale a leer el
// array completo de _meta.json.
export async function getAllPosts() {
  const col = await getCollection(POSTS)
  const docs = await col.find({}).sort({ _seq: -1 }).toArray()
  return docs.map(strip)
}

// Inserta una publicación nueva (equivale a meta.unshift + write). Atómico.
export async function insertPost(post) {
  const col = await getCollection(POSTS)
  await col.insertOne({ ...post, _seq: nextSeq() })
  return post
}

// Actualiza campos de una publicación por id (p.ej. qualities de renditions).
export async function updatePost(id, fields) {
  const col = await getCollection(POSTS)
  await col.updateOne({ id }, { $set: fields })
}

// Borra una publicación SOLO si pertenece al usuario (ownerId). El dueño se
// identifica por `author.id` (las publicaciones subidas no llevan `userId` de
// nivel superior) o por `userId` (publicaciones creadas vía createUser/db).
// Limpia también los comentarios y guardados asociados. Devuelve un estado:
//   { ok: true } | { ok: false, reason: 'not_found' | 'forbidden' }
export async function deletePostById(id, ownerId) {
  const col = await getCollection(POSTS)
  const doc = await col.findOne({ id })
  if (!doc) return { ok: false, reason: 'not_found' }
  const postOwner = doc.userId || doc.author?.id || null
  if (!ownerId || !postOwner || postOwner !== ownerId) {
    return { ok: false, reason: 'forbidden' }
  }
  await col.deleteOne({ id })
  // Limpieza best-effort de datos asociados (no bloquea el borrado principal).
  try {
    const comments = await getCollection('comments')
    await comments.deleteMany({ postId: id })
    const saves = await getCollection('saves')
    await saves.deleteMany({ postId: id })
  } catch { /* noop */ }
  return { ok: true }
}

// Incremento ATÓMICO de un voto en una publicación subida (versus/1vs1/reto).
// Sustituye el patrón leer-modificar-reescribir (race condition en votos
// simultáneos) por una única actualización atómica. Devuelve el post
// actualizado o null si no existe una publicación versus/duet con ese id.
//
// CAMBIO DE VOTO: si `previousSide` viene informado ('a'|'b') y es distinto de
// `side`, se trata como un CAMBIO de opción: se resta 1 al lado anterior y se
// suma 1 al lado nuevo en la MISMA operación atómica (el total de votos no
// varía). Si `previousSide` es igual a `side` (re-tocar la misma opción ya
// votada), no se aplica ningún incremento (no-op, evita doble conteo).
export async function incrementPostVote(id, side, previousSide) {
  const col = await getCollection(POSTS)
  const isSwitch = previousSide === 'a' || previousSide === 'b'
  const noOp = isSwitch && previousSide === side
  const deltaA = noOp ? 0 : (side === 'a' ? 1 : (isSwitch && previousSide === 'a' ? -1 : 0))
  const deltaB = noOp ? 0 : (side === 'b' ? 1 : (isSwitch && previousSide === 'b' ? -1 : 0))
  const res = await col.findOneAndUpdate(
    { id, type: { $in: ['versus', 'duet'] } },
    [
      {
        $set: {
          'votes.a': { $max: [0, { $add: [{ $ifNull: ['$votes.a', 0] }, deltaA] }] },
          'votes.b': { $max: [0, { $add: [{ $ifNull: ['$votes.b', 0] }, deltaB] }] },
        },
      },
    ],
    { returnDocument: 'after' }
  )
  // Driver mongodb v6/v7: findOneAndUpdate devuelve el documento directamente
  // (o null). Versiones antiguas devolvían { value }. Soportamos ambos.
  const doc = res && res.value !== undefined ? res.value : res
  return doc ? strip(doc) : null
}

// ────────────────────────────────────────────────────────────────────────────
// CHALLENGES (antes _challenges.json) — solicitudes de reto pendientes
// ────────────────────────────────────────────────────────────────────────────

export async function getAllChallenges() {
  const col = await getCollection(CHALLENGES)
  const docs = await col.find({}).sort({ _seq: -1 }).toArray()
  return docs.map(strip)
}

export async function insertChallenge(challenge) {
  const col = await getCollection(CHALLENGES)
  await col.insertOne({ ...challenge, _seq: nextSeq() })
  return challenge
}

export async function deleteChallenge(id) {
  const col = await getCollection(CHALLENGES)
  await col.deleteOne({ id })
}

// Activa/desactiva el botón de "Retar" (Swords) de una publicación tipo
// "Your post" (reto abierto, `open: true`). SOLO el creador (`from.id`) puede
// cambiarlo — la verificación de propiedad va DENTRO del filtro (atómico),
// no en un paso aparte, para que sea imposible que otro usuario lo cambie
// aunque conozca el id del reto. Devuelve el documento actualizado (con
// `allowChallenge` ya reflejado) o `null` si no existe / no es el dueño.
export async function setChallengeAllowChallenge(id, ownerId, allow) {
  const col = await getCollection(CHALLENGES)
  const res = await col.findOneAndUpdate(
    { id, open: true, 'from.id': ownerId },
    { $set: { allowChallenge: !!allow } },
    { returnDocument: 'after' }
  )
  const doc = res && res.value !== undefined ? res.value : res
  return doc ? strip(doc) : null
}

// ────────────────────────────────────────────────────────────────────────────
// VOTES (antes _votes.json) — votos de los posts del feed integrado (demo)
// Estructura original: { [postId]: { a, b } } con valores ABSOLUTOS (semilla +
// votos). Aquí cada post es un documento { id, a, b }.
// ────────────────────────────────────────────────────────────────────────────

// Mapa { [postId]: { a, b } } con TODOS los votos guardados. Equivale a leer el
// objeto completo de _votes.json.
export async function getAllBuiltinVotes() {
  const col = await getCollection(VOTES)
  const docs = await col.find({}).toArray()
  const map = {}
  for (const d of docs) map[d.id] = { a: d.a, b: d.b }
  return map
}

// Incremento ATÓMICO de un voto en un post integrado del feed. La primera vez
// que se vota un post, se inicializa con la semilla determinista `seed` (que
// hace que cada versus "se sienta vivo" antes de votar) y se suma el voto, todo
// en una única operación atómica (pipeline de actualización con $ifNull +
// upsert) -> sin race conditions en votos simultáneos. Devuelve { a, b }.
//
// CAMBIO DE VOTO: igual que incrementPostVote, si `previousSide` viene
// informado y es distinto de `side` se resta 1 del lado anterior y se suma 1
// al nuevo (el total no cambia); si es igual a `side`, no-op.
export async function incrementBuiltinVote(id, side, seed, previousSide) {
  const col = await getCollection(VOTES)
  const isSwitch = previousSide === 'a' || previousSide === 'b'
  const noOp = isSwitch && previousSide === side
  const incA = noOp ? 0 : (side === 'a' ? 1 : (isSwitch && previousSide === 'a' ? -1 : 0))
  const incB = noOp ? 0 : (side === 'b' ? 1 : (isSwitch && previousSide === 'b' ? -1 : 0))
  const res = await col.findOneAndUpdate(
    { id },
    [
      {
        $set: {
          a: { $max: [0, { $add: [{ $ifNull: ['$a', seed.a] }, incA] }] },
          b: { $max: [0, { $add: [{ $ifNull: ['$b', seed.b] }, incB] }] },
        },
      },
    ],
    { upsert: true, returnDocument: 'after' }
  )
  const doc = res && res.value !== undefined ? res.value : res
  return doc ? { a: doc.a, b: doc.b } : { a: seed.a + incA, b: seed.b + incB }
}
