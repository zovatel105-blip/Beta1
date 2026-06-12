import { MongoClient } from 'mongodb'
import crypto from 'crypto'

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/twyk'

const v = (id) => `/videos/${id}.mp4`
const posterFor = (url) => url.replace(/\.(mp4|webm|mov|m4v)$/i, '.jpg')

// Posts de demostración (sin usuarios hardcodeados)
// Los usuarios se asignarán desde la base de datos
const demoPosts = [
  {
    type: 'versus',
    layout: 'carousel',
    sideA: {
      videoUrl: v(51330),
      posterUrl: posterFor(v(51330)),
      description: 'Atardeceres que detienen el tiempo 🌅 #viajes #naturaleza',
      music: 'Horizonte (original)',
    },
    sideB: {
      videoUrl: v(4467),
      posterUrl: posterFor(v(4467)),
      description: 'La ciudad nunca duerme ✨🏙️ #urban #night #vibes',
      music: 'Neon Lights',
    },
  },
  {
    type: 'versus',
    layout: 'carousel',
    sideA: {
      videoUrl: v(39880),
      posterUrl: posterFor(v(39880)),
      description: 'POV: el mar te llama 🌊 #ocean #blue #relax',
      music: 'Olas (original)',
    },
    sideB: {
      videoUrl: v(51140),
      posterFor: posterFor(v(51140)),
      description: 'Rutina de hoy 💪 sin excusas. #fitness #gym',
      music: 'Push It',
    },
  },
  {
    type: 'versus',
    layout: 'carousel',
    sideA: {
      videoUrl: v(50324),
      posterUrl: posterFor(v(50324)),
      description: 'Receta express que rompe 🍝 #foodtok #recetas',
      music: 'Cocina con beats',
    },
    sideB: {
      videoUrl: v(51261),
      posterUrl: posterFor(v(51261)),
      description: 'Nuevo paso de baile 🔥 #dancechallenge #trend',
      music: 'Move it',
    },
  },
]

async function seed() {
  const client = new MongoClient(MONGO_URL)
  
  try {
    await client.connect()
    console.log('✅ Conectado a MongoDB')
    
    const db = client.db()
    const usersCollection = db.collection('users')
    const postsCollection = db.collection('posts')
    
    // 1. Obtener usuarios reales de la base de datos
    console.log('\n📝 Obteniendo usuarios reales de la base de datos...')
    const realUsers = await usersCollection.find({}).limit(10).toArray()
    
    if (realUsers.length === 0) {
      console.log('⚠️  No hay usuarios en la base de datos.')
      console.log('   Por favor, registra algunos usuarios primero.')
      process.exit(1)
    }
    
    console.log(`   ✅ Encontrados ${realUsers.length} usuarios reales`)
    
    // 2. Crear posts de demo usando usuarios reales
    console.log('\n📝 Creando posts de demo con usuarios reales...')
    
    for (let i = 0; i < demoPosts.length; i++) {
      const postData = demoPosts[i]
      
      // Asignar usuarios reales aleatoriamente
      const userA = realUsers[i % realUsers.length]
      const userB = realUsers[(i + 1) % realUsers.length]
      
      // Preparar datos de autor (sin password)
      const authorA = {
        id: userA.id,
        username: userA.username,
        name: userA.name || userA.username,
        avatarUrl: userA.avatarUrl,
        verified: userA.verified || false,
      }
      
      const authorB = {
        id: userB.id,
        username: userB.username,
        name: userB.name || userB.username,
        avatarUrl: userB.avatarUrl,
        verified: userB.verified || false,
      }
      
      const post = {
        id: crypto.randomUUID(),
        userId: authorA.id,
        type: postData.type,
        layout: postData.layout,
        videoUrl: postData.sideA.videoUrl,
        posterUrl: postData.sideA.posterUrl,
        thumbnailUrl: postData.sideA.posterUrl,
        description: postData.sideA.description,
        music: postData.sideA.music,
        author: authorA,
        sideA: {
          ...postData.sideA,
          author: authorA,
          music: `${authorA.name} — ${postData.sideA.music}`,
        },
        sideB: {
          ...postData.sideB,
          author: authorB,
          music: `${authorB.name} — ${postData.sideB.music}`,
        },
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
      console.log(`  ✅ Post creado: ${post.id.slice(0, 8)}... (por ${authorA.username} vs ${authorB.username})`)
    }
    
    console.log('\n✅ Seed completado exitosamente!')
    console.log('\n📊 Resumen:')
    console.log(`   Usuarios utilizados: ${Math.min(realUsers.length, demoPosts.length * 2)}`)
    console.log(`   Posts creados: ${demoPosts.length}`)
    console.log('\n💡 Los posts ahora usan usuarios reales de tu base de datos')
    
  } catch (err) {
    console.error('❌ Error en seed:', err)
    process.exit(1)
  } finally {
    await client.close()
    process.exit(0)
  }
}

seed()
