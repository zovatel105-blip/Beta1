// Script temporal de verificación visual: crea UN reto abierto ("single")
// usando una imagen ya existente en public/uploads, autor = lucia, para
// poder ver el nuevo botón "Fire" en el feed principal.
import { MongoClient } from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'

let MONGO_URL = process.env.MONGO_URL
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = env.match(/MONGO_URL=(.*)/)
  if (m) MONGO_URL = m[1].trim()
} catch {}
MONGO_URL = MONGO_URL || 'mongodb://localhost:27017/twyk'

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db()
  const users = db.collection('users')
  const challenges = db.collection('challenges')

  const lucia = await users.findOne({ username: 'lucia' })
  if (!lucia) throw new Error('lucia no existe, corre seed-core-users.mjs primero')

  const doc = {
    id: crypto.randomUUID(),
    from: { id: lucia.id, username: lucia.username, name: lucia.name, avatarUrl: lucia.avatarUrl },
    to: null,
    open: true,
    challengerMediaType: 'image',
    challengerImageUrl: '/uploads/015623e375fc8e00.jpg',
    challengerPosterUrl: '/uploads/015623e375fc8e00.jpg',
    message: 'Reto abierto de prueba (verificación botón Fire)',
    musicTitle: null,
    musicArtist: null,
    createdAt: new Date(),
    _seq: Date.now() * 1000,
  }
  await challenges.insertOne(doc)
  console.log('Reto abierto de prueba creado:', doc.id)
  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
