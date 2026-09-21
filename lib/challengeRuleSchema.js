/**
 * Universal Challenge Engine — Rule Schema (declarative metadata).
 *
 * PHASE 5 (Universal Challenge Engine roadmap) — RULE_SCHEMA is now THE
 * AUTHORITATIVE VALIDATION SOURCE for challenge creation's ruleConfig
 * fields: `normalizeRuleConfigFromSchema()` below (which
 * lib/universalChallengeStore.js's `normalizeRuleConfig()` delegates to
 * entirely) is driven purely by the per-rule `universal`/`own` field
 * descriptors declared here, replacing what used to be a second,
 * hand-maintained field-by-field validation block duplicated inside
 * normalizeRuleConfig itself. Adding/adjusting a rule's accepted
 * ruleConfig fields now means editing ONLY this file — every consumer
 * (currently just normalizeRuleConfig) automatically picks it up. It
 * describes, for each of the 10 existing rule ids in
 * lib/challengeRuleEngine.js's RULES/RULE_IMPLS, which ruleConfig fields
 * that rule actually consumes, their allowed values, and their defaults —
 * verified against every RULE_IMPLS function to read nothing outside its
 * own schema entry.
 *
 * `universal: {...}` lists ruleConfig fields every rule shares (tie-break,
 * missing-submission handling, team aggregation). `own: {...}` lists fields
 * specific to that rule. `ALWAYS_FIELDS` (below) lists the one field every
 * rule accepts regardless of `rule` (kept separate from each rule's
 * `universal`/`own` groups so those stay a precise "what THIS rule
 * actually reads" description).
 */

import { RULES } from './challengeRuleEngine'

const TIE_BREAK_FIELDS = {
  tieBreak: { type: 'enum', values: ['random', 'creator_defined'], default: 'random' },
  tieBreakWinnerId: { type: 'string|null', default: null },
}

const MISSING_SUBMISSION_FIELDS = {
  missingSubmissionBehavior: {
    type: 'enum',
    values: ['eliminate', 'fail_round', 'default_value', 'allow_other_to_continue'],
    default: 'eliminate',
  },
  defaultValue: { type: 'any', default: '' },
}

const TEAM_AGGREGATION_FIELDS = {
  teamAggregationMethod: { type: 'enum', values: ['sum', 'average'], default: 'sum' },
  outputMode: { type: 'enum', values: ['winner', 'full_ranking'], default: 'winner' },
}

export const RULE_SCHEMA = {
  [RULES.HIGHEST_SCORE]: { universal: { ...TIE_BREAK_FIELDS, ...TEAM_AGGREGATION_FIELDS }, own: {} },
  [RULES.LOWEST_SCORE]: { universal: { ...TIE_BREAK_FIELDS, ...TEAM_AGGREGATION_FIELDS }, own: {} },
  [RULES.FASTEST]: { universal: { ...TIE_BREAK_FIELDS, ...TEAM_AGGREGATION_FIELDS }, own: {} },
  [RULES.FIRST_TO_OBJECTIVE]: {
    universal: { ...TIE_BREAK_FIELDS },
    own: {
      eliminateNonFinishers: { type: 'boolean', default: false },
    },
  },
  [RULES.ELIMINATION]: { universal: { ...TIE_BREAK_FIELDS, ...MISSING_SUBMISSION_FIELDS }, own: {} },
  [RULES.SEQUENTIAL_MATCHUP]: { universal: { ...TIE_BREAK_FIELDS }, own: {} },
  [RULES.PREDICTION]: {
    universal: { ...TIE_BREAK_FIELDS },
    own: {
      correctOptionId: { type: 'string|null', default: null },
      // Default 'reveal' reproduces every PREDICTION event authored before
      // outcomeMode existed. TEAM_VS_TEAM PREDICTION events are forced to
      // 'reveal' server-side regardless of what's requested here (see
      // universalChallengeStore.js createUniversalChallenge).
      outcomeMode: { type: 'enum', values: ['reveal', 'vote_tally'], default: 'reveal' },
    },
  },
  [RULES.INPUT_VALIDATION]: {
    universal: { ...MISSING_SUBMISSION_FIELDS },
    own: {
      validValues: { type: 'array|undefined', default: undefined },
      // Additive (this step): a JSON-serializable alternative to the
      // code-only `validate` extension point. See evaluateValidationSpec()
      // in lib/challengeRuleEngine.js.
      validationSpec: { type: 'object|undefined', default: undefined },
      // NOTE: inputValidation() also reads `missingParticipantStatus`, but
      // normalizeRuleConfig does not currently persist that key (it is
      // stripped on write), so it has no effect today regardless of what a
      // client sends — left out of this schema since the schema mirrors
      // what normalizeRuleConfig actually enforces, not what the rule
      // function merely reads.
      // `validate` remains a code-only extension point (functions aren't
      // JSON-serializable) — not represented here as data field.
      // Phase 2 additive: a JSON-serializable alternative to the code-only
      // `combine` extension point. See evaluateCombineSpec() in
      // lib/challengeRuleEngine.js.
      combineSpec: { type: 'object|undefined', default: undefined },
    },
  },
  [RULES.SURVIVAL]: {
    universal: { ...MISSING_SUBMISSION_FIELDS },
    own: {
      conditionMode: { type: 'enum|null', values: ['per_participant_pass_fail', null], default: null },
      conditionTargetIds: { type: 'array|undefined', default: undefined },
      onTrigger: { type: 'enum', values: ['eliminate', 'fail'], default: 'eliminate' },
      // `condition` remains a code-only extension point (functions aren't
      // JSON-serializable) — not represented here as a data field.
      // Phase 4 additive: a JSON-serializable alternative to the code-only
      // `condition` extension point (the global-condition path only, not
      // conditionMode: 'per_participant_pass_fail', which is already fully
      // data-driven). See evaluateConditionSpec() in
      // lib/challengeRuleEngine.js.
      conditionSpec: { type: 'object|undefined', default: undefined },
    },
  },
  [RULES.COMPARISON]: {
    universal: { ...TIE_BREAK_FIELDS, ...TEAM_AGGREGATION_FIELDS },
    own: {
      // `comparator` remains a code-only extension point (functions aren't
      // JSON-serializable) — not represented here as a data field.
      // Phase 3 additive: a JSON-serializable alternative to the code-only
      // `comparator` extension point. See evaluateComparatorSpec() in
      // lib/challengeRuleEngine.js.
      comparatorSpec: { type: 'object|undefined', default: undefined },
    },
  },
}

