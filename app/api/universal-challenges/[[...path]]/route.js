import { NextResponse } from 'next/server'
import { getSessionByToken, getUserById } from '@/lib/db'
import { getPostOwnerId } from '@/lib/challengeEngineStore'
import {
  createUniversalChallenge,
  getUniversalChallengeByPostId,
  getResolvedUniversalChallenge,
  castUniversalChallengeInput,
} from '@/lib/universalChallengeStore'
// PHASE 7, additive — analytics (impressions/votes; `result` is logged
// from within lib/universalChallengeStore.js itself, see that file).
import { recordImpression, recordVote } from '@/lib/universalChallengeAnalytics'

export const dynamic = 'force-dynamic'

/**
 * Universal Challenge Engine — API routes.
 *
 * ADDITIVE, NEW route file, deliberately kept separate from the existing
 * catch-all at `/app/app/api/[[...path]]/route.js` (5500+ lines) rather
 * than appended into it: Next.js' App Router prefers a more specific
 * static path segment (`/api/universal-challenges/...`, this folder) over
 * a same-level catch-all, so this file owns that entire prefix without
 * touching a single line of the existing route file or any existing
 * challenge-related handler/collection. Legacy `/api/challenge-mechanics`,
 * `/api/posts/{id}/challenge`, and its moment-vote endpoint are completely
 * untouched and keep working exactly as before.
 *
 * Routes:
 *   POST /api/universal-challenges/posts/{postId}
 *       Create a new-style Challenge (participants + events + rules) for a
 *       post. Author-only (same ownership check the legacy engine uses,
 *       via challengeEngineStore.getPostOwnerId).
 *       body: { videoId?, participants: [{id?,label,avatarUrl?}], events: [...] }
 *
 *   GET /api/universal-challenges/posts/{postId}?currentTime=<seconds>
 *       Read the Challenge's fully resolved state as of `currentTime`:
 *       which event is active, every participant's current status, and
 *       finalized results for every event whose voting window has closed
 *       (auto-resolving + persisting any newly-closed event as part of
 *       this request — see lib/challengeStateEngine.js). `currentTime`
 *       defaults to 0 (nothing has started yet) when omitted.
 *
 *   POST /api/universal-challenges/posts/{postId}/events/{eventId}/input
 *       Cast a vote / input / measurement for one event.
 *       body: { currentTime, participantId?, optionId?, value?, letters?,
 *               timeMs?, completedAtMs? }
 *       - vote-shaped events (interaction: vote|predict): requires a
 *         logged-in user; { optionId } (or bare { participantId } when no
 *         options[] were authored) is the selection. Re-voting overwrites
 *         the same user's previous vote (upsert), exactly like the legacy
 *         engine's castChallengeVote.
 *       - participant-shaped events (interaction: answer|none): body must
 *         include { participantId } plus whichever of value/letters/timeMs/
 *         completedAtMs the event's rule expects. Events authored with
 *         `interaction: 'none'` (`measurementSource: 'creator_input'`)
 *         additionally require the requester to be the Challenge's
 *         author — this is the "creator enters a participant's score"
 *         endpoint; the check is derived from the event's own stored
 *         config, not a client-supplied flag.
 *       Rejects with `event_closed` if the event's voting window (or the
 *       event's own start/end when no explicit votingWindow was set) has
 *       already passed as of `currentTime` — the video timeline is the
 *       source of truth, so a closed event is never left open waiting for
 *       more input.
 */

async function getCurrentUser(request) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '') ||
                  request.cookies.get('session_token')?.value
    if (!token) return null
    const session = await getSessionByToken(token)
    if (!session) return null
    const user = await getUserById(session.userId)
    if (!user || user.suspended) return null
    const { password: _password, ...userWithoutPassword } = user
    return userWithoutPassword
  } catch (err) {
    console.error('[universal-challenges] getCurrentUser error', err)
    return null
  }
}

function errorStatus(code) {
  switch (code) {
    case 'unauthorized': return 401
    case 'forbidden': return 403
    case 'post_not_found':
    case 'challenge_not_found':
    case 'event_not_found': return 404
    case 'event_closed': return 409
    default: return 400
  }
}

function errored(err, fallbackCode, fallbackStatus = 500) {
  if (err?.code) return NextResponse.json({ error: err.code }, { status: errorStatus(err.code) })
  console.error(`[universal-challenges] ${fallbackCode}`, err)
  return NextResponse.json({ error: fallbackCode }, { status: fallbackStatus })
}

