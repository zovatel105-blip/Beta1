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
  getUserByUsername,
  getCurrentUsersByUsernames,
  updateUserProfile,
  getAllUsers,
  getSuggestedUsers,
  createComment as createCommentDB,
  getCommentsByPostId,
  getCommentById as getCommentByIdDB,
  toggleCommentLike as toggleCommentLikeDB,
  deleteComment as deleteCommentDB,
  toggleSave as toggleSaveDB,
  getSavesByUserId,
  isPostSavedByUser,
  incrementPostViews,
  getNotifications as getNotificationsDB,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getUnreadNotificationsCount,
  updateVoteNotificationOnSwitch,
  updateCommentsVotedSideForUser,
  toggleFollowByUsername,
  isFollowingByUsername,
  getFollowingUsernames,
  getFollowersCountByUsername,
  getFollowingCountByUsername,
  getFollowersByUsername,
  getFollowingByUsername,
  createReport,
  getPendingReports,
  getReportById,
  setReportStatus,
  resolveReportedUserId,
  suspendUser,
  blockUser,
  unblockUser,
  getMutualBlockedIds,
  hasBlocked,
  REPORT_REASONS,
} from '@/lib/db'
import {
  getAllPosts,
  insertPost,
  updatePost,
  deletePostById,
  incrementPostVote,
  getAllChallenges,
  insertChallenge,
  deleteChallenge,
  getAllBuiltinVotes,
  incrementBuiltinVote,
} from '@/lib/stores'
import { rankFeed, recordVote, recordImpressions, recordWatch, computeMetrics } from '@/lib/recommender'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = nodePath.join(process.cwd(), 'public', 'uploads')

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

    // Usuario suspendido: se trata como no autenticado (pierde acceso a la API).
    if (user.suspended) {
      console.log('[getCurrentUser] User suspended:', user.username)
      return null
    }
    
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  } catch (err) {
    console.error('Error getting current user:', err)
    return null
  }
}

// ¿El usuario actual es administrador?
function isAdmin(user) {
  return !!user && user.role === 'admin'
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
    const meta = await getAllPosts()
    const p = meta.find((x) => x.id === postId)
    if (!p) return
    const fields = {}
    if (qa && p.sideA) fields['sideA.qualities'] = qa
    if (qb && p.sideB) fields['sideB.qualities'] = qb
    if (qa) fields.qualities = qa
    if (Object.keys(fields).length) await updatePost(postId, fields)
  } catch (e) { console.warn('renditions failed', postId, String(e?.message || e)) }
}

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
}
// Lectura de publicaciones subidas (antes _meta.json). Ahora desde MongoDB
// (colección `posts`). Devuelve el array con la MISMA forma y orden (más
// reciente primero) que tenía el JSON.
async function readUploadMeta() {
  return getAllPosts()
}

// Resuelve el id de usuario "dueño" de una publicación subida (versus/duet/
// reto completado), usado para permitir que ese dueño elimine CUALQUIER
// comentario de su propia publicación (moderación estilo Instagram/TikTok).
// Los posts "demo" del feed integrado (no subidos, sin documento en Mongo) no
// tienen dueño real -> devuelve null (solo el propio autor del comentario
// podrá borrarlo en ese caso).
async function getPostAuthorId(postId) {
  try {
    const meta = await readUploadMeta()
    const p = meta.find((x) => x.id === postId)
    if (p) return p.author?.id || p.sideA?.author?.id || p.sideB?.author?.id || p.userId || null
  } catch { /* ignore */ }
  return null
}

// Lectura de votos de los posts del feed integrado (antes _votes.json). Ahora
// desde MongoDB (colección `votes`). Devuelve { [postId]: { a, b } }.
async function readVotesStore() {
  return getAllBuiltinVotes()
}
// Deterministic base votes so each built-in versus feels "alive" before voting.
function seedVotes(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return { a: 60 + (h % 900), b: 60 + (Math.floor(h / 7) % 900) }
}

// Lectura de retos pendientes (antes _challenges.json). Ahora desde MongoDB
// (colección `challenges`). Devuelve el array con la misma forma/orden.
async function readChallenges() {
  return getAllChallenges()
}

const ME_AUTHOR = {
  username: 'tu_canal',
  name: 'You',
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
  { url: v(51265 - 0), author: { username: 'wanderlust', name: 'Sofía Vela', avatarUrl: 'https://i.pravatar.cc/120?img=47' }, description: 'Sunsets that stop time 🌅 #travel #nature', music: 'Sofía Vela — Horizon (original)' },
  { url: v(4467),  author: { username: 'urbanlife',  name: 'Marco Ruiz',   avatarUrl: 'https://i.pravatar.cc/120?img=12' }, description: 'The city never sleeps ✨🏙️ #urban #night #vibes', music: 'Marco Ruiz — Neon Lights' },
  { url: v(39880), author: { username: 'oceanvibes', name: 'Lía Mar',      avatarUrl: 'https://i.pravatar.cc/120?img=32' }, description: 'POV: the sea is calling 🌊 #ocean #blue #relax', music: 'Lía Mar — Waves (original)' },
  { url: v(51140), author: { username: 'fitfreak',   name: 'Diego Torres', avatarUrl: 'https://i.pravatar.cc/120?img=15' }, description: 'My routine today 💪 no excuses. #fitness #gym', music: 'Diego Torres — Push It' },
  { url: v(50324), author: { username: 'foodie',     name: 'Carla Gómez',  avatarUrl: 'https://i.pravatar.cc/120?img=20' }, description: 'Quick recipe that slaps 🍝 #foodtok #recipes', music: 'Carla Gómez — Cooking with beats' },
  { url: v(51261), author: { username: 'dancepro',   name: 'Nina León',    avatarUrl: 'https://i.pravatar.cc/120?img=49' }, description: 'New dance move 🔥 #dancechallenge #trend', music: 'Nina León — Move it' },
  { url: v(51269), author: { username: 'streetcam',  name: 'Hugo Pérez',   avatarUrl: 'https://i.pravatar.cc/120?img=8'  }, description: 'Tokyo in 30 seconds 🇯🇵 #travel #tokyo', music: 'Hugo Pérez — Lost in Tokyo' },
  { url: v(1108),  author: { username: 'cosmos',     name: 'Ana Stelar',   avatarUrl: 'https://i.pravatar.cc/120?img=44' }, description: 'The universe from my window 🌌 #space #aesthetic', music: 'Ana Stelar — Cosmos' },
  { url: v(51316), author: { username: 'petlover',   name: 'Bruno Cat',    avatarUrl: 'https://i.pravatar.cc/120?img=5'  }, description: 'My cat acts human 😼 #pets #funny', music: 'Bruno Cat — Meow remix' },
  { url: v(51330), author: { username: 'studyflow',  name: 'Lucía Pen',    avatarUrl: 'https://i.pravatar.cc/120?img=29' }, description: 'Study with me ✍️ 25min focus #study', music: 'Lo-fi Beats — Chill study' },
  { url: v(51453), author: { username: 'beauty',     name: 'Mía Rosé',     avatarUrl: 'https://i.pravatar.cc/120?img=45' }, description: 'GRWM summer morning ☀️ #grwm', music: 'Mía Rosé — Glow' },
  { url: v(1149),  author: { username: 'gamerzz',    name: 'Tom Pixel',    avatarUrl: 'https://i.pravatar.cc/120?img=11' }, description: 'Impossible combo 🎮 #gaming #plays', music: 'Tom Pixel — Game over' },
  { url: v(51571), author: { username: 'skylineart', name: 'Cielo Azul',   avatarUrl: 'https://i.pravatar.cc/120?img=38' }, description: 'Sky time lapse in 4K 🌤️ #timelapse', music: 'Cielo Azul — Clouds' },
  { url: v(51580), author: { username: 'coffeeshop', name: 'Café Sur',     avatarUrl: 'https://i.pravatar.cc/120?img=27' }, description: 'Latte art in slow motion ☕ #coffee', music: 'Café Sur — Slow morning' },
  { url: v(51601), author: { username: 'cyclelife',  name: 'Ruta Cleta',   avatarUrl: 'https://i.pravatar.cc/120?img=9'  }, description: 'Pedaling is freedom 🚴 #bike', music: 'Ruta Cleta — Spin' },
  { url: v(51410), author: { username: 'photopro',   name: 'Foto Click',   avatarUrl: 'https://i.pravatar.cc/120?img=18' }, description: 'Behind the scenes 📸 #photo', music: 'Foto Click — Click click' },
  { url: v(51365), author: { username: 'sunsetlove', name: 'Sol Oro',      avatarUrl: 'https://i.pravatar.cc/120?img=42' }, description: 'Golden hour magic ✨🌇 #goldenhour', music: 'Sol Oro — Gold' },
  { url: v(51524), author: { username: 'streetdance',name: 'Cami Beat',    avatarUrl: 'https://i.pravatar.cc/120?img=39' }, description: 'Freestyle in the street 🕺 #dance', music: 'Cami Beat — Street move' },
  { url: v(51241), author: { username: 'wavelife',   name: 'Surf Bay',     avatarUrl: 'https://i.pravatar.cc/120?img=33' }, description: 'Barrel of the day 🤙🏄‍♀️ #surf', music: 'Surf Bay — Wave catch' },
  { url: v(51146), author: { username: 'arteviva',   name: 'Pince Arte',   avatarUrl: 'https://i.pravatar.cc/120?img=25' }, description: 'Painting with light 🎨 #art', music: 'Pince Arte — Brush' },
  { url: v(51142), author: { username: 'foodart',    name: 'Choco Lab',    avatarUrl: 'https://i.pravatar.cc/120?img=21' }, description: 'Melted chocolate at 1000fps 🍫 #foodporn', music: 'Choco Lab — Melt' },
  { url: v(51144), author: { username: 'flowyoga',   name: 'Sara Asana',   avatarUrl: 'https://i.pravatar.cc/120?img=46' }, description: 'Morning sun salutation 🧘‍♀️ #yoga', music: 'Sara Asana — Breathe' },
  { url: v(51160), author: { username: 'auto_speed', name: 'Rev Max',      avatarUrl: 'https://i.pravatar.cc/120?img=14' }, description: 'V8 flat out 🏎️ #cars', music: 'Rev Max — Engine roar' },
]
// Replace the first (we don't actually have 51265.mp4, swap to a downloaded id)
VIDEOS[0].url = v(51330)

