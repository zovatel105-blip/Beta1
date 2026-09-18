import { RULES, competitionRanking } from './challengeRuleEngine'
import { sortEventsByStart } from './universalChallengeTimeline'

/**
 * Universal Challenge Engine — Participant Structure metadata.
 *
 * ADDITIVE, NEW MODULE. Zero relationship to the legacy poll-moment engine
 * (`lib/challengeMechanics.js` et al.) — nothing here is imported by, or
 * imports from, those files.
 *
 * THE CUSTOMER'S EXPLICIT ARCHITECTURE REQUEST: "Participant Structure"
 * (how participants are organized/interact — a head-to-head bracket, a
 * vote about which participant did something, a vote about a free-text
 * outcome, a fast two-way pick, a plain majority vote…) is a concept kept
 * SEPARATE from "Result/Evaluation Rule" (the 10 functions dispatched by
 * `lib/challengeRuleEngine.js` — HIGHEST_SCORE, LOWEST_SCORE, FASTEST,
 * FIRST_TO_OBJECTIVE, ELIMINATION, SEQUENTIAL_MATCHUP, PREDICTION,
 * INPUT_VALIDATION, SURVIVAL, COMPARISON — which this module never
 * duplicates, renames, or re-implements). A creator picks a structure AND
 * a rule independently; every structure below simply maps to one (or a
 * small creator-chosen set of) existing rule(s) and layers
 * authoring/rendering guidance + cross-event aggregation on top of it.
 *
 * `event.participantStructure` (see `lib/universalChallengeStore.js`
 * `normalizeEvent`) is a purely descriptive/authoring+rendering field:
 * `lib/challengeRuleEngine.js` and `lib/challengeStateEngine.js` NEVER
 * read it — they only ever look at `event.rule` / `event.ruleConfig` /
 * `event.options` / `event.participantIds` / `event.autoAdvanceFrom`. It
 * exists solely so `UniversalChallengeEditor.jsx` (which guided-authoring
 * flow / option-input UI to show) and `UniversalChallengeMomentOverlay.jsx`
 * (which presentational component to render in the Feed) can dispatch on
 * something more specific than the bare rule. An event authored with no
 * named structure (`participantStructure: null` — every event created
 * before this phase shipped, and any event still authored through the
 * plain "choose a rule directly" flow) keeps behaving exactly as before.
 *
 * PHASE 1 (five structures) — SEQUENTIAL_TOURNAMENT / GUESS_THE_ACTOR /
 * GUESS_THE_ACTION / TWO_SIDE_CHOICE / MAJORITY_CHOICE — unchanged, see
 * their original comments below.
 *
 * PHASE 2 (five more structures) adds two purely-additive event fields,
 * validated in `lib/universalChallengeStore.js` `normalizeEvent` exactly
 * like `participantStructure` itself already is — never read by the Rule
 * Engine or State Engine, only by authoring/rendering/summary code:
 *   - `event.teamIds: [teamAId, teamBId]` — TEAM_VS_TEAM only. Which two
 *     entries of the Challenge-level `teams[]` (see
 *     lib/universalChallengeStore.js) this event pits against each other.
 *   - `event.structureMeta: { groupId, anchorParticipantId, stageIndex }`
 *     — a small bag of structure-specific bookkeeping for the three
 *     auto-generated-event structures (ONE_VS_ALL / ALL_VS_ALL /
 *     PROGRESSIVE_CHALLENGE), letting the summary helpers below find
 *     "every event belonging to this one guided-authoring run" (`groupId`)
 *     without guessing from timing/labels, and (ONE_VS_ALL only) identify
 *     the fixed anchor participant directly rather than inferring it.
 *
 *   - TEAM_VS_TEAM — CUSTOMER'S FINAL DECISION (overrides the earlier
 *     "creator chooses aggregated measurement vs community vote" design
 *     this module originally shipped, AND the later "community vote
 *     decides the winner" design it shipped after that): locked to
 *     exactly one rule, PREDICTION — same as e.g. GUESS_THE_ACTOR — see
 *     STRUCTURE_RULE below; there is no measurement-rule path left at
 *     all, enforced server-side by `normalizeEvent`
 *     (lib/universalChallengeStore.js), not just hidden in the editor UI.
 *     The two teams THEMSELVES are the votable options (`event.options`
 *     forced server-side from the two teams — see createUniversalChallenge
 *     below), but a viewer's vote is a PREDICTION about a real-world
 *     outcome, never the determinant of it: `ruleConfig.outcomeMode` is
 *     forced to 'reveal' (also server-side), with a REQUIRED
 *     `correctOptionId` — one of the event's own two teams — the creator
 *     confirms as the real result once known (e.g. from the video).
 *     `computeTeamVoteStandings` below reads the winner straight off the
 *     already-resolved `result.winners` (now the creator-confirmed real
 *     result, not a vote tally), never re-deriving it — it also still
 *     reads the live vote tally for display, purely as prediction
 *     context, never as what decides anything. Not a new rule: PREDICTION
 *     is reused exactly as-is. `computeTeamStandings` (the original
 *     measurement-based aggregator) is kept below as a generic reader but
 *     is no longer reachable through this structure.
 *   - ONE_VS_ALL — rule SEQUENTIAL_MATCHUP (default, also configurable to
 *     COMPARISON/HIGHEST_SCORE/LOWEST_SCORE) — a fixed anchor participant
 *     faces every listed opponent in its OWN independent event (NOT
 *     chained via `autoAdvanceFrom` — the anchor's participation never
 *     depends on a previous matchup's outcome, unlike
 *     SEQUENTIAL_TOURNAMENT). `computeOneVsAllTally` derives the anchor's
 *     running win/loss tally purely by reading each group event's own
 *     `result.winners`/`result.eliminated` — no new rule-engine code.
 *   - ALL_VS_ALL — rule SEQUENTIAL_MATCHUP (default, same configurable set
 *     as ONE_VS_ALL) — every unique pair among a chosen participant list
 *     gets its own independent event (round robin, C(N,2) events, again
 *     NOT chained). `computeAllVsAllStandings` tallies each participant's
 *     win count across the group and hands it to the SAME
 *     `competitionRanking` helper the Rule Engine's own full-ranking
 *     output mode uses (imported directly, not reimplemented) — per the
 *     customer's explicit instruction to reuse Ranking rather than invent
 *     a second summary format.
 *   - ORDER_RANKING — rule HIGHEST_SCORE | LOWEST_SCORE | COMPARISON, with
 *     `ruleConfig.outputMode` forced to `'full_ranking'` at authoring time
 *     (see `structureDefaultRuleConfig` below). Not a new rule or a new
 *     evaluation mechanism — purely a named, discoverable entry point onto
 *     the Rule Engine's existing additive ranking output mode (see
 *     `lib/challengeRuleEngine.js`), for a single event where the creator
 *     wants a full 1st-through-last result instead of one winner.
 *   - PROGRESSIVE_CHALLENGE — rule SURVIVAL, with
 *     `ruleConfig.conditionMode: 'per_participant_pass_fail'` (see
 *     `lib/challengeRuleEngine.js`'s `survival()`). Multiple stages (one
 *     SURVIVAL event each) are chained via the ORDINARY `autoAdvanceFrom`
 *     field — `lib/challengeStateEngine.js`'s `sourceResultCarryIds` reads
 *     the source stage's `result.passed` (every survivor) rather than
 *     `result.winners` (SURVIVAL never populates that), which is exactly
 *     the "carry forward every still-active participant" semantic a
 *     progressive stage needs, discriminated purely by the source event's
 *     `rule` — no new autoAdvanceFrom field/mode was needed after all.
 *     `computeProgressiveStandings` below derives each participant's
 *     furthest-reached stage and the Challenge's (possibly multiple,
 *     tied) overall winner(s) — "reached the final stage without ever
 *     failing" — as a pure summary reading, since that "furthest stage /
 *     ties allowed" shape isn't the generic single-WINNER promotion
 *     `challengeStateEngine.js` already does for e.g. a tournament
 *     champion.
 *
 * Every one of the four PREDICTION-based Phase 1 structures evaluates
 * through the SAME `resolveEvent`/`prediction()` function in
 * challengeRuleEngine.js — no new rule-engine code was written for any of
 * them, and the five Phase 2 structures above hold to the identical
 * constraint: zero new entries in `RULE_IMPLS`.
 */
