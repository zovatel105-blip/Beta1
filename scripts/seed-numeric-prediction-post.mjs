// Seed: one real post (existing uploaded video) with a Numeric Prediction
// Universal Challenge attached, for manual/agent UI verification of the
// Feed viewer experience. Safe to leave in place (harmless test data);
// NOT loaded/imported by the app itself.
import { MongoClient } from 'mongodb'
import fs from 'fs'

let MONGO_URL = process.env.MONGO_URL
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const m = env.match(/MONGO_URL=(.*)/)
  if (m) MONGO_URL = m[1].trim()
} catch {}
MONGO_URL = MONGO_URL || 'mongodb://localhost:27017/twyk'

async function main() {
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  const db = client.db()
  const users = db.collection('users')
  const posts = db.collection('posts')

  const twyk = await users.findOne({ username: 'twyk' })
  if (!twyk) throw new Error('twyk no existe, corre seed-core-users.mjs primero')

  const existing = await posts.findOne({ id: 'seed_numeric_prediction_post' })
  if (existing) {
    console.log('Ya existe seed_numeric_prediction_post, borrando para re-seedear limpio...')
    await posts.deleteOne({ id: 'seed_numeric_prediction_post' })
    await db.collection('universalChallenges').deleteMany({ postId: 'seed_numeric_prediction_post' })
    await db.collection('universalChallengeInputs').deleteMany({ postId: 'seed_numeric_prediction_post' })
  }

  const post = {
    id: 'seed_numeric_prediction_post',
    userId: twyk.id,
    type: 'single',
    layout: 'carousel',
    videoUrl: '/uploads/015623e375fc8e00.mp4',
    posterUrl: '/uploads/015623e375fc8e00.jpg',
    thumbnailUrl: '/uploads/015623e375fc8e00.jpg',
    description: '¿Cuánto pesará? Numeric Prediction demo (QA seed)',
    music: null,
    author: { id: twyk.id, username: twyk.username, name: twyk.name, avatarUrl: twyk.avatarUrl },
    sideA: null,
    sideB: null,
    stats: { likes: 0, comments: 0, shares: 0, saves: 0, views: 0 },
    votes: null,
    createdAt: new Date(),
    _seq: Date.now() * 1000,
  }
  await posts.insertOne(post)

  const challenge = {
    challengeId: 'uchal_seed_numeric_demo',
    postId: post.id,
    videoId: post.id,
    authorId: twyk.id,
    entities: [{ id: 'ent_alex', name: 'Alex', avatarUrl: null, groupId: null }],
    groups: [],
    participants: [{ id: 'ent_alex', label: 'Alex', avatarUrl: null }],
    teams: [],
    events: [{
      id: 'ev_numeric_demo',
      startTime: 0,
      endTime: 8,
      type: 'matchup',
      interaction: 'predict',
      rule: 'PREDICTION',
      ruleConfig: { predictionType: 'numeric', correctValue: 80, tieBreak: null, tieBreakWinnerId: null },
      participantIds: [],
      autoAdvanceFrom: [],
      participantStructure: null,
      teamIds: [],
      structureMeta: null,
      question: 'How much will Alex lift? (kg)',
      options: [],
      measurementSource: 'creator_input',
      votingWindow: null,
      inputs: [],
      result: null,
      state: 'pending',
    }],
    schemaVersion: 1,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.collection('universalChallenges').insertOne(challenge)

  console.log('Seed listo: post', post.id, '-> challenge', challenge.challengeId, '(evento numérico 0-8s, correctValue=80kg)')
  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
