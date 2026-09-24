'use client'

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info, Play, Pause, Trophy, Users, X, Undo2, Redo2, Scissors, Hash, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/drawer'
import { ChallengeEditorTimeline } from './ChallengeEditorTimeline'
import { ParticipantsScreen, MomentsScreen, MomentEditorScreen, RulesResultScreen } from './ChallengeToolPanels'
import { advancedDefaultRuleConfig } from './UniversalChallengeEditor'
import styles from './ChallengeEditor.module.css'
import { RULES } from '@/lib/challengeRuleEngine'
import { RULE_META } from '@/lib/universalChallengeRuleMeta'
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

  useEffect(() => {
    if (step !== 'menu') {
      videoRef.current?.pause()
      modalHeadingRef.current?.focus({ preventScroll: true })
    }
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
    <div ref={editorRef} className={styles.editor} data-testid="universal-challenge-wizard" role="region" aria-label="Challenge video editor"
      onClickCapture={(e) => { if (step === 'menu') modalTriggerRef.current = e.target.closest('button') || document.activeElement }}>
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
            {step === 'moment-editor' ? <Button variant="ghost" size="icon" className={styles.modalBack} onClick={() => setStep('moments')} aria-label="Back to moments" data-testid="modal-back-to-moments"><ArrowLeft /></Button> : <span className={styles.modalIcon} aria-hidden="true"><ModalIcon /></span>}
            <div className={styles.modalHeading}>
              <DrawerTitle ref={modalHeadingRef} tabIndex={-1} data-testid="tool-modal-title">{modalMeta.title}</DrawerTitle>
              <DrawerDescription data-testid="tool-modal-description">{modalMeta.subtitle}</DrawerDescription>
            </div>
            <Button variant="ghost" size="icon" className={styles.modalClose} onClick={() => setStep('menu')} aria-label="Close tool panel" data-testid="sheet-close-button"><X data-testid="tool-modal-close-button" /></Button>
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
              onDelete={() => removeEvent(activeEvent.id)} onOpenParticipants={() => setStep('participants')} /> : <MomentsScreen events={sortedEvents} onAdd={() => addEvent(false)} onOpen={openMoment} scoringOn={resultConfig.ruleType === 'highest_score'} />)}
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
          {tools.map(({ id, label, icon: Icon, action, selected }) => <Button key={id} variant="ghost" className={styles.tool} onClick={action} aria-haspopup="dialog" aria-expanded={selected && step !== 'menu'} aria-pressed={selected} data-testid={`tool-tile-${id}`}>
            <span className={styles.toolIcon}><Icon /></span><span>{label}</span>
          </Button>)}
        </nav>
      </footer>
    </div>
  )
}

