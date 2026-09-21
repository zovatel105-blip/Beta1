import { getCollection } from './mongodb'

/**
 * Universal Challenge Engine — Analytics (Phase 7 of the roadmap).
 *
 * NEW, PURELY ADDITIVE module + collection (`universalChallengeAnalyticsEvents`).
 * Records impressions / votes / result-reveals as one-way analytics
 * events. Nothing in the app reads this collection back (yet) and nothing
 * EXISTING is changed by writing to it:
 *   - every write is best-effort / fire-and-forget — wrapped so a write
 *     failure (or the analytics collection being briefly unavailable)
 *     NEVER throws back into the caller, never delays a response, and
 *     never alters any existing return value.
 *   - callers only ever invoke these AFTER an existing success path has
 *     already completed its own logic — this module never gates, blocks,
 *     or short-circuits anything.
 *
 * Event shapes (all include `id`, `type`, `createdAt`):
 *   impression -> { challengeId, postId, eventId, userId, currentTime }
 *                 fired once per resolved-state read that has an active
 *                 moment on screen (lib/../api/universal-challenges GET).
 *   vote        -> { challengeId, postId, eventId, userId, rule }
 *                 fired once per successfully accepted cast input/vote
 *                 (castUniversalChallengeInput's caller).
 *   result      -> { challengeId, postId, eventId, rule, winners }
 *                 fired exactly once per event, the moment it FIRST
 *                 auto-resolves (see universalChallengeStore.js
 *                 getResolvedUniversalChallenge, gated on
 *                 challengeStateEngine.js's `changed` flag — never
 *                 re-fired on a later replay of an already-resolved
 *                 event, since that flag only turns true once).
 */

const COLLECTION = 'universalChallengeAnalyticsEvents'

function genEventId() {
  return `uca_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function record(type, payload) {
  try {
    const col = await getCollection(COLLECTION)
    await col.insertOne({
      id: genEventId(),
      type,
      ...payload,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    // Analytics must never break the feature it's observing.
    console.error('[universal-challenge-analytics] record failed', type, err)
  }
}

export function recordImpression({ challengeId, postId, eventId, userId, currentTime }) {
  return record('impression', {
    challengeId,
    postId,
    eventId: eventId || null,
    userId: userId || null,
    currentTime: Number.isFinite(Number(currentTime)) ? Number(currentTime) : null,
  })
}

export function recordVote({ challengeId, postId, eventId, userId, rule }) {
  return record('vote', { challengeId, postId, eventId, userId: userId || null, rule: rule || null })
}

export function recordResult({ challengeId, postId, eventId, rule, winners }) {
  return record('result', { challengeId, postId, eventId, rule: rule || null, winners: Array.isArray(winners) ? winners : [] })
}

export default { recordImpression, recordVote, recordResult }
