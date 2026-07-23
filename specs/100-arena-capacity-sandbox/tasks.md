# Tasks: Arena — capacity sandbox

> TDD checklist. Each implement task is preceded by the failing test that drives it
> (red → green → refactor). Frontend-only; run `npm test` + `npm run build` in `frontend/`.

## The capacity model (pure, no DOM) — do this first

- [x] **T1 — test**: `arena/model.test.ts` — AC1 single node `throughput = min(L,C)`,
  `util = min(1, L/C)` shape, `critical` + bottleneck flag when `L > C`. (red)
- [x] **T2 — impl**: `arena/model.ts` — types (`ArenaKind`, `ArenaNodeSpec`, `ArenaEdge`,
  `ArenaDesign`, `NodeMetrics`) + `computeMetrics` capacity/util/status for one node. (green)
- [x] **T3 — test**: AC2 — `A→B→C`, saturated B caps the load arriving at C (no phantom
  over-capacity). (red)
- [x] **T4 — impl**: Kahn topo sort + downstream collapse (`throughput = min(arriving, C)`
  flows on). Cycle → `unreachable`. (green)
- [x] **T5 — test**: AC3 — LB splits `1/N` across children; non-LB fans out full load to
  each child. (red)
- [x] **T6 — impl**: per-kind edge-share rule (LB split vs. default fan-out). (green)
- [x] **T7 — test**: AC4 horizontal (replicas k → capacity ≈ k·C, clears critical) +
  AC5 vertical (size multiplier raises C). (red)
- [x] **T8 — impl**: `capacity = baseCapacity × sizeMultiplier × replicas`. (green)
- [x] **T9 — test**: AC6 — inserting a cache (hit-ratio h) forwards only `(1−h)` to the DB,
  lowering DB QPS/util. (red)
- [x] **T10 — impl**: cache hit-ratio pass-through in propagation. (green)
- [x] **T11 — test**: AC7 — latency monotonic in util, rises toward the cap near util→1. (red)
- [x] **T12 — impl**: queueing latency `baseLatency / (1 − min(util, 0.99))`. (green)

## Catalog + store

- [x] **T13 — impl**: `arena/components.ts` — kind catalog: benchmarks (`baseCapacity`,
  `baseLatencyMs`) with a cited-assumptions comment, bilingual label/description, reused
  cloud names. Agentic (`client, backend, llm, vectorDb, mcp, appDb`) + primitives
  (`cache, queue, loadBalancer, readReplica, cdn, apiGateway`).
- [x] **T14 — test**: `arena/store.test.ts` — AC9 add/connect/scale then persist → new store
  hydrates the same design from `localStorage` (`agentsim.arena`). (red)
- [x] **T15 — impl**: `arena/store.ts` — `useArena` Zustand store + localStorage persistence.
  (green)

## Page + canvas (UI projection)

- [x] **T16 — impl**: `lib/page.ts` union — add `"arena"` to `Page`; `App.tsx` Arena
  button beside Learn + render `<ArenaPage/>` when active.
- [x] **T17 — impl**: `ArenaPage.tsx` (layout: palette + canvas + load control + honesty
  banner), `Palette.tsx`, `ArenaCanvas.tsx` (React Flow drag-drop + connect), `ArenaNode.tsx`
  (live QPS/latency/util%/status + scaling controls + bottleneck treatment). Independent
  React Flow instance — must NOT import `lib/layout.ts` or `useSimulator`.
- [x] **T18 — test**: `arena/ArenaPage.test.tsx` — AC8 (Arena button mounts ArenaPage;
  Simulator not mounted/altered), AC10 (honesty banner text present). (red → green with T16/T17)

## Cross-cutting gates

- [x] **T19 — i18n**: add the `arena` section to `Strings` + fill `en` and `pt` in
  `strings.ts`; AC11 test in `arena/i18n.test.ts` asserts every `arena.*` key + `KIND_META` label resolves in
  both languages. (constitution §4)
- [x] **T20 — cloud map**: n/a (no new tier/station) — reuse existing cloud names. (§5)
- [x] **T21 — refactor**: tidy, keep all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC11)
- [x] `npm test` (Vitest) green
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] No protocol change: `schemas.py` ↔ `events.ts` untouched; no new `Stage`
- [x] All new user-facing text exists in en **and** pt
- [x] Simulator page verified unchanged (AC8)
- [x] GitHub Pages demo (spec 058): the Arena is frontend-only (pure model + localStorage,
  no backend, no traces), so it works unchanged in the demo build with **no fixture capture
  needed** — nothing to mock. (per the standing demo directive)
- [x] `spec.md` status updated to `done`
