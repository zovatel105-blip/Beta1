import { getCollection } from './mongodb'
import { getPostOwnerId } from './challengeEngineStore'
import { computeChallengeState, isEventOpenForInput } from './challengeStateEngine'
import { RULES, resolveTie } from './challengeRuleEngine'
import { normalizeRuleConfigFromSchema } from './challengeRuleSchema'
import { PARTICIPANT_STRUCTURES, structureAllowedRules, computeAllVsAllStandings } from './universalChallengeParticipantStructures'
import { ENTITY_TYPES, ENTITY_STATES } from './universalChallengeEntityTypes'
import { recordResult } from './universalChallengeAnalytics'

export { ENTITY_TYPES, ENTITY_STATES }

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

// ---------------------------------------------------------------------------
// Entity System (Phase 1 of the customer's approved 11-phase rewrite plan)
// — `entities[]`/`groups[]` are the new, universal, TYPED replacement for
// `participants[]`/`teams[]`: a Challenge may involve people, teams,
// objects, vehicles, options, countries, or custom things — not just
// "participants" hard-coded as people. A "team" is simply a `group`; there
// is no separate parallel team concept anymore.
//
// BACKWARD-COMPATIBILITY DECISION (recorded here per this phase's explicit
// instruction): `participants[]`/`teams[]` are kept as DERIVED, COMPUTED
// VIEWS over `entities[]`/`groups[]` — never a second source of truth —
// rather than updating every downstream consumer (`challengeRuleEngine.js`,
// `challengeStateEngine.js`, `universalChallengeParticipantStructures.js`,
// `universalChallengeTimeline.js`, the editor's live preview, the Feed
// overlay) to read entity ids directly. This is the clearly lower-risk,
// less invasive option: every one of those modules already operates
// PURELY on opaque string ids (`participantIds`) and a flat
// `{id, label, avatarUrl}` shape it never inspects beyond those three
// fields — none of them care whether the id underneath names a person, a
// car, or a country. Re-pointing ~2500 lines of already-tested rule/state/
// structure logic at a new field name would have been a much larger, much
// riskier surface for a foundational, "must keep working IDENTICALLY"
// phase, for zero behavioral gain. `entities[]`/`groups[]` are therefore
// the new authored/persisted source of truth going forward, and
// `participants[]`/`teams[]` (byte-for-byte the same shape as before this
// phase) are recomputed from them on every create AND on every read — a
// legacy document that predates this phase (has `participants`/`teams`
// but no `entities`/`groups`) has its `entities`/`groups` synthesized on
// READ (see `ensureEntitiesAndGroups` below), never destructively
// migrated, exactly the same "compute on read" philosophy this file
// already uses for event resolution.
// ---------------------------------------------------------------------------

const VALID_ENTITY_TYPES = new Set(Object.values(ENTITY_TYPES))
const VALID_ENTITY_STATES = new Set(Object.values(ENTITY_STATES))

// Normalizes the new `entities[]` shape. Falls back to migrating legacy
// `participants[]` (each becomes a PERSON-typed entity, its `label`
// carried over as both `name` and `displayName`) whenever no `entities`
// were supplied at all — this is what lets an existing/not-yet-updated
// caller keep sending plain `participants` and get full Entity System
// plumbing underneath for free.
function normalizeEntities(entitiesRaw, legacyParticipantsRaw) {
  const source = Array.isArray(entitiesRaw) && entitiesRaw.length > 0
    ? entitiesRaw.map((e) => ({
        id: e?.id && String(e.id).trim() ? String(e.id) : genId('entity'),
        type: VALID_ENTITY_TYPES.has(e?.type) ? e.type : ENTITY_TYPES.PERSON,
        name: String(e?.name || e?.displayName || e?.label || '').trim() || 'Entity',
        displayName: String(e?.displayName || e?.name || e?.label || '').trim() || 'Entity',
        avatarUrl: e?.avatarUrl || e?.image || null,
        groupId: e?.groupId ? String(e.groupId) : null,
        metadata: e?.metadata && typeof e.metadata === 'object' ? e.metadata : {},
        initialState: VALID_ENTITY_STATES.has(e?.initialState) ? e.initialState : ENTITY_STATES.ACTIVE,
      }))
    : normalizeParticipants(legacyParticipantsRaw).map((p) => ({
        id: p.id,
        type: ENTITY_TYPES.PERSON,
        name: p.label,
        displayName: p.label,
        avatarUrl: p.avatarUrl,
        groupId: null,
        metadata: {},
        initialState: ENTITY_STATES.ACTIVE,
      }))
  if (source.length === 0) fail('no_participants')
  return source
}

