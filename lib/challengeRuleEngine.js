/**
 * Universal Challenge Engine — Rule Engine.
 *
 * ADDITIVE, NEW MODULE. Has zero relationship to `lib/challengeMechanics.js`
 * / `lib/challengeEngineStore.js` (the legacy poll-scheduling "Challenge
 * Engine" that powers `postChallenges` + `challengeVotes`). Nothing here is
 * imported by, or imports from, those files. See `lib/universalChallengeStore.js`
 * for the new persistence layer and `lib/challengeStateEngine.js` for how a
 * verdict returned from here is turned into participant-status transitions
 * across a whole Challenge.
 *
 * Every rule is a pure function: (event, inputs, participantStates) => verdict.
 *   - event: the event object from `universalChallenges.events[]` (must
 *     include `rule`, `ruleConfig`, `participantIds`, and whatever
 *     rule-specific fields it needs — options/question for vote-shaped
 *     rules, measurementSource for measurement-shaped ones).
 *   - inputs: the raw collected inputs/votes/measurements for this event so
 *     far, i.e. `event.inputs` (array of { participantId?, optionId?,
 *     userId?, value?, timeMs?, letters?, ... } — shape depends on rule).
 *   - participantStates: Map/plain-object of participantId -> current
 *     status (ACTIVE/ELIMINATED/FAILED/PASSED/WINNER), as tracked by the
 *     State Engine BEFORE this event is applied. Rules may read this (e.g.
 *     to only consider currently-ACTIVE participants) but never mutate it
 *     directly — they return updates, the State Engine applies them.
 *
 * A verdict is always shaped:
 * {
 *   winners: string[],            // participantId(s) the rule declares as winner/advancing
 *   eliminated: string[],         // participantId(s) removed by this event
 *   failed: string[],             // participantId(s) that failed (INPUT_VALIDATION etc.)
 *   passed: string[],             // participantId(s) that merely advance without "winning"
 *   stateUpdates: { [participantId]: 'ACTIVE'|'ELIMINATED'|'FAILED'|'PASSED'|'WINNER' },
 *   nextEventParticipantIds: string[] | null,  // for SEQUENTIAL_MATCHUP-style
 *                                               // chaining: who should populate
 *                                               // the next linked event
 *   result: {                      // the finalized, persisted `event.result`
 *     rule, resolvedAt, winners, eliminated, failed, passed,
 *     tieBreakApplied, tieBreakMethod, insufficientVotesFallbackApplied,
 *     details: { ... rule-specific breakdown, e.g. tally/measurements },
 *   },
 * }
 *
 * TIE-BREAK — every rule that can tie funnels through resolveTie() below,
 * which consults `event.ruleConfig.tieBreak`:
 *   - 'creator_defined' -> use `event.ruleConfig.tieBreakWinnerId` (a
 *     creator-specified fallback winner) if provided; if that id isn't
 *     even one of the tied candidates, falls through to 'random' so the
 *     event never hangs unresolved.
 *   - 'random'           -> deterministically-seeded-at-call-time random
 *     pick among the tied candidates (Math.random by default; a `rng`
 *     function can be injected for tests).
 *   Default (no tieBreak configured) is 'random', so a rule is NEVER left
 *   without a resolution.
 *
 * INSUFFICIENT-VOTES FALLBACK — vote-shaped rules (ELIMINATION,
 * SEQUENTIAL_MATCHUP, vote-driven COMPARISON, and PREDICTION when
 * `ruleConfig.outcomeMode: 'vote_tally'` — see `prediction()` below;
 * PREDICTION's default 'reveal' mode never calls this, by design) consult
 * `event.ruleConfig.insufficientVotesFallback`:
 *   - 'most_votes_at_close' (default) -> resolve with whatever votes exist
 *     the moment the window closes (including zero votes, in which case the
 *     tie-break path is used to pick among all eligible participants) —
 *     never wait indefinitely, per the customer's explicit requirement.
 * This is only ever consulted by the auto-resolution path (state engine /
 * API layer) at window close — a rule function itself doesn't know "time",
 * it is simply always called with "the inputs that exist right now".
 *
 * PHASE 2 ADDITIVE EXTENSIONS (Universal Challenge Engine, "Participant
 * Structures" second pass — see lib/universalChallengeParticipantStructures.js):
 *   - RANKING OUTPUT MODE: HIGHEST_SCORE / LOWEST_SCORE / COMPARISON accept
 *     `ruleConfig.outputMode: 'winner' | 'full_ranking'` (default 'winner',
 *     so every event authored before this phase is completely unchanged).
 *     'full_ranking' additionally attaches `result.ranking =
 *     [{participantId, rank, value}]` via the shared `competitionRanking()`
 *     helper (standard competition/"1224" ranking — ties share a rank, the
 *     next distinct value skips ahead). Powers the "Order/Ranking"
 *     structure, and is reused as-is by ALL_VS_ALL's cross-event win-count
 *     standings (nothing about ranking is implemented twice).
 *   - SURVIVAL `ruleConfig.conditionMode: 'per_participant_pass_fail'`: a
 *     second, DATA-driven (not function-driven) way to decide who a round
 *     eliminates — each eligible participant's own submitted boolean input
 *     decides their own fate, rather than a single group
 *     `ruleConfig.condition` predicate (which can never be persisted to the
 *     database anyway — see universalChallengeStore.js normalizeRuleConfig).
 *     Powers the "Progressive Challenge" structure's per-stage creator-
 *     marked pass/fail. Still the same RULES.SURVIVAL identifier — no new
 *     rule was added.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export const PARTICIPANT_STATUS = {
  ACTIVE: 'ACTIVE',
  ELIMINATED: 'ELIMINATED',
  FAILED: 'FAILED',
  PASSED: 'PASSED',
  WINNER: 'WINNER',
}

export const RULES = {
  HIGHEST_SCORE: 'HIGHEST_SCORE',
  LOWEST_SCORE: 'LOWEST_SCORE',
  FASTEST: 'FASTEST',
  FIRST_TO_OBJECTIVE: 'FIRST_TO_OBJECTIVE',
  ELIMINATION: 'ELIMINATION',
  SEQUENTIAL_MATCHUP: 'SEQUENTIAL_MATCHUP',
  PREDICTION: 'PREDICTION',
  INPUT_VALIDATION: 'INPUT_VALIDATION',
  SURVIVAL: 'SURVIVAL',
  COMPARISON: 'COMPARISON',
}

function statusOf(participantStates, id) {
  if (!participantStates) return PARTICIPANT_STATUS.ACTIVE
  if (participantStates instanceof Map) return participantStates.get(id) || PARTICIPANT_STATUS.ACTIVE
  return participantStates[id] || PARTICIPANT_STATUS.ACTIVE
}

// Participants this event is actually about, restricted to ones NOT
// already terminally removed. Only ELIMINATED/FAILED (and WINNER, a
// terminal champion designation) permanently remove a participant from
// future events — PASSED means "passed THIS round" and remains eligible
// for a subsequent event involving the same participants (e.g. a second,
// later INPUT_VALIDATION round). ACTIVE is of course always eligible.
function eligibleParticipantIds(event, participantStates) {
  const ids = Array.isArray(event.participantIds) ? event.participantIds : []
  return ids.filter((id) => {
    const status = statusOf(participantStates, id)
    return status !== PARTICIPANT_STATUS.ELIMINATED && status !== PARTICIPANT_STATUS.FAILED && status !== PARTICIPANT_STATUS.WINNER
  })
}

function makeRng(seedFn) {
  return typeof seedFn === 'function' ? seedFn : Math.random
}

// ---------------------------------------------------------------------------
// RANKING (additive, Phase 2 — Universal Challenge Engine "Order/Ranking").
//
// Standard competition ranking ("1224" ranking): equal values earn equal
// rank, and the NEXT distinct value's rank is (count of strictly-better
// entries) + 1 — i.e. ties consume rank slots rather than compressing them.
// Example: values [10, 8, 8, 5] (desc) -> ranks [1, 2, 2, 4].
//
// This is a pure, shared helper — NOT a new rule. It is opt-in, additive
// output attached to an EXISTING rule's `result` only when
// `event.ruleConfig.outputMode === 'full_ranking'` (see `measurementVerdict`/
// `comparison` below), and is also reused as-is (imported directly) by
// `lib/universalChallengeParticipantStructures.js` for the ALL_VS_ALL
// structure's cross-event win-count standings, per the customer's explicit
// instruction not to invent a second ranking/summary format.
//
// `entries`: [{ participantId, value }] — `value` may be null/undefined for
// a participant with nothing to rank (e.g. never submitted); such entries
// are appended at the end with `rank: null` rather than guessed at.
// `direction`: 'desc' (higher value ranks better — HIGHEST_SCORE, COMPARISON
// default, win-count tallies) or 'asc' (lower value ranks better —
// LOWEST_SCORE).
export function competitionRanking(entries, direction = 'desc') {
  const list = Array.isArray(entries) ? entries : []
  const withValue = list.filter((e) => Number.isFinite(e.value))
  const withoutValue = list.filter((e) => !Number.isFinite(e.value))
  const sorted = [...withValue].sort((a, b) => (direction === 'asc' ? a.value - b.value : b.value - a.value))
  const ranking = []
  let rank = 0
  let prevValue = null
  sorted.forEach((e, idx) => {
    if (idx === 0 || e.value !== prevValue) rank = idx + 1
    ranking.push({ participantId: e.participantId, rank, value: e.value })
    prevValue = e.value
  })
  for (const e of withoutValue) ranking.push({ participantId: e.participantId, rank: null, value: null })
  return ranking
}

// Resolves a tie among `candidateIds` per `ruleConfig.tieBreak`. Always
// returns exactly one id (or the full candidate list if candidates.length
// is 0, which should never happen but is guarded anyway) — never returns
// null/undefined, so callers can never "hang".
export function resolveTie(candidateIds, ruleConfig = {}, opts = {}) {
  const candidates = [...new Set(candidateIds)].filter(Boolean)
  if (candidates.length <= 1) {
    return { winnerId: candidates[0] || null, tieBreakApplied: false, tieBreakMethod: null }
  }
  const method = ruleConfig.tieBreak || 'random'
  const rng = makeRng(opts.rng)

  if (method === 'creator_defined') {
    const defined = ruleConfig.tieBreakWinnerId
    if (defined && candidates.includes(defined)) {
      return { winnerId: defined, tieBreakApplied: true, tieBreakMethod: 'creator_defined' }
    }
    // Creator didn't (or couldn't) define a valid fallback among the tied
    // candidates — fall through to random so we never hang.
    const idx = Math.floor(rng() * candidates.length)
    return { winnerId: candidates[idx], tieBreakApplied: true, tieBreakMethod: 'random_fallback' }
  }

  // 'random' (default)
  const idx = Math.floor(rng() * candidates.length)
  return { winnerId: candidates[idx], tieBreakApplied: true, tieBreakMethod: 'random' }
}

function baseResult(event, extra) {
  return {
    rule: event.rule,
    resolvedAt: new Date().toISOString(),
    winners: [],
    eliminated: [],
    failed: [],
    passed: [],
    tieBreakApplied: false,
    tieBreakMethod: null,
    insufficientVotesFallbackApplied: false,
    details: {},
    ...extra,
  }
}

function emptyVerdict(event) {
  return {
    winners: [],
    eliminated: [],
    failed: [],
    passed: [],
    stateUpdates: {},
    nextEventParticipantIds: null,
    result: baseResult(event),
  }
}

function buildStateUpdates({ winners = [], eliminated = [], failed = [], passed = [] }) {
  const updates = {}
  for (const id of winners) updates[id] = PARTICIPANT_STATUS.WINNER
  for (const id of eliminated) updates[id] = PARTICIPANT_STATUS.ELIMINATED
  for (const id of failed) updates[id] = PARTICIPANT_STATUS.FAILED
  for (const id of passed) updates[id] = PARTICIPANT_STATUS.PASSED
  return updates
}

// ---------------------------------------------------------------------------
// Measurement-shaped rules: HIGHEST_SCORE / LOWEST_SCORE / FASTEST /
// FIRST_TO_OBJECTIVE. All four reduce to "pick best measurement, tie-break
// if needed" — same shape as the legacy engine's insight that 25 mechanics
// reduce to 7 input types; here 4 "measurement" rules reduce to one
// comparator utility.
// ---------------------------------------------------------------------------

// inputs: [{ participantId, value }]  (value = numeric score, or ms elapsed,
// or a completion timestamp depending on rule — see comparator per rule)
function measurementVerdict(event, inputs, participantStates, { pickBest, field = 'value', rankDirection }) {
  const eligible = eligibleParticipantIds(event, participantStates)
  const byParticipant = new Map()
  for (const inp of inputs || []) {
    if (!eligible.includes(inp.participantId)) continue
    byParticipant.set(inp.participantId, Number(inp[field]))
  }

  // OUTPUT MODE (additive, Phase 2) — `event.ruleConfig.outputMode ===
  // 'full_ranking'` asks this rule to ALSO return a fully-ordered
  // `ranking: [{participantId, rank, value}]` array alongside its existing
  // single-winner output, via the shared `competitionRanking` helper above.
  // Default ('winner', or unset — every event authored before this phase)
  // leaves `result.ranking` unset and every existing field byte-for-byte
  // unchanged. `rankDirection` is only ever passed by HIGHEST_SCORE/
  // LOWEST_SCORE below (not FASTEST) — see module docstring for scope.
  const wantsRanking = rankDirection && event.ruleConfig?.outputMode === 'full_ranking'
  const rankingOf = () => competitionRanking(eligible.map((id) => ({ participantId: id, value: byParticipant.has(id) ? byParticipant.get(id) : null })), rankDirection)

  const withValues = eligible.filter((id) => byParticipant.has(id) && Number.isFinite(byParticipant.get(id)))
  if (withValues.length === 0) {
    // Nothing usable submitted at all — apply insufficient-data fallback by
    // tie-breaking across every eligible participant so the event still
    // resolves rather than hanging.
    const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(eligible, event.ruleConfig)
    const winners = winnerId ? [winnerId] : []
    const eliminated = eligible.filter((id) => id !== winnerId)
    return {
      winners,
      eliminated,
      failed: [],
      passed: [],
      stateUpdates: buildStateUpdates({ winners, eliminated }),
      nextEventParticipantIds: winners,
      result: baseResult(event, {
        winners,
        eliminated,
        tieBreakApplied,
        tieBreakMethod,
        insufficientVotesFallbackApplied: true,
        details: { measurements: {}, note: 'no_measurements_submitted' },
        ...(wantsRanking ? { ranking: rankingOf() } : {}),
      }),
    }
  }

  const best = pickBest(withValues.map((id) => byParticipant.get(id)))
  const tied = withValues.filter((id) => byParticipant.get(id) === best)
  const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(tied, event.ruleConfig)
  const winners = winnerId ? [winnerId] : []
  const eliminated = eligible.filter((id) => id !== winnerId)

  const measurements = {}
  for (const id of eligible) measurements[id] = byParticipant.has(id) ? byParticipant.get(id) : null

  return {
    winners,
    eliminated,
    failed: [],
    passed: [],
    stateUpdates: buildStateUpdates({ winners, eliminated }),
    nextEventParticipantIds: winners,
    result: baseResult(event, {
      winners,
      eliminated,
      tieBreakApplied,
      tieBreakMethod,
      details: { measurements },
      ...(wantsRanking ? { ranking: rankingOf() } : {}),
    }),
  }
}

// HIGHEST_SCORE — highest numeric measurement wins. `rankDirection: 'desc'`
// opts this rule in to the additive full-ranking output mode above.
function highestScore(event, inputs, participantStates) {
  return measurementVerdict(event, inputs, participantStates, { pickBest: (vals) => Math.max(...vals), rankDirection: 'desc' })
}

// LOWEST_SCORE — lowest numeric measurement wins (e.g. fewest ball bounces).
// `rankDirection: 'asc'` opts this rule in to the full-ranking output mode.
function lowestScore(event, inputs, participantStates) {
  return measurementVerdict(event, inputs, participantStates, { pickBest: (vals) => Math.min(...vals), rankDirection: 'asc' })
}

// FASTEST — lowest recorded time wins. `rankDirection: 'asc'` opts this
// rule in to the additive full-ranking output mode above — BUGFIX: this
// was previously omitted (unlike HIGHEST_SCORE/LOWEST_SCORE, which both
// pass a rankDirection), so `ruleConfig.outputMode: 'full_ranking'`
// silently produced no `result.ranking` for FASTEST specifically (see
// `measurementVerdict`'s `wantsRanking = rankDirection && ...` gate
// above). Same "lower is better" semantic as LOWEST_SCORE (just measured
// via the `timeMs` field instead of `value`) — the fastest time should
// rank #1 — so 'asc' is the correct direction here too, not a blind copy.
function fastest(event, inputs, participantStates) {
  return measurementVerdict(event, inputs, participantStates, { pickBest: (vals) => Math.min(...vals), field: 'timeMs', rankDirection: 'asc' })
}

// FIRST_TO_OBJECTIVE — first participant whose completion timestamp is
// earliest wins; others remain ACTIVE/not-yet-finished depending on config
// (ruleConfig.eliminateNonFinishers, default false: a video challenge often
// wants the rest to simply continue existing rather than be eliminated).
function firstToObjective(event, inputs, participantStates) {
  const eligible = eligibleParticipantIds(event, participantStates)
  const byParticipant = new Map()
  for (const inp of inputs || []) {
    if (!eligible.includes(inp.participantId)) continue
    const t = Number(inp.completedAtMs ?? inp.timeMs ?? inp.value)
    if (Number.isFinite(t)) byParticipant.set(inp.participantId, t)
  }
  const finished = eligible.filter((id) => byParticipant.has(id))

  if (finished.length === 0) {
    const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(eligible, event.ruleConfig)
    const winners = winnerId ? [winnerId] : []
    const eliminateOthers = !!event.ruleConfig?.eliminateNonFinishers
    const others = eligible.filter((id) => id !== winnerId)
    const eliminated = eliminateOthers ? others : []
    const passed = eliminateOthers ? [] : others
    return {
      winners,
      eliminated,
      failed: [],
      passed,
      stateUpdates: buildStateUpdates({ winners, eliminated, passed }),
      nextEventParticipantIds: winners,
      result: baseResult(event, { winners, eliminated, passed, tieBreakApplied, tieBreakMethod, insufficientVotesFallbackApplied: true, details: { completions: {}, note: 'no_completions_submitted' } }),
    }
  }

  const earliest = Math.min(...finished.map((id) => byParticipant.get(id)))
  const tied = finished.filter((id) => byParticipant.get(id) === earliest)
  const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(tied, event.ruleConfig)
  const winners = winnerId ? [winnerId] : []
  const eliminateOthers = !!event.ruleConfig?.eliminateNonFinishers
  const others = eligible.filter((id) => id !== winnerId)
  const eliminated = eliminateOthers ? others : []
  const passed = eliminateOthers ? [] : others

  const completions = {}
  for (const id of eligible) completions[id] = byParticipant.has(id) ? byParticipant.get(id) : null

  return {
    winners,
    eliminated,
    failed: [],
    passed,
    stateUpdates: buildStateUpdates({ winners, eliminated, passed }),
    nextEventParticipantIds: winners,
    result: baseResult(event, { winners, eliminated, passed, tieBreakApplied, tieBreakMethod, details: { completions } }),
  }
}

// ---------------------------------------------------------------------------
// Vote-shaped rules: ELIMINATION / PREDICTION / SEQUENTIAL_MATCHUP /
// COMPARISON. All tally `inputs: [{ userId, optionId }]` against
// `event.options` (reusing the existing option shape, each option.id maps
// 1:1 to a participantId for these rules).
// ---------------------------------------------------------------------------

function tally(event, inputs, eligibleOptionIds) {
  const counts = {}
  for (const id of eligibleOptionIds) counts[id] = 0
  for (const inp of inputs || []) {
    const optId = inp.optionId ?? inp.selection
    if (optId in counts) counts[optId] += 1
  }
  return counts
}

// ELIMINATION — the vote/result determines who is removed; remaining
// participants stay ACTIVE. Consults `insufficientVotesFallback` (default
// 'most_votes_at_close'): resolves with whatever votes exist at close,
// including zero votes (tie-break across all candidates in that case).
function elimination(event, inputs, participantStates) {
  const eligible = eligibleParticipantIds(event, participantStates)
  const counts = tally(event, inputs, eligible)
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0)

  let candidatesForElimination
  let insufficientVotesFallbackApplied = false
  if (totalVotes === 0) {
    // No votes at all by close: fallback picks among everyone eligible.
    candidatesForElimination = eligible
    insufficientVotesFallbackApplied = true
  } else {
    const max = Math.max(...Object.values(counts))
    candidatesForElimination = eligible.filter((id) => counts[id] === max)
  }

  const { winnerId: eliminatedId, tieBreakApplied, tieBreakMethod } = resolveTie(candidatesForElimination, event.ruleConfig)
  const eliminated = eliminatedId ? [eliminatedId] : []
  const winners = eligible.filter((id) => !eliminated.includes(id)) // remaining stay active/advancing

  return {
    winners,
    eliminated,
    failed: [],
    passed: winners,
    stateUpdates: buildStateUpdates({ eliminated, passed: winners }),
    nextEventParticipantIds: winners,
    result: baseResult(event, {
      winners,
      eliminated,
      passed: winners,
      tieBreakApplied,
      tieBreakMethod,
      insufficientVotesFallbackApplied,
      details: { tally: counts, totalVotes },
    }),
  }
}

// SEQUENTIAL_MATCHUP — two (or configured N) participants face off; the
// winner automatically becomes a participant in the next linked event, the
// loser becomes ELIMINATED. Uses community vote tally by default (same as
// ELIMINATION's tally step) but resolves to WINNER/ELIMINATED rather than
// ADVANCING/REMOVED semantics, and always emits `nextEventParticipantIds`
// so the State Engine can auto-populate the next chained event.
function sequentialMatchup(event, inputs, participantStates) {
  const eligible = eligibleParticipantIds(event, participantStates)
  const counts = tally(event, inputs, eligible)
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0)

  let candidates
  let insufficientVotesFallbackApplied = false
  if (totalVotes === 0) {
    candidates = eligible
    insufficientVotesFallbackApplied = true
  } else {
    const max = Math.max(...Object.values(counts))
    candidates = eligible.filter((id) => counts[id] === max)
  }

  const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(candidates, event.ruleConfig)
  const winners = winnerId ? [winnerId] : []
  const eliminated = eligible.filter((id) => id !== winnerId)

  return {
    winners,
    eliminated,
    failed: [],
    passed: [],
    stateUpdates: buildStateUpdates({ winners, eliminated }),
    // This is the field the State Engine reads to auto-derive the NEXT
    // linked event's participantIds (winner carries forward).
    nextEventParticipantIds: winners,
    result: baseResult(event, {
      winners,
      eliminated,
      tieBreakApplied,
      tieBreakMethod,
      insufficientVotesFallbackApplied,
      details: { tally: counts, totalVotes },
    }),
  }
}

// PREDICTION — community predicts an outcome; reveal/correctness handled per
// the existing `reveal` pattern (legacy engine's `settings.correctOptionId`,
// only revealed to a viewer once they've predicted, or to the author). Here
// the "correct" outcome is `event.ruleConfig.correctOptionId`, set by the
// creator (possibly after the fact, e.g. once the real-world outcome is
// known) before/at resolution time.
//
// TALLY TARGET — when the event has explicit `options` authored (a
// free-text prediction question, or — additive, see below — Team vs
// Team's two teams-as-options), votes are ALWAYS tallied against those
// options, never against `participantIds` (which, for a TEAM_VS_TEAM
// event, are merely the flattened rosters of both teams carried along for
// schema consistency with the measurement-based version of that
// structure — never the vote target themselves). Only when NO options
// were authored at all (a bare vote-about-a-participant PREDICTION, e.g.
// GUESS_THE_ACTOR) does the tally fall back to eligible participantIds.
// This is a behavior-preserving reordering: every PREDICTION event
// produced by the existing authoring flows has options+participantIds
// mutually exclusive (one is always empty), so this priority change is
// unobservable for them — it only matters for the new options-AND-
// participantIds-both-populated shape TEAM_VS_TEAM's vote path uses.
//
// OUTCOME MODE (additive) — `event.ruleConfig.outcomeMode`:
//   - 'reveal' (default, unset — every PREDICTION event authored before
//     this phase) — UNCHANGED: the winner is whatever `correctOptionId`
//     the creator has (optionally) declared, never derived from the vote
//     tally itself. This is the existing Guess the Actor / Guess the
//     Action / Two-Side Choice / Majority Choice "reveal the true answer"
//     semantic — see module docstring's tie-break/insufficient-votes
//     commentary, which (for THIS mode) never actually applies, since
//     'reveal' never calls resolveTie.
//   - 'vote_tally' (additive) — the winner is derived PURELY from the
//     actual cast votes: highest tally wins, ties resolved via the exact
//     same `resolveTie()` (and `ruleConfig.tieBreak`) every other
//     vote-shaped rule uses, and a still-zero-votes-at-close event falls
//     back to tie-breaking among every option, mirroring ELIMINATION/
//     SEQUENTIAL_MATCHUP's `insufficientVotesFallback` behavior. An
//     opt-in any PREDICTION event may request — but NOT what Team vs
//     Team uses (see below): a viewer's vote there is a PREDICTION about
//     a real outcome, never the thing that decides it, so that structure
//     is forced to 'reveal' instead.
//   - Team vs Team itself (see lib/universalChallengeParticipantStructures.js
//     STRUCTURE_RULE / lib/universalChallengeStore.js createUniversalChallenge)
//     derives `options` from the two teams server-side whenever a
//     TEAM_VS_TEAM event picks the PREDICTION rule, but is FORCED to
//     'reveal' — not 'vote_tally' — with a REQUIRED `correctOptionId`
//     (one of the event's own two teams) the creator confirms as the
//     real result once known (e.g. from the video). The two teams ARE
//     the options, so the winning option IS the winning team — but it is
//     the creator's confirmed real-world result, never a live vote
//     tally, and each viewer's own prediction (their cast optionId) is
//     compared against this same fixed result for their personal
//     correct/incorrect status, completely independent of how anyone
//     else voted. Still zero new entries in RULE_IMPLS — PREDICTION is
//     reused as-is, just with an additive config-gated branch.
function prediction(event, inputs, participantStates) {
  // STEP 3 (Advanced Mode gap-fill, numeric prediction) — additive branch,
  // checked FIRST and completely separate from every existing branch
  // below (which are all now inside the implicit "predictionType ===
  // 'option'" path and are UNCHANGED — this never touches their control
  // flow). Viewers submit a raw number (no options, no participantIds
  // required — see castUniversalChallengeInput's matching bypass in
  // lib/universalChallengeStore.js); there is no vote tally and no
  // "winner" at the engine level, only the creator's own confirmed real
  // value (`ruleConfig.correctValue`, same authoring-time convention
  // `correctOptionId` already uses) plus every submitted guess's
  // distance from it, so the frontend can show each viewer their own
  // "you guessed 75, actual was 80, distance 5" (spec's exact example) —
  // never a cross-viewer ranking, since (exactly like the discrete
  // 'reveal' path) this is anonymous-vote-shaped, not participant-shaped.
  if (event.ruleConfig?.predictionType === 'numeric') {
    const rawCorrect = event.ruleConfig?.correctValue
    const correctValue = Number.isFinite(Number(rawCorrect)) ? Number(rawCorrect) : null
    const revealed = correctValue !== null
    const guesses = (inputs || [])
      .filter((inp) => Number.isFinite(Number(inp?.value)))
      .map((inp) => ({ userId: inp.userId || null, value: Number(inp.value), distance: revealed ? Math.abs(Number(inp.value) - correctValue) : null }))
    return {
      winners: [],
      eliminated: [],
      failed: [],
      passed: [],
      stateUpdates: {},
      nextEventParticipantIds: null,
      result: baseResult(event, {
        winners: [],
        details: { predictionType: 'numeric', correctValue, revealed, totalVotes: guesses.length, guesses },
      }),
    }
  }

  const eligible = eligibleParticipantIds(event, participantStates)
  const hasOptions = Array.isArray(event.options) && event.options.length > 0
  const tallyTargets = hasOptions ? event.options.map((o) => o.id) : eligible
  const counts = tally(event, inputs, tallyTargets)
  const totalVotes = (inputs || []).length
  const outcomeMode = event.ruleConfig?.outcomeMode === 'vote_tally' ? 'vote_tally' : 'reveal'

  if (outcomeMode === 'vote_tally') {
    let candidates
    let insufficientVotesFallbackApplied = false
    if (totalVotes === 0) {
      candidates = tallyTargets
      insufficientVotesFallbackApplied = true
    } else {
      const max = Math.max(...Object.values(counts))
      candidates = tallyTargets.filter((id) => counts[id] === max)
    }
    const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(candidates, event.ruleConfig)
    const winners = winnerId ? [winnerId] : []
    return {
      winners,
      eliminated: [],
      failed: [],
      passed: [],
      stateUpdates: {},
      nextEventParticipantIds: null,
      result: baseResult(event, {
        winners,
        tieBreakApplied,
        tieBreakMethod,
        insufficientVotesFallbackApplied,
        details: { tally: counts, totalVotes, outcomeMode },
      }),
    }
  }

  // 'reveal' (default) — UNCHANGED from before this phase.
  const correctOptionId = event.ruleConfig?.correctOptionId || null

  // PREDICTION doesn't eliminate participants (it's a community vote about
  // an outcome, not a head-to-head) — it resolves to a `result` recording
  // the tally + correct answer, with no participant state changes unless
  // participantIds double as "predicted outcomes" tied to entities.
  return {
    winners: correctOptionId ? [correctOptionId] : [],
    eliminated: [],
    failed: [],
    passed: [],
    stateUpdates: {},
    nextEventParticipantIds: null,
    result: baseResult(event, {
      winners: correctOptionId ? [correctOptionId] : [],
      details: { tally: counts, totalVotes, correctOptionId, revealed: !!correctOptionId, outcomeMode },
    }),
  }
}

// INPUT_VALIDATION — collects input from multiple specified participants,
// combines them (default: concatenation, in participantIds order), runs a
// validation function (pluggable via ruleConfig.validate, default: a
// configurable valid-values check against ruleConfig.validValues), and
// transitions state based on validity.
//
// MISSING-SUBMISSION HANDLING (customer's exact scenario): if a required
// participant's input is absent once the window closes, this function
// (called from the auto-resolution path, which only calls it once the
// window truly has closed) records that participant's contribution as the
// literal string "no_submission", still runs combination/validation (so
// e.g. "M" + "no_submission" is invalid), and then applies
// `ruleConfig.missingSubmissionBehavior`:
//   - 'eliminate' (customer's default for this scenario) -> all required
//     participants are ELIMINATED, event fails.
//   - 'fail_round'    -> all required participants are FAILED (round does
//     not eliminate, but does not pass either).
//   - 'default_value' -> the missing participant's contribution is instead
//     replaced with `ruleConfig.defaultValue` (falls back to '' if unset)
//     before combination/validation runs — validity is then whatever that
//     produces.
//   - 'allow_other_to_continue' -> only the missing participant is
//     penalized (ELIMINATED/FAILED per ruleConfig.missingParticipantStatus,
//     default ELIMINATED); the submitting participant(s) PASS.
// Pure interpreter for the additive, JSON-serializable `ruleConfig.validationSpec`
// alternative to a live `validate` function (INPUT_VALIDATION only -- see
// normalizeRuleConfig in lib/universalChallengeStore.js, which is the only
// place validationSpec is persisted). Only consulted by inputValidation()
// below when ruleConfig.validate is NOT a function and ruleConfig.validationSpec
// IS present -- an event with neither field never calls this. Unknown/malformed
// specs fail closed (return false) rather than throwing, matching the existing
// validValues branch's own fail-closed behavior on a missing/invalid config.
//
// STEP 2 (Advanced Mode gap-fill, generic validation vocabulary) — widened
// from the original two types (`one_of`, `equals`) to the full generic
// condition set the Universal Challenge Engine spec calls for. `one_of`
// and `equals` are UNCHANGED (still their exact original behavior) --
// every new `type` below is purely additive. `valid_option` is an alias
// of `one_of` (same check, friendlier name for the Advanced Editor's
// picker -- see lib/universalChallengeConditionOps.js's VALIDATION_OPS).
// This same function is also reused, unchanged, by SURVIVAL's
// `conditionSpec.value_condition` below -- one vocabulary, two callers.
function evaluateValidationSpec(spec, value) {
  if (!spec || typeof spec !== 'object') return false
  const { type } = spec
  if (type === 'one_of' || type === 'valid_option') return Array.isArray(spec.values) && spec.values.includes(value)
  if (type === 'equals' || type === 'correct_answer') return value === spec.value
  if (type === 'not_equals') return value !== spec.value
  if (type === 'contains') return String(value ?? '').includes(String(spec.value ?? ''))
  if (type === 'starts_with') return String(value ?? '').startsWith(String(spec.value ?? ''))
  if (type === 'ends_with') return String(value ?? '').endsWith(String(spec.value ?? ''))
  if (type === 'greater_than') return Number(value) > Number(spec.value)
  if (type === 'less_than') return Number(value) < Number(spec.value)
  if (type === 'greater_or_equal') return Number(value) >= Number(spec.value)
  if (type === 'less_or_equal') return Number(value) <= Number(spec.value)
  if (type === 'between') return Number(value) >= Number(spec.min) && Number(value) <= Number(spec.max)
  if (type === 'matches') {
    try { return new RegExp(spec.pattern, spec.flags || '').test(String(value ?? '')) } catch { return false }
  }
  // Status-style predicates over the single combined value, for reuse in
  // contexts (e.g. SURVIVAL's per-value conditionSpec) that otherwise only
  // have numeric/text comparisons available: 'completed' = something was
  // actually submitted (not missing/empty); 'passed' = a truthy/"pass"-ish
  // boolean-shaped value, the same convention SURVIVAL's own
  // per_participant_pass_fail mode already uses for creator-submitted
  // pass/fail input.
  if (type === 'completed') return value !== undefined && value !== null && value !== '' && value !== 'no_submission'
  if (type === 'passed') return value === true || value === 'pass' || value === 'passed' || value === 1 || value === '1' || value === 'true'
  return false
}

// Phase 2 additive: pure interpreter for the JSON-serializable
// `ruleConfig.combineSpec` alternative to a live `combine` function
// (INPUT_VALIDATION only -- see normalizeRuleConfig in
// lib/universalChallengeStore.js, the only place combineSpec is
// persisted). Only consulted by inputValidation() below when
// ruleConfig.combine is NOT a function and ruleConfig.combineSpec IS
// present -- an event with neither field is completely unaffected and
// keeps using the existing default (parts.join('')). Unknown/malformed
// specs fail closed to that same default join, rather than throwing.
function evaluateCombineSpec(spec, parts) {
  if (!spec || typeof spec !== 'object') return parts.join('')
  if (spec.type === 'join') return parts.join(typeof spec.separator === 'string' ? spec.separator : '')
  return parts.join('')
}

function inputValidation(event, inputs, participantStates) {
  const required = eligibleParticipantIds(event, participantStates)
  const byParticipant = new Map()
  for (const inp of inputs || []) {
    if (required.includes(inp.participantId)) byParticipant.set(inp.participantId, inp.value ?? inp.letters ?? '')
  }

  const missing = required.filter((id) => !byParticipant.has(id))
  const missingBehavior = event.ruleConfig?.missingSubmissionBehavior || 'eliminate'
  const defaultValue = event.ruleConfig?.defaultValue ?? ''

  const contributions = {}
  for (const id of required) {
    if (byParticipant.has(id)) {
      contributions[id] = byParticipant.get(id)
    } else if (missingBehavior === 'default_value') {
      contributions[id] = defaultValue
    } else {
      contributions[id] = 'no_submission'
    }
  }

  // Combination step: default is straight concatenation in participantIds
  // order (customer's "letters" example: A submits "M", B submits nothing
  // -> "M" + "no_submission"). `combine` (a live function, code-only
  // extension point) is checked first so it always wins and existing
  // callers that already pass one are completely unaffected. Additive
  // fallback: `combineSpec` is a JSON-serializable, data-authored
  // alternative (see evaluateCombineSpec() above) for authors who can't
  // attach a live function. Default, unchanged behavior when neither is
  // present: straight concatenation, exactly as before this addition.
  const combine = typeof event.ruleConfig?.combine === 'function'
    ? event.ruleConfig.combine
    : event.ruleConfig?.combineSpec
      ? (parts) => evaluateCombineSpec(event.ruleConfig.combineSpec, parts)
      : (parts) => parts.join('')
  const combined = combine(required.map((id) => contributions[id]))

  // Validation step: pluggable via event.ruleConfig.validate (a live
  // function, code-only extension point, checked first so it always wins
  // and existing callers that already pass one are completely unaffected).
  // Additive fallback: event.ruleConfig.validationSpec is a JSON-
  // serializable, data-authored alternative (see evaluateValidationSpec()
  // below), for authors who can't attach a live function. Default,
  // unchanged behavior when neither is present: the configurable
  // valid-values allow-list (event.ruleConfig.validValues) -- every event
  // authored before this addition has neither `validate` nor
  // `validationSpec`, so it resolves via this same branch exactly as
  // before.
  const validate = typeof event.ruleConfig?.validate === 'function'
    ? event.ruleConfig.validate
    : event.ruleConfig?.validationSpec
      ? (value, cfg) => evaluateValidationSpec(cfg?.validationSpec, value)
      : (value, cfg) => Array.isArray(cfg?.validValues) ? cfg.validValues.includes(value) : false
  const isValid = (missing.length === 0 || missingBehavior === 'default_value')
    ? !!validate(combined, event.ruleConfig)
    : false // 'eliminate'/'fail_round'/'allow_other_to_continue' with a real gap is never valid

  if (missing.length === 0) {
    // Everyone submitted — normal validity check, no missing-submission path.
    const winners = isValid ? required : []
    const failed = isValid ? [] : required
    return {
      winners,
      eliminated: [],
      failed,
      passed: winners,
      stateUpdates: buildStateUpdates({ passed: winners, failed }),
      nextEventParticipantIds: isValid ? required : null,
      result: baseResult(event, {
        winners,
        failed,
        passed: winners,
        details: { contributions, combined, isValid, missing: [] },
      }),
    }
  }

  // Missing-submission path.
  if (missingBehavior === 'default_value') {
    const winners = isValid ? required : []
    const failed = isValid ? [] : required
    return {
      winners,
      eliminated: [],
      failed,
      passed: winners,
      stateUpdates: buildStateUpdates({ passed: winners, failed }),
      nextEventParticipantIds: isValid ? required : null,
      result: baseResult(event, {
        winners,
        failed,
        passed: winners,
        details: { contributions, combined, isValid, missing, missingSubmissionBehavior: missingBehavior },
      }),
    }
  }

  if (missingBehavior === 'allow_other_to_continue') {
    const missingStatus = event.ruleConfig?.missingParticipantStatus === 'FAILED' ? 'failed' : 'eliminated'
    const submitted = required.filter((id) => !missing.includes(id))
    const eliminated = missingStatus === 'eliminated' ? missing : []
    const failed = missingStatus === 'failed' ? missing : []
    return {
      winners: [],
      eliminated,
      failed,
      passed: submitted,
      stateUpdates: buildStateUpdates({ eliminated, failed, passed: submitted }),
      nextEventParticipantIds: submitted,
      result: baseResult(event, {
        eliminated,
        failed,
        passed: submitted,
        details: { contributions, combined, isValid: false, missing, missingSubmissionBehavior: missingBehavior },
      }),
    }
  }

  if (missingBehavior === 'fail_round') {
    return {
      winners: [],
      eliminated: [],
      failed: required,
      passed: [],
      stateUpdates: buildStateUpdates({ failed: required }),
      nextEventParticipantIds: null,
      result: baseResult(event, {
        failed: required,
        details: { contributions, combined, isValid: false, missing, missingSubmissionBehavior: missingBehavior },
      }),
    }
  }

  // Default: 'eliminate' — the customer's exact scenario (a required
  // participant went silent -> combination is invalid -> round is
  // eliminated/failed, never left hanging for the missing participant).
  return {
    winners: [],
    eliminated: required,
    failed: [],
    passed: [],
    stateUpdates: buildStateUpdates({ eliminated: required }),
    nextEventParticipantIds: null,
    result: baseResult(event, {
      eliminated: required,
      details: { contributions, combined, isValid: false, missing, missingSubmissionBehavior: missingBehavior },
    }),
  }
}

// Phase 4 additive: pure interpreter for the JSON-serializable
// `ruleConfig.conditionSpec` alternative to a live `condition` function
// (SURVIVAL's global-condition path only -- see normalizeRuleConfig in
// lib/universalChallengeStore.js, the only place conditionSpec is
// persisted). Only consulted by survival() below when
// ruleConfig.conditionMode is NOT 'per_participant_pass_fail',
// ruleConfig.condition is NOT a function, and ruleConfig.conditionSpec IS
// present -- an event with none of those is completely unaffected and
// keeps using the existing default (never triggers). Unknown/malformed
// specs fail closed to `false`, matching evaluateValidationSpec/
// evaluateCombineSpec/evaluateComparatorSpec's fail-closed convention.
function evaluateConditionSpec(spec, inputs) {
  if (!spec || typeof spec !== 'object') return false
  const values = (inputs || []).map((inp) => inp?.value)
  if (spec.type === 'any_equals') return values.some((v) => v === spec.value)
  if (spec.type === 'all_equal') return values.length > 0 && values.every((v) => v === spec.value)
  if (spec.type === 'min_submissions') return values.length >= (Number(spec.count) || 0)
  // STEP 2 (Advanced Mode gap-fill) — additive: reuses the SAME generic
  // single-value vocabulary as INPUT_VALIDATION's `validationSpec`
  // (evaluateValidationSpec above), applied per-value here and combined
  // with `mode: 'any'|'all'` (default 'any'). E.g.
  // `{ type: 'value_condition', condition: { type: 'less_than', value: 10 }, mode: 'any' }`
  // triggers as soon as ANY submitted value is under 10 -- the exact same
  // "generic condition" primitive INPUT_VALIDATION uses, just reused here
  // instead of re-implemented, per the spec's "reusable across different
  // challenge types" requirement.
  if (spec.type === 'value_condition' && spec.condition) {
    return spec.mode === 'all'
      ? values.length > 0 && values.every((v) => evaluateValidationSpec(spec.condition, v))
      : values.some((v) => evaluateValidationSpec(spec.condition, v))
  }
  return false
}

// SURVIVAL — participants remain ACTIVE until a configured condition
// triggers. Two ways to decide who a triggered round eliminates:
//   1. `ruleConfig.condition` (a pluggable predicate function over inputs,
//      defaulting to "never triggers this event") — a code-level extension
//      point (in-process/test use only: functions aren't JSON-persistable,
//      see universalChallengeStore.js normalizeRuleConfig), combined with
//      `ruleConfig.conditionTargetIds` (default: all eligible).
//   2. `ruleConfig.conditionMode: 'per_participant_pass_fail'` (additive,
//      Phase 2) — fully DATA-driven, so it works end-to-end from
//      persisted, API-authored events with no code-level plugging at all.
//      Each eligible participant's own creator-submitted boolean input
//      (`inputs[].value`: true/'pass'/1 -> passes, false/'fail'/0 ->
//      fails) decides THAT participant's own fate directly. A participant
//      who submitted nothing at all by the time the round closes falls
//      back to `ruleConfig.missingSubmissionBehavior` (default 'eliminate'
//      — missing data is penalized, never silently rewarded, exactly like
//      every other participant-shaped rule's convention, e.g.
//      INPUT_VALIDATION above).
// This is what powers the "Progressive Challenge" participant structure
// (see lib/universalChallengeParticipantStructures.js): each stage is one
// SURVIVAL event, and `challengeStateEngine.js` carries the SURVIVORS
// (`result.passed`) — not a single winner — forward into the next chained
// stage, since SURVIVAL never populates `winners`.
function survival(event, inputs, participantStates) {
  const eligible = eligibleParticipantIds(event, participantStates)
  const missingBehavior = event.ruleConfig?.missingSubmissionBehavior || 'eliminate'

  let triggered
  let targets

  if (event.ruleConfig?.conditionMode === 'per_participant_pass_fail') {
    const byParticipant = new Map()
    for (const inp of inputs || []) {
      if (eligible.includes(inp.participantId)) byParticipant.set(inp.participantId, inp.value)
    }
    const isFail = (v) => v === false || v === 'fail' || v === 0
    targets = eligible.filter((id) => {
      if (byParticipant.has(id)) return isFail(byParticipant.get(id))
      // No submission at all for this participant by window close — treat
      // as a fail unless the creator explicitly configured leniency.
      return missingBehavior !== 'allow_other_to_continue' && missingBehavior !== 'default_value'
    })
    triggered = targets.length > 0
  } else {
    // `condition` (a live function, code-only extension point) is checked
    // first so it always wins and existing callers that already pass one
    // are completely unaffected. Additive fallback: `conditionSpec` is a
    // JSON-serializable, data-authored alternative (see
    // evaluateConditionSpec() above). Default, unchanged behavior when
    // neither is present: never triggers, exactly as before this addition.
    const condition = typeof event.ruleConfig?.condition === 'function'
      ? event.ruleConfig.condition
      : event.ruleConfig?.conditionSpec
        ? (ins) => evaluateConditionSpec(event.ruleConfig.conditionSpec, ins)
        : () => false
    triggered = !!condition(inputs || [], event.ruleConfig)
    targets = triggered
      ? (Array.isArray(event.ruleConfig?.conditionTargetIds) && event.ruleConfig.conditionTargetIds.length
        ? event.ruleConfig.conditionTargetIds.filter((id) => eligible.includes(id))
        : eligible)
      : []
  }

  if (!triggered) {
    return {
      winners: [],
      eliminated: [],
      failed: [],
      passed: eligible,
      stateUpdates: buildStateUpdates({ passed: eligible }),
      nextEventParticipantIds: eligible,
      result: baseResult(event, { passed: eligible, details: { triggered: false } }),
    }
  }

  const onTrigger = event.ruleConfig?.onTrigger === 'fail' ? 'failed' : 'eliminated'
  const survivors = eligible.filter((id) => !targets.includes(id))

  return {
    winners: [],
    eliminated: onTrigger === 'eliminated' ? targets : [],
    failed: onTrigger === 'failed' ? targets : [],
    passed: survivors,
    stateUpdates: buildStateUpdates({ eliminated: onTrigger === 'eliminated' ? targets : [], failed: onTrigger === 'failed' ? targets : [], passed: survivors }),
    nextEventParticipantIds: survivors,
    result: baseResult(event, {
      eliminated: onTrigger === 'eliminated' ? targets : [],
      failed: onTrigger === 'failed' ? targets : [],
      passed: survivors,
      details: { triggered: true, targets },
    }),
  }
}

// Ranks an already-sorted (best-first, per `comparator`) list of ids by
// walking adjacent pairs through the SAME comparator used to sort them —
// works for an arbitrary comparator (not just a numeric `.value` field),
// which is what COMPARISON's own pluggable comparator needs. Internal to
// comparison() below; not exported (COMPARISON's ranking semantics are
// specific to its own comparator, unlike the numeric-value
// `competitionRanking` helper shared with the measurement rules).
function rankByComparator(sortedIds, comparator, byParticipant) {
  const ranking = []
  sortedIds.forEach((id, idx) => {
    let rank
    if (idx === 0) {
      rank = 1
    } else {
      const prevId = sortedIds[idx - 1]
      rank = comparator(byParticipant.get(id), byParticipant.get(prevId)) === 0 ? ranking[idx - 1].rank : idx + 1
    }
    const raw = byParticipant.get(id)
    const value = raw && Number.isFinite(Number(raw.value)) ? Number(raw.value) : null
    ranking.push({ participantId: id, rank, value })
  })
  return ranking
}

// Phase 3 additive: pure interpreter for the JSON-serializable
// `ruleConfig.comparatorSpec` alternative to a live `comparator` function
// (COMPARISON only -- see normalizeRuleConfig in
// lib/universalChallengeStore.js, the only place comparatorSpec is
// persisted). Only consulted by comparison() below when
// ruleConfig.comparator is NOT a function and ruleConfig.comparatorSpec IS
// present. `a`/`b` are raw input objects (same shape comparison() already
// passes a live comparator). Unknown/malformed specs fail closed to
// "equal" (0) rather than throwing or guessing an order, matching
// evaluateValidationSpec/evaluateCombineSpec's fail-closed convention.
function evaluateComparatorSpec(spec, a, b) {
  if (!spec || typeof spec !== 'object' || spec.type !== 'numeric_field') return 0
  const field = typeof spec.field === 'string' && spec.field ? spec.field : 'value'
  const direction = spec.direction === 'asc' ? 'asc' : 'desc'
  const av = Number(a?.[field]) || 0
  const bv = Number(b?.[field]) || 0
  return direction === 'asc' ? av - bv : bv - av
}

// COMPARISON — generic multi-participant result comparison: framework for
// an arbitrary comparator function over inputs (ruleConfig.comparator),
// defaulting to "highest numeric `value` wins" (i.e. behaves like
// HIGHEST_SCORE when no comparator is supplied) so it is a real dispatchable
// rule out of the box, not a placeholder. `comparator` (a live function,
// code-only extension point) is checked first so it always wins and
// existing callers that already pass one are completely unaffected.
// Additive fallback: `comparatorSpec` is a JSON-serializable, data-authored
// alternative (see evaluateComparatorSpec() above). Default, unchanged
// behavior when neither is present: descending by numeric `value`, exactly
// as before this addition.
function comparison(event, inputs, participantStates) {
  const eligible = eligibleParticipantIds(event, participantStates)
  const comparator = typeof event.ruleConfig?.comparator === 'function'
    ? event.ruleConfig.comparator
    : event.ruleConfig?.comparatorSpec
      ? (a, b) => evaluateComparatorSpec(event.ruleConfig.comparatorSpec, a, b)
      : (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0) // descending by value, default
  const byParticipant = new Map()
  for (const inp of inputs || []) {
    if (eligible.includes(inp.participantId)) byParticipant.set(inp.participantId, inp)
  }
  const present = eligible.filter((id) => byParticipant.has(id))
  // See module docstring — additive Phase 2 output mode, shared verbatim
  // with the measurement rules (default 'winner' leaves everything
  // byte-for-byte unchanged).
  const wantsRanking = event.ruleConfig?.outputMode === 'full_ranking'
  if (present.length === 0) {
    const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(eligible, event.ruleConfig)
    const winners = winnerId ? [winnerId] : []
    const eliminated = eligible.filter((id) => id !== winnerId)
    return {
      winners,
      eliminated,
      failed: [],
      passed: [],
      stateUpdates: buildStateUpdates({ winners, eliminated }),
      nextEventParticipantIds: winners,
      result: baseResult(event, {
        winners,
        tieBreakApplied,
        tieBreakMethod,
        insufficientVotesFallbackApplied: true,
        details: { note: 'no_inputs_submitted' },
        ...(wantsRanking ? { ranking: eligible.map((id) => ({ participantId: id, rank: null, value: null })) } : {}),
      }),
    }
  }
  const sorted = [...present].sort((idA, idB) => comparator(byParticipant.get(idA), byParticipant.get(idB)))
  // Ties = every participant the comparator considers equal to sorted[0].
  const best = sorted[0]
  const tied = sorted.filter((id) => comparator(byParticipant.get(id), byParticipant.get(best)) === 0)
  const { winnerId, tieBreakApplied, tieBreakMethod } = resolveTie(tied, event.ruleConfig)
  const winners = winnerId ? [winnerId] : []
  const eliminated = eligible.filter((id) => id !== winnerId)
  const absent = eligible.filter((id) => !present.includes(id))
  const ranking = wantsRanking
    ? [...rankByComparator(sorted, comparator, byParticipant), ...absent.map((id) => ({ participantId: id, rank: null, value: null }))]
    : undefined

  return {
    winners,
    eliminated,
    failed: [],
    passed: [],
    stateUpdates: buildStateUpdates({ winners, eliminated }),
    nextEventParticipantIds: winners,
    result: baseResult(event, { winners, eliminated, tieBreakApplied, tieBreakMethod, details: { order: sorted }, ...(wantsRanking ? { ranking } : {}) }),
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const RULE_IMPLS = {
  [RULES.HIGHEST_SCORE]: highestScore,
  [RULES.LOWEST_SCORE]: lowestScore,
  [RULES.FASTEST]: fastest,
  [RULES.FIRST_TO_OBJECTIVE]: firstToObjective,
  [RULES.ELIMINATION]: elimination,
  [RULES.SEQUENTIAL_MATCHUP]: sequentialMatchup,
  [RULES.PREDICTION]: prediction,
  [RULES.INPUT_VALIDATION]: inputValidation,
  [RULES.SURVIVAL]: survival,
  [RULES.COMPARISON]: comparison,
}

// Resolves a single event given its config, currently-collected inputs, and
// current participant states. This is the ONLY exported entry point rules
// are meant to be invoked through — always returns a verdict, never throws
// for an unresolved tie/insufficient-input situation (it throws only for a
// genuinely unknown `event.rule`, which is a data/authoring bug, not a
// runtime "not enough votes yet" situation).
export function resolveEvent(event, inputs, participantStates) {
  const impl = RULE_IMPLS[event.rule]
  if (!impl) {
    const err = new Error(`unknown_rule:${event.rule}`)
    err.code = 'unknown_rule'
    throw err
  }
  // An event ordinarily needs participantIds populated to have anything to
  // verdict on — EXCEPT a PREDICTION event authored purely against
  // creator-defined `options` (Guess the Action / Two-Side Choice / Majority
  // Choice — see lib/universalChallengeParticipantStructures.js), which
  // deliberately has NO participants engaged at all: the vote is about an
  // option, not a participant. `prediction()` below already falls back to
  // tallying by `options` whenever no participants are eligible — this
  // guard just has to let such an event actually reach that fallback
  // instead of short-circuiting to an empty verdict first.
  const optionsOnly = event.rule === RULES.PREDICTION && Array.isArray(event.options) && event.options.length > 0
  // STEP 3 (Advanced Mode gap-fill, numeric prediction) — same story as
  // `optionsOnly` above: a numeric prediction has NEITHER options NOR
  // participants (the guess isn't "about" any of them) and must still
  // reach `prediction()`'s numeric branch instead of short-circuiting to
  // an empty verdict (which is exactly what was silently discarding
  // `result.details.correctValue`/`revealed`/`guesses` before this fix —
  // caught by scripts/test_numeric_prediction_e2e.mjs).
  const numericPrediction = event.rule === RULES.PREDICTION && event.ruleConfig?.predictionType === 'numeric'
  if (!optionsOnly && !numericPrediction && (!Array.isArray(event.participantIds) || event.participantIds.length === 0)) {
    // No participants populated yet (e.g. a sequential-matchup event still
    // waiting on a prior event to resolve) — nothing to verdict on.
    return emptyVerdict(event)
  }
  return impl(event, inputs || [], participantStates || {})
}

export default {
  RULES,
  PARTICIPANT_STATUS,
  resolveTie,
  resolveEvent,
  competitionRanking,
}
