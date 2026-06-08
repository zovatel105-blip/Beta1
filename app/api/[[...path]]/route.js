import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import nodePath from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = nodePath.join(process.cwd(), 'public', 'uploads')
const UPLOAD_META = nodePath.join(UPLOAD_DIR, '_meta.json')

function transcodeToWebm(inPath, outPath) {
  return new Promise((resolve) => {
    const args = [
      '-y', '-i', inPath,
      '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
      '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-threads', '2',
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ]
    const p = spawn('ffmpeg', args)
    p.on('error', () => resolve(false))
    p.on('exit', (code) => resolve(code === 0))
  })
}

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
}
async function readUploadMeta() {
  try {
    const raw = await fs.readFile(UPLOAD_META, 'utf-8')
    return JSON.parse(raw)
  } catch { return [] }
}
async function writeUploadMeta(arr) {
  await ensureUploadDir()
  await fs.writeFile(UPLOAD_META, JSON.stringify(arr, null, 2))
}

// Votes store for built-in (non-persisted) feed posts, keyed by post id.
const VOTES_STORE = nodePath.join(UPLOAD_DIR, '_votes.json')
async function readVotesStore() {
  try { return JSON.parse(await fs.readFile(VOTES_STORE, 'utf-8')) } catch { return {} }
}
async function writeVotesStore(obj) {
  await ensureUploadDir()
  await fs.writeFile(VOTES_STORE, JSON.stringify(obj, null, 2))
}
// Deterministic base votes so each built-in versus feels "alive" before voting.
function seedVotes(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return { a: 60 + (h % 900), b: 60 + (Math.floor(h / 7) % 900) }
}

// Retos (challenges) store: solicitudes de enfrentamiento pendientes.
const CHALLENGES_STORE = nodePath.join(UPLOAD_DIR, '_challenges.json')
async function readChallenges() {
  try { return JSON.parse(await fs.readFile(CHALLENGES_STORE, 'utf-8')) } catch { return [] }
}
async function writeChallenges(arr) {
  await ensureUploadDir()
  await fs.writeFile(CHALLENGES_STORE, JSON.stringify(arr, null, 2))
}

const ME_AUTHOR = {
  username: 'tu_canal',
  name: 'Tú',
  avatarUrl: 'https://i.pravatar.cc/120?img=68',
}

// Local videos served from /public/videos/*.mp4 (no Content-Disposition issues, no CORS)
const v = (id) => `/videos/${id}.mp4`

// Poster (primer fotograma) asociado a un vídeo: /videos/x.mp4 -> /videos/x.jpg,
// /uploads/x.mp4 -> /uploads/x.jpg. Permite mostrar la publicación al instante.
const posterFor = (url) => (typeof url === 'string' ? url.replace(/\.(mp4|webm|mov|m4v)$/i, '.jpg') : '')

