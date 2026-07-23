# Tasks: Arena — closed-loop equilibrium

> Ordered TDD checklist. Depends on 108 + 109 being done.

## Tasks

- [x] **T1 — test first (AC1)**: failing `model.test.ts` — fixed-point residual ≤ 1 rps,
  deterministic across two calls.
- [x] **T2 — test first (AC2)**: failing pin — audit design equilibrium bands
  (rps [4700, 5200], util [0.78, 0.88], shed 0).
- [x] **T3 — implement**: `equilibriumRps` in `model.ts`; make T1–T2 pass.
- [x] **T4 — test first (AC3)**: failing invariant test `rps × e2eSec ≤ users` over a
  matrix (healthy / near-sat / over-sat designs).
- [x] **T5 — test first (AC7)**: failing `store.test.ts` — hydration + every mutation
  (users, think, add/remove node, connect, scale) recomputes `offeredLoad` via
  equilibrium.
- [x] **T6 — implement**: store derivation; make T4–T5 pass.
- [x] **T7 — test first (AC4/AC5)**: failing `ArenaPage.test.tsx` — dual readout >5% gap,
  single figure otherwise; tiny-fleet shed + saturation notice.
- [x] **T8 — implement**: header dual readout + hint; make T7 pass.
- [x] **T9 — re-pin (AC6)**: recompute all presets; update `examples.test.ts` pins and
  preset descriptions (en + pt) wherever cited numbers changed.
- [x] **T10 — refactor**: keep green; confirm `computeMetrics`/`endToEndLatencyMs`
  signatures untouched.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] All new/changed user-facing text in en **and** pt
- [x] No protocol impact
- [x] `spec.md` status updated to `done`
