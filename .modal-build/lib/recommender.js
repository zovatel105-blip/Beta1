import { getCollection } from './mongodb'
import { cosineTopK, lshTopK } from './annIndex'

// ────────────────────────────────────────────────────────────────────────────
// TWYK ENGINE — Motor de recomendación especializado en batallas 1vs1
//
// Inspirado en arquitecturas estado-del-arte (Two-Tower + BPR pairwise +
// ranking multi-objetivo), implementado 100% nativo en Node + MongoDB, sin
// dependencias externas, GPU ni infraestructura de serving.
//
// Componentes:
//   1) Embeddings user/item aprendidos ONLINE con BPR (Bayesian Personalized
//      Ranking) — la loss correcta para feedback pairwise (voto A vs B).
//   2) Score multi-señal: engagement (Wilson) + competitividad + velocity
//      (EMA, trending) + recency + personalización (dot de embeddings).
//   3) Re-ranking multi-objetivo: diversidad (MMR) + exploración
//      (epsilon-greedy / bandit) + fairness (cold-start) + anti-fatiga.
// ────────────────────────────────────────────────────────────────────────────

const DIM = 24
const LR = 0.08
const REG = 0.002
const HALF_LIFE_H = 12
const LAMBDA = Math.log(2) / HALF_LIFE_H
const ANN_THRESHOLD = 150   // por encima de este nº de candidatos, prefiltrar por ANN
const BURST_WINDOW_S = 60   // ventana de detección de ráfaga
const BURST_LIMIT = 20      // votos por ventana antes de marcar baja confianza

// ── Categorías (content-based) ──────────────────────────────────────────────
const HASHTAG_TO_CAT = {
  travel: 'travel', tokyo: 'travel', nature: 'nature', ocean: 'nature',
  blue: 'nature', goldenhour: 'nature', urban: 'urban', night: 'urban',
  vibes: 'lifestyle', relax: 'wellness', yoga: 'wellness', fitness: 'fitness',
  gym: 'fitness', foodtok: 'food', recipes: 'food', food: 'food',
  foodporn: 'food', coffee: 'food', dancechallenge: 'dance', dance: 'dance',
  trend: 'trending', space: 'science', aesthetic: 'art', art: 'art',
  timelapse: 'art', photo: 'art', pets: 'pets', funny: 'comedy',
  study: 'study', grwm: 'beauty', gaming: 'gaming', plays: 'gaming',
  bike: 'sports', surf: 'sports', cars: 'cars',
}

function extractHashtags(text = '') {
  const tags = []
  const re = /#(\w+)/g
  let m
  while ((m = re.exec(text)) !== null) tags.push(m[1].toLowerCase())
  return tags
}

export function categoriesForSide(side) {
  const cats = new Set()
  for (const t of extractHashtags(side?.description || '')) {
    cats.add(HASHTAG_TO_CAT[t] || t)
  }
  if (cats.size === 0) cats.add('general')
  return [...cats]
}

export function categoriesForPost(post) {
  const s = new Set([
    ...categoriesForSide(post?.sideA),
    ...categoriesForSide(post?.sideB),
  ])
  if (s.size === 0) s.add('general')
  return [...s]
}

// ── PRNG determinista (paginación estable por sesión) ───────────────────────
function hashSeed(s = '') {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── TWYK ENGINE v2: Thompson Sampling (Beta posterior) ──────────────────────
// Muestreo de la distribución Beta(α,β) por ítem: contenido probado converge a
// su media (explotación); contenido con pocas impresiones tiene distribución
// ancha y a veces sale arriba (exploración matemáticamente óptima). Efecto:
// el orden del feed cambia en cada refresh sin perder calidad.
function sampleNormal(rng) {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
function sampleGamma(shape, rng) {
  if (shape < 1) {
    const g = sampleGamma(shape + 1, rng)
    return g * Math.pow(rng() || 1e-9, 1 / shape)
  }
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d)
  for (let i = 0; i < 100; i++) {
    let x, v
    do { x = sampleNormal(rng); v = 1 + c * x } while (v <= 0)
    v = v * v * v
    const u = rng()
    if (u < 1 - 0.0331 * x * x * x * x) return d * v
    if (Math.log(u || 1e-9) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v
  }
  return shape // fallback numérico
}
function sampleBeta(alpha, beta, rng) {
  const x = sampleGamma(alpha, rng), y = sampleGamma(beta, rng)
  return (x + y) > 0 ? x / (x + y) : 0.5
}

// ── TWYK ENGINE v2: Elo pairwise por vídeo (Bradley-Terry / arena style) ────
// Cada voto es una comparación cara a cara: el vídeo ganador sube Elo, el
// perdedor baja. K ponderado por la confianza (trust) del voto.
async function eloUpdate(winKey, loseKey, trust = 1) {
  if (!winKey || !loseKey || winKey === loseKey) return
  const col = await getCollection('reco_elo')
  const docs = await col.find({ key: { $in: [winKey, loseKey] } }).toArray()
  const map = {}; for (const d of docs) map[d.key] = d
  const rw = map[winKey]?.rating ?? 1500
  const rl = map[loseKey]?.rating ?? 1500
  const expW = 1 / (1 + Math.pow(10, (rl - rw) / 400))
  const K = 32 * Math.max(0, Math.min(1, trust))
  const delta = K * (1 - expW)
  const now = new Date()
  await col.bulkWrite([
    { updateOne: { filter: { key: winKey }, update: { $set: { key: winKey, rating: rw + delta, updatedAt: now }, $inc: { games: 1 } }, upsert: true } },
    { updateOne: { filter: { key: loseKey }, update: { $set: { key: loseKey, rating: rl - delta, updatedAt: now }, $inc: { games: 1 } }, upsert: true } },
  ])
}

// ── TWYK ENGINE v2: sistema de oleadas (distribución TikTok-style) ──────────
// Todo post nuevo recibe una audiencia semilla garantizada (oleada 0, boost).
// Para escalar a la siguiente oleada debe superar un umbral de engagement
// (Wilson lower bound). Si rinde muy por debajo, se frena (throttle) sin morir:
// la reevaluación es continua y puede revivir con votos orgánicos.
function waveMultiplier(st, posE) {
  const imp = st.impressions || 0
  if (imp < 20) return { wave: 0, mult: 1.30, throttled: false }
  const engRate = wilson(Math.min(posE, imp), imp)
  const th = imp < 100 ? 0.08 : imp < 500 ? 0.10 : imp < 2500 ? 0.12 : 0.15
  const wave = imp < 100 ? 1 : imp < 500 ? 2 : imp < 2500 ? 3 : 4
  if (engRate < th * 0.4) return { wave, mult: 0.55, throttled: true }
  const mult = wave === 1 ? 1.15 : wave === 2 ? 1.05 : 1.0
  return { wave, mult, throttled: false }
}

// ── TWYK ENGINE v2: pesos configurables sin deploy (reco_config) ────────────
const DEFAULT_WEIGHTS = { q: 0.30, elo: 0.14, rec: 0.10, vel: 0.08, pers: 0.32, comp: 0.06 }
let _wCache = null
let _wCacheAt = 0
async function getWeights() {
  const now = Date.now()
  if (_wCache && now - _wCacheAt < 60000) return _wCache
  try {
    const col = await getCollection('reco_config')
    const doc = await col.findOne({ key: 'weights' })
    _wCache = { ...DEFAULT_WEIGHTS, ...(doc?.weights || {}) }
  } catch { _wCache = { ...DEFAULT_WEIGHTS } }
  _wCacheAt = now
  return _wCache
}

// ── TWYK ENGINE v2: semilla de sesión (arregla el "orden siempre igual") ────
// cursor=0 (refresh / pull-to-refresh) genera una salt NUEVA → el muestreo
// Thompson produce un orden distinto. cursor>0 (paginación del mismo scroll)
// reutiliza la salt → páginas consistentes entre sí.
async function getSessionSalt(viewerKey, cursor) {
  if (!viewerKey) {
    // Invitado sin cookie: bucket de 10 min (orden fresco pero paginable).
    return 'anon:' + Math.floor(Date.now() / 600000)
  }
  try {
    const col = await getCollection('reco_sessions')
    if (cursor === 0) {
      const salt = Math.random().toString(36).slice(2) + Date.now().toString(36)
      await col.updateOne({ viewerKey }, { $set: { viewerKey, salt, at: new Date() } }, { upsert: true })
      return salt
    }
    const doc = await col.findOne({ viewerKey })
    return doc?.salt || 'fallback'
  } catch {
    return String(Date.now())
  }
}

// ── Embeddings: init determinista (cold items no son idénticos) ─────────────
function seededVec(key) {
  let h = hashSeed(key)
  const v = new Array(DIM)
  for (let i = 0; i < DIM; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519)
    v[i] = (((h >>> 0) / 4294967295) - 0.5) * 0.1
  }
  return v
}

// ── Estadística: Wilson lower bound (CTR robusto) ───────────────────────────
function wilson(pos, n, z = 1.96) {
  if (n <= 0) return 0
  const p = pos / n
  const z2 = z * z
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)
}

