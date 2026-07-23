# Tasks: Arena — AI Gateway + fleet example + selection state

> TDD (red → green). Frontend-only. Run tests from `frontend/`.

- [x] **T1 — test**: `arena/components.test.ts` — AC1/AC2: `splitsLoad(aiGateway)` true;
  a gateway → N LLMs splits offered load ≈1/N (aggregate ≈ N×per-node) via `computeMetrics`.
- [x] **T2 — impl**: `components.ts` — add `aiGateway` to `ArenaKind`, `BENCHMARKS`,
  `KIND_META` (bilingual + clouds), `PALETTE_ORDER`; `splitsLoad` true for it.
- [x] **T3 — test**: `arena/examples.test.ts` — AC3: `llm-fleet` LLM not `critical` at its
  offered load (≥10000); AC5: bilingual title/description.
- [x] **T4 — impl**: `examples.ts` — add the `llm-fleet` preset (tuned to pass T3).
- [x] **T5 — test**: `arena/store.test.ts` — AC4: `loadExample(id)` sets `exampleId`; a
  structural edit (addNode/connect/setReplicas/clear) resets it to null.
- [x] **T6 — impl**: `store.ts` — `exampleId` state + `loadExample`; clear in structural
  mutations.
- [x] **T7 — impl**: `ArenaPage.tsx` — bind `<select value={exampleId ?? ""}>` +
  `onChange` → `loadExample`.
- [x] **T8 — verify**: full `vitest run` + `tsc`/`vite build` green from `frontend/`.

## Definition of done

- [x] AC1–AC5 each map to a passing test
- [x] `vitest run` green · `tsc --noEmit` + `vite build` clean (run from `frontend/`)
- [x] No protocol change; no new `Stage`
- [x] All new user-facing text en **and** pt
- [x] `spec.md` status → `done`
