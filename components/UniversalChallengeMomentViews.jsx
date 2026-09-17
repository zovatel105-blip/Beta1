'use client'

import { useState } from 'react'
import { Check, Flag, Lock, Trophy } from 'lucide-react'
import { RULE_META } from '@/lib/universalChallengeRuleMeta'
import { STRUCTURE_META } from '@/lib/universalChallengeParticipantStructures'

/**
 * Universal Challenge Engine — shared per-rule-family presentational views.
 *
 * ADDITIVE, NEW MODULE, zero relationship to the legacy poll-moment engine
 * (`ChallengeMomentPills.jsx` is still reused directly, unmodified, for the
 * genuinely vote-shaped rules — ELIMINATION / SEQUENTIAL_MATCHUP /
 * PREDICTION — exactly per the customer's instruction). These are the
 * pieces stage 1 never needed (its editor preview only ever rendered a
 * generic question+pills mock) because stage 1 had no real inputs/results
 * to show — a read-only measurement/results display, a first-to-objective
 * leaderboard, and a two-input combined-answer form.
 *
 * SHARED BY DESIGN — both `UniversalChallengeEditor.jsx` (authoring-time
 * preview, always read-only: no backend challenge exists yet to submit
 * against) and `UniversalChallengeMomentOverlay.jsx` (the Feed, live +
 * interactive) render through these exact same components, so a round
 * looks identical whether you're scrubbing the editor's preview or
 * watching it happen live. Every "can the viewer act right now" question is
 * answered purely through props (`editableIds` / `onSubmit` /
 * `onMarkComplete`) — omit the handler and a view is automatically
 * read-only, same convention `ChallengeMomentPills` already uses
 * (`onOptionClick` present vs absent).
 */

const pillBase = 'px-3 py-1.5 rounded-full text-[12.5px] font-semibold border backdrop-blur-md whitespace-nowrap'
const cardBase = 'rounded-2xl bg-black/40 backdrop-blur-md border border-white/15 px-3 py-2.5'

