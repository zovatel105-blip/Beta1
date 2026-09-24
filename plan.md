# Plan — Universal Challenge Engine (Advanced Mode) + TikTok-style Editor UI (pixel-parity)

## 0) Scope & guardrails (unchanged)
- **Do not invent new mechanics** beyond the approved Advanced-Mode extensions.
- **Audit first, build only what’s missing**.
- **Regression safety**: do not break existing option-based `PREDICTION` and other vote-shaped moments.
- **No Testing Agent**: verification via code review + direct scripts (when needed) + **manual visual QA** (screenshots).
- **Credit discipline**: avoid unnecessary runs/loops; only validate what changed.
- **UI hard requirement**: editor matches the provided TikTok-style reference in layout (monochrome, single persistent screen).
- **No Simple Mode**: Advanced is the only visible authoring path.
- **Rules & Result are global** (Challenge-level `resultConfig`), not per Moment.

---

## 1) Objectives

### 1.1 Primary objectives (updated)
1) **Numeric Prediction stays correct end-to-end** (already implemented in backend + runtime UI).
2) **Deliver the TikTok-style single-screen Challenge editor** (already implemented shell approved by user):
   - Video preview always visible (portrait frame).
   - Timeline with fixed playhead and moment blocks.
   - Bottom tool tiles row.
3) **Current active requirement (new)**: tools must open as **real bottom modals**:
   - Backdrop dims editor but **video remains visible behind**.
   - Clear close affordance and improved modal interior layout.
   - Tool icons represent their function (semantic Lucide icons).
   - Rules and Result can be separate tool views but still edit the same global `resultConfig`.

### 1.2 Secondary objectives (updated)
- Preserve existing data contract in `UploadDialog.jsx` (`draft.entities/groups/events/resultConfig`).
- Keep existing engine logic unchanged.
- Minimal verification: only modal flows + save/reopen + a few screenshots.

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
- Overlay + Moment view for numeric prediction input/reveal implemented.

#### Frontend — TikTok-style editor shell (Done, user-approved)
Implemented and compiles:
- `components/UniversalChallengeAdvancedWizard.jsx` now renders:
  - Centered portrait video, monochrome canvas.
  - Transport row (play, timecode, undo/redo).
  - Horizontal timeline with fixed center playhead.
  - Bottom tool tiles.
- Timeline filmstrip generation is local (no paid APIs).
- Draft undo/redo added (authoring-only history).
- Draft init/reopen stabilization (reset on open when file/draft changes).

**User feedback**: “Me gusta” (shell approved).

### 2.2 In progress / pending

#### P0 — Tool panels must be true bottom modals (IN PROGRESS)
Current implementation uses an internal overlay `section` inside the editor, but user now requires:
- Real modal behavior (focus trap, dismiss on backdrop, swipe-down on mobile).
- Improved modal interior hierarchy.
- Semantic icons per tool.

#### P1 — Visual verification (Pending)
- Previous visual verification was paused; we must capture updated screenshots after converting to modals.

### 2.3 Not in scope / intentionally not done
- No new challenge mechanics.
- No new routes/screens.
- Do not delete `UniversalChallengeEditor.jsx` (still exports `AdvancedRuleConfigFields`, `Chip`, `Toggle`).
- Do not change the mobile gate in `app/page.js`.

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

### 3.3 Frontend: Convert tools into real bottom modals (P0)
**Status: In progress (next work)**
Implement according to `/app/design_guidelines.md` → `tool_modals_addendum`.

#### 3.3.1 Modal framework
- [ ] Replace `styles.sheet` overlay with **Shadcn Drawer** (`components/ui/drawer.jsx`) for tool panels:
  - Backdrop dim (video visible behind).
  - Focus trap + ESC closes.
  - Tap outside closes.
  - Swipe-down to dismiss.
  - Height: **62–72dvh**, not full-screen.
  - z-index > 71 (editor).
  - Safe-area padding bottom.
