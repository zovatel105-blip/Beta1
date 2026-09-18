'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Check, ChevronRight, Copy, Info, Link2, Pause, Pencil, Play, Plus,
  Trash2, Trophy, UserPlus, Users, X,
} from 'lucide-react'
import ChallengeMomentPills from './ChallengeMomentPills'
import {
  MomentRuleBadge, MeasurementMomentView, ObjectiveMomentView, InputValidationMomentView, TwoSideChoiceMomentView,
  RankingMomentView, TeamVsTeamMomentView, ProgressiveStageMomentView,
} from './UniversalChallengeMomentViews'
import { RULES } from '@/lib/challengeRuleEngine'
import { RULE_META, RULE_ORDER, ruleFamily } from '@/lib/universalChallengeRuleMeta'
import { resolveActiveEvent, sortEventsByStart } from '@/lib/universalChallengeTimeline'
import {
  PARTICIPANT_STRUCTURES, STRUCTURE_META, structureOptionSource, structureRuleOf, structureAllowedRules, structureDefaultRuleConfig,
} from '@/lib/universalChallengeParticipantStructures'
import { ENTITY_TYPES, ENTITY_TYPE_LABELS, ENTITY_TYPE_ORDER } from '@/lib/universalChallengeEntityTypes'

/**
 * UniversalChallengeEditor — authoring screen for the NEW "Universal
 * Challenge Engine" (participants + a chain of ruled timeline events on ONE
 * video), completely separate from `ChallengeTimelineEditor.jsx` (the
 * legacy 25-mechanic simple-poll Challenge builder).
 *
 * SEPARATION FROM THE LEGACY FLOW — this is an entirely different
 * component, reachable from an entirely different button in
 * `UploadDialog.jsx` (a distinct icon placed next to, never replacing, the
 * existing "Interactive challenge" button that opens
 * `ChallengeTimelineEditor`). Nothing in this file imports from or mutates
 * `challengeMechanics.js` / `challengeMechanicGroups.js` / the legacy
 * moments array. The one thing intentionally reused is
 * `ChallengeMomentPills` — the shared question+options pill presentation
 * — purely for visual consistency with the rest of the app (same reasoning
 * `ChallengeTimelineEditor` already documents for its own preview).
 *
 * DATA CONTRACT — shaped to match `lib/universalChallengeStore.js` exactly
 * (`normalizeParticipants`/`normalizeEvents`), since `onSave` hands the
 * result straight to `POST /api/universal-challenges/posts/{postId}` from
 * `UploadDialog.jsx` once a real postId exists (same "author now, attach
 * after upload" sequencing the legacy engine already uses for `moments`):
 *   participants: [{ id, label, avatarUrl }]
 *   events: [{ id, startTime, endTime, type, interaction, rule, ruleConfig,
 *              participantIds, autoAdvanceFrom, question, options,
 *              measurementSource, votingWindow }]
 *
 * CHAINING (bracket-style rounds) — authored by picking "advance the
 * winner from a previous round" for an event: this sets `autoAdvanceFrom`
 * to the source event's id and the creator then only picks the NEW
 * participant(s) joining this round (e.g. participant C for round 2 of a
 * A-vs-B → winner-vs-C bracket) — the carried-over winner is never
 * re-picked, it is derived server-side by `challengeStateEngine.js` from
 * the source event's result the moment it resolves.
 *
 * LIVE PREVIEW — uses the SAME shared resolver
 * (`resolveActiveEvent`) that will later back the Feed-side rendering, so
 * "move the scrubber, see which round is active" behaves identically to
 * `ChallengeTimelineEditor`'s `activeMoment` lookup, just against the new
 * events/participants model.
 */

const fmtTime = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0))
  const m = Math.floor(n / 60)
  const sec = n % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi))
const round1 = (v) => Math.round(v * 10) / 10
const genLocalId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

// Rule metadata (label/color/desc/family) now lives in
// `lib/universalChallengeRuleMeta.js`, shared with the Feed-side renderer
// (`UniversalChallengeMomentOverlay.jsx`) so the two never drift apart —
// see that module for the full per-rule table.

const TIE_BREAK_LABELS = { random: 'Pick randomly', creator_defined: "I'll choose the winner" }
const MISSING_SUBMISSION_LABELS = {
  eliminate: "Eliminate anyone who didn't submit",
  fail_round: 'Fail the whole round instead',
  default_value: "Use a default value for anyone who didn't submit",
  allow_other_to_continue: 'Let the others continue — only the missing participant is penalized',
}
const MISSING_SUBMISSION_ORDER = ['eliminate', 'fail_round', 'default_value', 'allow_other_to_continue']

function outcomeOptions(rule) {
  // PREDICTION is checked by rule id, not by `family`, on purpose: the
  // shared `lib/universalChallengeRuleMeta.js` groups PREDICTION under the
  // 'vote' family (Feed-side, it renders through the same ChallengeMomentPills
  // vote-shaped view as ELIMINATION/SEQUENTIAL_MATCHUP) even though its
  // AUTHORED outcome ('predict' interaction, not 'vote') is distinct.
  if (rule === RULES.PREDICTION) return [{ interaction: 'predict', measurementSource: 'creator_input', label: 'Community predicts', desc: 'Viewers submit a prediction during this round.' }]
  const family = RULE_META[rule]?.family
  if (family === 'vote') return [{ interaction: 'vote', measurementSource: 'creator_input', label: 'Community votes', desc: 'Viewers vote live during this round.' }]
  if (family === 'validation') {
    return [
      { interaction: 'answer', measurementSource: 'participant_input', label: 'Participants submit their own answer', desc: 'Each participant enters their own input.' },
      { interaction: 'none', measurementSource: 'creator_input', label: 'You enter answers for them', desc: "You type in each participant's answer." },
    ]
  }
  // measurement + survival
  return [
    { interaction: 'none', measurementSource: 'creator_input', label: 'You enter the result', desc: "You type in each participant's score/time after the round." },
    { interaction: 'answer', measurementSource: 'participant_input', label: 'Participants submit their own result', desc: 'Each participant enters their own score/time.' },
  ]
}

function defaultRuleConfig(rule) {
  return {
    tieBreak: 'random',
    tieBreakWinnerId: null,
    insufficientVotesFallback: 'most_votes_at_close',
    missingSubmissionBehavior: 'eliminate',
    defaultValue: '',
    validValues: rule === RULES.INPUT_VALIDATION ? [] : undefined,
    eliminateNonFinishers: false,
  }
}

function usesTieBreak(rule) {
  return [RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE, RULES.FASTEST, RULES.FIRST_TO_OBJECTIVE, RULES.ELIMINATION, RULES.SEQUENTIAL_MATCHUP, RULES.COMPARISON].includes(rule)
}

