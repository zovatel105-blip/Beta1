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
  saveUserInterests,
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
  markNotificationsByTypeAsRead,
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
  acceptTerms,
  getCommentsCountByPostIds,
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
import { rankFeed, recordVote, recordImpressions, recordWatch, recordEngagement, recordSocialAffinity, recordNotInterested, getNotInterestedIds, computeMetrics } from '@/lib/recommender'
import { registerDeviceToken, unregisterDeviceToken } from '@/lib/push'
import { LlmChat, UserMessage, ImageContent } from 'emergentintegrations'
import { createVideoEditJob, getVideoEditJob, validateVideoForAiEdit, classifyEditMode, MAX_DURATION_SEC } from '@/lib/aiVideoEditor'

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

// RETOS ABIERTOS ("responder este reto"): construye los ítems sintéticos que
// se inyectan en el feed principal (GET /api/feed) para que CUALQUIERA pueda
// descubrirlos, no solo la persona retada. Un reto abierto (challenge.open ===
// true, challenge.to === null) vive en la colección `challenges` como
// cualquier otro, pero NUNCA se borra al recibir una respuesta (ver
// handleRespondOpenChallenge) — así puede acumular varias respuestas
// independientes, cada una publicada como su propio versus.
async function getOpenChallengeFeedItems(currentUser) {
  try {
    const list = await readChallenges()
    let opens = list.filter((c) => c.open === true)
    if (!opens.length) return []
    if (currentUser) {
      try {
        const blocked = await getMutualBlockedIds(currentUser.id)
        if (blocked.size) opens = opens.filter((c) => !blocked.has(c.from?.id))
      } catch { /* ignore */ }
    }
    if (!opens.length) return []
    // Nº de respuestas ya publicadas por cada reto abierto (prueba social).
    const meta = await readUploadMeta()
    const countByChallenge = {}
    for (const p of meta) {
      if (p.sourceChallengeId) countByChallenge[p.sourceChallengeId] = (countByChallenge[p.sourceChallengeId] || 0) + 1
    }
    // Avatar/nombre ACTUALES del creador del reto (el reto guarda un snapshot).
    const unames = opens.map((c) => c.from?.username).filter(Boolean)
    const fresh = await getCurrentUsersByUsernames(unames)
    return opens.map((c) => {
      const f = c.from?.username ? fresh[c.from.username] : null
      const author = f ? { ...c.from, avatarUrl: f.avatarUrl || c.from.avatarUrl, name: f.name || c.from.name, verified: f.verified } : c.from
      const mediaType = c.challengerMediaType || (c.challengerImageUrl ? 'image' : 'video')
      return {
        id: `open_${c.id}`,
        type: 'challenge_open',
        challengeId: c.id,
        mediaType,
        videoUrl: mediaType === 'video' ? (c.challengerVideoUrl || '') : '',
        imageUrl: mediaType === 'image' ? (c.challengerImageUrl || '') : '',
        posterUrl: c.challengerPosterUrl || '',
        author,
        description: c.message || '',
        music: c.musicTitle ? `${c.musicTitle} · ${c.musicArtist}` : 'Open challenge',
        responsesCount: countByChallenge[c.id] || 0,
        createdAtMs: c.createdAt ? new Date(c.createdAt).getTime() : Date.now(),
      }
    })
  } catch (e) {
    console.warn('open challenges feed injection failed', String(e?.message || e))
    return []
  }
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

// BUG reportado por el usuario ("el contador de comentarios no aparece hasta
// que abro el modal de comentarios, a diferencia de los demás contadores"):
// `stats.comments` de cada post se fija en 0 al crearse y NUNCA se actualiza
// al publicarse comentarios nuevos (el conteo real solo vive en la colección
// `comments`, calculado on-demand en GET /api/comments) — por eso el número
// correcto solo "aparecía" tras abrir el modal (el único momento en que se
// calculaba). FIX: refrescar `stats.comments` con el conteo REAL (una sola
// consulta agregada para todos los posts) en cada endpoint que devuelve
// posts, igual que refreshPostAvatars ya refresca los avatares — así el
// número correcto se ve desde el primer render del feed/perfil, sin
// depender de abrir nada.
async function refreshPostCommentCounts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return posts
  const counts = await getCommentsCountByPostIds(posts.map((p) => p.id))
  return posts.map((p) => ({
    ...p,
    stats: { ...(p.stats || {}), comments: counts[p.id] ?? p.stats?.comments ?? 0 },
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

  // GET /api/ai/edit-video-status?jobId=... - polling del editor de vídeo con IA.
  if (path === '/ai/edit-video-status') {
    return handleAiEditVideoStatus(request)
  }

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

  // Feed "Siguiendo" (nueva página, doble-click en Home del BottomNav):
  // SOLO publicaciones de las cuentas que el usuario sigue, en orden
  // cronológico (sin ranking del recomendador — es un feed explícito, no
  // personalizado). Exige sesión — un invitado recibe 401 y el frontend le
  // pide iniciar sesión en su lugar.
  if (path === '/feed/following') {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const cursor = parseInt(searchParams.get('cursor') || '0', 10)
    const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10), 20)

    const followingUsernames = new Set(await getFollowingUsernames(currentUser.id))
    let candidates = []
    try {
      const meta = await readUploadMeta()
      candidates = (meta || []).filter((p) =>
        (p.type === 'versus' || p.type === 'duet') && followingUsernames.has(p.author?.username))
    } catch { /* ignore */ }
    candidates = await filterBlockedPosts(candidates, currentUser)

    const total = candidates.length
    let posts = candidates.slice(cursor, cursor + limit)

    posts = await refreshPostAvatars(posts)
    posts = await refreshPostCommentCounts(posts)
    // Todos los autores de este feed son, por definición, seguidos.
    const markFollowing = (a) => (a && a.username ? { ...a, isFollowing: true } : a)
    posts = posts.map((p) => ({
      ...p,
      author: markFollowing(p.author),
      sideA: p.sideA ? { ...p.sideA, author: markFollowing(p.sideA.author) } : p.sideA,
      sideB: p.sideB ? { ...p.sideB, author: markFollowing(p.sideB.author) } : p.sideB,
    }))

    return NextResponse.json({ posts, nextCursor: cursor + limit, hasMore: cursor + limit < total })
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

    // MEJORA E: excluye publicaciones marcadas "No me interesa" por este
    // viewer — para siempre, hasta que decida lo contrario (no hay endpoint
    // para deshacerlo, igual que en TikTok/Instagram). Solo afecta al Para
    // Ti; NO se aplica a /api/uploads, /api/feed/following ni al perfil.
    if (viewerKey) {
      try {
        const notInterestedIds = await getNotInterestedIds(viewerKey)
        if (notInterestedIds.size) candidates = candidates.filter((p) => !notInterestedIds.has(p.id))
      } catch { /* ignore */ }
    }
    const totalCandidates = candidates.length

    // ── Ranking con TWYK Engine (multi-señal + BPR + re-ranking multi-objetivo).
    // Los autores seguidos se cargan ANTES del ranking: dan boost social en el
    // Para Ti y se reutilizan después para anotar isFollowing (1 sola consulta).
    let followingSet = new Set()
    if (currentUser) {
      try { followingSet = new Set(await getFollowingUsernames(currentUser.id)) } catch { /* ignore */ }
    }
    // MEJORA A: intereses elegidos en el registro (POST /api/profile/interests)
    // — bootstrap del cold-start, ver rankFeed/contentPart.
    const declaredInterests = Array.isArray(currentUser?.interests) ? currentUser.interests : []
    const ctx = { hour: new Date().getHours(), following: followingSet, interests: declaredInterests }
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
    // Refresca el conteo REAL de comentarios (ver refreshPostCommentCounts):
    // sin esto, la tarjeta mostraría siempre el valor congelado desde la
    // creación del post (normalmente 0) en vez del número actual.
    posts = await refreshPostCommentCounts(posts)

    // Anota el estado isFollowing de cada autor para el usuario logueado,
    // reutilizando el followingSet ya cargado antes del ranking.
    if (currentUser) {
      try {
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

    // RETOS ABIERTOS: se inyecta 1 tarjeta "Responder este reto" por página
    // (si hay alguno disponible), en la 3ª posición de la página — visible
    // para CUALQUIERA que descubra el feed, no solo la persona retada (a
    // diferencia de los retos dirigidos, que solo viven en la bandeja de
    // Retos Activos de un usuario concreto). Se elige rotando por página
    // (cursor/limit) para no repetir siempre el mismo si hay varios abiertos;
    // el dedupe por id en useFeed.js evita que se repita la MISMA tarjeta si
    // el ciclo vuelve a caer sobre ella en una página posterior.
    try {
      const openItems = await getOpenChallengeFeedItems(currentUser)
      if (openItems.length) {
        const pageIdx = Math.floor(cursor / (limit || 8))
        const chosen = openItems[pageIdx % openItems.length]
        const insertAt = Math.min(2, posts.length)
        posts = [...posts.slice(0, insertAt), chosen, ...posts.slice(insertAt)]
      }
    } catch { /* ignore: el feed nunca debe romperse por esto */ }

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
    posts = await refreshPostCommentCounts(posts)
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
    return NextResponse.json({ posts: await refreshPostCommentCounts(enrichedPosts) })
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

    return NextResponse.json({ user: info, posts: await refreshPostCommentCounts(await refreshPostAvatars(posts)) })
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
    return NextResponse.json({ saves, posts: await refreshPostCommentCounts(await refreshPostAvatars(posts)) })
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

  // POST /api/ai/edit-image - Editor de imágenes con IA (paso de creación de
  // contenido): recibe una foto ya seleccionada + una instrucción en texto
  // (ej. "añade un jet privado de fondo") y devuelve la imagen editada por
  // Gemini 2.5 Flash Image ("Nano Banana"), vía la Universal Key de Emergent.
  if (path === '/ai/edit-image') {
    return handleAiEditImage(request)
  }

  // POST /api/ai/suggest-edits - Sugerencias de edición RELEVANTES a la foto
  // (visión, análisis de texto — no genera imagen), para los chips del
  // editor de IA.
  if (path === '/ai/suggest-edits') {
    return handleAiSuggestEdits(request)
  }

  // POST /api/ai/edit-video - Editor de VÍDEO con IA (ver lib/aiVideoEditor.js
  // para la explicación completa del enfoque: fotogramas clave editados con
  // IA + propagación con ebsynth, 100% CPU, sin GPU). Devuelve un jobId de
  // inmediato; el proceso real corre en segundo plano (tarda minutos).
  if (path === '/ai/edit-video') {
    return handleAiEditVideo(request)
  }

  // POST /api/ai/classify-edit - Clasifica la instrucción de edición de vídeo
  // (ADD_MOVING / ADD_STATIC / GLOBAL). El frontend la usa para decidir si la
  // edición GLOBAL puede ir por el Space GRATUITO de Lucy Edit (llamada desde
  // el NAVEGADOR del usuario: la cuota gratis de ZeroGPU es por IP del que
  // llama, así cada usuario tiene la suya sin cuentas ni tokens).
  if (path === '/ai/classify-edit') {
    return handleAiClassifyEdit(request)
  }

  // POST /api/ai/store-edited-video - Guarda el vídeo editado que el NAVEGADOR
  // obtuvo del Space gratuito (multipart 'video') y devuelve su URL pública.
  if (path === '/ai/store-edited-video') {
    return handleAiStoreEditedVideo(request)
  }

  // POST /api/share - Registrar un compartido (señal fuerte del TWYK Engine).
  // Fire-and-forget desde el botón de compartir (web y APK): nunca bloquea la UI.
  if (path === '/share') {
    return handleShare(request)
  }

  // POST /api/post-view - Registra que ALGUIEN abrió esta publicación desde el
  // visor de un perfil (propio o ajeno) -> alimenta el contador visible
  // "reproducciones" (stats.views), usado en la píldora del grid y en la
  // barra que alterna con "Añadir comentario" del perfil propio. Fire-and-
  // forget: nunca debe bloquear ni afectar la apertura del visor.
  if (path === '/post-view') {
    return handlePostView(request)
  }

  // POST /api/feed/not-interested - MEJORA E: feedback negativo explícito
  // ("No me interesa" del menú de tres puntos). Fire-and-forget: la tarjeta
  // ya se quita del feed en el cliente aunque esta petición tarde/falle.
  if (path === '/feed/not-interested') {
    return handleNotInterested(request)
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

  // POST /api/auth/accept-terms - Marcar que el usuario aceptó Términos/Privacidad/Cookies
  if (path === '/auth/accept-terms') {
    return handleAcceptTerms(request)
  }

  // POST /api/profile/interests - Guardar intereses del paso final del registro
  if (path === '/profile/interests') {
    return handleSaveInterests(request)
  }

  // POST /api/profile - Actualizar perfil (nombre, bio, avatar)
  if (path === '/profile') {
    return handleUpdateProfile(request)
  }

  // POST /api/notifications/read - Marcar notificaciones como leídas
  if (path === '/notifications/read') {
    return handleMarkNotificationsRead(request)
  }

  // POST /api/push/tokens - Registrar (o refrescar) el token FCM de ESTE
  // dispositivo para el usuario autenticado (ver lib/push.js). Llamado por
  // la app nativa al iniciar sesión / al rotar el token (onNewToken).
  if (path === '/push/tokens') {
    return handleRegisterPushToken(request)
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
  // Responder a un reto ABIERTO (a cualquiera) -> publica un versus SIN
  // cerrar el reto original (puede recibir más respuestas de otras personas).
  if (segs[0] === 'challenges' && segs[2] === 'respond') {
    return handleRespondOpenChallenge(segs[1], request)
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
    // TWYK Engine: seguir es la señal de afinidad más explícita → sube fuerte
    // al creador en el perfil del viewer (sus batallas suben en el Para Ti).
    recordSocialAffinity(`u:${currentUser.id}`, targetUsername, result.following ? 'follow' : 'unfollow').catch(() => {})
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
    // BUG PRE-EXISTENTE encontrado y corregido: los posts DEMO usan el id
    // "versus_<n>" (solo dígitos, ver makePosts), pero los posts REALES
    // subidos también empiezan por "versus_" ("versus_up_<hex>" / normal,
    // "versus_ch_<hex>" / reto aceptado) — el chequeo antiguo
    // `startsWith('versus_')` los trataba a TODOS como demo, y como
    // parseInt("up"/"ch")===NaN, el post real se quedaba en el fallback
    // `{ id }` (sin sideA/sideB/author): la señal de "completar el vídeo"
    // nunca alimentaba las categorías/creador para NINGÚN post real de tipo
    // "versus" (sí funcionaba para "duet_<hex>", que no colisiona). FIX: solo
    // se trata como demo si el resto del id son ÚNICAMENTE dígitos.
    let post = { id }
    try {
      const demoMatch = String(id).match(/^versus_(\d+)$/)
      if (demoMatch) {
        post = makePosts(parseInt(demoMatch[1], 10), 1)[0]
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

// POST /api/profile/interests — paso final del registro ("Choose what you
// like"): guarda la lista de intereses elegidos (o vacía si se pulsó Skip)
// en el documento del usuario autenticado. Body JSON: { interests: string[] }.
async function handleSaveInterests(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in' }, { status: 401 })
    }
    let body = null
    try { body = await request.json() } catch { body = null }
    const raw = Array.isArray(body?.interests) ? body.interests : []
    const interests = raw
      .filter((x) => typeof x === 'string')
      .map((x) => x.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20)
    await saveUserInterests(currentUser.id, interests)
    return NextResponse.json({ ok: true, interests })
  } catch (err) {
    console.error('[profile/interests] error:', err)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
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
    // Reto ABIERTO ("responder este reto"): sin destinatario concreto, visible
    // para cualquiera en el feed (ver getOpenChallengeFeedItems). Cualquier
    // usuario autenticado (menos el propio creador) podrá responderlo con SU
    // propio vídeo/foto vía POST /api/challenges/:id/respond, sin que el reto
    // se cierre — puede acumular varias respuestas independientes.
    const openChallenge = (formData.get('openChallenge') || '').toString() === '1'

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'no_file' }, { status: 400 })
    }
    if (!openChallenge) {
      if (!targetAuthor) {
        return NextResponse.json({ error: 'no_target' }, { status: 400 })
      }
      // No puedes retarte a ti mismo.
      if (targetAuthor.username && targetAuthor.username === currentUser.username) {
        return NextResponse.json({ error: 'cannot_challenge_yourself', message: 'No puedes retarte a ti mismo' }, { status: 400 })
      }
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
      to: openChallenge ? null : targetAuthor,
      open: openChallenge,
      // Lado A = media del retador (imagen o vídeo)
      challengerMediaType: myMedia.mediaType,
      challengerVideoUrl: myMedia.mediaType === 'video' ? myMedia.url : null,
      challengerImageUrl: myMedia.mediaType === 'image' ? myMedia.url : null,
      challengerPosterUrl: myMedia.posterUrl,
      // Lado B = contenido retado (o lo sube el retado al aceptar). Los retos
      // abiertos SIEMPRE esperan que quien responda suba su propia media
      // (no hay "a quién" ni "a qué" concreto todavía).
      targetMediaType: openChallenge ? null : (targetMediaType || null),
      targetVideoUrl: openChallenge ? null : (targetMediaType === 'image' ? null : (targetVideoUrl || null)),
      targetImageUrl: openChallenge ? null : (targetMediaType === 'image' ? (targetImageUrl || targetVideoUrl || null) : (targetImageUrl || null)),
      targetPosterUrl: openChallenge ? null : (targetPosterUrl || null),
      targetAuthor: openChallenge ? null : targetAuthor,
      targetDescription: openChallenge ? '' : targetDescription,
      targetMusic: openChallenge ? '' : targetMusic,
      message,
      ...readMusicFields(formData),
      createdAt: new Date().toISOString(),
    }
    await insertChallenge(challenge)

    if (!openChallenge) {
      // TWYK Engine: retar a alguien (botón Challenge) es afinidad social máxima
      // hacia ese creador (+2.5 en el perfil del retador).
      recordSocialAffinity(`u:${currentUser.id}`, targetAuthor?.username, 'challenge').catch(() => {})

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

    // Los retos ABIERTOS (a cualquiera) nunca se cierran con un solo "accept":
    // deben responderse vía POST /api/challenges/:id/respond (ver más abajo),
    // que NO borra el reto -> puede acumular varias respuestas independientes.
    if (c.open) {
      return NextResponse.json({ error: 'open_challenge_use_respond', message: 'Use /respond for open challenges' }, { status: 400 })
    }

    // Quien ACEPTA el reto es el usuario autenticado (el retado, c.to). Se
    // captura aquí para usar su id REAL en la notificación "aceptó tu reto":
    // antes se usaba c.to?.id, que en los retos creados desde la app nativa
    // llega SIN id (targetAuthor solo trae username/name/avatarUrl), por lo que
    // createNotification no encontraba al usuario y `fromUser` quedaba null →
    // la notificación se mostraba como "@user ... " con avatar genérico (bug
    // reportado con captura). Con el id del usuario autenticado la búsqueda
    // siempre resuelve al aceptante real.
    const accepter = await getCurrentUser(request)

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
    // el retado (c.to) = el usuario autenticado `accepter` (id real).
    try {
      const challengerId = c.from?.id
      const accepterId = accepter?.id || c.to?.id || null
      if (challengerId && challengerId !== 'anonymous') {
        await createNotification({
          userId: challengerId,
          type: 'accepted',
          fromUserId: accepterId,
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

// POST /api/challenges/{id}/respond -> SOLO para retos ABIERTOS (open: true).
// Cualquier usuario autenticado (menos el propio creador) sube SU vídeo/foto
// como respuesta; se publica un versus (A=creador del reto, B=quien responde)
// igual que un reto 1-a-1 aceptado, PERO el reto original NUNCA se borra —
// sigue disponible para que otras personas también respondan (a diferencia de
// /accept, que cierra el reto dirigido). Un mismo usuario solo puede responder
// una vez al mismo reto abierto.
async function handleRespondOpenChallenge(cid, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to respond' }, { status: 401 })
    }
    const list = await readChallenges()
    const c = list.find((x) => x.id === cid)
    if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!c.open) {
      return NextResponse.json({ error: 'not_open', message: 'This challenge is not open to everyone' }, { status: 400 })
    }
    if (c.from?.id && c.from.id === currentUser.id) {
      return NextResponse.json({ error: 'cannot_respond_own_challenge', message: 'You cannot respond to your own open challenge' }, { status: 400 })
    }

    // Un usuario solo puede responder UNA VEZ al mismo reto abierto (evita
    // duplicados accidentales por doble-toque; sí puede haber muchos usuarios
    // DISTINTOS respondiendo, cada uno con su propio versus).
    const meta = await readUploadMeta()
    const already = meta.some((p) => p.sourceChallengeId === cid && p.sideB?.author?.id === currentUser.id)
    if (already) {
      return NextResponse.json({ error: 'already_responded', message: 'You already responded to this challenge' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'no_file' }, { status: 400 })
    }

    // La respuesta debe ser del MISMO tipo de media que el reto original
    // (vídeo<->vídeo, foto<->foto) — mismo criterio que los retos 1-a-1.
    const requiredMediaType = c.challengerMediaType || (c.challengerImageUrl ? 'image' : 'video')
    const m = await saveUploadedMedia(file)
    if (m.mediaType !== requiredMediaType) {
      return NextResponse.json({ error: 'media_type_mismatch', detail: `This challenge requires a ${requiredMediaType}` }, { status: 400 })
    }

    const aMediaType = c.challengerMediaType || (c.challengerImageUrl ? 'image' : 'video')
    const aVideoUrl = aMediaType === 'video' ? (c.challengerVideoUrl || null) : null
    const aImageUrl = aMediaType === 'image' ? (c.challengerImageUrl || null) : null
    const aPosterUrl = c.challengerPosterUrl || (aVideoUrl ? posterFor(aVideoUrl) : aImageUrl)

    const realAuthor = {
      id: currentUser.id,
      username: currentUser.username,
      name: currentUser.name || currentUser.username,
      avatarUrl: currentUser.avatarUrl,
      verified: currentUser.verified || false,
    }

    const id = crypto.randomBytes(8).toString('hex')
    const post = {
      id: `versus_ch_${id}`,
      type: 'versus',
      layout: 'carousel',
      mediaType: aMediaType,
      sideA: { mediaType: aMediaType, videoUrl: aVideoUrl || '', imageUrl: aImageUrl || '', posterUrl: aPosterUrl, author: c.from, description: c.message || '', music: 'Open challenge' },
      sideB: { mediaType: m.mediaType, videoUrl: m.mediaType === 'video' ? m.url : '', imageUrl: m.mediaType === 'image' ? m.url : '', posterUrl: m.posterUrl, author: realAuthor, description: '', music: 'Response' },
      author: c.from,
      description: c.message || '',
      music: c.musicTitle ? `${c.musicTitle} · ${c.musicArtist}` : 'Open challenge accepted',
      ...(c.musicPreviewUrl ? { musicTitle: c.musicTitle, musicArtist: c.musicArtist, musicArtwork: c.musicArtwork, musicPreviewUrl: c.musicPreviewUrl, musicTrackId: c.musicTrackId } : {}),
      videoUrl: aVideoUrl || '',
      posterUrl: aPosterUrl,
      thumbnailUrl: aPosterUrl,
      stats: { likes: 0, comments: 0, shares: 0, saves: 0 },
      votes: { a: 0, b: 0 },
      duration: 0,
      uploadedAt: new Date().toISOString(),
      isChallenge: true,
      sourceChallengeId: cid,
      isOpenChallengeResponse: true,
    }
    await insertPost(post)
    // A PROPÓSITO: no se llama a deleteChallenge — el reto abierto sigue vivo
    // para que otras personas también puedan responderlo.

    recordSocialAffinity(`u:${currentUser.id}`, c.from?.username, 'challenge').catch(() => {})

    try {
      if (c.from?.id && c.from.id !== 'anonymous' && c.from.id !== currentUser.id) {
        await createNotification({ userId: c.from.id, type: 'accepted', fromUserId: currentUser.id, postId: post.id })
      }
    } catch (notifErr) {
      console.error('open challenge response notification error', notifErr)
    }

    return NextResponse.json({ ok: true, post })
  } catch (err) {
    console.error('respond open challenge error', err)
    return NextResponse.json({ error: 'respond_failed', detail: String(err?.message || err) }, { status: 500 })
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

// POST /api/auth/accept-terms - El usuario logueado acepta Términos de Uso /
// Privacidad / Cookies desde el modal de consentimiento. Se persiste en la
// cuenta (no solo en localStorage) para que no vuelva a pedirse en otro
// dispositivo/sesión una vez aceptado.
async function handleAcceptTerms(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const updated = await acceptTerms(currentUser.id)
    return NextResponse.json({ ok: true, user: updated })
  } catch (err) {
    console.error('accept-terms error', err)
    return NextResponse.json({ error: 'accept_terms_failed' }, { status: 500 })
  }
}

// POST /api/notifications/read - Marcar notificaciones como leídas
// POST /api/push/tokens  body: { token, appVersion? }
// Registra el token FCM de este dispositivo para el usuario autenticado
// (ver lib/push.js: registerDeviceToken). Un usuario puede tener varios
// dispositivos; se identifica cada uno por (userId, token).
async function handleRegisterPushToken(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const token = (body?.token || '').toString().trim()
    if (!token) {
      return NextResponse.json({ error: 'missing_token' }, { status: 400 })
    }
    await registerDeviceToken(currentUser.id, token, {
      platform: (body?.platform || 'android').toString(),
      appVersion: body?.appVersion ? String(body.appVersion) : null,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('register push token error', err)
    return NextResponse.json({ error: 'register_push_token_failed' }, { status: 500 })
  }
}

// DELETE /api/push/tokens  body: { token }
// Desactiva el token de este dispositivo (logout) para dejar de recibir
// notificaciones push ahí sin afectar a otros dispositivos del usuario.
async function handleUnregisterPushToken(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const token = (body?.token || '').toString().trim()
    if (!token) {
      return NextResponse.json({ error: 'missing_token' }, { status: 400 })
    }
    await unregisterDeviceToken(currentUser.id, token)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('unregister push token error', err)
    return NextResponse.json({ error: 'unregister_push_token_failed' }, { status: 500 })
  }
}

async function handleMarkNotificationsRead(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { notificationId, all, types } = body

    if (all) {
      await markAllNotificationsAsRead(currentUser.id)
    } else if (Array.isArray(types) && types.length > 0) {
      // Usado al ABRIR una pestaña de categoría (Challenges/Votes/Followers/
      // Comments) en la bandeja: verla ya cuenta como "leída" para esos tipos.
      await markNotificationsByTypeAsRead(currentUser.id, types)
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
        const directParent = await getCommentByIdDB(parentId)
        if (directParent && directParent.postId === postId) {
          parentComment = directParent
          // Aplanar a 1 nivel (igual criterio que CommentsModal.jsx en el
          // frontend): si el comentario al que respondes YA es en sí mismo
          // una respuesta (tiene su propio parentId), la nueva respuesta se
          // cuelga del comentario RAÍZ, para que siempre aparezca en el
          // mismo hilo plano sin importar desde dónde se responda (modal de
          // comentarios o desde la página de Notificaciones).
          safeParentId = directParent.parentId || directParent.id
        }
      } catch { /* ignore, se trata como comentario normal */ }
    }

    // replyToId = comentario EXACTO al que se respondió (puede ser una
    // respuesta, no solo la raíz); distinto de safeParentId, que siempre es
    // la raíz del hilo (aplanado a 1 nivel para el almacenamiento/agrupado).
    // El frontend usa replyToId para saber entre qué 2 avatares dibujar la
    // línea vertical de conexión (solo si B respondió específicamente a A).
    const replyToId = parentComment ? parentComment.id : null

    // Username del AUTOR al que se respondió (para el formato "autor ▶
    // usuario_respondido" en la cabecera de la respuesta, estilo
    // YouTube/Instagram). Se resuelve aquí para que la respuesta recién
    // creada lo muestre al instante, sin esperar a un recargar/refetch.
    let replyToUsername = null
    if (parentComment) {
      try {
        const targetUser = await getUserById(parentComment.userId)
        replyToUsername = targetUser?.username || null
      } catch { /* ignore */ }
    }

    const comment = await createCommentDB({ 
      postId, 
      userId: currentUser.id, 
      text: text.trim(),
      votedSide: votedSide === 'a' || votedSide === 'b' ? votedSide : null,
      parentId: safeParentId,
      replyToId,
    })

    // TWYK Engine: comentar es señal de engagement (+0.8 en Q/oleadas) + afinidad.
    try {
      const metaEng = await readUploadMeta()
      const pEng = metaEng.find((x) => x.id === postId)
      if (pEng) recordEngagement(pEng, 'comment', `u:${currentUser.id}`).catch(() => {})
    } catch { /* ignore */ }

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
      replyToId: comment.replyToId || null,
      replyToUsername,
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
// POST /api/share - Registra que el viewer compartió un post. Suma al contador
// visible (stats.shares) y alimenta el TWYK Engine (la señal positiva más
// difícil de fingir: peso 1.5 en calidad Q y promoción de oleadas).
async function handleShare(request) {
  try {
    const body = await request.json().catch(() => null)
    const id = body?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })
    const currentUser = await getCurrentUser(request)
    const gid = request.cookies.get('twyk_gid')?.value
    const viewerKey = currentUser?.id ? `u:${currentUser.id}` : (gid ? `g:${gid}` : null)
    const meta = await readUploadMeta()
    const post = meta.find((x) => x.id === id)
    if (post) {
      updatePost(id, { 'stats.shares': (post.stats?.shares || 0) + 1 }).catch(() => {})
      recordEngagement(post, 'share', viewerKey).catch(() => {})
    }
    return NextResponse.json({ ok: true })
  } catch {
    // Fire-and-forget: registrar el share nunca debe romper la UI de compartir.
    return NextResponse.json({ ok: true })
  }
}

// POST /api/post-view - contador visible de "reproducciones/vistas" de una
// publicación, DELIBERADAMENTE separado del motor de recomendación
// (reco_item_stats.impressions/plays, ver lib/recommender.js): sumar aquí
// NO debe contaminar el engagement-rate ni el completion-rate que usa el
// algoritmo de oleadas/throttle. Usa `incrementPostViews` (lib/db.js), que ya
// existía sin usar y actúa sobre `stats.views` de la MISMA colección `posts`
// que gestiona lib/stores.js (COLLECTIONS.POSTS === stores.js POSTS === 'posts').
// Sin autenticación (métrica pública, igual que los votos/shares); no-op
// silencioso si el post no existe en Mongo (p.ej. posts demo del feed).
async function handlePostView(request) {
  try {
    const body = await request.json().catch(() => null)
    const id = body?.id
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 })
    incrementPostViews(id).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch {
    // Fire-and-forget: nunca debe romper el visor del perfil.
    return NextResponse.json({ ok: true })
  }
}

// MEJORA E — "No me interesa" (menú de tres puntos, ver OptionsModal.jsx).
// Requiere identidad (usuario logueado o invitado con cookie de dispositivo,
// mismo criterio que /api/feed) para poder excluir la publicación de futuras
// llamadas a /api/feed de ESE viewer. Fire-and-forget desde el cliente.
async function handleNotInterested(request) {
  try {
    const body = await request.json().catch(() => null)
    const postId = body?.postId
    if (!postId) return NextResponse.json({ error: 'missing_postId' }, { status: 400 })
    const currentUser = await getCurrentUser(request)
    const gid = request.cookies.get('twyk_gid')?.value
    const viewerKey = currentUser?.id ? `u:${currentUser.id}` : (gid ? `g:${gid}` : null)
    if (!viewerKey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const meta = await readUploadMeta()
    const post = meta.find((x) => x.id === postId) || { id: postId }
    await recordNotInterested(post, viewerKey)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('not-interested error', err)
    return NextResponse.json({ error: 'not_interested_failed' }, { status: 500 })
  }
}


// ────────────────────────────────────────────────────────────────────────────
// Editor de imágenes con IA (creación de contenido)
// ────────────────────────────────────────────────────────────────────────────

const AI_EDIT_MODEL = 'gemini-2.5-flash-image' // Gemini "Nano Banana" (edición image-to-image)
const AI_EDIT_MAX_BYTES = 15 * 1024 * 1024 // mismo límite que fotos en UploadDialog.jsx
const AI_EDIT_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// POST /api/ai/edit-image
//   FormData: image (File, foto ya seleccionada por el usuario), prompt (string)
//   Requiere sesión (misma regla que publicar). Envía la foto + la instrucción
//   a Gemini 2.5 Flash Image ("Nano Banana") vía LlmChat.sendMessageMultimodalResponse
//   (rutea por el proxy de Emergent con EMERGENT_LLM_KEY — NO se envía ninguna
//   clave directa de Google) y devuelve la imagen resultante como data URL,
//   lista para convertirse en File en el cliente y reemplazar la foto original.
async function handleAiEditImage(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to use the AI editor' }, { status: 401 })
    }

    const formData = await request.formData()
    const image = formData.get('image')
    const prompt = (formData.get('prompt') || '').toString().trim()

    if (!image || typeof image === 'string') {
      return NextResponse.json({ error: 'missing_image', message: 'Select a photo first' }, { status: 400 })
    }
    const type = (image.type || '').toLowerCase()
    if (!AI_EDIT_ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'invalid_image', message: 'Use a JPG, PNG or WEBP photo' }, { status: 415 })
    }
    if (image.size > AI_EDIT_MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large', message: 'Photo must be 15MB or smaller' }, { status: 413 })
    }
    if (prompt.length < 3) {
      return NextResponse.json({ error: 'missing_prompt', message: 'Describe what you want to add or change' }, { status: 400 })
    }
    if (prompt.length > 500) {
      return NextResponse.json({ error: 'prompt_too_long', message: 'Keep the instruction under 500 characters' }, { status: 400 })
    }

    const apiKey = process.env.EMERGENT_LLM_KEY
    if (!apiKey) {
      console.error('AI edit image: EMERGENT_LLM_KEY missing')
      return NextResponse.json({ error: 'ai_not_configured', message: 'AI editor is not configured' }, { status: 500 })
    }

    const bytes = Buffer.from(await image.arrayBuffer())
    const base64 = bytes.toString('base64')

    const chat = new LlmChat(
      apiKey,
      `img-edit-${currentUser.id}-${Date.now()}`,
      'You are an expert photo editing AI. Apply exactly the requested edit to the provided photo. Preserve the rest of the image (subject, framing, lighting, style) unless the instruction says otherwise, and make the added/changed elements look realistic and well integrated. Always return the edited image.'
    ).withModel('gemini', AI_EDIT_MODEL)

    const [, images] = await chat.sendMessageMultimodalResponse(
      new UserMessage({
        text: prompt,
        file_contents: [new ImageContent(base64)],
      })
    )

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'no_image_returned', message: 'The AI could not edit this photo, try a different instruction' }, { status: 502 })
    }

    const out = images[0]
    const mimeType = out.mime_type || 'image/png'
    return NextResponse.json({ ok: true, image: `data:${mimeType};base64,${out.data}`, mimeType })
  } catch (err) {
    console.error('ai edit image error', err)
    return NextResponse.json({ error: 'ai_edit_failed', message: 'AI editing failed, please try again' }, { status: 500 })
  }
}

// POST /api/ai/suggest-edits
//   FormData: image (File, foto ya seleccionada por el usuario)
//   Analiza la foto (visión, modelo de texto — NO genera imagen) y devuelve
//   4-6 ideas de edición CORTAS y RELEVANTES para ESA foto en concreto (ej.
//   si es un coche de noche: "Add a private jet flying above", si es una
//   playa: "Add a dramatic sunset sky"...), para mostrarlas como chips
//   sugeridos en el editor de IA (usuario: 'las sugerencias deben ser de
//   algo que tenga que ver con la imagen'). Requiere sesión. Fire-and-forget
//   desde el cliente (si falla, el frontend usa una lista genérica de
//   respaldo — nunca bloquea poder escribir una instrucción manual).
async function handleAiSuggestEdits(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to use the AI editor' }, { status: 401 })
    }

    const formData = await request.formData()
    const image = formData.get('image')
    if (!image || typeof image === 'string') {
      return NextResponse.json({ error: 'missing_image', message: 'Select a photo first' }, { status: 400 })
    }
    const type = (image.type || '').toLowerCase()
    if (!AI_EDIT_ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'invalid_image', message: 'Use a JPG, PNG or WEBP photo' }, { status: 415 })
    }
    if (image.size > AI_EDIT_MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large', message: 'Photo must be 15MB or smaller' }, { status: 413 })
    }

    const apiKey = process.env.EMERGENT_LLM_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ai_not_configured', message: 'AI editor is not configured' }, { status: 500 })
    }

    const bytes = Buffer.from(await image.arrayBuffer())
    const base64 = bytes.toString('base64')

    const chat = new LlmChat(
      apiKey,
      `img-suggest-${currentUser.id}-${Date.now()}`,
      'You are a creative photo-editing assistant. Look at the photo and suggest short edit ideas a casual social-media user could ask an AI to apply to THIS specific photo (things to ADD to the background/scene, or a style/mood change) — tailored to what is actually visible in the photo (setting, subjects, time of day, colors). Each idea must be an instruction phrased in imperative form, under 7 words, fun and visually striking. Respond with ONLY a JSON array of 5 short strings, nothing else, no markdown, no code fences.'
    ).withModel('gemini', 'gemini-2.5-flash')

    const text = await chat.sendMessage(
      new UserMessage({
        text: 'Suggest 5 short edit ideas for this exact photo, as a JSON array of strings only.',
        file_contents: [new ImageContent(base64)],
      })
    )

    let suggestions = []
    try {
      const cleaned = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()).slice(0, 6)
      }
    } catch {
      // Respaldo: intenta extraer líneas tipo lista si no vino JSON limpio.
      suggestions = String(text || '')
        .split('\n')
        .map((l) => l.replace(/^[-*\d.\s"]+/, '').replace(/["\s]+$/, '').trim())
        .filter((l) => l.length > 2 && l.length < 60)
        .slice(0, 6)
    }

    if (suggestions.length === 0) {
      return NextResponse.json({ error: 'no_suggestions', message: 'Could not analyze this photo' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, suggestions })
  } catch (err) {
    console.error('ai suggest edits error', err)
    return NextResponse.json({ error: 'ai_suggest_failed', message: 'Could not analyze this photo' }, { status: 500 })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Editor de VÍDEO con IA (ver lib/aiVideoEditor.js). DOS modos automáticos:
//  • COMPOSICIÓN (añadir un elemento al escenario): ~25-70s, calidad nativa
//    (sticker consistente + tracking de cámara + oclusión + movimiento propio)
//  • ESTILO (reestilizado global): claves IA + ebsynth bidireccional, lento
//    (~minutos) pero honesto — 100% CPU, sin GPU ni APIs de pago
// ────────────────────────────────────────────────────────────────────────────

const AI_VIDEO_MAX_BYTES = 80 * 1024 * 1024 // mismo límite que vídeos normales
const AI_VIDEO_ALLOWED_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
const AI_VIDEO_INCOMING_DIR = nodePath.join(process.cwd(), '.tmp_ai_video', 'incoming')

// POST /api/ai/edit-video
//   FormData: video (File), prompt (string)
//   Requiere sesión. Guarda el vídeo en una carpeta temporal (no pública),
//   valida duración/tamaño/tipo, y arranca el job en segundo plano —
//   responde AL INSTANTE con { ok:true, jobId } (añadir un elemento tarda
//   menos de ~1 min; un reestilizado global, varios minutos — ver
//   aiVideoEditor.js). El cliente hace polling a
//   GET /api/ai/edit-video-status?jobId=...
async function handleAiEditVideo(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized', message: 'You must log in to use the AI editor' }, { status: 401 })
    }

    const formData = await request.formData()
    const video = formData.get('video')
    const prompt = (formData.get('prompt') || '').toString().trim()

    if (!video || typeof video === 'string') {
      return NextResponse.json({ error: 'missing_video', message: 'Select a video first' }, { status: 400 })
    }
    const type = (video.type || '').toLowerCase()
    if (!AI_VIDEO_ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: 'invalid_video', message: 'Use an MP4, MOV or WEBM video' }, { status: 415 })
    }
    if (video.size > AI_VIDEO_MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large', message: 'Video must be 80MB or smaller' }, { status: 413 })
    }
    if (prompt.length < 3) {
      return NextResponse.json({ error: 'missing_prompt', message: 'Describe what you want to add or change' }, { status: 400 })
    }
    if (prompt.length > 500) {
      return NextResponse.json({ error: 'prompt_too_long', message: 'Keep the instruction under 500 characters' }, { status: 400 })
    }
    if (!process.env.EMERGENT_LLM_KEY) {
      return NextResponse.json({ error: 'ai_not_configured', message: 'AI editor is not configured' }, { status: 500 })
    }

    await fs.mkdir(AI_VIDEO_INCOMING_DIR, { recursive: true })
    const incomingId = crypto.randomBytes(8).toString('hex')
    const ext = type === 'video/quicktime' ? 'mov' : type === 'video/webm' ? 'webm' : 'mp4'
    const videoPath = nodePath.join(AI_VIDEO_INCOMING_DIR, `${incomingId}.${ext}`)
    const bytes = Buffer.from(await video.arrayBuffer())
    if (!bytes || bytes.length === 0) {
      return NextResponse.json({ error: 'empty_upload' }, { status: 400 })
    }
    await fs.writeFile(videoPath, bytes)

    try {
      await validateVideoForAiEdit(videoPath)
    } catch {
      await fs.rm(videoPath, { force: true }).catch(() => {})
      return NextResponse.json({ error: 'invalid_video', message: 'Could not read this video' }, { status: 400 })
    }

    const modeHintRaw = (formData.get('mode') || '').toString().trim().toUpperCase()
    const modeHint = ['ADD_MOVING', 'ADD_STATIC', 'GLOBAL'].includes(modeHintRaw) ? modeHintRaw : undefined
    const jobId = await createVideoEditJob({ userId: currentUser.id, videoPath, prompt, modeHint })
    return NextResponse.json({ ok: true, jobId, maxDurationSec: MAX_DURATION_SEC })
  } catch (err) {
    console.error('ai edit video error', err)
    return NextResponse.json({ error: 'ai_edit_video_failed', message: 'Could not start the AI video editor' }, { status: 500 })
  }
}

