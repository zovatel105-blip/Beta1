// Seed idempotente de las cuentas de prueba principales usadas para verificar
// la app tras una pérdida de datos (MongoDB efímero + .env restaurado).
// Uso: node scripts/seed-core-users.mjs
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import fs from 'fs'

let MONGO_URL = process.env.MONGO_URL
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = env.match(/MONGO_URL=(.*)/)
  if (m) MONGO_URL = m[1].trim()
} catch {}
MONGO_URL = MONGO_URL || 'mongodb://localhost:27017/twyk'

const id = () => crypto.randomUUID()
const hash = (p) => bcrypt.hash(p, 12)

const CORE_USERS = [
  { username: 'twyk', name: 'Twyk', email: 'twyk.apk@gmail.com', password: 'Admin12345', role: 'admin' },
  { username: 'lucia', email: 'lucia@test.com', password: 'Test12345', role: 'user' },
  { username: 'marcos', email: 'marcos@test.com', password: 'Test12345', role: 'user' },
  { username: 'laura', email: 'laura@test.com', password: 'Test12345', role: 'user' },
]

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db()
  const users = db.collection('users')
  const follows = db.collection('follows')

  const byName = {}
  for (const u of CORE_USERS) {
    let doc = await users.findOne({ username: u.username })
    if (!doc) {
      doc = {
        id: id(),
        username: u.username,
        email: u.email,
        birthDate: null,
        password: await hash(u.password),
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
        name: u.name || u.username,
        bio: '',
        verified: false,
        role: u.role,
        suspended: false,
        followers: 0,
        following: 0,
        likes: 0,
        createdAt: new Date(),
      }
      await users.insertOne(doc)
      console.log(`Usuario creado: ${u.username} (${u.role})`)
    } else {
      console.log(`Usuario ya existe: ${u.username}`)
    }
    byName[u.username] = doc
  }

  // Relaciones básicas: marcos y laura siguen a lucia; lucia sigue a marcos.
  const rels = [
    ['marcos', 'lucia'],
    ['laura', 'lucia'],
    ['lucia', 'marcos'],
  ]
  for (const [follower, target] of rels) {
    const followerId = byName[follower].id
    const followingUsername = target
    const exists = await follows.findOne({ followerId, followingUsername })
    if (!exists) {
      await follows.insertOne({ id: id(), followerId, followingUsername, createdAt: new Date() })
      console.log(`follow: ${follower} -> ${target}`)
    }
  }

  await client.close()
  console.log('Seed core users completo')
}

main().catch((e) => { console.error(e); process.exit(1) })