// PRNG determinista por id: stats estables entre páginas (antes Math.random
// devolvía números distintos en cada request, haciendo "saltar" los contadores).
function seededRand(seedStr, salt) {
  let h = 2166136261
  const s = seedStr + ':' + salt
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  h = Math.imul(h ^ (h >>> 15), 2246822519)
  return ((h >>> 0) / 4294967295)
}

function makePosts(start, count) {
  const posts = []
  const L = VIDEOS.length
  for (let i = 0; i < count; i++) {
    const n = start + i
    // Emparejamiento determinista PERO diverso: desplaza el segundo lado en cada
    // ciclo para no repetir el mismo par de vídeos hasta agotar combinaciones
    // (el feed procedural antiguo repetía contenido cada 11 tarjetas).
    const ai = (n * 2) % L
    let bi = (n * 2 + 1 + Math.floor(n / L)) % L
    if (bi === ai) bi = (bi + 1) % L
    const a = VIDEOS[ai]
    const b = VIDEOS[bi]
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
        likes: 1200 + Math.floor(seededRand(id, 'likes') * 90000),
        comments: 30 + Math.floor(seededRand(id, 'comments') * 4000),
        shares: 10 + Math.floor(seededRand(id, 'shares') * 1200),
        saves: 5 + Math.floor(seededRand(id, 'saves') * 800),
      },
      votes: { a: 0, b: 0 },
      duration: 12 + Math.floor(seededRand(id, 'dur') * 30),
      // Timestamp determinista para la señal de recency (n mayor = más antiguo).
      createdAtMs: Date.now() - n * 18e5,
    })
  }
  return posts
}

// Refresca los avatares (y nombre/verificado) denormalizados de una lista de
// posts con los datos ACTUALES del usuario registrado. Corrige las fotos de
// perfil obsoletas en el feed: cada post guarda un SNAPSHOT del avatar del
// autor al publicarse, que queda viejo cuando el autor cambia su foto.
// Los autores demo (sin documento en la colección users) conservan su snapshot.
async function refreshPostAvatars(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return posts
  const unames = []
  for (const p of posts) {
    if (p.author?.username) unames.push(p.author.username)
    if (p.sideA?.author?.username) unames.push(p.sideA.author.username)
    if (p.sideB?.author?.username) unames.push(p.sideB.author.username)
  }
  const fresh = await getCurrentUsersByUsernames(unames)
  const refresh = (a) => {
    if (!a || !a.username) return a
    const f = fresh[a.username]
    if (!f) return a
    return { ...a, avatarUrl: f.avatarUrl || a.avatarUrl, name: f.name || a.name, verified: f.verified }
  }
  return posts.map((p) => ({
    ...p,
    author: refresh(p.author),
    sideA: p.sideA ? { ...p.sideA, author: refresh(p.sideA.author) } : p.sideA,
    sideB: p.sideB ? { ...p.sideB, author: refresh(p.sideB.author) } : p.sideB,
  }))
}

// MODERACIÓN: oculta del listado los posts cuyo autor (o autor de cualquiera de
// los dos lados) esté bloqueado en cualquier sentido respecto al usuario actual
// (a quién bloqueé + quién me bloqueó). Invitados ven todo.
async function filterBlockedPosts(posts, currentUser) {
  if (!currentUser || !Array.isArray(posts)) return posts
  const blocked = await getMutualBlockedIds(currentUser.id)
  if (!blocked.size) return posts
  return posts.filter((p) => {
    const ids = [p?.author?.id, p?.sideA?.author?.id, p?.sideB?.author?.id].filter(Boolean)
    return !ids.some((id) => blocked.has(id))
  })
}

