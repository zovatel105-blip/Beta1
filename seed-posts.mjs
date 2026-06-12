import { MongoClient } from 'mongodb'
import crypto from 'crypto'

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/twyk'

const v = (id) => `/videos/${id}.mp4`
const posterFor = (url) => url.replace(/\.(mp4|webm|mov|m4v)$/i, '.jpg')

// Usuarios de demostración para los posts
const demoUsers = [
  { id: crypto.randomUUID(), username: 'wanderlust', name: 'Sofía Vela', avatarUrl: 'https://i.pravatar.cc/120?img=47' },
  { id: crypto.randomUUID(), username: 'urbanlife', name: 'Marco Ruiz', avatarUrl: 'https://i.pravatar.cc/120?img=12' },
  { id: crypto.randomUUID(), username: 'oceanvibes', name: 'Lía Mar', avatarUrl: 'https://i.pravatar.cc/120?img=32' },
  { id: crypto.randomUUID(), username: 'fitfreak', name: 'Diego Torres', avatarUrl: 'https://i.pravatar.cc/120?img=15' },
  { id: crypto.randomUUID(), username: 'foodie', name: 'Carla Gómez', avatarUrl: 'https://i.pravatar.cc/120?img=20' },
]

const demoPosts = [
  {
    type: 'versus',
    layout: 'carousel',
    sideA: {
      videoUrl: v(51330),
      posterUrl: posterFor(v(51330)),
      author: demoUsers[0],
      description: 'Atardeceres que detienen el tiempo 🌅 #viajes #naturaleza',
      music: 'Sofía Vela — Horizonte (original)',
    },
    sideB: {
      videoUrl: v(4467),
      posterUrl: posterFor(v(4467)),
      author: demoUsers[1],
      description: 'La ciudad nunca duerme ✨🏙️ #urban #night #vibes',
      music: 'Marco Ruiz — Neon Lights',
    },
  },
  {
    type: 'versus',
    layout: 'carousel',
    sideA: {
      videoUrl: v(39880),
      posterUrl: posterFor(v(39880)),
      author: demoUsers[2],
      description: 'POV: el mar te llama 🌊 #ocean #blue #relax',
      music: 'Lía Mar — Olas (original)',
    },
    sideB: {
      videoUrl: v(51140),
      posterUrl: posterFor(v(51140)),
      author: demoUsers[3],
      description: 'Rutina de hoy 💪 sin excusas. #fitness #gym',
      music: 'Diego Torres — Push It',
    },
  },
  {
    type: 'versus',
    layout: 'carousel',
    sideA: {
      videoUrl: v(50324),
      posterUrl: posterFor(v(50324)),
      author: demoUsers[4],
      description: 'Receta express que rompe 🍝 #foodtok #recetas',
      music: 'Carla Gómez — Cocina con beats',
    },
    sideB: {
      videoUrl: v(51261),
      posterUrl: posterFor(v(51261)),
      author: demoUsers[0],
      description: 'Nuevo paso de baile 🔥 #dancechallenge #trend',
      music: 'Nina León — Move it',
    },
  },
]

async function seed() {
  const client = new MongoClient(MONGO_URL)
  
  try {
    await client.connect()
    console.log('✅ Conectado a MongoDB')
    
    const db = client.db()
    
    // 1. Crear usuarios de demo si no existen
    const usersCollection = db.collection('users')
    console.log('\n📝 Creando usuarios de demo...')
    
    for (const user of demoUsers) {
      const existing = await usersCollection.findOne({ username: user.username })
      if (!existing) {
        await usersCollection.insertOne({
          ...user,
          email: `${user.username}@demo.com`,
          password: 'demo_user_no_login', // No se puede hacer login con estos usuarios
          bio: `Usuario de demostración - ${user.name}`,
          verified: false,
          followers: Math.floor(Math.random() * 10000),
          following: Math.floor(Math.random() * 500),
          likes: 0,
          createdAt: new Date(),
        })
        console.log(`  ✅ Usuario creado: ${user.username}`)
      } else {
        console.log(`  ⚠️  Usuario ya existe: ${user.username}`)
      }
    }
    
    // 2. Crear posts de demo
    const postsCollection = db.collection('posts')
    console.log('\n📝 Creando posts de demo...')
    
    for (const postData of demoPosts) {
      const post = {
        id: crypto.randomUUID(),
        userId: postData.sideA.author.id,
        type: postData.type,
        layout: postData.layout,
        videoUrl: postData.sideA.videoUrl,
        posterUrl: postData.sideA.posterUrl,
        thumbnailUrl: postData.sideA.posterUrl,
        description: postData.sideA.description,
        music: postData.sideA.music,
        author: postData.sideA.author,
        sideA: postData.sideA,
        sideB: postData.sideB,
        stats: {
          likes: Math.floor(Math.random() * 50000),
          comments: 0,
          shares: Math.floor(Math.random() * 2000),
          saves: 0,
          views: Math.floor(Math.random() * 100000),
        },
        votes: { a: Math.floor(Math.random() * 500), b: Math.floor(Math.random() * 500) },
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Últimos 7 días
      }
      
      await postsCollection.insertOne(post)
      console.log(`  ✅ Post creado: ${post.id.slice(0, 8)}...`)
    }
    
    console.log('\n✅ Seed completado exitosamente!')
    console.log('\n📊 Resumen:')
    console.log(`   Usuarios: ${demoUsers.length}`)
    console.log(`   Posts: ${demoPosts.length}`)
    
  } catch (err) {
    console.error('❌ Error en seed:', err)
    process.exit(1)
  } finally {
    await client.close()
    process.exit(0)
  }
}

seed()
