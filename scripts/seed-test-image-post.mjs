import { MongoClient } from 'mongodb'
import crypto from 'crypto'

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/twyk'

const author = {
  id: '2ec2c286-5206-4cdf-82d7-e342df64431f',
  username: 'Twyk ',
  name: 'Twyk ',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Twyk ',
  verified: false,
}

const imgA = 'https://picsum.photos/seed/twykA/720/1280'
const imgB = 'https://picsum.photos/seed/twykB/720/1280'

const description =
  'Publicación de prueba con imagen y título 📸 Este es un texto deliberadamente largo para comprobar que el caption se trunca a dos líneas en el feed y aparece el botón "…más" estilo Instagram Reels. Toca "…más" para expandir el texto completo y "menos" para volver a contraerlo. #prueba #twyk #imagen #caption'

const id = crypto.randomBytes(8).toString('hex')
const post = {
  id: `versus_up_${id}`,
  type: 'versus',
  layout: 'carousel',
  mediaType: 'image',
  sideA: { mediaType: 'image', videoUrl: '', imageUrl: imgA, posterUrl: imgA, author, description, music: 'Option A' },
  sideB: { mediaType: 'image', videoUrl: '', imageUrl: imgB, posterUrl: imgB, author, description, music: 'Option B' },
  author,
  description,
  music: 'Tu versus original',
  videoUrl: '',
  posterUrl: imgA,
  thumbnailUrl: imgA,
  stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
  votes: { a: 0, b: 0 },
  duration: 0,
  uploadedAt: new Date().toISOString(),
}

const client = new MongoClient(MONGO_URL)
try {
  await client.connect()
  const db = client.db()
  await db.collection('posts').insertOne({ ...post, _seq: Date.now() * 1000 + Math.floor(Math.random() * 1000) })
  console.log('Inserted test image post:', post.id)
} catch (e) {
  console.error('ERR', e)
  process.exit(1)
} finally {
  await client.close()
}
