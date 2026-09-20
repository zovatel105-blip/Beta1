/**
 * Universal Challenge Engine — Rule Schema (declarative metadata).
 *
 * ADDITIVE, NEW MODULE. This is metadata only — nothing in the app reads or
 * executes RULE_SCHEMA yet, so adding it cannot change any existing
 * behavior. It exists to describe, for each of the 10 existing rule ids in
 * lib/challengeRuleEngine.js's RULES/RULE_IMPLS, which lib/universalChallengeStore.js
 * normalizeRuleConfig() fields that rule actually consumes, their allowed
 * values, and their defaults — mirroring normalizeRuleConfig exactly rather
 * than redefining it. A future step can use this as the source of truth for
 * a data-driven editor UI or validation layer; this step only records it.
 *
 * `universal: {...}` lists ruleConfig fields every rule shares (tie-break,
 * missing-submission handling, team aggregation). `own: {...}` lists fields
 * specific to that rule. Both are metadata-only descriptions of what
 * normalizeRuleConfig already enforces today.
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

export default RULE_SCHEMA