function decayVelocity(v, lastVoteAt, now) {
  if (!v) return 0
  if (!lastVoteAt) return v
  const h = (now - new Date(lastVoteAt).getTime()) / 3.6e6
  return v * Math.exp(-LAMBDA * h)
}

// ── Índices (una sola vez por proceso) ──────────────────────────────────────
let _indexesReady = false
async function ensureIndexes() {
  if (_indexesReady) return
  try {
    const vec = await getCollection('reco_vectors')
    await vec.createIndex({ key: 1 }, { unique: true })
    const stats = await getCollection('reco_item_stats')
    await stats.createIndex({ id: 1 }, { unique: true })
    const imp = await getCollection('reco_impressions')
    await imp.createIndex({ viewerKey: 1, at: -1 })
    const vlog = await getCollection('reco_votes_log')
    await vlog.createIndex({ viewerKey: 1, postId: 1 }, { unique: true })
    await vlog.createIndex({ viewerKey: 1, at: -1 })
    const elo = await getCollection('reco_elo')
    await elo.createIndex({ key: 1 }, { unique: true })
    const sess = await getCollection('reco_sessions')
    await sess.createIndex({ viewerKey: 1 }, { unique: true })
    _indexesReady = true
  } catch { /* best-effort */ }
}

// ── BPR online update (loop de aprendizaje en tiempo real) ──────────────────
export async function bprUpdate(userKey, winKey, loseKey) {
  if (!userKey || !winKey || !loseKey || winKey === loseKey) return
  await ensureIndexes()
  const col = await getCollection('reco_vectors')
  const docs = await col.find({ key: { $in: [userKey, winKey, loseKey] } }).toArray()
  const map = {}
  for (const d of docs) map[d.key] = d.vec
  const u = map[userKey] || seededVec(userKey)
  const w = map[winKey] || seededVec(winKey)
  const l = map[loseKey] || seededVec(loseKey)

  let x = 0
  for (let i = 0; i < DIM; i++) x += u[i] * (w[i] - l[i])
  const g = 1 / (1 + Math.exp(x)) // = sigmoid(-x): gradiente BPR

  for (let i = 0; i < DIM; i++) {
    const ui = u[i], wi = w[i], li = l[i]
    u[i] = ui + LR * (g * (wi - li) - REG * ui)
    w[i] = wi + LR * (g * ui - REG * wi)
    l[i] = li + LR * (-g * ui - REG * li)
  }

  const now = new Date()
  await col.bulkWrite([
    { updateOne: { filter: { key: userKey }, update: { $set: { key: userKey, kind: 'user', vec: u, updatedAt: now } }, upsert: true } },
    { updateOne: { filter: { key: winKey }, update: { $set: { key: winKey, kind: 'item', vec: w, updatedAt: now } }, upsert: true } },
    { updateOne: { filter: { key: loseKey }, update: { $set: { key: loseKey, kind: 'item', vec: l, updatedAt: now } }, upsert: true } },
  ])
}

// ── MEJORA D: aprendizaje implícito de embeddings colaborativos ────────────
// bprUpdate (arriba) SOLO entrena con votos explícitos A-vs-B (tiene un
// "perdedor" real que comparar). Guardar/compartir/comentar o completar un
// vídeo son señales positivas genuinas pero SIN ningún rival natural — en vez
// de inventar un negativo falso (ruidoso, podría ser justo algo que también
// le gusta), acercamos el vector del usuario y el/los vídeo(s) implicados
// (actualización de factorización de matriz SOLO-POSITIVA, sin término
// contrastivo). `weight` escala cuánto se mueve cada vector según la fuerza
// de la señal (guardar/compartir pesan más que solo completar un vídeo).
async function embeddingPull(userKey, itemKeys, weight = 0.2) {
  const keys = (itemKeys || []).filter(Boolean)
  if (!userKey || keys.length === 0 || weight <= 0) return
  try {
    await ensureIndexes()
    const col = await getCollection('reco_vectors')
    const docs = await col.find({ key: { $in: [userKey, ...keys] } }).toArray()
    const map = {}
    for (const d of docs) map[d.key] = d.vec
    const u = map[userKey] || seededVec(userKey)
    const now = new Date()
    const ops = []
    for (const key of keys) {
      const it = map[key] || seededVec(key)
      for (let i = 0; i < DIM; i++) {
        const ui = u[i], ii = it[i]
        u[i] = ui + LR * weight * (ii - REG * ui)
        it[i] = ii + LR * weight * (ui - REG * ii)
      }
      ops.push({ updateOne: { filter: { key }, update: { $set: { key, kind: 'item', vec: it, updatedAt: now } }, upsert: true } })
    }
    ops.push({ updateOne: { filter: { key: userKey }, update: { $set: { key: userKey, kind: 'user', vec: u, updatedAt: now } }, upsert: true } })
    await col.bulkWrite(ops)
  } catch { /* best-effort */ }
}

