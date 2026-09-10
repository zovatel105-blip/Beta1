import { getCollection } from './mongodb'
import { getMechanicById, INPUT_TYPES } from './challengeMechanics'

/**
 * Capa de persistencia del Motor de Challenges Dinámico.
 *
 *   postChallenges  <- un documento por post con `moments[]` (momentos de
 *                      votación anclados a startTime/endTime del vídeo).
 *   challengeVotes  <- un documento por (postId, momentId, userId): permite
 *                      cambiar de voto (upsert) igual que incrementPostVote
 *                      en lib/stores.js, y evita doble conteo.
 *
 * El resultado de cada momento se calcula AGREGANDO challengeVotes en el
 * momento de la lectura (no se mantienen contadores denormalizados) — con
 * 7 inputTypes genéricos esto es mucho más simple y fiable que mantener
 * contadores atómicos por mecánica, y el volumen esperado (votos por
 * momento de un vídeo) no justifica la complejidad adicional.
 */

const POST_CHALLENGES = 'postChallenges'
const CHALLENGE_VOTES = 'challengeVotes'

function strip(doc) {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// Dueño de un post, sea de la colección `posts` (versus/duet/etc.) o de
// `challenges` (retos abiertos, expuestos al feed con id `open_<id>`).
// Mismo criterio de propiedad que deletePostById/deleteOpenChallenge en
// lib/stores.js, para que el motor de challenges nunca autorice a alguien
// que no sea el autor de la publicación.
export async function getPostOwnerId(postId) {
  const idStr = String(postId || '')
  if (idStr.startsWith('open_')) {
    const col = await getCollection('challenges')
    const doc = await col.findOne({ id: idStr.slice(5) })
    return doc ? (doc.from?.id || null) : null
  }
  const col = await getCollection('posts')
  const doc = await col.findOne({ id: idStr })
  return doc ? (doc.userId || doc.author?.id || null) : null
}

// Valida que los momentos no se superpongan y que cada uno tenga una
// mecánica conocida + opciones válidas para su inputType. Lanza un Error
// con un `code` legible por el cliente si algo no cuadra.
function validateMoments(moments) {
  if (!Array.isArray(moments) || moments.length === 0) {
    const err = new Error('no_moments'); err.code = 'no_moments'; throw err
  }
  const sorted = [...moments].sort((a, b) => Number(a.startTime) - Number(b.startTime))
  let prevEnd = -1
  for (const m of sorted) {
    const start = Number(m.startTime)
    const end = Number(m.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      const err = new Error('invalid_time_range'); err.code = 'invalid_time_range'; throw err
    }
    if (start < prevEnd) {
      const err = new Error('overlapping_moments'); err.code = 'overlapping_moments'; throw err
    }
    prevEnd = end
    const mech = getMechanicById(m.mechanic)
    if (!mech) {
      const err = new Error('unknown_mechanic'); err.code = 'unknown_mechanic'; throw err
    }
    const opts = Array.isArray(m.options) ? m.options.filter((o) => o && String(o.label || '').trim()) : []
    if (opts.length < mech.minOptions || opts.length > mech.maxOptions) {
      const err = new Error('invalid_option_count'); err.code = 'invalid_option_count'; throw err
    }
    if (!String(m.question || '').trim()) {
      const err = new Error('missing_question'); err.code = 'missing_question'; throw err
    }
  }
}

// Crea/reemplaza los momentos de un post (autor únicamente, ver ownership
// check en la ruta). Normaliza cada momento con un id estable y limpia los
// campos de settings según la mecánica elegida.
export async function saveChallengeMoments(postId, authorId, { moments, scoringMode }) {
  validateMoments(moments)
  const normalized = moments.map((m) => {
    const mech = getMechanicById(m.mechanic)
    const opts = m.options.filter((o) => o && String(o.label || '').trim())
    return {
      id: m.id && String(m.id).trim() ? String(m.id) : genId('moment'),
      startTime: Number(m.startTime),
      endTime: Number(m.endTime),
      mechanic: mech.id,
      inputType: mech.inputType,
      question: String(m.question || '').trim(),
      options: opts.map((o) => ({
        id: o.id && String(o.id).trim() ? String(o.id) : genId('opt'),
        label: String(o.label).trim(),
        mediaUrl: o.mediaUrl || null,
      })),
      settings: {
        resultRule: m.settings?.resultRule || mech.resultRule || 'majority',
        threshold: Number(m.settings?.threshold) || mech.defaultThreshold || 70,
        allowMultiple: !!(m.settings?.allowMultiple ?? mech.allowMultipleDefault),
        maxPoints: Number(m.settings?.maxPoints) || mech.defaultMaxPoints || 10,
        correctOptionId: m.settings?.correctOptionId || null,
        reward: {
          enabled: !!(m.settings?.reward?.enabled),
          coins: Number(m.settings?.reward?.coins) || 0,
        },
      },
      createdAt: new Date().toISOString(),
    }
  })

  const col = await getCollection(POST_CHALLENGES)
  const now = new Date().toISOString()
  await col.updateOne(
    { postId },
    {
      $set: { postId, authorId, moments: normalized, scoringMode: scoringMode === 'cumulative' ? 'cumulative' : 'per_moment', updatedAt: now },
      $setOnInsert: { id: genId('pc'), createdAt: now },
    },
    { upsert: true },
  )
  return getChallengeByPostId(postId)
}

export async function getChallengeByPostId(postId) {
  const col = await getCollection(POST_CHALLENGES)
  const doc = await col.findOne({ postId })
  return strip(doc)
}

// Voto/interacción de un usuario en un momento concreto. `selection` cambia
// de forma según el inputType del momento:
//   single_choice/elimination/save_choice/accept_reject -> string (optionId)
//   multi_select                                        -> string[]
//   ranking                                              -> string[] (orden completo)
//   points                                               -> { [optionId]: number }
export async function castChallengeVote(postId, momentId, userId, selection) {
  const col = await getCollection(CHALLENGE_VOTES)
  const now = new Date().toISOString()
  await col.updateOne(
    { postId, momentId, userId },
    { $set: { postId, momentId, userId, selection, updatedAt: now }, $setOnInsert: { id: genId('vote'), createdAt: now } },
    { upsert: true },
  )
}

export async function getUserVoteForMoment(postId, momentId, userId) {
  if (!userId) return null
  const col = await getCollection(CHALLENGE_VOTES)
  const doc = await col.findOne({ postId, momentId, userId })
  return doc ? doc.selection : null
}

// Agrega TODOS los votos de un momento en un tally por opción, según su
// inputType. Devuelve { totalVoters, options: [{id,label,count,percent}],
// leading, tieBreakNeeded } — sin exponer quién votó qué.
export async function getMomentResults(postId, moment, viewerId) {
  const col = await getCollection(CHALLENGE_VOTES)
  const votes = await col.find({ postId, momentId: moment.id }).toArray()
  const counts = {}
  for (const o of moment.options) counts[o.id] = 0

  if (moment.inputType === INPUT_TYPES.POINTS) {
    for (const v of votes) {
      const sel = v.selection || {}
      for (const optId of Object.keys(sel)) {
        if (optId in counts) counts[optId] += Number(sel[optId]) || 0
      }
    }
  } else if (moment.inputType === INPUT_TYPES.RANKING) {
    const n = moment.options.length
    for (const v of votes) {
      const order = Array.isArray(v.selection) ? v.selection : []
      order.forEach((optId, idx) => {
        if (optId in counts) counts[optId] += Math.max(0, n - idx)
      })
    }
  } else if (moment.inputType === INPUT_TYPES.MULTI_SELECT) {
    for (const v of votes) {
      const sel = Array.isArray(v.selection) ? v.selection : []
      for (const optId of sel) if (optId in counts) counts[optId] += 1
    }
  } else {
    // single_choice / elimination / save_choice / accept_reject
    for (const v of votes) {
      const optId = v.selection
      if (optId in counts) counts[optId] += 1
    }
  }

  const totalVoters = votes.length
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const options = moment.options.map((o) => ({
    id: o.id,
    label: o.label,
    mediaUrl: o.mediaUrl || null,
    count: counts[o.id] || 0,
    percent: Math.round(((counts[o.id] || 0) / totalCount) * 1000) / 10,
  }))
  const sortedDesc = [...options].sort((a, b) => b.count - a.count)
  const leadingId = totalVoters > 0 ? sortedDesc[0].id : null
  const tieBreakNeeded = sortedDesc.length > 1 && totalVoters > 0 && sortedDesc[0].count === sortedDesc[1].count
  const thresholdMet = moment.settings?.resultRule === 'threshold'
    ? sortedDesc[0]?.percent >= (moment.settings?.threshold || 70)
    : null

  const viewerSelection = await getUserVoteForMoment(postId, moment.id, viewerId)
  // El resultado correcto (predicción/adivina) solo se revela a quien ya
  // votó en este momento, o al propio autor del post — nunca a alguien que
  // todavía no ha participado, para no arruinar la sorpresa.
  const revealCorrect = !!moment.settings?.correctOptionId && (viewerSelection != null || viewerId === moment.__authorId)

  return {
    momentId: moment.id,
    totalVoters,
    options,
    leadingId,
    tieBreakNeeded,
    thresholdMet,
    viewerSelection,
    correctOptionId: revealCorrect ? moment.settings.correctOptionId : null,
  }
}

// Borrado en cascada al eliminar el post (best-effort, no bloquea el
// borrado principal). Ver hook en handleDeletePost, route.js.
export async function deleteChallengeDataByPostId(postId) {
  const pcCol = await getCollection(POST_CHALLENGES)
  await pcCol.deleteOne({ postId })
  const votesCol = await getCollection(CHALLENGE_VOTES)
  await votesCol.deleteMany({ postId })
}
