/**
 * Universal Challenge Engine — shared Entity System type/state vocabulary.
 *
 * ADDITIVE, NEW MODULE — Phase 1 of the customer's approved 11-phase
 * rewrite plan: replacing the old flat `participants: [{id,label,avatarUrl}]`
 * (implicitly "people") + separate `teams: [{id,label,participantIds}]`
 * with a genuinely universal, TYPED entity system. A Challenge is no
 * longer implicitly "about people": it may pit objects, vehicles,
 * countries, free-text options, whole groups, or fully custom things
 * against each other. See `lib/universalChallengeStore.js` for the
 * `entities[]`/`groups[]` schema and the `participants[]`/`teams[]`
 * backward-compatibility derivation built on top of this vocabulary.
 *
 * ZERO server-only dependencies (no mongodb, no collections) — safe to
 * import from BOTH `lib/universalChallengeStore.js` (server) and
 * `components/UniversalChallengeEditor.jsx` (client), for the exact same
 * reason `lib/universalChallengeRuleMeta.js` / `lib/universalChallengeTimeline.js`
 * are their own tiny standalone modules rather than living inside the
 * store file or the editor.
 *
 * `ENTITY_TYPES` — what KIND of thing an entity is. `PERSON` is the
 * default, so a creator who never touches the type picker gets an entity
 * indistinguishable in shape from every participant that existed before
 * this phase — zero workflow change for the common case.
 *
 * `ENTITY_STATES` — the wider, generic lifecycle vocabulary an entity's
 * `initialState` may declare. This is deliberately a SUPERSET of, and a
 * SEPARATE enum from, `PARTICIPANT_STATUS` in `lib/challengeRuleEngine.js`
 * (ACTIVE/ELIMINATED/FAILED/PASSED/WINNER) — the Rule Engine/State Engine
 * are NOT changed by this phase to consume the wider vocabulary; they
 * keep computing a participant's live status exactly as before, purely
 * off `participantIds`. `entity.initialState` is author-time bookkeeping
 * metadata only (default ACTIVE), laying groundwork for a later phase.
 */
export const ENTITY_TYPES = {
  PERSON: 'PERSON',
  TEAM: 'TEAM',
  OBJECT: 'OBJECT',
  VEHICLE: 'VEHICLE',
  OPTION: 'OPTION',
  COUNTRY: 'COUNTRY',
  GROUP: 'GROUP',
  CUSTOM: 'CUSTOM',
}

export const ENTITY_STATES = {
  WAITING: 'WAITING',
  ACTIVE: 'ACTIVE',
  COMPETING: 'COMPETING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  SAFE: 'SAFE',
  FINISHED: 'FINISHED',
  ELIMINATED: 'ELIMINATED',
  WINNER: 'WINNER',
  LOSER: 'LOSER',
}

// Display labels for the editor's entity-type picker — kept dependency-
// free of any icon library so this module stays importable from anywhere;
// the editor maps these keys to its own icon choices.
export const ENTITY_TYPE_LABELS = {
  [ENTITY_TYPES.PERSON]: 'Person',
  [ENTITY_TYPES.TEAM]: 'Team',
  [ENTITY_TYPES.OBJECT]: 'Object',
  [ENTITY_TYPES.VEHICLE]: 'Vehicle',
  [ENTITY_TYPES.OPTION]: 'Option',
  [ENTITY_TYPES.COUNTRY]: 'Country',
  [ENTITY_TYPES.GROUP]: 'Group',
  [ENTITY_TYPES.CUSTOM]: 'Custom',
}

export const ENTITY_TYPE_ORDER = Object.keys(ENTITY_TYPE_LABELS)

export default { ENTITY_TYPES, ENTITY_STATES, ENTITY_TYPE_LABELS, ENTITY_TYPE_ORDER }