// Normalizes the new `groups[]` shape (generic replacement for `teams[]`
// — a "team" is just a group). Falls back to migrating legacy `teams[]`
// (participantIds -> entityIds) when no `groups` were supplied.
function normalizeGroups(groupsRaw, legacyTeamsRaw, validEntityIds) {
  const source = Array.isArray(groupsRaw) && groupsRaw.length > 0
    ? groupsRaw
    : (Array.isArray(legacyTeamsRaw) ? legacyTeamsRaw.map((t) => ({ id: t?.id, label: t?.label, entityIds: t?.participantIds })) : [])
  if (source.length === 0) return []
  return source.map((g) => ({
    id: g?.id && String(g.id).trim() ? String(g.id) : genId('group'),
    label: String(g?.label || '').trim() || 'Group',
    entityIds: Array.isArray(g?.entityIds)
      ? [...new Set(g.entityIds.map(String).filter((eid) => validEntityIds.has(eid)))]
      : [],
  }))
}

// Backfills each entity's `groupId` from `groups[]` — an entity that
// belongs to exactly one group gets that group's id; an entity in zero or
// multiple groups keeps whatever it already had (null by default). Purely
// bookkeeping metadata, never read by the Rule/State Engine.
function assignGroupIds(entities, groups) {
  const membershipCount = new Map()
  const singleGroupOf = new Map()
  for (const g of groups) {
    for (const eid of g.entityIds) {
      membershipCount.set(eid, (membershipCount.get(eid) || 0) + 1)
      singleGroupOf.set(eid, g.id)
    }
  }
  for (const e of entities) {
    if (!e.groupId && membershipCount.get(e.id) === 1) e.groupId = singleGroupOf.get(e.id)
  }
}

// Derives the legacy `participants[]` view from `entities[]` — byte-for-
// byte the same shape every pre-existing consumer already expects
// ({id, label, avatarUrl}). ALL entities project into this view
// regardless of `type`: a non-PERSON entity (an OBJECT, a VEHICLE, a
// COUNTRY, …) is still something `participantIds` can reference, and the
// Rule Engine/State Engine resolve it identically — "participant" was
// always really "the thing competing"; this just makes that generic
// explicitly.
function deriveParticipantsFromEntities(entities) {
  return entities.map((e) => ({ id: e.id, label: e.displayName || e.name || 'Entity', avatarUrl: e.avatarUrl || null }))
}

// Derives the legacy `teams[]` view from `groups[]` — same shape as
// before ({id, label, participantIds}).
function deriveTeamsFromGroups(groups) {
  return groups.map((g) => ({ id: g.id, label: g.label, participantIds: [...g.entityIds] }))
}

// Legacy document (predates the Entity System) has no `entities`/`groups`
// at all — synthesize them on READ, non-destructively (never persisted
// back by this function), from its `participants`/`teams`. Mirrors
// `createUniversalChallenge`'s derivation, just in the opposite direction.
function ensureEntitiesAndGroups(doc) {
  if (!doc) return doc
  if (Array.isArray(doc.entities) && doc.entities.length > 0) return doc
  const entities = (doc.participants || []).map((p) => ({
    id: p.id,
    type: ENTITY_TYPES.PERSON,
    name: p.label,
    displayName: p.label,
    avatarUrl: p.avatarUrl || null,
    groupId: null,
    metadata: {},
    initialState: ENTITY_STATES.ACTIVE,
  }))
  const groups = (doc.teams || []).map((t) => ({ id: t.id, label: t.label, entityIds: [...(t.participantIds || [])] }))
  assignGroupIds(entities, groups)
  return { ...doc, entities, groups }
}