// GET /api/ai/edit-video-status?jobId=...
//   Requiere sesión, y que el job pertenezca al usuario actual.
async function handleAiEditVideoStatus(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ error: 'missing_jobId' }, { status: 400 })
    }
    const job = await getVideoEditJob(jobId)
    if (!job || job.userId !== currentUser.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({
      ok: true,
      status: job.status,
      progress: job.progress || 0,
      total: job.total || 0,
      resultUrl: job.resultUrl || null,
      error: job.error || null,
    })
  } catch (err) {
    console.error('ai edit video status error', err)
    return NextResponse.json({ error: 'status_failed' }, { status: 500 })
  }
}

// POST /api/ai/classify-edit - { prompt } -> { ok, mode }
//   Clasifica la instrucción (ADD_MOVING/ADD_STATIC/GLOBAL) con el LLM de
//   texto. El frontend decide con esto la ruta: ADD_* -> job local rápido;
//   GLOBAL -> intenta el Space GRATUITO de Lucy Edit desde el NAVEGADOR del
//   usuario (cuota ZeroGPU por IP del llamante: cada usuario tiene la suya,
//   sin cuentas ni tokens) y si no hay cuota cae al job local. El usuario
//   puede REINTENTAR tantas veces como quiera: nunca se bloquea.
async function handleAiClassifyEdit(request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const prompt = (body?.prompt || '').toString().trim()
    if (prompt.length < 3) {
      return NextResponse.json({ error: 'missing_prompt' }, { status: 400 })
    }
    if (!process.env.EMERGENT_LLM_KEY) {
      return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 })
    }
    const mode = await classifyEditMode(process.env.EMERGENT_LLM_KEY, crypto.randomUUID(), prompt)
    return NextResponse.json({ ok: true, mode })
  } catch (err) {
    console.error('ai classify edit error', err)
    // Ante cualquier fallo, modo seguro: el job del backend re-clasifica igual.
    return NextResponse.json({ ok: true, mode: 'ADD_STATIC' })
  }
}

