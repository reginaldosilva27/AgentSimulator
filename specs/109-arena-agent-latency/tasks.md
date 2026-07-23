# Tasks: Arena — agent-turn latency

> Ordered TDD checklist (red → green → refactor). Depends on 108 being done.

## Tasks

- [x] **T1 — test first (AC1)**: failing `model.test.ts` pins — chain e2e with cpr 1/2/3.
- [x] **T2 — test first (AC2/AC3)**: failing pins — gateway-cpr branch multiply;
  backend-sum vs router-max.
- [x] **T3 — implement**: rewrite `endToEndLatencyMs` as recursive turn-path eval; make
  T1–T2 pass without touching `computeMetrics` (existing metric tests stay green).
- [x] **T4 — re-pin (AC4)**: update `examples.test.ts` e2e expectations; verify each
  preset description still tells the truth (adjust copy en+pt if any cites latency).
- [x] **T5 — i18n (AC5)**: update `e2eHint` en + pt; parity test.
- [x] **T6 — refactor**: extract/export the per-node path-latency helper for 113; keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] `computeMetrics` behavior unchanged (throughput/shed/status tests untouched)
- [x] All new/changed user-facing text in en **and** pt
- [x] `spec.md` status updated to `done`
