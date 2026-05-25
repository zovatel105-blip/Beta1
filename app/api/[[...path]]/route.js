import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Local videos served from /public/videos/*.mp4 (no Content-Disposition issues, no CORS)
const v = (id) => `/videos/${id}.mp4`

const VIDEOS = [
  { url: v(51265 - 0), author: { username: 'wanderlust', name: 'Sofía Vela', avatarUrl: 'https://i.pravatar.cc/120?img=47' }, description: 'Atardeceres que detienen el tiempo 🌅 #viajes #naturaleza', music: 'Sofía Vela — Horizonte (original)' },
  { url: v(4467),  author: { username: 'urbanlife',  name: 'Marco Ruiz',   avatarUrl: 'https://i.pravatar.cc/120?img=12' }, description: 'La ciudad nunca duerme ✨🏙️ #urban #night #vibes', music: 'Marco Ruiz — Neon Lights' },
  { url: v(39880), author: { username: 'oceanvibes', name: 'Lía Mar',      avatarUrl: 'https://i.pravatar.cc/120?img=32' }, description: 'POV: el mar te llama 🌊 #ocean #blue #relax', music: 'Lía Mar — Olas (original)' },
  { url: v(51140), author: { username: 'fitfreak',   name: 'Diego Torres', avatarUrl: 'https://i.pravatar.cc/120?img=15' }, description: 'Rutina de hoy 💪 sin excusas. #fitness #gym', music: 'Diego Torres — Push It' },
  { url: v(50324), author: { username: 'foodie',     name: 'Carla Gómez',  avatarUrl: 'https://i.pravatar.cc/120?img=20' }, description: 'Receta express que rompe 🍝 #foodtok #recetas', music: 'Carla Gómez — Cocina con beats' },
  { url: v(51261), author: { username: 'dancepro',   name: 'Nina León',    avatarUrl: 'https://i.pravatar.cc/120?img=49' }, description: 'Nuevo paso de baile 🔥 #dancechallenge #trend', music: 'Nina León — Move it' },
  { url: v(51269), author: { username: 'streetcam',  name: 'Hugo Pérez',   avatarUrl: 'https://i.pravatar.cc/120?img=8'  }, description: 'Tokio en 30 segundos 🇯🇵 #travel #tokio', music: 'Hugo Pérez — Lost in Tokio' },
  { url: v(1108),  author: { username: 'cosmos',     name: 'Ana Stelar',   avatarUrl: 'https://i.pravatar.cc/120?img=44' }, description: 'El universo desde mi ventana 🌌 #space #aesthetic', music: 'Ana Stelar — Cosmos' },
  { url: v(51316), author: { username: 'petlover',   name: 'Bruno Cat',    avatarUrl: 'https://i.pravatar.cc/120?img=5'  }, description: 'Mi gato se cree humano 😼 #pets #funny', music: 'Bruno Cat — Meow remix' },
  { url: v(51330), author: { username: 'studyflow',  name: 'Lucía Pen',    avatarUrl: 'https://i.pravatar.cc/120?img=29' }, description: 'Study with me ✍️ 25min focus #study', music: 'Lo-fi Beats — Chill study' },
  { url: v(51453), author: { username: 'beauty',     name: 'Mía Rosé',     avatarUrl: 'https://i.pravatar.cc/120?img=45' }, description: 'GRWM mañana de verano ☀️ #grwm', music: 'Mía Rosé — Glow' },
  { url: v(1149),  author: { username: 'gamerzz',    name: 'Tom Pixel',    avatarUrl: 'https://i.pravatar.cc/120?img=11' }, description: 'Combo imposible 🎮 #gaming #plays', music: 'Tom Pixel — Game over' },
  { url: v(51571), author: { username: 'skylineart', name: 'Cielo Azul',   avatarUrl: 'https://i.pravatar.cc/120?img=38' }, description: 'Time lapse del cielo en 4K 🌤️ #timelapse', music: 'Cielo Azul — Clouds' },
  { url: v(51580), author: { username: 'coffeeshop', name: 'Café Sur',     avatarUrl: 'https://i.pravatar.cc/120?img=27' }, description: 'Latte art en cámara lenta ☕ #coffee', music: 'Café Sur — Slow morning' },
  { url: v(51601), author: { username: 'cyclelife',  name: 'Ruta Cleta',   avatarUrl: 'https://i.pravatar.cc/120?img=9'  }, description: 'Pedalear es libertad 🚴 #bike', music: 'Ruta Cleta — Spin' },
  { url: v(51410), author: { username: 'photopro',   name: 'Foto Click',   avatarUrl: 'https://i.pravatar.cc/120?img=18' }, description: 'Detrás de cámaras 📸 #photo', music: 'Foto Click — Click click' },
  { url: v(51365), author: { username: 'sunsetlove', name: 'Sol Oro',      avatarUrl: 'https://i.pravatar.cc/120?img=42' }, description: 'Golden hour magic ✨🌇 #goldenhour', music: 'Sol Oro — Gold' },
  { url: v(51524), author: { username: 'streetdance',name: 'Cami Beat',    avatarUrl: 'https://i.pravatar.cc/120?img=39' }, description: 'Freestyle en la calle 🕺 #dance', music: 'Cami Beat — Street move' },
  { url: v(51241), author: { username: 'wavelife',   name: 'Surf Bay',     avatarUrl: 'https://i.pravatar.cc/120?img=33' }, description: 'Tube de hoy 🤙🏄‍♀️ #surf', music: 'Surf Bay — Wave catch' },
  { url: v(51146), author: { username: 'arteviva',   name: 'Pince Arte',   avatarUrl: 'https://i.pravatar.cc/120?img=25' }, description: 'Pintando con luz 🎨 #art', music: 'Pince Arte — Brush' },
  { url: v(51142), author: { username: 'foodart',    name: 'Choco Lab',    avatarUrl: 'https://i.pravatar.cc/120?img=21' }, description: 'Chocolate fundido a 1000fps 🍫 #foodporn', music: 'Choco Lab — Melt' },
  { url: v(51144), author: { username: 'flowyoga',   name: 'Sara Asana',   avatarUrl: 'https://i.pravatar.cc/120?img=46' }, description: 'Saludo al sol matinal 🧘‍♀️ #yoga', music: 'Sara Asana — Breathe' },
  { url: v(51160), author: { username: 'auto_speed', name: 'Rev Max',      avatarUrl: 'https://i.pravatar.cc/120?img=14' }, description: 'V8 a fondo 🏎️ #cars', music: 'Rev Max — Engine roar' },
]
// Replace the first (we don't actually have 51265.mp4, swap to a downloaded id)
VIDEOS[0].url = v(51330)

function makePosts(start, count) {
  const posts = []
  for (let i = 0; i < count; i++) {
    const idx = (start + i) % VIDEOS.length
    const base = VIDEOS[idx]
    const id = `post_${start + i}`
    posts.push({
      id,
      videoUrl: base.url,
      thumbnailUrl: '',
      author: base.author,
      description: base.description,
      music: base.music,
      stats: {
        likes: 1200 + Math.floor(Math.random() * 90000),
        comments: 30 + Math.floor(Math.random() * 4000),
        shares: 10 + Math.floor(Math.random() * 1200),
        saves: 5 + Math.floor(Math.random() * 800),
      },
      duration: 12 + Math.floor(Math.random() * 30),
    })
  }
  return posts
}

export async function GET(request, { params }) {
  const segs = (params?.path) || []
  const path = '/' + segs.join('/')

  if (path === '/feed') {
    const { searchParams } = new URL(request.url)
    const cursor = parseInt(searchParams.get('cursor') || '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10), 20)
    const posts = makePosts(cursor, limit)
    return NextResponse.json({ posts, nextCursor: cursor + limit, hasMore: true })
  }

  if (path === '/' || path === '') {
    return NextResponse.json({ ok: true, service: 'snaptok-api' })
  }
  return NextResponse.json({ error: 'not_found', path }, { status: 404 })
}

export async function POST() {
  return NextResponse.json({ ok: true })
}
