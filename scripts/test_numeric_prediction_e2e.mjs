// Ad-hoc E2E verification for STEP 3 (Numeric Prediction) — NOT part of
// the app, safe to delete after verification. Exercises the real HTTP
// API end-to-end (login -> create challenge -> cast/update guess ->
// auto-resolve -> reveal), plus one regression check that a classic
// option-based PREDICTION event (already-audited-complete flow) still
// works after this phase's edits.
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json()
  if (!res.ok || !body.token) throw new Error(`login failed for ${username}: ${JSON.stringify(body)}`)
  return body.token
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  const users = await db.collection('users').find({ username: { $in: ['twyk', 'lucia', 'marcos'] } }).toArray()
  const author = users.find((u) => u.username === 'twyk')
  const viewer = users.find((u) => u.username === 'lucia')
  const viewer2 = users.find((u) => u.username === 'marcos')
  if (!author || !viewer || !viewer2) throw new Error('seed users missing — run scripts/seed-core-users.mjs first')

  // Minimal test post owned by the author (mirrors lib/db.js createPost shape)
  const numericPost = {
    id: 'test_numeric_pred_' + Date.now(),
    userId: author.id,
    type: 'single',
    layout: 'carousel',
    videoUrl: '/uploads/test.mp4',
    posterUrl: '/uploads/test.jpg',
    thumbnailUrl: '/uploads/test.jpg',
    description: 'E2E numeric prediction test post',
    author: { id: author.id, username: author.username, name: author.name, avatarUrl: author.avatarUrl },
    stats: { likes: 0, comments: 0, shares: 0, saves: 0, views: 0 },
    createdAt: new Date(),
  }
  const optionPost = { ...numericPost, id: 'test_option_pred_' + Date.now() }
  await db.collection('posts').insertMany([numericPost, optionPost])
  // clean any stray inputs from a previous failed run
  await db.collection('universal_challenge_inputs').deleteMany({ postId: { $in: [numericPost.id, optionPost.id] } })
  await db.collection('universal_challenges').deleteMany({ postId: { $in: [numericPost.id, optionPost.id] } })

  const authorToken = await login('twyk', 'Admin12345')
  const viewerToken = await login('lucia', 'Test12345')
  const viewer2Token = await login('marcos', 'Test12345')

  console.log('\n== 1) CREATE numeric-prediction challenge (NO participantIds/options — the exact gap fixed in normalizeEvent) ==')
  const createRes = await api(`/universal-challenges/posts/${numericPost.id}`, {
    method: 'POST', token: authorToken,
    body: {
      entities: [{ name: 'Alex' }], // Challenge-level "at least one entity" rule (pre-existing, unrelated to this event)
      events: [{
        startTime: 0, endTime: 8, rule: 'PREDICTION', interaction: 'predict',
        measurementSource: 'creator_input', question: 'How much will it weigh? (kg)',
        ruleConfig: { predictionType: 'numeric', correctValue: 80 },
      }],
    },
  })
  check('challenge created (200/ok)', createRes.status === 200 && createRes.json?.ok, createRes.json)
  const eventId = createRes.json?.challenge?.events?.[0]?.id
  check('event created with zero participantIds (bypass worked)', createRes.json?.challenge?.events?.[0]?.participantIds?.length === 0, createRes.json?.challenge?.events)

  console.log('\n== 2) Pre-resolution: viewer casts a guess mid-window ==')
  const cast1 = await api(`/universal-challenges/posts/${numericPost.id}/events/${eventId}/input`, {
    method: 'POST', token: viewerToken, body: { currentTime: 2, value: 75 },
  })
  check('cast guess=75 accepted', cast1.status === 200 && cast1.json?.ok, cast1.json)

  const state1 = await api(`/universal-challenges/posts/${numericPost.id}?currentTime=3`, { token: viewerToken })
  const ev1 = state1.json?.challenge?.events?.find((e) => e.id === eventId)
  check('event NOT resolved yet (window still open)', ev1?.state !== 'resolved', ev1?.state)
  check('event.inputs carries viewer guess=75 (live, pre-resolution)', ev1?.inputs?.find((i) => i.userId === viewer.id)?.value === 75, ev1?.inputs)

  console.log('\n== 3) Viewer UPDATES guess (re-cast upserts, does not duplicate) ==')
  const cast2 = await api(`/universal-challenges/posts/${numericPost.id}/events/${eventId}/input`, {
    method: 'POST', token: viewerToken, body: { currentTime: 4, value: 78 },
  })
  check('update guess=78 accepted', cast2.status === 200 && cast2.json?.ok, cast2.json)
  // second viewer also predicts, further out
  await api(`/universal-challenges/posts/${numericPost.id}/events/${eventId}/input`, {
    method: 'POST', token: viewer2Token, body: { currentTime: 5, value: 60 },
  })

  console.log('\n== 4) Window closes (currentTime past endTime) -> auto-resolve + reveal ==')
  const state2 = await api(`/universal-challenges/posts/${numericPost.id}?currentTime=9`, { token: viewerToken })
  const ev2 = state2.json?.challenge?.events?.find((e) => e.id === eventId)
  check('event resolved after window close', ev2?.state === 'resolved', ev2?.state)
  check('result.details.revealed === true (correctValue was set)', ev2?.result?.details?.revealed === true, ev2?.result?.details)
  check('result.details.correctValue === 80', ev2?.result?.details?.correctValue === 80, ev2?.result?.details)
  const guessRow = ev2?.result?.details?.guesses?.find((g) => g.userId === viewer.id)
  check('viewer guess persisted as UPDATED value (78, not stale 75)', guessRow?.value === 78, guessRow)
  check('viewer distance computed correctly (|78-80|=2)', guessRow?.distance === 2, guessRow)
  const guess2Row = ev2?.result?.details?.guesses?.find((g) => g.userId === viewer2.id)
  check('second viewer distance computed correctly (|60-80|=20)', guess2Row?.distance === 20, guess2Row)
  check('event still has zero winners (numeric prediction never crowns a winner)', (ev2?.result?.winners || []).length === 0, ev2?.result?.winners)

  console.log('\n== 5) Guard rails still enforced (event_closed once window has passed) ==')
  const lateCast = await api(`/universal-challenges/posts/${numericPost.id}/events/${eventId}/input`, {
    method: 'POST', token: viewer2Token, body: { currentTime: 9, value: 99 },
  })
  check('cast after close rejected (event_closed)', lateCast.status === 409 && lateCast.json?.error === 'event_closed', lateCast.json)

  console.log('\n== 6) REGRESSION: classic option-based PREDICTION (pre-existing, audited-complete flow) still works ==')
  const createOpt = await api(`/universal-challenges/posts/${optionPost.id}`, {
    method: 'POST', token: authorToken,
    body: {
      entities: [{ name: 'Alex' }, { name: 'David' }],
      events: [{
        startTime: 0, endTime: 6, rule: 'PREDICTION', interaction: 'predict',
        measurementSource: 'creator_input', question: 'Who wins?',
        options: [{ label: 'Alex' }, { label: 'David' }],
        ruleConfig: { outcomeMode: 'reveal', correctOptionId: null },
      }],
    },
  })
  check('option-based challenge still created fine', createOpt.status === 200 && createOpt.json?.ok, createOpt.json)
  const optEventId = createOpt.json?.challenge?.events?.[0]?.id
  const optAId = createOpt.json?.challenge?.events?.[0]?.options?.find((o) => o.label === 'Alex')?.id
  const voteOpt = await api(`/universal-challenges/posts/${optionPost.id}/events/${optEventId}/input`, {
    method: 'POST', token: viewerToken, body: { currentTime: 1, optionId: optAId },
  })
  check('option vote accepted', voteOpt.status === 200 && voteOpt.json?.ok, voteOpt.json)
  const stateOpt = await api(`/universal-challenges/posts/${optionPost.id}?currentTime=1`, { token: viewerToken })
  const evOpt = stateOpt.json?.challenge?.events?.find((e) => e.id === optEventId)
  check('option event.inputs carries the vote (unaffected by this phase\'s edits)', evOpt?.inputs?.find((i) => i.userId === viewer.id)?.optionId === optAId, evOpt?.inputs)

  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`)
  await db.collection('posts').deleteMany({ id: { $in: [numericPost.id, optionPost.id] } })
  await db.collection('universal_challenge_inputs').deleteMany({ postId: { $in: [numericPost.id, optionPost.id] } })
  await db.collection('universal_challenges').deleteMany({ postId: { $in: [numericPost.id, optionPost.id] } })
  await client.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1) })
