/**
 * Universal Challenge Engine — State Engine.
 *
 * ADDITIVE, NEW MODULE, unrelated to the legacy `lib/challengeEngineStore.js`
 * (postChallenges/challengeVotes). Consumes `lib/challengeRuleEngine.js`
 * verdicts and turns them into a single coherent picture of a Challenge:
 * each participant's current status, and — for chained events
 * (SEQUENTIAL_MATCHUP-style) — the actual participant list of any
 * downstream event once its source event(s) resolve.
 *
 * CORE DESIGN CHOICE — compute-on-read, matching this codebase's existing
 * pattern (`getMomentResults` in challengeEngineStore.js aggregates votes at
 * read time rather than maintaining denormalized counters). `computeChallengeState`
 * is a PURE function: given a Challenge document (participants + events, as
 * persisted) and the current playback time, it returns a fully-recomputed
 * view — which events are pending/active/resolved, each participant's
 * status, and (if any event closed since the document was last persisted)
 * the newly-finalized result(s) for those events. It never talks to the
 * database itself; the caller (universalChallengeStore.js / the API routes)
 * is responsible for persisting the returned `events` back onto the document
 * when `changed` is true.
 *
 * IDEMPOTENCY — the only non-deterministic step anywhere in this engine is
 * tie-break resolution (Math.random, when `ruleConfig.tieBreak` is 'random'
 * or falls back to it). That randomness is invoked at most ONCE per event:
 * an event whose `state` is already 'resolved' (persisted) is NEVER re-run
 * through the Rule Engine — its stored `result` is authoritative and is
 * simply replayed to update participant status. Only an event that is
 * *newly* found to be closed (now past its voting window, still
 * pending/active in the stored doc) is resolved here, exactly once, and the
 * caller must persist that resolution before the randomness could be
 * "re-rolled" on a subsequent read. This is what makes the overall system
 * safely re-computable from stored history rather than relying on
 * unrepeatable side effects.
 *
 * NEXT-EVENT PARTICIPANT DERIVATION — an event opts into auto-derivation by
 * setting `event.autoAdvanceFrom` to a source event id (or array of ids).
 * Once ALL of those source events are resolved, this engine computes the
 * event's *effective* participantIds as:
 *     dedupe([ ...carryForwardIds(source event), ...event.participantIds ])
 * restricted to participants who are still ACTIVE. This lets the customer's
 * exact example be expressed with almost no authored data:
 *     event1 (0-5s):  participantIds=[A,B],  rule=SEQUENTIAL_MATCHUP
 *     event2 (5-10s): participantIds=[C],    rule=SEQUENTIAL_MATCHUP, autoAdvanceFrom='event1'
 *     event3 (10-15s):participantIds=[D],    rule=SEQUENTIAL_MATCHUP, autoAdvanceFrom='event2'
 * event2's actual participants become [winner(event1), C] the moment event1
 * resolves — never manually re-authored — and so on down the chain. The
 * derived list is written back onto `event.participantIds` once resolved
 * (matching the schema comment "may be auto-populated from a prior event's
 * result"), so the persisted document is self-describing after the fact.
 *
 * WHAT "CARRIES FORWARD" DEPENDS ON THE SOURCE EVENT'S RULE (additive,
 * Phase 2 — see `sourceResultCarryIds` below and
 * lib/universalChallengeParticipantStructures.js's PROGRESSIVE_CHALLENGE
 * structure): SEQUENTIAL_MATCHUP (and every other rule) carries forward
 * `result.winners` — a single advancing participant, exactly as before this
 * phase. SURVIVAL is the one exception: it never populates `winners` at
 * all (a "survival" round doesn't crown a single winner, it narrows a
 * field), so its stage-to-stage chaining instead carries forward
 * `result.passed` — every participant who was NOT eliminated this stage.
 * This is discriminated purely by the SOURCE event's `rule`, with zero new
 * persisted field — `autoAdvanceFrom` keeps meaning exactly the same thing
 * ("populate this event's participants from that earlier event's outcome")
 * for both the single-winner and carry-forward-survivors cases.
 *
 * WINNER vs ACTIVE at intermediate stages — a participant who wins an event
 * that FEEDS a downstream event (i.e. some other event's `autoAdvanceFrom`
 * points at it) is not yet a "WINNER" of the Challenge — they simply
 * continue, so this engine keeps them ACTIVE. Only a winner of an event
 * with no downstream consumer is promoted to the terminal WINNER status
 * (the champion of a bracket, or the outright winner of a single-event
 * challenge). SURVIVAL's carried-forward survivors are tagged PASSED (not
 * WINNER) by the rule engine itself, so this promotion logic never even
 * applies to them — a Progressive Challenge's "who ultimately won" is
 * instead read off each participant's final per-stage status by the
 * dedicated summary helper (`computeProgressiveStandings`, see
 * lib/universalChallengeParticipantStructures.js), since "reaching the
 * furthest stage, ties allowed" isn't the generic single-WINNER shape this
 * engine's promotion rule already covers.
 */

