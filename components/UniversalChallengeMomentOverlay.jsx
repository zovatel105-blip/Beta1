'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import ChallengeMomentPills from './ChallengeMomentPills'
import {
  MomentRuleBadge, MeasurementMomentView, ObjectiveMomentView, InputValidationMomentView, TwoSideChoiceMomentView,
  RankingMomentView, TeamVsTeamMomentView, TeamAvatarStack, ProgressiveStageMomentView, ProgressiveStandingsView, OneVsAllTallyView,
  WinnerRevealBanner, WinnerSettledMarker, MyPredictionOutcomeMarker,
} from './UniversalChallengeMomentViews'
import { ruleFamily } from '@/lib/universalChallengeRuleMeta'
import { RULES } from '@/lib/challengeRuleEngine'
import { resolveActiveEvent, sortEventsByStart } from '@/lib/universalChallengeTimeline'
import {
  PARTICIPANT_STRUCTURES, structureOptionSource,
  computeTeamVoteStandings, computeOneVsAllTally, computeAllVsAllStandings, computeProgressiveStandings,
} from '@/lib/universalChallengeParticipantStructures'

/**
 * UniversalChallengeMomentOverlay — Feed-side rendering + interaction for
 * the NEW "Universal Challenge Engine" (participants + a chain of ruled
 * timeline events on one video), stage 2 of that engine.
 *
 * ADDITIVE, NEW COMPONENT. Mounted ALONGSIDE (never instead of)
 * `ChallengeMomentOverlay.jsx` — the legacy 25-mechanic poll-moment engine
 * — at every place a post's video renders in the Feed (`CarouselSlide.jsx`,
 * `DuetSlide.jsx`, `OpenChallengeSlide.jsx`). The two are naturally
 * mutually exclusive per post: a post only ever has a document in ONE of
 * `postChallenges` (legacy) or `universalChallenges` (this engine), since a
 * creator picks one authoring flow or the other in `UploadDialog.jsx`. Each
 * overlay quietly renders nothing when its own backend has no document for
 * this postId — exactly like the legacy overlay already does — so no extra
 * `post.*` flag is needed to gate between them.
 *
 * SAME PROVEN PATTERN AS THE LEGACY OVERLAY:
 *  - Renders in normal flow (not absolutely positioned), just before the
 *    avatar row, so the block below simply grows upward.
 *  - Its own requestAnimationFrame loop reads `videoRef.current.currentTime`
 *    (or `getVideoEl()` when the visible side changes, e.g. Versus/Duet)
 *    to decide which event is "active" right now, completely independent
 *    of the card's own progress-bar loop — no pausing, no reloading, no
 *    switching the video.
 *
 * WHAT'S DIFFERENT FROM THE LEGACY OVERLAY (and why): the legacy engine's
 * results are computed once server-side per vote and handed back in the
 * same response: this engine ALSO auto-*resolves* whole events (rule
 * engine + tie-break + next-round participant derivation) purely as a
 * side effect of a GET/POST crossing the event's close time
 * (`challengeStateEngine.computeChallengeState`, see
 * `lib/universalChallengeStore.js`). That resolution can happen even
 * without anyone voting (window just closes). So this overlay refetches
 * the resolved state from the server — not just on its own vote — in two
 * situations: (1) whenever the LOCALLY-resolved active event id changes
 * (`resolveActiveEvent`, the exact same shared resolver
 * `UniversalChallengeEditor.jsx`'s preview uses), so a just-closed event's
 * resolution and a chained round's derived participants show up the
 * instant playback crosses into it; (2) periodically (every
 * `REFRESH_MS`) while an event is active, so a live tally/standings view
 * reflects other viewers' inputs and a round that closes mid-view.
 *
 * RULE-FAMILY DISPATCH — `ruleFamily(event.rule)` (see
 * `lib/universalChallengeRuleMeta.js`, shared with the editor) decides
 * which presentational piece renders:
 *   - 'vote'        -> ChallengeMomentPills (same shared component the
 *                      legacy overlay/editor use) — ELIMINATION /
 *                      SEQUENTIAL_MATCHUP / PREDICTION.
 *   - 'measurement' -> MeasurementMomentView (read-only standings, or an
 *                      editable per-participant field) — HIGHEST_SCORE /
 *                      LOWEST_SCORE / FASTEST / COMPARISON / SURVIVAL.
 *   - 'objective'   -> ObjectiveMomentView — FIRST_TO_OBJECTIVE.
 *   - 'validation'  -> InputValidationMomentView — INPUT_VALIDATION.
 *
 * WHO MAY SUBMIT FOR A PARTICIPANT SLOT — the backend
 * (`castUniversalChallengeInput` / the `[[...path]]` route) has NO
 * participant<->user identity model: a participant is just
 * `{id, label, avatarUrl}`, never tied to a userId. For a participant-
 * shaped event (`interaction: 'answer' | 'none'`) the route only checks
 * (a) the requester is logged in, and (b) for `interaction: 'none'`
 * specifically, that the requester is the Challenge's author (that's the
 * "you type in the results" path). It does NOT check that the submitting
 * user "owns" the participantId in the payload. So, faithfully reflecting
 * that contract: `interaction: 'answer'` slots are submittable by ANY
 * authenticated viewer, for ANY not-yet-filled participant slot;
 * `interaction: 'none'` slots are only ever rendered editable for the
 * Challenge's author. Once a slot has a value it is locked client-side
 * (see `UniversalChallengeMomentViews.jsx`) — the server itself would
 * still accept an overwrite (participantId-keyed upsert), but the UI never
 * offers that, which is the one-input-per-slot guarantee this phase needs.
 */

