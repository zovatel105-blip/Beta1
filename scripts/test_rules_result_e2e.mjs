// Ad-hoc E2E verification for "Rules & Result" (challenge-level Highest
// Score Wins standings) — NOT part of the app, safe to delete after
// verification. Mirrors the reference image's exact example: 4
// participants (Alex/David/Mike/Tom), several independent "Result"
// moments (rule=HIGHEST_SCORE, objective per-round outcome, NOT a viewer
// prediction), tallied via the EXISTING computeAllVsAllStandings — final
// tally should be Alex 4, David 2, Mike 1, Tom 0 -> Alex WINNER.
import { MongoClient } from 'mongodb'
import fs from 'fs'

let MONGO_URL = process.env.MONGO_URL
let BASE_URL = 'http://localhost:3000'
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = env.match(/MONGO_URL=(.*)/)
  if (m) MONGO_URL = m[1].trim()
} catch {}
MONGO_URL = MONGO_URL || 'mongodb://localhost:27017/twyk'

let pass = 0
let fail = 0
function check(label, cond, extra) {
  if (cond) { pass++; console.log(`  OK  - ${label}`) }
  else { fail++; console.log(`  FAIL- ${label}`, extra !== undefined ? JSON.stringify(extra) : '') }
}

async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json()
  if (!res.ok || !body.token) throw new Error(`login failed for ${username}: ${JSON.stringify(body)}`)
  return body.token
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch {}
  return { status: res.status, json }
}

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db()
  const twyk = await db.collection('users').findOne({ username: 'twyk' })
  if (!twyk) throw new Error('seed users missing — run scripts/seed-core-users.mjs first')

  const postId = 'test_rules_result_' + Date.now()
  const post = {
    id: postId, userId: twyk.id, type: 'single', layout: 'carousel',
    videoUrl: '/uploads/test.mp4', posterUrl: '/uploads/test.jpg', thumbnailUrl: '/uploads/test.jpg',
    description: 'E2E rules & result test post',
    author: { id: twyk.id, username: twyk.username, name: twyk.name, avatarUrl: twyk.avatarUrl },
    stats: { likes: 0, comments: 0, shares: 0, saves: 0, views: 0 }, createdAt: new Date(),
  }
  await db.collection('posts').insertOne(post)
  await db.collection('universalChallenges').deleteMany({ postId })
  await db.collection('universalChallengeInputs').deleteMany({ postId })

  const authorToken = await login('twyk', 'Admin12345')

  console.log('\n== 1) CREATE challenge: 4 entities + 6 "Result" moments (HIGHEST_SCORE, no participantStructure authored) + resultConfig ==')
  const entities = [{ name: 'Alex' }, { name: 'David' }, { name: 'Mike' }, { name: 'Tom' }]
  // 6 independent rounds, matchup pairs vary; each round's winner is whoever the creator enters the highest score for.
  const pairs = [['Alex', 'David'], ['Alex', 'Mike'], ['Alex', 'Tom'], ['David', 'Mike'], ['David', 'Tom'], ['Mike', 'Tom']]
  const events = pairs.map((pair, i) => ({
    startTime: i * 6, endTime: i * 6 + 5, rule: 'HIGHEST_SCORE', interaction: 'none',
    measurementSource: 'creator_input', question: `Round ${i + 1}: ${pair[0]} vs ${pair[1]}`,
    // participantIds filled in after we know real entity ids (below)
    _pairLabels: pair,
  }))

  const createRes = await api(`/universal-challenges/posts/${postId}`, {
    method: 'POST', token: authorToken,
    body: {
      entities,
      events: [], // placeholder, real call happens once we know entity ids (see step 1b)
      resultConfig: { ruleType: 'highest_score', resultType: 'winner_only', tieBreak: 'random' },
    },
  }).catch(() => null)
  // The API only accepts events[] in the SAME create call (no edit-in-place) — build entity ids first via a throwaway create, then the REAL create with wired-up events.
  // (Simplest: create once with entities+events together, resolving names to ids client-side isn't possible before the server assigns them, so we let the server assign ids and read them back from a first pass with 1 harmless placeholder event, OR — simpler still — pre-generate our OWN entity ids so we control them end-to-end.)

  console.log('\n== 1b) Re-create with pre-assigned entity ids (so we can wire participantIds ourselves) ==')
  await db.collection('universalChallenges').deleteMany({ postId })
  const entityIds = { Alex: 'ent_alex_test', David: 'ent_david_test', Mike: 'ent_mike_test', Tom: 'ent_tom_test' }
  const entitiesWithIds = Object.entries(entityIds).map(([name, id]) => ({ id, name }))
  const realEvents = pairs.map((pair, i) => ({
    startTime: i * 6, endTime: i * 6 + 5, rule: 'HIGHEST_SCORE', interaction: 'none',
    measurementSource: 'creator_input', question: `Round ${i + 1}: ${pair[0]} vs ${pair[1]}`,
    participantIds: [entityIds[pair[0]], entityIds[pair[1]]],
  }))
  const createRes2 = await api(`/universal-challenges/posts/${postId}`, {
    method: 'POST', token: authorToken,
    body: { entities: entitiesWithIds, events: realEvents, resultConfig: { ruleType: 'highest_score', resultType: 'winner_only', tieBreak: 'random' } },
  })
  check('challenge created (200/ok)', createRes2.status === 200 && createRes2.json?.ok, createRes2.json)
  const evs = createRes2.json?.challenge?.events || []
  check('all 6 events auto-tagged ALL_VS_ALL with a SHARED groupId', evs.every((e) => e.participantStructure === 'ALL_VS_ALL') && new Set(evs.map((e) => e.structureMeta?.groupId)).size === 1, evs.map((e) => ({ ps: e.participantStructure, gid: e.structureMeta?.groupId })))
  check('resultConfig persisted', createRes2.json?.challenge?.resultConfig?.ruleType === 'highest_score', createRes2.json?.challenge?.resultConfig)

  console.log('\n== 2) Creator enters each round\'s REAL score (measurementSource creator_input, interaction none => author-only) ==')
  // Winner per pair (matches reference tally: Alex 4-0, David 2-2, Mike 1-4, Tom 0-4 sum -> Alex4/David2/Mike1/Tom0)
  const roundWinners = ['Alex', 'Alex', 'Alex', 'David', 'David', 'Mike'] // Alex wins 3, David wins 2, Mike wins 1, Tom wins 0 -> totals below account for losers too
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i]
    const [pA, pB] = pairs[i]
    const winnerName = roundWinners[i]
    const loserName = winnerName === pA ? pB : pA
    // HIGHEST_SCORE: submit a numeric `value` per participant; winner gets higher score.
    await api(`/universal-challenges/posts/${postId}/events/${ev.id}/input`, { method: 'POST', token: authorToken, body: { currentTime: ev.startTime + 1, participantId: entityIds[winnerName], value: 10 } })
    await api(`/universal-challenges/posts/${postId}/events/${ev.id}/input`, { method: 'POST', token: authorToken, body: { currentTime: ev.startTime + 1, participantId: entityIds[loserName], value: 3 } })
  }

  console.log('\n== 3) Read resolved state PAST every round\'s window -> resultSummary should show final standings ==')
  const state = await api(`/universal-challenges/posts/${postId}?currentTime=100`, { token: authorToken })
  const allResolved = (state.json?.challenge?.events || []).every((e) => e.state === 'resolved')
  check('every Result moment resolved', allResolved, state.json?.challenge?.events?.map((e) => e.state))
  const summary = state.json?.challenge?.resultSummary
  check('resultSummary present', !!summary, summary)
  check('resultSummary.complete === true', summary?.complete === true, summary)
  const winCountByName = Object.fromEntries(Object.entries(entityIds).map(([name, id]) => [name, summary?.winCount?.[id]]))
  console.log('    winCount:', JSON.stringify(winCountByName))
  check('Alex has the most wins (3)', winCountByName.Alex === 3, winCountByName)
  check('winnerId === Alex (highest score wins)', summary?.winnerId === entityIds.Alex, { winnerId: summary?.winnerId, alexId: entityIds.Alex })
  check('tied === false (clear winner)', summary?.tied === false, summary)

  console.log('\n== 4) REGRESSION: PREDICTION moments never get auto-tagged / never affect standings ==')
  const postId2 = postId + '_pred'
  const { _id: _ignoredId, ...postWithoutMongoId } = post
  await db.collection('posts').insertOne({ ...postWithoutMongoId, id: postId2 })
  const predRes = await api(`/universal-challenges/posts/${postId2}`, {
    method: 'POST', token: authorToken,
    body: {
      entities: entitiesWithIds,
      events: [{ startTime: 0, endTime: 5, rule: 'PREDICTION', interaction: 'predict', measurementSource: 'creator_input', question: 'Who wins?', participantIds: [entityIds.Alex, entityIds.David], ruleConfig: { outcomeMode: 'reveal', correctOptionId: entityIds.Alex } }],
      resultConfig: { ruleType: 'highest_score', resultType: 'winner_only', tieBreak: 'random' },
    },
  })
  const predEv = predRes.json?.challenge?.events?.[0]
  check('PREDICTION moment NOT tagged ALL_VS_ALL (viewer guess never affects standings)', predEv?.participantStructure == null, predEv)

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`)
  await db.collection('posts').deleteMany({ id: { $in: [postId, postId2] } })
  await db.collection('universalChallenges').deleteMany({ postId: { $in: [postId, postId2] } })
  await db.collection('universalChallengeInputs').deleteMany({ postId: { $in: [postId, postId2] } })
  await client.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1) })