import { resolveEvent, PARTICIPANT_STATUS, RULES } from './challengeRuleEngine'

const TERMINAL_STATUSES = new Set([
  PARTICIPANT_STATUS.ELIMINATED,
  PARTICIPANT_STATUS.FAILED,
  PARTICIPANT_STATUS.WINNER,
])

function initialStatusMap(participants) {
  const map = {}
  for (const p of participants || []) map[p.id] = PARTICIPANT_STATUS.ACTIVE
  return map
}

function sourceEventIds(event) {
  if (!event.autoAdvanceFrom) return []
  return Array.isArray(event.autoAdvanceFrom) ? event.autoAdvanceFrom : [event.autoAdvanceFrom]
}

// Which participantId(s) a resolved source event hands forward into a
// downstream chained event — see "WHAT CARRIES FORWARD..." in the module
// docstring above. Rule-discriminated, not structure-discriminated: any
// event authored with `rule: SURVIVAL` (whether or not it's tagged with the
// PROGRESSIVE_CHALLENGE participantStructure) carries forward its
// survivors; every other rule keeps carrying forward its single winner,
// unchanged from before this phase.
function sourceResultCarryIds(src) {
  if (src.rule === RULES.SURVIVAL) return src.result?.passed || []
  return src.result?.winners || []
}

// Which event ids are consumed as a source by some other event — used to
// decide whether a winner should be promoted to the terminal WINNER status
// or should simply remain ACTIVE (still advancing through the chain).
function computeConsumedEventIds(events) {
  const consumed = new Set()
  for (const e of events) {
    for (const srcId of sourceEventIds(e)) consumed.add(srcId)
  }
  return consumed
}

function effectiveVotingWindow(event) {
  const start = Number(event.votingWindow?.start ?? event.startTime)
  const end = Number(event.votingWindow?.end ?? event.endTime)
  return { start, end }
}

function computeEventPhase(event, currentTime, hasFullParticipants) {
  if (!hasFullParticipants) return 'pending'
  const { start, end } = effectiveVotingWindow(event)
  if (currentTime < start) return 'pending'
  if (currentTime >= end) return 'closed' // ready to resolve, not a persisted state value
  return 'active'
}

// Applies a verdict's per-participant updates onto `statusMap`, downgrading
// any WINNER assignment to ACTIVE when `eventId` feeds a downstream event
// (see module docstring). Never overwrites a participant already in a
// terminal status from an earlier event (ELIMINATED/FAILED/WINNER stick).
function applyStateUpdates(statusMap, stateUpdates, eventId, consumedEventIds) {
  for (const [participantId, rawStatus] of Object.entries(stateUpdates || {})) {
    if (TERMINAL_STATUSES.has(statusMap[participantId]) && statusMap[participantId] !== PARTICIPANT_STATUS.ACTIVE) {
      // Already eliminated/failed/won earlier — do not resurrect.
      continue
    }
    const status = (rawStatus === PARTICIPANT_STATUS.WINNER && consumedEventIds.has(eventId))
      ? PARTICIPANT_STATUS.ACTIVE
      : rawStatus
    statusMap[participantId] = status
  }
}

