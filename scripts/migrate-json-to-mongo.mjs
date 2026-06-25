// Migración única: importa los datos existentes de los archivos JSON
//   public/uploads/_meta.json       -> colección `posts`
//   public/uploads/_challenges.json -> colección `challenges`
//   public/uploads/_votes.json      -> colección `votes`
// Es IDEMPOTENTE (upsert por `id`): se puede ejecutar varias veces sin duplicar.
//
// Uso:  node scripts/migrate-json-to-mongo.mjs
import { MongoClient } from 'mongodb'
import { readFile } from 'fs/promises'
import path from 'path'

const ROOT = process.cwd()
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads')

// Cargar MONGO_URL desde .env (sin dependencias externas).
async function loadMongoUrl() {
  if (process.env.MONGO_URL) return process.env.MONGO_URL
  try {
    const env = await readFile(path.join(ROOT, '.env'), 'utf-8')
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*MONGO_URL\s*=\s*(.+)\s*$/)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
  throw new Error('MONGO_URL no definido')
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(UPLOAD_DIR, file), 'utf-8'))
  } catch {
    return fallback
  }
}

async function main() {
  const uri = await loadMongoUrl()
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()

  // 1) POSTS (de _meta.json). Orden: index 0 = más reciente -> mayor _seq.
  const meta = await readJson('_meta.json', [])
  let postsUp = 0
  for (let i = 0; i < meta.length; i++) {
    const post = meta[i]
    if (!post || !post.id) continue
    const _seq = meta.length - i
    await db.collection('posts').updateOne(
      { id: post.id },
      { $set: { ...post, _seq } },
      { upsert: true }
    )
    postsUp++
  }

  // 2) CHALLENGES (de _challenges.json).
  const challenges = await readJson('_challenges.json', [])
  let chUp = 0
  for (let i = 0; i < challenges.length; i++) {
    const ch = challenges[i]
    if (!ch || !ch.id) continue
    const _seq = challenges.length - i
    await db.collection('challenges').updateOne(
      { id: ch.id },
      { $set: { ...ch, _seq } },
      { upsert: true }
    )
    chUp++
  }

  // 3) VOTES (de _votes.json). Estructura { [postId]: { a, b } }.
  const votes = await readJson('_votes.json', {})
  let vUp = 0
  for (const [id, val] of Object.entries(votes)) {
    if (!val) continue
    await db.collection('votes').updateOne(
      { id },
      { $set: { id, a: Number(val.a) || 0, b: Number(val.b) || 0 } },
      { upsert: true }
    )
    vUp++
  }

  console.log(JSON.stringify({
    posts: postsUp,
    challenges: chUp,
    votes: vUp,
    totals: {
      posts: await db.collection('posts').countDocuments(),
      challenges: await db.collection('challenges').countDocuments(),
      votes: await db.collection('votes').countDocuments(),
    },
  }, null, 2))

  await client.close()
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