// ---------------------------------------------------------------------------
// Phase 5 — schema-driven normalization/validation engine.
// ---------------------------------------------------------------------------

// The one ruleConfig field every rule accepts regardless of `rule` — kept
// out of each rule's `universal`/`own` groups above so those stay a
// precise, minimal "what this rule actually reads" description. Mirrors
// normalizeRuleConfig's prior unconditional `insufficientVotesFallback`
// handling exactly: still only one legal value, no rule branches on
// anything else today.
const ALWAYS_FIELDS = {
  insufficientVotesFallback: { type: 'enum', values: ['most_votes_at_close'], default: 'most_votes_at_close' },
}

// Full field-descriptor map (ALWAYS_FIELDS + that rule's `universal` + its
// `own`) for a given rule id. An unknown rule id resolves to just
// ALWAYS_FIELDS (defensive only — lib/universalChallengeStore.js's
// normalizeEvent already rejects an unknown `rule` with `unknown_rule`
// before ruleConfig is ever normalized against this).
export function fieldSchemaForRule(rule) {
  const entry = RULE_SCHEMA[rule]
  return { ...ALWAYS_FIELDS, ...(entry?.universal || {}), ...(entry?.own || {}) }
}

// Coerces one raw value against one field descriptor — the single place
// that knows how to interpret every `type` used above. Never throws: an
// invalid/missing/wrong-shaped value simply resolves to the field's own
// `default`, exactly like every hand-written branch in the old
// normalizeRuleConfig did.
function coerceField(def, raw) {
  switch (def.type) {
    case 'enum':
    case 'enum|null':
      return Array.isArray(def.values) && def.values.includes(raw) ? raw : def.default
    case 'boolean':
      return !!raw
    case 'string|null':
      return raw || def.default
    case 'array|undefined':
      return Array.isArray(raw) ? raw : def.default
    case 'object|undefined':
      return raw && typeof raw === 'object' ? raw : def.default
    case 'any':
    default:
      return raw ?? def.default
  }
}

// Normalizes a raw ruleConfig object against RULE_SCHEMA for `rule` — THE
// authoritative validation entry point lib/universalChallengeStore.js's
// normalizeRuleConfig() now delegates to entirely, in place of its
// previous hand-maintained per-field checks. Returns an object containing
// exactly the fields RULE_SCHEMA says this specific rule consumes
// (ALWAYS_FIELDS + its `universal` + its `own` groups) — no more, no
// less — each coerced/defaulted per its own type descriptor above. A rule
// id RULE_SCHEMA has no entry for still gets ALWAYS_FIELDS, never throws.
export function normalizeRuleConfigFromSchema(rule, raw) {
  const cfg = raw && typeof raw === 'object' ? raw : {}
  const schema = fieldSchemaForRule(rule)
  const out = {}
  for (const [key, def] of Object.entries(schema)) {
    out[key] = coerceField(def, cfg[key])
  }
  return out
}

export default RULE_SCHEMA