// Re-derives the same "downgrade WINNER if consumed" logic for an ALREADY
// resolved event being replayed from storage (idempotent path) — computed
// straight from the persisted `result`, never re-invoking the Rule Engine.
function stateUpdatesFromStoredResult(result) {
  const updates = {}
  for (const id of result?.winners || []) updates[id] = PARTICIPANT_STATUS.WINNER
  for (const id of result?.eliminated || []) updates[id] = PARTICIPANT_STATUS.ELIMINATED
  for (const id of result?.failed || []) updates[id] = PARTICIPANT_STATUS.FAILED
  for (const id of result?.passed || []) updates[id] = PARTICIPANT_STATUS.PASSED
  return updates
}

function dedupe(arr) {
  return [...new Set(arr)]
}

/**
 * Recomputes the full state of a Challenge.
 *
 * @param {object} challenge - { participants, events } as persisted (schemaVersion 1 doc).
 * @param {number} currentTime - playback position (seconds) driving auto-resolution + "active event" lookup.
 * @returns {{
 *   participants: Array<{id, label, avatarUrl, status}>,
 *   events: Array<event>,     // events with participantIds/state/result/inputs updated as needed
 *   activeEventId: string|null,
 *   changed: boolean,         // true if any event was newly resolved / had participantIds newly derived this pass -> caller MUST persist `events`
 * }}
 */