// Genera un poster JPG del primer fotograma de un vídeo subido (best-effort).
function makePoster(inPath, outPath) {
  return new Promise((resolve) => {
    const args = ['-y', '-ss', '0.1', '-i', inPath, '-frames:v', '1', '-vf', "scale='min(480,iw)':-2", '-q:v', '4', outPath]
    const p = spawn('ffmpeg', args)
    p.on('error', () => resolve(false))
    p.on('exit', (code) => resolve(code === 0))
  })
}

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
    const n = start + i
    const a = VIDEOS[(2 * n) % VIDEOS.length]
    const b = VIDEOS[(2 * n + 1) % VIDEOS.length]
    const id = `versus_${n}`
    posts.push({
      id,
      type: 'versus',
      layout: 'carousel',
      // Carrusel de 2 opciones (A / B) entre las que se desliza y se vota.
      sideA: { videoUrl: a.url, posterUrl: posterFor(a.url), author: a.author, description: a.description, music: a.music },
      sideB: { videoUrl: b.url, posterUrl: posterFor(b.url), author: b.author, description: b.description, music: b.music },
      // Campos top-level por compat con el resto del feed (cabecera, etc.)
      author: a.author,
      description: a.description,
      music: a.music,
      videoUrl: a.url,
      posterUrl: posterFor(a.url),
      thumbnailUrl: posterFor(a.url),
      stats: {
        likes: 1200 + Math.floor(Math.random() * 90000),
        comments: 30 + Math.floor(Math.random() * 4000),
        shares: 10 + Math.floor(Math.random() * 1200),
        saves: 5 + Math.floor(Math.random() * 800),
      },
      votes: { a: 0, b: 0 },
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
    const store = await readVotesStore()
    const posts = makePosts(cursor, limit).map((p) => ({
      ...p,
      votes: store[p.id] || seedVotes(p.id),
    }))
    return NextResponse.json({ posts, nextCursor: cursor + limit, hasMore: true })
  }

  if (path === '/uploads') {
    const meta = await readUploadMeta()
    return NextResponse.json({ posts: meta })
  }

  // Lista de retos (solicitudes de enfrentamiento) pendientes.
  if (path === '/challenges') {
    const list = await readChallenges()
    return NextResponse.json({ challenges: list })
  }

  // Catálogo de vídeos disponibles para emparejar en un 1vs1.
  // Mezcla los vídeos del feed + uploads del usuario (versus).
  if (path === '/feed-options') {
    const uploads = await readUploadMeta()
    // No anidamos duets como opción de emparejamiento.
    const userOptions = uploads
      .filter((p) => p.type !== 'duet')
      .map((p) => ({
        id: p.id,
        videoUrl: p.videoUrl,
        author: p.author,
        description: p.description,
        music: p.music,
        source: 'upload',
      }))
    const builtin = VIDEOS.map((vd, i) => ({
      id: `builtin_${i}`,
      videoUrl: vd.url,
      author: vd.author,
      description: vd.description,
      music: vd.music,
      source: 'builtin',
    }))
    return NextResponse.json({ options: [...userOptions, ...builtin] })
  }

  // Lista de creadores (usuarios demo) para elegir a quién retar.
  if (path === '/users') {
    const seen = new Set()
    const users = []
    for (const vd of VIDEOS) {
      const a = vd.author
      if (a && a.username && !seen.has(a.username)) {
        seen.add(a.username)
        users.push(a)
      }
    }
    return NextResponse.json({ users })
  }

  if (path === '/' || path === '') {
    return NextResponse.json({ ok: true, service: 'snaptok-api' })
  }
  return NextResponse.json({ error: 'not_found', path }, { status: 404 })
}

export async function POST(request, { params }) {
  const segs = (params?.path) || []
  const path = '/' + segs.join('/')

  if (path === '/versus') {
    return handleVersusUpload(request)
  }

  if (path === '/duet') {
    return handleDuetUpload(request)
  }

  if (path === '/vote') {
    return handleVote(request)
  }

  // Crear un reto (solicitud de enfrentamiento) con un vídeo subido.
  if (path === '/challenges') {
    return handleCreateChallenge(request)
  }
  // Aceptar un reto -> publica un versus (A=retador, B=retado).
  if (segs[0] === 'challenges' && segs[2] === 'accept') {
    return handleAcceptChallenge(segs[1], request)
  }
  // Rechazar / cancelar un reto.
  if (segs[0] === 'challenges' && segs[2] === 'reject') {
    return handleRejectChallenge(segs[1])
  }

  return NextResponse.json({ ok: true })
}

