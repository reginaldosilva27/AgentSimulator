# Tasks: Arena — provisioned LLM cost

> Ordered TDD checklist. Independent of 108–110.

## Tasks

- [x] **T1 — test first (AC1/AC2)**: failing tests — `llmCost` provisioned sum
  (replicas × size × rate, load-independent) + idle-fleet case (prov > 0, usage 0).
- [x] **T2 — implement**: constant in `components.ts` + `llmCost` in `model.ts`; make T1 pass.
- [x] **T3 — test first (AC4)**: failing break-even pin (~35% utilization).
- [x] **T4 — verify/adjust**: constants satisfy T3 (adjust comment math if needed).
- [x] **T5 — test first (AC3)**: failing `ArenaPage.test.tsx` — dual readout + hint.
- [x] **T6 — implement**: header rendering via `llmCost`; make T5 pass.
- [x] **T7 — i18n (AC5)**: en + pt keys; parity test.
- [x] **T8 — refactor**: remove the old inline usage sum; keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] All new user-facing text in en **and** pt
- [x] No protocol impact
- [x] `spec.md` status updated to `done`
