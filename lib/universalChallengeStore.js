import { getCollection } from './mongodb'
import { getPostOwnerId } from './challengeEngineStore'
import { computeChallengeState, isEventOpenForInput } from './challengeStateEngine'
import { RULES } from './challengeRuleEngine'
import { PARTICIPANT_STRUCTURES, structureAllowedRules } from './universalChallengeParticipantStructures'

/**
 * Universal Challenge Engine — persistence layer.
 *
 * ADDITIVE, NEW collections. Completely independent of the legacy poll-
 * scheduling engine's `postChallenges` / `challengeVotes` collections (see
 * `lib/challengeEngineStore.js`) — nothing here reads or writes those, and
 * nothing there is changed by this file. `getPostOwnerId` is imported
 * read-only from that module purely to reuse the existing
 * post-vs-open-challenge ownership lookup (same rule the legacy engine
 * uses to decide who may create/edit a Challenge for a given postId) —
 * calling it does not modify its behavior.
 *
 *   universalChallenges       <- one document per Challenge (one Challenge
 *                                spans ONE video/post): { challengeId,
 *                                postId, videoId, authorId, participants[],
 *                                teams[], events[], schemaVersion: 1 }.
 *                                `teams` (additive, Phase 2 — see
 *                                lib/universalChallengeParticipantStructures.js
 *                                TEAM_VS_TEAM): [{ id, label,
 *                                participantIds[] }], grouping a subset of
 *                                `participants` under a named team. Purely
 *                                additive/optional — a Challenge with no
 *                                TEAM_VS_TEAM events has `teams: []`, same
 *                                as every Challenge created before this
 *                                field existed.
 *   universalChallengeInputs  <- one document per submitted vote/input/
 *                                measurement, generalizing challengeVotes'
 *                                (postId, momentId, userId) upsert-key
 *                                pattern to this richer model. Two upsert
 *                                shapes, chosen by what the interaction
 *                                actually needs to dedupe on:
 *                                  - vote-shaped (interaction: 'vote' |
 *                                    'predict'; a crowd chooses an
 *                                    optionId/participantId): key =
 *                                    (challengeId, eventId, userId) —
 *                                    exactly like challengeVotes, so a
 *                                    viewer can change their vote via
 *                                    upsert without double-counting.
 *                                  - participant-shaped (interaction:
 *                                    'answer' | 'none'; a measurement or
 *                                    answer ABOUT/FROM one particular
 *                                    participant — e.g. the creator typing
 *                                    in a bounce count for participant X,
 *                                    or participant X submitting their own
 *                                    letter): key = (challengeId, eventId,
 *                                    participantId) — because the SAME
 *                                    submitting user (e.g. the creator) may
 *                                    legitimately submit one input PER
 *                                    participant within a single event, so
 *                                    keying on userId alone would collide.
 *
 * RESULTS ARE COMPUTED ON READ, exactly like `getMomentResults` in the
 * legacy engine: no denormalized counters. `getResolvedUniversalChallenge`
 * is the single read path that (a) rehydrates each event's `inputs` from
 * the inputs collection, (b) runs the State Engine (which internally calls
 * the Rule Engine for any event whose voting window has just closed), and
 * (c) persists any newly-resolved events back onto the document so the
 * resolution — and any tie-break randomness it needed — happens at most
 * once. `castUniversalChallengeInput` calls the exact same resolve-then-
 * persist step BEFORE accepting a new input, so a vote/measurement can
 * never be recorded against an event whose window has already closed (the
 * video timeline is the source of truth, per the customer's explicit
 * decision).
 */

const UNIVERSAL_CHALLENGES = 'universalChallenges'
const UNIVERSAL_CHALLENGE_INPUTS = 'universalChallengeInputs'

const INTERACTIONS = new Set(['vote', 'predict', 'answer', 'none'])
const MEASUREMENT_SOURCES = new Set(['creator_input', 'participant_input', 'automatic_video_measurement'])
const VOTE_SHAPED_INTERACTIONS = new Set(['vote', 'predict'])

