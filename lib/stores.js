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

// Incremento ATÓMICO de un voto en una publicación subida (versus/1vs1/reto).
// Sustituye el patrón leer-modificar-reescribir (race condition en votos
// simultáneos) por un único $inc atómico. Devuelve el post actualizado o null
// si no existe una publicación versus/duet con ese id.
export async function incrementPostVote(id, side) {
  const col = await getCollection(POSTS)
  const field = side === 'a' ? 'votes.a' : 'votes.b'
  const res = await col.findOneAndUpdate(
    { id, type: { $in: ['versus', 'duet'] } },
    { $inc: { [field]: 1 } },
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
export async function incrementBuiltinVote(id, side, seed) {
  const col = await getCollection(VOTES)
  const incA = side === 'a' ? 1 : 0
  const incB = side === 'b' ? 1 : 0
  const res = await col.findOneAndUpdate(
    { id },
    [
      {
        $set: {
          a: { $add: [{ $ifNull: ['$a', seed.a] }, incA] },
          b: { $add: [{ $ifNull: ['$b', seed.b] }, incB] },
        },
      },
    ],
    { upsert: true, returnDocument: 'after' }
  )
  const doc = res && res.value !== undefined ? res.value : res
  return doc ? { a: doc.a, b: doc.b } : { a: seed.a + incA, b: seed.b + incB }
}
