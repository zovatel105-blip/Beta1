'use client'

import { Children, useState } from 'react'
import { Check, ChevronRight, Clock3, Flag, Hash, HelpCircle, Info, ListChecks, LockKeyhole, Plus, Scale, Scissors, ShieldAlert, Swords, Trash2, TrendingDown, Trophy, UserMinus, UserRound, Users, UsersRound, X, Zap, CheckSquare, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { AdvancedRuleConfigFields, explainRule } from './UniversalChallengeEditor'
import { RULES } from '@/lib/challengeRuleEngine'
import { RULE_META, RULE_ORDER } from '@/lib/universalChallengeRuleMeta'
import styles from './ChallengeEditor.module.css'

const SCORING_RULES = new Set([RULES.SEQUENTIAL_MATCHUP, RULES.COMPARISON, RULES.HIGHEST_SCORE, RULES.LOWEST_SCORE])
const RULE_ICON = { [RULES.HIGHEST_SCORE]: Trophy, [RULES.LOWEST_SCORE]: TrendingDown, [RULES.FASTEST]: Zap, [RULES.FIRST_TO_OBJECTIVE]: Flag, [RULES.ELIMINATION]: UserMinus, [RULES.SEQUENTIAL_MATCHUP]: Swords, [RULES.PREDICTION]: Hash, [RULES.INPUT_VALIDATION]: CheckSquare, [RULES.SURVIVAL]: ShieldAlert, [RULES.COMPARISON]: Scale }
const fmtTime = (s) => { const n = Math.max(0, Number(s) || 0); return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}` }
const round1 = (v) => Math.round(v * 10) / 10
const RESULT_LABELS = { winner_only: 'Winner only', full_ranking: 'Full ranking (1st, 2nd, 3rd…)' }
const TIE_LABELS = { random: 'Pick randomly', creator_defined: "I'll choose the winner", additional_round: 'Add another moment to decide' }

const EditorSelect = ({ children, value, onChange, ...props }) => (
  <Select value={value || '__empty'} onValueChange={(v) => onChange({ target: { value: v === '__empty' ? '' : v } })}>
    <SelectTrigger {...props}><SelectValue /></SelectTrigger>
    <SelectContent className="z-[120] bg-neutral-900 text-white border-white/20 max-w-[calc(100vw-32px)]">
      {Children.toArray(children).map((child) => <SelectItem key={child.props.value || '__empty'} value={child.props.value || '__empty'} data-testid={`${props['data-testid']}-${child.props.value || 'empty'}`}>{child.props.children}</SelectItem>)}
    </SelectContent>
  </Select>
)
const Section = ({ icon: Icon, title, help, children }) => <section className={styles.panelSection}><h3 className={styles.sectionLabel}>{Icon && <Icon aria-hidden="true" />}{title}</h3>{help && <p className={styles.sectionHelp}>{help}</p>}{children}</section>
const Note = ({ children, icon: Icon = Info }) => <div className={styles.infoNote}><Icon aria-hidden="true" /><p>{children}</p></div>
const Avatar = ({ name }) => <span className={styles.participantAvatar} aria-hidden="true">{name?.trim() ? name.trim()[0].toUpperCase() : <UserRound size={18} />}</span>
const Choice = ({ selected, children, onClick, testId }) => <Button variant="ghost" aria-pressed={selected} onClick={onClick} data-testid={testId} className={styles.memberChip}>{selected && <Check size={14} />}{children}</Button>

export function ParticipantsScreen({ entities, groups, participantsMode, onSetType, onAddEntity, onUpdateEntity, onRemoveEntity, onAddGroup, onUpdateGroup, onRemoveGroup, onToggleGroupEntity }) {
  const modes = [{ id: 'individual', label: 'Individual', icon: UserRound }, { id: 'team', label: 'Team', icon: Users }, { id: 'group', label: 'Group', icon: UsersRound }]
  return <div className={styles.panelStack}>
    <Section title="01 · Choose a format" icon={Users}>
      <div className={styles.choiceGrid}>{modes.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" className={styles.choiceCard} aria-pressed={participantsMode === id} onClick={() => onSetType(id)} data-testid={`wizard-type-${id}`}><Icon /><span>{label}</span>{participantsMode === id && <Check className={styles.choiceCheck} />}</Button>)}</div>
      <p className={styles.controlHelp}>{participantsMode === 'individual' ? 'Each person takes part individually.' : participantsMode === 'team' ? 'Create two teams, then assign people to each side.' : 'Organize people into two or more named groups.'}</p>
    </Section>
    <Section title="02 · Add participants" help="Use names your viewers will recognize.">
      <div className={styles.countRow}>
        <span className={styles.controlTitle}>Participants</span>
        <div className={styles.stepper}>
          <Button variant="ghost" onClick={() => entities.length && onRemoveEntity(entities.at(-1).id)} disabled={!entities.length} aria-label="Remove last participant" data-testid="wizard-participants-minus"><Minus size={16} /></Button>
          <span data-testid="wizard-participants-count" aria-live="polite">{entities.length}</span>
          <Button variant="ghost" onClick={onAddEntity} aria-label="Add participant" data-testid="wizard-participants-plus"><Plus size={16} /></Button>
        </div>
      </div>
      <div className={styles.listStack}>{entities.map((e, i) => <div key={e.id} className={styles.participantRow}>
        <Avatar name={e.name} /><Input value={e.name} onChange={(ev) => onUpdateEntity(e.id, { name: ev.target.value, displayName: ev.target.value })} placeholder={`Participant ${i + 1}`} aria-label={`Participant ${i + 1} name`} data-testid={`wizard-entity-name-${e.id}`} />
        <Button variant="ghost" size="icon" onClick={() => onRemoveEntity(e.id)} aria-label={`Remove ${e.name || `participant ${i + 1}`}`} data-testid={`wizard-entity-remove-${e.id}`}><X size={18} /></Button>
      </div>)}</div>
      {!entities.length && <p className={styles.controlHelp}>No participants yet. Add the first person to get started.</p>}
      <Button variant="ghost" onClick={onAddEntity} data-testid="wizard-add-participant" className={styles.addAction}><Plus size={18} /> Add participant</Button>
    </Section>
    {participantsMode !== 'individual' && <Section title={`03 · Assign ${participantsMode === 'team' ? 'teams' : 'groups'}`} help="Tap a name to include that person. Selected names show a check.">
      <div className={styles.listStack}>{groups.map((g, i) => <div key={g.id} className={styles.controlCard}>
        <div className={styles.controlRow}><Input value={g.label} onChange={(e) => onUpdateGroup(g.id, { label: e.target.value })} aria-label={`Group ${i + 1} name`} data-testid={`wizard-group-label-${g.id}`} />{groups.length > 2 && <Button variant="ghost" size="icon" onClick={() => onRemoveGroup(g.id)} aria-label={`Remove ${g.label}`} data-testid={`wizard-group-remove-${g.id}`}><Trash2 size={18} /></Button>}</div>
        <p className={styles.controlHelp}>{g.entityIds.length} selected</p>
        <div className={styles.memberList}>{entities.map((e) => <Choice key={e.id} selected={g.entityIds.includes(e.id)} onClick={() => onToggleGroupEntity(g.id, e.id)} testId={`wizard-group-${g.id}-toggle-${e.id}`}>{e.name || 'Unnamed'}</Choice>)}</div>
        {!entities.length && <p className={styles.controlHelp}>Add participants above first.</p>}
      </div>)}</div>
      {participantsMode === 'group' && <Button variant="ghost" onClick={onAddGroup} data-testid="wizard-add-group" className={styles.addAction}><Plus size={18} /> Add group</Button>}
    </Section>}
  </div>
}

export function MomentsScreen({ events, onAdd, onOpen, scoringOn }) {
  return <div className={styles.panelStack}>
    <Note>A moment is an interaction at a specific point in your video. Add one, then set its question and timing.</Note>
    <Section title={`Your moments · ${events.length}`} icon={Scissors}>
      <Button variant="ghost" onClick={onAdd} data-testid="wizard-add-moment" className={styles.addAction}><Plus size={18} /> Add moment</Button>
      {!events.length && <div className={styles.emptyState} data-testid="moments-empty"><Scissors /><p className={styles.controlTitle}>Make your video interactive</p><p className={styles.controlHelp}>Add your first moment to let viewers predict, vote or answer.</p></div>}
      <div className={styles.listStack}>{events.map((ev, i) => { const Icon = RULE_ICON[ev.rule] || HelpCircle; const scores = scoringOn && SCORING_RULES.has(ev.rule); return <Button variant="ghost" key={ev.id} onClick={() => onOpen(ev.id)} data-testid={`wizard-moment-row-${ev.id}`} className={styles.momentRow}>
        <span className={styles.rowIcon}><Icon size={20} /></span>
        <span className={styles.momentCopy}><span className={styles.momentEyebrow}>Moment {i + 1} · {RULE_META[ev.rule]?.label || ev.rule}</span><span className={styles.momentQuestion}>{ev.question || 'Add a question or label'}</span><span className={styles.momentTime}><Clock3 size={12} /> {fmtTime(ev.startTime)} – {fmtTime(ev.endTime)}{scores && <span className={styles.statusBadge}>Counts toward score</span>}</span></span><ChevronRight size={18} />
      </Button> })}</div>
    </Section>
  </div>
}

export function MomentEditorScreen({ event, entities, groups, currentTime, duration, scoringOn, onChange, onSetRule, onToggleParticipant, onAddOption, onUpdateOption, onRemoveOption, onSetTeamId, onDelete, onOpenParticipants }) {
  const [rulePickerOpen, setRulePickerOpen] = useState('')
  const isPrediction = event.rule === RULES.PREDICTION
  const isNumeric = isPrediction && event.ruleConfig?.predictionType === 'numeric'
  const teamIdsRaw = (event.teamIds || []).filter(Boolean)
  const isTeamMode = teamIdsRaw.length === 2
  const Icon = RULE_ICON[event.rule] || HelpCircle
  const start = Number(event.startTime), end = Number(event.endTime)
  const invalidTime = event.startTime === '' || event.endTime === '' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || (duration > 0 && end > duration + .05)
  const typeChange = (numeric) => onChange({ ...(numeric ? { options: [], teamIds: [], teamCorrectOptionId: null, participantIds: [] } : {}), ruleConfig: { ...event.ruleConfig, predictionType: numeric ? 'numeric' : 'option' } })
  return <div className={styles.panelStack}>
    <Accordion type="single" collapsible value={rulePickerOpen} onValueChange={setRulePickerOpen}>
      <AccordionItem value="type" className={styles.typePicker}>
        <AccordionTrigger className={styles.selectedRule} data-testid="wizard-change-moment-type"><span className={styles.rowIcon}><Icon size={20} /></span><span><span className={styles.momentEyebrow}>Moment type</span><span className={styles.controlTitle}>{RULE_META[event.rule]?.label || event.rule}</span></span></AccordionTrigger>
        <AccordionContent className={styles.rulePickerBody}><p className={styles.controlHelp}>Choose what viewers do in this moment.</p><div className={styles.ruleGrid}>{RULE_ORDER.map((rule) => { const RuleIcon = RULE_ICON[rule] || HelpCircle; return <Button variant="ghost" key={rule} aria-pressed={event.rule === rule} onClick={() => { onSetRule(rule); setRulePickerOpen('') }} data-testid={`wizard-rule-${rule}`} className={styles.ruleChoice}><RuleIcon /><span>{RULE_META[rule].label}</span>{event.rule === rule && <Check size={14} />}</Button> })}</div></AccordionContent>
      </AccordionItem>
    </Accordion>
    {isPrediction && <Section title="Prediction type" icon={Hash}>
      <div className={styles.segmented}><Button variant="ghost" aria-pressed={!isNumeric} data-testid="prediction-type-options" onClick={() => typeChange(false)}>Pick an option</Button><Button variant="ghost" aria-pressed={isNumeric} data-testid="prediction-type-numeric" onClick={() => typeChange(true)}>Guess a number</Button></div>
      {isNumeric && <div className={`${styles.controlCard} ${styles.numericCard}`}>
        <label className={styles.formField} data-testid="numeric-answer-label"><span className={styles.controlTitle}>Actual number <span className={styles.optionalLabel}>Optional for now</span></span><Input type="number" inputMode="decimal" step="any" value={event.ruleConfig.correctValue ?? ''} placeholder="e.g. 80" data-testid="numeric-prediction-input" aria-describedby="numeric-answer-help" onChange={(e) => onChange({ ruleConfig: { ...event.ruleConfig, correctValue: e.target.value === '' ? null : Number(e.target.value) } })} /></label>
        <div className={styles.controlHelp} id="numeric-answer-help" data-testid="numeric-answer-help"><LockKeyhole size={14} className="inline mr-1" />Hidden from viewers until the moment ends. Leave blank to reveal later.</div>
      </div>}
    </Section>}
    <Section title={isPrediction ? 'What should viewers predict?' : 'Question or label'} icon={HelpCircle}>
      <Input value={event.question} onChange={(e) => onChange({ question: e.target.value })} placeholder={isNumeric ? 'e.g. How many points will Alex score?' : 'e.g. Who wins this round?'} aria-label="Question or label" data-testid="wizard-moment-question" />
    </Section>
    <Section title="When it appears" icon={Clock3} help="Set the start and end in seconds within your video.">
      <div className={styles.fieldGrid}>
        <label className={styles.formField}>Starts at (sec)<Input type="number" inputMode="decimal" step="0.1" min="0" max={duration || undefined} value={event.startTime} onChange={(e) => onChange({ startTime: e.target.value })} data-testid="wizard-moment-start" aria-invalid={invalidTime} aria-describedby={invalidTime ? 'moment-time-error' : undefined} /></label>
        <label className={styles.formField}>Ends at (sec)<Input type="number" inputMode="decimal" step="0.1" min="0" max={duration || undefined} value={event.endTime} onChange={(e) => onChange({ endTime: e.target.value })} data-testid="wizard-moment-end" aria-invalid={invalidTime} aria-describedby={invalidTime ? 'moment-time-error' : undefined} /></label>
      </div>
      {invalidTime && <p role="alert" className={styles.controlHelp} id="moment-time-error" data-testid="moment-time-error">Choose an end after the start, within the video{duration ? ` (${round1(duration)} sec)` : ''}.</p>}
      {duration > 0 && <Button variant="ghost" onClick={() => onChange({ startTime: round1(Math.min(currentTime, Math.max(0, duration - .1))), endTime: round1(Math.min(duration, currentTime + 6)) })} data-testid="wizard-moment-use-playhead" className={styles.textAction}><Clock3 size={15} /> Use playhead · {fmtTime(currentTime)}</Button>}
    </Section>
    {!isNumeric && !isTeamMode && <Section title="Who takes part?" icon={Users} help={isPrediction ? 'Select participants, or add custom answer options below.' : 'Choose the participants for this moment.'}>
      <div className={styles.memberList}>{entities.map((e) => <Choice key={e.id} selected={event.participantIds.includes(e.id)} onClick={() => onToggleParticipant(e.id)} testId={`wizard-moment-participant-${e.id}`}>{e.name || 'Unnamed'}</Choice>)}</div>
      {!entities.length && <Button variant="ghost" className={styles.addAction} onClick={onOpenParticipants} data-testid="moment-add-participants"><Users size={18} /> Add participants</Button>}
    </Section>}
    {isPrediction && !isNumeric && <Section title="Custom answer options" help="Optional. Leave empty to use your selected participants as the answers.">
      <div className={styles.listStack}>{(event.options || []).map((o, i) => <div key={o.id} className={styles.controlRow}><Input value={o.label} onChange={(e) => onUpdateOption(o.id, e.target.value)} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} data-testid={`wizard-option-${o.id}`} /><Button variant="ghost" size="icon" onClick={() => onRemoveOption(o.id)} aria-label={`Remove option ${i + 1}`} data-testid={`wizard-option-remove-${o.id}`}><X size={18} /></Button></div>)}</div>
      <Button variant="ghost" onClick={onAddOption} data-testid="wizard-add-option" className={styles.addAction}><Plus size={18} /> Add option</Button>
    </Section>}
    <Accordion type="multiple" className={styles.secondarySettings}>
      {isPrediction && !isNumeric && groups.length === 2 && <AccordionItem value="teams" className="border-white/10">
        <AccordionTrigger data-testid="moment-teams-settings">Team vs Team{isTeamMode ? ' · enabled' : ' · optional'}</AccordionTrigger>
        <AccordionContent><div className={styles.panelStack}><p className={styles.controlHelp}>Choose two different teams, then confirm the real winner before saving.</p>
          <div className={styles.fieldGrid}>{[0, 1].map((slot) => <label key={slot} className={styles.formField}>Team {slot === 0 ? 'A' : 'B'}<EditorSelect value={event.teamIds?.[slot] || ''} onChange={(e) => onSetTeamId(slot, e.target.value)} data-testid={`wizard-team-slot-${slot}`} aria-label={`Team ${slot === 0 ? 'A' : 'B'}`}><option value="">Choose team</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</EditorSelect></label>)}</div>
          {isTeamMode && <label className={styles.formField}>Real winning team<EditorSelect value={event.teamCorrectOptionId || ''} onChange={(e) => onChange({ teamCorrectOptionId: e.target.value || null })} data-testid="wizard-team-winner" aria-label="Real winning team"><option value="">Choose the winner</option>{teamIdsRaw.map((id) => <option key={id} value={id}>{groups.find((g) => g.id === id)?.label || 'Team'}</option>)}</EditorSelect></label>}
        </div></AccordionContent>
      </AccordionItem>}
      {!isNumeric && <AccordionItem value="settings" className="border-white/10"><AccordionTrigger data-testid="moment-rule-settings">Advanced rule settings</AccordionTrigger><AccordionContent className={styles.advancedFields}><AdvancedRuleConfigFields idx={event.id} rule={event.rule} ruleConfig={event.ruleConfig} event={event} entities={entities} onChange={(patch) => onChange({ ...(patch.predictionType === 'numeric' ? { options: [], teamIds: [], teamCorrectOptionId: null, participantIds: [] } : {}), ruleConfig: { ...event.ruleConfig, ...patch } })} /></AccordionContent></AccordionItem>}
      {isNumeric && <AccordionItem value="judging" className="border-white/10"><AccordionTrigger data-testid="moment-judging-info">How this prediction works</AccordionTrigger><AccordionContent><div className={styles.listStack}>{explainRule(event.rule, event.ruleConfig).map((line, i) => <p key={i} className={styles.controlHelp}>{line}</p>)}</div></AccordionContent></AccordionItem>}
    </Accordion>
    {scoringOn && <Note>{SCORING_RULES.has(event.rule) ? 'This moment counts toward the final challenge score.' : 'This moment does not affect the final challenge score.'}</Note>}
    <Button variant="ghost" onClick={onDelete} data-testid="wizard-moment-delete" className={styles.deleteAction}><Trash2 size={17} /> Delete moment</Button>
  </div>
}

export function RulesResultScreen({ view, resultConfig, onChange, entities, events, onOpenRules }) {
  const scoringOn = resultConfig.ruleType === 'highest_score'
  const scoringCount = events.filter((e) => SCORING_RULES.has(e.rule)).length
  if (view === 'result') return <div className={styles.panelStack}>
    {!scoringOn ? <div className={styles.emptyState} data-testid="result-disabled"><Trophy /><p className={styles.controlTitle}>Give your challenge a winner</p><p className={styles.controlHelp}>Enable “Highest score wins” in Rules to combine scoring moments into one final result.</p><Button className={styles.modalDone} onClick={onOpenRules} data-testid="result-open-rules"><ListChecks size={17} /> Set up rules <ChevronRight size={17} /></Button></div> : <>
      <Section title="What viewers will see" icon={Trophy}>
        <div className={styles.resultSummary} data-testid="result-summary"><span className={styles.rowIcon}><Trophy size={24} /></span><p className={styles.controlTitle}>{resultConfig.resultType === 'full_ranking' ? 'Full ranking' : 'Winner reveal'}</p><p className={styles.controlHelp}>{resultConfig.resultType === 'full_ranking' ? 'Viewers see every participant’s final position.' : 'Viewers see the participant who wins the challenge.'} The result appears once the scoring moments are resolved.</p><span className={styles.statusBadge}>Not decided yet</span></div>
      </Section>
      <Section title={`Participants · ${entities.length}`} help="This is your participant list, not a ranking. No scores have been calculated yet.">
        <div className={styles.listStack}>{entities.map((e) => <div className={styles.resultParticipant} key={e.id}><Avatar name={e.name} /><span>{e.name || 'Unnamed'}</span><span className={styles.pendingLabel}>Awaiting result</span></div>)}</div>
        {!entities.length && <p className={styles.controlHelp}>Add participants using the Participants tool.</p>}
      </Section>
      <Note>{scoringCount} of {events.length} moments count toward the score. {resultConfig.tieBreak === 'additional_round' ? 'A tie stays open until you add another scoring moment.' : resultConfig.tieBreak === 'creator_defined' ? `If tied, ${entities.find((e) => e.id === resultConfig.tieBreakWinnerId)?.name || 'the participant you choose in Rules'} wins.` : 'Ties are resolved randomly.'}</Note>
      <Button variant="ghost" className={styles.addAction} onClick={onOpenRules} data-testid="result-open-rules"><ListChecks size={17} /> Edit result rules <ChevronRight size={17} /></Button>
    </>}
  </div>
  return <div className={styles.panelStack}>
    <Section title="Scoring rule" icon={ListChecks}>
      <div className={styles.controlCard}>
        <div className={styles.controlRow}><label htmlFor="challenge-scoring" className={styles.controlTitle}>Highest score wins</label><span className={styles.switchTarget}><Switch id="challenge-scoring" className={styles.scoreSwitch} checked={scoringOn} onCheckedChange={(v) => onChange({ ruleType: v ? 'highest_score' : null })} aria-describedby="scoring-help" data-testid="wizard-rules-toggle" /></span></div>
        <p className={styles.controlHelp} id="scoring-help">Combine the scores from your scoring moments to choose one overall challenge winner.</p>
      </div>
    </Section>
    {scoringOn ? <>
      <Note><strong>{scoringCount} of {events.length} moments</strong> count toward the final score. Predictions and questions do not add points.{scoringCount === 0 && ' Add a scoring moment to produce a final result.'}</Note>
      <Section title="Final outcome" icon={Trophy}>
        <div className={styles.panelStack}>
          <label className={styles.formField}>Show the result as<EditorSelect value={resultConfig.resultType || 'winner_only'} onChange={(e) => onChange({ resultType: e.target.value })} data-testid="wizard-result-type" aria-label="Result type">{Object.entries(RESULT_LABELS).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</EditorSelect></label>
          <label className={styles.formField}>If participants tie<EditorSelect value={resultConfig.tieBreak || 'random'} onChange={(e) => onChange({ tieBreak: e.target.value })} data-testid="wizard-tie-break" aria-label="Tie-breaker">{Object.entries(TIE_LABELS).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</EditorSelect></label>
          {resultConfig.tieBreak === 'creator_defined' && <label className={styles.formField}>Who wins a tie?<EditorSelect value={resultConfig.tieBreakWinnerId || ''} onChange={(e) => onChange({ tieBreakWinnerId: e.target.value || null })} data-testid="wizard-tie-break-winner" aria-label="Tie-break winner"><option value="">Choose a participant</option>{entities.map((e) => <option value={e.id} key={e.id}>{e.name || 'Unnamed'}</option>)}</EditorSelect><span className={styles.controlHelp}>{entities.length ? 'Required before saving the challenge.' : 'Add participants first to choose a tie-break winner.'}</span></label>}
          {resultConfig.tieBreak === 'additional_round' && <p className={styles.controlHelp}>If there is a tie, add another scoring moment to decide the winner.</p>}
        </div>
      </Section>
    </> : <Note>Scoring is off. Each moment still works on its own, but the challenge has no combined winner.</Note>}
  </div>
}
