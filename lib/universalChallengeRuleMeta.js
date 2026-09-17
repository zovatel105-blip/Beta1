import { RULES } from './challengeRuleEngine'

/**
 * Universal Challenge Engine — shared rule metadata.
 *
 * ADDITIVE, NEW MODULE. Extracted from `UniversalChallengeEditor.jsx`'s
 * originally-local `RULE_META` (stage 1) so the SAME label/color/family
 * lookup backs both the editor's authoring UI (rule picker + timeline
 * blocks + live preview) and the Feed-side rendering built in stage 2
 * (`UniversalChallengeMomentOverlay.jsx` / `UniversalChallengeMomentViews.jsx`)
 * — one source of truth instead of two copies drifting apart.
 *
 * `family` is the piece the Feed renderer actually dispatches on to decide
 * which presentational view a rule gets:
 *   - 'vote'        -> viewer picks an option/participant (ELIMINATION,
 *                      SEQUENTIAL_MATCHUP, PREDICTION) — renders via the
 *                      existing shared `ChallengeMomentPills`.
 *   - 'measurement'  -> HIGHEST_SCORE / LOWEST_SCORE / FASTEST / COMPARISON
 *                      / SURVIVAL — a numeric/score comparison. Read-only
 *                      standings when `interaction: 'none'`, an editable
 *                      per-participant submission form when 'answer'.
 *   - 'objective'    -> FIRST_TO_OBJECTIVE — a completion leaderboard.
 *   - 'validation'   -> INPUT_VALIDATION — a combined-answer form.
 *
 * Deliberately has zero relationship to the legacy poll-moment engine
 * (`lib/challengeMechanics.js` et al.) — nothing here is imported by, or
 * imports from, those files.
 */
export const RULE_META = {
  [RULES.HIGHEST_SCORE]: { label: 'Highest score wins', desc: 'Best numeric score wins the round.', color: 'bg-sky-500', family: 'measurement' },
  [RULES.LOWEST_SCORE]: { label: 'Lowest score wins', desc: 'Smallest numeric score wins (e.g. fewest mistakes).', color: 'bg-sky-500', family: 'measurement' },
  [RULES.FASTEST]: { label: 'Fastest wins', desc: 'Quickest recorded time wins the round.', color: 'bg-sky-500', family: 'measurement' },
  [RULES.FIRST_TO_OBJECTIVE]: { label: 'First to finish', desc: 'First participant to complete the goal wins.', color: 'bg-sky-500', family: 'objective' },
  [RULES.ELIMINATION]: { label: 'Community elimination', desc: 'Viewers vote to eliminate one participant.', color: 'bg-rose-500', family: 'vote' },
  [RULES.SEQUENTIAL_MATCHUP]: { label: 'Head-to-head matchup', desc: 'Two participants face off — the winner auto-advances to the next chained round.', color: 'bg-rose-500', family: 'vote' },
  [RULES.PREDICTION]: { label: 'Community prediction', desc: 'Viewers predict an outcome; reveal the answer later.', color: 'bg-rose-500', family: 'vote' },
  [RULES.INPUT_VALIDATION]: { label: 'Answer / code validation', desc: 'Participants submit answers that must combine into something valid.', color: 'bg-amber-500', family: 'validation' },
  [RULES.SURVIVAL]: { label: 'Survival', desc: 'Participants stay in until a condition eliminates some of them.', color: 'bg-violet-500', family: 'measurement' },
  [RULES.COMPARISON]: { label: 'Custom comparison', desc: 'Compare submissions with a custom rule (defaults to highest value).', color: 'bg-sky-500', family: 'measurement' },
}

export const RULE_ORDER = Object.keys(RULE_META)

export function ruleFamily(rule) {
  return RULE_META[rule]?.family || 'measurement'
}

export default { RULE_META, RULE_ORDER, ruleFamily }
