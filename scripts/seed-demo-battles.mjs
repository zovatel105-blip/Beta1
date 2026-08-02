// Siembra batallas versus de demostración a partir de los vídeos que ya
// existen en /app/public/uploads (la BD Mongo es efímera en esta plataforma y
// los posts se pierden; los archivos SÍ persisten). Idempotente: no duplica.
//
// Uso: node scripts/seed-demo-battles.mjs [cantidad]
import { MongoClient } from 'mongodb'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/twyk'
const UPLOADS = '/app/public/uploads'
const COUNT = parseInt(process.argv[2] || '8', 10)

// Descripciones con hashtags que mapean a categorías del recomendador
const DESCS = [
  ['#dance #trend ¿Quién lo hace mejor?', '#dancechallenge dale al que más flow tenga'],
  ['#food #recipes receta A 🍜', '#foodtok receta B 🍕 ¿cuál gana?'],
  ['#travel #tokyo destino A ✈️', '#travel destino B 🌴 vota tu favorito'],
  ['#fitness #gym rutina A 💪', '#fitness rutina B 🏋️ ¿cuál es más dura?'],
  ['#funny momento A 😂', '#funny momento B 🤣 el más gracioso gana'],
  ['#gaming jugada A 🎮', '#gaming #plays jugada B ⚡ vota la mejor'],
  ['#art #aesthetic estilo A 🎨', '#art estilo B ✨ ¿cuál te inspira más?'],
  ['#urban #night vibes A 🌃', '#vibes vibes B 🌆 elige tu ambiente'],
  ['#nature #ocean paisaje A 🌊', '#nature paisaje B 🏔️ vota el más épico'],
  ['#pets mascota A 🐶', '#pets mascota B 🐱 ¿team perro o team gato?'],
]

const client = new MongoClient(MONGO_URL)
try {
  await client.connect()
  const db = client.db()

  // Idempotencia: si ya hay batallas demo, no volver a sembrar.
  const existing = await db.collection('posts').countDocuments({ id: /^versus_demo_/ })
  if (existing > 0) {
    console.log(`Ya existen ${existing} batallas demo. Nada que hacer.`)
    process.exit(0)
  }

  // Usuarios sembrados (autores reales de la BD).
  const users = await db.collection('users')
    .find({ username: { $in: ['lucia', 'marcos', 'laura', 'twykadmin'] } }).toArray()
  if (users.length === 0) {
    console.error('No hay usuarios. Ejecuta primero scripts/seed-core-users.mjs')
    process.exit(1)
  }
  const toAuthor = (u) => ({
    id: u.id, username: u.username, name: u.name || u.username,
    avatarUrl: u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
    verified: u.verified || false,
  })

  // Vídeos en disco que tienen póster jpg (pareja mp4+jpg completa).
  const files = fs.readdirSync(UPLOADS)
  const jpgs = new Set(files.filter((f) => f.endsWith('.jpg')).map((f) => path.basename(f, '.jpg')))
  const vids = files.filter((f) => f.endsWith('.mp4') && jpgs.has(path.basename(f, '.mp4')))
  if (vids.length < 2) {
    console.error('No hay suficientes vídeos con póster en public/uploads')
    process.exit(1)
  }

  const n = Math.min(COUNT, Math.floor(vids.length / 2), DESCS.length)
  const docs = []
  for (let i = 0; i < n; i++) {
    const fA = vids[i * 2], fB = vids[i * 2 + 1]
    const urlA = `/uploads/${fA}`, urlB = `/uploads/${fB}`
    const posterA = `/uploads/${path.basename(fA, '.mp4')}.jpg`
    const posterB = `/uploads/${path.basename(fB, '.mp4')}.jpg`
    const author = toAuthor(users[i % users.length])
    const [dA, dB] = DESCS[i]
    const id = `versus_demo_${crypto.randomBytes(6).toString('hex')}`
    // Edades escalonadas (0.5h a 36h) para que la señal de frescura discrimine.
    const ageMs = (0.5 + i * 5) * 3600 * 1000
    const uploadedAt = new Date(Date.now() - ageMs).toISOString()
    docs.push({
      id, type: 'versus', layout: 'carousel', mediaType: 'video',
      sideA: { mediaType: 'video', videoUrl: urlA, imageUrl: '', posterUrl: posterA, author, description: dA, music: 'Option A' },
      sideB: { mediaType: 'video', videoUrl: urlB, imageUrl: '', posterUrl: posterB, author, description: dB, music: 'Option B' },
      author,
      description: dA,
      music: 'Tu versus original',
      videoUrl: urlA, posterUrl: posterA, thumbnailUrl: posterA,
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt,
      createdAtMs: Date.now() - ageMs,
      _seq: Date.now() * 1000 - i * 1000,
    })
  }
  await db.collection('posts').insertMany(docs)
  console.log(`Sembradas ${docs.length} batallas demo:`)
  for (const d of docs) console.log(` - ${d.id} (${d.author.username}) ${d.description}`)
} catch (e) {
  console.error('ERR', e)
  process.exit(1)
} finally {
  await client.close()
}
