/**
 * Universal Challenge Engine — shared condition/comparator/combine "op"
 * metadata for the Advanced Editor's schema-driven UI.
 *
 * ADDITIVE, NEW MODULE (Advanced Mode gap-fill, step 1 of 3 — see
 * UniversalChallengeEditor.jsx). Nothing here changes engine behavior by
 * itself: it is pure display/authoring metadata (id/label/param fields)
 * describing the `type` values `lib/challengeRuleEngine.js` already
 * interprets for each JSON-serializable spec object
 * (`ruleConfig.validationSpec`, `.comparatorSpec`, `.combineSpec`,
 * `.conditionSpec`). The Advanced Editor uses this table to render a
 * friendly "pick an operation, fill its fields" builder instead of a raw
 * JSON textarea, and to build the exact `{ type, ...params }` object the
 * engine already knows how to evaluate.
 *
 * Kept as ONE small shared table (not per-field-type duplicated inline in
 * the editor) so step 2 of this task (widening the engine's actual
 * evaluators in lib/challengeRuleEngine.js) only has to add matching
 * entries HERE for the new operations to immediately show up in the
 * Advanced Editor — no second editor, no per-mechanic hardcoding.
 *
 * Each param field is `{ key, type: 'text'|'number'|'text_list', label }`.
 */

// VALIDATION_OPS — every `type` value `evaluateValidationSpec()` in
// lib/challengeRuleEngine.js accepts for `ruleConfig.validationSpec`
// (INPUT_VALIDATION's "is this combined value acceptable?" check). Also
// reused, unchanged, by SURVIVAL's `conditionSpec.value_condition` (see
// CONDITION_OPS below) — one vocabulary, two call sites, exactly the
// "reusable primitive" the spec asks for.
//
// STEP 2 (this change) widens this from the original two operations
// (`equals`, `one_of`) to the full generic condition vocabulary now
// implemented in `evaluateValidationSpec()` — every id below has a
// matching, tested branch there. `one_of` is kept (unchanged, exact same
// behavior as before) alongside its friendlier alias `valid_option`;
// `equals` is kept alongside its friendlier alias `correct_answer`.
export const VALIDATION_OPS = [
  { id: 'equals', label: 'Equals exactly', params: [{ key: 'value', type: 'text', label: 'Value' }] },
  { id: 'not_equals', label: 'Does not equal', params: [{ key: 'value', type: 'text', label: 'Value' }] },
  { id: 'correct_answer', label: 'Equals the correct answer', params: [{ key: 'value', type: 'text', label: 'Correct answer' }] },
  { id: 'contains', label: 'Contains', params: [{ key: 'value', type: 'text', label: 'Substring' }] },
  { id: 'starts_with', label: 'Starts with', params: [{ key: 'value', type: 'text', label: 'Prefix' }] },
  { id: 'ends_with', label: 'Ends with', params: [{ key: 'value', type: 'text', label: 'Suffix' }] },
  { id: 'greater_than', label: 'Greater than', params: [{ key: 'value', type: 'number', label: 'Value' }] },
  { id: 'less_than', label: 'Less than', params: [{ key: 'value', type: 'number', label: 'Value' }] },
  { id: 'greater_or_equal', label: 'Greater than or equal to', params: [{ key: 'value', type: 'number', label: 'Value' }] },
  { id: 'less_or_equal', label: 'Less than or equal to', params: [{ key: 'value', type: 'number', label: 'Value' }] },
  { id: 'between', label: 'Between', params: [{ key: 'min', type: 'number', label: 'Min' }, { key: 'max', type: 'number', label: 'Max' }] },
  { id: 'matches', label: 'Matches a pattern (regex)', params: [{ key: 'pattern', type: 'text', label: 'Pattern' }, { key: 'flags', type: 'text', label: 'Flags (optional)' }] },
  { id: 'one_of', label: 'Is one of a list', params: [{ key: 'values', type: 'text_list', label: 'Valid values' }] },
  { id: 'valid_option', label: 'Is one of a list (alias)', params: [{ key: 'values', type: 'text_list', label: 'Valid values' }] },
  { id: 'completed', label: 'Was submitted (not empty)', params: [] },
  { id: 'passed', label: 'Marked as pass', params: [] },
]

// COMPARATOR_OPS — every `type` value `evaluateComparatorSpec()` accepts
// for `ruleConfig.comparatorSpec` (COMPARISON's "which of two submissions
// ranks higher?" ordering, not a validity check — kept as its own small
// table since ordering two values is a different concern from validating
// one, even though both live in the same additive-spec architecture).
export const COMPARATOR_OPS = [
  {
    id: 'numeric_field',
    label: 'Compare a numeric field',
    params: [
      { key: 'field', type: 'text', label: 'Field name (default "value")' },
      { key: 'direction', type: 'enum', values: ['desc', 'asc'], labels: { desc: 'Highest wins', asc: 'Lowest wins' }, label: 'Direction' },
    ],
  },
]

// COMBINE_OPS — every `type` value `evaluateCombineSpec()` accepts for
// `ruleConfig.combineSpec` (INPUT_VALIDATION's "how do I merge every
// participant's own submission into one value to validate?" step).
export const COMBINE_OPS = [
  { id: 'join', label: 'Join in participant order', params: [{ key: 'separator', type: 'text', label: 'Separator (optional)' }] },
]

// CONDITION_OPS — every `type` value `evaluateConditionSpec()` accepts for
// `ruleConfig.conditionSpec` (SURVIVAL's global "has the elimination
// condition triggered yet?" check, evaluated over every eligible
// participant's raw input at once — a different shape from
// VALIDATION_OPS's single already-combined value).
//
// STEP 2 (this change) adds `value_condition`, which reuses VALIDATION_OPS
// itself (nested) via `evaluateValidationSpec()` — the Advanced Editor
// therefore gets the FULL generic vocabulary for SURVIVAL's shared
// condition too, without a separate parallel vocabulary to maintain.
export const CONDITION_OPS = [
  { id: 'any_equals', label: 'Any participant\u2019s value equals', params: [{ key: 'value', type: 'text', label: 'Value' }] },
  { id: 'all_equal', label: 'Every participant\u2019s value equals', params: [{ key: 'value', type: 'text', label: 'Value' }] },
  { id: 'min_submissions', label: 'At least N participants submitted', params: [{ key: 'count', type: 'number', label: 'Count' }] },
  { id: 'value_condition', label: 'A custom condition on each value\u2026', nested: true, params: [
    { key: 'mode', type: 'enum', values: ['any', 'all'], labels: { any: 'ANY participant matches', all: 'EVERY participant matches' }, label: 'Applies when' },
  ] },
]

export default { VALIDATION_OPS, COMPARATOR_OPS, COMBINE_OPS, CONDITION_OPS }
