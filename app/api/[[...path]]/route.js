import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import nodePath from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { 
  createUser, 
  verifyUserCredentials, 
  createSession, 
  getSessionByToken,
  deleteSession,
  getUserById,
  createComment as createCommentDB,
  getCommentsByPostId,
  toggleCommentLike as toggleCommentLikeDB,
  deleteComment as deleteCommentDB,
  toggleSave as toggleSaveDB,
  getSavesByUserId,
  isPostSavedByUser,
  getPosts as getPostsDB,
  createPost as createPostDB,
  votePost as votePostDB,
  incrementPostViews,
  getNotifications as getNotificationsDB,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationsCount,
} from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = nodePath.join(process.cwd(), 'public', 'uploads')
const UPLOAD_META = nodePath.join(UPLOAD_DIR, '_meta.json')

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Obtener usuario actual desde token
// ────────────────────────────────────────────────────────────────────────────
async function getCurrentUser(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                  request.cookies.get('session_token')?.value
    
    console.log('[getCurrentUser] Token:', token ? 'found' : 'not found')
    
    if (!token) return null
    
    const session = await getSessionByToken(token)
    console.log('[getCurrentUser] Session:', session ? 'found' : 'not found')
    
    if (!session) return null
    
    const user = await getUserById(session.userId)
    console.log('[getCurrentUser] User:', user ? user.username : 'not found')
    
    if (!user) return null
    
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  } catch (err) {
    console.error('Error getting current user:', err)
    return null
  }
}

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

function runFfmpeg(args) {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', args)
    p.on('error', () => resolve(false))
    p.on('exit', (code) => resolve(code === 0))
  })
}

// FASE 1 — Fast start: remux con el átomo `moov` al inicio del MP4 para que la
// reproducción arranque con los primeros bytes (instantáneo). Lossless y rápido
// (sin recodificar). Solo aplica a .mp4. Se hace en segundo plano; en Linux,
// renombrar sobre un fichero abierto es seguro (poster/webm siguen leyendo el
// inodo anterior), así que no hay carrera.
async function faststartInPlace(absPath) {
  if (!/\.mp4$/i.test(absPath)) return false
  const dir = nodePath.dirname(absPath)
  const tmp = nodePath.join(dir, `._fs_${nodePath.basename(absPath)}`)
  const ok = await runFfmpeg(['-y', '-i', absPath, '-c', 'copy', '-movflags', '+faststart', tmp])
  if (ok) { try { await fs.rename(tmp, absPath) } catch { return false } }
  else { try { await fs.unlink(tmp) } catch { /* ignore */ } }
  return ok
}

// FASE 2 — Renditions adaptativas (H.264, +faststart, GOP corto ~2s) en 3 niveles.
const RENDITIONS = [
  { h: 360, vb: '600k',  maxrate: '700k',  bufsize: '1200k', bitrate: 600000 },
  { h: 540, vb: '1200k', maxrate: '1500k', bufsize: '3000k', bitrate: 1200000 },
  { h: 720, vb: '2500k', maxrate: '3000k', bufsize: '6000k', bitrate: 2500000 },
]
function transcodeRendition(inAbs, outAbs, r) {
  return runFfmpeg([
    '-y', '-i', inAbs,
    '-vf', `scale=-2:${r.h}`,
    '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'veryfast',
    '-b:v', r.vb, '-maxrate', r.maxrate, '-bufsize', r.bufsize,
    '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
    '-movflags', '+faststart',
    outAbs,
  ])
}

// Genera renditions SOLO para vídeos recién subidos (/uploads/...). Los vídeos
// integrados (/videos/...) y cualquier URL externa se omiten -> NO se
// re-transcodifican los vídeos ya existentes.
async function generateRenditions(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null
  const filename = url.split('/').pop()
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return null
  const id = filename.slice(0, dot)
  const inAbs = nodePath.join(UPLOAD_DIR, filename)
  const out = []
  for (const r of RENDITIONS) {
    const outName = `${id}_${r.h}.mp4`
    const ok = await transcodeRendition(inAbs, nodePath.join(UPLOAD_DIR, outName), r)
    if (ok) out.push({ h: r.h, url: `/uploads/${outName}`, bitrate: r.bitrate })
  }
  return out.length ? out : null
}

