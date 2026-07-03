# Tasks: Harness ⇄ Loop lens

> TDD checklist, ordered. Each implementation task is preceded by the failing test that drives it.
> Frontend-only, pure projection — no backend, no protocol change.

## Tasks

- [x] **T1 — test (AC3)**: `harness.test.ts` — assert a `HARNESS_ROLE` map exists and is **total**
  over every `StationId` (fails: map doesn't exist yet).
- [x] **T2 — impl**: `lib/harness.ts` — `HarnessRole` union + total `HARNESS_ROLE` map +
  `roleLabelFor(lang)`. Make T1 pass.
- [x] **T3 — test (AC1, AC2)**: `lens.test.ts` — default `mode==="all"`; `setMode` persists to
  `localStorage` and re-reads identically; round-trips.
- [x] **T4 — impl**: `lib/lens.ts` — `useLens` store (localStorage `agentsim.lens`). Make T3 pass.
- [x] **T5 — test (AC5)**: `loop.test.ts` — `deriveLoopView(events, cursor)` returns
  `{ iterations, stopReason, failure }` for fixtures: (a) final-answer run, (b) max-iterations run,
  (c) `simulate_failure` run, (d) mid-flight run → honest "in progress".
- [x] **T6 — impl**: `lib/loop.ts` — `deriveLoopView`. Make T5 pass.
- [x] **T7 — test (AC7)**: `i18n/lens.test.ts` — every lens string key has both `en` and `pt`.
- [x] **T8 — impl (i18n)**: add all lens strings (labels, role vocab, legend, loop readouts) to
  `strings.ts` in **en + pt**. Make T7 pass.
- [x] **T9 — test (AC4, AC6)**: `lens.render.test.tsx` — harness mode shows a role badge per visible
  station; all/loop hide it; **all** mode has no badge/dim/readout (baseline); switching mode fires
  no fetch and leaves events/cursor + visible-station set unchanged.
- [x] **T10 — impl (lens UI)**: `LensToggle.tsx` (segmented control + legend) mounted in the header;
  `FlowCanvas`/`StationNode`/`FlowEdge` read the lens and apply badges / dim / loop-edge highlight /
  loop readout. Make T9 pass.
- [x] **T11 — test (AC8)**: legend "learn more" link targets resolve to existing 096 topic ids
  (parity assertion; may live in `lens.test.ts` or the Learn content parity test once 096 lands).
- [x] **T12 — impl**: wire the legend link to the 096 Learn topics. Make T11 pass.
- [x] **T13 — refactor**: tidy classes/props, confirm `computeLayout` untouched (no reflow), keep
  all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test.
- [x] `npm run build` passes (`tsc --noEmit` + build) — role map exhaustiveness enforced by types.
- [x] `npm test` (Vitest) green.
- [x] No backend diff; `schemas.py` ↔ `events.ts` untouched; no new `Stage`.
- [x] All new user-facing text exists in **en + pt** (constitution §4).
- [x] `all` lens renders byte-for-byte as the pre-095 baseline (AC1).
- [x] `spec.md` status updated to `done`.
