# Tasks: Arena — saturation honesty

> Ordered TDD checklist (red → green → refactor).

## Tasks

- [x] **T1 — test first (AC3)**: failing tests in `model.test.ts` — status critical at
  util ≥ 0.9, warning at 0.7–0.9, healthy below; bottleneck still only > 1.
- [x] **T2 — implement**: `CRITICAL_UTIL = 0.9` in `model.ts`; make T1 pass.
- [x] **T3 — test first (AC1/AC2)**: failing tests in `ArenaPage.test.tsx` — saturated
  design renders the notice + no latency figure; healthy design renders latency.
- [x] **T4 — implement**: total-shed sum + conditional header in `ArenaPage.tsx`; make T3 pass.
- [x] **T5 — test first (AC4)**: failing test — first-visit default sample shows the notice.
- [x] **T6 — implement/verify**: passes with the default `simple-rag` sample (no code
  change expected beyond T4 — pin it).
- [x] **T7 — i18n (AC5)**: add `saturatedHeader`/`saturatedHint` en + pt; i18n parity test.
- [x] **T8 — refactor**: sweep for any other renderer of the clamped figure; keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol impact (checked: no Stage/TraceEvent touched)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
