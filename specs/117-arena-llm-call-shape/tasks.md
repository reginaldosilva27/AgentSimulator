# Tasks: 117-arena-llm-call-shape

TDD order — each implement task is driven by the failing test before it.

- [x] T1 (test, AC1–AC3) — `components.test.ts`: default-shape parity with `BENCHMARKS.llm`, capacity ∝ 1/tokens, latency linear in in/out, cost + quota formulas → red
- [x] T2 (impl, AC1–AC3) — `CallShape` + constants + derived functions in `components.ts` → green
- [x] T3 (test, AC4) — `model.test.ts`: no-shape vs explicit-default parity; heavy shape squeezes llm capacity/latency/cost/quota → red
- [x] T4 (impl, AC4) — thread `design.callShape` through `model.ts` (capacity, latency, quota, cost) → green
- [x] T5 (test, AC5) — `store.test.ts`: round-trip, validation, clamp, `exampleId` cleared, `loadExample` resets → red
- [x] T6 (impl, AC5) — `callShape` in the store + `setCallShape` + load/reset paths → green
- [x] T7 (test, AC6) — `ArenaPage.test.tsx`: Payload control renders shape, panel edits update readout/store → red
- [x] T8 (impl, AC6) — Payload popover in `ArenaPage.tsx` + `strings.ts` en+pt → green
- [x] T9 (verify) — `npm test`, `npm run build`, i18n audit, spec status → done