// ── Anti-manipulación: confianza del voto + deduplicación ───────────────────
// Devuelve { repeat, trust }. repeat=true si el viewer ya votó ese post (no
// reentrena el modelo). trust∈[0,1] pondera la influencia del voto según
// ráfagas sospechosas, tipo de cuenta y antigüedad.
async function assessVote(viewerKey, postId, context = {}) {
  if (!viewerKey) return { repeat: false, trust: 0.5 }
  const now = new Date()
  const vlog = await getCollection('reco_votes_log')

  // ¿Voto repetido sobre el mismo post? (índice único viewerKey+postId)
  let repeat = false
  try {
    await vlog.insertOne({ viewerKey, postId, at: now })
  } catch (e) {
    if (e && e.code === 11000) repeat = true // ya existía → repetido
    else throw e
  }

  // Detección de ráfaga: nº de votos del viewer en la ventana reciente.
  let burst = 0
  try {
    const since = new Date(now.getTime() - BURST_WINDOW_S * 1000)
    burst = await vlog.countDocuments({ viewerKey, at: { $gt: since } })
  } catch { /* best-effort */ }

  // Confianza base: invitados algo menor; cuentas nuevas (<10 min) reducidas.
  let trust = viewerKey.startsWith('g:') ? 0.8 : 1.0
  if (typeof context.accountAgeMin === 'number' && context.accountAgeMin < 10) trust *= 0.6
  if (burst > BURST_LIMIT) trust *= 0.3            // ráfaga fuerte
  else if (burst > BURST_LIMIT / 2) trust *= 0.6   // ráfaga moderada

  return { repeat, trust: Math.max(0, Math.min(1, trust)) }
}

// ── Registro de voto: anti-manipulación + velocity + BPR + perfil + log ─────
export async function recordVote(post, side, viewerKey, context = {}) {
  if (!post || !post.id) return { repeat: false, trust: 0 }
  await ensureIndexes()
  const now = new Date()

  const { repeat, trust } = await assessVote(viewerKey, post.id, context)

  // 1) velocity EMA (trending) ponderada por confianza. Votos repetidos no suman.
  try {
    const stats = await getCollection('reco_item_stats')
    const doc = await stats.findOne({ id: post.id })
    const inc = repeat ? 0 : trust
    const newV = decayVelocity(doc?.velocity || 0, doc?.lastVoteAt, now.getTime()) + inc
    await stats.updateOne(
      { id: post.id },
      { $set: { velocity: newV, lastVoteAt: now }, $setOnInsert: { id: post.id, impressions: 0, firstSeenAt: now } },
      { upsert: true },
    )
  } catch { /* best-effort */ }

  // Aprendizaje SOLO con votos legítimos (no repetidos y con confianza mínima).
  const learn = viewerKey && !repeat && trust >= 0.4

  // 2) BPR pairwise + Elo: el lado votado GANA al otro
  const winUrl = side === 'a' ? (post.sideA?.videoUrl || post.videoUrl) : (post.sideB?.videoUrl || post.videoUrl)
  const loseUrl = side === 'a' ? (post.sideB?.videoUrl) : (post.sideA?.videoUrl)
  if (learn && winUrl && loseUrl) {
    try { await bprUpdate(viewerKey, winUrl, loseUrl) } catch { /* best-effort */ }
    try { await eloUpdate(winUrl, loseUrl, trust) } catch { /* best-effort */ }
  }

  // 3) Torre de contenido: perfil de afinidad (categorías + creadores).
  if (learn) {
    try {
      const winSideObj = side === 'a' ? post.sideA : post.sideB
      const loseSideObj = side === 'a' ? post.sideB : post.sideA
      await updateProfile(
        viewerKey,
        categoriesForSide(winSideObj || post),
        loseSideObj ? categoriesForSide(loseSideObj) : [],
        winSideObj?.author?.username || post.author?.username,
        loseSideObj?.author?.username,
      )
    } catch { /* best-effort */ }
  }

  // 4) log de interacción (para métricas offline / auditoría, y MEJORA B:
  //    cats/creator del lado GANADOR quedan grabados aquí mismo para poder
  //    calcular la intención a corto plazo sin volver a consultar el post).
  try {
    const inter = await getCollection('reco_interactions')
    const winSideObjLog = side === 'a' ? post.sideA : post.sideB
    await inter.insertOne({
      viewerKey: viewerKey || null, kind: 'vote', postId: post.id, side,
      winUrl: winUrl || null, loseUrl: loseUrl || null,
      cats: categoriesForSide(winSideObjLog || post),
      creator: winSideObjLog?.author?.username || post.author?.username || null,
      repeat, trust, hour: context.hour ?? new Date().getHours(), at: now,
    })
  } catch { /* best-effort */ }

  return { repeat, trust }
}

// ── Watch-time / completion: señal de retención por visualización ───────────
export async function recordWatch(post, { watchMs = 0, durationMs = 0, completed = false } = {}, viewerKey, context = {}) {
  const id = post?.id || post
  if (!id) return
  await ensureIndexes()
  const now = new Date()
  const ratio = durationMs > 0 ? Math.max(0, Math.min(1, watchMs / durationMs)) : (completed ? 1 : 0)
  const done = completed || ratio >= 0.9
  try {
    const stats = await getCollection('reco_item_stats')
    await stats.updateOne(
      { id },
      {
        $inc: {
          watchRatioSum: ratio, watchCount: 1, plays: 1, completes: done ? 1 : 0,
          // Señal negativa TikTok-style: skip rápido (<3s sin completar).
          skipsFast: (!done && watchMs > 0 && watchMs < 3000) ? 1 : 0,
        },
        $set: { lastWatchAt: now },
        $setOnInsert: { id, impressions: 0, velocity: 0, firstSeenAt: now },
      },
      { upsert: true },
    )
  } catch { /* best-effort */ }

  // Completar el vídeo es señal positiva suave para sus categorías.
  if (viewerKey && done && post && (post.sideA || post.sideB)) {
    try {
      const cats = categoriesForPost(post)
      const col = await getCollection('reco_profiles')
      const doc = (await col.findOne({ key: viewerKey })) || { cats: {}, creators: {}, n: 0 }
      const c = doc.cats || {}
      for (const cat of cats) c[cat] = (c[cat] || 0) + 0.25
      await col.updateOne({ key: viewerKey }, { $set: { key: viewerKey, cats: c, creators: doc.creators || {}, n: (doc.n || 0), updatedAt: now } }, { upsert: true })
    } catch { /* best-effort */ }
    // MEJORA D: completar un vídeo entero es una señal implícita real, aunque
    // más débil que guardar/compartir — pull suave de embeddings (sin negativo).
    embeddingPull(viewerKey, [post.sideA?.videoUrl, post.sideB?.videoUrl].filter(Boolean), 0.15).catch(() => {})
  }

  try {
    const inter = await getCollection('reco_interactions')
    // MEJORA B: cats/creator del post completo (ambos lados) para la señal de
    // intención a corto plazo — solo se usan cuando completed/done es true
    // (ver getShortTermSignal, ignora los "watch" sin terminar).
    await inter.insertOne({
      viewerKey: viewerKey || null, kind: 'watch', postId: id, ratio, completed: done,
      cats: post && (post.sideA || post.sideB) ? categoriesForPost(post) : [],
      creator: post?.author?.username || null,
      hour: context.hour ?? now.getHours(), at: now,
    })
  } catch { /* best-effort */ }
}