async function handleCreate(postId, request) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const ownerId = await getPostOwnerId(postId)
    if (!ownerId) return NextResponse.json({ error: 'post_not_found' }, { status: 404 })
    if (ownerId !== currentUser.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const challenge = await createUniversalChallenge(postId, currentUser.id, {
      videoId: body.videoId,
      participants: body.participants,
      events: body.events,
      teams: body.teams,
      // Entity System (Phase 1, additive) — the new canonical shape. Both
      // are optional: an unmodified caller sending only participants/teams
      // still works unchanged (see lib/universalChallengeStore.js).
      entities: body.entities,
      groups: body.groups,
    })
    return NextResponse.json({ ok: true, challenge })
  } catch (err) {
    return errored(err, 'create_failed')
  }
}

async function handleGetResolvedState(postId, request) {
  try {
    const { searchParams } = new URL(request.url)
    const currentTime = searchParams.get('currentTime')
    const challenge = await getResolvedUniversalChallenge(postId, currentTime !== null ? Number(currentTime) : undefined)
    if (!challenge) return NextResponse.json({ ok: true, challenge: null })
    // PHASE 7, additive — analytics: one `impression` per resolved-state
    // read that has an active moment on screen. Fire-and-forget and never
    // awaited (does not delay this response); the viewer lookup runs on
    // its own and recordImpression itself never throws.
    if (challenge.activeEventId) {
      getCurrentUser(request)
        .then((viewer) => recordImpression({
          challengeId: challenge.challengeId,
          postId,
          eventId: challenge.activeEventId,
          userId: viewer?.id || null,
          currentTime: currentTime !== null ? Number(currentTime) : undefined,
        }))
        .catch(() => {})
    }
    return NextResponse.json({ ok: true, challenge })
  } catch (err) {
    return errored(err, 'fetch_failed')
  }
}

async function handleCastInput(postId, eventId, request) {
  try {
    // Every input (vote or participant-shaped) requires a real session —
    // same rule the legacy engine's castChallengeVote enforces. The
    // authenticated user's id is ALWAYS what gets recorded as `userId`;
    // an unauthenticated request can never spoof a vote/input under an
    // arbitrary userId (a client-supplied `userId` field, if present, is
    // ignored).
    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const currentTime = Number.isFinite(Number(body.currentTime)) ? Number(body.currentTime) : 0

    // `interaction: 'none'` events are the "creator types in a
    // participant's score" path (measurementSource 'creator_input') —
    // derived from the event's OWN authored config, not a client-supplied
    // flag, so a non-author can never bypass this by simply omitting a
    // flag from the request body.
    const raw = await getUniversalChallengeByPostId(postId)
    if (!raw) return NextResponse.json({ error: 'challenge_not_found' }, { status: 404 })
    const rawEvent = raw.events.find((e) => e.id === eventId)
    if (!rawEvent) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
    if (rawEvent.interaction === 'none' && currentUser.id !== raw.authorId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const challenge = await castUniversalChallengeInput(postId, eventId, currentTime, {
      userId: currentUser.id,
      participantId: body.participantId,
      optionId: body.optionId,
      value: body.value,
      letters: body.letters,
      timeMs: body.timeMs,
      completedAtMs: body.completedAtMs,
    })
    // PHASE 7, additive — analytics: one `vote` event per successfully
    // accepted cast input/vote. Fire-and-forget, never awaited; does not
    // delay or alter this response.
    recordVote({ challengeId: challenge.challengeId, postId, eventId, userId: currentUser.id, rule: rawEvent.rule })
    return NextResponse.json({ ok: true, challenge })
  } catch (err) {
    return errored(err, 'input_failed')
  }
}

function parsePostEventSegs(segs) {
  // /posts/{postId}/events/{eventId}/input
  if (segs[0] === 'posts' && segs[1] && segs[2] === 'events' && segs[3] && segs[4] === 'input' && segs.length === 5) {
    return { postId: decodeURIComponent(segs[1]), eventId: decodeURIComponent(segs[3]) }
  }
  return null
}

function parsePostSegs(segs) {
  // /posts/{postId}
  if (segs[0] === 'posts' && segs[1] && segs.length === 2) {
    return { postId: decodeURIComponent(segs[1]) }
  }
  return null
}

export async function GET(request, { params }) {
  const segs = (params?.path) || []
  const postMatch = parsePostSegs(segs)
  if (postMatch) return handleGetResolvedState(postMatch.postId, request)
  return NextResponse.json({ error: 'not_found' }, { status: 404 })
}

export async function POST(request, { params }) {
  const segs = (params?.path) || []
  const eventMatch = parsePostEventSegs(segs)
  if (eventMatch) return handleCastInput(eventMatch.postId, eventMatch.eventId, request)
  const postMatch = parsePostSegs(segs)
  if (postMatch) return handleCreate(postMatch.postId, request)
  return NextResponse.json({ error: 'not_found' }, { status: 404 })
}