// POST /api/ai/store-edited-video - FormData: video
//   Guarda el vídeo que el NAVEGADOR obtuvo del Space gratuito de Lucy Edit,
//   transcodificado a H.264+faststart (compatibilidad web garantizada), y
//   devuelve su URL pública — mismo formato de salida que los jobs locales.
async function handleAiStoreEditedVideo(request) {
  let tmpPath = null
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const formData = await request.formData()
    const video = formData.get('video')
    if (!video || typeof video === 'string') {
      return NextResponse.json({ error: 'missing_video' }, { status: 400 })
    }
    if (video.size > AI_VIDEO_MAX_BYTES) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
    }
    const bytes = Buffer.from(await video.arrayBuffer())
    if (!bytes || bytes.length === 0) {
      return NextResponse.json({ error: 'empty_upload' }, { status: 400 })
    }
    await fs.mkdir(AI_VIDEO_INCOMING_DIR, { recursive: true })
    tmpPath = nodePath.join(AI_VIDEO_INCOMING_DIR, `store_${crypto.randomBytes(8).toString('hex')}.mp4`)
    await fs.writeFile(tmpPath, bytes)
    try {
      await validateVideoForAiEdit(tmpPath) // debe ser un vídeo real y legible
    } catch {
      return NextResponse.json({ error: 'invalid_video' }, { status: 400 })
    }
    const outName = `ai_video_${crypto.randomBytes(8).toString('hex')}.mp4`
    const outPath = nodePath.join(UPLOAD_DIR, outName)
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const ok = await runFfmpeg(['-y', '-i', tmpPath, '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', outPath])
    if (!ok) await fs.copyFile(tmpPath, outPath) // si ffmpeg fallara, guarda tal cual
    return NextResponse.json({ ok: true, url: `/uploads/${outName}` })
  } catch (err) {
    console.error('ai store edited video error', err)
    return NextResponse.json({ error: 'store_failed' }, { status: 500 })
  } finally {
    if (tmpPath) fs.rm(tmpPath, { force: true }).catch(() => {})
  }
}




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
    // TWYK Engine: guardar es señal de calidad (+1.2 en oleadas/Q) + afinidad.
    try {
      const meta = await readUploadMeta()
      const post = meta.find((x) => x.id === postId)
      if (post) recordEngagement(post, result.saved ? 'save' : 'unsave', `u:${currentUser.id}`).catch(() => {})
    } catch { /* ignore */ }
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

  // DELETE /api/push/tokens - Desactivar el token de ESTE dispositivo (logout).
  if (path === '/push/tokens') {
    return handleUnregisterPushToken(request)
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