const fetchedCache = new Map() // postId -> resolved challenge doc | null
const REFRESH_MS = 3000
// Universal Winner Reveal (additive) — approximate window, in seconds
// before the video's own end, during which the flashy reveal shows before
// settling into the small persistent marker. See module docstring below
// and `computeChallengeWinnerSummary`.
const REVEAL_WINDOW_SECONDS = 2.5
// How long (wall-clock) the flashy reveal itself stays on screen before
// settling into the quiet marker. Deliberately SHORTER than
// REVEAL_WINDOW_SECONDS*1000: at 1x playback, the "near the end" video-time
// window and a wall-clock display timer of the SAME length would both run
// out at almost exactly the same instant a looping video wraps back to 0
// (`video.ended` never fires for a `loop`-ing element) — a race that could
// let the loop-reset (which clears the reveal state) win over the intended
// settle. Keeping this comfortably shorter guarantees the settle happens
// WHILE still inside the near-end window, before any loop-driven reset.
const REVEAL_DISPLAY_MS = 1500

function measurementField(rule) {
  if (rule === 'FASTEST') return 'timeMs'
  if (rule === 'FIRST_TO_OBJECTIVE') return 'completedAtMs'
  return 'value'
}

function inputHasValue(input, field) {
  if (!input) return false
  if (field === 'timeMs') return input.timeMs != null
  return input.value != null
}