export function computeChallengeState(challenge, currentTime) {
  const participants = challenge.participants || []
  const eventsIn = [...(challenge.events || [])].sort((a, b) => Number(a.startTime) - Number(b.startTime))
  const eventsById = new Map(eventsIn.map((e) => [e.id, e]))
  const consumedEventIds = computeConsumedEventIds(eventsIn)

  const statusMap = initialStatusMap(participants)
  const events = []
  let changed = false
  let activeEventId = null

  for (const original of eventsIn) {
    const event = { ...original, ruleConfig: { ...(original.ruleConfig || {}) } }

    // ---- Replay already-resolved events (idempotent path, no rule engine
    // re-invocation, no fresh randomness). ----
    if (event.state === 'resolved' && event.result) {
      applyStateUpdates(statusMap, stateUpdatesFromStoredResult(event.result), event.id, consumedEventIds)
      events.push(event)
      continue
    }

    // ---- Derive effective participantIds from source event(s), if configured. ----
    const srcIds = sourceEventIds(event)
    let effectiveParticipantIds = Array.isArray(event.participantIds) ? [...event.participantIds] : []
    let sourcesReady = true
    if (srcIds.length > 0) {
      const derivedIds = []
      for (const srcId of srcIds) {
        const src = eventsById.get(srcId)
        if (!src || src.state !== 'resolved' || !src.result) {
          // Look at what we've already resolved earlier in THIS pass too
          // (a chain can resolve multiple links in one read).
          const resolvedNow = events.find((e) => e.id === srcId && e.state === 'resolved' && e.result)
          if (!resolvedNow) { sourcesReady = false; continue }
          derivedIds.push(...sourceResultCarryIds(resolvedNow))
          continue
        }
        derivedIds.push(...sourceResultCarryIds(src))
      }
      if (sourcesReady) {
        // Same eligibility rule as the Rule Engine's eligibleParticipantIds:
        // only ELIMINATED/FAILED/WINNER permanently remove a participant.
        const merged = dedupe([...derivedIds, ...effectiveParticipantIds]).filter((id) => !TERMINAL_STATUSES.has(statusMap[id]))
        if (JSON.stringify(merged) !== JSON.stringify(event.participantIds || [])) changed = true
        effectiveParticipantIds = merged
      }
    }

    // A PREDICTION event authored purely against creator-defined `options`
    // (Guess the Action / Two-Side Choice / Majority Choice — see
    // lib/universalChallengeParticipantStructures.js) deliberately has NO
    // participants engaged at all — the vote is about an option, not a
    // participant — so it must still be able to progress pending -> active
    // -> closed on the video timeline even though `effectiveParticipantIds`
    // stays empty forever. challengeRuleEngine.js's resolveEvent()/prediction()
    // already know how to resolve such an event purely from its `options`.
    const isOptionsOnlyPrediction = event.rule === RULES.PREDICTION && Array.isArray(event.options) && event.options.length > 0
    // STEP 3 (Advanced Mode gap-fill, numeric prediction) — same story as
    // isOptionsOnlyPrediction above, but with NEITHER options NOR
    // participants at all (a numeric guess isn't "about" any of them —
    // see the numeric branch of challengeRuleEngine.js `prediction()`).
    // Without this bypass such an event would sit at `state: 'pending'`
    // forever (hasFullParticipants always false), never reaching
    // 'active'/'closed'/'resolved' no matter how far past its window
    // `currentTime` advances — this was the exact bug caught by
    // scripts/test_numeric_prediction_e2e.mjs.
    const isNumericPrediction = event.rule === RULES.PREDICTION && event.ruleConfig?.predictionType === 'numeric'
    const hasFullParticipants = sourcesReady && (effectiveParticipantIds.length > 0 || isOptionsOnlyPrediction || isNumericPrediction)
    const phase = computeEventPhase(event, currentTime, hasFullParticipants)

    if (phase === 'pending') {
      event.participantIds = effectiveParticipantIds
      event.state = 'pending'
      events.push(event)
      continue
    }

    if (phase === 'active') {
      event.participantIds = effectiveParticipantIds
      event.state = 'active'
      activeEventId = event.id
      events.push(event)
      continue
    }

    // ---- phase === 'closed': auto-resolve now, exactly once. ----
    event.participantIds = effectiveParticipantIds
    // DIRECTLY-AUTHORED (non-chained) participants must stay eligible for
    // THIS event even if an EARLIER, unrelated event already gave them a
    // terminal status (ELIMINATED/FAILED/WINNER) — e.g. ONE_VS_ALL's fixed
    // anchor after winning an earlier independent matchup, or ALL_VS_ALL's
    // round-robin participants after their first win/loss. Only a CHAINED
    // (autoAdvanceFrom-derived) event's participant list is meant to
    // already exclude terminal participants, which happens above at
    // derivation time (`.filter((id) => !TERMINAL_STATUSES.has(statusMap[id]))`)
    // — so this reset is scoped to `srcIds.length === 0` only, leaving
    // every chained event (Sequential Tournament, Progressive Challenge
    // stages) and every participant's FIRST appearance (already ACTIVE)
    // completely unaffected. It resolves against a LOCAL copy so the real
    // `statusMap` still accumulates each participant's true final standing
    // for the generic per-participant status field.
    const resolveStatusMap = srcIds.length === 0 ? { ...statusMap } : statusMap
    if (srcIds.length === 0) {
      for (const pid of effectiveParticipantIds) {
        if (TERMINAL_STATUSES.has(resolveStatusMap[pid])) resolveStatusMap[pid] = PARTICIPANT_STATUS.ACTIVE
      }
    }
    const verdict = resolveEvent(event, event.inputs || [], resolveStatusMap)
    applyStateUpdates(statusMap, verdict.stateUpdates, event.id, consumedEventIds)
    event.result = verdict.result
    event.state = 'resolved'
    changed = true
    events.push(event)
  }

  const participantsOut = participants.map((p) => ({ ...p, status: statusMap[p.id] || PARTICIPANT_STATUS.ACTIVE }))

  return { participants: participantsOut, events, activeEventId, changed }
}

// Convenience: is `currentTime` within an event's accept-input window? Used
// by the vote/measurement-cast route to reject input for a closed event
// instead of silently accepting votes nobody will ever count (window is
// the source of truth per the customer's explicit decision).
export function isEventOpenForInput(event, currentTime) {
  if (event.state === 'resolved') return false
  const { start, end } = effectiveVotingWindow(event)
  return currentTime >= start && currentTime < end
}

export default { computeChallengeState, isEventOpenForInput }