export const PARTICIPANT_STRUCTURES = {
  SEQUENTIAL_TOURNAMENT: 'SEQUENTIAL_TOURNAMENT',
  GUESS_THE_ACTOR: 'GUESS_THE_ACTOR',
  GUESS_THE_ACTION: 'GUESS_THE_ACTION',
  TWO_SIDE_CHOICE: 'TWO_SIDE_CHOICE',
  MAJORITY_CHOICE: 'MAJORITY_CHOICE',
  TEAM_VS_TEAM: 'TEAM_VS_TEAM',
  ONE_VS_ALL: 'ONE_VS_ALL',
  ALL_VS_ALL: 'ALL_VS_ALL',
  ORDER_RANKING: 'ORDER_RANKING',
  PROGRESSIVE_CHALLENGE: 'PROGRESSIVE_CHALLENGE',
}

// Which underlying `rule`(s) each named structure allows. A single string
// (Phase 1 structures, and PROGRESSIVE_CHALLENGE) means that structure is
// locked to exactly one rule; an array means the creator picks among
// several existing rules that structure is compatible with (Phase 2).
// Enforced at creation time (lib/universalChallengeStore.js normalizeEvent)
// via `structureAllowedRules` below, so an event can never be tagged with a
// structure that lies about how it will actually resolve.
export const STRUCTURE_RULE = {
  [PARTICIPANT_STRUCTURES.SEQUENTIAL_TOURNAMENT]: RULES.SEQUENTIAL_MATCHUP,
  [PARTICIPANT_STRUCTURES.GUESS_THE_ACTOR]: RULES.PREDICTION,
  [PARTICIPANT_STRUCTURES.GUESS_THE_ACTION]: RULES.PREDICTION,
  [PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE]: RULES.PREDICTION,
  [PARTICIPANT_STRUCTURES.MAJORITY_CHOICE]: RULES.PREDICTION,
  // TEAM_VS_TEAM — Locked to exactly ONE rule — PREDICTION — the same way
  // SEQUENTIAL_TOURNAMENT/GUESS_THE_ACTOR/etc. are locked to one rule each,
  // so `structureAllowedRules`/`structureRuleOf` below can never surface
  // HIGHEST_SCORE/LOWEST_SCORE/COMPARISON/FASTEST/FIRST_TO_OBJECTIVE for
  // this structure, and `normalizeEvent` (lib/universalChallengeStore.js)
  // rejects (`participant_structure_rule_mismatch`) ANY attempt — UI or a
  // direct API call — to create a TEAM_VS_TEAM event with a measurement
  // rule. The two teams THEMSELVES are the votable options (see
  // computeTeamVoteStandings below and lib/universalChallengeStore.js's
  // createUniversalChallenge), but a viewer's vote there is a PREDICTION,
  // not the determinant of the winner — createUniversalChallenge forces
  // `ruleConfig.outcomeMode: 'reveal'` (CUSTOMER'S FINAL DECISION,
  // superseding an earlier 'vote_tally' design) with a REQUIRED
  // `correctOptionId` (one of the event's own two teams) the creator
  // confirms as the real result, and derives `options` from the two teams
  // server-side — never trusting a client-supplied value for either).
  // Still not a new rule: PREDICTION is reused exactly as-is.
  [PARTICIPANT_STRUCTURES.TEAM_VS_TEAM]: RULES.PREDICTION,
  [PARTICIPANT_STRUCTURES.ONE_VS_ALL]: [RULES.SEQUENTIAL_MATCHUP, RULES.COMPARISON, RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE],
  [PARTICIPANT_STRUCTURES.ALL_VS_ALL]: [RULES.SEQUENTIAL_MATCHUP, RULES.COMPARISON, RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE],
  [PARTICIPANT_STRUCTURES.ORDER_RANKING]: [RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE, RULES.COMPARISON],
  [PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE]: RULES.SURVIVAL,
}