// ── TWYK ENGINE v2: señales sociales (guardar / comentar / compartir) ───────
// Cada acción social alimenta: (1) los contadores del post en reco_item_stats
// (entran en la calidad Q y en la promoción de oleadas), (2) el perfil de
// afinidad del viewer (categorías + creador), (3) el log de interacciones.
const ENGAGE_KINDS = {
  save:    { inc: { saves: 1 },    profile: 0.5 },
  unsave:  { inc: { saves: -1 },   profile: 0 },
  comment: { inc: { comments: 1 }, profile: 0.35 },
  share:   { inc: { shares: 1 },   profile: 0.7 },
}
export async function recordEngagement(post, kind, viewerKey, context = {}) {
  const id = post?.id || post
  const spec = ENGAGE_KINDS[kind]
  if (!id || !spec) return
  await ensureIndexes()
  const now = new Date()
  try {
    const stats = await getCollection('reco_item_stats')
    await stats.updateOne(
      { id },
      { $inc: spec.inc, $set: { lastEngageAt: now }, $setOnInsert: { id, impressions: 0, velocity: 0, firstSeenAt: now } },
      { upsert: true },
    )
  } catch { /* best-effort */ }

  // Afinidad de perfil (categorías + creador) para señales positivas.
  if (viewerKey && spec.profile > 0 && post && (post.sideA || post.sideB)) {
    try {
      const cats = categoriesForPost(post)
      const col = await getCollection('reco_profiles')
      const doc = (await col.findOne({ key: viewerKey })) || { cats: {}, creators: {}, n: 0 }
      const c = doc.cats || {}
      for (const cat of cats) c[cat] = (c[cat] || 0) + spec.profile
      const creators = doc.creators || {}
      const cr = post.author?.username
      if (cr) creators[cr] = (creators[cr] || 0) + spec.profile
      await col.updateOne(
        { key: viewerKey },
        { $set: { key: viewerKey, cats: c, creators, n: doc.n || 0, updatedAt: now } },
        { upsert: true },
      )
    } catch { /* best-effort */ }
    // MEJORA D: guardar/compartir/comentar SÍ alimentan ahora también el
    // modelo colaborativo (embeddings), no solo el perfil de categorías —
    // peso proporcional a la fuerza de la señal (spec.profile).
    embeddingPull(viewerKey, [post.sideA?.videoUrl, post.sideB?.videoUrl].filter(Boolean), spec.profile * 0.4).catch(() => {})
  }

  try {
    const inter = await getCollection('reco_interactions')
    // MEJORA B: cats/creator para la señal de intención a corto plazo.
    await inter.insertOne({
      viewerKey: viewerKey || null, kind, postId: id,
      cats: post && (post.sideA || post.sideB) ? categoriesForPost(post) : [],
      creator: post?.author?.username || null,
      hour: context.hour ?? now.getHours(), at: now,
    })
  } catch { /* best-effort */ }
}

// ── TWYK ENGINE v2: afinidad social directa (seguir / challenge) ────────────
// Seguir a alguien o retarle (challenge) es la declaración de interés más
// explícita que existe: sube fuerte la afinidad hacia ese creador en el
// perfil del viewer (sus batallas suben en el Para Ti vía `contentPart`).
export async function recordSocialAffinity(viewerKey, targetUsername, kind = 'follow') {
  if (!viewerKey || !targetUsername) return
  await ensureIndexes()
  const delta = kind === 'challenge' ? 2.5 : kind === 'unfollow' ? -2.0 : 2.0
  try {
    const col = await getCollection('reco_profiles')
    const doc = (await col.findOne({ key: viewerKey })) || { cats: {}, creators: {}, n: 0 }
    const creators = doc.creators || {}
    creators[targetUsername] = (creators[targetUsername] || 0) + delta
    await col.updateOne(
      { key: viewerKey },
      { $set: { key: viewerKey, cats: doc.cats || {}, creators, n: doc.n || 0, updatedAt: new Date() } },
      { upsert: true },
    )
  } catch { /* best-effort */ }
  try {
    const inter = await getCollection('reco_interactions')
    await inter.insertOne({ viewerKey, kind, target: targetUsername, at: new Date() })
  } catch { /* best-effort */ }
}

// ── MEJORA E: "No me interesa" (feedback negativo explícito) ───────────────
// Señal mucho más fuerte y rápida que un simple skip: el viewer NUNCA vuelve
// a ver ESTE post concreto en su Para Ti (getNotInterestedIds, filtrado en el
// endpoint /feed antes de rankear), y sus categorías/creador bajan de golpe en
// el perfil de afinidad — mismo mecanismo que "perder una batalla" pero sin
// necesitar un post rival.
export async function recordNotInterested(post, viewerKey) {
  const id = post?.id || post
  if (!id || !viewerKey) return
  await ensureIndexes()
  const now = new Date()
  try {
    const col = await getCollection('reco_not_interested')
    await col.updateOne({ viewerKey, postId: id }, { $set: { viewerKey, postId: id, at: now } }, { upsert: true })
  } catch { /* best-effort */ }
  if (post && (post.sideA || post.sideB || post.author)) {
    try {
      const cats = categoriesForPost(post)
      const col = await getCollection('reco_profiles')
      const doc = (await col.findOne({ key: viewerKey })) || { cats: {}, creators: {}, n: 0 }
      const c = doc.cats || {}
      for (const cat of cats) c[cat] = (c[cat] || 0) - 1.5
      const creators = doc.creators || {}
      const cr = post.author?.username
      if (cr) creators[cr] = (creators[cr] || 0) - 1.0
      await col.updateOne({ key: viewerKey }, { $set: { key: viewerKey, cats: c, creators, n: doc.n || 0, updatedAt: now } }, { upsert: true })
    } catch { /* best-effort */ }
  }
  try {
    const inter = await getCollection('reco_interactions')
    await inter.insertOne({ viewerKey, kind: 'not_interested', postId: id, at: now })
  } catch { /* best-effort */ }
}

// Ids de publicaciones marcadas "No me interesa" por este viewer — se
// excluyen de los candidatos del feed Para Ti ANTES de rankear (ver /api/feed
// en route.js). NO afecta a la página "Siguiendo" (cronológica/explícita) ni
// al grid del perfil.
export async function getNotInterestedIds(viewerKey) {
  if (!viewerKey) return new Set()
  try {
    const col = await getCollection('reco_not_interested')
    const docs = await col.find({ viewerKey }).project({ postId: 1 }).limit(5000).toArray()
    return new Set(docs.map((d) => d.postId))
  } catch {
    return new Set()
  }
}

// ── Perfil de afinidad (content-based tower) ────────────────────────────────
async function updateProfile(viewerKey, winCats, loseCats, winCreator, loseCreator) {
  if (!viewerKey) return
  const col = await getCollection('reco_profiles')
  const doc = (await col.findOne({ key: viewerKey })) || { cats: {}, creators: {}, n: 0 }
  const cats = doc.cats || {}
  const creators = doc.creators || {}
  const DECAY = 0.995 // olvido suave: las preferencias evolucionan con el tiempo
  for (const k in cats) cats[k] *= DECAY
  for (const k in creators) creators[k] *= DECAY
  for (const c of (winCats || [])) cats[c] = (cats[c] || 0) + 1
  for (const c of (loseCats || [])) cats[c] = (cats[c] || 0) - 0.4
  if (winCreator) creators[winCreator] = (creators[winCreator] || 0) + 1.2
  if (loseCreator) creators[loseCreator] = (creators[loseCreator] || 0) - 0.3
  await col.updateOne(
    { key: viewerKey },
    { $set: { key: viewerKey, cats, creators, n: (doc.n || 0) + 1, updatedAt: new Date() } },
    { upsert: true },
  )
}

export async function getProfile(viewerKey) {
  if (!viewerKey) return null
  try {
    const col = await getCollection('reco_profiles')
    return await col.findOne({ key: viewerKey })
  } catch {
    return null
  }
}

