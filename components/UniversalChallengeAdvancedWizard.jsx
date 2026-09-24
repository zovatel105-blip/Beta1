'use client'

import { Children, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ArrowRight, Check, ChevronDown, ChevronRight, Flag, HelpCircle, Info, Play, Pause, Plus, Scale, ShieldAlert,
  Swords, Trash2, TrendingDown, Trophy, UserMinus, Users, X, Zap, CheckSquare, Minus, Undo2, Redo2, Scissors, Hash, ListChecks, Clock3, UserRound, UsersRound, LockKeyhole,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { ChallengeEditorTimeline } from './ChallengeEditorTimeline'
import styles from './ChallengeEditor.module.css'
import {
  AdvancedRuleConfigFields, explainRule, advancedDefaultRuleConfig, Toggle, Chip,
} from './UniversalChallengeEditor'
import { RULES } from '@/lib/challengeRuleEngine'
import { RULE_META, RULE_ORDER } from '@/lib/universalChallengeRuleMeta'
import { sortEventsByStart } from '@/lib/universalChallengeTimeline'
import { PARTICIPANT_STRUCTURES } from '@/lib/universalChallengeParticipantStructures'

/**
 * UniversalChallengeAdvancedWizard — the ONLY authoring surface for the
 * Universal Challenge Engine going forward (per explicit request: hide
 * Simple Mode entirely, keep Advanced only, restyle it as a single
 * TikTok-style screen with the editing tools in a bottom drawer instead of
 * routed full pages).
 *
 * WHAT THIS FILE IS / ISN'T:
 *  - It is a brand-new PRESENTATION layer over the exact same Universal
 *    Challenge Engine primitives (entities/groups/events/ruleConfig) that
 *    `UniversalChallengeEditor.jsx`'s Advanced Mode already collected —
 *    the field-level authoring logic (`AdvancedRuleConfigFields`,
 *    `explainRule`, `advancedDefaultRuleConfig`) is IMPORTED and reused
 *    verbatim from that file (now exported for this purpose), not
 *    duplicated. Zero new engine/mechanic code.
 *  - `UniversalChallengeEditor.jsx` itself is left completely untouched on
 *    disk (per explicit instruction to keep old code without deleting it)
 *    — `UploadDialog.jsx` simply no longer imports/renders it, so it is
 *    fully unreachable from the app without being removed.
 *  - "Rules & Result" is a Challenge-LEVEL summary config
 *    (`resultConfig` — see lib/universalChallengeStore.js), reusing the
 *    already-existing `computeAllVsAllStandings`/`resolveTie` — it does
 *    NOT introduce a second competition engine.
 *
 * SAME PROPS CONTRACT as the old `UniversalChallengeEditor` (`open`,
 * `onClose`, `videoFile`, `draft`, `onSave`) so `UploadDialog.jsx`'s
 * attach-after-upload flow (which reads `draft.entities/groups/events/
 * resultConfig`) needed only a one-line swap.
 */

const fmtTime = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0))
  const m = Math.floor(n / 60)
  const sec = n % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
const round1 = (v) => Math.round(v * 10) / 10
const genLocalId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

// Same 4 rules lib/universalChallengeStore.js's `SCORING_RULES` auto-tags
// ALL_VS_ALL when the creator turns on "Highest score wins" below — kept
// as a literal, separate copy (not imported) since it's purely a UI hint
// ("does this Moment count toward the final score?"); the SERVER'S copy
// (lib/universalChallengeStore.js) is the one that actually enforces it.
const SCORING_RULES = new Set([RULES.SEQUENTIAL_MATCHUP, RULES.COMPARISON, RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE])

const RULE_ICON = {
  [RULES.HIGHEST_SCORE]: Trophy,
  [RULES.LOWEST_SCORE]: TrendingDown,
  [RULES.FASTEST]: Zap,
  [RULES.FIRST_TO_OBJECTIVE]: Flag,
  [RULES.ELIMINATION]: UserMinus,
  [RULES.SEQUENTIAL_MATCHUP]: Swords,
  [RULES.PREDICTION]: HelpCircle,
  [RULES.INPUT_VALIDATION]: CheckSquare,
  [RULES.SURVIVAL]: ShieldAlert,
  [RULES.COMPARISON]: Scale,
}

const RESULT_TYPE_LABELS = { winner_only: 'Winner only', full_ranking: 'Full ranking (1st, 2nd, 3rd\u2026)' }
const CHALLENGE_TIE_BREAK_LABELS = { random: 'Pick randomly', creator_defined: "I'll choose the winner", additional_round: 'Needs an additional Moment to decide' }
const AVATAR_COLORS = ['bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500']

function avatarColor(id) {
  let h = 0
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function Avatar({ id, name, size = 34 }) {
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  return (
    <span
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${avatarColor(id)}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
    >
      {initial}
    </span>
  )
}

const emptyDraft = (draft) => ({ entities: draft?.entities || [], groups: draft?.groups || [], events: draft?.events || [], resultConfig: draft?.resultConfig || { ruleType: null, resultType: 'winner_only', tieBreak: 'random', tieBreakWinnerId: null } })
const draftReducer = (state, action) => {
  if (action.type === 'reset') return { past: [], present: emptyDraft(action.draft), future: [] }
  if (action.type === 'undo') return state.past.length ? { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] } : state
  if (action.type === 'redo') return state.future.length ? { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) } : state
  const value = typeof action.value === 'function' ? action.value(state.present[action.key]) : action.value
  const present = { ...state.present, [action.key]: value }
  if (JSON.stringify(present) === JSON.stringify(state.present)) return state
  return { past: [...state.past.slice(-79), state.present], present, future: [] }
}

// Existing selects use the same onChange contract while rendering accessible Shadcn menus.
const EditorSelect = ({ children, value, onChange, className, ...props }) => (
  <Select value={value || '__empty'} onValueChange={(v) => onChange({ target: { value: v === '__empty' ? '' : v } })}>
    <SelectTrigger className={className} {...props}><SelectValue /></SelectTrigger>
    <SelectContent className="z-[90] bg-neutral-900 text-white border-white/20">
      {Children.toArray(children).map((child) => <SelectItem key={child.props.value || '__empty'} value={child.props.value || '__empty'} data-testid={`${props['data-testid']}-${child.props.value || 'empty'}`}>{child.props.children}</SelectItem>)}
    </SelectContent>
  </Select>
)