// Icon-up / label-down bottom action button — same pattern already proven
// in ChallengeTimelineEditor's ActionButton (kept local/duplicated rather
// than imported so this file has zero coupling to the legacy editor).
function ActionButton({ icon, label, onClick, danger, accent, disabled, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex flex-col items-center gap-1.5 min-w-[62px] active:scale-90 transition disabled:opacity-30 disabled:active:scale-100"
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
          accent
            ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30'
            : danger
            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            : 'bg-white/10 text-white border border-white/10'
        }`}
      >
        {icon}
      </span>
      <span className={`text-[11px] font-semibold ${danger ? 'text-rose-300' : 'text-zinc-300'}`}>{label}</span>
    </button>
  )
}

function Toggle({ checked, onChange, label, testId }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${checked ? 'bg-emerald-500' : 'bg-white/20'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function Chip({ selected, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border transition whitespace-nowrap active:scale-95 ${
        selected ? 'bg-white text-black border-white' : 'bg-white/10 text-zinc-200 border-white/15 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  )
}

export default function UniversalChallengeEditor({ open, onClose, videoFile, draft, onSave }) {
  const videoRef = useRef(null)
  const trackRef = useRef(null)
  const dragRef = useRef(null)
  const durationRef = useRef(0)

  const [objectUrl, setObjectUrl] = useState(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)

  const [participants, setParticipants] = useState([])
  const [teams, setTeams] = useState([])
  const [events, setEvents] = useState([])
  const [view, setView] = useState('timeline') // timeline | participants | teams | rule-picker | tournament-builder | one-vs-all-builder | all-vs-all-builder | progressive-builder | event-editor
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  // Sequential Tournament guided-builder state — see pickStructure() /
  // startFirstTournamentMatch() / addNextTournamentMatch() below.
  // { chainIds: string[] (event ids, in match order), firstPickIds: string[] (0-2, before the first match exists) }
  const [tournamentDraft, setTournamentDraft] = useState(null)
  // ONE_VS_ALL / ALL_VS_ALL / PROGRESSIVE_CHALLENGE guided-builder state
  // (additive, Phase 2) — see generateOneVsAll() / generateAllVsAll() /
  // generateProgressive() below. Each auto-generates a whole batch of
  // ordinary timeline events in one step, fully editable afterward through
  // the same drag/resize/edit machinery as any other round.
  const [oneVsAllDraft, setOneVsAllDraft] = useState(null) // { anchorId, opponentIds: string[], totalDuration: number|null, rule }
  const [allVsAllDraft, setAllVsAllDraft] = useState(null) // { participantIds: string[], totalDuration: number|null, rule }
  const [progressiveDraft, setProgressiveDraft] = useState(null) // { participantIds: string[], stageLabels: string[], totalDuration: number|null }

  const [eventDraft, setEventDraft] = useState(null)
  const [eventDraftError, setEventDraftError] = useState(null)
  const [finishError, setFinishError] = useState(null)

  const [pLabel, setPLabel] = useState('')
  const [pAvatar, setPAvatar] = useState(null)
  const [pType, setPType] = useState(ENTITY_TYPES.PERSON)
  const [tLabel, setTLabel] = useState('')

  useEffect(() => { durationRef.current = duration }, [duration])

  useEffect(() => {
    if (!open) return
    // Entity System (Phase 1) — `type` defaults to PERSON for any
    // participant authored before this phase (or by a caller that never
    // sets it), so an existing draft/challenge loads byte-identical to
    // before.
    setParticipants(draft?.participants ? draft.participants.map((p) => ({ ...p, type: p.type || ENTITY_TYPES.PERSON })) : [])
    setTeams(draft?.teams ? draft.teams.map((t) => ({ ...t, participantIds: [...(t.participantIds || [])] })) : [])
    setEvents(draft?.events ? draft.events.map((e) => ({ ...e })) : [])
    setView('timeline')
    setSelectedEventId(null)
    setDraggingId(null)
    setEventDraft(null)
    setEventDraftError(null)
    setFinishError(null)
    setPLabel('')
    setPAvatar(null)
    setPType(ENTITY_TYPES.PERSON)
    setTLabel('')
    setTournamentDraft(null)
    setOneVsAllDraft(null)
    setAllVsAllDraft(null)
    setProgressiveDraft(null)
  }, [open])

  useEffect(() => {
    if (!open || !videoFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(videoFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [open, videoFile])

  const participantsById = useMemo(() => {
    const m = new Map()
    for (const p of participants) m.set(p.id, p)
    return m
  }, [participants])

  const teamsById = useMemo(() => {
    const m = new Map()
    for (const t of teams) m.set(t.id, t)
    return m
  }, [teams])

  const sortedEvents = useMemo(() => sortEventsByStart(events), [events])
  const activeEvent = duration > 0 ? resolveActiveEvent(sortedEvents, currentTime) : null

  const eventIndex = (id) => sortedEvents.findIndex((e) => e.id === id)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play().catch(() => {}); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  const seekTo = (t) => {
    const v = videoRef.current
    if (!v || !durationRef.current) return
    v.currentTime = clamp(t, 0, durationRef.current)
    setCurrentTime(v.currentTime)
  }

  const pxToSec = (dxPx) => {
    const track = trackRef.current
    const dur = durationRef.current
    if (!track || !dur) return 0
    const rect = track.getBoundingClientRect()
    return (dxPx / rect.width) * dur
  }

  const onTrackPointerDown = (e) => {
    if (dragRef.current) return
    setSelectedEventId(null)
    const track = trackRef.current
    const dur = durationRef.current
    if (!track || !dur) return
    const rect = track.getBoundingClientRect()
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    seekTo(ratio * dur)
  }

  const onBlockPointerDown = (e, ev, mode) => {
    if (dragRef.current) return
    e.stopPropagation()
    e.preventDefault()
    const sorted = sortEventsByStart(events)
    const idx = sorted.findIndex((m) => m.id === ev.id)
    const prevEnd = idx > 0 ? sorted[idx - 1].endTime : 0
    const nextStart = idx < sorted.length - 1 ? sorted[idx + 1].startTime : duration
    dragRef.current = { id: ev.id, mode, startX: e.clientX, origStart: ev.startTime, origEnd: ev.endTime, prevEnd, nextStart, moved: false }
    setDraggingId(ev.id)
    seekTo(ev.startTime)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const onPointerMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const deltaSec = pxToSec(e.clientX - d.startX)
    if (!d.moved && Math.abs(e.clientX - d.startX) > 3) d.moved = true
    const evDur = d.origEnd - d.origStart
    let start = d.origStart
    let end = d.origEnd
    if (d.mode === 'move') {
      start = clamp(d.origStart + deltaSec, d.prevEnd, d.nextStart - evDur)
      end = start + evDur
    } else if (d.mode === 'resize-start') {
      start = clamp(d.origStart + deltaSec, d.prevEnd, d.origEnd - 1)
    } else if (d.mode === 'resize-end') {
      end = clamp(d.origEnd + deltaSec, d.origStart + 1, d.nextStart)
    }
    start = round1(start)
    end = round1(end)
    setEvents((list) => list.map((m) => (m.id === d.id ? { ...m, startTime: start, endTime: end } : m)))
    seekTo(d.mode === 'resize-end' ? Math.max(start, end - 0.15) : start)
  }, [])

  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    if (d && !d.moved) setSelectedEventId(d.id)
  }, [])

  useEffect(() => {
    if (open) return
    dragRef.current = null
    setDraggingId(null)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [open])

  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [])

  const nextDefaultRange = () => {
    const dur = duration || 15
    const sorted = sortEventsByStart(events)
    const lastEnd = sorted.length ? sorted[sorted.length - 1].endTime : 0
    const len = Math.min(5, Math.max(1, dur - lastEnd))
    const start = Math.min(lastEnd, Math.max(0, dur - len))
    return { start: round1(start), end: round1(start + len) }
  }

  // Evenly slices `totalDuration` seconds starting at `startAt` into `count`
  // consecutive events — the shared placement logic behind ONE_VS_ALL /
  // ALL_VS_ALL / PROGRESSIVE_CHALLENGE's "auto-generate N events" guided
  // builders (see generateOneVsAll/generateAllVsAll/generateProgressive
  // below). Every generated event is an ORDINARY timeline event afterward —
  // draggable/resizable/deletable/editable through the exact same generic
  // machinery as any hand-authored round.
  const generateEvenSlots = (count, startAt, totalDuration) => {
    const safeCount = Math.max(1, count)
    const len = Math.max(0.5, totalDuration / safeCount)
    return Array.from({ length: safeCount }, (_, i) => ({
      start: round1(startAt + i * len),
      end: round1(startAt + (i + 1) * len),
    }))
  }

  // ---- Participants ----
  const onAvatarFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) return // keep local drafts small
    const reader = new FileReader()
    reader.onload = () => setPAvatar(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const addParticipant = () => {
    const label = pLabel.trim()
    if (!label) return
    // Entity System (Phase 1) — `type` defaults to PERSON (`pType`'s own
    // initial value), so a creator who never opens the type picker gets
    // exactly what "add participant" always produced. `pType` is
    // deliberately NOT reset after adding — adding a batch of the same
    // kind of entity (e.g. five OBJECTs) shouldn't require re-picking the
    // type every time.
    setParticipants((list) => [...list, { id: genLocalId('participant'), label, avatarUrl: pAvatar || null, type: pType }])
    setPLabel('')
    setPAvatar(null)
  }

  const removeParticipant = (id) => {
    const used = events.some((e) => (e.participantIds || []).includes(id) || (e.ruleConfig?.tieBreakWinnerId === id))
    if (used) { setFinishError('Remove this participant from every round before deleting them.'); return }
    setParticipants((list) => list.filter((p) => p.id !== id))
  }

  // ---- Teams (additive, Phase 2 — TEAM_VS_TEAM) ----
  const addTeam = () => {
    const label = tLabel.trim()
    if (!label) return
    setTeams((list) => [...list, { id: genLocalId('team'), label, participantIds: [] }])
    setTLabel('')
  }

  const removeTeam = (id) => {
    const used = events.some((e) => (e.teamIds || []).includes(id))
    if (used) { setFinishError('Remove this team from every round before deleting it.'); return }
    setTeams((list) => list.filter((t) => t.id !== id))
  }

  const toggleTeamMember = (teamId, participantId) => {
    setTeams((list) => list.map((t) => (
      t.id === teamId
        ? { ...t, participantIds: t.participantIds.includes(participantId) ? t.participantIds.filter((x) => x !== participantId) : [...t.participantIds, participantId] }
        : t
    )))
  }

  // ---- Events ----
  const openRulePicker = () => { setSelectedEventId(null); setEventDraftError(null); setView('rule-picker') }

  const pickRule = (rule) => {
    const range = nextDefaultRange()
    const outcome = outcomeOptions(rule)[0]
    setEventDraft({
      id: null,
      startTime: range.start,
      endTime: range.end,
      rule,
      participantStructure: null,
      interaction: outcome.interaction,
      measurementSource: outcome.measurementSource,
      ruleConfig: defaultRuleConfig(rule),
      participantIds: [],
      autoAdvanceFrom: [],
      question: '',
      options: [],
    })
    setEventDraftError(null)
    setView('event-editor')
  }

  // Named "Participant Structure" entry point (see
  // lib/universalChallengeParticipantStructures.js) — a guided alternative
  // to picking a rule directly. SEQUENTIAL_TOURNAMENT routes to its own
  // step-by-step builder screen; the four PREDICTION-based structures seed
  // an event-editor draft pre-tagged with the structure (and, for the
  // free-text-option ones, two blank starter options) instead of leaving
  // the creator to discover options/participants config on their own.
  const pickStructure = (structureKey) => {
    if (structureKey === PARTICIPANT_STRUCTURES.SEQUENTIAL_TOURNAMENT) {
      if (participants.length < 2) {
        setFinishError('Add at least two participants before starting a Sequential Tournament.')
        setView('participants')
        return
      }
      setTournamentDraft({ chainIds: [], firstPickIds: [] })
      setView('tournament-builder')
      return
    }
    if (structureKey === PARTICIPANT_STRUCTURES.ONE_VS_ALL) {
      if (participants.length < 2) {
        setFinishError('Add at least two participants before starting a One vs All.')
        setView('participants')
        return
      }
      setOneVsAllDraft({ anchorId: null, opponentIds: [], totalDuration: null, rule: structureRuleOf(structureKey) })
      setView('one-vs-all-builder')
      return
    }
    if (structureKey === PARTICIPANT_STRUCTURES.ALL_VS_ALL) {
      if (participants.length < 3) {
        setFinishError('Add at least three participants before starting an All vs All.')
        setView('participants')
        return
      }
      setAllVsAllDraft({ participantIds: [], totalDuration: null, rule: structureRuleOf(structureKey) })
      setView('all-vs-all-builder')
      return
    }
    if (structureKey === PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE) {
      if (participants.length < 1) {
        setFinishError('Add participants before building a Progressive Challenge.')
        setView('participants')
        return
      }
      setProgressiveDraft({ participantIds: participants.map((p) => p.id), stageLabels: ['', ''], totalDuration: null })
      setView('progressive-builder')
      return
    }
    if (structureKey === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM) {
      if (teams.length < 2) {
        setFinishError('Create at least two teams before starting a Team vs Team round.')
        setView('teams')
        return
      }
      const range = nextDefaultRange()
      // `rule` is always RULES.PREDICTION (STRUCTURE_RULE.TEAM_VS_TEAM is
      // locked to it — see lib/universalChallengeParticipantStructures.js),
      // so there is no UI path left to pick a measurement rule for this
      // structure at all. interaction is seeded to its predict-shaped
      // value directly. `ruleConfig.outcomeMode` seeds to 'reveal' — a
      // Team vs Team viewer vote is a PREDICTION about a real-world
      // outcome, never the thing that decides it (CUSTOMER'S FINAL
      // DECISION, superseding the earlier 'vote_tally' "community vote
      // decides the winner" design). `correctOptionId` (which of the two
      // teams actually won) starts unset — required below before this
      // round can be saved, distinct in framing from any numeric/points/
      // time entry, since Team vs Team never accepts one.
      const rule = structureRuleOf(structureKey)
      setEventDraft({
        id: null,
        startTime: range.start,
        endTime: range.end,
        rule,
        participantStructure: structureKey,
        interaction: 'predict',
        measurementSource: 'creator_input',
        ruleConfig: { ...defaultRuleConfig(rule), outcomeMode: 'reveal', correctOptionId: null },
        participantIds: [],
        autoAdvanceFrom: [],
        teamIds: [],
        structureMeta: null,
        question: '',
        options: [],
      })
      setEventDraftError(null)
      setView('event-editor')
      return
    }
    if (structureKey === PARTICIPANT_STRUCTURES.ORDER_RANKING) {
      const range = nextDefaultRange()
      const rule = structureRuleOf(structureKey)
      setEventDraft({
        id: null,
        startTime: range.start,
        endTime: range.end,
        rule,
        participantStructure: structureKey,
        interaction: 'none',
        measurementSource: 'creator_input',
        ruleConfig: { ...defaultRuleConfig(rule), ...structureDefaultRuleConfig(structureKey) },
        participantIds: [],
        autoAdvanceFrom: [],
        teamIds: [],
        structureMeta: null,
        question: '',
        options: [],
      })
      setEventDraftError(null)
      setView('event-editor')
      return
    }
    const range = nextDefaultRange()
    const optionSource = structureOptionSource(structureKey)
    setEventDraft({
      id: null,
      startTime: range.start,
      endTime: range.end,
      rule: RULES.PREDICTION,
      participantStructure: structureKey,
      interaction: 'predict',
      measurementSource: 'creator_input',
      ruleConfig: defaultRuleConfig(RULES.PREDICTION),
      participantIds: [],
      autoAdvanceFrom: [],
      teamIds: [],
      structureMeta: null,
      question: '',
      options: optionSource === 'custom' ? [{ id: genLocalId('opt'), label: '' }, { id: genLocalId('opt'), label: '' }] : [],
    })
    setEventDraftError(null)
    setView('event-editor')
  }

  const openEditEvent = (ev) => {
    setEventDraft({
      id: ev.id,
      startTime: ev.startTime,
      endTime: ev.endTime,
      rule: ev.rule,
      participantStructure: ev.participantStructure || null,
      interaction: ev.interaction,
      measurementSource: ev.measurementSource,
      ruleConfig: { ...(ev.ruleConfig || defaultRuleConfig(ev.rule)) },
      participantIds: [...(ev.participantIds || [])],
      autoAdvanceFrom: [...(ev.autoAdvanceFrom || [])],
      teamIds: [...(ev.teamIds || [])],
      structureMeta: ev.structureMeta || null,
      question: ev.question || '',
      options: (ev.options || []).map((o) => ({ id: o.id, label: o.label })),
    })
    setEventDraftError(null)
    setView('event-editor')
  }

  const labelOf = (id) => participantsById.get(id)?.label || 'Participant'

  // Step 1 of the Sequential Tournament builder: the first matchup.
  // NOTE: the new event is built and pushed via a single, direct `setEvents`
  // call here — deliberately NOT as a side effect nested inside the
  // `setTournamentDraft` functional updater (React may invoke an updater
  // function more than once, e.g. under StrictMode, which would silently
  // create the same round twice). `tournamentDraft` is read directly from
  // the enclosing closure instead, which is safe for a plain click handler.
  const startFirstTournamentMatch = () => {
    const [p1, p2] = tournamentDraft?.firstPickIds || []
    if (!p1 || !p2) return
    const range = nextDefaultRange()
    const id = genLocalId('event')
    const ev = {
      id,
      startTime: range.start,
      endTime: range.end,
      type: 'round',
      interaction: 'vote',
      rule: RULES.SEQUENTIAL_MATCHUP,
      ruleConfig: defaultRuleConfig(RULES.SEQUENTIAL_MATCHUP),
      participantIds: [p1, p2],
      autoAdvanceFrom: [],
      participantStructure: PARTICIPANT_STRUCTURES.SEQUENTIAL_TOURNAMENT,
      question: `${labelOf(p1)} vs ${labelOf(p2)}`,
      options: [],
      measurementSource: 'creator_input',
      votingWindow: null,
    }
    setEvents((list) => sortEventsByStart([...list, ev]))
    setTournamentDraft((d) => ({ ...d, chainIds: [id] }))
  }

  // Step 2+: "add participant -> becomes next opponent -> repeat", exactly
  // the guided flow the customer asked for — each call chains a brand-new
  // SEQUENTIAL_MATCHUP event off the last one via autoAdvanceFrom, so the
  // winner of the previous match is derived automatically by
  // challengeStateEngine.js; the creator only ever picks the NEW opponent.
  // Same single-`setEvents`-call precaution as startFirstTournamentMatch above.
  const addNextTournamentMatch = (newParticipantId) => {
    const sourceId = tournamentDraft?.chainIds?.[tournamentDraft.chainIds.length - 1]
    if (!sourceId) return
    const range = nextDefaultRange()
    const id = genLocalId('event')
    const ev = {
      id,
      startTime: range.start,
      endTime: range.end,
      type: 'round',
      interaction: 'vote',
      rule: RULES.SEQUENTIAL_MATCHUP,
      ruleConfig: defaultRuleConfig(RULES.SEQUENTIAL_MATCHUP),
      participantIds: [newParticipantId],
      autoAdvanceFrom: [sourceId],
      participantStructure: PARTICIPANT_STRUCTURES.SEQUENTIAL_TOURNAMENT,
      question: `Winner faces ${labelOf(newParticipantId)}`,
      options: [],
      measurementSource: 'creator_input',
      votingWindow: null,
    }
    setEvents((list) => sortEventsByStart([...list, ev]))
    setTournamentDraft((d) => ({ ...d, chainIds: [...d.chainIds, id] }))
  }

  // Auto-generates N independent (NOT chained) matchups: the anchor faces
  // every listed opponent, one per event, evenly spaced across
  // `totalDuration` seconds starting at the next free timeline slot. Unlike
  // Sequential Tournament, the anchor's participation in event i+1 never
  // depends on event i's outcome — every matchup is authored with the
  // anchor directly in `participantIds`, no `autoAdvanceFrom` at all.
  const generateOneVsAll = () => {
    const { anchorId, opponentIds, totalDuration, rule: draftRule } = oneVsAllDraft || {}
    if (!anchorId || !opponentIds?.length) return
    const rule = draftRule || RULES.SEQUENTIAL_MATCHUP
    const groupId = genLocalId('ova')
    const startAt = nextDefaultRange().start
    const dur = totalDuration || opponentIds.length * 5
    const slots = generateEvenSlots(opponentIds.length, startAt, dur)
    const newEvents = opponentIds.map((oppId, i) => ({
      id: genLocalId('event'),
      startTime: slots[i].start,
      endTime: slots[i].end,
      type: 'round',
      interaction: rule === RULES.SEQUENTIAL_MATCHUP ? 'vote' : 'none',
      rule,
      ruleConfig: defaultRuleConfig(rule),
      participantIds: [anchorId, oppId],
      autoAdvanceFrom: [],
      participantStructure: PARTICIPANT_STRUCTURES.ONE_VS_ALL,
      teamIds: [],
      structureMeta: { groupId, anchorParticipantId: anchorId, stageIndex: i },
      question: `${labelOf(anchorId)} vs ${labelOf(oppId)}`,
      options: [],
      measurementSource: 'creator_input',
      votingWindow: null,
    }))
    setEvents((list) => sortEventsByStart([...list, ...newEvents]))
    setView('timeline')
    setOneVsAllDraft(null)
  }

  // Auto-generates every unique pairwise matchup among a participant list
  // (round robin — C(N,2) independent events, again NOT chained).
  const generateAllVsAll = () => {
    const { participantIds: pids, totalDuration, rule: draftRule } = allVsAllDraft || {}
    if (!pids || pids.length < 2) return
    const rule = draftRule || RULES.SEQUENTIAL_MATCHUP
    const pairs = []
    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) pairs.push([pids[i], pids[j]])
    }
    const groupId = genLocalId('ava')
    const startAt = nextDefaultRange().start
    const dur = totalDuration || pairs.length * 5
    const slots = generateEvenSlots(pairs.length, startAt, dur)
    const newEvents = pairs.map(([a, b], i) => ({
      id: genLocalId('event'),
      startTime: slots[i].start,
      endTime: slots[i].end,
      type: 'round',
      interaction: rule === RULES.SEQUENTIAL_MATCHUP ? 'vote' : 'none',
      rule,
      ruleConfig: defaultRuleConfig(rule),
      participantIds: [a, b],
      autoAdvanceFrom: [],
      participantStructure: PARTICIPANT_STRUCTURES.ALL_VS_ALL,
      teamIds: [],
      structureMeta: { groupId, anchorParticipantId: null, stageIndex: i },
      question: `${labelOf(a)} vs ${labelOf(b)}`,
      options: [],
      measurementSource: 'creator_input',
      votingWindow: null,
    }))
    setEvents((list) => sortEventsByStart([...list, ...newEvents]))
    setView('timeline')
    setAllVsAllDraft(null)
  }

  // Auto-generates a chain of SURVIVAL stages: stage 1 has every chosen
  // participant directly; every later stage is chained via the ordinary
  // `autoAdvanceFrom` field off the previous stage, so
  // challengeStateEngine.js's SURVIVAL-aware carry-forward (result.passed,
  // not result.winners — see lib/challengeStateEngine.js) auto-derives
  // "everyone still active" for it. Each stage is a
  // `conditionMode: 'per_participant_pass_fail'` SURVIVAL event — see
  // lib/challengeRuleEngine.js `survival()`.
  const generateProgressive = () => {
    const { participantIds: pids, stageLabels, totalDuration } = progressiveDraft || {}
    const labels = (stageLabels || []).filter((l) => l.trim())
    if (!pids?.length || labels.length < 2) return
    const groupId = genLocalId('prog')
    const startAt = nextDefaultRange().start
    const dur = totalDuration || labels.length * 5
    const slots = generateEvenSlots(labels.length, startAt, dur)
    const newEvents = []
    let prevId = null
    labels.forEach((label, i) => {
      const id = genLocalId('event')
      newEvents.push({
        id,
        startTime: slots[i].start,
        endTime: slots[i].end,
        type: 'round',
        interaction: 'none',
        rule: RULES.SURVIVAL,
        ruleConfig: { ...defaultRuleConfig(RULES.SURVIVAL), conditionMode: 'per_participant_pass_fail' },
        participantIds: i === 0 ? pids : [],
        autoAdvanceFrom: i === 0 ? [] : [prevId],
        participantStructure: PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE,
        teamIds: [],
        structureMeta: { groupId, anchorParticipantId: null, stageIndex: i },
        question: label.trim(),
        options: [],
        measurementSource: 'creator_input',
        votingWindow: null,
      })
      prevId = id
    })
    setEvents((list) => sortEventsByStart([...list, ...newEvents]))
    setView('timeline')
    setProgressiveDraft(null)
  }

  const eligibleChainSources = useMemo(() => {
    if (!eventDraft) return []
    return sortedEvents.filter((e) => e.id !== eventDraft.id && e.startTime < eventDraft.startTime)
  }, [eventDraft, sortedEvents])

  const setChain = (sourceId) => {
    setEventDraft((d) => ({ ...d, autoAdvanceFrom: sourceId ? [sourceId] : [] }))
  }

  const toggleDraftParticipant = (id) => {
    setEventDraft((d) => ({
      ...d,
      participantIds: d.participantIds.includes(id) ? d.participantIds.filter((x) => x !== id) : [...d.participantIds, id],
    }))
  }

  const setOutcome = (opt) => {
    setEventDraft((d) => ({ ...d, interaction: opt.interaction, measurementSource: opt.measurementSource }))
  }

  const saveEventDraft = () => {
    const d = eventDraft
    const optionSource = structureOptionSource(d.participantStructure)
    const isCustomOptionStructure = optionSource === 'custom'
    const isTeamStructureCheck = d.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM
    if (isTeamStructureCheck) {
      if (!d.teamIds?.[0] || !d.teamIds?.[1] || d.teamIds[0] === d.teamIds[1]) {
        setEventDraftError('Pick two different teams for this round.')
        return
      }
      // Required, not optional (unlike Majority Choice's reveal): the
      // customer's explicit decision is that Team vs Team ALWAYS resolves
      // to a real, creator-confirmed winner — never a live vote tally —
      // so this can never be left blank.
      if (!d.ruleConfig?.correctOptionId || !d.teamIds.includes(d.ruleConfig.correctOptionId)) {
        setEventDraftError('Confirm which team actually won before saving this round.')
        return
      }
    } else if (!isCustomOptionStructure && d.autoAdvanceFrom.length === 0 && d.participantIds.length === 0) {
      setEventDraftError('Pick at least one participant for this round (or chain it from a previous round).')
      return
    }
    if ((d.interaction === 'vote' || d.interaction === 'predict') && !d.question.trim()) {
      setEventDraftError('Write the question viewers will see for this round.')
      return
    }
    if (d.rule === RULES.INPUT_VALIDATION && (!Array.isArray(d.ruleConfig.validValues) || d.ruleConfig.validValues.length === 0)) {
      setEventDraftError('List at least one valid combined answer.')
      return
    }
    const cleanOptions = isCustomOptionStructure
      ? (d.options || []).map((o) => ({ id: o.id, label: o.label.trim() })).filter((o) => o.label)
      : []
    if (isCustomOptionStructure) {
      if (d.participantStructure === PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE && cleanOptions.length !== 2) {
        setEventDraftError('Two-Side Choice needs exactly two options filled in.')
        return
      }
      if (cleanOptions.length < 2) {
        setEventDraftError('Add at least two options for viewers to pick from.')
        return
      }
    }

    const isTeamStructure = d.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM
    const teamDerivedParticipantIds = isTeamStructure
      ? [...new Set([...(teamsById.get(d.teamIds?.[0])?.participantIds || []), ...(teamsById.get(d.teamIds?.[1])?.participantIds || [])])]
      : null

    const id = d.id || genLocalId('event')
    const finalEvent = {
      id,
      startTime: d.startTime,
      endTime: d.endTime,
      type: 'round',
      interaction: d.interaction,
      rule: d.rule,
      ruleConfig: d.ruleConfig,
      participantIds: isCustomOptionStructure ? [] : (isTeamStructure ? teamDerivedParticipantIds : d.participantIds),
      autoAdvanceFrom: d.autoAdvanceFrom,
      participantStructure: d.participantStructure || null,
      teamIds: d.teamIds || [],
      structureMeta: d.structureMeta || null,
      question: d.question.trim(),
      options: cleanOptions,
      measurementSource: d.measurementSource,
      votingWindow: null,
    }
    setEvents((list) => {
      const next = d.id ? list.map((e) => (e.id === id ? finalEvent : e)) : [...list, finalEvent]
      return sortEventsByStart(next)
    })
    setView('timeline')
    setEventDraft(null)
  }

  const deleteEventDraft = () => {
    setEvents((list) => list.filter((e) => e.id !== eventDraft.id).map((e) => (
      (e.autoAdvanceFrom || []).includes(eventDraft.id) ? { ...e, autoAdvanceFrom: [] } : e
    )))
    setView('timeline')
    setEventDraft(null)
  }

  const editSelected = () => {
    const e = events.find((ev) => ev.id === selectedEventId)
    if (e) openEditEvent(e)
    setSelectedEventId(null)
  }

  const duplicateSelected = () => {
    const e = events.find((ev) => ev.id === selectedEventId)
    if (!e || !duration) return
    const len = Math.max(0.5, e.endTime - e.startTime)
    const start = round1(clamp(e.endTime, 0, Math.max(0, duration - len)))
    const end = round1(Math.min(duration, start + len))
    if (end - start < 0.3) return
    const id = genLocalId('event')
    // Chaining is cleared on duplicate — a copy is a brand-new round, not a
    // second consumer of the same source event's winner.
    const dup = { ...e, id, startTime: start, endTime: end, autoAdvanceFrom: [] }
    setEvents((list) => sortEventsByStart([...list, dup]))
    setSelectedEventId(id)
  }

  const deleteSelected = () => {
    if (!selectedEventId) return
    setEvents((list) => list.filter((e) => e.id !== selectedEventId).map((e) => (
      (e.autoAdvanceFrom || []).includes(selectedEventId) ? { ...e, autoAdvanceFrom: [] } : e
    )))
    setSelectedEventId(null)
  }

  // Guards the one invariant the UI's own drag/resize clamping can't fully
  // prevent: a chained event's source must sit strictly earlier on the
  // timeline (the server sorts by startTime and rejects an autoAdvanceFrom
  // id it hasn't seen yet in that order — see normalizeEvents).
  const validateChainOrder = () => {
    const sorted = sortEventsByStart(events)
    const idx = new Map(sorted.map((e, i) => [e.id, i]))
    for (const e of sorted) {
      for (const src of e.autoAdvanceFrom || []) {
        if (!idx.has(src)) return `"${e.question || e.rule}" is chained from a round that no longer exists.`
        if (idx.get(src) >= idx.get(e.id)) return `"${e.question || e.rule}" must start after the round it advances from — drag it later on the timeline.`
      }
    }
    return null
  }

  const finish = () => {
    const chainErr = validateChainOrder()
    if (chainErr) { setFinishError(chainErr); return }
    // Entity System (Phase 1) — project the same authored data into the
    // new entities/groups shape alongside the unchanged participants/teams
    // (see lib/universalChallengeStore.js for how the server reconciles
    // both). A "team" is just a group; there is no separate concept here.
    const entities = participants.map((p) => ({
      id: p.id,
      type: p.type || ENTITY_TYPES.PERSON,
      name: p.label,
      displayName: p.label,
      avatarUrl: p.avatarUrl || null,
      groupId: null,
      metadata: {},
      initialState: 'ACTIVE',
    }))
    const groups = teams.map((t) => ({ id: t.id, label: t.label, entityIds: [...(t.participantIds || [])] }))
    onSave({ participants, teams, entities, groups, events: sortEventsByStart(events) })
    onClose()
  }

  const goBack = () => {
    if (view === 'timeline') { onClose(); return }
    if (view === 'participants') { setView('timeline'); return }
    if (view === 'teams') { setView('timeline'); return }
    if (view === 'rule-picker') { setView('timeline'); return }
    if (view === 'tournament-builder') { setView('timeline'); setTournamentDraft(null); return }
    if (view === 'one-vs-all-builder') { setView('timeline'); setOneVsAllDraft(null); return }
    if (view === 'all-vs-all-builder') { setView('timeline'); setAllVsAllDraft(null); return }
    if (view === 'progressive-builder') { setView('timeline'); setProgressiveDraft(null); return }
    setView(eventDraft?.id ? 'timeline' : 'rule-picker')
  }

  if (!open) return null

  const previewParticipantOptions = activeEvent ? (() => {
    const opts = (activeEvent.participantIds || []).map((id) => ({ id, label: participantsById.get(id)?.label || 'Participant', avatarUrl: participantsById.get(id)?.avatarUrl || null }))
    for (const srcId of activeEvent.autoAdvanceFrom || []) {
      if (!(activeEvent.participantIds || []).length) {
        const srcIdx = eventIndex(srcId)
        opts.push({ id: `__winner_${srcId}`, label: `Winner of round ${srcIdx + 1}`, avatarUrl: null })
      }
    }
    return opts
  })() : []
  // Which shared per-rule-family view (see UniversalChallengeMomentViews.jsx,
  // also used live by the Feed's UniversalChallengeMomentOverlay.jsx) this
  // preview renders — the editor never has real inputs/results yet (this is
  // authoring time, before the Challenge is even saved), so every family
  // below is always shown in its "nothing submitted yet" read-only state.
  const previewFamily = activeEvent ? ruleFamily(activeEvent.rule) : null
  // 'custom' for GUESS_THE_ACTION / TWO_SIDE_CHOICE / MAJORITY_CHOICE (vote
  // options are the creator's own free-text event.options, not
  // participants); null/'participants' for everything else — unchanged.
  const previewOptionSource = activeEvent ? structureOptionSource(activeEvent.participantStructure) : null
  const previewCustomOptions = (activeEvent?.options || []).map((o) => ({ id: o.id, label: o.label }))

  return (
    <div className="fixed inset-0 z-[71] bg-[#0a0a0b] flex flex-col text-white" data-testid="universal-challenge-editor">
      <div className="flex items-center justify-between gap-2 px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: '10px' }}>
        <button onClick={goBack} aria-label="Back" data-testid="universal-challenge-back" className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 active:scale-90 transition">
          {view === 'timeline' ? <X size={19} /> : <ArrowLeft size={19} />}
        </button>
        <h2 className="text-[15px] font-bold">
          {view === 'timeline' ? 'Universal Challenge'
            : view === 'participants' ? 'Entities'
            : view === 'teams' ? 'Groups'
            : view === 'rule-picker' ? 'Choose a structure or rule'
            : view === 'tournament-builder' ? 'Sequential Tournament'
            : view === 'one-vs-all-builder' ? 'One vs All'
            : view === 'all-vs-all-builder' ? 'All vs All'
            : view === 'progressive-builder' ? 'Progressive Challenge'
            : 'Configure round'}
        </h2>
        {view === 'timeline' ? (
          <button onClick={finish} aria-label="Done" data-testid="universal-challenge-done" className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/30 hover:brightness-110 active:scale-90 transition">
            <Check size={18} strokeWidth={2.5} />
          </button>
        ) : <span className="w-9 h-9" />}
      </div>

      {view === 'timeline' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden" onClick={togglePlay}>
            {objectUrl && (
              <video
                ref={videoRef}
                src={objectUrl}
                className="max-h-full max-w-full"
                playsInline
                muted
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onEnded={() => setPlaying(false)}
              />
            )}
            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center"><Play size={22} fill="white" /></div>
              </div>
            )}
            {activeEvent && (
              <div className="absolute inset-x-0 bottom-0 p-3 pointer-events-none z-10" data-testid="universal-challenge-preview-overlay">
                <MomentRuleBadge rule={activeEvent.rule} participantStructure={activeEvent.participantStructure} className="mb-1.5" />
                {previewFamily === 'vote' && previewOptionSource === 'custom' && activeEvent.participantStructure === PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE && (
                  <TwoSideChoiceMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    options={previewCustomOptions}
                  />
                )}
                {previewFamily === 'vote' && previewOptionSource === 'custom' && activeEvent.participantStructure !== PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE && (
                  <ChallengeMomentPills
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    options={previewCustomOptions}
                    getLabel={(o) => o.label}
                  />
                )}
                {previewFamily === 'vote' && previewOptionSource !== 'custom' && activeEvent.participantStructure !== PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && (
                  <ChallengeMomentPills
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    options={previewParticipantOptions}
                    getLabel={(o) => o.label}
                    renderOptionIcon={activeEvent.participantStructure === PARTICIPANT_STRUCTURES.GUESS_THE_ACTOR ? (o) => (
                      o.avatarUrl ? (
                        <img src={o.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold shrink-0">{(o.label || '?')[0]?.toUpperCase()}</span>
                      )
                    ) : undefined}
                  />
                )}
                {/* Team vs Team preview — ALWAYS the same compact read-only
                    team strip, regardless of whether this round resolves via
                    aggregated measurement or community vote: the editor
                    never has real inputs/votes yet (authoring time, before
                    the Challenge is even saved), so there's nothing
                    interactive to preview either way. */}
                {activeEvent.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && (
                  <TeamVsTeamMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    standings={{
                      standings: (activeEvent.teamIds || []).map((tid) => {
                        const team = teamsById.get(tid)
                        return {
                          teamId: tid,
                          label: team?.label || 'Team',
                          memberValues: (team?.participantIds || []).map((pid) => ({ participantId: pid, value: null })),
                          aggregate: null,
                        }
                      }),
                      winningTeamId: null,
                    }}
                    participantsById={participantsById}
                    resolved={false}
                  />
                )}
                {previewFamily === 'measurement' && activeEvent.participantStructure === PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE && (
                  <ProgressiveStageMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    participants={previewParticipantOptions}
                    values={{}}
                    resolved={false}
                    editableIds={[]}
                    stageNumber={Number.isFinite(activeEvent.structureMeta?.stageIndex) ? activeEvent.structureMeta.stageIndex + 1 : null}
                  />
                )}
                {previewFamily === 'measurement' && activeEvent.participantStructure !== PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && activeEvent.participantStructure !== PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE && activeEvent.ruleConfig?.outputMode === 'full_ranking' && (
                  <RankingMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    participants={previewParticipantOptions}
                    ranking={null}
                    resolved={false}
                  />
                )}
                {previewFamily === 'measurement' && activeEvent.participantStructure !== PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && activeEvent.participantStructure !== PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE && activeEvent.ruleConfig?.outputMode !== 'full_ranking' && (
                  <MeasurementMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    participants={previewParticipantOptions}
                    values={{}}
                    winnerIds={[]}
                    resolved={false}
                    editableIds={[]}
                  />
                )}
                {previewFamily === 'objective' && (
                  <ObjectiveMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    participants={previewParticipantOptions}
                    completions={{}}
                    winnerIds={[]}
                    resolved={false}
                    editableIds={[]}
                  />
                )}
                {previewFamily === 'validation' && (
                  <InputValidationMomentView
                    className="max-w-[calc(100%-0.5rem)]"
                    question={activeEvent.question || 'Round in progress…'}
                    participants={previewParticipantOptions}
                    values={{}}
                    resolved={false}
                    isValid={null}
                    editableIds={[]}
                  />
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between px-3 pt-3 pb-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setView('participants')}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-300 hover:text-white px-2 py-1 rounded-full bg-white/10"
                data-testid="open-participants-manager"
              >
                <Users size={13} /> {participants.length} {participants.length === 1 ? 'entity' : 'entities'}
              </button>
              <button
                onClick={() => setView('teams')}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-300 hover:text-white px-2 py-1 rounded-full bg-white/10"
                data-testid="open-teams-manager"
              >
                <Users size={13} /> {teams.length} group{teams.length === 1 ? '' : 's'}
              </button>
            </div>
            <span className="text-[11.5px] text-zinc-400 font-mono tabular-nums">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
            <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition">
              {playing ? <Pause size={14} /> : <Play size={14} fill="white" />}
            </button>
          </div>

          <div className="px-4 pb-2 shrink-0">
            <div
              onPointerDown={onTrackPointerDown}
              className="relative h-2.5 mb-2.5 rounded-full bg-white/[0.14] touch-none select-none cursor-pointer"
              data-testid="universal-challenge-scrub-bar"
            >
              {duration > 0 && (
                <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow pointer-events-none" style={{ left: `calc(${(currentTime / duration) * 100}% - 7px)` }} />
              )}
            </div>

            {/* Rounds track — same drag/resize interaction pattern as the legacy
                editor's Challenge track, plus a chain-link connector drawn
                between an event and the source event it advances from. */}
            <div
              ref={trackRef}
              onPointerDown={onTrackPointerDown}
              className="relative h-16 rounded-xl overflow-hidden touch-none select-none bg-gradient-to-r from-rose-600/15 via-pink-500/15 to-rose-600/15 border border-rose-400/20"
            >
              <span className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-rose-300/60 pointer-events-none z-0">
                <Trophy size={10} /> Rounds
              </span>
              {duration > 0 && sortedEvents.map((ev, idx) => {
                const left = (ev.startTime / duration) * 100
                const width = ((ev.endTime - ev.startTime) / duration) * 100
                const isDragging = draggingId === ev.id
                const isSelectedBlock = selectedEventId === ev.id
                const meta = RULE_META[ev.rule]
                const structMeta = ev.participantStructure ? STRUCTURE_META[ev.participantStructure] : null
                const blockLabel = structMeta?.shortLabel || meta?.label || ev.rule
                const blockColor = structMeta?.color || meta?.color || 'bg-white/30'
                return (
                  <div
                    key={ev.id}
                    onPointerDown={(e) => onBlockPointerDown(e, ev, 'move')}
                    data-testid={`universal-challenge-block-${idx}`}
                    className={`absolute top-1 bottom-1 rounded-lg ${blockColor} bg-opacity-90 flex items-center px-1.5 cursor-grab active:cursor-grabbing overflow-hidden shadow-md ${
                      isDragging ? 'scale-[1.04] shadow-2xl z-20' : 'z-10 transition-all duration-150'
                    } ${isSelectedBlock ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0b]' : ''}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}
                  >
                    <span onPointerDown={(e) => onBlockPointerDown(e, ev, 'resize-start')} className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/40 rounded-l-lg" />
                    {(ev.autoAdvanceFrom || []).length > 0 && (
                      <Link2 size={10} className="shrink-0 mr-0.5 text-white/90" />
                    )}
                    <span className="text-[10px] font-bold text-white truncate px-1 pointer-events-none">{blockLabel}</span>
                    <span onPointerDown={(e) => onBlockPointerDown(e, ev, 'resize-end')} className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/40 rounded-r-lg" />
                  </div>
                )
              })}
              {duration > 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] bg-white pointer-events-none z-10" style={{ left: `${(currentTime / duration) * 100}%` }} />
              )}
            </div>

            {finishError && <p className="mt-2 text-[12px] text-rose-300">{finishError}</p>}
            <p className="mt-2 text-[11px] text-zinc-500 leading-snug">
              Drag a round to move it, use its edges to resize. A <Link2 size={9} className="inline -mt-0.5" /> icon marks a round that automatically advances the winner from an earlier round.
            </p>
          </div>

          <div className="px-4 pb-6 pt-2 shrink-0 border-t border-white/5">
            {selectedEventId ? (
              <div key="sel-actions" className="flex items-center justify-around animate-fadeIn">
                <ActionButton icon={<Pencil size={18} strokeWidth={2} />} label="Edit" onClick={editSelected} testId="edit-round-button" />
                <ActionButton icon={<Copy size={18} strokeWidth={2} />} label="Duplicate" onClick={duplicateSelected} testId="duplicate-round-button" />
                <ActionButton icon={<Trash2 size={18} strokeWidth={2} />} label="Delete" onClick={deleteSelected} danger testId="delete-round-button" />
                <ActionButton icon={<X size={18} strokeWidth={2} />} label="Done" onClick={() => setSelectedEventId(null)} testId="deselect-round-button" />
              </div>
            ) : (
              <div key="add-action" className="flex items-center justify-center animate-fadeIn">
                <ActionButton icon={<Plus size={18} strokeWidth={2} />} label="Add round" onClick={openRulePicker} accent disabled={!duration} testId="add-round-button" />
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'participants' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
          <p className="text-[12.5px] text-zinc-500">Add everyone — or everything — taking part in this Challenge: people, teams, objects, vehicles, or anything else. Pick a type, add a name and an optional photo.</p>

          <div className="space-y-2" data-testid="participants-list">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center text-[12px] font-bold">
                  {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : (p.label || '?')[0]?.toUpperCase()}
                </div>
                <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold text-white">{p.label}</span>
                {/* Entity System (Phase 1) — a small type badge, shown ONLY for
                    a non-PERSON entity, so a PERSON-only Challenge (every
                    Challenge authored before this phase, and every creator
                    who never touches the type picker) renders this list
                    exactly as before — no badge, no layout change. */}
                {p.type && p.type !== ENTITY_TYPES.PERSON && (
                  <span data-testid={`entity-type-badge-${p.id}`} className="shrink-0 px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-semibold text-zinc-300 uppercase tracking-wide">
                    {ENTITY_TYPE_LABELS[p.type] || p.type}
                  </span>
                )}
                <button onClick={() => removeParticipant(p.id)} aria-label={`Remove ${p.label}`} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-rose-500/40 active:scale-90 transition">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {participants.length === 0 && <p className="text-[12.5px] text-zinc-600 italic">No participants yet.</p>}
          </div>

          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 space-y-2.5">
            {/* Entity type picker (additive, Phase 1) — defaults to PERSON
                (`pType`'s initial state), so a creator adding people never
                needs to touch this row at all; it just sits there for
                anyone who wants a different kind of entity. */}
            <div className="flex flex-wrap gap-1.5" data-testid="entity-type-picker">
              {ENTITY_TYPE_ORDER.map((key) => (
                <Chip key={key} selected={pType === key} onClick={() => setPType(key)} testId={`entity-type-${key}`}>
                  {ENTITY_TYPE_LABELS[key]}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <label className="w-11 h-11 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center cursor-pointer border border-dashed border-white/20">
                {pAvatar ? <img src={pAvatar} alt="" className="w-full h-full object-cover" /> : <UserPlus size={16} className="text-zinc-400" />}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarFile(e.target.files?.[0])} data-testid="participant-avatar-input" />
              </label>
              <input
                type="text"
                value={pLabel}
                placeholder="Name"
                onChange={(e) => setPLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addParticipant() }}
                data-testid="participant-label-input"
                className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
              />
              <button onClick={addParticipant} disabled={!pLabel.trim()} data-testid="add-participant-button" className="px-4 py-2 rounded-xl bg-white text-black font-bold text-[13px] disabled:opacity-30 active:scale-95 transition">
                Add
              </button>
            </div>
          </div>

          {finishError && <p className="text-[12px] text-rose-300">{finishError}</p>}
        </div>
      )}

      {view === 'teams' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
          <p className="text-[12.5px] text-zinc-500">Group entities together — for Team vs Team rounds, or any other structure that pits groups of entities against each other.</p>

          <div className="space-y-3" data-testid="teams-list">
            {teams.map((t) => (
              <div key={t.id} className="rounded-xl bg-white/[0.06] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={t.label}
                    onChange={(e) => setTeams((list) => list.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)))}
                    data-testid={`team-label-input-${t.id}`}
                    className="flex-1 rounded-lg bg-white/10 border border-white/10 px-2.5 py-1.5 text-[13.5px] font-semibold text-white focus:outline-none focus:border-white/30"
                  />
                  <button onClick={() => removeTeam(t.id)} aria-label={`Remove ${t.label}`} data-testid={`remove-team-${t.id}`} className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-rose-500/40 active:scale-90 transition">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" data-testid={`team-${t.id}-members`}>
                  {participants.length === 0 && <p className="text-[11.5px] text-zinc-600 italic">Add participants first.</p>}
                  {participants.map((p) => (
                    <Chip key={p.id} selected={t.participantIds.includes(p.id)} onClick={() => toggleTeamMember(t.id, p.id)} testId={`team-${t.id}-member-${p.id}`}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
            {teams.length === 0 && <p className="text-[12.5px] text-zinc-600 italic">No teams yet.</p>}
          </div>

          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 flex items-center gap-2.5">
            <input
              type="text"
              value={tLabel}
              placeholder="Team name"
              onChange={(e) => setTLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTeam() }}
              data-testid="team-label-new-input"
              className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
            <button onClick={addTeam} disabled={!tLabel.trim()} data-testid="add-team-button" className="px-4 py-2 rounded-xl bg-white text-black font-bold text-[13px] disabled:opacity-30 active:scale-95 transition">
              Add
            </button>
          </div>

          {finishError && <p className="text-[12px] text-rose-300">{finishError}</p>}
        </div>
      )}

      {view === 'rule-picker' && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 animate-fadeIn">
          <p className="text-[12.5px] text-zinc-500 mb-1">Pick a structure</p>
          <p className="text-[11px] text-zinc-600 mb-3 leading-snug">A structure is a guided setup for how participants take part — it still resolves through one of the rules below, it just walks you through it.</p>
          <div className="space-y-1.5 mb-5" data-testid="structure-picker">
            {Object.values(PARTICIPANT_STRUCTURES).map((key) => {
              const meta = STRUCTURE_META[key]
              return (
                <button
                  key={key}
                  onClick={() => pickStructure(key)}
                  data-testid={`pick-structure-${key}`}
                  className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-2.5 text-left hover:bg-white/[0.1] active:scale-[0.99] transition"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${meta.color}`} />
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13.5px] font-semibold text-white truncate">{meta.label}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{meta.desc}</span>
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-zinc-500" />
                </button>
              )
            })}
          </div>

          <p className="text-[12.5px] text-zinc-500 mb-3">Or choose a rule directly</p>
          <div className="space-y-1.5">
            {RULE_ORDER.map((rule) => {
              const meta = RULE_META[rule]
              return (
                <button
                  key={rule}
                  onClick={() => pickRule(rule)}
                  data-testid={`pick-rule-${rule}`}
                  className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-2.5 text-left hover:bg-white/[0.1] active:scale-[0.99] transition"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${meta.color}`} />
                    <span className="flex flex-col min-w-0">
                      <span className="text-[13.5px] font-semibold text-white truncate">{meta.label}</span>
                      <span className="text-[11px] text-zinc-500 truncate">{meta.desc}</span>
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-zinc-500" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'tournament-builder' && tournamentDraft && (() => {
        const usedIds = new Set()
        for (const chainId of tournamentDraft.chainIds) {
          const ev = events.find((e) => e.id === chainId)
          for (const pid of ev?.participantIds || []) usedIds.add(pid)
        }
        const remaining = participants.filter((p) => !usedIds.has(p.id))
        const started = tournamentDraft.chainIds.length > 0
        const firstPickIds = tournamentDraft.firstPickIds || []

        return (
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
            <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
              <p className="text-white text-[13.5px] font-semibold flex items-center gap-1.5"><Trophy size={13} /> Sequential Tournament</p>
              <p className="text-zinc-500 text-[11px] leading-snug mt-1">Add participants one at a time — each new one faces whoever won the previous matchup. Winners auto-advance to the next match; nothing to chain manually.</p>
            </div>

            {started && (
              <div className="space-y-1.5" data-testid="tournament-chain-list">
                {tournamentDraft.chainIds.map((chainId, idx) => {
                  const ev = events.find((e) => e.id === chainId)
                  if (!ev) return null
                  return (
                    <div key={chainId} className="flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2.5">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-rose-500/30 text-rose-200 text-[11px] font-bold flex items-center justify-center">{idx + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-[13px] text-white">{ev.question}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {!started ? (
              <div className="space-y-3">
                <span className="text-[12px] text-zinc-400">Pick the first two participants</span>
                <div className="flex flex-wrap gap-2" data-testid="tournament-first-pick">
                  {participants.map((p) => (
                    <Chip
                      key={p.id}
                      selected={firstPickIds.includes(p.id)}
                      onClick={() => setTournamentDraft((d) => {
                        const picks = d.firstPickIds || []
                        if (picks.includes(p.id)) return { ...d, firstPickIds: picks.filter((x) => x !== p.id) }
                        if (picks.length >= 2) return d
                        return { ...d, firstPickIds: [...picks, p.id] }
                      })}
                      testId={`tournament-pick-${p.id}`}
                    >
                      {p.label}
                    </Chip>
                  ))}
                </div>
                <button
                  onClick={startFirstTournamentMatch}
                  disabled={firstPickIds.length !== 2}
                  data-testid="tournament-start-button"
                  className="w-full py-3 rounded-full bg-white text-black font-bold text-[14px] disabled:opacity-30 active:scale-[0.99] transition"
                >
                  Start tournament
                </button>
              </div>
            ) : remaining.length > 0 ? (
              <div className="space-y-2">
                <span className="text-[12px] text-zinc-400">Add the next opponent</span>
                <div className="flex flex-wrap gap-2" data-testid="tournament-next-pick">
                  {remaining.map((p) => (
                    <Chip key={p.id} selected={false} onClick={() => addNextTournamentMatch(p.id)} testId={`tournament-add-${p.id}`}>
                      <Plus size={11} className="inline -mt-0.5 mr-1" />{p.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-zinc-500 italic">Every participant has been added to this tournament.</p>
            )}

            <button
              onClick={() => { setView('timeline'); setTournamentDraft(null) }}
              disabled={!started}
              data-testid="tournament-finish-button"
              className="w-full py-3.5 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-white font-bold text-[15px] disabled:opacity-30 active:scale-[0.99] transition"
            >
              Finish
            </button>
          </div>
        )
      })()}

      {view === 'one-vs-all-builder' && oneVsAllDraft && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <p className="text-white text-[13.5px] font-semibold">One vs All</p>
            <p className="text-zinc-500 text-[11px] leading-snug mt-1">Pick one fixed participant, then add every opponent they&apos;ll face — each matchup is generated as its own independent round.</p>
          </div>

          <div>
            <span className="text-[12px] text-zinc-400">Who is the anchor?</span>
            <div className="mt-1.5 flex flex-wrap gap-2" data-testid="one-vs-all-anchor-picker">
              {participants.map((p) => (
                <Chip
                  key={p.id}
                  selected={oneVsAllDraft.anchorId === p.id}
                  onClick={() => setOneVsAllDraft((d) => ({ ...d, anchorId: p.id, opponentIds: d.opponentIds.filter((id) => id !== p.id) }))}
                  testId={`one-vs-all-anchor-${p.id}`}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          {oneVsAllDraft.anchorId && (
            <div>
              <span className="text-[12px] text-zinc-400">Opponents (pick one at a time, or several)</span>
              <div className="mt-1.5 flex flex-wrap gap-2" data-testid="one-vs-all-opponent-picker">
                {participants.filter((p) => p.id !== oneVsAllDraft.anchorId).map((p) => (
                  <Chip
                    key={p.id}
                    selected={oneVsAllDraft.opponentIds.includes(p.id)}
                    onClick={() => setOneVsAllDraft((d) => ({ ...d, opponentIds: d.opponentIds.includes(p.id) ? d.opponentIds.filter((id) => id !== p.id) : [...d.opponentIds, p.id] }))}
                    testId={`one-vs-all-opponent-${p.id}`}
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {structureAllowedRules(PARTICIPANT_STRUCTURES.ONE_VS_ALL).length > 1 && (
            <div>
              <span className="text-[12px] text-zinc-400">Which rule decides each matchup?</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {structureAllowedRules(PARTICIPANT_STRUCTURES.ONE_VS_ALL).map((r) => (
                  <Chip key={r} selected={oneVsAllDraft.rule === r} onClick={() => setOneVsAllDraft((d) => ({ ...d, rule: r }))} testId={`one-vs-all-rule-${r}`}>
                    {RULE_META[r]?.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-[12px] text-zinc-400">Total duration for all matchups (seconds)</span>
            <input
              type="number"
              min="1"
              value={oneVsAllDraft.totalDuration ?? ''}
              placeholder={`Auto (${oneVsAllDraft.opponentIds.length * 5 || 5}s)`}
              onChange={(e) => setOneVsAllDraft((d) => ({ ...d, totalDuration: Number(e.target.value) || null }))}
              data-testid="one-vs-all-duration-input"
              className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
          </label>

          <button
            onClick={generateOneVsAll}
            disabled={!oneVsAllDraft.anchorId || oneVsAllDraft.opponentIds.length === 0}
            data-testid="one-vs-all-generate-button"
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white font-bold text-[15px] disabled:opacity-30 active:scale-[0.99] transition"
          >
            Generate {oneVsAllDraft.opponentIds.length || ''} matchup{oneVsAllDraft.opponentIds.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {view === 'all-vs-all-builder' && allVsAllDraft && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <p className="text-white text-[13.5px] font-semibold">All vs All</p>
            <p className="text-zinc-500 text-[11px] leading-snug mt-1">Pick who&apos;s playing — every unique pair gets its own round-robin matchup, generated and placed on the timeline automatically.</p>
          </div>

          <div>
            <span className="text-[12px] text-zinc-400">Who&apos;s playing?</span>
            <div className="mt-1.5 flex flex-wrap gap-2" data-testid="all-vs-all-participant-picker">
              {participants.map((p) => (
                <Chip
                  key={p.id}
                  selected={allVsAllDraft.participantIds.includes(p.id)}
                  onClick={() => setAllVsAllDraft((d) => ({ ...d, participantIds: d.participantIds.includes(p.id) ? d.participantIds.filter((id) => id !== p.id) : [...d.participantIds, p.id] }))}
                  testId={`all-vs-all-participant-${p.id}`}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          {allVsAllDraft.participantIds.length >= 2 && (
            <p className="text-[11.5px] text-zinc-500">{allVsAllDraft.participantIds.length} participants → {(allVsAllDraft.participantIds.length * (allVsAllDraft.participantIds.length - 1)) / 2} matchups</p>
          )}

          {structureAllowedRules(PARTICIPANT_STRUCTURES.ALL_VS_ALL).length > 1 && (
            <div>
              <span className="text-[12px] text-zinc-400">Which rule decides each matchup?</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {structureAllowedRules(PARTICIPANT_STRUCTURES.ALL_VS_ALL).map((r) => (
                  <Chip key={r} selected={allVsAllDraft.rule === r} onClick={() => setAllVsAllDraft((d) => ({ ...d, rule: r }))} testId={`all-vs-all-rule-${r}`}>
                    {RULE_META[r]?.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-[12px] text-zinc-400">Total duration for all matchups (seconds)</span>
            <input
              type="number"
              min="1"
              value={allVsAllDraft.totalDuration ?? ''}
              placeholder="Auto (5s per matchup)"
              onChange={(e) => setAllVsAllDraft((d) => ({ ...d, totalDuration: Number(e.target.value) || null }))}
              data-testid="all-vs-all-duration-input"
              className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
          </label>

          <button
            onClick={generateAllVsAll}
            disabled={allVsAllDraft.participantIds.length < 2}
            data-testid="all-vs-all-generate-button"
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-[15px] disabled:opacity-30 active:scale-[0.99] transition"
          >
            Generate round robin
          </button>
        </div>
      )}

      {view === 'progressive-builder' && progressiveDraft && (
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
            <p className="text-white text-[13.5px] font-semibold">Progressive Challenge</p>
            <p className="text-zinc-500 text-[11px] leading-snug mt-1">Define increasingly harder stages (e.g. 2.5kg → 10kg → 20kg…). Everyone still active attempts each stage; you mark pass/fail per stage. Furthest stage reached wins — ties allowed.</p>
          </div>

          <div>
            <span className="text-[12px] text-zinc-400">Who&apos;s taking part?</span>
            <div className="mt-1.5 flex flex-wrap gap-2" data-testid="progressive-participant-picker">
              {participants.map((p) => (
                <Chip
                  key={p.id}
                  selected={progressiveDraft.participantIds.includes(p.id)}
                  onClick={() => setProgressiveDraft((d) => ({ ...d, participantIds: d.participantIds.includes(p.id) ? d.participantIds.filter((id) => id !== p.id) : [...d.participantIds, p.id] }))}
                  testId={`progressive-participant-${p.id}`}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[12px] text-zinc-400">Stages, in order (e.g. weights, distances…)</span>
            <div className="space-y-1.5" data-testid="progressive-stage-list">
              {progressiveDraft.stageLabels.map((label, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-teal-500/30 text-teal-200 text-[11px] font-bold flex items-center justify-center">{idx + 1}</span>
                  <input
                    type="text"
                    value={label}
                    placeholder={`Stage ${idx + 1} (e.g. "10kg")`}
                    onChange={(e) => setProgressiveDraft((d) => ({ ...d, stageLabels: d.stageLabels.map((l, i) => (i === idx ? e.target.value : l)) }))}
                    data-testid={`progressive-stage-input-${idx}`}
                    className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                  {progressiveDraft.stageLabels.length > 2 && (
                    <button
                      onClick={() => setProgressiveDraft((d) => ({ ...d, stageLabels: d.stageLabels.filter((_, i) => i !== idx) }))}
                      aria-label="Remove stage"
                      data-testid={`progressive-stage-remove-${idx}`}
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-rose-500/40 active:scale-90 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setProgressiveDraft((d) => ({ ...d, stageLabels: [...d.stageLabels, ''] }))}
              data-testid="progressive-stage-add"
              className="flex items-center gap-1.5 text-[12px] font-semibold text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-full bg-white/10"
            >
              <Plus size={12} /> Add stage
            </button>
          </div>

          <label className="block">
            <span className="text-[12px] text-zinc-400">Total duration for all stages (seconds)</span>
            <input
              type="number"
              min="1"
              value={progressiveDraft.totalDuration ?? ''}
              placeholder="Auto (5s per stage)"
              onChange={(e) => setProgressiveDraft((d) => ({ ...d, totalDuration: Number(e.target.value) || null }))}
              data-testid="progressive-duration-input"
              className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
          </label>

          <button
            onClick={generateProgressive}
            disabled={progressiveDraft.participantIds.length === 0 || progressiveDraft.stageLabels.filter((l) => l.trim()).length < 2}
            data-testid="progressive-generate-button"
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-bold text-[15px] disabled:opacity-30 active:scale-[0.99] transition"
          >
            Generate stages
          </button>
        </div>
      )}

      {view === 'event-editor' && eventDraft && (() => {
        const d = eventDraft
        const meta = RULE_META[d.rule]
        const structMeta = d.participantStructure ? STRUCTURE_META[d.participantStructure] : null
        const optionSource = structureOptionSource(d.participantStructure)
        const isCustomOptionStructure = optionSource === 'custom'
        const isParticipantShaped = d.interaction !== 'vote' && d.interaction !== 'predict'
        const isVoteShaped = !isParticipantShaped
        const chained = d.autoAdvanceFrom.length > 0
        const isTeamStructure = d.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM
        // Team vs Team's two teams are the predictable options (PREDICTION
        // rule, `ruleConfig.outcomeMode: 'reveal'` — a viewer's vote is a
        // guess, never the determinant of the winner; see
        // universalChallengeStore.js createUniversalChallenge). No
        // tie-break UI is shown for it (see `usesTieBreak` below) since a
        // required, creator-confirmed `correctOptionId` always resolves to
        // exactly one team — there is nothing left to break a tie between.
        const allowedRules = structureAllowedRules(d.participantStructure)
        return (
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/10 text-white">
                <span className={`w-1.5 h-1.5 rounded-full ${structMeta?.color || meta.color}`} />{structMeta?.label || meta.label}
              </span>
              <span className="text-[11.5px] text-zinc-500 font-mono">{fmtTime(d.startTime)}–{fmtTime(d.endTime)}</span>
            </div>

            {/* Chaining — connect this round to a previous one. Not offered for
                the custom-option structures: those events resolve purely off
                event.options, with no participants (and so no "winner") to
                carry forward. */}
            {!isCustomOptionStructure && !isTeamStructure && eligibleChainSources.length > 0 && (
              <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 space-y-2.5" data-testid="chain-config">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-[13.5px] font-semibold flex items-center gap-1.5"><Link2 size={13} /> Advance winner from a previous round</p>
                    <p className="text-zinc-500 text-[11px] leading-tight">The winner of that round joins automatically — you only pick who else is new.</p>
                  </div>
                  <Toggle
                    checked={chained}
                    // Default to the MOST RECENT eligible round (last in
                    // ascending-by-startTime order) — the natural "continue
                    // the bracket from right before this" choice; the
                    // dropdown below still lets the creator pick any earlier
                    // round explicitly.
                    onChange={(v) => setChain(v ? eligibleChainSources[eligibleChainSources.length - 1].id : null)}
                    label="Chain from a previous round"
                    testId="chain-toggle"
                  />
                </div>
                {chained && (
                  <select
                    value={d.autoAdvanceFrom[0] || ''}
                    onChange={(e) => setChain(e.target.value)}
                    data-testid="chain-source-select"
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-white/30"
                  >
                    {eligibleChainSources.map((src) => {
                      const idx = eventIndex(src.id)
                      return <option key={src.id} value={src.id} className="bg-zinc-900">{`Round ${idx + 1} — ${RULE_META[src.rule]?.label} (${fmtTime(src.startTime)}–${fmtTime(src.endTime)})`}</option>
                    })}
                  </select>
                )}
              </div>
            )}

            {/* Participants for this round — hidden for the custom-option
                structures (Guess the Action / Two-Side Choice / Majority
                Choice): those events vote on an OPTION, not a participant,
                and are deliberately authored with no participants engaged.
                Also hidden for TEAM_VS_TEAM (additive, Phase 2): the two
                Team pickers below replace individual participant picking
                entirely — participantIds are derived from the teams'
                rosters, never hand-picked here. */}
            {!isCustomOptionStructure && !isTeamStructure && (
              <div>
                <span className="text-[12px] text-zinc-400">{chained ? 'New participant(s) joining this round' : (d.participantStructure === PARTICIPANT_STRUCTURES.GUESS_THE_ACTOR ? 'Who might be the actor? (participants viewers vote for)' : 'Participants in this round')}</span>
                <div className="mt-1.5 flex flex-wrap gap-2" data-testid="event-participant-picker">
                  {participants.length === 0 && <p className="text-[12px] text-zinc-600 italic">Add participants first (Participants button on the timeline).</p>}
                  {participants.map((p) => (
                    <Chip key={p.id} selected={d.participantIds.includes(p.id)} onClick={() => toggleDraftParticipant(p.id)} testId={`event-participant-${p.id}`}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Teams for this round (TEAM_VS_TEAM). Team vs Team is ALWAYS
                community-vote-only (the customer's final decision) — the
                two teams themselves are the votable options, tallied via
                the ordinary PREDICTION rule (see
                lib/universalChallengeParticipantStructures.js
                computeTeamVoteStandings). There is no "aggregated
                measurement" path for this structure at all. */}
            {isTeamStructure && (
              <div className="space-y-2.5" data-testid="team-vs-team-picker">
                <span className="text-[12px] text-zinc-400">Which two teams?</span>
                {teams.length < 2 ? (
                  <p className="text-[12px] text-zinc-600 italic">Create at least two teams first (Teams button on the timeline).</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={d.teamIds?.[0] || ''}
                      onChange={(e) => setEventDraft((s) => ({ ...s, teamIds: [e.target.value, s.teamIds?.[1] || ''] }))}
                      data-testid="team-a-select"
                      className="rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="" className="bg-zinc-900">Team A…</option>
                      {teams.map((t) => <option key={t.id} value={t.id} className="bg-zinc-900">{t.label}</option>)}
                    </select>
                    <select
                      value={d.teamIds?.[1] || ''}
                      onChange={(e) => setEventDraft((s) => ({ ...s, teamIds: [s.teamIds?.[0] || '', e.target.value] }))}
                      data-testid="team-b-select"
                      className="rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="" className="bg-zinc-900">Team B…</option>
                      {teams.filter((t) => t.id !== d.teamIds?.[0]).map((t) => <option key={t.id} value={t.id} className="bg-zinc-900">{t.label}</option>)}
                    </select>
                  </div>
                )}
                {/* There is no UI control left to pick a measurement rule
                    for this structure: `rule` stays RULES.PREDICTION for
                    the lifetime of this draft, and the server
                    independently re-derives/forces `options` +
                    `ruleConfig.outcomeMode: 'reveal'` from the two teams
                    regardless of what's sent (see universalChallengeStore.js
                    createUniversalChallenge) — so this can never regress
                    into a live-vote-decides-the-winner round even via a
                    direct API call. */}
                <p className="text-[11.5px] text-zinc-500 leading-snug">Viewers predict which team they think will win during playback — their vote is just a guess, never what decides the outcome. You confirm the real winner below (from what actually happened in the video); it&apos;s revealed to everyone at the end, and each viewer then sees whether their own prediction was right.</p>
                {d.teamIds?.[0] && d.teamIds?.[1] && d.teamIds[0] !== d.teamIds[1] && (
                  <label className="block" data-testid="team-vs-team-winner-picker">
                    <span className="text-[12px] text-zinc-400">Which team actually won? <span className="text-zinc-600">(You&apos;ll confirm this — viewers only see it revealed at the end)</span></span>
                    <select
                      value={d.ruleConfig.correctOptionId || ''}
                      onChange={(e) => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, correctOptionId: e.target.value || null } }))}
                      data-testid="team-vs-team-winner-select"
                      className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-white/30"
                    >
                      <option value="" className="bg-zinc-900">Select the real winning team…</option>
                      {[d.teamIds[0], d.teamIds[1]].map((tid) => {
                        const t = teamsById.get(tid)
                        return t ? <option key={tid} value={tid} className="bg-zinc-900">{t.label}</option> : null
                      })}
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* Which underlying rule — shown only for OTHER structures that
                allow a creator choice among more than one existing rule
                (ONE_VS_ALL / ALL_VS_ALL / ORDER_RANKING, see
                lib/universalChallengeParticipantStructures.js
                structureAllowedRules). TEAM_VS_TEAM is excluded here too —
                it is locked to exactly one rule (PREDICTION) with no
                creator choice at all. Never a new rule — purely which of
                the 10 existing ones evaluates this round. */}
            {!isTeamStructure && allowedRules.length > 1 && (
              <div>
                <span className="text-[12px] text-zinc-400">Which rule should decide this round?</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {allowedRules.map((r) => (
                    <Chip
                      key={r}
                      selected={d.rule === r}
                      onClick={() => setEventDraft((s) => ({
                        ...s,
                        rule: r,
                        ruleConfig: { ...s.ruleConfig, ...defaultRuleConfig(r), ...(s.participantStructure === PARTICIPANT_STRUCTURES.ORDER_RANKING ? structureDefaultRuleConfig(s.participantStructure) : {}) },
                      }))}
                      testId={`structure-rule-${r}`}
                    >
                      {RULE_META[r]?.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <label className="block">
              <span className="text-[12px] text-zinc-400">Question / round label</span>
              <input
                type="text"
                value={d.question}
                placeholder="What do viewers see for this round?"
                onChange={(e) => setEventDraft((s) => ({ ...s, question: e.target.value }))}
                data-testid="event-question-input"
                className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
              />
            </label>

            {/* Options — GUESS_THE_ACTION / TWO_SIDE_CHOICE / MAJORITY_CHOICE
                only: free-text options the creator defines, unrelated to the
                participant roster (Guess the Actor instead reuses the
                participant picker above, unrelated to this section). */}
            {isCustomOptionStructure && (
              <div data-testid="structure-options-editor">
                <span className="text-[12px] text-zinc-400">
                  {d.participantStructure === PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE ? 'The two choices' : 'Options viewers can pick from'}
                </span>
                <div className="mt-1.5 space-y-2">
                  {(d.options || []).map((opt, idx) => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.label}
                        placeholder={`Option ${idx + 1}`}
                        onChange={(e) => setEventDraft((s) => ({ ...s, options: s.options.map((o) => (o.id === opt.id ? { ...o, label: e.target.value } : o)) }))}
                        data-testid={`structure-option-input-${idx}`}
                        className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                      />
                      {d.participantStructure !== PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE && (d.options || []).length > 2 && (
                        <button
                          onClick={() => setEventDraft((s) => ({ ...s, options: s.options.filter((o) => o.id !== opt.id) }))}
                          aria-label="Remove option"
                          data-testid={`structure-option-remove-${idx}`}
                          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center bg-white/10 hover:bg-rose-500/40 active:scale-90 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {d.participantStructure !== PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE && (
                  <button
                    onClick={() => setEventDraft((s) => ({ ...s, options: [...s.options, { id: genLocalId('opt'), label: '' }] }))}
                    data-testid="structure-option-add"
                    className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-full bg-white/10"
                  >
                    <Plus size={12} /> Add option
                  </button>
                )}
              </div>
            )}

            {d.participantStructure === PARTICIPANT_STRUCTURES.MAJORITY_CHOICE && (
              <label className="block">
                <span className="text-[12px] text-zinc-400">Reveal a correct answer later? (optional)</span>
                <select
                  value={d.ruleConfig.correctOptionId || ''}
                  onChange={(e) => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, correctOptionId: e.target.value || null } }))}
                  data-testid="majority-choice-correct-select"
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-white/30"
                >
                  <option value="" className="bg-zinc-900">No reveal — pure majority vote</option>
                  {(d.options || []).filter((o) => o.label.trim()).map((o) => <option key={o.id} value={o.id} className="bg-zinc-900">{o.label}</option>)}
                </select>
              </label>
            )}

            {/* Outcome source */}
            <div>
              <span className="text-[12px] text-zinc-400">How is the outcome decided?</span>
              <div className="mt-1.5 space-y-1.5">
                {outcomeOptions(d.rule).map((opt) => {
                  const isSel = d.interaction === opt.interaction && d.measurementSource === opt.measurementSource
                  return (
                    <button
                      key={`${opt.interaction}_${opt.measurementSource}`}
                      onClick={() => setOutcome(opt)}
                      data-testid={`event-outcome-${opt.interaction}-${opt.measurementSource}`}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${isSel ? 'bg-white/15 border-white/40' : 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]'}`}
                    >
                      <p className="text-[13px] font-semibold text-white">{opt.label}</p>
                      <p className="text-[11px] text-zinc-500">{opt.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {d.rule === RULES.INPUT_VALIDATION && (
              <label className="block">
                <span className="text-[12px] text-zinc-400">Valid combined answers (comma-separated)</span>
                <input
                  type="text"
                  value={(d.ruleConfig.validValues || []).join(', ')}
                  placeholder="e.g. TWYKK, TWYK"
                  onChange={(e) => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, validValues: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) } }))}
                  data-testid="event-valid-values-input"
                  className="mt-1 w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[14px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                />
              </label>
            )}

            {d.rule === RULES.FIRST_TO_OBJECTIVE && (
              <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-white text-[13px] font-semibold leading-tight">Eliminate anyone who doesn&apos;t finish</p>
                </div>
                <Toggle checked={!!d.ruleConfig.eliminateNonFinishers} onChange={(v) => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, eliminateNonFinishers: v } }))} label="Eliminate non-finishers" testId="eliminate-nonfinishers-toggle" />
              </div>
            )}

            {/* Tie-break — NOT shown for Team vs Team: that structure is
                forced to 'reveal' (a creator-confirmed real winner, never a
                vote tally), which never calls resolveTie — so there is
                nothing to break a tie between. Every other PREDICTION
                event (Guess the Actor/Action, Two-Side/Majority Choice)
                also keeps its default 'reveal' outcome mode and so never
                shows this either — `usesTieBreak` never includes
                RULES.PREDICTION, unchanged. */}
            {usesTieBreak(d.rule) && (
              <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 space-y-2">
                <span className="text-[12px] text-zinc-400">If it&apos;s a tie</span>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(TIE_BREAK_LABELS).map((k) => (
                    <Chip key={k} selected={d.ruleConfig.tieBreak === k} onClick={() => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, tieBreak: k } }))} testId={`tie-break-${k}`}>
                      {TIE_BREAK_LABELS[k]}
                    </Chip>
                  ))}
                </div>
                {d.ruleConfig.tieBreak === 'creator_defined' && (
                  <select
                    value={d.ruleConfig.tieBreakWinnerId || ''}
                    onChange={(e) => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, tieBreakWinnerId: e.target.value || null } }))}
                    data-testid="tie-break-winner-select"
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] text-white focus:outline-none focus:border-white/30"
                  >
                    <option value="" className="bg-zinc-900">Choose a fallback winner…</option>
                    {d.participantIds.map((pid) => <option key={pid} value={pid} className="bg-zinc-900">{participantsById.get(pid)?.label || pid}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Missing submission (participant-shaped rounds) */}
            {isParticipantShaped && (
              <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 space-y-2">
                <span className="text-[12px] text-zinc-400">If a participant doesn&apos;t submit in time</span>
                <div className="flex flex-col gap-1.5">
                  {MISSING_SUBMISSION_ORDER.map((k) => (
                    <button
                      key={k}
                      onClick={() => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, missingSubmissionBehavior: k } }))}
                      data-testid={`missing-submission-${k}`}
                      className={`text-left rounded-lg border px-2.5 py-2 text-[12.5px] transition ${d.ruleConfig.missingSubmissionBehavior === k ? 'bg-white/15 border-white/40 text-white' : 'bg-white/[0.03] border-white/10 text-zinc-300 hover:bg-white/[0.07]'}`}
                    >
                      {MISSING_SUBMISSION_LABELS[k]}
                    </button>
                  ))}
                </div>
                {d.ruleConfig.missingSubmissionBehavior === 'default_value' && (
                  <input
                    type="text"
                    value={d.ruleConfig.defaultValue}
                    placeholder="Default value to use"
                    onChange={(e) => setEventDraft((s) => ({ ...s, ruleConfig: { ...s.ruleConfig, defaultValue: e.target.value } }))}
                    data-testid="default-value-input"
                    className="w-full rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-[13.5px] placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
                  />
                )}
              </div>
            )}

            {isVoteShaped && !isTeamStructure && (
              <div className="flex items-start gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                <Info size={13} className="text-zinc-500 shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-zinc-500 leading-snug">If time runs out with too few votes, this round resolves with whatever votes exist — it never waits indefinitely.</p>
              </div>
            )}

            {/* Team vs Team has NO deadline at all (customer's explicit
                requirement) — a prediction is accepted at any point while
                the challenge is available, regardless of video playback
                position/looping, even after this round has already been
                revealed (see universalChallengeStore.js
                castUniversalChallengeInput). */}
            {isTeamStructure && (
              <div className="flex items-start gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                <Info size={13} className="text-zinc-500 shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-zinc-500 leading-snug">Predictions have no deadline — viewers can guess at any point while this challenge is available, even after the reveal.</p>
              </div>
            )}

            {eventDraftError && <p className="text-[12.5px] text-rose-300">{eventDraftError}</p>}

            <div className="flex items-center gap-2">
              {d.id && (
                <button onClick={deleteEventDraft} aria-label="Delete round" className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center bg-rose-500/20 border border-rose-500/40 text-rose-300 active:scale-90 transition">
                  <Trash2 size={17} />
                </button>
              )}
              <button onClick={saveEventDraft} data-testid="save-event-button" className="flex-1 py-3.5 rounded-full bg-white text-black font-bold text-[15px] active:scale-[0.99] transition">
                Save round
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