export async function GET(request, { params }) {
  const segs = (params?.path) || []
  const path = '/' + segs.join('/')

  if (path === '/admin/reco/metrics') {
    const currentUser = await getCurrentUser(request)
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    try {
      const { searchParams } = new URL(request.url)
      const k = Math.min(parseInt(searchParams.get('k') || '10', 10), 50)
      const metrics = await computeMetrics({ k })
      return NextResponse.json({ ok: true, metrics })
    } catch (err) {
      return NextResponse.json({ error: 'metrics_failed', detail: String(err?.message || err) }, { status: 500 })
    }
  }

  if (path === '/reco/selftest') {
    // Auto-test del motor: entrena un viewer efímero donde "food" gana siempre
    // y verifica que la personalización lo prioriza claramente.
    const viewer = 'g:selftest-' + Date.now()
    const FOOD = '/videos/50324.mp4'
    const FOOD2 = '/videos/51142.mp4'
    const OTHERS = ['/videos/51140.mp4', '/videos/1149.mp4', '/videos/51160.mp4', '/videos/4467.mp4']
    for (let i = 0; i < 30; i++) {
      const loser = OTHERS[i % OTHERS.length]
      const trainPost = {
        id: 'st_train_' + i, author: { username: 'foodie' },
        sideA: { videoUrl: FOOD, description: '#food #recipes', author: { username: 'foodie' } },
        sideB: { videoUrl: loser, description: '#gaming #cars', author: { username: 'gamerzz' } },
      }
      await recordVote(trainPost, 'a', viewer, { hour: 12 })
    }
    const candidates = [
      { id: 'st_food', author: { username: 'foodie' }, votes: { a: 100, b: 100 },
        sideA: { videoUrl: FOOD, description: '#food', author: { username: 'foodie' } },
        sideB: { videoUrl: FOOD2, description: '#food', author: { username: 'foodart' } } },
      { id: 'st_other', author: { username: 'gamerzz' }, votes: { a: 100, b: 100 },
        sideA: { videoUrl: OTHERS[1], description: '#gaming', author: { username: 'gamerzz' } },
        sideB: { videoUrl: OTHERS[2], description: '#cars', author: { username: 'auto_speed' } } },
    ]
    const { items } = await rankFeed(candidates, { viewerKey: viewer, limit: 2, cursor: 0 })
    const result = items.map((it) => ({ id: it.post.id, pers: it.dbg.pers, score: +it.score.toFixed(4) }))
    const food = result.find((r) => r.id === 'st_food')
    const other = result.find((r) => r.id === 'st_other')
    const learned = !!(food && other && food.pers > other.pers + 0.05)
    // Limpieza del viewer de prueba.
    try {
      const { getCollection } = await import('@/lib/mongodb')
      const cols = ['reco_vectors', 'reco_profiles', 'reco_item_stats', 'reco_interactions']
      for (const cn of cols) { const col = await getCollection(cn); await col.deleteMany({ $or: [{ key: viewer }, { viewerKey: viewer }, { id: { $regex: '^st_train_' } }] }) }
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true, learned, viewer, result })
  }

  // Búsqueda de música (proxy a iTunes Search API — gratis, sin clave).
  // GET /api/music/search?q=...  -> { results: [{ id, title, artist, artwork, previewUrl, duration }] }
  if (path === '/music/search') {
    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    if (!q) return NextResponse.json({ results: [] })
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=24`
      const r = await fetch(url, { headers: { 'User-Agent': 'twyk/1.0' } })
      if (!r.ok) return NextResponse.json({ results: [] })
      const data = await r.json()
      const results = (data.results || [])
        .filter((t) => t.previewUrl) // solo pistas con preview de 30s
        .map((t) => ({
          id: String(t.trackId),
          title: t.trackName,
          artist: t.artistName,
          // artworkUrl100 -> 200x200 para mejor nitidez
          artwork: (t.artworkUrl100 || t.artworkUrl60 || '').replace('100x100', '200x200'),
          previewUrl: t.previewUrl,
          duration: 30,
        }))
      return NextResponse.json({ results })
    } catch (err) {
      console.error('music search error', err)
      return NextResponse.json({ results: [] })
    }
  }

  if (path === '/feed') {
    const { searchParams } = new URL(request.url)
    const cursor = parseInt(searchParams.get('cursor') || '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10), 20)
    const debug = searchParams.get('debug') === '1'

    const currentUser = await getCurrentUser(request)

    // Identidad del "viewer": usuario logueado (u:<id>) o invitado por cookie
    // de dispositivo (g:<gid>). El invitado obtiene personalización a partir de
    // su 2ª visita (la 1ª siembra la cookie); cold-start = ranking global.
    const gid = request.cookies.get('twyk_gid')?.value
    const viewerKey = currentUser?.id ? `u:${currentUser.id}` : (gid ? `g:${gid}` : null)

    // ── Candidatos del feed: SOLO publicaciones REALES de usuarios (uploads).
    // Se eliminaron las publicaciones mock/demo (makePosts) del feed.
    let candidates = []
    try {
      const meta = await readUploadMeta()
      candidates = (meta || []).filter((p) => p.type === 'versus' || p.type === 'duet')
    } catch { /* ignore */ }

    // Moderación: oculta posts de autores bloqueados (en ambos sentidos).
    candidates = await filterBlockedPosts(candidates, currentUser)
    const totalCandidates = candidates.length

    // ── Ranking con TWYK Engine (multi-señal + BPR + re-ranking multi-objetivo).
    const ctx = { hour: new Date().getHours() }
    const { items } = await rankFeed(candidates, { viewerKey, context: ctx, limit, cursor })
    let posts = items.filter(Boolean).map((it) => it.post)

    // Deduplicar por id: con pocos candidatos reales el ranker puede repetir el
    // mismo post; cada publicación debe aparecer una sola vez en el feed.
    {
      const seen = new Set()
      posts = posts.filter((p) => {
        if (!p || seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })
    }

    // Refresca avatares denormalizados con los datos actuales del autor.
    posts = await refreshPostAvatars(posts)

    // Anota el estado isFollowing de cada autor para el usuario logueado (UNA
    // sola consulta). Así el botón "Following" del feed persiste tras recargar.
    if (currentUser) {
      try {
        const followingSet = new Set(await getFollowingUsernames(currentUser.id))
        const annotate = (a) => (a && a.username ? { ...a, isFollowing: followingSet.has(a.username) } : a)
        posts = posts.map((p) => ({
          ...p,
          author: annotate(p.author),
          sideA: p.sideA ? { ...p.sideA, author: annotate(p.sideA.author) } : p.sideA,
          sideB: p.sideB ? { ...p.sideB, author: annotate(p.sideB.author) } : p.sideB,
        }))
      } catch { /* ignore */ }
    }

    // Registra impresiones (anti-fatiga + denominador de engagement + posición
    // para NDCG). Fire-and-forget.
    recordImpressions(posts.map((p) => p.id), viewerKey, cursor).catch(() => {})

    const payload = { posts, nextCursor: cursor + limit, hasMore: cursor + limit < totalCandidates }
    if (debug) {
      payload.debug = items.filter(Boolean).map((it) => ({ id: it.post.id, author: it.post.author?.username, score: +it.score.toFixed(4), ...it.dbg }))
    }

    const res = NextResponse.json(payload)
    // Siembra la cookie de invitado para personalización en visitas posteriores.
    if (!currentUser && !gid) {
      try {
        res.cookies.set('twyk_gid', crypto.randomUUID(), {
          httpOnly: true, secure: true, sameSite: 'none', maxAge: 365 * 24 * 60 * 60,
        })
      } catch { /* ignore */ }
    }
    return res
  }

  if (path === '/uploads') {
    const currentUser = await getCurrentUser(request)
    const meta = await readUploadMeta()
    const visible = await filterBlockedPosts(meta, currentUser)
    let posts = await refreshPostAvatars(visible)
    // Anota isFollowing por autor (igual que /feed) para que "Following"
    // persista: /uploads es la fuente que el feed carga primero.
    if (currentUser) {
      try {
        const followingSet = new Set(await getFollowingUsernames(currentUser.id))
        const annotate = (a) => (a && a.username ? { ...a, isFollowing: followingSet.has(a.username) } : a)
        posts = posts.map((p) => ({
          ...p,
          author: annotate(p.author),
          sideA: p.sideA ? { ...p.sideA, author: annotate(p.sideA.author) } : p.sideA,
          sideB: p.sideB ? { ...p.sideB, author: annotate(p.sideB.author) } : p.sideB,
        }))
      } catch { /* ignore */ }
    }
    return NextResponse.json({ posts })
  }

  // Lista de retos COMPLETADOS (retos aceptados -> publicados como versus).
  // Devuelve los posts reales (mismo shape que el feed) para renderizarlos con
  // el mismo diseño (CarouselSlide/DuetSlide). Se derivan de los uploads con
  // isChallenge=true; sus votos van en vivo dentro de cada post.
  // FILTRADO POR USUARIO: solo se devuelven los retos en los que el usuario
  // actual participa (es retador sideA o retado sideB). Los invitados (sin
  // sesión) no tienen retos completados -> lista vacía.
  if (path === '/challenges/completed') {
    const currentUser = await getCurrentUser(request)
    const meta = await readUploadMeta()
    const challengePosts = meta.filter((p) => p.isChallenge && (p.type === 'versus' || p.type === 'duet'))
    if (!currentUser) {
      return NextResponse.json({ posts: [] })
    }
    const uname = currentUser.username
    const posts = challengePosts.filter((p) => {
      const a = p.sideA?.author?.username || p.author?.username
      const b = p.sideB?.author?.username
      return a === uname || b === uname
    })
    // Refrescar avatares de los autores con los datos ACTUALES (el post guarda
    // un snapshot del avatar que queda obsoleto si el usuario cambia su foto).
    const unames = []
    for (const p of posts) {
      if (p.author?.username) unames.push(p.author.username)
      if (p.sideA?.author?.username) unames.push(p.sideA.author.username)
      if (p.sideB?.author?.username) unames.push(p.sideB.author.username)
    }
    const freshC = await getCurrentUsersByUsernames(unames)
    const refresh = (a) => {
      if (!a || !a.username) return a
      const f = freshC[a.username]
      if (!f) return a
      return { ...a, avatarUrl: f.avatarUrl || a.avatarUrl, name: f.name || a.name, verified: f.verified }
    }
    const enrichedPosts = posts.map((p) => ({
      ...p,
      author: refresh(p.author),
      sideA: p.sideA ? { ...p.sideA, author: refresh(p.sideA.author) } : p.sideA,
      sideB: p.sideB ? { ...p.sideB, author: refresh(p.sideB.author) } : p.sideB,
    }))
    return NextResponse.json({ posts: enrichedPosts })
  }

  // Lista de retos (solicitudes de enfrentamiento) pendientes DEL USUARIO ACTUAL.
  // Por defecto devuelve los retos DIRIGIDOS a mí (role=to) -> los que puedo
  // aceptar/rechazar (bandeja, retos activos, badge). role=from = los que yo
  // envié; role=all = todos en los que participo. Invitados -> lista vacía.
  if (path === '/challenges') {
    const currentUser = await getCurrentUser(request)
    const list = await readChallenges()
    if (!currentUser) {
      return NextResponse.json({ challenges: [] })
    }
    const uname = currentUser.username
    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role') || 'to'
    const filtered = list.filter((c) => {
      const isTo = c.to?.username === uname
      const isFrom = c.from?.username === uname
      if (role === 'from') return isFrom
      if (role === 'all') return isTo || isFrom
      return isTo
    })
    // Refrescar avatares (y nombre/verificado) con los datos ACTUALES del
    // usuario: el reto guarda un snapshot del avatar al crearse, que queda
    // obsoleto cuando el participante cambia su foto de perfil.
    const usernames = []
    for (const c of filtered) {
      if (c.from?.username) usernames.push(c.from.username)
      if (c.to?.username) usernames.push(c.to.username)
    }
    const fresh = await getCurrentUsersByUsernames(usernames)
    const refreshAuthor = (a) => {
      if (!a || !a.username) return a
      const f = fresh[a.username]
      if (!f) return a
      return { ...a, avatarUrl: f.avatarUrl || a.avatarUrl, name: f.name || a.name, verified: f.verified }
    }
    const enriched = filtered.map((c) => ({
      ...c,
      from: refreshAuthor(c.from),
      to: refreshAuthor(c.to),
      targetAuthor: refreshAuthor(c.targetAuthor),
    }))
    return NextResponse.json({ challenges: enriched })
  }

  // Catálogo de vídeos disponibles para emparejar en un 1vs1.
  // Mezcla los vídeos del feed + uploads del usuario (versus).
  if (path === '/feed-options') {
    const uploads = await readUploadMeta()
    // No anidamos duets como opción de emparejamiento.
    const userOptions = await refreshPostAvatars(uploads
      .filter((p) => p.type !== 'duet')
      .map((p) => ({
        id: p.id,
        videoUrl: p.videoUrl,
        author: p.author,
        description: p.description,
        music: p.music,
        source: 'upload',
      })))
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

  // Lista de USUARIOS REGISTRADOS (reales) para elegir a quién retar.
  // Excluye al usuario actual (no puedes retarte a ti mismo). Ya NO devuelve
  // los autores demo/mock derivados de los vídeos.
  if (path === '/users') {
    try {
      const currentUser = await getCurrentUser(request)
      const { searchParams } = new URL(request.url)
      const q = searchParams.get('q')
      // Con búsqueda (?q=): coincidencias por username/nombre, incluyendo al
      // propio usuario (puedes encontrarte a ti mismo). Sin búsqueda: lista
      // completa excluyendo al usuario actual (uso original: elegir a quién retar).
      const users = q && q.trim()
        ? await getAllUsers({ search: q, limit: 30 })
        : await getAllUsers({ excludeUsername: currentUser?.username || null })
      return NextResponse.json({ users })
    } catch (err) {
      console.error('[users] error:', err)
      return NextResponse.json({ users: [] })
    }
  }

  // Sugerencias de usuarios ("personas que quizá conozcas / amigos sugeridos").
  // DEBE ir ANTES del handler genérico /users/:username (si no, 'suggested' se
  // trataría como un username de perfil).
  if (segs[0] === 'users' && segs[1] === 'suggested') {
    try {
      const currentUser = await getCurrentUser(request)
      const users = await getSuggestedUsers(currentUser, { limit: 40 })
      return NextResponse.json({ users })
    } catch (err) {
      console.error('[suggested] error:', err)
      return NextResponse.json({ users: [] })
    }
  }

  // Lista de followers de un usuario. GET /api/users/:username/followers
  if (segs[0] === 'users' && segs[1] && segs[2] === 'followers') {
    const username = decodeURIComponent(segs[1])
    try {
      const currentUser = await getCurrentUser(request)
      const list = await getFollowersByUsername(username, currentUser?.id || null)
      return NextResponse.json({ users: list })
    } catch (err) {
      console.error('[followers] error:', err)
      return NextResponse.json({ users: [] })
    }
  }

  // Lista de seguidos de un usuario. GET /api/users/:username/following
  if (segs[0] === 'users' && segs[1] && segs[2] === 'following') {
    const username = decodeURIComponent(segs[1])
    try {
      const currentUser = await getCurrentUser(request)
      const list = await getFollowingByUsername(username, currentUser?.id || null)
      return NextResponse.json({ users: list })
    } catch (err) {
      console.error('[following] error:', err)
      return NextResponse.json({ users: [] })
    }
  }

  // Perfil PÚBLICO de un usuario (propio o ajeno): info + sus publicaciones.
  // GET /api/users/:username
  if (segs[0] === 'users' && segs[1]) {
    const username = decodeURIComponent(segs[1])

    // 1) Info del usuario: primero usuarios registrados (DB), luego autores demo.
    let info = null
    try {
      const dbUser = await getUserByUsername(username)
      if (dbUser) {
        info = {
          username: dbUser.username,
          name: dbUser.name || dbUser.username,
          avatarUrl: dbUser.avatarUrl || '',
          verified: dbUser.verified || false,
          followers: dbUser.followers || 0,
          following: dbUser.following || 0,
          bio: dbUser.bio || '',
        }
      }
    } catch { /* ignore DB errors */ }
    if (!info) {
      const vd = VIDEOS.find((x) => x.author?.username === username)
      if (vd) {
        info = { ...vd.author, verified: false, followers: 0, following: 0, bio: '' }
      }
    }
    if (!info) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    }

    // MODERACIÓN: si el dueño del perfil ha bloqueado al usuario actual, este no
    // puede ver su perfil (los autores demo no tienen documento -> no aplica).
    try {
      const owner = await getUserByUsername(username)
      const viewer = await getCurrentUser(request)
      if (owner && viewer && (await hasBlocked(owner.id, viewer.id))) {
        return NextResponse.json({ error: 'blocked', message: 'No puedes ver este perfil' }, { status: 403 })
      }
    } catch { /* ignore */ }

    // Followers reales (persistentes) derivados de la colección de follows +
    // ¿lo sigo yo? (según la sesión actual, si la hay).
    try {
      const currentUser = await getCurrentUser(request)
      info.followers = await getFollowersCountByUsername(username)
      info.following = await getFollowingCountByUsername(username)
      info.isFollowing = currentUser ? await isFollowingByUsername(currentUser.id, username) : false
    } catch {
      info.isFollowing = false
    }

    // 2) Publicaciones del usuario: SOLO sus uploads reales (se eliminaron los
    // posts demo/mock que antes se inyectaban en el perfil).
    const uploads = await readUploadMeta()
    const posts = uploads.filter((p) => {
      const a = p.author || p.sideA?.author
      return a && a.username === username
    })

    return NextResponse.json({ user: info, posts: await refreshPostAvatars(posts) })
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
    // canDelete: el propio autor del comentario, o el dueño de la publicación
    // (moderación estilo Instagram/TikTok sobre su propio contenido).
    const postOwnerId = currentUser ? await getPostAuthorId(postId) : null
    const withPerms = comments.map((c) => ({
      ...c,
      canDelete: Boolean(currentUser) && (c.isOwn || (Boolean(postOwnerId) && postOwnerId === currentUser.id)),
    }))
    return NextResponse.json({ comments: withPerms })
  }

  // GET /api/saves - Obtener posts guardados del usuario (objetos completos)
  if (path === '/saves') {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    
    const saves = await getSavesByUserId(currentUser.id) // ids (más reciente primero)
    // Resolver cada id a su post completo: uploads (_meta.json) + posts demo.
    const meta = await readUploadMeta()
    const store = await readVotesStore()
    const demo = makePosts(0, 40).map((p) => ({ ...p, votes: store[p.id] || seedVotes(p.id) }))
    const byId = new Map()
    for (const p of meta) byId.set(p.id, p)
    for (const p of demo) if (!byId.has(p.id)) byId.set(p.id, p)
    const posts = saves.map((id) => byId.get(id)).filter(Boolean)
    return NextResponse.json({ saves, posts: await refreshPostAvatars(posts) })
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
    // Refrescar el avatar/nombre de quien generó la notificación con los datos
    // ACTUALES (la notificación guarda un snapshot al crearse).
    const unames = notifications.map((n) => n.user?.username).filter(Boolean)
    const fresh = await getCurrentUsersByUsernames(unames)
    const enriched = notifications.map((n) => {
      const f = n.user?.username ? fresh[n.user.username] : null
      if (!f) return n
      return { ...n, user: { ...n.user, avatarUrl: f.avatarUrl || n.user.avatarUrl, name: f.name || n.user.name } }
    })
    return NextResponse.json({ notifications: enriched })
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

  // Admin: lista de reportes pendientes. GET /api/admin/reports (solo admin).
  if (path === '/admin/reports') {
    const currentUser = await getCurrentUser(request)
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'forbidden', message: 'Solo administradores' }, { status: 403 })
    }
    const reports = await getPendingReports()
    return NextResponse.json({ reports })
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

  if (path === '/track') {
    return handleTrack(request)
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

  // POST /api/profile - Actualizar perfil (nombre, bio, avatar)
  if (path === '/profile') {
    return handleUpdateProfile(request)
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

  // Seguir / dejar de seguir a un usuario (persistente). POST /api/users/:username/follow
  if (segs[0] === 'users' && segs[2] === 'follow') {
    return handleFollow(segs[1], request)
  }

  // ── MODERACIÓN ──────────────────────────────────────────────────────────
  // Crear un reporte (usuario o post).
  if (path === '/reports') {
    return handleCreateReport(request)
  }
  // Bloquear a un usuario.
  if (path === '/users/block') {
    return handleBlockUser(request)
  }
  // Admin: revisar un reporte (opcionalmente suspende). POST /api/admin/reports/:id/review
  if (segs[0] === 'admin' && segs[1] === 'reports' && segs[2] && segs[3] === 'review') {
    return handleReviewReport(segs[2], request)
  }
  // Admin: descartar un reporte. POST /api/admin/reports/:id/dismiss
  if (segs[0] === 'admin' && segs[1] === 'reports' && segs[2] && segs[3] === 'dismiss') {
    return handleDismissReport(segs[2], request)
  }

  return NextResponse.json({ ok: true })
}

// ── HANDLERS DE MODERACIÓN ───────────────────────────────────────────────────

// POST /api/reports  body: { targetType: 'user'|'post', targetId, reason }
async function handleCreateReport(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const { targetType, targetId, reason } = body || {}
    if (!REPORT_REASONS.includes(reason)) {
      return NextResponse.json({ error: 'invalid_reason', reasons: REPORT_REASONS }, { status: 400 })
    }
    if ((targetType !== 'user' && targetType !== 'post') || !targetId) {
      return NextResponse.json({ error: 'invalid_target' }, { status: 400 })
    }
    const report = await createReport({ reporterId: currentUser.id, targetType, targetId, reason })
    return NextResponse.json({ ok: true, reportId: report.id })
  } catch (err) {
    console.error('create report error', err)
    return NextResponse.json({ error: 'report_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/users/block  body: { username } | { userId }
async function handleBlockUser(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    let blockedId = body?.userId || null
    if (!blockedId && body?.username) {
      const u = await getUserByUsername(decodeURIComponent(body.username))
      blockedId = u?.id || null
    }
    if (!blockedId) {
      return NextResponse.json({ error: 'target_not_found', message: 'Usuario a bloquear no encontrado' }, { status: 404 })
    }
    if (blockedId === currentUser.id) {
      return NextResponse.json({ error: 'cannot_block_yourself' }, { status: 400 })
    }
    const result = await blockUser(currentUser.id, blockedId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('block user error', err)
    if (err.message === 'cannot_block_yourself') {
      return NextResponse.json({ error: 'cannot_block_yourself' }, { status: 400 })
    }
    return NextResponse.json({ error: 'block_failed' }, { status: 500 })
  }
}

// POST /api/admin/reports/:id/review  body: { suspend?: boolean }
async function handleReviewReport(reportId, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'forbidden', message: 'Solo administradores' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const suspend = !!body?.suspend
    const report = await getReportById(reportId)
    if (!report) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    let suspendedUserId = null
    if (suspend) {
      suspendedUserId = await resolveReportedUserId(report)
      if (suspendedUserId) await suspendUser(suspendedUserId)
    }
    await setReportStatus(reportId, 'reviewed')
    return NextResponse.json({ ok: true, suspended: suspend ? !!suspendedUserId : false, suspendedUserId })
  } catch (err) {
    console.error('review report error', err)
    return NextResponse.json({ error: 'review_failed' }, { status: 500 })
  }
}

// POST /api/admin/reports/:id/dismiss
async function handleDismissReport(reportId, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!isAdmin(currentUser)) {
      return NextResponse.json({ error: 'forbidden', message: 'Solo administradores' }, { status: 403 })
    }
    const ok = await setReportStatus(reportId, 'dismissed')
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('dismiss report error', err)
    return NextResponse.json({ error: 'dismiss_failed' }, { status: 500 })
  }
}

async function handleFollow(username, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const targetUsername = decodeURIComponent(username || '')
    if (!targetUsername) {
      return NextResponse.json({ error: 'no_target' }, { status: 400 })
    }
    if (targetUsername === currentUser.username) {
      return NextResponse.json({ error: 'cannot_follow_yourself' }, { status: 400 })
    }
    const result = await toggleFollowByUsername(currentUser.id, targetUsername)
    // La notificación de 'follow' la crea toggleFollowByUsername (db.js) al
    // empezar a seguir; no la dupliquemos aquí.
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[follow] error:', err)
    return NextResponse.json({ error: 'follow_failed' }, { status: 500 })
  }
}

async function handleVersusUpload(request) {
  try {
    // Obtener usuario autenticado (opcional por ahora para backward compatibility)
    const currentUser = await getCurrentUser(request)
    // Publicar requiere sesión: los invitados NO pueden crear publicaciones.
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to publish' }, { status: 401 })
    }

    const formData = await request.formData()
    const fileA = formData.get('fileA')
    const fileB = formData.get('fileB')
    const description = (formData.get('description') || '').toString().trim()
    const captionA = (formData.get('captionA') || '').toString()
    const captionB = (formData.get('captionB') || '').toString()

    if (!fileA || typeof fileA === 'string' || !fileB || typeof fileB === 'string') {
      return NextResponse.json({ error: 'need_two_files' }, { status: 400 })
    }

    // No mezclar: ambos lados deben ser del mismo tipo (2 imágenes o 2 vídeos).
    const kindA = mediaKind(fileA)
    const kindB = mediaKind(fileB)
    if (kindA !== kindB) {
      return NextResponse.json({ error: 'mixed_media_not_allowed', message: 'Both sides must be the same type (2 videos or 2 photos)' }, { status: 400 })
    }

    await ensureUploadDir()
    const a = await saveUploadedMedia(fileA)
    const b = await saveUploadedMedia(fileB)
    const urlA = a.url
    const urlB = b.url
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
      name: 'Anonymous User',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
      verified: false,
    }

    const music = readMusicFields(formData)
    const post = {
      id: `versus_up_${id}`,
      type: 'versus',
      layout: 'carousel',
      mediaType: a.mediaType, // 'video' | 'image' (ambos lados iguales)
      sideA: { mediaType: a.mediaType, videoUrl: a.mediaType === 'video' ? urlA : '', imageUrl: a.mediaType === 'image' ? urlA : '', posterUrl: a.posterUrl, author: realAuthor, description: captionA || description, music: 'Option A' },
      sideB: { mediaType: b.mediaType, videoUrl: b.mediaType === 'video' ? urlB : '', imageUrl: b.mediaType === 'image' ? urlB : '', posterUrl: b.posterUrl, author: realAuthor, description: captionB || description, music: 'Option B' },
      author: realAuthor,
      description,
      music: music.musicTitle ? `${music.musicTitle} · ${music.musicArtist}` : 'Tu versus original',
      ...music,
      videoUrl: a.mediaType === 'video' ? urlA : '',
      posterUrl: a.posterUrl,
      thumbnailUrl: a.posterUrl,
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
    }
    await insertPost(post)
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
    // Publicar requiere sesión: los invitados NO pueden crear publicaciones.
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to publish' }, { status: 401 })
    }

    const formData = await request.formData()
    const fileA = formData.get('fileA')
    const fileB = formData.get('fileB')
    const description = (formData.get('description') || '').toString().trim()
    const layoutRaw = (formData.get('layout') || 'horizontal').toString()
    const layout = layoutRaw === 'vertical' ? 'vertical' : 'horizontal'

    if (!fileA || typeof fileA === 'string' || !fileB || typeof fileB === 'string') {
      return NextResponse.json({ error: 'need_two_files' }, { status: 400 })
    }

    // No mezclar: ambos lados deben ser del mismo tipo (2 imágenes o 2 vídeos).
    const kindA = mediaKind(fileA)
    const kindB = mediaKind(fileB)
    if (kindA !== kindB) {
      return NextResponse.json({ error: 'mixed_media_not_allowed', message: 'Both sides must be the same type (2 videos or 2 photos)' }, { status: 400 })
    }

    const a = await saveUploadedMedia(fileA)
    const b = await saveUploadedMedia(fileB)
    const urlA = a.url
    const urlB = b.url
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
      name: 'Anonymous User',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
      verified: false,
    }

    const music = readMusicFields(formData)
    const post = {
      id: `duet_${id}`,
      type: 'duet',
      layout, // 'horizontal' | 'vertical'
      mediaType: a.mediaType, // 'video' | 'image'
      // Ambos lados son contenido propio del usuario.
      sideA: { mediaType: a.mediaType, videoUrl: a.mediaType === 'video' ? urlA : '', imageUrl: a.mediaType === 'image' ? urlA : '', posterUrl: a.posterUrl, author: realAuthor, description, music: 'Option A' },
      sideB: { mediaType: b.mediaType, videoUrl: b.mediaType === 'video' ? urlB : '', imageUrl: b.mediaType === 'image' ? urlB : '', posterUrl: b.posterUrl, author: realAuthor, description, music: 'Option B' },
      author: realAuthor,
      description,
      music: music.musicTitle ? `${music.musicTitle} · ${music.musicArtist}` : 'Tu 1vs1 original',
      ...music,
      videoUrl: a.mediaType === 'video' ? urlA : '',
      posterUrl: a.posterUrl,
      thumbnailUrl: a.posterUrl,
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
    }
    await insertPost(post)
    // Renditions ABR DESACTIVADAS (ver nota en el flujo versus): servimos el
    // original con faststart -> mejor calidad y fluidez.
    // processPostRenditions(post.id, urlA, urlB)
    return NextResponse.json({ ok: true, post })
  } catch (err) {
    console.error('duet upload error', err)
    return NextResponse.json({ error: 'duet_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/track  body: { id, kind:'watch', watchMs, durationMs, completed }
// Señal de watch-time / completion para el TWYK Engine. Reconstruye el post
// (upload o demo) para poder asociar la señal a sus categorías.
async function handleTrack(request) {
  try {
    const body = await request.json().catch(() => null)
    const id = body?.id
    if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    const kind = body?.kind || 'watch'
    if (kind !== 'watch') return NextResponse.json({ ok: true })

    const currentUser = await getCurrentUser(request)
    const gid = request.cookies.get('twyk_gid')?.value
    const viewerKey = currentUser?.id ? `u:${currentUser.id}` : (gid ? `g:${gid}` : null)

    // Reconstruye el post para asociar la visualización a sus categorías.
    let post = { id }
    try {
      if (String(id).startsWith('versus_')) {
        const n = parseInt(String(id).split('_')[1], 10)
        if (!isNaN(n)) post = makePosts(n, 1)[0]
      } else {
        const meta = await readUploadMeta()
        const found = (meta || []).find((p) => p.id === id)
        if (found) post = found
      }
    } catch { /* usa { id } */ }

    const watchMs = Math.max(0, Number(body?.watchMs) || 0)
    const durationMs = Math.max(0, Number(body?.durationMs) || 0)
    const completed = !!body?.completed

    recordWatch(post, { watchMs, durationMs, completed }, viewerKey, { hour: new Date().getHours() }).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'track_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/vote   body: { id, side: 'a'|'b', previousSide?: 'a'|'b' }
// Increments the vote counter for that side of a duet/versus post.
// Uploads persist in MongoDB (`posts`); built-in feed posts persist in `votes`.
//
// CAMBIO DE VOTO (opción A <-> B): si el cliente envía `previousSide` (el lado
// que ese mismo usuario había votado antes en ESTA publicación, leído de
// localStorage) y es distinto de `side`, se trata como un CAMBIO de opción:
// se resta 1 del lado anterior y se suma 1 al nuevo dentro de la MISMA
// operación atómica (incrementPostVote / incrementBuiltinVote), de modo que
// el total de votos de la publicación no varía. Si `previousSide` coincide
// con `side` (re-tocar la opción ya votada), no se aplica ningún cambio.
async function handleVote(request) {
  try {
    const body = await request.json().catch(() => null)
    const id = body?.id
    const side = body?.side
    const rawPrev = body?.previousSide
    const previousSide = rawPrev === 'a' || rawPrev === 'b' ? rawPrev : null
    if (!id || (side !== 'a' && side !== 'b')) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    const isSwitch = !!previousSide && previousSide !== side
    const isNoOp = !!previousSide && previousSide === side

    const currentUser = await getCurrentUser(request)
    const gid = request.cookies.get('twyk_gid')?.value
    const viewerKey = currentUser?.id ? `u:${currentUser.id}` : (gid ? `g:${gid}` : null)
    // Contexto para anti-manipulación: antigüedad de cuenta + tipo de viewer.
    const voteCtx = {
      hour: new Date().getHours(),
      isGuest: !currentUser,
      accountAgeMin: currentUser?.createdAt ? (Date.now() - new Date(currentUser.createdAt).getTime()) / 60000 : null,
    }
    // 1) Publicaciones subidas (versus/1vs1/reto) -> incremento/cambio ATÓMICO
    //    en MongoDB (colección `posts`). Devuelve el post actualizado (o null
    //    si no existe una publicación versus/duet con ese id).
    const updated = await incrementPostVote(id, side, previousSide)
    if (updated) {
      // Mantener sincronizados los comentarios ya publicados por este mismo
      // usuario en esta publicación: si cambia de opción, sus comentarios
      // anteriores deben mostrar el nuevo lado votado (punto de color).
      if (currentUser?.id && !isNoOp) {
        updateCommentsVotedSideForUser(id, currentUser.id, side).catch(() => {})
      }
      // TWYK Engine: aprende del voto (velocity trending + BPR pairwise). Se
      // omite en un re-toque de la misma opción ya votada (no hay voto nuevo).
      if (!isNoOp) recordVote(updated, side, viewerKey, voteCtx).catch(() => {})
      // Notificar al autor del lado votado (en retos sideA/sideB pueden ser
      // usuarios distintos; en versus/1vs1 normales ambos lados son el mismo
      // autor). En un CAMBIO de opción, actualizamos la notificación existente
      // para que refleje el nuevo side (color correcto) o migramos al nuevo
      // destinatario si en un reto los autores difieren.
      if (isSwitch) {
        try {
          const prevAuthor = previousSide === 'a' ? updated.sideA?.author : updated.sideB?.author
          const newAuthor = side === 'a' ? updated.sideA?.author : updated.sideB?.author
          const previousRecipientId = prevAuthor?.id || updated.author?.id || null
          const newRecipientId = newAuthor?.id || updated.author?.id || null
          await updateVoteNotificationOnSwitch({
            postId: updated.id,
            fromUserId: currentUser?.id || null,
            previousSide,
            newSide: side,
            previousRecipientId,
            newRecipientId,
          })
        } catch (notifErr) {
          console.error('vote switch notification error', notifErr)
        }
      } else if (!isNoOp) {
        try {
          const sideAuthor = side === 'a' ? updated.sideA?.author : updated.sideB?.author
          const recipientId = sideAuthor?.id || updated.author?.id
          if (
            recipientId &&
            recipientId !== 'anonymous' &&
            recipientId !== currentUser?.id
          ) {
            await createNotification({
              userId: recipientId,
              type: 'vote',
              fromUserId: currentUser?.id || null,
              postId: updated.id,
              side,
            })
          }
        } catch (notifErr) {
          console.error('vote notification error', notifErr)
        }
      }

      return NextResponse.json({ ok: true, votes: updated.votes })
    }
    // 2) Posts del feed integrado (demo) -> incremento/cambio ATÓMICO en
    //    `votes`, sembrando con seedVotes la primera vez que se vota.
    const votes = await incrementBuiltinVote(id, side, seedVotes(id), previousSide)
    // Igual que arriba: sincroniza el color del voto en los comentarios
    // previos de este usuario en este post demo si cambió de opción.
    if (currentUser?.id && !isNoOp) {
      updateCommentsVotedSideForUser(id, currentUser.id, side).catch(() => {})
    }
    // TWYK Engine: reconstruye el post demo (determinista por id) y aprende
    // (se omite en un re-toque de la misma opción).
    if (!isNoOp) {
      try {
        const n = parseInt(String(id).split('_')[1], 10)
        if (!isNaN(n)) {
          const demoPost = makePosts(n, 1)[0]
          if (demoPost) recordVote(demoPost, side, viewerKey, voteCtx).catch(() => {})
        }
      } catch { /* ignore */ }
    }
    return NextResponse.json({ ok: true, votes })
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
  // GUARDA DE SEGURIDAD: si el buffer llega vacío/truncado (subida cortada,
  // límite de tamaño, red inestable), NO crear un archivo/post fantasma en
  // silencio -> lanzar para que el endpoint devuelva error y el usuario pueda
  // reintentar, en vez de quedar con un post roto sin vídeo real.
  if (!bytes || bytes.length === 0) {
    throw new Error('empty_upload')
  }
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

// Guarda una imagen subida (avatar) en /public/uploads y devuelve su URL.
async function saveUploadedImage(file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = Buffer.from(arrayBuffer)
  if (!bytes || bytes.length === 0) {
    throw new Error('empty_upload')
  }
  const id = crypto.randomBytes(8).toString('hex')
  const name = file.name || 'image.jpg'
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'jpg'
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  const filename = `avatar_${id}.${safeExt}`
  await ensureUploadDir()
  const filePath = nodePath.join(UPLOAD_DIR, filename)
  await fs.writeFile(filePath, bytes)
  return `/uploads/${filename}`
}

// Detecta si el archivo subido es imagen o vídeo (por mime; fallback extensión).
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif']
function mediaKind(file) {
  const t = (file?.type || '').toLowerCase()
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  const name = (file?.name || '').toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() : ''
  if (IMAGE_EXTS.includes(ext)) return 'image'
  return 'video'
}

// Guarda media de publicación (imagen O vídeo) y devuelve { url, mediaType, posterUrl }.
// Para imágenes el "póster" es la propia imagen (se muestra a pantalla completa,
// como hace TikTok al convertir la foto en diapositiva). Para vídeos reutiliza
// saveUploadedVideo (faststart + póster del 1er fotograma).
async function saveUploadedMedia(file) {
  if (mediaKind(file) === 'image') {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = Buffer.from(arrayBuffer)
    const id = crypto.randomBytes(8).toString('hex')
    const name = file.name || 'image.jpg'
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : 'jpg'
    const safeExt = IMAGE_EXTS.includes(ext) ? ext : 'jpg'
    const filename = `media_${id}.${safeExt}`
    await ensureUploadDir()
    await fs.writeFile(nodePath.join(UPLOAD_DIR, filename), bytes)
    const url = `/uploads/${filename}`
    return { url, mediaType: 'image', posterUrl: url }
  }
  const url = await saveUploadedVideo(file)
  return { url, mediaType: 'video', posterUrl: posterFor(url) }
}

// Lee los campos de música (iTunes) del FormData de subida. Devuelve {} si no
// se seleccionó música. Se guardan en el post para mostrar la etiqueta de
// sonido y reproducir el preview de 30s en el feed.
function readMusicFields(formData) {
  const previewUrl = (formData.get('musicPreviewUrl') || '').toString()
  if (!previewUrl) return {}
  return {
    musicTitle: (formData.get('musicTitle') || '').toString(),
    musicArtist: (formData.get('musicArtist') || '').toString(),
    musicArtwork: (formData.get('musicArtwork') || '').toString(),
    musicPreviewUrl: previewUrl,
    musicTrackId: (formData.get('musicTrackId') || '').toString(),
  }
}

// POST /api/profile
//   FormData: name?, bio?, avatar? (archivo de imagen)
//   Actualiza el perfil del usuario autenticado.
async function handleUpdateProfile(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in' }, { status: 401 })
    }
    const formData = await request.formData()
    const nameRaw = formData.get('name')
    const bioRaw = formData.get('bio')
    const avatarFile = formData.get('avatar')

    const updates = {}
    if (typeof nameRaw === 'string') updates.name = nameRaw
    if (typeof bioRaw === 'string') updates.bio = bioRaw

    // Imagen opcional de avatar.
    if (avatarFile && typeof avatarFile !== 'string') {
      const type = avatarFile.type || ''
      if (!type.startsWith('image/')) {
        return NextResponse.json({ error: 'invalid_image' }, { status: 400 })
      }
      // Límite ~6MB para avatares.
      if (avatarFile.size && avatarFile.size > 6 * 1024 * 1024) {
        return NextResponse.json({ error: 'image_too_large' }, { status: 400 })
      }
      updates.avatarUrl = await saveUploadedImage(avatarFile)
    }

    const updated = await updateUserProfile(currentUser.id, updates)
    if (!updated) {
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, user: updated })
  } catch (err) {
    console.error('[profile] update error:', err)
    return NextResponse.json({ error: 'update_failed', detail: String(err?.message || err) }, { status: 500 })
  }
}

// POST /api/challenges
//   FormData: file (vídeo del retador), targetVideoUrl, targetAuthor (JSON),
//             targetDescription, targetMusic, message
async function handleCreateChallenge(request) {
  try {
    // Obtener usuario autenticado (opcional por ahora para backward compatibility)
    const currentUser = await getCurrentUser(request)
    // Retar requiere sesión: los invitados NO pueden crear retos.
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to challenge' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const targetVideoUrl = (formData.get('targetVideoUrl') || '').toString()
    const targetImageUrl = (formData.get('targetImageUrl') || '').toString()
    const targetPosterUrl = (formData.get('targetPosterUrl') || '').toString()
    let targetMediaType = (formData.get('targetMediaType') || '').toString()
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
    // No puedes retarte a ti mismo.
    if (targetAuthor.username && targetAuthor.username === currentUser.username) {
      return NextResponse.json({ error: 'cannot_challenge_yourself', message: 'No puedes retarte a ti mismo' }, { status: 400 })
    }

    // Media del retador (lado A): imagen O vídeo (auto-detectado).
    const myMedia = await saveUploadedMedia(file)
    // Tipo del contenido retado (lado B): si no llega, se infiere de las URLs.
    if (!targetMediaType) targetMediaType = targetImageUrl ? 'image' : (targetVideoUrl ? 'video' : '')
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
      name: 'Anonymous User',
      avatarUrl: 'https://i.pravatar.cc/120?img=68',
      verified: false,
    }
    
    const challenge = {
      id: `challenge_${cid}`,
      status: 'pending',
      from: realAuthor,
      to: targetAuthor,
      // Lado A = media del retador (imagen o vídeo)
      challengerMediaType: myMedia.mediaType,
      challengerVideoUrl: myMedia.mediaType === 'video' ? myMedia.url : null,
      challengerImageUrl: myMedia.mediaType === 'image' ? myMedia.url : null,
      challengerPosterUrl: myMedia.posterUrl,
      // Lado B = contenido retado (o lo sube el retado al aceptar)
      targetMediaType: targetMediaType || null,
      targetVideoUrl: targetMediaType === 'image' ? null : (targetVideoUrl || null),
      targetImageUrl: targetMediaType === 'image' ? (targetImageUrl || targetVideoUrl || null) : (targetImageUrl || null),
      targetPosterUrl: targetPosterUrl || null,
      targetAuthor,
      targetDescription,
      targetMusic,
      message,
      ...readMusicFields(formData),
      createdAt: new Date().toISOString(),
    }
    await insertChallenge(challenge)

    // Notificar al usuario retado.
    try {
      const recipientId = targetAuthor?.id
      if (recipientId && recipientId !== 'anonymous' && recipientId !== currentUser.id) {
        await createNotification({
          userId: recipientId,
          type: 'challenge',
          fromUserId: currentUser.id,
          text: message || null,
        })
      }
    } catch (notifErr) {
      console.error('challenge notification error', notifErr)
    }

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

    // Media de respuesta del retado (lado B): la subida al aceptar (imagen o
    // vídeo, auto-detectada), o la del contenido retado si ya se conocía.
    let respMediaType = c.targetMediaType || (c.targetVideoUrl ? 'video' : (c.targetImageUrl ? 'image' : null))
    let respVideoUrl = c.targetVideoUrl || null
    let respImageUrl = c.targetImageUrl || null
    let respPosterUrl = c.targetPosterUrl || (respVideoUrl ? posterFor(respVideoUrl) : respImageUrl)
    // Reto "mención" (sin media objetivo previa): el retado debe subir un
    // archivo, y su TIPO debe coincidir con el del retador (vídeo<->vídeo,
    // foto<->foto). Se valida aquí también por defensa (además del frontend).
    const wasMention = !c.targetVideoUrl && !c.targetImageUrl
    const requiredMediaType = c.challengerMediaType || (c.challengerImageUrl ? 'image' : 'video')
    try {
      const formData = await request.formData()
      const file = formData.get('file')
      if (file && typeof file !== 'string') {
        const m = await saveUploadedMedia(file)
        if (wasMention && m.mediaType !== requiredMediaType) {
          return NextResponse.json({ error: 'media_type_mismatch', detail: `This challenge requires a ${requiredMediaType}` }, { status: 400 })
        }
        respMediaType = m.mediaType
        respVideoUrl = m.mediaType === 'video' ? m.url : null
        respImageUrl = m.mediaType === 'image' ? m.url : null
        respPosterUrl = m.posterUrl
      }
    } catch { /* sin cuerpo multipart, se usa el media del contenido retado */ }

    if (!respVideoUrl && !respImageUrl) {
      return NextResponse.json({ error: 'no_response_media' }, { status: 400 })
    }

    // Lado A (retador): tipo guardado o inferido para retos antiguos.
    const aMediaType = c.challengerMediaType || (c.challengerImageUrl ? 'image' : 'video')
    const aVideoUrl = aMediaType === 'video' ? (c.challengerVideoUrl || null) : null
    const aImageUrl = aMediaType === 'image' ? (c.challengerImageUrl || null) : null
    const aPosterUrl = c.challengerPosterUrl || (aVideoUrl ? posterFor(aVideoUrl) : aImageUrl)

    const id = crypto.randomBytes(8).toString('hex')
    const post = {
      id: `versus_ch_${id}`,
      type: 'versus',
      layout: 'carousel',
      mediaType: aMediaType,
      sideA: { mediaType: aMediaType, videoUrl: aVideoUrl || '', imageUrl: aImageUrl || '', posterUrl: aPosterUrl, author: c.from, description: c.message || '', music: 'Challenge' },
      sideB: { mediaType: respMediaType || 'video', videoUrl: respVideoUrl || '', imageUrl: respImageUrl || '', posterUrl: respPosterUrl, author: c.to, description: c.targetDescription || '', music: c.targetMusic || '' },
      author: c.from,
      description: c.message || '',
      music: c.musicTitle ? `${c.musicTitle} · ${c.musicArtist}` : 'Reto aceptado',
      ...(c.musicPreviewUrl ? { musicTitle: c.musicTitle, musicArtist: c.musicArtist, musicArtwork: c.musicArtwork, musicPreviewUrl: c.musicPreviewUrl, musicTrackId: c.musicTrackId } : {}),
      videoUrl: aVideoUrl || '',
      posterUrl: aPosterUrl,
      thumbnailUrl: aPosterUrl,
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
      isChallenge: true,
    }
    await insertPost(post)
    await deleteChallenge(cid)

    // Notificar al RETADOR (c.from) que su reto fue aceptado. El que acepta es
    // el retado (c.to).
    try {
      const challengerId = c.from?.id
      if (challengerId && challengerId !== 'anonymous') {
        await createNotification({
          userId: challengerId,
          type: 'accepted',
          fromUserId: c.to?.id || null,
          postId: post.id,
        })
      }
    } catch (notifErr) {
      console.error('accept notification error', notifErr)
    }
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
    await deleteChallenge(cid)
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

// Calcula la edad en años a partir de una fecha 'YYYY-MM-DD'. Devuelve null si
// la fecha no es válida o es futura. Se usa para el gating de edad (COPPA).
function computeAge(birthDate) {
  if (!birthDate) return null
  const dob = new Date(birthDate)
  if (isNaN(dob.getTime())) return null
  const now = new Date()
  if (dob > now) return null
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}

// POST /api/auth/register - Registrar nuevo usuario
async function handleRegister(request) {
  try {
    const body = await request.json()
    const { username, email, password, birthDate } = body

    if (!username || !email || !password) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 })
    }

    // GATING DE EDAD (COPPA): la fecha de nacimiento es obligatoria y el usuario
    // debe tener al menos 13 años. Validación en servidor (no solo en cliente).
    if (!birthDate) {
      return NextResponse.json({ error: 'birthdate_required', message: 'Date of birth is required' }, { status: 400 })
    }
    const age = computeAge(birthDate)
    if (age === null) {
      return NextResponse.json({ error: 'invalid_birthdate', message: 'Invalid date of birth' }, { status: 400 })
    }
    if (age < 13) {
      return NextResponse.json({ error: 'underage', message: "Twyk isn't available for users under 13" }, { status: 403 })
    }

    const user = await createUser({ username, email, password, birthDate })
    const session = await createSession(user.id)

    const response = NextResponse.json({ ok: true, user, token: session.token })
    response.cookies.set('session_token', session.token, {
      httpOnly: true,
      // SameSite=None + Secure: imprescindible para que la cookie viaje dentro
      // del iframe del preview (contexto cross-site) y en producción (HTTPS).
      // Con 'lax' el navegador NO enviaba la cookie en el iframe -> /api/auth/me
      // daba 401 y "la sesión se cerraba sola".
      secure: true,
      sameSite: 'none',
      maxAge: 10 * 365 * 24 * 60 * 60, // ~10 años (sesión permanente)
    })

    return response
  } catch (err) {
    console.error('register error', err)
    if (err.message === 'username_taken') {
      return NextResponse.json({ error: 'username_taken', message: 'El nombre de usuario ya existe' }, { status: 400 })
    }
    if (err.message === 'email_taken') {
      return NextResponse.json({ error: 'email_taken', message: 'This email is already registered' }, { status: 400 })
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
      return NextResponse.json({ error: 'invalid_credentials', message: 'Wrong username or password' }, { status: 401 })
    }

    // MODERACIÓN: los usuarios suspendidos no pueden iniciar sesión.
    if (user.suspended) {
      return NextResponse.json({ error: 'account_suspended', message: 'Tu cuenta ha sido suspendida' }, { status: 403 })
    }

    const session = await createSession(user.id)

    const response = NextResponse.json({ ok: true, user, token: session.token })
    response.cookies.set('session_token', session.token, {
      httpOnly: true,
      // SameSite=None + Secure: imprescindible para que la cookie viaje dentro
      // del iframe del preview (contexto cross-site) y en producción (HTTPS).
      // Con 'lax' el navegador NO enviaba la cookie en el iframe -> /api/auth/me
      // daba 401 y "la sesión se cerraba sola".
      secure: true,
      sameSite: 'none',
      maxAge: 10 * 365 * 24 * 60 * 60, // ~10 años (sesión permanente)
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
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in' }, { status: 401 })
    }

    const body = await request.json()
    const { postId, text, votedSide, parentId } = body

    if (!postId || !text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'invalid_data' }, { status: 400 })
    }

    // MODERACIÓN: si el autor del post ha bloqueado al usuario actual, este no
    // puede comentar en sus publicaciones.
    try {
      const meta = await readUploadMeta()
      const target = meta.find((x) => x.id === postId)
      const authorId = target?.author?.id || target?.sideA?.author?.id
      if (authorId && authorId !== currentUser.id && (await hasBlocked(authorId, currentUser.id))) {
        return NextResponse.json({ error: 'blocked', message: 'No puedes comentar en este contenido' }, { status: 403 })
      }
    } catch { /* ignore */ }

    // Si viene parentId, validar que el comentario padre existe y pertenece
    // al MISMO post (evita respuestas "colgadas" de un post distinto).
    let parentComment = null
    let safeParentId = null
    if (parentId && typeof parentId === 'string') {
      try {
        parentComment = await getCommentByIdDB(parentId)
        if (parentComment && parentComment.postId === postId) {
          safeParentId = parentComment.id
        }
      } catch { /* ignore, se trata como comentario normal */ }
    }

    const comment = await createCommentDB({ 
      postId, 
      userId: currentUser.id, 
      text: text.trim(),
      votedSide: votedSide === 'a' || votedSide === 'b' ? votedSide : null,
      parentId: safeParentId,
    })

    if (safeParentId && parentComment) {
      // RESPUESTA a un comentario: notifica al AUTOR del comentario padre
      // (no al dueño del post, salvo que sea la misma persona).
      try {
        const recipientId = parentComment.userId
        if (recipientId && recipientId !== currentUser.id) {
          const t = text.trim()
          await createNotification({
            userId: recipientId,
            type: 'reply',
            fromUserId: currentUser.id,
            postId,
            commentId: comment.id,
            text: t.length > 50 ? t.substring(0, 47) + '...' : t,
          })
        }
      } catch (notifErr) {
        console.error('reply notification error', notifErr)
      }
    } else {
      // createCommentDB solo crea notificación si el post existe en la colección
      // MongoDB POSTS. Las publicaciones subidas viven en _meta.json, así que aquí
      // notificamos al autor del post subido (evita duplicado: son excluyentes).
      try {
        const meta = await readUploadMeta()
        const p = meta.find((x) => x.id === postId)
        if (p) {
          const recipientId = p.author?.id || p.sideA?.author?.id
          if (recipientId && recipientId !== 'anonymous' && recipientId !== currentUser.id) {
            const t = text.trim()
            await createNotification({
              userId: recipientId,
              type: 'comment',
              fromUserId: currentUser.id,
              postId,
              commentId: comment.id,
              text: t.length > 50 ? t.substring(0, 47) + '...' : t,
            })
          }
        }
      } catch (notifErr) {
        console.error('comment notification error', notifErr)
      }
    }

    // Formatear para el frontend
    const formattedComment = {
      id: comment.id,
      postId: comment.postId,
      text: comment.text,
      votedSide: comment.votedSide || null,
      parentId: comment.parentId || null,
      likes: comment.likes,
      userLiked: false,
      isOwn: true,
      canDelete: true, // es tu propio comentario recién creado
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

// DELETE /api/comments/{id} - Eliminar un comentario (su autor, o el dueño de
// la publicación en la que vive).
async function handleDeleteComment(commentId, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    if (!commentId) {
      return NextResponse.json({ error: 'missing_commentId' }, { status: 400 })
    }

    const rawComment = await getCommentByIdDB(commentId)
    if (!rawComment) {
      return NextResponse.json({ error: 'comment_not_found' }, { status: 404 })
    }
    const postOwnerId = await getPostAuthorId(rawComment.postId)

    await deleteCommentDB(commentId, currentUser.id, postOwnerId)
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

// DELETE /api/posts/{id} - Eliminar una publicación propia (solo el dueño).
async function handleDeletePost(postId, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!postId) {
      return NextResponse.json({ error: 'missing_postId' }, { status: 400 })
    }
    const result = await deletePostById(postId, currentUser.id)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return NextResponse.json({ error: 'post_not_found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('delete post error', err)
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  }
}

// Exportar método DELETE
export async function DELETE(request, { params }) {
  const segs = (params?.path) || []
  const path = '/' + segs.join('/')

  // DELETE /api/comments/{id}
  if (segs[0] === 'comments' && segs[1]) {
    return handleDeleteComment(segs[1], request)
  }

  // DELETE /api/posts/{id} - Eliminar una publicación propia.
  if (segs[0] === 'posts' && segs[1]) {
    return handleDeletePost(decodeURIComponent(segs[1]), request)
  }

  // DELETE /api/users/block - Desbloquear a un usuario.
  if (path === '/users/block') {
    return handleUnblockUser(request)
  }

  return NextResponse.json({ error: 'not_found' }, { status: 404 })
}

// DELETE /api/users/block  body: { username } | { userId }
async function handleUnblockUser(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    let blockedId = body?.userId || null
    if (!blockedId && body?.username) {
      const u = await getUserByUsername(decodeURIComponent(body.username))
      blockedId = u?.id || null
    }
    if (!blockedId) {
      return NextResponse.json({ error: 'target_not_found' }, { status: 404 })
    }
    const result = await unblockUser(currentUser.id, blockedId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('unblock user error', err)
    return NextResponse.json({ error: 'unblock_failed' }, { status: 500 })
  }
}