// ---------------------------------------------------------------------------
// Universal Winner Reveal — generic, structure-agnostic "is the WHOLE
// Challenge resolved, and who's the overall winner (ties allowed)" reader.
//
// ADDITIVE, presentation-only. Never re-derives a winner independently of
// the Rule Engine / State Engine — every branch below is a straight read of
// data those engines (or the existing Phase 2 structure summary helpers)
// have ALREADY computed:
//   - "fully resolved" = every event's voting window has closed and been
//     resolved (`event.state === 'resolved'`) — the same condition
//     `challengeStateEngine.js` itself uses to consider an event done, so
//     once every event satisfies it the last event in the chain necessarily
//     has too.
//   - The overall winner(s): for structures where the terminal event's own
//     `result.winners` doesn't directly name the right entity (a
//     TEAM_VS_TEAM event's rule-engine winner is one individual, not the
//     team; ALL_VS_ALL / ONE_VS_ALL's per-matchup events aren't chained so
//     never promote a single terminal WINNER; PROGRESSIVE_CHALLENGE never
//     populates `winners` at all — see challengeRuleEngine.js/
//     challengeStateEngine.js docstrings) this reads the EXACT SAME
//     dedicated summary helper this file already uses to render that
//     structure's own standings/tally widget (`computeTeamVoteStandings` /
//     `computeAllVsAllStandings` / `computeOneVsAllTally` /
//     `computeProgressiveStandings`, all imported from
//     lib/universalChallengeParticipantStructures.js, unmodified).
//   - Every OTHER mechanic (plain HIGHEST_SCORE / LOWEST_SCORE / FASTEST /
//     FIRST_TO_OBJECTIVE / COMPARISON, a bare SEQUENTIAL_MATCHUP, or a
//     chained SEQUENTIAL_TOURNAMENT) already promotes its single overall
//     champion to the terminal `WINNER` participant status inside
//     `challengeStateEngine.js` itself — so the generic fallback simply
//     reads `challenge.participants` (exactly as already returned by
//     `getResolvedUniversalChallenge`/`computeChallengeState`) for whoever
//     ended up `WINNER`. This is what makes the reveal work for "every
//     existing mechanic ... without needing per-mechanic code changes":
//     any mechanic that follows the same WINNER-promotion convention needs
//     zero changes here.
// `winners` may legitimately be empty (e.g. a pure ELIMINATION chain that
// never crowns a single WINNER) — callers must treat that as "nothing to
// reveal", not throw.
function computeChallengeWinnerSummary(challenge) {
  const events = challenge?.events || []
  if (events.length === 0) return { resolved: false, kind: null, tie: false, winners: [] }
  const fullyResolved = events.every((e) => e.state === 'resolved')
  if (!fullyResolved) return { resolved: false, kind: null, tie: false, winners: [] }

  const participants = challenge?.participants || []
  const participantEntry = (id) => {
    const p = participants.find((pp) => pp.id === id)
    return p ? { id: p.id, label: p.label, avatarUrl: p.avatarUrl } : { id, label: 'Participant' }
  }

  const sorted = sortEventsByStart(events)
  const lastEvent = sorted[sorted.length - 1]
  const structure = lastEvent.participantStructure
  const groupId = lastEvent.structureMeta?.groupId || null

  if (structure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM) {
    // Team vs Team is ALWAYS community-vote-only (the customer's final,
    // unambiguous decision) — it always resolves via PREDICTION, never a
    // measurement rule, so `computeTeamVoteStandings` (which reads the
    // ACTUAL already-resolved `result.winners` — a single teamId,
    // guaranteed by `resolveTie()`) is the only path left here.
    // `computeTeamStandings` reads a `value`-shaped per-participant input
    // that simply doesn't exist for a vote (votes are optionId-shaped), so
    // it would always see zero aggregates and misreport a tie — it's no
    // longer reachable through this structure at all.
    const standings = computeTeamVoteStandings(lastEvent, challenge?.teams || [])
    const winningTeam = standings?.winningTeamId ? standings.standings.find((s) => s.teamId === standings.winningTeamId) : null
    const allTeams = (standings?.standings || []).map((s) => ({ id: s.teamId, label: s.label }))
    return {
      resolved: true,
      kind: 'team',
      tie: !winningTeam && allTeams.length > 0,
      winners: winningTeam ? [{ id: winningTeam.teamId, label: winningTeam.label }] : allTeams,
    }
  }

  if (structure === PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE) {
    const standings = computeProgressiveStandings(events, participants, groupId)
    const winners = (standings?.winnerIds || []).map(participantEntry)
    return { resolved: !!standings?.resolved, kind: 'participant', tie: winners.length > 1, winners }
  }

  if (structure === PARTICIPANT_STRUCTURES.ALL_VS_ALL) {
    const standings = computeAllVsAllStandings(events, participants, groupId)
    if (standings?.complete) {
      const winners = (standings.ranking || []).filter((r) => r.rank === 1).map((r) => participantEntry(r.participantId))
      return { resolved: true, kind: 'participant', tie: winners.length > 1, winners }
    }
  }

  if (structure === PARTICIPANT_STRUCTURES.ONE_VS_ALL) {
    const tally = computeOneVsAllTally(events, groupId)
    if (tally?.complete && tally.wins > tally.losses) {
      return { resolved: true, kind: 'participant', tie: false, winners: [participantEntry(tally.anchorParticipantId)] }
    }
    // Anchor didn't come out ahead (or the tally reads incomplete despite
    // every event resolving, which shouldn't happen) — there's no separate
    // "opponents' champion" concept for this structure, so fall through to
    // the generic WINNER-status reading below.
  }

  // Generic fallback — covers every other mechanic/structure (plain
  // measurement/objective/comparison rules, SEQUENTIAL_MATCHUP,
  // SEQUENTIAL_TOURNAMENT chains, and the ONE_VS_ALL/ALL_VS_ALL cases that
  // didn't resolve above) by reading the terminal WINNER status
  // `challengeStateEngine.js` already promotes participants to.
  const winners = participants.filter((p) => p.status === 'WINNER').map((p) => ({ id: p.id, label: p.label, avatarUrl: p.avatarUrl }))
  return { resolved: true, kind: 'participant', tie: winners.length > 1, winners }
}

// ---------------------------------------------------------------------------
// MY PREDICTION OUTCOME (additive, Team vs Team only) — a PERSONAL,
// per-viewer reader, distinct from `computeChallengeWinnerSummary` above
// (which reports the SAME real result to every viewer). The customer's
// explicit requirement: a Team vs Team viewer's own prediction is compared
// against the real, creator-confirmed result (`event.result.winners[0]`,
// fixed by `ruleConfig.correctOptionId` under the forced 'reveal' outcome
// mode — see lib/challengeRuleEngine.js `prediction()` /
// lib/universalChallengeStore.js createUniversalChallenge) for THEIR OWN
// correct/incorrect status — other viewers' predictions are completely
// irrelevant to it. Purely a READ: never re-derives a winner, just finds
// this one user's own cast `optionId` (from `event.inputs`, already
// rehydrated for every viewer — same data the live-vote pill UI already
// reads pre-resolution) and compares it to the already-resolved result.
// Returns null when there's nothing personal to show yet (not logged in,
// no resolved TEAM_VS_TEAM event, or this viewer never predicted on it).
function computeMyTeamPredictionOutcome(challenge, userId) {
  if (!userId) return null
  const events = challenge?.events || []
  const teamEvent = events.find((e) => e.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM && e.state === 'resolved')
  if (!teamEvent) return null
  const myOptionId = (teamEvent.inputs || []).find((i) => i.userId === userId)?.optionId ?? null
  if (myOptionId == null) return null
  const winningTeamId = teamEvent.result?.winners?.[0] || null
  if (!winningTeamId) return null
  const teams = challenge?.teams || []
  const predictedTeam = teams.find((t) => t.id === myOptionId) || null
  return { correct: myOptionId === winningTeamId, predictedLabel: predictedTeam?.label || 'your pick' }
}