// PHASE 6 (Universal Challenge Engine roadmap) — Challenge versioning.
// `version` is a NEW, purely additive integer field, separate from
// `schemaVersion` (which describes the DOCUMENT SHAPE this file persists,
// e.g. the Entity System's `entities[]`/`groups[]` fields — a storage
// concern). `version` instead describes the CONTENT of a Challenge's
// `events`/`participants`/`teams` — it exists so that if a future edit
// path is added that lets a creator change a published Challenge's
// structure (add/remove/reconfigure events after votes already exist),
// that path can safely bump `version` and every vote/input already cast
// (see `castUniversalChallengeInput` below, which stamps each cast input
// with the challenge's `version` AT THE MOMENT IT WAS CAST) stays
// correctly attributed to the structure it was actually cast against,
// rather than being silently reinterpreted against a changed structure.
// No structural-edit endpoint exists yet — every Challenge created today
// is `version: 1` for its entire lifetime — this phase only lays the
// safe, backwards-compatible plumbing: every legacy document created
// before this field existed defaults to `version: 1` here on READ
// (non-destructively, exactly like `ensureEntitiesAndGroups` above),
// never migrated in the database.
function ensureVersion(doc) {
  if (!doc) return doc
  if (Number.isFinite(Number(doc.version))) return doc
  return { ...doc, version: 1 }
}

