# Plan — Universal Challenge Engine (Advanced Mode gap-fill)

## 0) Scope & guardrails (unchanged)
- **Do not invent new mechanics** beyond the 3 approved Advanced-Mode extensions from the audit.
- **Audit first, build only what’s missing**.
- **Regression safety**: do not break existing option-based `PREDICTION` and other vote-shaped moments.
- **No Testing Agent**: verification must be done via code review + direct API/script verification + manual phone QA.

---

## 1) Objectives
### 1.1 Primary objective
Deliver the **3rd approved Advanced-Mode extension: Numeric Prediction** end-to-end:
- Viewers **enter a number** (not pick an option)
- Creator can **reveal the real number** later (`correctValue`)
- System reports viewer’s **distance** from the revealed value
- **No leaderboard / no winner ranking** (out of scope)

### 1.2 Secondary objectives
- Keep the rest of Universal Challenge Engine stable and backward-compatible.
- Provide a reproducible way to verify the feature without additional tooling.

---

## 2) Current status (updated)
### 2.1 Completed
**Numeric Prediction is now fully complete end-to-end.**

#### Backend
Although previously reported “backend complete,” **3 hidden gaps** were found via a **real HTTP E2E script** and fixed with the **minimal bypass pattern** already used for “options-only prediction”:
1) **Creation validation gap** — `lib/universalChallengeStore.js::normalizeEvent`
   - Previously rejected numeric prediction events with **no `participantIds` and no `options`** (`no_participants_for_event`).
   - Fix: add `numericPredictionAllowed` bypass.

2) **State progression gap** — `lib/challengeStateEngine.js`
   - `hasFullParticipants` gate kept numeric prediction events **stuck in `pending` forever**, preventing active/closed/resolved.
   - Fix: add `isNumericPrediction` bypass.

3) **Resolution guard gap** — `lib/challengeRuleEngine.js::resolveEvent`
   - Guard short-circuited to `emptyVerdict` when `participantIds.length===0`, so numeric prediction never reached `prediction()` numeric branch.
   - Fix: add `numericPrediction` bypass.

Verification:
- Added/ran **real end-to-end HTTP test script**: `scripts/test_numeric_prediction_e2e.mjs`
  - **17/17 checks passing**, including regression check that classic option-based prediction is unaffected.

#### Frontend
Implemented numeric prediction UI end-to-end:
- `components/UniversalChallengeMomentViews.jsx`
  - Added `NumericPredictionMomentView` (numeric input + reveal view).
- `components/UniversalChallengeMomentOverlay.jsx`
  - Added `isNumericPrediction` dispatch branch (before generic `family === 'vote'`), reads `myGuess` from `event.inputs` and `distance` from `result.details.guesses`.
- `components/UniversalChallengeEditor.jsx` (Advanced Mode)
  - Added `predictionType` selector (`option` | `numeric`).
  - Added `correctValue` input for numeric reveal.
  - Hid irrelevant fields for numeric mode (`outcomeMode`, `correctOptionId`, tie-break fields).
  - Updated timeline preview to render numeric prediction overlay.
  - Updated save validation (`finishAdvanced`) to allow numeric prediction events with no options/participants.

#### QA/demo data
- Added demo seeding script for manual phone verification:
  - `scripts/seed-numeric-prediction-post.mjs`
  - Creates `postId: seed_numeric_prediction_post` with one numeric prediction event (0–8s, `correctValue=80`).

#### Infra restored (recurring)
- `.env`, `node_modules`, supervisor `nextjs` program restored again during this session.
- Changes documented in `memory/PRD.md`.

### 2.2 Not in scope / intentionally not done
- No “closest guesses leaderboard,” no ranking across viewers.
- No Simple Mode numeric prediction authoring (extension was approved as **Advanced Mode gap-fill only**).
- No Testing Agent usage.

---

## 3) Implementation steps (revised to reflect completion)
### 3.1 Backend: Numeric Prediction allowlist + lifecycle
**Status: Done**
- [x] `lib/universalChallengeStore.js` — allow numeric prediction events with no participants/options (`numericPredictionAllowed`).
- [x] `lib/challengeStateEngine.js` — allow event progression without participants/options (`isNumericPrediction`).
- [x] `lib/challengeRuleEngine.js` — allow resolution without participants/options (`numericPrediction`).

### 3.2 Frontend: Feed overlay + Advanced Mode editor
**Status: Done**
- [x] Add `NumericPredictionMomentView` (input + reveal state).
- [x] Overlay: route numeric prediction to this view and wire `castInput({value})`.
- [x] Advanced Mode editor:
  - [x] `predictionType` selector
  - [x] `correctValue` input
  - [x] Hide option/tie-break fields when numeric
  - [x] Preview rendering
  - [x] Save validation adjustments

### 3.3 Verification & regression
**Status: Done (script), Pending (manual phone UI)**
- [x] Automated verification via `scripts/test_numeric_prediction_e2e.mjs` (17/17).
- [x] Regression check included for classic option-based prediction.
- [ ] Manual phone UI verification (user): open seeded demo post and confirm:
  - Numeric input appears during 0–8s
  - Guess submits and can update before close
  - After close, reveal shows `Actual: 80` and `off by X`

---

## 4) Manual QA checklist (for user on phone)
Use seeded post:
- Ensure `scripts/seed-numeric-prediction-post.mjs` has been run.
- On phone, open feed and locate post: **“Numeric Prediction demo (QA seed)”** (postId `seed_numeric_prediction_post`).

Checklist:
1) During 0–8s, numeric input is visible and accepts a number.
2) Submitting stores your guess; updating overwrites (upsert) before close.
3) After 8s, input is closed; reveal display shows:
   - Actual value (80)
   - Your guess + distance
4) Ensure no UI overlap issues; overlay stays compact and tappable.

---

## 5) Deliverables
**All completed / delivered:**
- Backend bypass fixes in 3 modules (creation validation, state progression, resolution guard).
- Frontend numeric prediction view + overlay wiring.
- Advanced Mode editor support (authoring + preview + validation).
- Reproducible HTTP E2E verification script.
- Demo seed post script for manual phone QA.
- PRD/memory updated with root-cause + fixes + verification notes.

---

## 6) Next steps (updated)
1) **User manual verification on phone** using the seeded demo post.
2) If any UI/UX issues are found (spacing, keyboard behavior, accessibility), make **small additive UI adjustments only**.
3) Once confirmed, optionally remove/flag demo seed script usage instructions (keep script if desired for future QA).