// Where a structure's vote options come from, for the editor's
// option-authoring UI and the Feed's rendering dispatch:
//  - 'participants' -> options ARE the Challenge's participants (rendered
//    with avatar + name).
//  - 'custom'       -> options are free-text labels the creator authors
//    directly on the event (event.options), with no participants engaged.
//  - undefined (SEQUENTIAL_TOURNAMENT, every Phase 2 structure, or no
//    structure at all) -> not a vote-options question; either a
//    head-to-head/team/roster participant matchup or left to the generic
//    per-rule-family authoring UI.
export const STRUCTURE_OPTION_SOURCE = {
  [PARTICIPANT_STRUCTURES.GUESS_THE_ACTOR]: 'participants',
  [PARTICIPANT_STRUCTURES.GUESS_THE_ACTION]: 'custom',
  [PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE]: 'custom',
  [PARTICIPANT_STRUCTURES.MAJORITY_CHOICE]: 'custom',
}

export const STRUCTURE_META = {
  [PARTICIPANT_STRUCTURES.SEQUENTIAL_TOURNAMENT]: {
    label: 'Sequential Tournament',
    shortLabel: 'Tournament match',
    desc: 'Build a chain of head-to-head matchups — each winner automatically becomes the next opponent.',
    color: 'bg-rose-500',
  },
  [PARTICIPANT_STRUCTURES.GUESS_THE_ACTOR]: {
    label: 'Guess the Actor',
    shortLabel: 'Guess the Actor',
    desc: 'Viewers vote on WHICH participant performed the action shown in the video.',
    color: 'bg-fuchsia-500',
  },
  [PARTICIPANT_STRUCTURES.GUESS_THE_ACTION]: {
    label: 'Guess the Action',
    shortLabel: 'Guess the Action',
    desc: 'Viewers vote on WHAT happened, from action labels you define (e.g. "Jumped", "Fell").',
    color: 'bg-indigo-500',
  },
  [PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE]: {
    label: 'Two-Side Choice',
    shortLabel: 'Two-Side Choice',
    desc: 'A fast either/or pick between exactly two options.',
    color: 'bg-cyan-500',
  },
  [PARTICIPANT_STRUCTURES.MAJORITY_CHOICE]: {
    label: 'Majority Choice',
    shortLabel: 'Majority Choice',
    desc: 'A plain community vote — majority decides. Revealing a "correct" answer later is optional.',
    color: 'bg-amber-500',
  },
  [PARTICIPANT_STRUCTURES.TEAM_VS_TEAM]: {
    label: 'Team vs Team',
    shortLabel: 'Team match',
    desc: 'Two teams face off — viewers predict who will win; you confirm the real winner.',
    color: 'bg-emerald-500',
  },
  [PARTICIPANT_STRUCTURES.ONE_VS_ALL]: {
    label: 'One vs All',
    shortLabel: 'One vs All',
    desc: 'One fixed participant takes on every opponent, one at a time — a running win/loss tally is kept.',
    color: 'bg-orange-500',
  },
  [PARTICIPANT_STRUCTURES.ALL_VS_ALL]: {
    label: 'All vs All',
    shortLabel: 'Round robin',
    desc: 'Every participant faces every other participant once — full standings once all matchups resolve.',
    color: 'bg-blue-500',
  },
  [PARTICIPANT_STRUCTURES.ORDER_RANKING]: {
    label: 'Order / Ranking',
    shortLabel: 'Full ranking',
    desc: 'Show a full 1st-through-last result for this round, not just a single winner.',
    color: 'bg-yellow-500',
  },
  [PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE]: {
    label: 'Progressive Challenge',
    shortLabel: 'Progressive stage',
    desc: 'Everyone attempts the same increasingly-hard stages — fail one and you’re out. Furthest stage reached wins (ties allowed).',
    color: 'bg-teal-500',
  },
}