// PHASE 5 (Universal Challenge Engine roadmap) — RULE_SCHEMA
// (lib/challengeRuleSchema.js) is now THE authoritative source this
// delegates to, replacing what used to be ~60 lines of hand-maintained,
// duplicated field-by-field checks living only here. `rule` restricts the
// returned object to exactly the fields RULE_SCHEMA says THAT rule
// consumes (ALWAYS_FIELDS + its own `universal`/`own` groups) — verified
// against every RULE_IMPLS function in lib/challengeRuleEngine.js to read
// nothing outside its own schema entry, so this is a behavior-preserving
// refactor (identical defaults/coercion for every field), not a behavior
// change. `condition`/`validate`/`combine`/`comparator` (the live-function
// forms) remain intentionally NOT represented in RULE_SCHEMA/persisted
// here (functions aren't JSON-serializable) — pluggability for those stays
// a code-level extension point, not something authored through the API.
function normalizeRuleConfig(rule, ruleConfig) {
  return normalizeRuleConfigFromSchema(rule, ruleConfig)
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
  // STEP 3 (Advanced Mode gap-fill, numeric prediction) — a numeric
  // prediction event legitimately has NEITHER options[] NOR
  // participantIds (e.g. "How much will it weigh? [ __ ] kg" has nothing
  // to pick FROM, only a number to guess) — same bypass concept as
  // `optionsOnlyAllowed`/`teamDerivedAllowed` above, and the matching
  // bypass already present in castUniversalChallengeInput below. Read
  // straight off the raw (not-yet-normalized) ruleConfig, exactly like
  // the enum it mirrors (RULE_SCHEMA's `predictionType`) — an invalid/
  // missing value here is simply not 'numeric', so it correctly falls
  // through to the pre-existing validation unchanged.
  const numericPredictionAllowed = rule === RULES.PREDICTION && raw?.ruleConfig?.predictionType === 'numeric'
  if (participantIds.length === 0 && autoAdvanceFrom.length === 0 && !optionsOnlyAllowed && !teamDerivedAllowed && !numericPredictionAllowed) fail('no_participants_for_event')

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
    ruleConfig: normalizeRuleConfig(rule, raw?.ruleConfig),
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
// Challenge-level Rules & Result (additive) — PURELY a configuration of HOW
// the already-existing engine's outputs are aggregated/presented; creates
// NO new competition logic of its own (explicit customer requirement).
//
// `ruleType: 'highest_score'` is the only supported value today: it reuses
// lib/universalChallengeParticipantStructures.js's existing
// `computeAllVsAllStandings` (built in an earlier phase for exactly this
// "tally wins across N independent rounds" shape) by auto-tagging every
// authored "Result" moment (an event whose rule is one of the 4 rules
// ALL_VS_ALL already allows — SEQUENTIAL_MATCHUP/COMPARISON/HIGHEST_SCORE/
// LOWEST_SCORE, i.e. an objective, creator/measurement-decided round
// outcome, NEVER a viewer PREDICTION) with `participantStructure: ALL_VS_ALL`
// + one shared `structureMeta.groupId` for the whole Challenge — the exact
// same primitives Simple mode's own ALL_VS_ALL guided builder already
// writes. A PREDICTION moment (viewer guess) is never tagged — per the
// customer's explicit, repeated instruction, a viewer's prediction can
// never influence the real result.
const SCORING_RULES = new Set([RULES.SEQUENTIAL_MATCHUP, RULES.COMPARISON, RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE])
const TIE_BREAK_VALUES = new Set(['random', 'creator_defined', 'additional_round'])
const RESULT_TYPE_VALUES = new Set(['winner_only', 'full_ranking'])

function normalizeResultConfig(raw) {
  const ruleType = raw?.ruleType === 'highest_score' ? 'highest_score' : null
  return {
    // `null` (not 'highest_score') is a legitimate value — a Challenge
    // authored with no chosen challenge-level rule (e.g. a single-event
    // Challenge, or one built before this phase existed) simply has no
    // aggregate summary; every existing per-event result keeps working
    // completely unchanged either way.
    ruleType,
    resultType: RESULT_TYPE_VALUES.has(raw?.resultType) ? raw.resultType : 'winner_only',
    tieBreak: TIE_BREAK_VALUES.has(raw?.tieBreak) ? raw.tieBreak : 'random',
    tieBreakWinnerId: raw?.tieBreakWinnerId ? String(raw.tieBreakWinnerId) : null,
  }
}

// Tags every qualifying RAW (not-yet-normalized) event with the ALL_VS_ALL
// primitives before `normalizeEvents` runs, so normalizeEvent's own
// `participant_structure_rule_mismatch` check validates them exactly like
// any hand-authored ALL_VS_ALL event would be. An event that already
// declares its OWN `participantStructure` (e.g. a Simple-mode TEAM_VS_TEAM
// round mixed into the same Challenge) is left completely untouched — this
// only ever fills in events that were left "bare".
function applyChallengeLevelScoring(events, resultConfig) {
  if (resultConfig.ruleType !== 'highest_score' || !Array.isArray(events)) return events
  const groupId = genId('scoregroup')
  return events.map((ev) => {
    if (ev?.participantStructure) return ev // already tagged by something else (e.g. Team vs Team) — leave as-is
    if (!SCORING_RULES.has(ev?.rule)) return ev // PREDICTION/measurement-extras/etc. never count toward standings
    return { ...ev, participantStructure: PARTICIPANT_STRUCTURES.ALL_VS_ALL, structureMeta: { ...(ev.structureMeta || {}), groupId } }
  })
}

// Pure, read-time summary — never persisted, always recomputed from the
// Challenge's own already-resolved events (exactly like
// computeAllVsAllStandings itself). Returns null when there's nothing to
// summarize (no `ruleType` chosen, or no ALL_VS_ALL events exist yet).
function computeChallengeResultSummary(events, participants, resultConfig) {
  if (resultConfig.ruleType !== 'highest_score') return null
  const standings = computeAllVsAllStandings(events, participants)
  if (!standings) return null

  const topValue = standings.ranking.length ? standings.ranking[0].value : 0
  const topCandidates = standings.ranking.filter((r) => r.value === topValue).map((r) => r.participantId)
  let winnerId = null
  let tied = false
  let tieBreakApplied = false
  let tieBreakMethod = null
  if (!standings.complete) {
    // Rounds still in progress — never announce a winner early.
  } else if (topCandidates.length <= 1) {
    winnerId = topCandidates[0] || null
  } else if (resultConfig.tieBreak === 'additional_round') {
    // Deliberately left unresolved — the creator adds one more Result
    // moment (any further ALL_VS_ALL event) and this recomputes on its
    // own the moment that round resolves; zero extra logic needed.
    tied = true
  } else {
    const { winnerId: resolved, tieBreakApplied: applied, tieBreakMethod: method } = resolveTie(topCandidates, {
      tieBreak: resultConfig.tieBreak,
      tieBreakWinnerId: resultConfig.tieBreakWinnerId,
    })
    winnerId = resolved
    tieBreakApplied = applied
    tieBreakMethod = method
    tied = false
  }

  return {
    ruleType: resultConfig.ruleType,
    resultType: resultConfig.resultType,
    standings: standings.ranking,
    playedCount: standings.playedCount,
    winCount: standings.winCount,
    totalMoments: standings.totalMatchups,
    resolvedCount: standings.resolvedCount,
    complete: standings.complete,
    winnerId,
    tied,
    tieBreak: resultConfig.tieBreak,
    tieBreakApplied,
    tieBreakMethod,
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createUniversalChallenge(postId, authorId, { videoId, participants, events, teams, entities, groups, resultConfig } = {}) {
  // Entity System (Phase 1) — `entities`/`groups` are the new canonical
  // input; legacy `participants`/`teams` are still accepted and migrated
  // automatically (see normalizeEntities/normalizeGroups above) so an
  // existing/not-yet-updated caller keeps working unchanged. `participants`/
  // `teams` below are DERIVED views recomputed from the normalized
  // entities/groups — byte-for-byte the same shape as before this phase —
  // so every line below this block (event validation, TEAM_VS_TEAM roster
  // derivation, etc.) is completely untouched.
  const normalizedEntities = normalizeEntities(entities, participants)
  const validEntityIds = new Set(normalizedEntities.map((e) => e.id))
  const normalizedGroups = normalizeGroups(groups, teams, validEntityIds)
  assignGroupIds(normalizedEntities, normalizedGroups)
  const normalizedParticipants = deriveParticipantsFromEntities(normalizedEntities)
  const validParticipantIds = new Set(normalizedParticipants.map((p) => p.id))
  // Challenge-level Rules & Result (additive) — see the block of functions
  // above. Tagging happens BEFORE normalizeEvents so every tagged event is
  // validated by the exact same `participant_structure_rule_mismatch`
  // check any hand-authored ALL_VS_ALL event already goes through.
  const normalizedResultConfig = normalizeResultConfig(resultConfig)
  const scoredEvents = applyChallengeLevelScoring(events, normalizedResultConfig)
  const normalizedEvents = normalizeEvents(scoredEvents)
  const normalizedTeams = deriveTeamsFromGroups(normalizedGroups)
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
      // TEAM_VS_TEAM is ALWAYS PREDICTION-based (viewers guess, they never
      // decide) — the customer's final decision, with NO "aggregated
      // measurement" path left at all. `ev.rule` is guaranteed to already
      // be RULES.PREDICTION here:
      // `normalizeEvent` above rejects (`participant_structure_rule_mismatch`)
      // any TEAM_VS_TEAM event tagged with a measurement rule — see
      // `STRUCTURE_RULE.TEAM_VS_TEAM` in
      // lib/universalChallengeParticipantStructures.js, locked to exactly
      // one rule — so this is no longer a conditional branch, it is
      // unconditionally true for every TEAM_VS_TEAM event that reaches this
      // point, whether authored through the editor UI or a direct API call.
      // `options` (the votable choices) is FORCED here, server-side, from
      // the two teams themselves — never trusting whatever the client sent.
      //
      // CUSTOMER'S UPDATED, FINAL DECISION (supersedes the earlier
      // "community vote decides the winner" design): a Team vs Team viewer
      // vote is a PREDICTION about a real-world outcome, not the
      // determinant of the winner. The actual winning team is a FACT about
      // what happened in the video/competition — established by the
      // creator (the one who filmed/knows the real result) marking
      // `ruleConfig.correctOptionId` to one of this event's own two team
      // ids, exactly the same 'reveal' semantic already used elsewhere in
      // this engine (Guess the Actor/Action, Majority Choice's optional
      // reveal — see challengeRuleEngine.js `prediction()`). `outcomeMode`
      // is therefore FORCED to 'reveal' here, server-side, for the same
      // reason 'vote_tally' used to be forced: a client can never make
      // Team vs Team resolve any other way (e.g. by a live vote tally).
      // Unlike Majority Choice, `correctOptionId` is REQUIRED (not
      // optional) for Team vs Team, and is validated to be one of THIS
      // event's own two teams — never a stray id, and never a numeric/
      // points/time value (Team vs Team never accepts one).
      ev.options = [
        { id: teamA.id, label: teamA.label, participantId: null, mediaUrl: null },
        { id: teamB.id, label: teamB.label, participantId: null, mediaUrl: null },
      ]
      if (!ev.ruleConfig?.correctOptionId || ![teamA.id, teamB.id].includes(ev.ruleConfig.correctOptionId)) fail('team_vs_team_requires_real_winner')
      ev.ruleConfig = { ...ev.ruleConfig, outcomeMode: 'reveal', correctOptionId: ev.ruleConfig.correctOptionId }
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
    entities: normalizedEntities,
    groups: normalizedGroups,
    participants: normalizedParticipants,
    teams: normalizedTeams,
    events: normalizedEvents,
    schemaVersion: 1,
    // Challenge-level Rules & Result (additive) — see normalizeResultConfig
    // above. `ruleType: null` for every Challenge created before this
    // field existed (and any single-event/Simple-mode Challenge that never
    // sets one) — `getResolvedUniversalChallenge` below simply omits
    // `resultSummary` in that case, completely unchanged from before.
    resultConfig: normalizedResultConfig,
    // PHASE 6, additive — see `ensureVersion` above. Every Challenge is
    // born at content version 1; nothing bumps it yet (no edit-in-place
    // path exists), but every cast vote/input is stamped with it (see
    // `castUniversalChallengeInput` below) so future structural edits can
    // change `events` going forward without silently reattributing votes
    // already cast against the version that existed when they were cast.
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
  await col.insertOne(doc)
  return strip(doc)
}

export async function getUniversalChallengeByPostId(postId) {
  const col = await getCollection(UNIVERSAL_CHALLENGES)
  const doc = await col.findOne({ postId: String(postId) })
  return ensureVersion(ensureEntitiesAndGroups(strip(doc)))
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
      // PHASE 6, additive — which Challenge content `version` this input
      // was actually cast against (see castUniversalChallengeInput).
      // Nothing existing reads this field.
      challengeVersion: r.challengeVersion || 1,
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

  // PHASE 7, additive — analytics: log a `result` event exactly once, the
  // moment an event FIRST transitions to resolved this call (never on a
  // later replay of an already-resolved event — `withInputs` reflects
  // each event's state as it was BEFORE this pass, since `attachInputs`
  // only rehydrates `inputs` and never touches `state`/`result`).
  // Fire-and-forget: recordResult (lib/universalChallengeAnalytics.js)
  // never throws, is never awaited, and never alters the response below.
  const priorStateById = new Map(withInputs.events.map((e) => [e.id, e.state]))
  for (const e of computed.events) {
    if (e.state === 'resolved' && priorStateById.get(e.id) !== 'resolved') {
      recordResult({ challengeId: raw.challengeId, postId, eventId: e.id, rule: e.rule, winners: e.result?.winners || [] })
    }
  }

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

  // Entity System (Phase 1) — additive fields alongside the unchanged
  // `participants`/`teams` derived views. `entities` carries each
  // participant's live per-event status through onto its matching entity
  // (falling back to its authored `initialState`) purely as a convenience
  // for future entity-aware UI; nothing existing reads this field.
  const statusById = new Map(computed.participants.map((p) => [p.id, p.status]))
  const entitiesOut = (raw.entities || []).map((e) => ({ ...e, status: statusById.get(e.id) || e.initialState || ENTITY_STATES.ACTIVE }))

  // Challenge-level Rules & Result (additive) — recomputed fresh every
  // read from `computed.events`/`computed.participants` (never persisted
  // itself), exactly like every other derived summary in this file.
  // Missing on any Challenge created before this field existed (`raw.resultConfig`
  // is undefined) -> normalizeResultConfig defaults `ruleType` to null ->
  // computeChallengeResultSummary returns null -> `resultSummary` is simply
  // omitted below, byte-identical to this function's return shape before
  // this phase.
  const resultConfig = normalizeResultConfig(raw.resultConfig)
  const resultSummary = computeChallengeResultSummary(computed.events, computed.participants, resultConfig)

  return {
    challengeId: raw.challengeId,
    postId: raw.postId,
    videoId: raw.videoId,
    authorId: raw.authorId,
    schemaVersion: raw.schemaVersion,
    // PHASE 6, additive — see `ensureVersion` above.
    version: raw.version || 1,
    entities: entitiesOut,
    groups: raw.groups || [],
    participants: computed.participants,
    teams: raw.teams || [],
    events: computed.events,
    activeEventId: computed.activeEventId,
    resultConfig,
    resultSummary,
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

  // TEAM VS TEAM — CUSTOMER'S EXPLICIT REQUIREMENT: a Team vs Team viewer
  // vote is a PREDICTION about a real-world outcome that the creator's own
  // reveal (`ruleConfig.correctOptionId`, 'reveal' outcome mode — see
  // createUniversalChallenge/challengeRuleEngine.js `prediction()`)
  // establishes independently of any vote — so there is deliberately NO
  // deadline on casting one. The video's current playback position (or a
  // loop wrapping it back to 0) must never lock/close/reject a Team vs
  // Team prediction, and a prediction is accepted even AFTER this event
  // has already auto-resolved (e.g. the instant the video timeline first
  // crossed its endTime) — a late or looped viewer's guess is simply
  // compared against that same fixed real result once cast. This bypass
  // is scoped EXCLUSIVELY to TEAM_VS_TEAM PREDICTION events (discriminated
  // the exact same way every other Team vs Team branch in this codebase
  // already does: `participantStructure` + `rule`) — every other
  // mechanic's window-close enforcement immediately below is completely
  // unchanged, still consulting `isEventOpenForInput` exactly as before.
  const isTeamVsTeamPrediction = event.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && event.rule === RULES.PREDICTION
  if (!isTeamVsTeamPrediction && !isEventOpenForInput(event, Number(currentTime))) fail('event_closed')

  const isVoteShaped = VOTE_SHAPED_INTERACTIONS.has(event.interaction)
  // STEP 3 (Advanced Mode gap-fill, numeric prediction) — a numeric
  // prediction event is legitimately authored with NEITHER options[] NOR
  // participantIds (e.g. "¿Cu\u00e1nto pesar\u00e1? [ __ ] kg" has nothing to
  // pick FROM, only a number to guess), so it must bypass the
  // "has options or participants" readiness gate just below exactly like
  // a free-text options[] vote already does via `optionsReady`.
  const isNumericPrediction = event.rule === RULES.PREDICTION && event.ruleConfig?.predictionType === 'numeric'
  // A vote-shaped event authored purely against free-text `options` (Guess
  // the Action / Two-Side Choice / Majority Choice — see
  // lib/universalChallengeParticipantStructures.js) legitimately has NO
  // participants engaged at all; only a participant-less, options-less
  // event is truly "not ready to accept input".
  const optionsReady = isVoteShaped && Array.isArray(event.options) && event.options.length > 0
  if (!isNumericPrediction && !optionsReady && (!Array.isArray(event.participantIds) || event.participantIds.length === 0)) fail('event_participants_not_ready')

  const col = await getCollection(UNIVERSAL_CHALLENGE_INPUTS)
  const now = new Date().toISOString()
  // PHASE 6, additive — every cast vote/input is stamped with the
  // Challenge's content `version` AT THE MOMENT IT WAS CAST (see
  // `ensureVersion`/`createUniversalChallenge` above), so a future
  // structural-edit path that bumps `version` can never cause an
  // already-cast vote to be silently misattributed to a structure it
  // was never actually cast against.
  const challengeVersion = raw.version || 1

  if (isVoteShaped) {
    if (!userId) fail('user_required')
    // STEP 3 (Advanced Mode gap-fill, numeric prediction) — additive
    // branch: stores the viewer's raw numeric guess as `value` (upserted
    // per-user exactly like every other vote), completely separate from
    // the optionId/participantId selection path below, which remains
    // untouched for every existing (discrete) PREDICTION event and every
    // other vote-shaped rule.
    if (isNumericPrediction) {
      const numericValue = Number(value)
      if (!Number.isFinite(numericValue)) fail('invalid_selection')
      await col.updateOne(
        { challengeId: raw.challengeId, eventId, userId },
        { $set: { challengeId: raw.challengeId, eventId, userId, value: numericValue, challengeVersion, updatedAt: now }, $setOnInsert: { id: genId('input'), createdAt: now } },
        { upsert: true },
      )
      return getResolvedUniversalChallenge(postId, currentTime)
    }
    const validOptionIds = new Set((event.options || []).map((o) => o.id))
    const validParticipantIds = new Set(event.participantIds)
    // Vote payload may target an optionId (options[] authored explicitly)
    // or, when options weren't authored, directly a participantId (the
    // "option" IS the participant, e.g. a bare A-vs-B matchup).
    const target = optionId != null ? optionId : participantId
    if (target == null || (!validOptionIds.has(target) && !validParticipantIds.has(target))) fail('invalid_selection')
    await col.updateOne(
      { challengeId: raw.challengeId, eventId, userId },
      { $set: { challengeId: raw.challengeId, eventId, userId, optionId: target, challengeVersion, updatedAt: now }, $setOnInsert: { id: genId('input'), createdAt: now } },
      { upsert: true },
    )
  } else {
    // participant-shaped: measurement / answer / creator-entered input.
    if (!participantId) fail('participant_required')
    if (!event.participantIds.includes(participantId)) fail('unknown_participant')
    const update = { challengeId: raw.challengeId, eventId, participantId, userId: userId || null, challengeVersion, updatedAt: now }
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