export default function UniversalChallengeMomentOverlay({ postId, videoRef, getVideoEl, isActive }) {
  const { user } = useAuth()
  const [challenge, setChallenge] = useState(fetchedCache.get(postId) || null)
  const [activeEventId, setActiveEventId] = useState(null)
  const [authHint, setAuthHint] = useState(false)
  const [justClosed, setJustClosed] = useState({}) // eventId -> true, optimistic 409 flag until refetch lands
  const rafRef = useRef(0)
  const fetchedRef = useRef(false)
  const inFlightRef = useRef(false)
  const lastFetchAtRef = useRef(0)
  const activeIdRef = useRef(null)
  const videoPhaseRef = useRef('none')
  // Wall-clock timestamp (Date.now()) of when the reveal window was FIRST
  // entered this pass — null while not near the end. Timing the reveal off
  // real elapsed time (not `video.ended`) is what makes this work for a
  // LOOPING Feed video: `ended` never fires for a `loop`-ing <video>, so a
  // brief on-screen duration is the only generic way to know "the flashy
  // reveal has had its moment, settle into the quiet marker now" — exactly
  // the "after that brief window (OR once the video actually ends)" rule.
  const revealStartRef = useRef(null)
  // Once we've settled at least once this viewing, STAY settled — a quiet
  // persistent marker, per the spec, rather than vanishing again the next
  // time the (looping) video plays back through its earlier, non-near-end
  // portion.
  const hasSettledRef = useRef(false)
  const [videoPhase, setVideoPhase] = useState('none') // 'none' | 'reveal' | 'settled' — Universal Winner Reveal (see computeChallengeWinnerSummary above)

  const resolveVideoEl = useCallback(() => (getVideoEl ? getVideoEl() : videoRef?.current), [getVideoEl, videoRef])

  // Universal Winner Reveal — purely a READ over the already-computed
  // resolved state; see computeChallengeWinnerSummary's docstring. Derived
  // fresh every render straight from `challenge`, so the rAF effect below
  // (which depends on it) always closes over the latest value.
  const winnerSummary = computeChallengeWinnerSummary(challenge)
  const hasWinnerReveal = !!winnerSummary?.resolved && (winnerSummary.winners?.length > 0)
  // Personal, per-viewer Team vs Team prediction correctness (additive) —
  // see computeMyTeamPredictionOutcome's docstring above. Shown alongside
  // (never instead of) the shared Universal Winner Reveal below.
  const myPredictionOutcome = computeMyTeamPredictionOutcome(challenge, user?.id)

  // Reset the sticky "settled" flag whenever this instance starts looking at
  // a different Challenge (new postId reusing this component instance).
  useEffect(() => {
    revealStartRef.current = null
    hasSettledRef.current = false
    videoPhaseRef.current = 'none'
    setVideoPhase('none')
  }, [postId])

  const fetchState = useCallback((time) => {
    if (!postId || inFlightRef.current) return
    inFlightRef.current = true
    const t = Number.isFinite(time) ? time : 0
    fetch(`/api/universal-challenges/posts/${encodeURIComponent(postId)}?currentTime=${encodeURIComponent(t)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.challenge !== undefined) {
          fetchedCache.set(postId, data.challenge)
          setChallenge(data.challenge)
        }
      })
      .catch(() => {})
      .finally(() => { inFlightRef.current = false; lastFetchAtRef.current = Date.now() })
  }, [postId])

  // Initial load, once (mirrors ChallengeMomentOverlay's fetchedRef guard).
  useEffect(() => {
    if (!postId || !isActive || fetchedRef.current) return
    fetchedRef.current = true
    if (fetchedCache.has(postId)) { setChallenge(fetchedCache.get(postId)); }
    const el = resolveVideoEl()
    fetchState(el ? el.currentTime : 0)
  }, [postId, isActive, fetchState, resolveVideoEl])

  // Own rAF loop — see module docstring for why this both derives the
  // active event locally AND triggers server refetches.
  useEffect(() => {
    if (!isActive || !challenge?.events?.length) { setActiveEventId(null); activeIdRef.current = null; return }
    const sorted = sortEventsByStart(challenge.events)
    const tick = () => {
      const el = resolveVideoEl()
      const t = el ? el.currentTime : 0
      const found = resolveActiveEvent(sorted, t)
      const foundId = found?.id || null
      if (foundId !== activeIdRef.current) {
        activeIdRef.current = foundId
        setActiveEventId(foundId)
        fetchState(t)
      } else if (foundId && Date.now() - lastFetchAtRef.current > REFRESH_MS) {
        fetchState(t)
      }

      // Universal Winner Reveal timing — purely reads video.duration/
      // currentTime/ended, gated generically by `hasWinnerReveal` (whether
      // the WHOLE challenge is resolved with an identified winner/tie), never
      // by which per-event view happens to be active right now.
      if (hasWinnerReveal) {
        let phase
        if (hasSettledRef.current) {
          // Sticky: once settled, stay settled — a quiet persistent marker,
          // not something that reappears/disappears as a looping video
          // plays back through earlier, non-near-end portions.
          phase = 'settled'
        } else {
          const dur = el ? el.duration : NaN
          const ended = !!el?.ended
          const remaining = Number.isFinite(dur) ? dur - t : Infinity
          const nearEnd = remaining <= REVEAL_WINDOW_SECONDS
          phase = 'none'
          if (nearEnd || ended) {
            if (revealStartRef.current == null) revealStartRef.current = Date.now()
            const elapsedMs = Date.now() - revealStartRef.current
            // Flashy reveal for ~REVEAL_WINDOW_SECONDS of real on-screen
            // time, then settle — or immediately settle if the video truly
            // ended (a non-looping video reaching its natural end).
            if (ended || elapsedMs >= REVEAL_DISPLAY_MS) {
              phase = 'settled'
              hasSettledRef.current = true
            } else {
              phase = 'reveal'
            }
          } else {
            // Not near the end (yet) — reset so the eventual approach to the
            // end gets its own fresh brief reveal-then-settle cycle.
            revealStartRef.current = null
          }
        }
        if (phase !== videoPhaseRef.current) {
          videoPhaseRef.current = phase
          setVideoPhase(phase)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, challenge, resolveVideoEl, fetchState, hasWinnerReveal])

  const event = challenge?.events?.find((e) => e.id === activeEventId) || null
  const participantsById = new Map((challenge?.participants || []).map((p) => [p.id, p]))
  const isAuthor = !!user && !!challenge && user.id === challenge.authorId

  const flashAuthHint = () => { setAuthHint(true); setTimeout(() => setAuthHint(false), 2200) }

  const castInput = useCallback((eventId, payload) => {
    if (!user) { flashAuthHint(); return }
    const el = resolveVideoEl()
    const currentTime = el ? el.currentTime : 0
    fetch(`/api/universal-challenges/posts/${encodeURIComponent(postId)}/events/${encodeURIComponent(eventId)}/input`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentTime, ...payload }),
    })
      .then(async (r) => {
        if (r.status === 409) {
          // Backend enforces the fixed-window auto-close itself — the Feed
          // never re-implements "is this event still open" logic, it just
          // reacts to the documented 409 by disabling further input and
          // pulling the authoritative (already-resolved) state.
          setJustClosed((s) => ({ ...s, [eventId]: true }))
          fetchState(currentTime)
          return null
        }
        return r.ok ? r.json() : null
      })
      .then((data) => {
        if (data?.challenge !== undefined) {
          fetchedCache.set(postId, data.challenge)
          setChallenge(data.challenge)
        }
      })
      .catch(() => {})
  }, [postId, user, resolveVideoEl, fetchState])

  if (!event && !hasWinnerReveal) return null

  let body = null
  let summaryBody = null
  let badge = null

  if (event) {
  const resolved = event.state === 'resolved'
  const closed = resolved || !!justClosed[event.id]
  const family = ruleFamily(event.rule)
  const participants = (event.participantIds || []).map((id) => participantsById.get(id)).filter(Boolean)
  const result = event.result || null
  const winnerIds = result?.winners || []

  const isTeamVsTeam = event.participantStructure === PARTICIPANT_STRUCTURES.TEAM_VS_TEAM
  const isProgressive = event.participantStructure === PARTICIPANT_STRUCTURES.PROGRESSIVE_CHALLENGE
  const isOneVsAll = event.participantStructure === PARTICIPANT_STRUCTURES.ONE_VS_ALL
  const isAllVsAll = event.participantStructure === PARTICIPANT_STRUCTURES.ALL_VS_ALL
  const groupId = event.structureMeta?.groupId || null

  badge = <MomentRuleBadge rule={event.rule} participantStructure={event.participantStructure} className="mb-1.5" />

  if (isTeamVsTeam) {
    // Team vs Team viewer votes are PREDICTIONS about a real-world
    // outcome, never the thing that decides it (CUSTOMER'S FINAL
    // DECISION, superseding an earlier "community vote decides the
    // winner" design) — the two teams THEMSELVES are the predictable
    // options (PREDICTION rule, `event.options` derived server-side from
    // the two teams — see universalChallengeStore.js
    // createUniversalChallenge). No scores are entered by anyone — the
    // real winner is whatever the creator confirmed actually happened
    // (`ruleConfig.correctOptionId`, forced 'reveal' outcome mode, see
    // challengeRuleEngine.js `prediction()`), never derived from the
    // tally. There is no measurement-rule rendering path left for this
    // structure at all — `event.rule` is guaranteed to be PREDICTION here
    // (enforced server-side, see
    // lib/universalChallengeParticipantStructures.js STRUCTURE_RULE).
    //
    // NO DEADLINE (customer's explicit requirement) — the interactive
    // pick UI stays available for as long as THIS viewer hasn't predicted
    // yet, even once the round has already resolved/revealed (video
    // playback position/looping never locks it — see
    // universalChallengeStore.js castUniversalChallengeInput, which
    // accepts a Team vs Team prediction unconditionally). Once resolved,
    // the compact team-only strip (`TeamVsTeamMomentView`) additionally
    // shows with 🏆 on the real winning team — still no individual
    // participant fields, per the existing team-only requirement — and,
    // if this viewer HAS already predicted, that personal outcome shows
    // via `MyPredictionOutcomeMarker` alongside the Universal Winner
    // Reveal (see computeMyTeamPredictionOutcome above) instead of here.
    const myVote = user ? event.inputs?.find((i) => i.userId === user.id)?.optionId ?? null : null
    const hasVoted = myVote != null
    const tally = result?.details?.tally || {}
    const totalVotes = result?.details?.totalVotes ?? (event.inputs || []).length
    const teamOptions = (event.teamIds || []).map((tid) => {
      const t = (challenge?.teams || []).find((tm) => tm.id === tid)
      if (!t) return null
      return { id: t.id, label: t.label, members: (t.participantIds || []).map((pid) => participantsById.get(pid)).filter(Boolean) }
    }).filter(Boolean)
    const pillLabel = (opt) => (hasVoted && totalVotes > 0
      ? `${opt.label} · ${Math.round(((tally[opt.id] || 0) / Math.max(totalVotes, 1)) * 100)}%`
      : opt.label)
    const predictPills = (question) => (
      <ChallengeMomentPills
        className="max-w-[calc(100%-1rem)] pointer-events-auto"
        question={question}
        options={teamOptions}
        isSelected={(opt) => myVote === opt.id}
        getLabel={pillLabel}
        renderOptionIcon={(opt) => <TeamAvatarStack participants={opt.members} />}
        onOptionClick={(opt) => castInput(event.id, { optionId: opt.id })}
        footer={(
          <>
            {hasVoted && totalVotes > 0 && <p className="mt-1 text-[10.5px] text-white/60">{totalVotes} prediction{totalVotes === 1 ? '' : 's'}</p>}
            {authHint && <p className="mt-1 text-[10.5px] text-amber-300">Log in to predict</p>}
          </>
        )}
      />
    )
    if (!resolved) {
      body = predictPills(event.question || 'Who do you think will win?')
    } else {
      const standings = computeTeamVoteStandings(event, challenge?.teams || [])
      body = (
        <TeamVsTeamMomentView
          className="max-w-[calc(100%-1rem)] pointer-events-auto"
          question={event.question}
          standings={standings}
          participantsById={participantsById}
          resolved={resolved}
          unitLabel=" predictions"
        />
      )
      if (!hasVoted) {
        summaryBody = <div className="mt-1.5">{predictPills('Still want to guess? Predict now — it\'s compared to the real result.')}</div>
      }
    }
  } else if (isProgressive) {
    // PROGRESSIVE_CHALLENGE (additive, Phase 2) — rule SURVIVAL with
    // `ruleConfig.conditionMode: 'per_participant_pass_fail'` (see
    // lib/challengeRuleEngine.js). Each still-active participant gets a
    // boolean pass/fail input for this ONE stage; the cross-stage tracker
    // (`summaryBody` below, via `computeProgressiveStandings`) shows every
    // participant's furthest-reached stage regardless of which stage is
    // currently active.
    const values = {}
    for (const p of participants) {
      const input = (event.inputs || []).find((i) => i.participantId === p.id)
      values[p.id] = input && input.value != null ? (input.value === true || input.value === 'pass' || input.value === 1) : null
    }
    const editableIds = closed ? [] : participants
      .filter((p) => values[p.id] == null)
      .filter(() => (event.interaction === 'answer' ? !!user : isAuthor))
      .map((p) => p.id)
    const stageIndex = event.structureMeta?.stageIndex
    body = (
      <ProgressiveStageMomentView
        className="max-w-[calc(100%-1rem)] pointer-events-auto"
        question={event.question}
        participants={participants}
        values={values}
        resolved={resolved}
        editableIds={editableIds}
        stageNumber={Number.isFinite(stageIndex) ? stageIndex + 1 : null}
        onSubmit={(participantId, pass) => castInput(event.id, { participantId, value: pass })}
      />
    )
    const progressiveStandings = computeProgressiveStandings(challenge?.events || [], challenge?.participants || [], groupId)
    summaryBody = <ProgressiveStandingsView className="mt-1.5 pointer-events-auto" standings={progressiveStandings} participantsById={participantsById} />
  } else if (family === 'vote') {
    const myVote = user ? event.inputs?.find((i) => i.userId === user.id)?.optionId ?? null : null
    const hasVoted = myVote != null
    const tally = result?.details?.tally || {}
    const totalVotes = result?.details?.totalVotes ?? (event.inputs || []).length
    const correctOptionId = result?.details?.correctOptionId || null
    // GUESS_THE_ACTOR (and every existing vote-shaped rule/structure —
    // ELIMINATION / SEQUENTIAL_MATCHUP / plain PREDICTION authored with no
    // named structure) votes ABOUT a participant, so the vote options ARE
    // the participants — unchanged from before this phase. GUESS_THE_ACTION /
    // TWO_SIDE_CHOICE / MAJORITY_CHOICE instead vote on the creator's own
    // free-text `event.options` — those events are deliberately authored
    // with NO participants engaged at all (see universalChallengeStore.js's
    // `optionsOnlyAllowed` path).
    const useCustomOptions = structureOptionSource(event.participantStructure) === 'custom'
    const options = useCustomOptions
      ? (event.options || []).map((o) => ({ id: o.id, label: o.label }))
      : participants.map((p) => ({ id: p.id, label: p.label, avatarUrl: p.avatarUrl }))
    const isCorrect = (optId) => (correctOptionId ? correctOptionId === optId : winnerIds.includes(optId) && resolved)
    const pillLabel = (opt) => (hasVoted && totalVotes > 0
      ? `${opt.label} · ${Math.round(((tally[opt.id] || 0) / Math.max(totalVotes, 1)) * 100)}%`
      : opt.label)
    const handlePick = (optId) => castInput(event.id, { optionId: optId })
    const voteFooter = (
      <>
        {hasVoted && totalVotes > 0 && <p className="mt-1 text-[10.5px] text-white/60">{totalVotes} vote{totalVotes === 1 ? '' : 's'}</p>}
        {closed && !resolved && <p className="mt-1 text-[10.5px] text-amber-300">This round just closed.</p>}
        {authHint && <p className="mt-1 text-[10.5px] text-amber-300">Log in to vote</p>}
      </>
    )

    if (event.participantStructure === PARTICIPANT_STRUCTURES.TWO_SIDE_CHOICE) {
      body = (
        <TwoSideChoiceMomentView
          className="max-w-[calc(100%-1rem)] pointer-events-auto"
          question={event.question || 'Round in progress…'}
          options={options}
          tally={tally}
          totalVotes={totalVotes}
          selectedId={myVote}
          correctOptionId={correctOptionId}
          resolved={resolved}
          onPick={closed ? undefined : handlePick}
          footer={voteFooter}
        />
      )
    } else {
      const guessTheActor = event.participantStructure === PARTICIPANT_STRUCTURES.GUESS_THE_ACTOR
      body = (
        <ChallengeMomentPills
          className="max-w-[calc(100%-1rem)] pointer-events-auto"
          question={event.question || 'Round in progress…'}
          options={options}
          isSelected={(opt) => myVote === opt.id}
          isCorrect={(opt) => isCorrect(opt.id)}
          getLabel={pillLabel}
          renderOptionIcon={guessTheActor ? (opt) => (
            opt.avatarUrl ? (
              <img src={opt.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold shrink-0">{(opt.label || '?')[0]?.toUpperCase()}</span>
            )
          ) : undefined}
          onOptionClick={closed ? undefined : (opt) => handlePick(opt.id)}
          footer={voteFooter}
        />
      )
    }
  } else if (family === 'measurement' && event.ruleConfig?.outputMode === 'full_ranking' && resolved) {
    // ORDER/RANKING output mode (additive, Phase 2) — same rule
    // (HIGHEST_SCORE/LOWEST_SCORE/COMPARISON), additive `result.ranking`
    // (see lib/challengeRuleEngine.js) instead of a single winner. Only
    // shown once RESOLVED: beforehand there's nothing to rank yet, so the
    // event falls through to the ordinary MeasurementMomentView below for
    // score entry — input collection is identical either way, only the
    // resolved DISPLAY differs for this output mode.
    body = (
      <RankingMomentView
        className="max-w-[calc(100%-1rem)] pointer-events-auto"
        question={event.question}
        participants={participants}
        ranking={result?.details?.ranking || null}
        resolved={resolved}
      />
    )
  } else if (family === 'measurement') {
    const field = measurementField(event.rule)
    const values = {}
    for (const p of participants) {
      const input = (event.inputs || []).find((i) => i.participantId === p.id)
      values[p.id] = input && inputHasValue(input, field) ? Number(input[field === 'timeMs' ? 'timeMs' : 'value']) : null
    }
    const editableIds = closed ? [] : participants
      .filter((p) => values[p.id] == null)
      .filter(() => (event.interaction === 'answer' ? !!user : isAuthor))
      .map((p) => p.id)
    body = (
      <MeasurementMomentView
        className="max-w-[calc(100%-1rem)] pointer-events-auto"
        question={event.question}
        participants={participants}
        values={values}
        winnerIds={winnerIds}
        resolved={resolved}
        editableIds={editableIds}
        unitLabel={field === 'timeMs' ? 'ms' : ''}
        onSubmit={(participantId, value) => castInput(event.id, field === 'timeMs' ? { participantId, timeMs: value } : { participantId, value })}
      />
    )
  } else if (family === 'objective') {
    const completions = {}
    for (const p of participants) {
      const input = (event.inputs || []).find((i) => i.participantId === p.id)
      const t = input ? (input.completedAtMs ?? input.timeMs ?? input.value) : null
      completions[p.id] = t != null ? Number(t) : null
    }
    const editableIds = closed ? [] : participants
      .filter((p) => completions[p.id] == null)
      .filter(() => (event.interaction === 'answer' ? !!user : isAuthor))
      .map((p) => p.id)
    body = (
      <ObjectiveMomentView
        className="max-w-[calc(100%-1rem)] pointer-events-auto"
        question={event.question}
        participants={participants}
        completions={completions}
        winnerIds={winnerIds}
        resolved={resolved}
        editableIds={editableIds}
        onMarkComplete={(participantId) => castInput(event.id, { participantId, completedAtMs: Date.now() })}
      />
    )
  } else if (family === 'validation') {
    const values = {}
    for (const p of participants) {
      const input = (event.inputs || []).find((i) => i.participantId === p.id)
      values[p.id] = input ? (input.value ?? input.letters ?? null) : null
    }
    const editableIds = closed ? [] : participants
      .filter((p) => values[p.id] == null)
      .filter(() => (event.interaction === 'answer' ? !!user : isAuthor))
      .map((p) => p.id)
    body = (
      <InputValidationMomentView
        className="max-w-[calc(100%-1rem)] pointer-events-auto"
        question={event.question}
        participants={participants}
        values={values}
        resolved={resolved}
        isValid={resolved ? !!result?.details?.isValid : null}
        editableIds={editableIds}
        onSubmit={(participantId, text) => castInput(event.id, { participantId, letters: text, value: text })}
      />
    )
  }

  if (isOneVsAll) {
    // ONE_VS_ALL running tally (additive, Phase 2) — purely reads each
    // group matchup's own already-resolved result; no new evaluation.
    const tally = computeOneVsAllTally(challenge?.events || [], groupId)
    summaryBody = <OneVsAllTallyView className="mt-1.5 pointer-events-auto" tally={tally} participantsById={participantsById} />
  } else if (isAllVsAll) {
    // ALL_VS_ALL standings (additive, Phase 2) — win-count tally rendered
    // as a full ranking via the SAME RankingMomentView / competitionRanking
    // shape used by the Order/Ranking structure — not a second format.
    const standings = computeAllVsAllStandings(challenge?.events || [], challenge?.participants || [], groupId)
    summaryBody = standings ? (
      <RankingMomentView
        className="mt-1.5 pointer-events-auto"
        question="Standings"
        participants={challenge?.participants || []}
        ranking={standings.ranking}
        resolved={standings.complete}
      />
    ) : null
  }
  }

  if (!body && videoPhase === 'none') return null

  return (
    <div className="mb-2.5" data-testid="universal-challenge-feed-moment">
      {body && (
        <>
          {badge}
          {body}
          {summaryBody}
        </>
      )}
      {videoPhase === 'reveal' && (
        <WinnerRevealBanner
          className={body ? 'mt-2' : ''}
          winners={winnerSummary?.winners || []}
          tie={!!winnerSummary?.tie}
        />
      )}
      {videoPhase === 'settled' && (
        <WinnerSettledMarker
          className={body ? 'mt-1.5' : ''}
          winners={winnerSummary?.winners || []}
          tie={!!winnerSummary?.tie}
        />
      )}
      {(videoPhase === 'reveal' || videoPhase === 'settled') && myPredictionOutcome && (
        <MyPredictionOutcomeMarker
          className="mt-1.5"
          correct={myPredictionOutcome.correct}
          predictedLabel={myPredictionOutcome.predictedLabel}
        />
      )}
    </div>
  )
}
