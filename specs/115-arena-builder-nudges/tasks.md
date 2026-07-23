# Tasks: Arena — builder nudges

> Ordered TDD checklist. Runs after 110 + 114 (calibration pins final numbers).

## Tasks

- [x] **T1 — test first (AC1/AC2)**: failing tests — `fanoutNudges` emits for
  backend→llm and aigw→llm at fan-out 1, targets the right node, silent when cpr ≥ 2,
  zero nudges across all presets.
- [x] **T2 — implement**: pure helper; make T1 pass.
- [x] **T3 — test first (AC1 apply/dismiss)**: failing `store.test.ts` — apply sets
  cpr=2; dismiss persists per node; edge removal clears dismissal; old blobs hydrate.
- [x] **T4 — implement**: store flag + actions + chip UI in `ArenaCanvas.tsx`; make T3
  pass (+ integration test for the chip).
- [x] **T5 — test first (AC3/AC4)**: failing — think-time hint present; ceiling hint
  only at max replicas.
- [x] **T6 — implement**: hints; make T5 pass.
- [x] **T7 — test first (AC5)**: add `claims` metadata to examples; failing
  truthfulness walk in `examples.test.ts`.
- [x] **T8 — implement**: fix any stale preset copy (en + pt); make T7 pass.
- [x] **T9 — i18n (AC6)**: parity en/pt.
- [x] **T10 — refactor**: keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] All new user-facing text in en **and** pt
- [x] No protocol impact
- [x] `spec.md` status updated to `done`
