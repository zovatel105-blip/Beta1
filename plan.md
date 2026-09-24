# Plan — Universal Challenge Engine (Advanced Mode) + TikTok-style Editor UI (pixel-parity)

## Estado de entrega — Usuario pidió guardar y resumir
Implementación guardada. Revisión directa parcial, SIN testing agent por petición expresa reiterada. JSX compilado y modales inspeccionados visualmente. Añadir participante, predicción numérica, cierre X/Done y retorno de foco a Participants/Prediction comprobados. No se completaron guardar/reabrir, Result con datos, Escape tras selector, backdrop ni build de producción. Resto de QA suspendido a petición del usuario; no marcarlo como aprobado.


## 0) Scope & guardrails (unchanged)
- **Do not invent new mechanics** beyond the approved Universal Challenge Engine surface.
- **Audit first, build only what’s missing** (presentation/UX only).
- **Regression safety**: do not break option-based `PREDICTION`, team-vs-team prediction, or any non-prediction rules.
- **No Testing Agent**: verification via code review + minimal scripts (only if needed) + **manual visual QA** (screenshots).
- **Credit discipline**: avoid unnecessary runs/loops; validate only what changed.
- **UI hard requirement**: editor matches the provided TikTok-style reference in layout (monochrome, single persistent screen).
- **No Simple Mode**: Advanced wizard is the only visible authoring path.
- **Rules & Result are global** (Challenge-level `resultConfig`), not per Moment.
- **Keep English UI copy** unless explicitly requested.
- **Do not change** the desktop/mobile gate in `app/page.js`.

---

## 1) Objectives

### 1.1 Primary objectives (updated)
1) **Numeric Prediction stays correct end-to-end** (backend + runtime UI already implemented).
2) **Deliver the TikTok-style single-screen Challenge editor** (shell already implemented + user-approved):
   - Video preview always visible (portrait frame).
   - Timeline with fixed playhead + moment blocks.
   - Bottom tool tiles row.
3) **Current active requirement (clarified by user)**: all tools open as **real bottom modals** and are **perfectly understandable**:
   - Moments, Prediction, Participants, Rules, Result open as bottom-sheet modals in the same dark/monochrome style.
   - Tool icons must represent each tool (semantic Lucide icons).
   - Modal content must be **well-structured**, with clear sections, labels, helper text, and progressive disclosure.
   - **Rules** and **Result** must be separate tool views while editing the same global `resultConfig`.

### 1.2 Secondary objectives (updated)
- Preserve existing data contract in `UploadDialog.jsx` (`draft.entities/groups/events/resultConfig`).
- Keep engine logic unchanged; all changes are UI/authoring presentation.
- Keep video mounted/visible behind the modal.
- Minimal verification: modal open/close + save/reopen + screenshot set.
- **Phase 1 POC explicitly skipped**: presentation-only, no new integrations.

---

## 2) Current status (updated)

### 2.1 Completed

#### Backend — Numeric Prediction lifecycle (Done)
Fixed and validated via real HTTP E2E:
- `lib/universalChallengeStore.js::normalizeEvent` allows numeric prediction without participants/options.
- `lib/challengeStateEngine.js` bypass so numeric predictions progress.
- `lib/challengeRuleEngine.js::resolveEvent` bypass so numeric prediction resolves and computes distance.

Verification:
- `scripts/test_numeric_prediction_e2e.mjs`: **17/17** passing (includes regression check for classic option prediction).

#### Frontend — Numeric Prediction runtime UI (Done)
- Overlay + moment view for numeric prediction input/reveal implemented.

#### Frontend — TikTok-style editor shell (Done, user-approved)
- `components/UniversalChallengeAdvancedWizard.jsx`:
  - Centered portrait video, monochrome canvas.
  - Transport row (play, timecode, undo/redo).
  - Timeline + tool tiles.

#### Frontend — Tool modals implemented + interiors redesigned (Phase 2 implementation DONE)
Implemented and compiles:
- Tool panels open as **Shadcn Drawer** (Vaul): backdrop, handle, pinned header/footer.
- Semantic icon mapping applied:
  - Moments → `Scissors`
  - Prediction → `Hash`
  - Participants → `Users`
  - Rules → `ListChecks`
  - Result → `Trophy`
- **New**: `components/ChallengeToolPanels.jsx` created to provide structured, readable modal interiors:
  - Participants: format cards + stepper + list + assignment.
  - Moments: scannable list rows + CTA.
  - Moment editor: accordion-based rule picker + clearer sections; advanced settings under accordion.
  - Prediction: numeric field emphasis + helper text.
  - Rules vs Result: now truly separate views sharing `resultConfig` (fixes previous “view ignored” issue).
- **UX improvements**:
  - Sticky footer “Done” kept.
  - Header adds **Back to Moments** from moment editor.
  - Video pauses when sheet opens (playhead preserved).
  - Click-capture focus tracking for better focus restoration.
- JSX syntax verified via Next’s SWC transform (compile check).

#### Dev/Preview environment restored (Done)
- Ran `yarn install` and recreated minimal `.env` using documented Mongo settings.
- Added a **separate** supervisor program config file for Next.js (`/app/nextjs.supervisor.conf`), without editing the platform’s read-only supervisor template.
- Preview responds **HTTP 200**.

### 2.2 In progress / pending

#### P0 — Focused verification + bugfix pass (IN PROGRESS)
Still required (do not claim complete until verified manually):
- Validate every tool modal on a real mobile viewport:
  - Open/close behavior (backdrop tap, swipe-down, ESC on desktop).
  - Focus restoration to the triggering tile.
  - No overflow / clipped controls (especially selects + long labels).
- Validate Rules/Result persistence and finish validation routing:
  - Missing `tieBreakWinnerId` should route user to **Rules**.