// ── Registro de impresiones (anti-fatiga + denominador de engagement) ───────
export async function recordImpressions(ids, viewerKey, startPos = 0) {
  if (!Array.isArray(ids) || ids.length === 0) return
  await ensureIndexes()
  const now = new Date()
  try {
    const stats = await getCollection('reco_item_stats')
    const ops = ids.map((id) => ({
      updateOne: {
        filter: { id },
        update: { $inc: { impressions: 1 }, $set: { lastSeenAt: now }, $setOnInsert: { id, firstSeenAt: now, velocity: 0 } },
        upsert: true,
      },
    }))
    if (ops.length) await stats.bulkWrite(ops)
  } catch { /* best-effort */ }

  if (viewerKey) {
    try {
      const imp = await getCollection('reco_impressions')
      // pos = ranking global servido (para métricas NDCG@K).
      await imp.insertMany(ids.map((id, i) => ({ viewerKey, id, pos: startPos + i, at: now })), { ordered: false })
    } catch { /* best-effort */ }
  }
}

async function getRecentImpressions(viewerKey, withinMin = 60) {
  if (!viewerKey) return new Set()
  try {
    const imp = await getCollection('reco_impressions')
    const since = new Date(Date.now() - withinMin * 60000)
    const docs = await imp.find({ viewerKey, at: { $gt: since } }).project({ id: 1 }).toArray()
    return new Set(docs.map((d) => d.id))
  } catch {
    return new Set()
  }
}

// ── TWYK ENGINE v2: sets de supresión (no-repetición real) ──────────────────
// hour: impreso en la última hora → se sirve AL FONDO (no-visto primero).
// week: Map(postId → nº de impresiones esta semana) → FATIGA PROGRESIVA:
// cuantas más veces viste un post, más se hunde (el top ROTA entre refreshes
// en vez de quedarse congelado en el mejor post).
async function getSeenSets(viewerKey) {
  const out = { hour: new Set(), week: new Map() }
  if (!viewerKey) return out
  try {
    const imp = await getCollection('reco_impressions')
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const docs = await imp.find({ viewerKey, at: { $gt: since } })
      .project({ id: 1, at: 1 }).sort({ at: -1 }).limit(8000).toArray()
    const hourAgo = Date.now() - 3600 * 1000
    for (const d of docs) {
      out.week.set(d.id, (out.week.get(d.id) || 0) + 1)
      if (new Date(d.at).getTime() > hourAgo) out.hour.add(d.id)
    }
  } catch { /* best-effort */ }
  return out
}

// Posts que el viewer YA votó → prácticamente fuera del feed (×0.15).
async function getVotedSet(viewerKey) {
  if (!viewerKey) return new Set()
  try {
    const vlog = await getCollection('reco_votes_log')
    const docs = await vlog.find({ viewerKey }).project({ postId: 1 }).limit(5000).toArray()
    return new Set(docs.map((d) => d.postId))
  } catch {
    return new Set()
  }
}

// ── MEJORA B: intención a CORTO PLAZO (sesión actual) ───────────────────────
// El perfil de afinidad (reco_profiles) evoluciona muy despacio a propósito
// (decay 0.995 por interacción) — refleja gustos de FONDO, no lo que el
// viewer está haciendo AHORA MISMO. Esta señal aparte cae rápido por TIEMPO
// (vida media ~9 min, no por nº de eventos), para que el feed reaccione EN
// CALIENTE a la sesión actual sin contaminar el perfil permanente.
const SHORT_TERM_WINDOW_MIN = 30
const SHORT_TERM_HALF_LIFE_MIN = 9
async function getShortTermSignal(viewerKey) {
  const out = { cats: {}, creators: {} }
  if (!viewerKey) return out
  try {
    const col = await getCollection('reco_interactions')
    const since = new Date(Date.now() - SHORT_TERM_WINDOW_MIN * 60000)
    const docs = await col.find({
      viewerKey, at: { $gt: since },
      kind: { $in: ['vote', 'watch', 'save', 'share', 'comment'] },
    }).sort({ at: -1 }).limit(60).toArray()
    const now = Date.now()
    const decayRate = Math.log(2) / SHORT_TERM_HALF_LIFE_MIN
    for (const d of docs) {
      if (d.kind === 'watch' && !d.completed) continue // ver sin terminar no es señal positiva
      const ageMin = (now - new Date(d.at).getTime()) / 60000
      const w = Math.exp(-decayRate * ageMin)
      for (const cat of (d.cats || [])) out.cats[cat] = (out.cats[cat] || 0) + w
      if (d.creator) out.creators[d.creator] = (out.creators[d.creator] || 0) + w
    }
  } catch { /* best-effort */ }
  return out
}

// ── MEJORA C: diversidad ENTRE páginas del mismo scroll ─────────────────────
// El re-ranking (stochasticReRank) solo evita repetir creador/categoría
// DENTRO de la página que está construyendo. Estas son las últimas
// impresiones REALES servidas (justo antes de la página actual), usadas para
// sembrar esa regla y que no se olvide al cruzar la frontera de página.
async function getRecentImpressionIds(viewerKey, n = 3) {
  if (!viewerKey) return []
  try {
    const imp = await getCollection('reco_impressions')
    const docs = await imp.find({ viewerKey }).project({ id: 1 }).sort({ at: -1 }).limit(n).toArray()
    return docs.map((d) => d.id)
  } catch {
    return []
  }
}

// ── TWYK ENGINE v2: serving estocástico (Plackett-Luce / softmax sampling) ──
// En vez de ordenar determinísticamente por score (que congela el top cuando
// hay pocos candidatos), cada posición se SORTEA con probabilidad
// proporcional a score^(1/T). El mejor contenido sale arriba a menudo pero no
// siempre → recompensa variable real en cada refresh, sin sacrificar calidad.
// La diversidad (creador/categoría repetidos) penaliza MULTIPLICATIVAMENTE
// (proporcional al score, no en valor absoluto como el MMR clásico, que con
// scores pequeños imponía un patrón fijo de rotación de autores).
function stochasticReRank(scored, { seed = 0, temperature = 0.7, seedCreators = [], seedCats = [] } = {}) {
  const rng = mulberry32(seed)
  const pool = scored.slice()
  const out = []
  // MEJORA C: sembrado con lo último mostrado en la página ANTERIOR del
  // mismo scroll (ver rankFeed) — vacío en la primera página (cursor=0).
  const recentCreators = seedCreators.slice(0, 2)
  let recentCats = seedCats.slice(0, 4)

  while (pool.length) {
    let total = 0
    const weights = pool.map((c) => {
      let s = Math.max(c.score, 1e-6)
      const cr = c.post.author?.username
      if (cr && recentCreators.includes(cr)) s *= 0.55
      const cats = c.post._cats || []
      if (cats.some((x) => recentCats.includes(x))) s *= 0.8
      const w = Math.pow(s, 1 / temperature)
      total += w
      return w
    })
    let r = rng() * total
    let idx = 0
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break } }
    const chosen = pool.splice(idx, 1)[0]
    out.push(chosen)
    const cr = chosen.post.author?.username
    if (cr) { recentCreators.unshift(cr); if (recentCreators.length > 2) recentCreators.pop() }
    recentCats = [...(chosen.post._cats || []), ...recentCats].slice(0, 4)
  }
  return out
}