export function structureAllowedRules(structure) {
  const entry = STRUCTURE_RULE[structure]
  if (!entry) return []
  return Array.isArray(entry) ? entry : [entry]
}

// Default/first-choice rule for a structure — what the editor pre-selects
// the moment a creator picks this structure from the picker.
export function structureRuleOf(structure) {
  return structureAllowedRules(structure)[0] || null
}

export function structureOptionSource(structure) {
  return STRUCTURE_OPTION_SOURCE[structure] || null
}

// A structure may want to force specific ruleConfig defaults the moment
// it's picked (additive on top of `defaultRuleConfig(rule)` in the
// editor) — currently only ORDER_RANKING, which forces the Rule Engine's
// existing additive `outputMode: 'full_ranking'` (see
// lib/challengeRuleEngine.js) rather than requiring the creator to find a
// buried toggle themselves.
export function structureDefaultRuleConfig(structure) {
  if (structure === PARTICIPANT_STRUCTURES.ORDER_RANKING) return { outputMode: 'full_ranking' }
  return {}
}

// ---------------------------------------------------------------------------
// Cross-event / cross-participant summary helpers (Phase 2, additive).
//
// Every function below is a PURE reader over already-resolved Challenge
// data (`events`/`participants`/`teams`, exactly the shape
// `getResolvedUniversalChallenge` already returns) — none of them talk to
// the database, mutate anything, or re-invoke the Rule Engine. They exist
// so `UniversalChallengeEditor.jsx`'s live preview and
// `UniversalChallengeMomentOverlay.jsx`'s Feed rendering can share ONE
// implementation of "what does the aggregate/standings/tracker widget for
// this structure look like right now", exactly like `RULE_META`/
// `resolveActiveEvent` are already shared between those two files.
// ---------------------------------------------------------------------------

