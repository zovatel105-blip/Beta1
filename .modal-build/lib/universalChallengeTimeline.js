/**
 * Universal Challenge Engine — shared "what's active at time T" resolver.
 *
 * ADDITIVE, NEW MODULE. This is the client-side counterpart of the
 * server's timeline lookup (`challengeStateEngine.computeChallengeState`
 * uses the same `currentTime >= event.startTime && currentTime <
 * event.endTime` window to decide which event is active). It contains NO
 * server logic (no auto-resolution, no rule evaluation) — it purely
 * answers "given this list of events and a playback position, which one is
 * active right now", exactly the way `ChallengeTimelineEditor.jsx`'s
 * `activeMoment` lookup already works for the legacy poll-moment model.
 *
 * Extracted so the SAME function can be reused by:
 *   - `UniversalChallengeEditor.jsx` (this task): live authoring preview.
 *   - The Feed-side rendering/voting UI (a later, separate task): deciding
 *     which event's UI to show a viewer at the current playback time.
 *
 * Deliberately has zero relationship to the legacy poll-moment engine
 * (`lib/challengeMechanics.js` et al.) — nothing here is imported by, or
 * imports from, those files.
 */

// Returns the event active at `currentTime`, or null if none (before the
// first event, after the last, in a gap between events, or no events at
// all). Mirrors the server's `effectiveVotingWindow`-less basic window
// check: [event.startTime, event.endTime).
export function resolveActiveEvent(events, currentTime) {
  if (!Array.isArray(events) || events.length === 0) return null
  const t = Number(currentTime)
  if (!Number.isFinite(t)) return null
  return events.find((e) => t >= Number(e.startTime) && t < Number(e.endTime)) || null
}

// Convenience: sorted copy of `events` by startTime — every consumer of
// this module wants events in chronological order (chain validation,
// timeline rendering, active-event lookup all assume it).
export function sortEventsByStart(events) {
  return [...(events || [])].sort((a, b) => Number(a.startTime) - Number(b.startTime))
}

export default { resolveActiveEvent, sortEventsByStart }