// ── Re-ranking multi-objetivo (MMR diversidad + epsilon-greedy exploración) ─
function mmrReRank(scored, { epsilon = 0.15, seed = 0 } = {}) {
  const rng = mulberry32(seed)
  const pool = scored.slice()
  const out = []
  const recentCreators = []
  let recentCats = []

  while (pool.length) {
    let idx = 0
    if (rng() < epsilon) {
      // EXPLORACIÓN: prioriza items con menos impresiones (cold-start / fairness)
      let best = -Infinity, bi = 0
      for (let i = 0; i < pool.length; i++) {
        const s = 1 / (1 + (pool[i].dbg.imp || 0))
        if (s > best) { best = s; bi = i }
      }
      idx = bi
    } else {
      // EXPLOTACIÓN con penalización de diversidad (creador + categoría)
      let bestS = -Infinity, bi = 0
      const look = Math.min(pool.length, 40)
      for (let i = 0; i < look; i++) {
        const c = pool[i]
        let pen = 0
        const cr = c.post.author?.username
        if (cr && recentCreators.includes(cr)) pen += 0.25
        const cats = c.post._cats || []
        if (cats.some((x) => recentCats.includes(x))) pen += 0.12
        const eff = c.score - pen
        if (eff > bestS) { bestS = eff; bi = i }
      }
      idx = bi
    }
    const chosen = pool.splice(idx, 1)[0]
    out.push(chosen)
    const cr = chosen.post.author?.username
    if (cr) { recentCreators.unshift(cr); if (recentCreators.length > 3) recentCreators.pop() }
    const cats = chosen.post._cats || []
    recentCats = [...cats, ...recentCats].slice(0, 6)
  }
  return out
}