- [ ] Fallback to `Dialog` only if Drawer is incompatible (expected not needed).

#### 3.3.2 Modal interior redesign (no new features)
- [ ] Add consistent modal header:
  - [icon] + Title (left)
  - Close (X) (right)
  - Handle pill at top.
- [ ] Use 1–2 clear sections inside each tool; keep English copy.
- [ ] Ensure modal content scrolls; header stays pinned.

#### 3.3.3 Tool icon semantics + mapping
Update tool tile icons to represent the tool:
- [ ] Moments → `Scissors`
- [ ] Prediction → `Hash`
- [ ] Participants → `Users`
- [ ] Rules → `ListChecks`
- [ ] Result → `Trophy`

#### 3.3.4 Rules vs Result tool behavior (global)
- [ ] Keep **one** `resultConfig` source of truth.
- [ ] Allow “Rules” and “Result” to open different *views* of the same config (same Drawer component, different content sections), without adding new logic.

#### 3.3.5 Data-testid coverage (required)
- [ ] Add/confirm stable test IDs:
  - `tool-modal-root`, `tool-modal-title`, `tool-modal-close-button`
  - `tool-modal-moments`, `tool-modal-prediction`, `tool-modal-participants`, `tool-modal-rules`, `tool-modal-result`
  - Preserve existing: `tool-tile-*`, `timeline-*`, `numeric-prediction-input`

### 3.4 Frontend: Numeric Prediction authoring UX inside modals (P1)
**Status: Mostly done; confirm after modal conversion**
- [ ] Ensure Prediction modal opens directly to numeric prediction moment (create if missing).
- [ ] Ensure numeric mode hides participants/options/team controls.
- [ ] Keep existing validation rules unchanged.

### 3.5 Verification & regression (minimal / credit-conscious)
**Status: Pending (UI only)**
- Backend scripts: **do not rerun** (unless backend code changes).
- Frontend verification (after modal conversion):
  - [ ] Screenshot set (mobile viewport/UA):
    1) Editor base (video + timeline + tools).
    2) Open Moments modal.
    3) Open Prediction modal showing numeric input (`numeric-prediction-input`).
    4) Open Rules modal.
    5) Open Result modal.
  - [ ] Quick manual checks:
    - Tap outside closes.
    - ESC closes (desktop keyboard).
    - Tool opens restore focus to triggering tile.
    - Save (top-right) persists draft; reopen shows the same.

---

## 4) Manual QA checklist (updated)

### 4.1 Editor UI pixel-parity (creator side)
- Shell matches reference layout (monochrome).
- Timeline scroll and fixed playhead work.
- Tool tiles show semantic icons.

### 4.2 Tool modals (new)
For each tool tile:
1) Opens as bottom modal with dim backdrop.
2) Video remains visible behind.
3) Close button always visible.
4) Tap outside closes.
5) Modal height ~62–72dvh, not full-screen.

### 4.3 Numeric Prediction (authoring)
- Prediction modal:
  - Numeric mode selectable.
  - Correct value field present.
  - Irrelevant fields hidden.

### 4.4 Rules & Result global
- Rules and Result both edit the same global `resultConfig`.
- Saved challenge includes `resultConfig` at the Challenge level.

---

## 5) Deliverables (updated)

### Done
- Numeric Prediction backend fixes + E2E script.
- Numeric Prediction runtime UI.
- TikTok-style editor shell implemented and approved by user.

### Pending
- Tool panels converted to real bottom modals (Drawer) with semantic icons.
- Visual verification screenshots after modal change.
- PRD update documenting the modal UX + verification results.

---

## 6) Next steps (updated)
1) Convert tool panels to Shadcn **Drawer** modals + backdrop + improved header/interior (P0).
2) Swap tool icons to semantic mapping (P0).
3) Confirm numeric prediction authoring flow inside the Prediction modal (P1).
4) Capture minimal screenshot set and verify save/reopen (P1).
5) Update `/app/memory/PRD.md` with final state and verification notes.