// Procesa un post recién publicado: genera renditions de A y B y parchea
// sideA.qualities / sideB.qualities en _meta.json cuando terminan (así el
// frontend nunca apunta a una URL que aún no existe -> sin 404).
async function processPostRenditions(postId, sideAUrl, sideBUrl) {
  try {
    const [qa, qb] = await Promise.all([generateRenditions(sideAUrl), generateRenditions(sideBUrl)])
    if (!qa && !qb) return
    const meta = await readUploadMeta()
    const p = meta.find((x) => x.id === postId)
    if (!p) return
    if (qa && p.sideA) p.sideA.qualities = qa
    if (qb && p.sideB) p.sideB.qualities = qb
    if (qa) p.qualities = qa
    await writeUploadMeta(meta)
  } catch (e) { console.warn('renditions failed', postId, String(e?.message || e)) }
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

// ────────────────────────────────────────────────────────────────────────────
// COMENTARIOS Y GUARDADOS (SAVES)
// ────────────────────────────────────────────────────────────────────────────

const COMMENTS_STORE = nodePath.join(UPLOAD_DIR, '_comments.json')
async function readComments() {
  try { return JSON.parse(await fs.readFile(COMMENTS_STORE, 'utf-8')) } catch { return {} }
}
async function writeComments(obj) {
  await ensureUploadDir()
  await fs.writeFile(COMMENTS_STORE, JSON.stringify(obj, null, 2))
}

const SAVES_STORE = nodePath.join(UPLOAD_DIR, '_saves.json')
async function readSaves() {
  try { return JSON.parse(await fs.readFile(SAVES_STORE, 'utf-8')) } catch { return {} }
}
async function writeSaves(obj) {
  await ensureUploadDir()
  await fs.writeFile(SAVES_STORE, JSON.stringify(obj, null, 2))
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
    
    try {
      // Intentar obtener posts reales de MongoDB
      const result = await getPostsDB({ cursor, limit })
      
      // Si hay posts reales, devolverlos
      if (result.posts.length > 0) {
        return NextResponse.json(result)
      }
      
      // Fallback: Si no hay posts en MongoDB, usar datos de demo
      console.log('⚠️  No hay posts en MongoDB, usando datos de demo')
      const store = await readVotesStore()
      const posts = makePosts(cursor, limit).map((p) => ({
        ...p,
        votes: store[p.id] || seedVotes(p.id),
      }))
      return NextResponse.json({ posts, nextCursor: cursor + limit, hasMore: true })
    } catch (err) {
      console.error('Error fetching posts from MongoDB:', err)
      // Fallback en caso de error
      const store = await readVotesStore()
      const posts = makePosts(cursor, limit).map((p) => ({
        ...p,
        votes: store[p.id] || seedVotes(p.id),
      }))
      return NextResponse.json({ posts, nextCursor: cursor + limit, hasMore: true })
    }
  }

  if (path === '/uploads') {
    const meta = await readUploadMeta()
    return NextResponse.json({ posts: meta })
  }

  // Lista de retos COMPLETADOS (retos aceptados -> publicados como versus).
  // Devuelve los posts reales (mismo shape que el feed) para renderizarlos con
  // el mismo diseño (CarouselSlide/DuetSlide). Se derivan de los uploads con
  // isChallenge=true; sus votos van en vivo dentro de cada post.
  if (path === '/challenges/completed') {
    const meta = await readUploadMeta()
    const posts = meta.filter((p) => p.isChallenge && (p.type === 'versus' || p.type === 'duet'))
    return NextResponse.json({ posts })
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

  // GET /api/comments?postId=xxx - Obtener comentarios de un post
  if (path === '/comments') {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')
    if (!postId) {
      return NextResponse.json({ error: 'missing_postId' }, { status: 400 })
    }
    
    const currentUser = await getCurrentUser(request)
    const comments = await getCommentsByPostId(postId, currentUser?.id)
    return NextResponse.json({ comments })
  }

  // GET /api/saves - Obtener posts guardados del usuario
  if (path === '/saves') {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    
    const saves = await getSavesByUserId(currentUser.id)
    return NextResponse.json({ saves })
  }

  // GET /api/auth/me - Obtener usuario actual
  if (path === '/auth/me') {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ user: currentUser })
  }

  // GET /api/notifications - Obtener notificaciones del usuario
  if (path === '/notifications') {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') || 'all'
    
    const notifications = await getNotificationsDB(currentUser.id, { filter })
    return NextResponse.json({ notifications })
  }

  // GET /api/notifications/unread - Contador de notificaciones no leídas
  if (path === '/notifications/unread') {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ count: 0 })
    }

    const count = await getUnreadNotificationsCount(currentUser.id)
    return NextResponse.json({ count })
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

  // POST /api/comments - Crear un nuevo comentario
  if (path === '/comments') {
    return handleCreateComment(request)
  }

  // POST /api/comments/like - Dar like a un comentario
  if (path === '/comments/like') {
    return handleLikeComment(request)
  }

  // POST /api/save - Guardar/quitar de guardados un post
  if (path === '/save') {
    return handleSavePost(request)
  }

  // POST /api/auth/register - Registrar nuevo usuario
  if (path === '/auth/register') {
    return handleRegister(request)
  }

  // POST /api/auth/login - Iniciar sesión
  if (path === '/auth/login') {
    return handleLogin(request)
  }

  // POST /api/auth/logout - Cerrar sesión
  if (path === '/auth/logout') {
    return handleLogout(request)
  }

  // POST /api/notifications/read - Marcar notificaciones como leídas
  if (path === '/notifications/read') {
    return handleMarkNotificationsRead(request)
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
    // Obtener usuario autenticado (opcional por ahora para backward compatibility)
    const currentUser = await getCurrentUser(request)
    
    const formData = await request.formData()
    const fileA = formData.get('fileA')
    const fileB = formData.get('fileB')
    const description = (formData.get('description') || '¿Cuál prefieres? 🅰️🆚🅱️').toString()
    const captionA = (formData.get('captionA') || '').toString()
    const captionB = (formData.get('captionB') || '').toString()

    if (!fileA || typeof fileA === 'string' || !fileB || typeof fileB === 'string') {
      return NextResponse.json({ error: 'need_two_files' }, { status: 400 })
    }

    const saveOne = async (file) => saveUploadedVideo(file)

    await ensureUploadDir()
    const urlA = await saveOne(fileA)
    const urlB = await saveOne(fileB)
    const id = crypto.randomBytes(8).toString('hex')

    // Usar datos reales del usuario autenticado si está disponible, sino usar fallback
    const realAuthor = currentUser ? {
      id: currentUser.id,
      username: currentUser.username,
      name: currentUser.name || currentUser.username,
      avatarUrl: currentUser.avatarUrl,
      verified: currentUser.verified || false,
    } : {
      id: 'anonymous',
      username: 'usuario_anonimo',
      name: 'Usuario Anónimo',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
      verified: false,
    }

    const post = {
      id: `versus_up_${id}`,
      type: 'versus',
      layout: 'carousel',
      sideA: { videoUrl: urlA, posterUrl: posterFor(urlA), author: realAuthor, description: captionA || description, music: 'Opción A' },
      sideB: { videoUrl: urlB, posterUrl: posterFor(urlB), author: realAuthor, description: captionB || description, music: 'Opción B' },
      author: realAuthor,
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
    // Renditions ABR DESACTIVADAS: degradaban la calidad (reescalado) y las
    // versiones 540/720 pesaban más que el original -> menos fluidez. Servimos
    // el original (con faststart) que da mejor calidad Y arranque rápido.
    // processPostRenditions(post.id, urlA, urlB)
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
    // Obtener usuario autenticado (opcional por ahora para backward compatibility)
    const currentUser = await getCurrentUser(request)

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

    // Usar datos reales del usuario autenticado si está disponible, sino usar fallback
    const realAuthor = currentUser ? {
      id: currentUser.id,
      username: currentUser.username,
      name: currentUser.name || currentUser.username,
      avatarUrl: currentUser.avatarUrl,
      verified: currentUser.verified || false,
    } : {
      id: 'anonymous',
      username: 'usuario_anonimo',
      name: 'Usuario Anónimo',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
      verified: false,
    }

    const post = {
      id: `duet_${id}`,
      type: 'duet',
      layout, // 'horizontal' | 'vertical'
      // Ambos lados son contenido propio del usuario.
      sideA: { videoUrl: urlA, posterUrl: posterFor(urlA), author: realAuthor, description, music: 'Opción A' },
      sideB: { videoUrl: urlB, posterUrl: posterFor(urlB), author: realAuthor, description, music: 'Opción B' },
      author: realAuthor,
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
    // Renditions ABR DESACTIVADAS (ver nota en el flujo versus): servimos el
    // original con faststart -> mejor calidad y fluidez.
    // processPostRenditions(post.id, urlA, urlB)
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

    const currentUser = await getCurrentUser(request)
    
    // 1) Intentar con MongoDB posts primero
    try {
      const votes = await votePostDB(id, side, currentUser?.id)
      return NextResponse.json({ ok: true, votes })
    } catch (mongoErr) {
      // Si no existe en MongoDB, continuar con el sistema legacy
    }
    
    // 2) Uploaded posts (duet or versus) -> persist in meta
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
    // 3) Built-in feed versus posts -> persist in votes store (seed if first time)
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
  // FASE 1: fast start del original (fallback) -> arranque instantáneo.
  faststartInPlace(filePath)
  // Poster del primer fotograma para carga instantánea.
  makePoster(filePath, nodePath.join(UPLOAD_DIR, `${id}.jpg`))
  return `/uploads/${filename}`
}

// POST /api/challenges
//   FormData: file (vídeo del retador), targetVideoUrl, targetAuthor (JSON),
//             targetDescription, targetMusic, message
async function handleCreateChallenge(request) {
  try {
    // Obtener usuario autenticado (opcional por ahora para backward compatibility)
    const currentUser = await getCurrentUser(request)

    const formData = await request.formData()
    const file = formData.get('file')
    const targetVideoUrl = (formData.get('targetVideoUrl') || '').toString()
    let targetAuthor = null
    try { targetAuthor = JSON.parse((formData.get('targetAuthor') || 'null').toString()) } catch { /* ignore */ }
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
    
    // Usar datos reales del usuario autenticado si está disponible, sino usar fallback
    const realAuthor = currentUser ? {
      id: currentUser.id,
      username: currentUser.username,
      name: currentUser.name || currentUser.username,
      avatarUrl: currentUser.avatarUrl,
      verified: currentUser.verified || false,
    } : {
      id: 'anonymous',
      username: 'usuario_anonimo',
      name: 'Usuario Anónimo',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
      verified: false,
    }
    
    const challenge = {
      id: `challenge_${cid}`,
      status: 'pending',
      from: realAuthor,
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
    // Renditions ABR DESACTIVADAS (ver nota en el flujo versus): servimos el
    // original con faststart -> mejor calidad y fluidez.
    // processPostRenditions(post.id, c.challengerVideoUrl, responseVideoUrl)
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

// ────────────────────────────────────────────────────────────────────────────
// HANDLERS DE COMENTARIOS Y GUARDADOS
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// HANDLERS DE AUTENTICACIÓN
// ────────────────────────────────────────────────────────────────────────────

// POST /api/auth/register - Registrar nuevo usuario
async function handleRegister(request) {
  try {
    const body = await request.json()
    const { username, email, password } = body

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 })
    }

    const user = await createUser({ username, email, password })
    const session = await createSession(user.id)

    const response = NextResponse.json({ ok: true, user, token: session.token })
    response.cookies.set('session_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 días
    })

    return response
  } catch (err) {
    console.error('register error', err)
    if (err.message === 'username_taken') {
      return NextResponse.json({ error: 'username_taken', message: 'El nombre de usuario ya existe' }, { status: 400 })
    }
    if (err.message === 'email_taken') {
      return NextResponse.json({ error: 'email_taken', message: 'El email ya está registrado' }, { status: 400 })
    }
    return NextResponse.json({ error: 'register_failed' }, { status: 500 })
  }
}

// POST /api/auth/login - Iniciar sesión
async function handleLogin(request) {
  try {
    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    const user = await verifyUserCredentials(username, password)
    if (!user) {
      return NextResponse.json({ error: 'invalid_credentials', message: 'Usuario o contraseña incorrectos' }, { status: 401 })
    }

    const session = await createSession(user.id)

    const response = NextResponse.json({ ok: true, user, token: session.token })
    response.cookies.set('session_token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    })

    return response
  } catch (err) {
    console.error('login error', err)
    return NextResponse.json({ error: 'login_failed' }, { status: 500 })
  }
}

// POST /api/auth/logout - Cerrar sesión
async function handleLogout(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                  request.cookies.get('session_token')?.value

    if (token) {
      await deleteSession(token)
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.delete('session_token')
    return response
  } catch (err) {
    console.error('logout error', err)
    return NextResponse.json({ error: 'logout_failed' }, { status: 500 })
  }
}

// POST /api/notifications/read - Marcar notificaciones como leídas
async function handleMarkNotificationsRead(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { notificationId, all } = body

    if (all) {
      await markAllNotificationsAsRead(currentUser.id)
    } else if (notificationId) {
      await markNotificationAsRead(notificationId)
    } else {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('mark notifications read error', err)
    return NextResponse.json({ error: 'mark_read_failed' }, { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLERS DE COMENTARIOS (ACTUALIZADOS CON MONGODB)
// ────────────────────────────────────────────────────────────────────────────

// POST /api/comments - Crear un comentario
async function handleCreateComment(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'Debes iniciar sesión' }, { status: 401 })
    }

    const body = await request.json()
    const { postId, text } = body

    if (!postId || !text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_data' }, { status: 400 })
    }

    const comment = await createCommentDB({ 
      postId, 
      userId: currentUser.id, 
      text: text.trim() 
    })

    // Formatear para el frontend
    const formattedComment = {
      id: comment.id,
      postId: comment.postId,
      text: comment.text,
      likes: comment.likes,
      userLiked: false,
      isOwn: true,
      timestamp: comment.createdAt,
      author: comment.author,
    }

    return NextResponse.json({ ok: true, comment: formattedComment })
  } catch (err) {
    console.error('create comment error', err)
    return NextResponse.json({ error: 'create_failed' }, { status: 500 })
  }
}

// POST /api/comments/like - Dar like a un comentario
async function handleLikeComment(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { commentId } = body

    if (!commentId) {
      return NextResponse.json({ error: 'missing_commentId' }, { status: 400 })
    }

    const result = await toggleCommentLikeDB(commentId, currentUser.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('like comment error', err)
    if (err.message === 'comment_not_found') {
      return NextResponse.json({ error: 'comment_not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'like_failed' }, { status: 500 })
  }
}

// POST /api/save - Guardar/quitar de guardados
async function handleSavePost(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { postId } = body

    if (!postId) {
      return NextResponse.json({ error: 'missing_postId' }, { status: 400 })
    }

    const result = await toggleSaveDB(postId, currentUser.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('save post error', err)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }
}

// DELETE /api/comments/{id} - Eliminar un comentario
async function handleDeleteComment(commentId, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    if (!commentId) {
      return NextResponse.json({ error: 'missing_commentId' }, { status: 400 })
    }

    await deleteCommentDB(commentId, currentUser.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('delete comment error', err)
    if (err.message === 'comment_not_found') {
      return NextResponse.json({ error: 'comment_not_found' }, { status: 404 })
    }
    if (err.message === 'unauthorized') {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
    }
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }
}

// Exportar método DELETE
export async function DELETE(request, { params }) {
  const segs = (params?.path) || []
  
  // DELETE /api/comments/{id}
  if (segs[0] === 'comments' && segs[1]) {
    return handleDeleteComment(segs[1])
  }

  return NextResponse.json({ error: 'not_found' }, { status: 404 })
}