// ── Ranking principal ───────────────────────────────────────────────────────
export async function rankFeed(candidates, { viewerKey, context = {}, limit = 8, cursor = 0 } = {}) {
  await ensureIndexes()
  const now = Date.now()
  let list = (candidates || []).filter((c) => c && c.id)
  if (list.length === 0) return { items: [], total: 0 }

  // ── ETAPA DE RECUPERACIÓN (ANN): a gran escala, prefiltra por similitud de
  //    embeddings antes del ranking pesado. A pequeña escala se omite (exacto).
  if (viewerKey && list.length > ANN_THRESHOLD) {
    try {
      const vecColR = await getCollection('reco_vectors')
      const uDoc = await vecColR.findOne({ key: viewerKey })
      if (uDoc?.vec) {
        const itemVideoDocs = await vecColR.find({ kind: 'item' }).toArray()
        const vmap = {}; for (const d of itemVideoDocs) vmap[d.key] = d.vec
        const battleVecs = list.map((c) => {
          const ea = vmap[c.sideA?.videoUrl], eb = vmap[c.sideB?.videoUrl]
          let vec = null
          if (ea && eb) vec = ea.map((x, i) => (x + eb[i]) / 2)
          else vec = ea || eb || null
          return vec ? { key: c.id, vec } : null
        }).filter(Boolean)
        const retr = (battleVecs.length > 2000 ? lshTopK : cosineTopK)(uDoc.vec, battleVecs, Math.max(limit * 12, 300))
        const keep = new Set(retr.map((r) => r.key))
        // Conserva siempre algo de exploración (items recientes/poco vistos).
        const filtered = list.filter((c) => keep.has(c.id))
        if (filtered.length >= limit) list = filtered
      }
    } catch { /* fallback: ranking exacto sobre todo el pool */ }
  }

  const ids = list.map((c) => c.id)

  // Cargar stats, vectores e impresiones recientes (anti-fatiga) en paralelo.
  const videoKeys = new Set()
  for (const c of list) {
    if (c.sideA?.videoUrl) videoKeys.add(c.sideA.videoUrl)
    if (c.sideB?.videoUrl) videoKeys.add(c.sideB.videoUrl)
  }
  const wantVecKeys = [...videoKeys]
  if (viewerKey) wantVecKeys.push(viewerKey)

  const statsCol = await getCollection('reco_item_stats')
  const vecCol = await getCollection('reco_vectors')
  const profCol = await getCollection('reco_profiles')
  const eloCol = await getCollection('reco_elo')

  const [statDocs, vecDocs, seen, profDoc, eloDocs, votedSet, W, salt, shortTerm, recentImpIds] = await Promise.all([
    statsCol.find({ id: { $in: ids } }).toArray(),
    vecCol.find({ key: { $in: wantVecKeys } }).toArray(),
    getSeenSets(viewerKey),
    viewerKey ? profCol.findOne({ key: viewerKey }) : Promise.resolve(null),
    eloCol.find({ key: { $in: [...videoKeys] } }).toArray(),
    getVotedSet(viewerKey),
    getWeights(),
    getSessionSalt(viewerKey, cursor),
    // MEJORA B: intención a corto plazo (sesión actual, ver getShortTermSignal).
    getShortTermSignal(viewerKey),
    // MEJORA C: últimas impresiones reales servidas (solo relevante si cursor>0,
    // para sembrar la diversidad de la SIGUIENTE página del mismo scroll).
    cursor > 0 ? getRecentImpressionIds(viewerKey, 3) : Promise.resolve([]),
  ])

  // MEJORA A: intereses elegidos en el registro (POST /api/profile/interests,
  // pasados por el endpoint /feed en context.interests). Bootstrap del
  // cold-start: mientras el perfil APRENDIDO (profDoc) todavía es pequeño, se
  // usa lo que el usuario declaró explícitamente al registrarse; a medida que
  // vota/interactúa de verdad, este bootstrap se apaga solo (ver interestW).
  const declaredInterests = new Set((context.interests || []).map((s) => String(s).toLowerCase()))

  const stats = {}; for (const d of statDocs) stats[d.id] = d
  const vecs = {}; for (const d of vecDocs) vecs[d.key] = d.vec
  const elos = {}; for (const d of eloDocs) elos[d.key] = d.rating
  const uvec = viewerKey ? (vecs[viewerKey] || null) : null
  const uNorm = uvec ? Math.sqrt(uvec.reduce((s, x) => s + x * x, 0)) || 1 : 1

  // Cold-start de USUARIO: el peso de personalización crece con su historial
  // (~30 votos para peso pleno); el sobrante refuerza la calidad global.
  const profN = profDoc?.n || 0
  const persW = W.pers * Math.min(1, profN / 30)
  const qW = W.q + (W.pers - persW)

  // Autores que el viewer sigue (los pasa el endpoint /feed en context).
  const followingSet = context.following instanceof Set
    ? context.following
    : new Set(context.following || [])

  const scored = list.map((c) => {
    c._cats = categoriesForPost(c)
    const st = stats[c.id] || {}
    const a = c.votes?.a || 0, b = c.votes?.b || 0, tot = a + b
    const imp = st.impressions || 0
    const completes = st.completes || 0

    // RNG determinista por (salt de sesión, item): el orden cambia en cada
    // refresh (salt nueva) pero es estable entre páginas del mismo scroll.
    const rng = mulberry32(hashSeed(salt + '|' + c.id))

    // 1) CALIDAD — Thompson Sampling sobre posterior Beta.
    //    éxitos = votos + completions + guardados + compartidos + comentarios
    //    (jerarquía de pesos del design doc); fracasos = impresiones sin acción.
    //    Item nuevo (0 imp) → Beta(1,1) ancha → exploración natural.
    const saves = Math.max(0, st.saves || 0)
    const shares = Math.max(0, st.shares || 0)
    const commentsN = Math.max(0, st.comments || 0)
    const posE = tot + 0.6 * completes + 1.2 * saves + 1.5 * shares + 0.8 * commentsN
    const Q = sampleBeta(1 + posE, 1 + Math.max(0, imp - posE), rng)

    // 2) ELO pairwise de los vídeos de la batalla (calidad probada cara a cara).
    const eloA = elos[c.sideA?.videoUrl]
    const eloB = elos[c.sideB?.videoUrl]
    const eloVals = [eloA, eloB].filter((x) => typeof x === 'number')
    const eloAvg = eloVals.length ? eloVals.reduce((s, x) => s + x, 0) / eloVals.length : 1500
    const E = 1 / (1 + Math.exp(-(eloAvg - 1500) / 200))

    // 3) FRESCURA — gravedad estilo Hacker News, normalizada a 1 en t=0.
    const ts = c.createdAtMs || (c.uploadedAt ? new Date(c.uploadedAt).getTime() : 0)
    const ageH = ts ? Math.max(0, (now - ts) / 3.6e6) : 24
    const G = Math.pow(2 / (ageH + 2), 1.4)

    // 4) VELOCITY (trending, EMA decaído) — la primera hora es la crítica.
    const vel = decayVelocity(st.velocity || 0, st.lastVoteAt, now)
    const V = Math.min(1, Math.log1p(vel) / Math.log1p(30))

    // 5) COMPETITIVIDAD: batallas reñidas enganchan más (señal única de TWYK).
    const share = tot > 0 ? a / tot : 0.5
    const comp = 1 - Math.abs(share - 0.5) * 2

    // 5) Personalización híbrida (Two-Tower):
    //    a) Torre colaborativa (BPR): coseno usuario↔batalla en espacio embeddings.
    //    b) Torre de contenido: afinidad por categorías + creador del perfil.
    let embPart = null
    if (uvec) {
      const ea = vecs[c.sideA?.videoUrl]
      const eb = vecs[c.sideB?.videoUrl]
      let cos = 0, cnt = 0
      for (const e of [ea, eb]) {
        if (e) {
          let dot = 0, en = 0
          for (let i = 0; i < DIM; i++) { dot += uvec[i] * e[i]; en += e[i] * e[i] }
          en = Math.sqrt(en) || 1
          cos += dot / (uNorm * en); cnt++
        }
      }
      if (cnt > 0) { cos /= cnt; embPart = 1 / (1 + Math.exp(-cos * 5)) }
    }
    let contentPart = null
    let interestHit = false
    if (profDoc || declaredInterests.size) {
      const pc = profDoc?.cats || {}
      let catRaw = 0, cnt = 0
      for (const cat of c._cats) { catRaw += (pc[cat] || 0); cnt++ }
      catRaw = cnt ? catRaw / cnt : 0
      // MEJORA A: boost de intereses declarados, con peso que se APAGA solo
      // a medida que el perfil aprendido crece (profN) — pleno en profN=0,
      // fuera a partir de ~10 interacciones reales.
      interestHit = c._cats.some((cat) => declaredInterests.has(cat))
      const interestW = Math.max(0, 1 - profN / 10)
      const boostedCatRaw = catRaw + (interestHit ? interestW * 2.5 : 0)
      const creRaw = (profDoc?.creators || {})[c.author?.username] || 0
      const combined = 0.6 * boostedCatRaw + 0.4 * creRaw
      contentPart = 1 / (1 + Math.exp(-combined / 3))
    }
    let pers = 0.5
    if (embPart != null && contentPart != null) pers = 0.4 * embPart + 0.6 * contentPart
    else if (contentPart != null) pers = contentPart
    else if (embPart != null) pers = embPart

    // 7) OLEADA de distribución (TikTok-style): boost semilla / throttle.
    const wv = waveMultiplier(st, posE)

    // 8) PENALIZACIONES multiplicativas:
    //    neg  = skips rápidos (la señal negativa nº1)
    //    seen = FATIGA PROGRESIVA: cada impresión de esta semana hunde el post
    //           un 28% más (0.72^n). Así el mejor post NO monopoliza el top:
    //           tras verlo 2-3 veces cae y el top rota (recompensa variable).
    //    voted= ya votado por este viewer → prácticamente fuera
    const neg = 1 - 0.6 * wilson(Math.min(st.skipsFast || 0, Math.max(imp, 1)), Math.max(imp, 1))
    const weekViews = seen.week.get(c.id) || 0
    const seenPen = Math.max(0.04, Math.pow(0.72, weekViews))
    const votedPen = votedSet.has(c.id) ? 0.15 : 1

    // 9) BOOST SOCIAL: batallas de autores que sigues suben en el Para Ti
    //    (sin dominarlo — el feed "Siguiendo" explícito sigue siendo aparte).
    const followBoost = followingSet.has(c.author?.username) ? 1.20 : 1

    // 10) MEJORA B — INTENCIÓN A CORTO PLAZO (sesión actual): boost acotado
    //     (+35% máx) para contenido de categorías/creadores con los que el
    //     viewer interactuó de verdad en los últimos ~30 min (caída rápida,
    //     vida media ~9 min — ver getShortTermSignal). El perfil de largo
    //     plazo (profDoc, arriba) reacciona muy despacio a propósito; esto
    //     hace que el feed también responda EN CALIENTE, sin contaminar ese
    //     perfil permanente.
    let shortBoost = 1
    if (shortTerm && (Object.keys(shortTerm.cats).length || Object.keys(shortTerm.creators).length)) {
      let s = 0
      for (const cat of c._cats) s += (shortTerm.cats[cat] || 0)
      s += (shortTerm.creators[c.author?.username] || 0) * 1.5
      shortBoost = 1 + Math.min(0.35, s * 0.06)
    }

    // 11) JITTER de variabilidad (±15%, determinista por salt de sesión):
    //     rompe empates y garantiza que cada refresh se sienta distinto sin
    //     hundir contenido claramente superior.
    const jitter = 0.85 + 0.3 * rng()

    // SCORE FINAL (pesos configurables en reco_config, doc key='weights').
    const base = qW * Q + W.elo * E + W.rec * G + W.vel * V + persW * pers + W.comp * comp
    const score = base * wv.mult * neg * seenPen * votedPen * followBoost * shortBoost * jitter

    return {
      post: c,
      score,
      dbg: {
        Q: +Q.toFixed(3), elo: Math.round(eloAvg), G: +G.toFixed(3), V: +V.toFixed(3),
        pers: +pers.toFixed(3), comp: +comp.toFixed(3), wave: wv.wave,
        throttled: !!wv.throttled, neg: +neg.toFixed(3),
        seen: weekViews, voted: votedPen < 1, following: followBoost > 1,
        short: shortBoost > 1, interest: interestHit,
        social: { saves, shares, comments: commentsN }, imp, votes: tot,
      },
    }
  })

  scored.sort((x, y) => y.score - x.score)

  // MEJORA C — diversidad ENTRE páginas del mismo scroll: el re-ranking
  // estocástico solo evita repetir creador/categoría DENTRO de la página que
  // está construyendo; al cambiar de página (mismo scroll, cursor>0) se
  // olvidaba de lo último mostrado. Se siembra con las ÚLTIMAS impresiones
  // REALES servidas justo antes (recentImpIds), así la regla de "no repetir
  // seguido" no se resetea al cruzar la frontera de página. cursor=0
  // (refresh) NO hereda nada de un scroll anterior (empieza limpio).
  let seedCreators = [], seedCats = []
  if (cursor > 0 && recentImpIds.length) {
    const byId = new Map(scored.map((s) => [s.post.id, s]))
    for (const rid of recentImpIds) {
      const s = byId.get(rid)
      if (!s) continue
      if (s.post.author?.username) seedCreators.push(s.post.author.username)
      seedCats.push(...(s.post._cats || []))
    }
  }

  // Serving estocástico (Plackett-Luce): cada posición se sortea proporcional
  // a la calidad. La seed depende de la salt de sesión → cada refresh produce
  // un orden genuinamente distinto (incluido el nº1), estable entre páginas
  // del mismo scroll. Temperatura configurable en reco_config (weights.temp).
  const ranked = stochasticReRank(scored, { seed: hashSeed(salt), temperature: W.temp || 0.7, seedCreators, seedCats })

  // SERVING "no visto primero": lo impreso en la última hora se recicla AL
  // FONDO; solo reaparece cuando no queda contenido fresco.
  const fresh = ranked.filter((r) => !seen.hour.has(r.post.id))
  const recycled = ranked.filter((r) => seen.hour.has(r.post.id))
  const ordered = [...fresh, ...recycled]

  // Paginación con wrap (scroll infinito). El cliente deduplica por id.
  const N = ordered.length
  const startIdx = (((cursor % N) + N) % N)
  const items = []
  for (let k = 0; k < limit; k++) items.push(ordered[(startIdx + k) % N])

  return { items, total: N }
}

