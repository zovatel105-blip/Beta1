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

  // 2) BPR pairwise: el lado votado GANA al otro
  const winUrl = side === 'a' ? (post.sideA?.videoUrl || post.videoUrl) : (post.sideB?.videoUrl || post.videoUrl)
  const loseUrl = side === 'a' ? (post.sideB?.videoUrl) : (post.sideA?.videoUrl)
  if (learn && winUrl && loseUrl) {
    try { await bprUpdate(viewerKey, winUrl, loseUrl) } catch { /* best-effort */ }
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

  // 4) log de interacción (para métricas offline / auditoría)
  try {
    const inter = await getCollection('reco_interactions')
    await inter.insertOne({
      viewerKey: viewerKey || null, kind: 'vote', postId: post.id, side,
      winUrl: winUrl || null, loseUrl: loseUrl || null,
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
        $inc: { watchRatioSum: ratio, watchCount: 1, plays: 1, completes: done ? 1 : 0 },
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
  }

  try {
    const inter = await getCollection('reco_interactions')
    await inter.insertOne({ viewerKey: viewerKey || null, kind: 'watch', postId: id, ratio, completed: done, hour: context.hour ?? now.getHours(), at: now })
  } catch { /* best-effort */ }
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

  const [statDocs, vecDocs, fatigue, profDoc] = await Promise.all([
    statsCol.find({ id: { $in: ids } }).toArray(),
    vecCol.find({ key: { $in: wantVecKeys } }).toArray(),
    getRecentImpressions(viewerKey, 60),
    viewerKey ? profCol.findOne({ key: viewerKey }) : Promise.resolve(null),
  ])

  const stats = {}; for (const d of statDocs) stats[d.id] = d
  const vecs = {}; for (const d of vecDocs) vecs[d.key] = d.vec
  const uvec = viewerKey ? (vecs[viewerKey] || null) : null
  const uNorm = uvec ? Math.sqrt(uvec.reduce((s, x) => s + x * x, 0)) || 1 : 1

  const scored = list.map((c) => {
    c._cats = categoriesForPost(c)
    const st = stats[c.id] || {}
    const a = c.votes?.a || 0, b = c.votes?.b || 0, tot = a + b
    const imp = st.impressions || 0

    // 1) Engagement: Wilson(votos, impresiones) cuando hay datos; si no, prior de popularidad.
    let eng
    if (imp >= 10) eng = wilson(Math.min(tot, imp), imp)
    else eng = Math.min(1, Math.log1p(tot) / Math.log1p(3000))

    // 2) Competitividad: batallas reñidas enganchan más.
    const share = tot > 0 ? a / tot : 0.5
    const comp = 1 - Math.abs(share - 0.5) * 2

    // 3) Velocity (trending) — EMA decaído.
    const vel = decayVelocity(st.velocity || 0, st.lastVoteAt, now)
    const velS = Math.min(1, Math.log1p(vel) / Math.log1p(50))

    // 4) Recency.
    const ageH = c.createdAtMs ? (now - c.createdAtMs) / 3.6e6 : 24
    const rec = 1 / Math.pow(ageH / 12 + 1, 1.2)

    // 4b) Watch-time / completion: retención por visualización.
    const plays = st.plays || 0
    const completes = st.completes || 0
    const avgRatio = st.watchCount > 0 ? (st.watchRatioSum || 0) / st.watchCount : 0
    let watch = 0.5 // prior neutral cuando no hay datos de visualización
    if (plays >= 3) watch = 0.5 * avgRatio + 0.5 * wilson(completes, plays)
    else if (st.watchCount > 0) watch = avgRatio

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
    if (profDoc) {
      const pc = profDoc.cats || {}
      let catRaw = 0, cnt = 0
      for (const cat of c._cats) { catRaw += (pc[cat] || 0); cnt++ }
      catRaw = cnt ? catRaw / cnt : 0
      const creRaw = (profDoc.creators || {})[c.author?.username] || 0
      const combined = 0.6 * catRaw + 0.4 * creRaw
      contentPart = 1 / (1 + Math.exp(-combined / 3))
    }
    let pers = 0.5
    if (embPart != null && contentPart != null) pers = 0.4 * embPart + 0.6 * contentPart
    else if (contentPart != null) pers = contentPart
    else if (embPart != null) pers = embPart

    // Pesos multi-objetivo: personalización dominante (estilo TikTok), con
    // engagement, watch-time, competitividad y trending como soporte.
    let score = 0.22 * eng + 0.14 * comp + 0.16 * velS + 0.07 * rec + 0.30 * pers + 0.11 * watch

    // Fairness: oportunidad a batallas poco vistas (cold-start del item).
    const fairness = imp < 5 ? 0.08 * (1 - imp / 5) : 0
    score += fairness

    // Anti-fatiga: penaliza (no excluye) lo visto recientemente por este viewer.
    if (fatigue.has(c.id)) score *= 0.45

    return { post: c, score, dbg: { eng: +eng.toFixed(3), comp: +comp.toFixed(3), velS: +velS.toFixed(3), rec: +rec.toFixed(3), pers: +pers.toFixed(3), watch: +watch.toFixed(3), fairness: +fairness.toFixed(3), imp, votes: tot } }
  })

  scored.sort((x, y) => y.score - x.score)

  const ranked = mmrReRank(scored, { epsilon: 0.15, seed: hashSeed(viewerKey || 'global') })

  // Paginación con wrap (scroll infinito). El cliente deduplica por id.
  const N = ranked.length
  const startIdx = (((cursor % N) + N) % N)
  const items = []
  for (let k = 0; k < limit; k++) items.push(ranked[(startIdx + k) % N])

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

export default { rankFeed, recordVote, recordWatch, recordImpressions, bprUpdate, categoriesForPost, categoriesForSide, computeMetrics }
