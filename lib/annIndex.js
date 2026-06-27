// ────────────────────────────────────────────────────────────────────────────
// ANN retrieval (LSH random-hyperplane) — etapa de RECUPERACIÓN escalable.
//
// Para el tamaño actual (decenas-cientos de batallas) la búsqueda exacta por
// coseno es óptima. Cuando crezcas a miles/millones, esta capa LSH reduce el
// espacio de búsqueda en O(1) por bucket. Interfaz pensada como DROP-IN para
// sustituir por FAISS / Milvus / HNSW en producción sin tocar el resto.
// ────────────────────────────────────────────────────────────────────────────

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Genera hiperplanos gaussianos deterministas (Box-Muller) para firmas LSH.
export function makePlanes(dim, nbits = 16, seed = 1337) {
  const rng = mulberry32(seed)
  const planes = []
  for (let b = 0; b < nbits; b++) {
    const p = new Array(dim)
    for (let i = 0; i < dim; i++) {
      const u1 = Math.max(rng(), 1e-9), u2 = rng()
      p[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    }
    planes.push(p)
  }
  return planes
}

// Firma binaria de un vector (un bit por hiperplano) → clave de bucket.
export function signature(vec, planes) {
  let sig = ''
  for (const p of planes) {
    let dot = 0
    for (let i = 0; i < p.length; i++) dot += vec[i] * p[i]
    sig += dot >= 0 ? '1' : '0'
  }
  return sig
}

function hamming(a, b) {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1))
}

// Búsqueda EXACTA por coseno (óptima a pequeña escala).
export function cosineTopK(userVec, items, topK = 200) {
  return items
    .map((it) => ({ key: it.key, sim: cosine(userVec, it.vec) }))
    .sort((x, y) => y.sim - x.sim)
    .slice(0, topK)
}

// Búsqueda APROXIMADA por LSH: agrupa por firma, recupera buckets cercanos
// (distancia de Hamming creciente) hasta juntar ~topK candidatos y refina por
// coseno. Reduce el coste cuando hay decenas de miles de items.
export function lshTopK(userVec, items, { topK = 200, nbits = 16, seed = 1337 } = {}) {
  if (!items.length) return []
  const dim = items[0].vec.length
  const planes = makePlanes(dim, nbits, seed)
  const buckets = new Map()
  for (const it of items) {
    const sig = signature(it.vec, planes)
    if (!buckets.has(sig)) buckets.set(sig, [])
    buckets.get(sig).push(it)
  }
  const qsig = signature(userVec, planes)
  const ordered = [...buckets.keys()].sort((s1, s2) => hamming(qsig, s1) - hamming(qsig, s2))
  const cands = []
  for (const sig of ordered) {
    cands.push(...buckets.get(sig))
    if (cands.length >= topK * 2) break
  }
  return cosineTopK(userVec, cands, topK)
}

export default { makePlanes, signature, cosineTopK, lshTopK }