async function handleVersusUpload(request) {
  try {
    const formData = await request.formData()
    const fileA = formData.get('fileA')
    const fileB = formData.get('fileB')
    const description = (formData.get('description') || '¿Cuál prefieres? 🅰️🆚🅱️').toString()
    const captionA = (formData.get('captionA') || '').toString()
    const captionB = (formData.get('captionB') || '').toString()

    if (!fileA || typeof fileA === 'string' || !fileB || typeof fileB === 'string') {
      return NextResponse.json({ error: 'need_two_files' }, { status: 400 })
    }

    const saveOne = async (file) => {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = Buffer.from(arrayBuffer)
      const id = crypto.randomBytes(8).toString('hex')
      const name = file.name || 'video.mp4'
      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'mp4'
      const safeExt = ['mp4', 'webm', 'mov', 'm4v'].includes(ext) ? ext : 'mp4'
      const filename = `${id}.${safeExt}`
      await ensureUploadDir()
      const filePath = nodePath.join(UPLOAD_DIR, filename)
      await fs.writeFile(filePath, bytes)
      const webmPath = nodePath.join(UPLOAD_DIR, `${id}.webm`)
      transcodeToWebm(filePath, webmPath).then((ok) => {
        if (!ok) console.warn('webm transcode failed for versus', filename)
      })
      // Poster del primer fotograma para carga instantánea.
      makePoster(filePath, nodePath.join(UPLOAD_DIR, `${id}.jpg`))
      return `/uploads/${filename}`
    }

    await ensureUploadDir()
    const urlA = await saveOne(fileA)
    const urlB = await saveOne(fileB)
    const id = crypto.randomBytes(8).toString('hex')

    const meAuthor = {
      username: 'tu_canal',
      name: 'Tú',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
    }

    const post = {
      id: `versus_up_${id}`,
      type: 'versus',
      layout: 'carousel',
      sideA: { videoUrl: urlA, posterUrl: posterFor(urlA), author: meAuthor, description: captionA || description, music: 'Opción A' },
      sideB: { videoUrl: urlB, posterUrl: posterFor(urlB), author: meAuthor, description: captionB || description, music: 'Opción B' },
      author: meAuthor,
      description,
      music: 'Tu versus original',
      videoUrl: urlA,
      posterUrl: posterFor(urlA),
      thumbnailUrl: posterFor(urlA),
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
    }
    const meta = await readUploadMeta()
    meta.unshift(post)
    await writeUploadMeta(meta)
    return NextResponse.json({ ok: true, post })
  } catch (err) {
    console.error('versus upload error', err)
    return NextResponse.json({ error: 'versus_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 1vs1 (Duet) endpoints
// ────────────────────────────────────────────────────────────────────────────

// POST /api/duet
//   FormData: fileA, fileB, description, layout ('horizontal'|'vertical')
//   El usuario sube SUS DOS vídeos (A y B). Se publica como type='duet' con el
//   layout elegido (horizontal = arriba/abajo, vertical = izq/der).
async function handleDuetUpload(request) {
  try {
    const formData = await request.formData()
    const fileA = formData.get('fileA')
    const fileB = formData.get('fileB')
    const description = (formData.get('description') || '¿Quién gana? 🥊 #1vs1').toString()
    const layoutRaw = (formData.get('layout') || 'horizontal').toString()
    const layout = layoutRaw === 'vertical' ? 'vertical' : 'horizontal'

    if (!fileA || typeof fileA === 'string' || !fileB || typeof fileB === 'string') {
      return NextResponse.json({ error: 'need_two_files' }, { status: 400 })
    }

    const urlA = await saveUploadedVideo(fileA)
    const urlB = await saveUploadedVideo(fileB)
    const id = crypto.randomBytes(8).toString('hex')

    const post = {
      id: `duet_${id}`,
      type: 'duet',
      layout, // 'horizontal' | 'vertical'
      // Ambos lados son contenido propio del usuario.
      sideA: { videoUrl: urlA, posterUrl: posterFor(urlA), author: ME_AUTHOR, description, music: 'Opción A' },
      sideB: { videoUrl: urlB, posterUrl: posterFor(urlB), author: ME_AUTHOR, description, music: 'Opción B' },
      author: ME_AUTHOR,
      description,
      music: 'Tu 1vs1 original',
      videoUrl: urlA,
      posterUrl: posterFor(urlA),
      thumbnailUrl: posterFor(urlA),
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
    }
    const meta = await readUploadMeta()
    meta.unshift(post)
    await writeUploadMeta(meta)
    return NextResponse.json({ ok: true, post })
  } catch (err) {
    console.error('duet upload error', err)
    return NextResponse.json({ error: 'duet_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/vote   body: { id, side: 'a'|'b' }
// Increments the vote counter for that side of a duet/versus post.
// Uploads persist in _meta.json; built-in feed posts persist in _votes.json.
async function handleVote(request) {
  try {
    const body = await request.json().catch(() => null)
    const id = body?.id
    const side = body?.side
    if (!id || (side !== 'a' && side !== 'b')) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    // 1) Uploaded posts (duet or versus) -> persist in meta
    const meta = await readUploadMeta()
    const idx = meta.findIndex((p) => p.id === id && (p.type === 'duet' || p.type === 'versus'))
    if (idx !== -1) {
      const p = meta[idx]
      p.votes = p.votes || { a: 0, b: 0 }
      p.votes[side] = (p.votes[side] || 0) + 1
      meta[idx] = p
      await writeUploadMeta(meta)
      return NextResponse.json({ ok: true, votes: p.votes })
    }
    // 2) Built-in feed versus posts -> persist in votes store (seed if first time)
    const store = await readVotesStore()
    const base = store[id] || seedVotes(id)
    base[side] = (base[side] || 0) + 1
    store[id] = base
    await writeVotesStore(store)
    return NextResponse.json({ ok: true, votes: base })
  } catch (err) {
    return NextResponse.json({ error: 'vote_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Retos (challenges)
// ────────────────────────────────────────────────────────────────────────────

// Guarda un vídeo subido y devuelve su URL pública (/uploads/...).
async function saveUploadedVideo(file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = Buffer.from(arrayBuffer)
  const id = crypto.randomBytes(8).toString('hex')
  const name = file.name || 'video.mp4'
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'mp4'
  const safeExt = ['mp4', 'webm', 'mov', 'm4v'].includes(ext) ? ext : 'mp4'
  const filename = `${id}.${safeExt}`
  await ensureUploadDir()
  const filePath = nodePath.join(UPLOAD_DIR, filename)
  await fs.writeFile(filePath, bytes)
  const webmPath = nodePath.join(UPLOAD_DIR, `${id}.webm`)
  transcodeToWebm(filePath, webmPath).then((ok) => {
    if (!ok) console.warn('webm transcode failed for challenge', filename)
  })
  makePoster(filePath, nodePath.join(UPLOAD_DIR, `${id}.jpg`))
  return `/uploads/${filename}`
}

// POST /api/challenges
//   FormData: file (vídeo del retador), targetVideoUrl, targetAuthor (JSON),
//             targetDescription, targetMusic, message
async function handleCreateChallenge(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const targetVideoUrl = (formData.get('targetVideoUrl') || '').toString()
    let targetAuthor = null
    try { targetAuthor = JSON.parse((formData.get('targetAuthor') || 'null').toString()) } catch {}
    const targetDescription = (formData.get('targetDescription') || '').toString()
    const targetMusic = (formData.get('targetMusic') || '').toString()
    const message = (formData.get('message') || '').toString()

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'no_file' }, { status: 400 })
    }
    if (!targetAuthor) {
      return NextResponse.json({ error: 'no_target' }, { status: 400 })
    }

    const myUrl = await saveUploadedVideo(file)
    const cid = crypto.randomBytes(8).toString('hex')
    const challenge = {
      id: `challenge_${cid}`,
      status: 'pending',
      from: ME_AUTHOR,
      to: targetAuthor,
      challengerVideoUrl: myUrl, // lado A = tu vídeo
      targetVideoUrl: targetVideoUrl || null, // lado B = lo sube el retado al aceptar
      targetAuthor,
      targetDescription,
      targetMusic,
      message,
      createdAt: new Date().toISOString(),
    }
    const list = await readChallenges()
    list.unshift(challenge)
    await writeChallenges(list)
    return NextResponse.json({ ok: true, challenge })
  } catch (err) {
    console.error('create challenge error', err)
    return NextResponse.json({ error: 'challenge_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/challenges/{id}/accept -> publica un versus y elimina el reto.
// El retado puede subir SU vídeo (multipart 'file'); si el reto ya traía
// targetVideoUrl (reto a un contenido concreto) se usa ese.
async function handleAcceptChallenge(cid, request) {
  try {
    const list = await readChallenges()
    const idx = list.findIndex((c) => c.id === cid)
    if (idx === -1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const c = list[idx]

    // Vídeo de respuesta del retado: el subido al aceptar, o el ya conocido.
    let responseVideoUrl = c.targetVideoUrl || null
    try {
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && typeof file !== 'string') {
        responseVideoUrl = await saveUploadedVideo(file)
      }
    } catch { /* sin cuerpo multipart, se usa targetVideoUrl si existe */ }

    if (!responseVideoUrl) {
      return NextResponse.json({ error: 'no_response_video' }, { status: 400 })
    }

    const id = crypto.randomBytes(8).toString('hex')
    const post = {
      id: `versus_ch_${id}`,
      type: 'versus',
      layout: 'carousel',
      sideA: { videoUrl: c.challengerVideoUrl, posterUrl: posterFor(c.challengerVideoUrl), author: c.from, description: c.message || 'Mi reto', music: 'Reto' },
      sideB: { videoUrl: responseVideoUrl, posterUrl: posterFor(responseVideoUrl), author: c.to, description: c.targetDescription || '', music: c.targetMusic || '' },
      author: c.from,
      description: c.message || `Reto: @${c.from?.username} 🆚 @${c.to?.username} 🥊`,
      music: 'Reto aceptado',
      videoUrl: c.challengerVideoUrl,
      posterUrl: posterFor(c.challengerVideoUrl),
      thumbnailUrl: posterFor(c.challengerVideoUrl),
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
      isChallenge: true,
    }
    const meta = await readUploadMeta()
    meta.unshift(post)
    await writeUploadMeta(meta)
    list.splice(idx, 1)
    await writeChallenges(list)
    return NextResponse.json({ ok: true, post })
  } catch (err) {
    console.error('accept challenge error', err)
    return NextResponse.json({ error: 'accept_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/challenges/{id}/reject -> elimina el reto.
async function handleRejectChallenge(cid) {
  try {
    const list = await readChallenges()
    const next = list.filter((c) => c.id !== cid)
    await writeChallenges(next)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'reject_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}