- Confirm save/reopen preserves:
  - entities/groups/events/resultConfig.
- Capture the required screenshot set.

#### P1 — Documentation update (Pending)
- Update `/app/memory/PRD.md` with the final modal UX + verification notes.

### 2.3 Not in scope / intentionally not done
- No new challenge mechanics.
- No new routes/screens.
- Do not delete `UniversalChallengeEditor.jsx` (still used for shared exports like `AdvancedRuleConfigFields`).
- Do not change `ChallengeTimelineEditor.jsx` (legacy editor).
- Do not change the mobile gate in `app/page.js`.
- Do not seed demo content for verification (Mongo may be empty).

---

## 3) Implementation steps (revised)

### 3.1 Backend: Numeric Prediction allowlist + lifecycle
**Status: Done**
- [x] normalizeEvent bypass
- [x] state engine progression bypass
- [x] resolveEvent bypass

### 3.2 Frontend: TikTok-style editor shell (pixel-parity)
**Status: Done (approved by user)**
- [x] Video stage + transport row + timeline + tool tiles
- [x] Local filmstrip thumbnails
- [x] Undo/redo history for authoring
- [x] Draft reset on open

### 3.3 Frontend: Bottom modal framework (Drawer) + semantic icons
**Status: Done**
- [x] Shadcn Drawer wired (`components/ui/drawer.jsx`)
- [x] Backdrop + handle + pinned header/footer
- [x] Semantic icons applied for all 5 tools
- [x] Modal header/footer improvements (close/back behavior)

### 3.4 Phase 2 — Modal interior redesign (“perfectly understandable”)
**Status: Implemented (pending verification)**
- [x] Created `components/ChallengeToolPanels.jsx` and refactored `UniversalChallengeAdvancedWizard.jsx` to use it.
- [x] Implemented progressive disclosure:
  - Rule picker in accordion, advanced rule settings in accordion.
  - Team-vs-team config nested behind an accordion.
- [x] Separate Rules and Result views sharing the same global `resultConfig`.
- [x] Opaque-dark, readable styling additions in `components/ChallengeEditor.module.css`.

### 3.5 Dev environment enabling for UI verification
**Status: Done**
- [x] `yarn install`
- [x] Minimal `.env` with documented mongo URL + DB name
- [x] Added standalone supervisor entry to start Next.js from `/app`

### 3.6 Data-testid coverage (required)
**Status: Mostly done; verify + fill gaps during QA**
- [ ] Confirm these exist and are stable:
  - `tool-modal-root`, `tool-modal-title`, `tool-modal-description`, `sheet-close-button` + `tool-modal-close-button`, `tool-modal-done`
  - `tool-modal-moments`, `tool-modal-prediction`, `tool-modal-participants`, `tool-modal-rules`, `tool-modal-result`
  - `tool-tile-*`, `numeric-prediction-input`
  - Back-to-moments: `modal-back-to-moments`
- [ ] Add any missing IDs discovered during QA (only where needed).

### 3.7 Verification & regression (minimal / credit-conscious)
**Status: In progress (UI-only)**
- Backend scripts: **do not rerun** (unless backend code changes).
- Manual verification (mobile viewport):
  - [ ] Video remains mounted/visible behind sheet.
  - [ ] Each tool modal: close button visible, backdrop tap closes, swipe closes, ESC closes.
  - [ ] Focus returns to tile after close.
  - [ ] Rules and Result are distinct views and persist correctly.
  - [ ] Save persists; reopen shows same draft.
- [ ] Screenshot set (mobile viewport/UA):
  1) Editor base (video + timeline + tools).
  2) Moments modal.
  3) Prediction modal with numeric input visible (`numeric-prediction-input`).
  4) Participants modal.
  5) Rules modal.
  6) Result modal.

---

## 4) Manual QA checklist (updated)

### 4.1 Editor UI pixel-parity (creator side)
- Shell matches reference layout (monochrome).
- Timeline scroll and fixed playhead work.
- Tool tiles show semantic icons.

### 4.2 Tool modals
For each tool tile (Moments/Prediction/Participants/Rules/Result):
1) Opens as bottom modal with dim backdrop.
2) Video remains visible behind.
3) Close button always visible.
4) Tap outside closes.
5) Swipe down closes.
6) Modal height ~62–72dvh (not full-screen by default).
7) Content is clearly sectioned and understandable.

### 4.3 Numeric Prediction (authoring)
- Prediction tool:
  - Numeric mode usable.
  - Correct value field present.
  - Irrelevant fields hidden in numeric mode.

### 4.4 Rules & Result global
- Rules and Result edit the same global `resultConfig`.
- Rules modal contains rule inputs only.
- Result modal contains result explanation/preview only (no fake ranking/scores).
- Saved challenge includes `resultConfig` at the challenge level.

---

## 5) Deliverables (updated)

### Done
- Numeric Prediction backend fixes + E2E script.
- Numeric Prediction runtime UI.
- TikTok-style editor shell implemented and approved by user.
- Tool panels are true bottom sheets with semantic icons.
- Modal interior redesign implemented via `ChallengeToolPanels.jsx`.
- Preview environment restored (Next runs from `/app` with minimal `.env`).

### Pending
- Focused manual verification and any resulting small UI fixes.
- Screenshot set after verification.
- `/app/memory/PRD.md` update documenting final state + verification notes.

---

## 6) Next steps (updated)
1) Run focused manual QA on mobile viewport and fix any UX/overflow/focus issues found (P0).
2) Confirm Rules/Result persistence + validation routing (tie-break winner) (P0).
3) Capture the agreed screenshot set (P0/P1).
4) Update `/app/memory/PRD.md` with final behavior + screenshots/notes (P1).