// ── Métricas de calidad del recomendador (NDCG@K, AUC pairwise, CTR, watch) ─
export async function computeMetrics({ k = 10, sampleVotes = 2000 } = {}) {
  await ensureIndexes()
  const interCol = await getCollection('reco_interactions')
  const vecCol = await getCollection('reco_vectors')
  const statsCol = await getCollection('reco_item_stats')
  const impCol = await getCollection('reco_impressions')

  // ── AUC pairwise (offline): ¿el modelo puntúa al ganador por encima del
  //    perdedor para el usuario que votó? Usa los embeddings actuales.
  const votes = await interCol.find({ kind: 'vote', repeat: { $ne: true }, winUrl: { $ne: null }, loseUrl: { $ne: null }, viewerKey: { $ne: null } })
    .sort({ at: -1 }).limit(sampleVotes).toArray()
  const keys = new Set()
  for (const v of votes) { keys.add(v.viewerKey); keys.add(v.winUrl); keys.add(v.loseUrl) }
  const vecDocs = await vecCol.find({ key: { $in: [...keys] } }).toArray()
  const vmap = {}; for (const d of vecDocs) vmap[d.key] = d.vec
  const dot = (a, b) => { if (!a || !b) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
  let correct = 0, ties = 0, evaluable = 0
  for (const v of votes) {
    const u = vmap[v.viewerKey], w = vmap[v.winUrl], l = vmap[v.loseUrl]
    if (!u || !w || !l) continue
    evaluable++
    const sw = dot(u, w), sl = dot(u, l)
    if (sw > sl) correct++
    else if (sw === sl) ties++
  }
  const auc = evaluable > 0 ? (correct + 0.5 * ties) / evaluable : null

  // ── NDCG@K: sobre las impresiones servidas (ordenadas por pos), relevancia=1
  //    si el viewer votó ese item. Promedio por viewer con ≥1 voto.
  const votedByViewer = {}
  const allVotes = await interCol.find({ kind: 'vote', viewerKey: { $ne: null } }).project({ viewerKey: 1, postId: 1 }).toArray()
  for (const v of allVotes) { (votedByViewer[v.viewerKey] ||= new Set()).add(v.postId) }
  const imps = await impCol.find({}).sort({ at: -1 }).limit(20000).toArray()
  const byViewer = {}
  for (const im of imps) { (byViewer[im.viewerKey] ||= []).push(im) }
  let ndcgSum = 0, ndcgN = 0
  const idcgCache = (rels) => { const s = [...rels].sort((a, b) => b - a); let v = 0; for (let i = 0; i < s.length; i++) v += s[i] / Math.log2(i + 2); return v || 1 }
  for (const vk in byViewer) {
    const voted = votedByViewer[vk]
    if (!voted || voted.size === 0) continue
    const seen = byViewer[vk].sort((a, b) => (a.pos || 0) - (b.pos || 0)).slice(0, k)
    if (seen.length === 0) continue
    const rels = seen.map((im) => (voted.has(im.id) ? 1 : 0))
    if (rels.every((r) => r === 0)) continue
    let dcg = 0; for (let i = 0; i < rels.length; i++) dcg += rels[i] / Math.log2(i + 2)
    ndcgSum += dcg / idcgCache(rels); ndcgN++
  }
  const ndcg = ndcgN > 0 ? ndcgSum / ndcgN : null

  // ── CTR (votes/impresiones), watch y exploración (cobertura del catálogo).
  const agg = await statsCol.aggregate([{
    $group: {
      _id: null,
      impressions: { $sum: '$impressions' },
      plays: { $sum: '$plays' },
      completes: { $sum: '$completes' },
      watchRatioSum: { $sum: '$watchRatioSum' },
      watchCount: { $sum: '$watchCount' },
      items: { $sum: 1 },
      shown: { $sum: { $cond: [{ $gt: ['$impressions', 0] }, 1, 0] } },
    },
  }]).toArray()
  const a0 = agg[0] || {}
  const totalVotes = await interCol.countDocuments({ kind: 'vote' })
  const ctr = a0.impressions > 0 ? totalVotes / a0.impressions : null
  const completionRate = a0.plays > 0 ? a0.completes / a0.plays : null
  const avgWatchRatio = a0.watchCount > 0 ? a0.watchRatioSum / a0.watchCount : null
  const coverage = a0.items > 0 ? a0.shown / a0.items : null

  return {
    generatedAt: new Date().toISOString(),
    auc: auc != null ? +auc.toFixed(4) : null,
    aucSamples: evaluable,
    ndcgAtK: ndcg != null ? +ndcg.toFixed(4) : null,
    ndcgViewers: ndcgN,
    k,
    ctr: ctr != null ? +ctr.toFixed(4) : null,
    completionRate: completionRate != null ? +completionRate.toFixed(4) : null,
    avgWatchRatio: avgWatchRatio != null ? +avgWatchRatio.toFixed(4) : null,
    catalogCoverage: coverage != null ? +coverage.toFixed(4) : null,
    totals: {
      impressions: a0.impressions || 0,
      votes: totalVotes,
      plays: a0.plays || 0,
      items: a0.items || 0,
      userVectors: await vecCol.countDocuments({ kind: 'user' }),
      itemVectors: await vecCol.countDocuments({ kind: 'item' }),
      profiles: await (await getCollection('reco_profiles')).countDocuments(),
    },
    ann: { dim: DIM, threshold: ANN_THRESHOLD, ready: true },
  }
}

export default { rankFeed, recordVote, recordWatch, recordImpressions, recordEngagement, recordSocialAffinity, recordNotInterested, getNotInterestedIds, bprUpdate, categoriesForPost, categoriesForSide, computeMetrics }