function SectionLabel({ children }) {
  return <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-2 mt-1">{children}</p>
}

export default function UniversalChallengeAdvancedWizard({ open, onClose, videoFile, draft, onSave }) {
  // -------------------------------------------------------------------
  // Video preview — same pattern as the old editor (object URL from the
  // in-progress upload's local file, playsInline/muted preview).
  // -------------------------------------------------------------------
  const videoRef = useRef(null)
  const editorRef = useRef(null)
  const modalHeadingRef = useRef(null)
  const modalTriggerRef = useRef(null)
  const [objectUrl, setObjectUrl] = useState(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    if (!videoFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(videoFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [videoFile])

  const togglePlay = async () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.ended) v.currentTime = 0
      try { await v.play() } catch { setError('Could not play this video. Try again.'); }
    } else v.pause()
  }
  const seek = (time) => {
    const value = Math.max(0, Math.min(duration, time))
    if (videoRef.current) videoRef.current.currentTime = value
    setCurrentTime(value)
  }

  // One history owns all authored data; playback/tool navigation are not edits.
  const [history, dispatch] = useReducer(draftReducer, draft, (initial) => ({ past: [], present: emptyDraft(initial), future: [] }))
  const { entities, groups, events, resultConfig } = history.present
  const setEntities = (value) => dispatch({ key: 'entities', value })
  const setGroups = (value) => dispatch({ key: 'groups', value })
  const setEvents = (value) => dispatch({ key: 'events', value })
  const setResultConfig = (value) => dispatch({ key: 'resultConfig', value })
  const [participantsMode, setParticipantsMode] = useState('individual')
  const [step, setStep] = useState('menu') // A tool panel, never a routed screen.
  const [activeEventId, setActiveEventId] = useState(null)
  const [error, setError] = useState('')
  const previousFile = useRef(null)
  const previousDraft = useRef(null)

  useEffect(() => {
    if (open) {
      setStep('menu'); setError('')
      if (previousFile.current !== videoFile || previousDraft.current !== draft) {
        dispatch({ type: 'reset', draft })
        setParticipantsMode(draft?.groups?.length >= 2 ? (draft.groups.length === 2 ? 'team' : 'group') : 'individual')
        previousFile.current = videoFile
        previousDraft.current = draft
      }
    } else {
      videoRef.current?.pause()
      setPlaying(false)
    }
  }, [open, videoFile, draft])

  const previousStep = useRef('menu')
  useEffect(() => {
    if (step !== 'menu' && previousStep.current === 'menu') modalTriggerRef.current = document.activeElement
    previousStep.current = step
  }, [step])

  const activeEvent = useMemo(() => events.find((e) => e.id === activeEventId) || null, [events, activeEventId])
  const sortedEvents = useMemo(() => sortEventsByStart(events), [events])

  // -------------------------------------------------------------------
  // Entity handlers — byte-identical to addAdvEntity/updateAdvEntity/
  // removeAdvEntity in UniversalChallengeEditor.jsx.
  // -------------------------------------------------------------------
  const addEntity = (name = '') => setEntities((list) => [...list, { id: genLocalId('entity'), type: 'PERSON', name, displayName: name, avatarUrl: null, groupId: null, metadata: {}, initialState: 'ACTIVE' }])
  const updateEntity = (id, patch) => setEntities((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const removeEntity = (id) => {
    setEntities((list) => list.filter((e) => e.id !== id))
    setGroups((list) => list.map((g) => ({ ...g, entityIds: g.entityIds.filter((eid) => eid !== id) })))
    setEvents((list) => list.map((e) => ({ ...e, participantIds: e.participantIds.filter((eid) => eid !== id) })))
  }

  const addGroup = () => setGroups((list) => [...list, { id: genLocalId('group'), label: `Team ${list.length + 1}`, entityIds: [] }])
  const removeGroup = (id) => {
    setGroups((list) => list.filter((g) => g.id !== id))
    setEvents((list) => list.map((e) => ((e.teamIds || []).includes(id) ? { ...e, teamIds: [], teamCorrectOptionId: null } : e)))
  }
  const updateGroup = (id, patch) => setGroups((list) => list.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  const toggleGroupEntity = (groupId, entityId) => setGroups((list) => list.map((g) => (g.id === groupId
    ? { ...g, entityIds: g.entityIds.includes(entityId) ? g.entityIds.filter((id) => id !== entityId) : [...g.entityIds, entityId] }
    : g)))

  const setParticipantsType = (mode) => {
    setParticipantsMode(mode)
    if (mode === 'individual') { setGroups([]); return }
    if (mode === 'team' && groups.length !== 2) { setGroups([{ id: genLocalId('group'), label: 'Team A', entityIds: [] }, { id: genLocalId('group'), label: 'Team B', entityIds: [] }]) }
    if (mode === 'group' && groups.length < 2) { setGroups([{ id: genLocalId('group'), label: 'Group A', entityIds: [] }, { id: genLocalId('group'), label: 'Group B', entityIds: [] }]) }
  }

  // -------------------------------------------------------------------
  // Event (Moment) handlers — byte-identical to addAdvEvent/updateAdvEvent/
  // removeAdvEvent/toggleAdvEventParticipant/addAdvEventOption/etc.
  // -------------------------------------------------------------------
  const addEvent = (numeric = false) => {
    const limit = duration || 60
    const start = Math.max(0, Math.min(round1(currentTime), limit - 0.1))
    const rule = RULES.PREDICTION
    const id = genLocalId('event')
    setEvents((list) => [...list, {
      id, startTime: round1(start), endTime: round1(Math.min(limit, start + 8)), rule, interaction: 'predict', measurementSource: 'creator_input',
      participantIds: [], question: '', ruleConfig: { ...advancedDefaultRuleConfig(rule), ...(numeric ? { predictionType: 'numeric' } : {}) },
      autoAdvanceFrom: [], options: [], teamIds: [], teamCorrectOptionId: null, votingWindowStart: '', votingWindowEnd: '',
    }])
    setActiveEventId(id)
    setStep('moment-editor')
  }
  const updateEvent = (id, patch) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const removeEvent = (id) => {
    setEvents((list) => list.filter((e) => e.id !== id).map((e) => ((e.autoAdvanceFrom || []).includes(id) ? { ...e, autoAdvanceFrom: [] } : e)))
    setStep('moments')
  }
  const setEventRule = (id, rule) => {
    const family = RULE_META[rule]?.family
    const interaction = rule === RULES.PREDICTION ? 'predict' : family === 'vote' ? 'vote' : family === 'validation' ? 'answer' : 'none'
    const measurementSource = family === 'validation' ? 'participant_input' : 'creator_input'
    updateEvent(id, {
      rule, ruleConfig: advancedDefaultRuleConfig(rule), interaction, measurementSource,
      options: rule === RULES.PREDICTION ? (events.find((e) => e.id === id)?.options || []) : [],
      teamIds: rule === RULES.PREDICTION ? (events.find((e) => e.id === id)?.teamIds || []) : [], teamCorrectOptionId: null,
    })
  }
  const toggleEventParticipant = (eventId, entityId) => setEvents((list) => list.map((e) => (e.id === eventId
    ? { ...e, participantIds: e.participantIds.includes(entityId) ? e.participantIds.filter((id) => id !== entityId) : [...e.participantIds, entityId] }
    : e)))
  const addEventOption = (eventId) => setEvents((list) => list.map((e) => (e.id === eventId ? { ...e, options: [...(e.options || []), { id: genLocalId('opt'), label: '' }] } : e)))
  const updateEventOption = (eventId, optId, label) => setEvents((list) => list.map((e) => (e.id === eventId ? { ...e, options: (e.options || []).map((o) => (o.id === optId ? { ...o, label } : o)) } : e)))
  const removeEventOption = (eventId, optId) => setEvents((list) => list.map((e) => (e.id === eventId ? { ...e, options: (e.options || []).filter((o) => o.id !== optId) } : e)))
  const setEventTeamId = (eventId, slot, groupId) => setEvents((list) => list.map((e) => {
    if (e.id !== eventId) return e
    const teamIds = [...(e.teamIds || ['', ''])]
    teamIds[slot] = groupId
    const stillValidWinner = teamIds.includes(e.teamCorrectOptionId) ? e.teamCorrectOptionId : null
    return { ...e, teamIds, teamCorrectOptionId: stillValidWinner }
  }))

  // -------------------------------------------------------------------
  // Finish — validation is a straight copy of the old `finishAdvanced`
  // (same error messages, same bypasses for numeric-prediction/options/
  // team-mode events); the ONLY addition is passing `resultConfig`
  // through. The actual ALL_VS_ALL auto-tagging for "Highest score wins"
  // happens SERVER-SIDE (lib/universalChallengeStore.js
  // `applyChallengeLevelScoring`) — already verified end-to-end by
  // scripts/test_rules_result_e2e.mjs — so this function does not
  // duplicate that logic.
  // -------------------------------------------------------------------
  const finish = () => {
    if (entities.length === 0) { setError('Add at least one participant.'); setStep('participants'); return }
    if (events.length === 0) { setError('Add at least one Moment.'); setStep('moments'); return }
    const eventIds = new Set(events.map((e) => e.id))
    const groupById = new Map(groups.map((g) => [g.id, g]))
    const built = []
    for (const ev of events) {
      const startTime = Number(ev.startTime)
      const endTime = Number(ev.endTime)
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime || (duration > 0 && endTime > duration + 0.05)) {
        setError('Keep the Moment within the video, with its end after its start.'); setActiveEventId(ev.id); setStep('moment-editor'); return
      }
      const teamIdsRaw = Array.isArray(ev.teamIds) ? ev.teamIds.filter(Boolean) : []
      const isTeamMode = teamIdsRaw.length === 2 && teamIdsRaw[0] !== teamIdsRaw[1]
      if (isTeamMode) {
        const teamA = groupById.get(teamIdsRaw[0])
        const teamB = groupById.get(teamIdsRaw[1])
        if (!teamA?.entityIds?.length || !teamB?.entityIds?.length) { setError('Both teams need at least one participant.'); setActiveEventId(ev.id); setStep('moment-editor'); return }
        if (ev.rule !== RULES.PREDICTION) { setError('Team vs Team Moments must use Community Prediction.'); setActiveEventId(ev.id); setStep('moment-editor'); return }
        if (!ev.teamCorrectOptionId || !teamIdsRaw.includes(ev.teamCorrectOptionId)) { setError('Pick the real winning team for every Team vs Team Moment.'); setActiveEventId(ev.id); setStep('moment-editor'); return }
      }
      const cleanOptions = (ev.options || []).map((o) => ({ ...o, label: (o.label || '').trim() })).filter((o) => o.label)
      const hasOptions = ev.rule === RULES.PREDICTION && !isTeamMode && cleanOptions.length > 0
      const isNumericPredictionEvent = ev.rule === RULES.PREDICTION && ev.ruleConfig?.predictionType === 'numeric'
      const autoAdvanceFrom = isTeamMode ? [] : (Array.isArray(ev.autoAdvanceFrom) ? ev.autoAdvanceFrom.filter((id) => eventIds.has(id)) : [])
      const hasChain = autoAdvanceFrom.length > 0
      if (!isTeamMode && !isNumericPredictionEvent && !hasChain && !hasOptions && ev.participantIds.length === 0) {
        setError('Every Moment needs at least one participant, free-text options, or two teams.'); setActiveEventId(ev.id); setStep('moment-editor'); return
      }
      let ruleConfig = ev.ruleConfig || {}
      if (isTeamMode) ruleConfig = { ...ruleConfig, outcomeMode: 'reveal', correctOptionId: ev.teamCorrectOptionId }
      built.push({
        id: ev.id, startTime, endTime, type: 'matchup', interaction: ev.interaction, rule: ev.rule, ruleConfig,
        participantIds: isTeamMode ? [] : [...ev.participantIds], autoAdvanceFrom,
        participantStructure: isTeamMode ? PARTICIPANT_STRUCTURES.TEAM_VS_TEAM : null,
        teamIds: isTeamMode ? [...teamIdsRaw] : [], question: ev.question || '',
        options: hasOptions ? cleanOptions.map((o) => ({ id: o.id, label: o.label })) : [], measurementSource: ev.measurementSource, votingWindow: null,
      })
    }
    if (resultConfig.ruleType === 'highest_score' && resultConfig.tieBreak === 'creator_defined' && !resultConfig.tieBreakWinnerId) {
      setError("Pick who wins ties, or choose a different tie-breaker."); setStep('rules-result'); return
    }
    setError('')
    const entitiesOut = entities.map((e) => ({ ...e, name: e.name || 'Entity', displayName: e.displayName || e.name || 'Entity' }))
    onSave({ participants: [], teams: [], entities: entitiesOut, groups, events: sortEventsByStart(built), resultConfig })
    onClose()
  }

  if (!open) return null

  const openMoment = (id) => { setActiveEventId(id); setStep('moment-editor') }
  const openPrediction = () => {
    const existing = events.find((ev) => ev.id === activeEventId && ev.ruleConfig?.predictionType === 'numeric') || events.find((ev) => ev.ruleConfig?.predictionType === 'numeric')
    if (existing) openMoment(existing.id)
    else addEvent(true)
  }
  const isPredictionTool = step === 'moment-editor' && activeEvent?.rule === RULES.PREDICTION
  const modalKey = isPredictionTool ? 'prediction' : step === 'moment-editor' ? 'moments' : step === 'rules-result' ? 'rules' : step
  const modalMeta = {
    moments: { title: step === 'moment-editor' ? 'Edit moment' : 'Moments', subtitle: 'Choose what happens in your video.', icon: Scissors },
    prediction: { title: 'Prediction', subtitle: 'Let viewers guess before the reveal.', icon: Hash },
    participants: { title: 'Participants', subtitle: 'The people taking part in your challenge.', icon: Users },
    rules: { title: 'Rules', subtitle: 'One set of rules for the whole challenge.', icon: ListChecks },
    result: { title: 'Result', subtitle: 'Choose how the final outcome is shown.', icon: Trophy },
  }[modalKey] || { title: 'Challenge', subtitle: '', icon: Scissors }
  const ModalIcon = modalMeta.icon
  const tools = [
    { id: 'moments', label: 'Moments', icon: Scissors, action: () => setStep('moments'), selected: modalKey === 'moments' },
    { id: 'prediction', label: 'Prediction', icon: Hash, action: openPrediction, selected: modalKey === 'prediction' },
    { id: 'participants', label: 'Participants', icon: Users, action: () => setStep('participants'), selected: step === 'participants' },
    { id: 'rules', label: 'Rules', icon: ListChecks, action: () => setStep('rules-result'), selected: step === 'rules-result' },
    { id: 'result', label: 'Result', icon: Trophy, action: () => setStep('result'), selected: step === 'result' },
  ]

  return (
    <div ref={editorRef} className={styles.editor} data-testid="universal-challenge-wizard" role="region" aria-label="Challenge video editor">
      <div className={styles.stage} data-testid="wizard-video-area">
        <div className={styles.videoFrame}>
          {objectUrl && <video ref={videoRef} src={objectUrl} playsInline muted={muted} preload="metadata" data-testid="wizard-video"
            onClick={togglePlay} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onLoadedMetadata={() => { setDuration(videoRef.current?.duration || 0); setCurrentTime(videoRef.current?.currentTime || 0) }}
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)} onEnded={() => setPlaying(false)}
            onError={() => setError('This video could not be loaded. Close the editor and choose another clip.')} />}
        </div>
        <Button variant="ghost" size="icon" className={`${styles.circle} ${styles.back}`} onClick={onClose} aria-label="Close editor" data-testid="wizard-back"><ChevronDown /></Button>
        <Button variant="ghost" size="icon" className={`${styles.circle} ${styles.next}`} onClick={finish} aria-label="Save challenge" data-testid="wizard-finish"><ArrowRight /></Button>
      </div>

      <div className={styles.transport}>
        <Button variant="ghost" size="icon" className={styles.circle} onClick={togglePlay} aria-label={playing ? 'Pause video' : 'Play video'} data-testid="transport-play-button">{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</Button>
        <span className={styles.timecode} data-testid="editor-timecode">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
        <div className={styles.history}>
          <Button variant="ghost" size="icon" className={styles.circle} disabled={!history.past.length} onClick={() => { dispatch({ type: 'undo' }); setError('') }} aria-label="Undo edit" data-testid="transport-undo-button"><Undo2 /></Button>
          <Button variant="ghost" size="icon" className={styles.circle} disabled={!history.future.length} onClick={() => { dispatch({ type: 'redo' }); setError('') }} aria-label="Redo edit" data-testid="transport-redo-button"><Redo2 /></Button>
        </div>
      </div>

      <div className={styles.workspace}>
        <ChallengeEditorTimeline src={objectUrl} duration={duration} currentTime={currentTime} events={sortedEvents} resultConfig={resultConfig} muted={muted} onToggleMute={() => setMuted((v) => !v)}
          onSeek={seek} onScrubStart={() => videoRef.current?.pause()} onOpenMoment={openMoment} onAddMoment={() => addEvent(false)} onOpenRules={() => setStep('rules-result')} />
        <Drawer open={step !== 'menu'} onOpenChange={(visible) => { if (!visible) setStep('menu') }} container={editorRef.current} shouldScaleBackground={false} noBodyStyles autoFocus repositionInputs>
          <DrawerContent className={styles.sheet} data-testid="tool-modal-root"
            overlayProps={{ className: styles.modalBackdrop, 'data-testid': 'tool-modal-backdrop' }}
            handleClassName={styles.modalHandle} handleProps={{ 'data-testid': 'tool-modal-handle', 'aria-hidden': true }}
            onOpenAutoFocus={(e) => { e.preventDefault(); modalHeadingRef.current?.focus() }}
            onCloseAutoFocus={(e) => { e.preventDefault(); if (modalTriggerRef.current?.isConnected) modalTriggerRef.current.focus() }}>
          <header className={styles.sheetHeader}>
            <span className={styles.modalIcon} aria-hidden="true"><ModalIcon /></span>
            <div className={styles.modalHeading}>
              <DrawerTitle ref={modalHeadingRef} tabIndex={-1} data-testid="tool-modal-title">{modalMeta.title}</DrawerTitle>
              <DrawerDescription data-testid="tool-modal-description">{modalMeta.subtitle}</DrawerDescription>
            </div>
            <Button variant="ghost" size="icon" className={styles.modalClose} onClick={() => setStep('menu')} aria-label="Close tool panel" data-testid="sheet-close-button"><X /></Button>
          </header>
          <div className={styles.sheetContent} data-testid={`tool-modal-${modalKey}`} key={step === 'moment-editor' ? activeEventId : step}>
            {error && <div role="alert" className={styles.error} data-testid="wizard-error"><Info size={16} /><span>{error}</span></div>}
            {step === 'participants' && <ParticipantsScreen entities={entities} groups={groups} participantsMode={participantsMode}
              onSetType={setParticipantsType} onAddEntity={() => addEntity('')} onUpdateEntity={updateEntity} onRemoveEntity={removeEntity}
              onAddGroup={addGroup} onUpdateGroup={updateGroup} onRemoveGroup={removeGroup} onToggleGroupEntity={toggleGroupEntity} />}
            {step === 'moments' && <MomentsScreen events={sortedEvents} onAdd={() => addEvent(false)} onOpen={openMoment} scoringOn={resultConfig.ruleType === 'highest_score'} />}
            {step === 'moment-editor' && (activeEvent ? <MomentEditorScreen
              event={activeEvent} entities={entities} groups={groups} currentTime={currentTime} duration={duration} scoringOn={resultConfig.ruleType === 'highest_score'}
              onChange={(patch) => updateEvent(activeEvent.id, patch)} onSetRule={(rule) => setEventRule(activeEvent.id, rule)}
              onToggleParticipant={(entId) => toggleEventParticipant(activeEvent.id, entId)} onAddOption={() => addEventOption(activeEvent.id)}
              onUpdateOption={(optId, label) => updateEventOption(activeEvent.id, optId, label)} onRemoveOption={(optId) => removeEventOption(activeEvent.id, optId)}
              onSetTeamId={(slot, groupId) => setEventTeamId(activeEvent.id, slot, groupId)}
              onDelete={() => removeEvent(activeEvent.id)} onDone={() => setStep('menu')} /> : <MomentsScreen events={sortedEvents} onAdd={() => addEvent(false)} onOpen={openMoment} scoringOn={resultConfig.ruleType === 'highest_score'} />)}
            {(step === 'rules-result' || step === 'result') && <RulesResultScreen view={step === 'result' ? 'result' : 'rules'} resultConfig={resultConfig} onChange={(patch) => setResultConfig((c) => ({ ...c, ...patch }))} entities={entities} events={events} onOpenRules={() => setStep('rules-result')} />}
          </div>
          <div className={styles.modalFooter}>
            <span className={styles.draftNote} data-testid="tool-modal-draft-note">{modalKey === 'rules' || modalKey === 'result' ? 'Applies to the whole challenge' : 'Changes stay in your draft'}</span>
            <Button className={styles.modalDone} onClick={() => setStep('menu')} data-testid="tool-modal-done"><Check /> Done</Button>
          </div>
          </DrawerContent>
        </Drawer>
        {error && step === 'menu' && <div role="alert" className={styles.error} data-testid="wizard-error">{error}</div>}
      </div>

      <footer className={styles.footer}>
        <p className={styles.hint} data-testid="editor-timeline-hint">Tap a moment to edit. Slide the timeline to seek.</p>
        <nav className={styles.tools} aria-label="Challenge tools" data-testid="editor-tools">
          {tools.map(({ id, label, icon: Icon, action, selected }) => <Button key={id} variant="ghost" className={styles.tool} onClick={action} aria-pressed={selected} data-testid={`tool-tile-${id}`}>
            <span className={styles.toolIcon}><Icon /></span><span>{label}</span>
          </Button>)}
        </nav>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------
function ParticipantsScreen({ entities, groups, participantsMode, onSetType, onAddEntity, onUpdateEntity, onRemoveEntity, onAddGroup, onUpdateGroup, onRemoveGroup, onToggleGroupEntity }) {
  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Type</SectionLabel>
        <div className="flex gap-2">
          <Chip selected={participantsMode === 'individual'} onClick={() => onSetType('individual')} testId="wizard-type-individual">Individual</Chip>
          <Chip selected={participantsMode === 'team'} onClick={() => onSetType('team')} testId="wizard-type-team">Team</Chip>
          <Chip selected={participantsMode === 'group'} onClick={() => onSetType('group')} testId="wizard-type-group">Group</Chip>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Number of participants</SectionLabel>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" type="button" onClick={() => entities.length > 0 && onRemoveEntity(entities[entities.length - 1].id)} data-testid="wizard-participants-minus" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition disabled:opacity-30" disabled={entities.length === 0}>
            <Minus size={16} />
          </Button>
          <span className="text-[16px] font-bold w-8 text-center" data-testid="wizard-participants-count">{entities.length}</span>
          <Button variant="ghost" type="button" onClick={onAddEntity} data-testid="wizard-participants-plus" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition">
            <Plus size={16} />
          </Button>
        </div>

        <div className="space-y-2">
          {entities.map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 bg-white/[0.05] rounded-xl p-2 border border-white/10">
              <Avatar id={e.id} name={e.name} />
              <Input
                value={e.name}
                onChange={(ev) => onUpdateEntity(e.id, { name: ev.target.value, displayName: ev.target.value })}
                placeholder="Name"
                data-testid={`wizard-entity-name-${e.id}`}
                className="flex-1 min-w-0 bg-transparent text-[13.5px] font-semibold outline-none placeholder:text-zinc-500"
              />
              <Button variant="ghost" type="button" onClick={() => onRemoveEntity(e.id)} data-testid={`wizard-entity-remove-${e.id}`} className="text-zinc-500 hover:text-rose-400 p-1 shrink-0"><X size={16} /></Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" type="button" onClick={onAddEntity} data-testid="wizard-add-participant" className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2.5 text-[13px] font-semibold text-zinc-300 hover:bg-white/5 active:scale-[0.98] transition">
          <Plus size={15} /> Add participant
        </Button>
      </div>

      {participantsMode !== 'individual' && (
        <div>
          <SectionLabel>{participantsMode === 'team' ? 'Teams' : 'Groups'}</SectionLabel>
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.id} className="rounded-xl bg-white/[0.05] border border-white/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    value={g.label}
                    onChange={(ev) => onUpdateGroup(g.id, { label: ev.target.value })}
                    data-testid={`wizard-group-label-${g.id}`}
                    className="flex-1 min-w-0 bg-transparent text-[13.5px] font-bold outline-none"
                  />
                  {groups.length > 2 && (
                    <Button variant="ghost" type="button" onClick={() => onRemoveGroup(g.id)} data-testid={`wizard-group-remove-${g.id}`} className="text-zinc-500 hover:text-rose-400 shrink-0"><Trash2 size={14} /></Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entities.map((e) => (
                    <Chip key={e.id} selected={g.entityIds.includes(e.id)} onClick={() => onToggleGroupEntity(g.id, e.id)} testId={`wizard-group-${g.id}-toggle-${e.id}`}>{e.name || 'Unnamed'}</Chip>
                  ))}
                  {entities.length === 0 && <span className="text-[11.5px] text-zinc-500">Add participants above first.</span>}
                </div>
              </div>
            ))}
          </div>
          {participantsMode === 'group' && (
            <Button variant="ghost" type="button" onClick={onAddGroup} data-testid="wizard-add-group" className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2 text-[12.5px] font-semibold text-zinc-300 hover:bg-white/5 active:scale-[0.98] transition">
              <Plus size={14} /> Add group
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Moments (list) — friendly icon+label+subtitle+time rows over the exact
// same `events` array Advanced Mode always wrote.
// ---------------------------------------------------------------------------
function MomentsScreen({ events, onAdd, onOpen, scoringOn }) {
  return (
    <div className="space-y-2.5">
      {events.length === 0 && <p className="text-[12.5px] text-zinc-500 text-center py-6">No Moments yet — add the first one below.</p>}
      {events.map((ev) => {
        const Icon = RULE_ICON[ev.rule] || Trophy
        const meta = RULE_META[ev.rule] || {}
        const countsTowardScore = scoringOn && SCORING_RULES.has(ev.rule)
        return (
          <Button variant="ghost"
            key={ev.id}
            type="button"
            onClick={() => onOpen(ev.id)}
            data-testid={`wizard-moment-row-${ev.id}`}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] active:scale-[0.98] transition text-left border border-white/10"
          >
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.color || 'bg-sky-500'}`}><Icon size={16} className="text-white" /></span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-[13.5px] font-bold text-white">{meta.label || ev.rule}</span>
                {countsTowardScore && <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400">\u2713 scores</span>}
              </span>
              <span className="block text-[12px] text-zinc-400 truncate">{ev.question || 'No question set'}</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">{fmtTime(ev.startTime)}</span>
            <ChevronRight size={16} className="text-zinc-500 shrink-0" />
          </Button>
        )
      })}
      <Button variant="ghost" type="button" onClick={onAdd} data-testid="wizard-add-moment" className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-3 text-[13px] font-semibold text-zinc-300 hover:bg-white/5 active:scale-[0.98] transition">
        <Plus size={15} /> Add moment
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Moment editor — rule picker + time range + question + participants +
// (reused verbatim) AdvancedRuleConfigFields.
// ---------------------------------------------------------------------------
function MomentEditorScreen({ event, entities, groups, currentTime, duration, scoringOn, onChange, onSetRule, onToggleParticipant, onAddOption, onUpdateOption, onRemoveOption, onSetTeamId, onDelete, onDone }) {
  const explanation = explainRule(event.rule, event.ruleConfig)
  const isPrediction = event.rule === RULES.PREDICTION
  const isNumeric = isPrediction && event.ruleConfig?.predictionType === 'numeric'
  const teamIdsRaw = Array.isArray(event.teamIds) ? event.teamIds.filter(Boolean) : []
  const isTeamMode = teamIdsRaw.length === 2
  const countsTowardScore = scoringOn && SCORING_RULES.has(event.rule)

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Moment type</SectionLabel>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {RULE_ORDER.map((rule) => {
            const Icon = RULE_ICON[rule] || Trophy
            const meta = RULE_META[rule]
            const selected = event.rule === rule
            return (
              <Button variant="ghost"
                key={rule}
                type="button"
                onClick={() => onSetRule(rule)}
                data-testid={`wizard-rule-${rule}`}
                className={`flex flex-col items-center gap-1 min-w-[68px] p-2 rounded-xl border transition active:scale-95 ${selected ? 'bg-white/15 border-white/30' : 'bg-white/[0.03] border-white/10'}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center ${meta.color}`}><Icon size={14} className="text-white" /></span>
                <span className="text-[9.5px] font-semibold text-center leading-tight text-zinc-300">{meta.label}</span>
              </Button>
            )
          })}
        </div>
        {scoringOn && (
          <p className={`mt-1.5 text-[11px] font-semibold ${countsTowardScore ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {countsTowardScore ? '\u2713 Counts toward the final score' : "Doesn't affect the final score (that's OK for Predictions/Questions)"}
          </p>
        )}
      </div>

      {isPrediction && <div>
        <SectionLabel>Prediction</SectionLabel>
        <div className="flex gap-2">
          <Chip selected={!isNumeric} testId="prediction-type-options" onClick={() => onChange({ ruleConfig: { ...event.ruleConfig, predictionType: 'option' } })}>Pick an option</Chip>
          <Chip selected={isNumeric} testId="prediction-type-numeric" onClick={() => onChange({ options: [], teamIds: [], teamCorrectOptionId: null, participantIds: [], ruleConfig: { ...event.ruleConfig, predictionType: 'numeric' } })}>Guess a number</Chip>
        </div>
        {isNumeric && <label className="block mt-3 text-sm" data-testid="numeric-answer-label">Actual number
          <Input type="number" inputMode="decimal" step="any" value={event.ruleConfig.correctValue ?? ''} placeholder="e.g. 80" data-testid="numeric-prediction-input"
            onChange={(e) => onChange({ ruleConfig: { ...event.ruleConfig, correctValue: e.target.value === '' ? null : Number(e.target.value) } })} className="mt-2 border-white/20" />
          <span className="block mt-2 text-xs text-zinc-400" data-testid="numeric-answer-help">Hidden from viewers until the moment ends. Leave blank to reveal later.</span>
        </label>}
      </div>}

      <div>
        <SectionLabel>When</SectionLabel>
        <div className="flex items-center gap-2">
          <label className="flex-1 flex items-center gap-2 bg-white/[0.05] rounded-xl px-3 py-2 border border-white/10">
            <span className="text-[11px] text-zinc-500 shrink-0">Starts</span>
            <Input type="number" step="0.1" value={event.startTime} onChange={(e) => onChange({ startTime: e.target.value })} data-testid="wizard-moment-start" className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold outline-none" />
            <span className="text-[10.5px] text-zinc-500">sec</span>
          </label>
          <label className="flex-1 flex items-center gap-2 bg-white/[0.05] rounded-xl px-3 py-2 border border-white/10">
            <span className="text-[11px] text-zinc-500 shrink-0">Ends</span>
            <Input type="number" step="0.1" value={event.endTime} onChange={(e) => onChange({ endTime: e.target.value })} data-testid="wizard-moment-end" className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold outline-none" />
            <span className="text-[10.5px] text-zinc-500">sec</span>
          </label>
        </div>
        {duration > 0 && (
          <Button variant="ghost" type="button" onClick={() => onChange({ startTime: round1(Math.min(currentTime, Math.max(0, duration - 0.1))), endTime: round1(Math.min(duration, currentTime + 6)) })} data-testid="wizard-moment-use-playhead" className="mt-1.5 text-[11px] font-semibold text-rose-400">
            Use current playhead ({fmtTime(currentTime)})
          </Button>
        )}
      </div>

      <div>
        <SectionLabel>Question / label</SectionLabel>
        <Input
          value={event.question}
          onChange={(e) => onChange({ question: e.target.value })}
          placeholder="e.g. Who wins this round?"
          data-testid="wizard-moment-question"
          className="w-full bg-white/[0.05] rounded-xl px-3 py-2.5 text-[13.5px] outline-none border border-white/10 placeholder:text-zinc-500"
        />
      </div>

      {!isTeamMode && !isNumeric && (
        <div>
          <div className="flex items-center justify-between">
            <SectionLabel>Participants</SectionLabel>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e) => (
              <Chip key={e.id} selected={event.participantIds.includes(e.id)} onClick={() => onToggleParticipant(e.id)} testId={`wizard-moment-participant-${e.id}`}>{e.name || 'Unnamed'}</Chip>
            ))}
            {entities.length === 0 && <span className="text-[11.5px] text-zinc-500">Add participants first (Challenge \u2192 Participants).</span>}
          </div>
        </div>
      )}

      {isPrediction && !isNumeric && (
        <div>
          <SectionLabel>Free-text options (optional)</SectionLabel>
          <p className="text-[11px] text-zinc-500 mb-2">Leave empty to predict directly on the participants picked above (e.g. "Alex" / "David"). Add custom options instead for something like "Guess the action".</p>
          <div className="space-y-1.5">
            {(event.options || []).map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <Input value={o.label} onChange={(e) => onUpdateOption(o.id, e.target.value)} placeholder="Option label" data-testid={`wizard-option-${o.id}`} className="flex-1 min-w-0 bg-white/[0.05] rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none border border-white/10" />
                <Button variant="ghost" type="button" onClick={() => onRemoveOption(o.id)} className="text-zinc-500 hover:text-rose-400 p-1"><X size={14} /></Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" type="button" onClick={onAddOption} data-testid="wizard-add-option" className="mt-1.5 text-[11.5px] font-semibold text-rose-400">+ Add option</Button>

          {groups.length === 2 && (
            <div className="mt-3 rounded-xl border border-white/10 p-2.5">
              <p className="text-[11px] text-zinc-500 mb-1.5">Or make this a Team vs Team round instead:</p>
              <div className="flex items-center gap-2">
                <EditorSelect value={teamIdsRaw[0] || ''} onChange={(e) => onSetTeamId(0, e.target.value)} data-testid="wizard-team-slot-0" className="flex-1 bg-black/40 text-[12px] rounded px-2 py-1.5">
                  <option value="">Team A\u2026</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </EditorSelect>
                <span className="text-[11px] text-zinc-500">vs</span>
                <EditorSelect value={teamIdsRaw[1] || ''} onChange={(e) => onSetTeamId(1, e.target.value)} data-testid="wizard-team-slot-1" className="flex-1 bg-black/40 text-[12px] rounded px-2 py-1.5">
                  <option value="">Team B\u2026</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </EditorSelect>
              </div>
              {isTeamMode && (
                <label className="flex items-center gap-2 mt-2 text-[11.5px] text-zinc-300">
                  <span className="text-zinc-500 shrink-0">Real winner</span>
                  <EditorSelect value={event.teamCorrectOptionId || ''} onChange={(e) => onChange({ teamCorrectOptionId: e.target.value || null })} data-testid="wizard-team-winner" className="flex-1 bg-black/40 text-[12px] rounded px-2 py-1.5">
                    <option value="">Reveal later</option>
                    {teamIdsRaw.map((tid) => { const g = groups.find((x) => x.id === tid); return <option key={tid} value={tid}>{g?.label || 'Team'}</option> })}
                  </EditorSelect>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">How this Moment is judged</p>
        <ul className="space-y-1">
          {explanation.map((line, i) => <li key={i} className="text-[12px] text-zinc-300 flex gap-1.5"><span className="text-rose-400">\u2022</span><span>{line}</span></li>)}
        </ul>
      </div>

      {!isNumeric && <div>
        <SectionLabel>Rule settings</SectionLabel>
        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
          <AdvancedRuleConfigFields idx={event.id} rule={event.rule} ruleConfig={event.ruleConfig} event={event} entities={entities} onChange={(patch) => onChange({ ...(patch.predictionType === 'numeric' ? { options: [], teamIds: [], teamCorrectOptionId: null, participantIds: [] } : {}), ruleConfig: { ...event.ruleConfig, ...patch } })} />
        </div>
      </div>}

      <div className="flex items-center gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onDelete} data-testid="wizard-moment-delete" className="flex items-center gap-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 px-3.5 py-2.5 text-[12.5px] font-semibold active:scale-95 transition">
          <Trash2 size={14} /> Delete
        </Button>
        <Button variant="ghost" type="button" onClick={onDone} data-testid="wizard-moment-done" className="flex-1 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white py-2.5 text-[13px] font-bold active:scale-[0.98] transition">
          Done
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rules & Result — Challenge-LEVEL config (see the big comment at the top
// of this file). Reuses computeAllVsAllStandings/resolveTie server-side;
// this screen never computes a real result itself.
// ---------------------------------------------------------------------------
function RulesResultScreen({ resultConfig, onChange, entities, events }) {
  const scoringOn = resultConfig.ruleType === 'highest_score'
  const scoringMomentsCount = events.filter((e) => SCORING_RULES.has(e.rule)).length
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Rules</SectionLabel>
        <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold text-white">Highest score wins</p>
              <p className="text-[11.5px] text-zinc-400">The participant with the highest score across every scoring Moment wins the Challenge.</p>
            </div>
            <Toggle checked={scoringOn} onChange={(v) => onChange({ ruleType: v ? 'highest_score' : null })} label="Highest score wins" testId="wizard-rules-toggle" />
          </div>
          {scoringOn && (
            <>
              <p className="text-[11px] text-zinc-500">{scoringMomentsCount} of {events.length} Moment{events.length === 1 ? '' : 's'} count{scoringMomentsCount === 1 ? 's' : ''} toward the score \u2014 only "scores" Moments (see Moments screen); Predictions/Questions never do.</p>
              <label className="flex items-center gap-2 text-[12px] text-zinc-300">
                <span className="text-zinc-500 shrink-0 w-[90px]">Result type</span>
                <EditorSelect value={resultConfig.resultType} onChange={(e) => onChange({ resultType: e.target.value })} data-testid="wizard-result-type" className="flex-1 bg-black/40 text-[12px] rounded px-2 py-1.5">
                  {Object.keys(RESULT_TYPE_LABELS).map((v) => <option key={v} value={v}>{RESULT_TYPE_LABELS[v]}</option>)}
                </EditorSelect>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-zinc-300">
                <span className="text-zinc-500 shrink-0 w-[90px]">Tie-breaker</span>
                <EditorSelect value={resultConfig.tieBreak} onChange={(e) => onChange({ tieBreak: e.target.value })} data-testid="wizard-tie-break" className="flex-1 bg-black/40 text-[12px] rounded px-2 py-1.5">
                  {Object.keys(CHALLENGE_TIE_BREAK_LABELS).map((v) => <option key={v} value={v}>{CHALLENGE_TIE_BREAK_LABELS[v]}</option>)}
                </EditorSelect>
              </label>
              {resultConfig.tieBreak === 'creator_defined' && (
                <label className="flex items-center gap-2 text-[12px] text-zinc-300">
                  <span className="text-zinc-500 shrink-0 w-[90px]">If tied</span>
                  <EditorSelect value={resultConfig.tieBreakWinnerId || ''} onChange={(e) => onChange({ tieBreakWinnerId: e.target.value || null })} data-testid="wizard-tie-break-winner" className="flex-1 bg-black/40 text-[12px] rounded px-2 py-1.5">
                    <option value="">Pick who wins\u2026</option>
                    {entities.map((e) => <option key={e.id} value={e.id}>{e.name || 'Unnamed'}</option>)}
                  </EditorSelect>
                </label>
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Result</SectionLabel>
        <div className="rounded-xl bg-white/[0.05] border border-white/10 p-3.5 space-y-2.5">
          {!scoringOn ? (
            <p className="text-[12px] text-zinc-400">Turn on "Highest score wins" above to have Twykk automatically tally scores and reveal a Challenge winner once every round resolves.</p>
          ) : (
            <>
              <p className="text-[12px] text-zinc-400">
                {resultConfig.resultType === 'full_ranking' ? 'Viewers see the full ranking (1st, 2nd, 3rd\u2026) once every scoring Moment resolves.' : 'Viewers see just the winner once every scoring Moment resolves.'}
                {' '}Ties are {resultConfig.tieBreak === 'additional_round' ? 'left open until you add one more scoring Moment' : resultConfig.tieBreak === 'creator_defined' ? 'broken by the participant you picked above' : 'broken randomly'}.
              </p>
              <div className="space-y-1.5 pt-1">
                {entities.length === 0 && <p className="text-[11.5px] text-zinc-500">Add participants to see them listed here.</p>}
                {entities.map((e) => (
                  <div key={e.id} className="flex items-center gap-2.5">
                    <Avatar id={e.id} name={e.name} size={26} />
                    <span className="flex-1 text-[12.5px] font-semibold text-zinc-200 truncate">{e.name || 'Unnamed'}</span>
                    <span className="text-[11px] text-zinc-500">Score appears once viewers watch</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