// TEAM_VS_TEAM — aggregates each team's member values (already-collected
// `event.inputs`, which are rehydrated regardless of resolved state — see
// universalChallengeStore.js `attachInputs` — so this reads identically
// pre- and post-resolution) via sum (default) or average
// (`ruleConfig.teamAggregationMethod`), and picks the leading team by the
// SAME "higher is better" / "lower is better" direction the underlying
// rule itself uses (LOWEST_SCORE inverts the comparison). Returns null if
// `event`/`teams` don't actually describe a two-team matchup.
export function computeTeamStandings(event, teams) {
  if (!event || !Array.isArray(teams) || !Array.isArray(event.teamIds) || event.teamIds.length !== 2) return null
  const teamA = teams.find((t) => t.id === event.teamIds[0])
  const teamB = teams.find((t) => t.id === event.teamIds[1])
  if (!teamA || !teamB) return null

  const method = event.ruleConfig?.teamAggregationMethod === 'average' ? 'average' : 'sum'
  // FASTEST reads timeMs, FIRST_TO_OBJECTIVE reads completedAtMs — the same
  // per-rule field convention UniversalChallengeMomentOverlay.jsx's
  // measurementField()/family==='objective' branch already use for the
  // non-team versions of these rules; HIGHEST_SCORE/LOWEST_SCORE/COMPARISON
  // keep reading the plain `value` field.
  const teamField = event.rule === RULES.FASTEST ? 'timeMs' : event.rule === RULES.FIRST_TO_OBJECTIVE ? 'completedAtMs' : 'value'
  const lowerIsBetter = event.rule === RULES.LOWEST_SCORE || event.rule === RULES.FASTEST || event.rule === RULES.FIRST_TO_OBJECTIVE

  const valueOf = new Map()
  for (const inp of event.inputs || []) {
    const raw = inp[teamField]
    if (inp.participantId != null && raw != null && Number.isFinite(Number(raw))) {
      valueOf.set(inp.participantId, Number(raw))
    }
  }

  const buildTeam = (team) => {
    const memberValues = (team.participantIds || []).map((pid) => ({ participantId: pid, value: valueOf.has(pid) ? valueOf.get(pid) : null }))
    const nums = memberValues.map((m) => m.value).filter((v) => Number.isFinite(v))
    const aggregate = nums.length === 0 ? null : (method === 'average' ? nums.reduce((a, b) => a + b, 0) / nums.length : nums.reduce((a, b) => a + b, 0))
    return { teamId: team.id, label: team.label, memberValues, aggregate }
  }

  const standings = [buildTeam(teamA), buildTeam(teamB)]
  const withVals = standings.filter((s) => s.aggregate != null)
  let winningTeamId = null
  if (withVals.length > 0) {
    const best = lowerIsBetter ? Math.min(...withVals.map((s) => s.aggregate)) : Math.max(...withVals.map((s) => s.aggregate))
    const bestTeams = withVals.filter((s) => s.aggregate === best)
    winningTeamId = bestTeams.length === 1 ? bestTeams[0].teamId : null
  }

  return { standings, winningTeamId, method, resolved: event.state === 'resolved' }
}

