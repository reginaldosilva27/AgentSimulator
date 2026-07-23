# Tasks: Arena — realism pack

> TDD (red → green). Run from `frontend/` (npx from the repo root grabs the wrong vitest).

- [x] **T1 — test**: `model.test.ts` — AC2 callsPerRequest fan-out; AC3 client-only
  sources (+orphan 0, rootless fallback); AC4 shedRps; AC5 endToEndLatencyMs chain sum.
- [x] **T2 — impl**: `model.ts` — the three mechanics + the e2e helper.
- [x] **T3 — test**: `store.test.ts` — AC1 users/think → offeredLoad + migration;
  setCallsPerRequest.
- [x] **T4 — impl**: `store.ts` — state, actions, migration.
- [x] **T5 — test**: `examples.test.ts` — AC7 (fleet users≥100k, rps≤2000, LLM not
  critical; rag-cache has no cdn; agent-tools preset exercises mcp+calls).
- [x] **T6 — impl**: `examples.ts` — retuned presets + agent-tools; `components.ts` —
  queue honesty, cost constant, CALLS_CONFIGURABLE.
- [x] **T7 — impl**: UI — ArenaNode shed readout; ScalePanel calls stepper; ArenaPage
  users slider + think select + rps/e2e/cost readouts; strings en+pt (AC6, AC8).
- [x] **T8 — verify**: full vitest + tsc + vite build green from `frontend/`.

## Definition of done

- [x] AC1–AC8 map to passing tests · suite green · build clean
- [x] No protocol change · all new text en + pt
- [x] `spec.md` → done