function strip(doc) {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function fail(code) {
  const err = new Error(code)
  err.code = code
  throw err
}

// ---------------------------------------------------------------------------
// Normalization / validation (creation time)
// ---------------------------------------------------------------------------

function normalizeParticipants(participants) {
  if (!Array.isArray(participants) || participants.length === 0) fail('no_participants')
  return participants.map((p) => ({
    id: p?.id && String(p.id).trim() ? String(p.id) : genId('participant'),
    label: String(p?.label || '').trim() || 'Participant',
    avatarUrl: p?.avatarUrl || null,
  }))
}

// `teams` (additive, Phase 2 — see
// lib/universalChallengeParticipantStructures.js TEAM_VS_TEAM). Entirely
// optional: a Challenge with no team-based events simply has `teams: []`.
// Any participantId referenced by a team that ISN'T one of this
// Challenge's own participants is silently dropped (never a hard failure
// here — the actual "does this event's two teams have anyone in them"
// check happens per-event in `createUniversalChallenge`, where a genuinely
// broken reference does fail the whole create).
function normalizeTeams(teams, validParticipantIds) {
  if (!Array.isArray(teams) || teams.length === 0) return []
  return teams.map((t) => ({
    id: t?.id && String(t.id).trim() ? String(t.id) : genId('team'),
    label: String(t?.label || '').trim() || 'Team',
    participantIds: Array.isArray(t?.participantIds)
      ? [...new Set(t.participantIds.map(String).filter((pid) => validParticipantIds.has(pid)))]
      : [],
  }))
}

function normalizeRuleConfig(ruleConfig) {
  const cfg = ruleConfig && typeof ruleConfig === 'object' ? ruleConfig : {}
  return {
    tieBreak: cfg.tieBreak === 'creator_defined' ? 'creator_defined' : 'random',
    tieBreakWinnerId: cfg.tieBreakWinnerId || null,
    insufficientVotesFallback: cfg.insufficientVotesFallback || 'most_votes_at_close',
    missingSubmissionBehavior: ['eliminate', 'fail_round', 'default_value', 'allow_other_to_continue'].includes(cfg.missingSubmissionBehavior)
      ? cfg.missingSubmissionBehavior
      : 'eliminate',
    defaultValue: cfg.defaultValue ?? '',
    validValues: Array.isArray(cfg.validValues) ? cfg.validValues : undefined,
    correctOptionId: cfg.correctOptionId || null,
    eliminateNonFinishers: !!cfg.eliminateNonFinishers,
    conditionTargetIds: Array.isArray(cfg.conditionTargetIds) ? cfg.conditionTargetIds : undefined,
    onTrigger: cfg.onTrigger === 'fail' ? 'fail' : 'eliminate',
    // Phase 2, additive — see lib/challengeRuleEngine.js module docstring
    // and lib/universalChallengeParticipantStructures.js for what each
    // powers. Every field defaults to the value that reproduces this
    // phase's pre-existing behavior exactly (outputMode 'winner',
    // conditionMode unset, teamAggregationMethod 'sum' being the
    // customer's own stated sensible default).
    teamAggregationMethod: cfg.teamAggregationMethod === 'average' ? 'average' : 'sum',
    outputMode: cfg.outputMode === 'full_ranking' ? 'full_ranking' : 'winner',
    conditionMode: cfg.conditionMode === 'per_participant_pass_fail' ? 'per_participant_pass_fail' : null,
    // Phase 3, additive — see lib/challengeRuleEngine.js `prediction()`.
    // Default 'reveal' reproduces every PREDICTION event authored before
    // this phase exactly. 'vote_tally' (Team vs Team's community-vote
    // path) is additionally FORCED server-side in createUniversalChallenge
    // below whenever participantStructure is TEAM_VS_TEAM and rule is
    // PREDICTION — a client can request it here, but can never turn it
    // OFF for that combination, so a team-vote round can never be quietly
    // downgraded into a creator-declared-winner ('reveal') round.
    outcomeMode: cfg.outcomeMode === 'vote_tally' ? 'vote_tally' : 'reveal',
    // `condition`/`validate`/`combine`/`comparator` are intentionally NOT
    // persisted (functions aren't JSON-serializable) — pluggability for
    // those is a code-level extension point (pass event objects with live
    // functions directly to the Rule Engine in-process, e.g. from a test),
    // not something authored through the API in this phase.
  }
}

function normalizeEvent(raw, knownIdsSoFar) {
  const id = raw?.id && String(raw.id).trim() ? String(raw.id) : genId('event')
  const startTime = Number(raw?.startTime)
  const endTime = Number(raw?.endTime)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) fail('invalid_time_range')

  const rule = raw?.rule
  if (!Object.values(RULES).includes(rule)) fail('unknown_rule')

  const interaction = INTERACTIONS.has(raw?.interaction) ? raw.interaction : 'vote'
  const measurementSource = MEASUREMENT_SOURCES.has(raw?.measurementSource) ? raw.measurementSource : 'creator_input'

  const autoAdvanceFrom = raw?.autoAdvanceFrom
    ? (Array.isArray(raw.autoAdvanceFrom) ? raw.autoAdvanceFrom.map(String) : [String(raw.autoAdvanceFrom)])
    : []
  for (const srcId of autoAdvanceFrom) {
    if (!knownIdsSoFar.has(srcId)) fail('unknown_auto_advance_source')
  }

  const participantIds = Array.isArray(raw?.participantIds) ? raw.participantIds.map(String) : []

  const options = Array.isArray(raw?.options)
    ? raw.options.map((o) => ({
        id: o?.id && String(o.id).trim() ? String(o.id) : genId('opt'),
        label: String(o?.label || '').trim(),
        participantId: o?.participantId ? String(o.participantId) : null,
        mediaUrl: o?.mediaUrl || null,
      }))
    : []

  // `participantStructure` — see lib/universalChallengeParticipantStructures.js.
  // Purely descriptive metadata (which named authoring flow / Feed
  // presentation an event uses) layered ON TOP of `rule`, never a
  // replacement for it: the Rule Engine and State Engine never read this
  // field. Validated here so an event can never be tagged with a structure
  // that doesn't match how it will actually resolve — `structureAllowedRules`
  // returns a one-rule or multi-rule allow-list depending on the structure
  // (Phase 2's TEAM_VS_TEAM/ONE_VS_ALL/ALL_VS_ALL/ORDER_RANKING let the
  // creator pick among a small set of compatible existing rules; Phase 1's
  // structures, and PROGRESSIVE_CHALLENGE, stay locked to exactly one).
  const participantStructure = Object.values(PARTICIPANT_STRUCTURES).includes(raw?.participantStructure)
    ? raw.participantStructure
    : null
  if (participantStructure && !structureAllowedRules(participantStructure).includes(rule)) fail('participant_structure_rule_mismatch')
  if (participantStructure === PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE && options.length !== 2) fail('two_side_choice_requires_two_options')
  if (
    (participantStructure === PARTICIPANT_STRUCTURES.GUESS_THE_ACTION || participantStructure === PARTICIPANT_STRUCTURES.MAJORITY_CHOICE) &&
    options.length < 2
  ) fail('structure_requires_at_least_two_options')

  // `teamIds` (additive, Phase 2, TEAM_VS_TEAM only) — which two of the
  // Challenge-level `teams[]` this event pits against each other. Actual
  // cross-referencing against the Challenge's real teams (and deriving
  // `participantIds` from their rosters) happens in
  // `createUniversalChallenge` below, once both `events` and `teams` have
  // been normalized independently — mirroring exactly how participantIds
  // are cross-checked against `participants` today.
  const teamIds = Array.isArray(raw?.teamIds) ? raw.teamIds.map(String) : []
  if (participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && teamIds.length !== 2) fail('team_vs_team_requires_two_teams')

  // `structureMeta` (additive, Phase 2) — small bag of structure-specific
  // bookkeeping (see lib/universalChallengeParticipantStructures.js module
  // docstring). Never read by the Rule Engine / State Engine; purely for
  // the authoring UI + the cross-event summary helpers to find "every
  // event belonging to this one guided-authoring run".
  const structureMetaRaw = raw?.structureMeta && typeof raw.structureMeta === 'object' ? raw.structureMeta : null
  const structureMeta = structureMetaRaw
    ? {
        groupId: structureMetaRaw.groupId ? String(structureMetaRaw.groupId) : null,
        anchorParticipantId: structureMetaRaw.anchorParticipantId ? String(structureMetaRaw.anchorParticipantId) : null,
        stageIndex: Number.isFinite(Number(structureMetaRaw.stageIndex)) ? Number(structureMetaRaw.stageIndex) : null,
      }
    : null

  // An event needs SOME way to end up with participants: authored directly,
  // derivable once its source event(s) resolve, derivable from its two
  // teams' rosters (TEAM_VS_TEAM — see createUniversalChallenge), OR — new
  // in Phase 1 — a PREDICTION event authored with free-text `options` and
  // deliberately NO participants engaged at all (Guess the Action /
  // Two-Side Choice / Majority Choice: a vote about an OPTION, not about a
  // participant). `resolveEvent`/`prediction()` (challengeRuleEngine.js,
  // unmodified) already falls back to tallying by `options` whenever no
  // participants are eligible for an event — this is simply the
  // creation-time validation catching up to that pre-existing rule-engine
  // fallback path.
  const optionsOnlyAllowed = rule === RULES.PREDICTION && options.length > 0
  const teamDerivedAllowed = participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM
  if (participantIds.length === 0 && autoAdvanceFrom.length === 0 && !optionsOnlyAllowed && !teamDerivedAllowed) fail('no_participants_for_event')

  const votingWindow = raw?.votingWindow && Number.isFinite(Number(raw.votingWindow.start)) && Number.isFinite(Number(raw.votingWindow.end))
    ? { start: Number(raw.votingWindow.start), end: Number(raw.votingWindow.end) }
    : null // defaults to event startTime/endTime, handled by the State Engine

  return {
    id,
    startTime,
    endTime,
    type: String(raw?.type || 'matchup'),
    interaction,
    rule,
    ruleConfig: normalizeRuleConfig(raw?.ruleConfig),
    participantIds,
    autoAdvanceFrom,
    participantStructure,
    teamIds,
    structureMeta,
    question: String(raw?.question || '').trim(),
    options,
    measurementSource,
    votingWindow,
    inputs: [], // rehydrated from UNIVERSAL_CHALLENGE_INPUTS on every read; never authored directly
    result: null,
    state: 'pending',
  }
}