// `participantStructure` (Universal Challenge Engine's "Participant
// Structure" concept, see lib/universalChallengeParticipantStructures.js)
// is an OPTIONAL override purely for the badge's label/color — an event
// authored through one of the five named structures shows that name
// ("Guess the Actor", "Tournament match", …) instead of the underlying
// rule's generic label, while still resolving via that same rule. Omit it
// (or pass null, e.g. every event authored through the plain rule picker)
// and the badge renders exactly as before, straight from `rule`.
export function MomentRuleBadge({ rule, participantStructure, className = '' }) {
  const structMeta = participantStructure ? STRUCTURE_META[participantStructure] : null
  const meta = RULE_META[rule]
  const label = structMeta?.shortLabel || meta?.label || rule
  const color = structMeta?.color || meta?.color || 'bg-white/30'
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow ${color} ${className}`}>
      {label}
    </span>
  )
}

function AvatarDot({ avatarUrl, label }) {
  return avatarUrl ? (
    <img src={avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
  ) : (
    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0">
      {(label || '?')[0]?.toUpperCase()}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Measurement-shaped: HIGHEST_SCORE / LOWEST_SCORE / FASTEST / COMPARISON /
// SURVIVAL. Read-only ranked standings once any values exist / once
// resolved; an editable per-participant numeric field when the viewer may
// submit one right now (`editableIds`).
// ---------------------------------------------------------------------------
export function MeasurementMomentView({
  question,
  participants = [],
  values = {},
  winnerIds = [],
  resolved = false,
  editableIds = [],
  onSubmit,
  unitLabel = '',
  className = '',
}) {
  const [drafts, setDrafts] = useState({})
  const editable = new Set(editableIds)
  const winners = new Set(winnerIds)
  const hasAnyValue = participants.some((p) => values[p.id] != null)

  // Sort best-first once we have something to rank; lower vs higher "best"
  // is already resolved server-side into `winnerIds` — client-side sort is
  // purely cosmetic ordering (winner(s) first, then by whether they have a
  // value at all, else authored order).
  const ordered = [...participants].sort((a, b) => {
    const aw = winners.has(a.id) ? 0 : 1
    const bw = winners.has(b.id) ? 0 : 1
    if (aw !== bw) return aw - bw
    const av = values[a.id]
    const bv = values[b.id]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return 0
  })

  return (
    <div className={`${cardBase} ${className}`}>
      {question && <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1.5 truncate">{question}</p>}
      <div className="flex flex-col gap-1.5">
        {ordered.map((p) => {
          const isEditable = editable.has(p.id)
          const val = values[p.id]
          const draft = drafts[p.id] ?? ''
          return (
            <div key={p.id} className={`flex items-center gap-2 ${pillBase} ${winners.has(p.id) ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/40'}`}>
              <AvatarDot avatarUrl={p.avatarUrl} label={p.label} />
              <span className="flex-1 min-w-0 truncate">{p.label}</span>
              {winners.has(p.id) && <Trophy size={12} className="shrink-0" />}
              {isEditable ? (
                <form
                  className="flex items-center gap-1 shrink-0"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const num = Number(draft)
                    if (!Number.isFinite(num)) return
                    onSubmit?.(p.id, num)
                  }}
                >
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder={unitLabel || 'value'}
                    data-testid={`measurement-input-${p.id}`}
                    className="w-16 rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-[11.5px] text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                  <button type="submit" data-testid={`measurement-submit-${p.id}`} className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-90 shrink-0">
                    <Check size={11} />
                  </button>
                </form>
              ) : (
                <span className="shrink-0 font-mono tabular-nums text-[11.5px]">
                  {val != null ? `${val}${unitLabel}` : resolved ? '—' : hasAnyValue ? '…' : 'pending'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {!resolved && !hasAnyValue && editable.size === 0 && (
        <p className="mt-1.5 text-[10.5px] text-white/60">Results will appear once this round closes.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FIRST_TO_OBJECTIVE — completion leaderboard. Read-only, or a "mark
// complete" button per participant the viewer may act for right now.
// ---------------------------------------------------------------------------
export function ObjectiveMomentView({
  question,
  participants = [],
  completions = {},
  winnerIds = [],
  resolved = false,
  editableIds = [],
  onMarkComplete,
  className = '',
}) {
  const editable = new Set(editableIds)
  const winners = new Set(winnerIds)
  const ordered = [...participants].sort((a, b) => {
    const at = completions[a.id]
    const bt = completions[b.id]
    if (at == null && bt == null) return 0
    if (at == null) return 1
    if (bt == null) return -1
    return at - bt
  })

  return (
    <div className={`${cardBase} ${className}`}>
      {question && <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1.5 truncate">{question}</p>}
      <div className="flex flex-col gap-1.5">
        {ordered.map((p) => {
          const done = completions[p.id] != null
          const isEditable = editable.has(p.id) && !done
          return (
            <div key={p.id} className={`flex items-center gap-2 ${pillBase} ${winners.has(p.id) ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/40'}`}>
              <AvatarDot avatarUrl={p.avatarUrl} label={p.label} />
              <span className="flex-1 min-w-0 truncate">{p.label}</span>
              {winners.has(p.id) && <Trophy size={12} className="shrink-0" />}
              {isEditable ? (
                <button
                  type="button"
                  onClick={() => onMarkComplete?.(p.id)}
                  data-testid={`objective-complete-${p.id}`}
                  className="shrink-0 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold active:scale-95"
                >
                  <Flag size={10} /> Mark done
                </button>
              ) : (
                <span className="shrink-0 text-[11px]">{done ? 'Finished' : resolved ? '—' : 'In progress'}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// INPUT_VALIDATION — one text field per required participant, combined
// into a single answer server-side. A slot locks the moment it has ANY
// submitted value (see UniversalChallengeMomentOverlay.jsx for why: the
// backend upserts participant-shaped input keyed by
// (challengeId, eventId, participantId) only — it has no participant<->user
// identity model, so any authenticated viewer may legally submit for any
// participant slot; locking client-side the instant a slot is filled is
// this UI's own "one input per slot" guard, not a server-enforced one).
// ---------------------------------------------------------------------------
export function InputValidationMomentView({
  question,
  participants = [],
  values = {},
  resolved = false,
  isValid = null,
  editableIds = [],
  onSubmit,
  className = '',
}) {
  const [drafts, setDrafts] = useState({})
  const editable = new Set(editableIds)

  return (
    <div className={`${cardBase} ${className}`}>
      {question && <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1.5 truncate">{question}</p>}
      <div className="flex flex-col gap-1.5">
        {participants.map((p) => {
          const submitted = values[p.id] != null && values[p.id] !== ''
          const isEditable = editable.has(p.id) && !submitted
          const draft = drafts[p.id] ?? ''
          return (
            <div key={p.id} className={`flex items-center gap-2 ${pillBase} bg-black/40 text-white border-white/40`}>
              <AvatarDot avatarUrl={p.avatarUrl} label={p.label} />
              <span className="w-16 shrink-0 truncate">{p.label}</span>
              {isEditable ? (
                <form
                  className="flex items-center gap-1 flex-1 min-w-0"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const v = draft.trim()
                    if (!v) return
                    onSubmit?.(p.id, v)
                  }}
                >
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    placeholder="Your answer"
                    data-testid={`input-validation-field-${p.id}`}
                    className="flex-1 min-w-0 rounded-full bg-white/10 border border-white/20 px-2 py-0.5 text-[11.5px] text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                  <button type="submit" data-testid={`input-validation-submit-${p.id}`} className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-90 shrink-0">
                    <Check size={11} />
                  </button>
                </form>
              ) : (
                <span className="flex-1 min-w-0 truncate flex items-center gap-1 text-[11.5px]">
                  {submitted ? (
                    <>
                      <Lock size={9} className="shrink-0 opacity-70" /> {String(values[p.id])}
                    </>
                  ) : resolved ? (
                    <span className="italic text-white/60">no submission</span>
                  ) : (
                    <span className="italic text-white/50">waiting…</span>
                  )}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {resolved && isValid !== null && (
        <p className={`mt-1.5 text-[11px] font-semibold ${isValid ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isValid ? 'Valid — round passed ✓' : 'Invalid — round failed ✗'}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TWO_SIDE_CHOICE (a PREDICTION-rule "Participant Structure", see
// lib/universalChallengeParticipantStructures.js) — exactly two options,
// rendered as a big left/right split rather than the generic pill list
// (`ChallengeMomentPills`, still used as-is for every other vote-shaped
// rule/structure) so a fast either/or pick reads visually distinct. Same
// tally/vote data shape as ChallengeMomentPills — this is presentation
// only, no new evaluation logic.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// RANKING (additive, Phase 2 — shared by the "Order/Ranking" structure's
// per-event full-standings display AND ALL_VS_ALL's cross-event win-count
// standings, both of which hand this the exact same `ranking:
// [{participantId, rank, value}]` shape produced by
// lib/challengeRuleEngine.js's `competitionRanking()` — one rendering for
// one ranking format, never duplicated). Read-only: a full ranking is
// always a RESULT (either the Rule Engine's own additive output-mode
// result, or a cross-event win-count tally), never something a viewer
// submits input into directly.
// ---------------------------------------------------------------------------
export function RankingMomentView({
  question,
  participants = [],
  ranking = null,
  resolved = false,
  unitLabel = '',
  footer,
  className = '',
}) {
  const rankOf = new Map((ranking || []).map((r) => [r.participantId, r]))
  const ordered = [...participants].sort((a, b) => {
    const ra = rankOf.get(a.id)?.rank
    const rb = rankOf.get(b.id)?.rank
    if (ra == null && rb == null) return 0
    if (ra == null) return 1
    if (rb == null) return -1
    return ra - rb
  })
  const ordinal = (n) => {
    if (n == null) return '—'
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
  }
  return (
    <div className={`${cardBase} ${className}`} data-testid="ranking-moment-view">
      {question && <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1.5 truncate">{question}</p>}
      <div className="flex flex-col gap-1.5">
        {ordered.map((p) => {
          const r = rankOf.get(p.id)
          return (
            <div key={p.id} className={`flex items-center gap-2 ${pillBase} ${r?.rank === 1 ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/40'}`}>
              <span className="w-7 shrink-0 font-mono font-bold text-[11px] text-center">{ordinal(r?.rank)}</span>
              <AvatarDot avatarUrl={p.avatarUrl} label={p.label} />
              <span className="flex-1 min-w-0 truncate">{p.label}</span>
              {r?.rank === 1 && <Trophy size={12} className="shrink-0" />}
              <span className="shrink-0 font-mono tabular-nums text-[11px]">{r?.value != null ? `${r.value}${unitLabel}` : resolved ? '—' : '…'}</span>
            </div>
          )
        })}
      </div>
      {!resolved && !ranking && <p className="mt-1.5 text-[10.5px] text-white/60">Full ranking will appear once this round closes.</p>}
      {footer}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TEAM_VS_TEAM (additive, Phase 2; REDESIGNED — compact team-only overlay).
// A single-line, horizontal, semi-transparent strip: each team's avatars +
// name on its own side, exactly ONE shared team-level result value in the
// middle (read straight from `computeTeamStandings()` —
// lib/universalChallengeParticipantStructures.js — never recomputed here),
// and a trophy on the winning team once resolved. Deliberately shows NO
// per-participant field at all (no individual values, no ms breakdowns, no
// per-member scores, no checkmarks) — team-level only, so it never competes
// with the video/participants for attention. Small enough to sit in the
// normal flow just above the avatar row (see UniversalChallengeMomentOverlay.jsx)
// without covering the main action.
// ---------------------------------------------------------------------------
function formatTeamValue(value, unitLabel) {
  if (value == null || !Number.isFinite(value)) return '—'
  if (unitLabel === 'ms') return `${(value / 1000).toFixed(1)}s`
  if (unitLabel) return `${value}${unitLabel}`
  return `${value} pts`
}

// Exported (additive) so UniversalChallengeMomentOverlay.jsx can reuse the
// exact same avatar-cluster presentation for the community-vote Team vs
// Team path's ChallengeMomentPills-style vote options — "Girls"/"Boys"
// rendered with each team's member avatars, not just a bare label.
export function TeamAvatarStack({ participants = [] }) {
  if (!participants.length) return null
  return (
    <div className="flex -space-x-2 shrink-0">
      {participants.slice(0, 3).map((p) => (
        <span key={p.id} className="rounded-full ring-2 ring-black/70">
          <AvatarDot avatarUrl={p.avatarUrl} label={p.label} />
        </span>
      ))}
    </div>
  )
}

export function TeamVsTeamMomentView({
  question,
  standings,
  participantsById = new Map(),
  resolved = false,
  unitLabel = '',
  className = '',
}) {
  if (!standings) {
    return (
      <div className={`${cardBase} ${className}`} data-testid="team-vs-team-view">
        {question && <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1 truncate">{question}</p>}
        <p className="text-[11px] text-white/60 italic">Teams not configured for this round.</p>
      </div>
    )
  }

  const { standings: teams, winningTeamId } = standings
  const [teamA, teamB] = teams
  const membersOf = (team) => (team.memberValues || []).map((mv) => participantsById.get(mv.participantId)).filter(Boolean)

  const teamSide = (team, align) => {
    const isWinning = resolved && winningTeamId === team.teamId
    const nameEl = <span className="text-[12px] font-bold text-white truncate">{team.label}</span>
    const avatars = <TeamAvatarStack participants={membersOf(team)} />
    const trophy = isWinning ? <Trophy size={12} className="shrink-0 text-amber-300" /> : null
    return align === 'right' ? (
      <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end" data-testid={`team-side-${team.teamId}`}>
        {trophy}
        {nameEl}
        {avatars}
      </div>
    ) : (
      <div className="flex items-center gap-1.5 min-w-0 flex-1" data-testid={`team-side-${team.teamId}`}>
        {avatars}
        {nameEl}
        {trophy}
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`} data-testid="team-vs-team-view">
      {question && <p className="text-white/70 text-[10px] font-semibold truncate px-1">{question}</p>}
      <div className="flex items-center gap-2 rounded-full bg-black/45 backdrop-blur-md border border-white/15 px-3 py-1.5 shadow-lg shadow-black/30 max-w-full">
        {teamSide(teamA, 'left')}
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40">
          <span className="font-mono tabular-nums text-[11px] font-bold text-white">{formatTeamValue(teamA.aggregate, unitLabel)}</span>
          <span className="text-[9px] font-extrabold text-rose-300">VS</span>
          <span className="font-mono tabular-nums text-[11px] font-bold text-white">{formatTeamValue(teamB.aggregate, unitLabel)}</span>
        </div>
        {teamSide(teamB, 'right')}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PROGRESSIVE_CHALLENGE (additive, Phase 2) — per-stage boolean pass/fail,
// extending the same creator-marks-the-result pattern LOWEST_SCORE-style
// measurement rounds already use, but a Pass/Fail button pair instead of a
// numeric field (see lib/challengeRuleEngine.js `survival()`
// `conditionMode: 'per_participant_pass_fail'`).
// ---------------------------------------------------------------------------
export function ProgressiveStageMomentView({
  question,
  participants = [],
  values = {},
  resolved = false,
  editableIds = [],
  onSubmit,
  stageNumber,
  totalStages,
  className = '',
}) {
  const editable = new Set(editableIds)
  return (
    <div className={`${cardBase} ${className}`} data-testid="progressive-stage-view">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        {question && <p className="text-white text-[12px] font-semibold drop-shadow-md truncate">{question}</p>}
        {stageNumber != null && <span className="shrink-0 text-[10px] font-bold text-white/60">Stage {stageNumber}{totalStages ? `/${totalStages}` : ''}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        {participants.map((p) => {
          const val = values[p.id]
          const isEditable = editable.has(p.id) && val == null
          return (
            <div key={p.id} className={`flex items-center gap-2 ${pillBase} ${val === true ? 'bg-emerald-500/80 text-white border-emerald-300' : val === false ? 'bg-rose-500/70 text-white border-rose-300' : 'bg-black/40 text-white border-white/40'}`}>
              <AvatarDot avatarUrl={p.avatarUrl} label={p.label} />
              <span className="flex-1 min-w-0 truncate">{p.label}</span>
              {isEditable ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => onSubmit?.(p.id, true)} data-testid={`progressive-pass-${p.id}`} className="px-2 py-0.5 rounded-full bg-emerald-500/80 text-white text-[10.5px] font-bold active:scale-90 transition">Pass</button>
                  <button type="button" onClick={() => onSubmit?.(p.id, false)} data-testid={`progressive-fail-${p.id}`} className="px-2 py-0.5 rounded-full bg-rose-500/70 text-white text-[10.5px] font-bold active:scale-90 transition">Fail</button>
                </div>
              ) : (
                <span className="shrink-0 text-[11px] font-semibold">{val === true ? 'Passed' : val === false ? 'Failed' : resolved ? '—' : 'Pending'}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Cross-stage tracker (additive, Phase 2) — reads
// `computeProgressiveStandings()`'s output (see
// lib/universalChallengeParticipantStructures.js) to show EVERY
// participant's furthest-reached stage at a glance, independent of which
// single stage event happens to be active right now. Rendered ALONGSIDE
// (below) the current stage's `ProgressiveStageMomentView` by the Feed
// overlay, not instead of it.
export function ProgressiveStandingsView({ standings, participantsById = new Map(), className = '' }) {
  if (!standings) return null
  const { rows, winnerIds, totalStages, resolved } = standings
  const sortedRows = [...rows].sort((a, b) => b.furthestStage - a.furthestStage)
  return (
    <div className={`${cardBase} ${className}`} data-testid="progressive-standings-view">
      <p className="text-white text-[11.5px] font-semibold mb-1.5">Furthest stage reached</p>
      <div className="flex flex-col gap-1">
        {sortedRows.map((row) => {
          const p = participantsById.get(row.participantId)
          const isWinner = winnerIds.includes(row.participantId)
          return (
            <div key={row.participantId} className="flex items-center gap-2 text-[11px] text-white/90">
              <AvatarDot avatarUrl={p?.avatarUrl} label={p?.label} />
              <span className="flex-1 min-w-0 truncate">{p?.label || 'Participant'}</span>
              {isWinner && <Trophy size={11} className="shrink-0 text-amber-300" />}
              <span className="shrink-0 font-mono">{row.furthestStage > 0 ? `${row.furthestStage}/${totalStages}` : '—'}{row.furthestStageLabel ? ` (${row.furthestStageLabel})` : ''}</span>
              <span className={`shrink-0 text-[10px] font-semibold ${row.stillActive ? 'text-emerald-400' : row.failedAtStage ? 'text-rose-400' : 'text-white/50'}`}>
                {row.stillActive ? (resolved ? (isWinner ? 'Winner' : 'Cleared') : 'Still in') : row.failedAtStage ? 'Eliminated' : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Running win/loss tally for ONE_VS_ALL (additive, Phase 2) — reads
// `computeOneVsAllTally()`'s output. Rendered ALONGSIDE the currently-active
// matchup's ordinary vote-pill body, not instead of it.
export function OneVsAllTallyView({ tally, participantsById = new Map(), className = '' }) {
  if (!tally) return null
  const anchor = participantsById.get(tally.anchorParticipantId)
  return (
    <div className={`${cardBase} ${className}`} data-testid="one-vs-all-tally-view">
      <div className="flex items-center gap-2 mb-1.5">
        <AvatarDot avatarUrl={anchor?.avatarUrl} label={anchor?.label} />
        <span className="text-white text-[12px] font-semibold">{anchor?.label || 'Anchor'}</span>
        <span className="text-[11px] font-mono text-white/70">{tally.wins}W - {tally.losses}L</span>
        <span className="text-[10px] text-white/50 ml-auto">{tally.resolvedCount}/{tally.total} resolved</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tally.matchups.map((m) => {
          const opp = participantsById.get(m.opponentId)
          return (
            <span key={m.eventId} className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${m.outcome === 'win' ? 'bg-emerald-500/70 border-emerald-300 text-white' : m.outcome === 'loss' ? 'bg-rose-500/60 border-rose-300 text-white' : 'bg-black/30 border-white/20 text-white/70'}`}>
              vs {opp?.label || 'Opponent'}{m.outcome ? ` (${m.outcome})` : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function TwoSideChoiceMomentView({
  question,
  options = [], // exactly 2: [{ id, label }]
  tally = {},
  totalVotes = 0,
  selectedId = null,
  correctOptionId = null,
  resolved = false,
  onPick,
  footer,
  className = '',
}) {
  const [left, right] = options
  const side = (opt) => {
    if (!opt) return <div className="flex-1" />
    const pct = totalVotes > 0 ? Math.round(((tally[opt.id] || 0) / totalVotes) * 100) : null
    const isSelected = selectedId === opt.id
    const isCorrect = correctOptionId ? correctOptionId === opt.id : false
    const Tag = onPick ? 'button' : 'div'
    return (
      <Tag
        key={opt.id}
        type={onPick ? 'button' : undefined}
        onClick={onPick ? (e) => { e.stopPropagation(); onPick(opt.id) } : undefined}
        data-testid={`two-side-choice-${opt.id}`}
        className={`flex-1 min-w-0 rounded-2xl border backdrop-blur-md px-3 py-3 flex flex-col items-center justify-center gap-1 transition ${onPick ? 'active:scale-95' : ''} ${
          isSelected ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/40'
        } ${isCorrect ? 'ring-2 ring-emerald-400' : ''}`}
      >
        <span className="text-[13px] font-bold text-center break-words w-full">{opt.label}{isCorrect && ' ✓'}</span>
        {pct != null && <span className="text-[11px] font-mono opacity-80">{pct}%</span>}
      </Tag>
    )
  }
  return (
    <div className={`${cardBase} ${className}`}>
      {question && <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1.5 truncate">{question}</p>}
      <div className="flex items-stretch gap-2">
        {side(left)}
        <span className="self-center text-[10.5px] font-bold text-white/50 px-0.5">VS</span>
        {side(right)}
      </div>
      {footer}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UNIVERSAL WINNER REVEAL (additive) — the generic, structure-agnostic
// "the whole Challenge is over, here's who won" presentation. Driven by
// `UniversalChallengeMomentOverlay.jsx`'s `computeChallengeWinnerSummary`,
// a pure reader over data the Rule Engine / State Engine / existing Phase 2
// structure summary helpers have ALREADY computed — nothing here decides a
// winner, it only renders one. Two pieces, both accepting the exact same
// `{ winners: [{id,label}], kind: 'participant'|'team', tie }` shape for
// EVERY mechanic:
//   - WinnerRevealBanner: the brief, visually bold callout shown only near
//     the video's very end (see the overlay's `videoPhase === 'reveal'`).
//   - WinnerSettledMarker: a small, quiet, persistent marker left in place
//     afterwards (or once the video ends) — never blocks the video.
// `winners` may legitimately be empty (a mechanic with no single-champion
// concept, e.g. a bare ELIMINATION chain) — both render nothing then. `tie`
// (or `winners.length > 1`) is rendered as a shared "TIE"/"tied" result
// rather than assuming exactly one winner, since the engine itself allows
// co-winners (e.g. Progressive Challenge).
// ---------------------------------------------------------------------------
function winnerNames(winners) {
  const names = (winners || []).map((w) => w.label || 'Winner')
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

export function WinnerRevealBanner({ winners = [], tie = false, className = '' }) {
  if (!winners.length) return null
  const label = winnerNames(winners)
  const isTie = tie || winners.length > 1
  return (
    <div className={`pointer-events-none flex items-center justify-center ${className}`} data-testid="universal-winner-reveal">
      <div className="animate-popIn flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600/90 via-rose-500/90 to-pink-600/90 border border-white/30 shadow-xl shadow-rose-900/40 backdrop-blur-md px-4 py-2.5 max-w-[calc(100%-1rem)]">
        <span className="text-[18px] shrink-0 animate-bounce" aria-hidden>🏆</span>
        <span className="text-white font-extrabold text-[14px] tracking-wide truncate drop-shadow-md">
          {isTie ? `${label} TIE!` : `${label} WINS!`}
        </span>
      </div>
    </div>
  )
}

export function WinnerSettledMarker({ winners = [], tie = false, className = '' }) {
  if (!winners.length) return null
  const label = winnerNames(winners)
  const isTie = tie || winners.length > 1
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15 px-2.5 py-1 max-w-[calc(100%-1rem)] ${className}`}
      data-testid="universal-winner-settled"
    >
      <Trophy size={11} className="text-amber-300 shrink-0" />
      <span className="text-white text-[11px] font-bold truncate">{isTie ? `${label} tied` : `${label} won`}</span>
    </div>
  )
}

export default {
  MomentRuleBadge,
  MeasurementMomentView,
  ObjectiveMomentView,
  InputValidationMomentView,
  TwoSideChoiceMomentView,
  RankingMomentView,
  TeamVsTeamMomentView,
  TeamAvatarStack,
  ProgressiveStageMomentView,
  ProgressiveStandingsView,
  OneVsAllTallyView,
  WinnerRevealBanner,
  WinnerSettledMarker,
}
