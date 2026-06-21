import { MongoClient } from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'

// Cargar MONGO_URL desde .env
let MONGO_URL = process.env.MONGO_URL
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = env.match(/MONGO_URL=(.*)/)
  if (m) MONGO_URL = m[1].trim()
} catch {}
MONGO_URL = MONGO_URL || 'mongodb://localhost:27017/twyk'

const id = () => crypto.randomUUID()
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex')

const testUsers = [
  { username: 'carlos23', email: 'carlos@test.com', avatarUrl: 'https://i.pravatar.cc/120?img=1' },
  { username: 'maria_lopez', email: 'maria@test.com', avatarUrl: 'https://i.pravatar.cc/120?img=5' },
  { username: 'juan_dev', email: 'juan@test.com', avatarUrl: 'https://i.pravatar.cc/120?img=10' },
  { username: 'ana_designer', email: 'ana@test.com', avatarUrl: 'https://i.pravatar.cc/120?img=15' },
  { username: 'pedro_gamer', email: 'pedro@test.com', avatarUrl: 'https://i.pravatar.cc/120?img=20' },
]

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db()
  const users = db.collection('users')
  const follows = db.collection('follows')

  const byName = {}
  for (const u of testUsers) {
    let doc = await users.findOne({ username: u.username })
    if (!doc) {
      doc = {
        id: id(), username: u.username, email: u.email, password: hash('test123'),
        avatarUrl: u.avatarUrl, name: u.username, bio: '', verified: false,
        followers: 0, following: 0, likes: 0, createdAt: new Date(),
      }
      await users.insertOne(doc)
      console.log('Usuario creado:', u.username)
    } else {
      console.log('Usuario ya existe:', u.username)
    }
    byName[u.username] = doc
  }

  // Relaciones: maria, juan, ana, pedro siguen a carlos23 (followers de carlos)
  // carlos23 sigue a maria_lopez y juan_dev (following de carlos)
  const rels = [
    ['maria_lopez', 'carlos23'],
    ['juan_dev', 'carlos23'],
    ['ana_designer', 'carlos23'],
    ['pedro_gamer', 'carlos23'],
    ['carlos23', 'maria_lopez'],
    ['carlos23', 'juan_dev'],
  ]
  for (const [follower, target] of rels) {
    const followerId = byName[follower].id
    const followingUsername = target
    const exists = await follows.findOne({ followerId, followingUsername })
    if (!exists) {
      await follows.insertOne({ id: id(), followerId, followingUsername, createdAt: new Date() })
      console.log(`${follower} -> ${target}`)
    }
  }

  await client.close()
  console.log('Seed follows completo')
}

main().catch((e) => { console.error(e); process.exit(1) })