// TEAM_VS_TEAM — PREDICTION variant (additive, Phase 3). Companion to
// `computeTeamStandings` above, for a TEAM_VS_TEAM event authored with
// `rule: PREDICTION` instead of a measurement rule: here the two teams
// ARE the vote options (`event.options` = [{id: teamAId, label}, {id:
// teamBId, label}], forced server-side — see universalChallengeStore.js
// createUniversalChallenge), so "aggregate" is each team's live
// PREDICTION count, not a summed/averaged measurement — purely
// informational context about what viewers are guessing, never what
// decides anything. The winning team is read straight off the Rule
// Engine's own already-resolved `event.result.winners` — under Team vs
// Team's forced `ruleConfig.outcomeMode: 'reveal'` this is the creator's
// own confirmed real result (`ruleConfig.correctOptionId`), NOT derived
// from the tally above — this function never decides a winner on its
// own, purely presents one already decided. `memberValues` carries
// participantIds through (values always null — no per-participant
// number exists for a vote) purely so the SAME `TeamVsTeamMomentView`
// (UniversalChallengeMomentViews.jsx) can keep rendering avatar stacks
// with zero component-level branching between the two variants.
export function computeTeamVoteStandings(event, teams) {
  if (!event || !Array.isArray(teams) || !Array.isArray(event.teamIds) || event.teamIds.length !== 2) return null
  const teamA = teams.find((t) => t.id === event.teamIds[0])
  const teamB = teams.find((t) => t.id === event.teamIds[1])
  if (!teamA || !teamB) return null

  const counts = {}
  for (const inp of event.inputs || []) {
    const optId = inp.optionId
    if (optId != null) counts[optId] = (counts[optId] || 0) + 1
  }
  const totalVotes = (event.inputs || []).length
  const resolved = event.state === 'resolved'
  // Only ever read a winner off the Rule Engine's OWN already-resolved
  // result — never guessed from a live, not-yet-final tally, so a trophy
  // can never flash on a leading-but-not-yet-final team before the vote
  // window actually closes.
  const winningTeamId = resolved ? (event.result?.winners?.[0] || null) : null

  const buildTeam = (team) => ({
    teamId: team.id,
    label: team.label,
    memberValues: (team.participantIds || []).map((pid) => ({ participantId: pid, value: null })),
    aggregate: counts[team.id] || 0,
  })

  return { standings: [buildTeam(teamA), buildTeam(teamB)], winningTeamId, totalVotes, resolved }
}

// ONE_VS_ALL — the anchor's running win/loss tally across every matchup in
// its group (all events sharing `structureMeta.groupId`, or every
// ONE_VS_ALL event in the Challenge if `groupId` is omitted). Purely reads
// each already-resolved matchup event's own `result.winners`/
// `result.eliminated` — no new evaluation logic.
export function computeOneVsAllTally(events, groupId) {
  const groupEvents = sortEventsByStart((events || []).filter((e) => (
    e.participantStructure === PARTICIPANT_STRUCTURES.ONE_VS_ALL && (!groupId || e.structureMeta?.groupId === groupId)
  )))
  if (groupEvents.length === 0) return null
  const anchorParticipantId = groupEvents.find((e) => e.structureMeta?.anchorParticipantId)?.structureMeta?.anchorParticipantId || null

  let wins = 0
  let losses = 0
  let resolvedCount = 0
  const matchups = groupEvents.map((ev) => {
    const opponentId = (ev.participantIds || []).find((id) => id !== anchorParticipantId) || null
    const resolved = ev.state === 'resolved'
    let outcome = null
    if (resolved) {
      resolvedCount += 1
      if (anchorParticipantId && (ev.result?.winners || []).includes(anchorParticipantId)) { outcome = 'win'; wins += 1 }
      else if (anchorParticipantId && (ev.result?.eliminated || []).includes(anchorParticipantId)) { outcome = 'loss'; losses += 1 }
    }
    return { eventId: ev.id, opponentId, outcome, resolved }
  })

  return { anchorParticipantId, matchups, wins, losses, total: groupEvents.length, resolvedCount, complete: resolvedCount === groupEvents.length && groupEvents.length > 0 }
}

