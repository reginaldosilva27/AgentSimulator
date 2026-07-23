# Tasks: 118-arena-backend-concurrency

TDD order — each implement task is driven by the failing test before it.

- [x] T1 (test, AC1/AC2) — `model.test.ts`: budget arithmetic (backend size×replicas, null elsewhere), pressure thresholds, null-held, worse-status merge → red
- [x] T2 (impl, AC1/AC2) — `CONCURRENCY_BUDGET_PER_UNIT` in `components.ts`; `concurrencyBudgetFor`/`concurrencyPressure`/`worseStatus` in `model.ts` → green
- [x] T3 (test, AC3) — `model.test.ts`: review-shaped fixture — QPS-healthy backend goes critical by connection pressure → red
- [x] T4 (impl, AC3) — (covered by T2 functions; fixture pins the composition) → green
- [x] T5 (test, AC4) — integration test: In-flight row + connection-wall banner on the node; ScalePanel `held / budget` → red
- [x] T6 (impl, AC4) — ArenaCanvas held map + status merge + node data; ArenaNode row/banner; ScalePanel line; `strings.ts` en+pt → green
- [x] T7 (test, AC5) — `examples.test.ts` walker: llm-healthy presets have backend pressure < 0.7 → red
- [x] T8 (impl, AC5) — retune preset backend containers per plan table → green
- [x] T9 (verify) — `npm test`, `npm run build`, i18n audit, spec status → done