function normalizeEvents(events) {
  if (!Array.isArray(events) || events.length === 0) fail('no_events')
  const sorted = [...events].sort((a, b) => Number(a.startTime) - Number(b.startTime))
  const normalized = []
  const knownIds = new Set()
  let prevEnd = -Infinity
  for (const raw of sorted) {
    const ev = normalizeEvent(raw, knownIds)
    if (ev.startTime < prevEnd) fail('overlapping_events')
    prevEnd = ev.endTime
    knownIds.add(ev.id)
    normalized.push(ev)
  }
  return normalized
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createUniversalChallenge(postId, authorId, { videoId, participants, events, teams } = {}) {
  const normalizedParticipants = normalizeParticipants(participants)
  const validParticipantIds = new Set(normalizedParticipants.map((p) => p.id))
  const normalizedEvents = normalizeEvents(events)
  const normalizedTeams = normalizeTeams(teams, validParticipantIds)
  const validTeamIds = new Set(normalizedTeams.map((t) => t.id))

  for (const ev of normalizedEvents) {
    if (ev.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM) {
      if (!ev.teamIds.every((tid) => validTeamIds.has(tid))) fail('unknown_team_in_event')
      const teamA = normalizedTeams.find((t) => t.id === ev.teamIds[0])
      const teamB = normalizedTeams.find((t) => t.id === ev.teamIds[1])
      if (!teamA?.participantIds.length || !teamB?.participantIds.length) fail('team_requires_at_least_one_participant')
      // Derive `participantIds` straight from the two teams' rosters —
      // never trust a client-supplied list here, so a TEAM_VS_TEAM event
      // always accurately reflects "every member of both teams", matching
      // how its vote standings are computed (see
      // lib/universalChallengeParticipantStructures.js computeTeamVoteStandings).
      ev.participantIds = [...new Set([...teamA.participantIds, ...teamB.participantIds])]
      // TEAM_VS_TEAM is ALWAYS community-vote-only — the customer's final,
      // unambiguous decision, with NO "aggregated measurement" path left at
      // all. `ev.rule` is guaranteed to already be RULES.PREDICTION here:
      // `normalizeEvent` above rejects (`participant_structure_rule_mismatch`)
      // any TEAM_VS_TEAM event tagged with a measurement rule — see
      // `STRUCTURE_RULE.TEAM_VS_TEAM` in
      // lib/universalChallengeParticipantStructures.js, locked to exactly
      // one rule — so this is no longer a conditional branch, it is
      // unconditionally true for every TEAM_VS_TEAM event that reaches this
      // point, whether authored through the editor UI or a direct API call.
      // Both `options` (the votable choices) and `ruleConfig.outcomeMode`
      // are FORCED here, server-side, from the two teams themselves —
      // never trusting whatever the client sent for either. This is the
      // concrete guardrail against a creator hardcoding a fixed winner
      // for this path: even a client that tries to submit its own
      // `options` (pointing votes at something other than the two teams)
      // or `ruleConfig.outcomeMode: 'reveal'` combined with a
      // `correctOptionId` (which would let the creator declare either
      // team the winner regardless of votes) is overridden here — a
      // TEAM_VS_TEAM event can ONLY ever resolve via real cast votes
      // tallied between exactly these two teams.
      ev.options = [
        { id: teamA.id, label: teamA.label, participantId: null, mediaUrl: null },
        { id: teamB.id, label: teamB.label, participantId: null, mediaUrl: null },
      ]
      ev.ruleConfig = { ...ev.ruleConfig, outcomeMode: 'vote_tally' }
    }
    for (const pid of ev.participantIds) {
      if (!validParticipantIds.has(pid)) fail('unknown_participant_in_event')
    }
  }

  const col = await getCollection(UNIVERSAL_CHALLENGES)
  const now = new Date().toISOString()
  const challengeId = genId('uchal')
  const doc = {
    challengeId,
    postId: String(postId),
    videoId: videoId ? String(videoId) : String(postId),
    authorId,
    participants: normalizedParticipants,
    teams: normalizedTeams,
    events: normalizedEvents,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return strip(doc)
}

export async function getUniversalChallengeByPostId(postId) {
  const col = await getCollection(UNIVERSAL_CHALLENGES)
  const doc = await col.findOne({ postId: String(postId) })
  return strip(doc)
}

// ---------------------------------------------------------------------------
// Rehydrate inputs from the inputs collection onto each event (compute-on-read)
// ---------------------------------------------------------------------------

async function attachInputs(doc) {
  const col = await getCollection(UNIVERSAL_CHALLENGE_INPUTS)
  const rows = await col.find({ challengeId: doc.challengeId }).toArray()
  const byEvent = new Map()
  for (const r of rows) {
    if (!byEvent.has(r.eventId)) byEvent.set(r.eventId, [])
    byEvent.get(r.eventId).push({
      userId: r.userId || null,
      participantId: r.participantId || null,
      optionId: r.optionId || null,
      value: r.value,
      letters: r.letters,
      timeMs: r.timeMs,
      completedAtMs: r.completedAtMs,
    })
  }
  return {
    ...doc,
    events: doc.events.map((e) => ({ ...e, inputs: byEvent.get(e.id) || [] })),
  }
}

// ---------------------------------------------------------------------------
// Read (resolved state) — the auto-resolution-at-window-close entry point
// ---------------------------------------------------------------------------

// Given a Challenge + currentTime, returns the fully recomputed view and
// persists any events that were newly resolved this call. Returns null if
// no Challenge exists for this post (mirrors legacy getChallengeByPostId).
export async function getResolvedUniversalChallenge(postId, currentTime) {
  const raw = await getUniversalChallengeByPostId(postId)
  if (!raw) return null
  const withInputs = await attachInputs(raw)
  // No currentTime supplied -> treat as "nothing has started yet" (0)
  // rather than "everything is closed" (Infinity), so a bare status read
  // never force-resolves the whole timeline.
  const effectiveTime = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0
  const computed = computeChallengeState(withInputs, effectiveTime)

  if (computed.changed) {
    const col = await getCollection(UNIVERSAL_CHALLENGES)
    const eventsToPersist = computed.events.map((e) => {
      const { inputs, ...rest } = e // `inputs` is always rehydrated from UNIVERSAL_CHALLENGE_INPUTS on read, never persisted inline
      return rest
    })
    await col.updateOne(
      { challengeId: raw.challengeId },
      { $set: { events: eventsToPersist, updatedAt: new Date().toISOString() } },
    )
  }

  return {
    challengeId: raw.challengeId,
    postId: raw.postId,
    videoId: raw.videoId,
    authorId: raw.authorId,
    schemaVersion: raw.schemaVersion,
    participants: computed.participants,
    teams: raw.teams || [],
    events: computed.events,
    activeEventId: computed.activeEventId,
  }
}

// ---------------------------------------------------------------------------
// Cast a vote / input / measurement for an event
// ---------------------------------------------------------------------------

// payload shapes (only the fields relevant to the event's rule need be set):
//   vote-shaped (ELIMINATION/SEQUENTIAL_MATCHUP/PREDICTION): { userId, optionId }
//   measurement (HIGHEST_SCORE/LOWEST_SCORE/FASTEST/COMPARISON): { participantId, value }
//   FASTEST specifically may use { participantId, timeMs }
//   FIRST_TO_OBJECTIVE: { participantId, completedAtMs }
//   INPUT_VALIDATION: { participantId, letters/value }
//   SURVIVAL with ruleConfig.conditionMode 'per_participant_pass_fail'
//     (Progressive Challenge stages): { participantId, value: true|false }
export async function castUniversalChallengeInput(postId, eventId, currentTime, { userId, participantId, optionId, value, letters, timeMs, completedAtMs } = {}) {
  const raw = await getUniversalChallengeByPostId(postId)
  if (!raw) fail('challenge_not_found')

  // Resolve-on-read FIRST: an event whose window closed the instant before
  // this request must not accept a "just in time" vote — it needs to
  // already show as resolved so we correctly reject it below.
  const resolved = await getResolvedUniversalChallenge(postId, currentTime)
  const event = resolved.events.find((e) => e.id === eventId)
  if (!event) fail('event_not_found')
  if (!isEventOpenForInput(event, Number(currentTime))) fail('event_closed')

  const isVoteShaped = VOTE_SHAPED_INTERACTIONS.has(event.interaction)
  // A vote-shaped event authored purely against free-text `options` (Guess
  // the Action / Two-Side Choice / Majority Choice — see
  // lib/universalChallengeParticipantStructures.js) legitimately has NO
  // participants engaged at all; only a participant-less, options-less
  // event is truly "not ready to accept input".
  const optionsReady = isVoteShaped && Array.isArray(event.options) && event.options.length > 0
  if (!optionsReady && (!Array.isArray(event.participantIds) || event.participantIds.length === 0)) fail('event_participants_not_ready')

  const col = await getCollection(UNIVERSAL_CHALLENGE_INPUTS)
  const now = new Date().toISOString()

  if (isVoteShaped) {
    if (!userId) fail('user_required')
    const validOptionIds = new Set((event.options || []).map((o) => o.id))
    const validParticipantIds = new Set(event.participantIds)
    // Vote payload may target an optionId (options[] authored explicitly)
    // or, when options weren't authored, directly a participantId (the
    // "option" IS the participant, e.g. a bare A-vs-B matchup).
    const target = optionId != null ? optionId : participantId
    if (target == null || (!validOptionIds.has(target) && !validParticipantIds.has(target))) fail('invalid_selection')
    await col.updateOne(
      { challengeId: raw.challengeId, eventId, userId },
      { $set: { challengeId: raw.challengeId, eventId, userId, optionId: target, updatedAt: now }, $setOnInsert: { id: genId('input'), createdAt: now } },
      { upsert: true },
    )
  } else {
    // participant-shaped: measurement / answer / creator-entered input.
    if (!participantId) fail('participant_required')
    if (!event.participantIds.includes(participantId)) fail('unknown_participant')
    const update = { challengeId: raw.challengeId, eventId, participantId, userId: userId || null, updatedAt: now }
    if (value !== undefined) update.value = value
    if (letters !== undefined) update.letters = letters
    if (timeMs !== undefined) update.timeMs = Number(timeMs)
    if (completedAtMs !== undefined) update.completedAtMs = Number(completedAtMs)
    await col.updateOne(
      { challengeId: raw.challengeId, eventId, participantId },
      { $set: update, $setOnInsert: { id: genId('input'), createdAt: now } },
      { upsert: true },
    )
  }

  // Return the fresh resolved view (tally/measurements-so-far included),
  // same "act then re-read" shape as legacy castChallengeVote + getMomentResults.
  return getResolvedUniversalChallenge(postId, currentTime)
}

export default {
  createUniversalChallenge,
  getUniversalChallengeByPostId,
  getResolvedUniversalChallenge,
  castUniversalChallengeInput,
}