// ALL_VS_ALL — win-count standings across every round-robin matchup in the
// group, presented as a FULL ranking via the exact same `competitionRanking`
// helper the Rule Engine's own additive ranking output mode uses (imported
// directly above) — the customer's explicit instruction not to invent a
// second summary/ranking format.
export function computeAllVsAllStandings(events, participants, groupId) {
  const groupEvents = (events || []).filter((e) => (
    e.participantStructure === PARTICIPANT_STRUCTURES.ALL_VS_ALL && (!groupId || e.structureMeta?.groupId === groupId)
  ))
  if (groupEvents.length === 0) return null

  const winCount = new Map()
  const playedCount = new Map()
  for (const p of participants || []) { winCount.set(p.id, 0); playedCount.set(p.id, 0) }
  let resolvedCount = 0
  for (const ev of groupEvents) {
    for (const pid of ev.participantIds || []) playedCount.set(pid, (playedCount.get(pid) || 0) + 1)
    if (ev.state === 'resolved') {
      resolvedCount += 1
      for (const pid of ev.result?.winners || []) winCount.set(pid, (winCount.get(pid) || 0) + 1)
    }
  }

  const entries = [...winCount.keys()].map((pid) => ({ participantId: pid, value: winCount.get(pid) || 0 }))
  const ranking = competitionRanking(entries, 'desc')
  return {
    ranking,
    playedCount: Object.fromEntries(playedCount),
    winCount: Object.fromEntries(winCount),
    totalMatchups: groupEvents.length,
    resolvedCount,
    complete: resolvedCount === groupEvents.length,
  }
}

// PROGRESSIVE_CHALLENGE — each participant's furthest-reached stage, plus
// the Challenge's overall (possibly co-)winner(s): everyone who reached AND
// passed the LAST stage, once every stage has resolved. Stage order is
// simply chronological (`sortEventsByStart`) among the group's events —
// stages are, by the structure's own definition, one timestamped event
// each, shared by whoever is still active, laid out in order on the
// timeline.
export function computeProgressiveStandings(events, participants, groupId) {
  const stageEvents = sortEventsByStart((events || []).filter((e) => (
    e.participantStructure === PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE && (!groupId || e.structureMeta?.groupId === groupId)
  )))
  if (stageEvents.length === 0) return null

  const totalStages = stageEvents.length
  const furthest = new Map()
  const failedAt = new Map()
  stageEvents.forEach((ev, idx) => {
    const stageNum = idx + 1
    for (const pid of ev.participantIds || []) furthest.set(pid, stageNum)
    if (ev.state === 'resolved') {
      for (const pid of ev.result?.eliminated || []) if (!failedAt.has(pid)) failedAt.set(pid, stageNum)
      for (const pid of ev.result?.failed || []) if (!failedAt.has(pid)) failedAt.set(pid, stageNum)
    }
  })

  const allStagesResolved = stageEvents.every((e) => e.state === 'resolved')
  const stageLabels = stageEvents.map((e, i) => e.question || `Stage ${i + 1}`)
  const rows = (participants || []).map((p) => {
    const stageReached = furthest.get(p.id) || 0
    const failedAtStage = failedAt.has(p.id) ? failedAt.get(p.id) : null
    return {
      participantId: p.id,
      furthestStage: stageReached,
      furthestStageLabel: stageReached > 0 ? stageLabels[stageReached - 1] : null,
      failedAtStage,
      stillActive: stageReached > 0 && failedAtStage == null,
    }
  })
  const winnerIds = allStagesResolved
    ? rows.filter((r) => r.furthestStage === totalStages && r.failedAtStage == null).map((r) => r.participantId)
    : []

  return { totalStages, stageLabels, rows, winnerIds, resolved: allStagesResolved }
}

export default {
  PARTICIPANT_STRUCTURES,
  STRUCTURE_RULE,
  STRUCTURE_OPTION_SOURCE,
  STRUCTURE_META,
  structureRuleOf,
  structureAllowedRules,
  structureOptionSource,
  structureDefaultRuleConfig,
  computeTeamStandings,
  computeTeamVoteStandings,
  computeOneVsAllTally,
  computeAllVsAllStandings,
  computeProgressiveStandings,
}
