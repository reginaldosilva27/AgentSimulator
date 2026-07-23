# Tasks: Arena Agent Harness node

> Ordered TDD checklist. Each implement task is preceded by the failing test that
> drives it (red → green → refactor). Frontend Vitest only — no backend, no protocol.
> Run tests from `frontend/` (`npm test`) — never via a stray global vitest.

## Tasks

### Catalog (AC1, AC2)
- [x] **T1 — test first**: in `components.test.ts`, assert `PALETTE_ORDER` includes
      `"agentHarness"`, `BENCHMARKS.agentHarness` = `{baseCapacity:1_000_000,
      baseLatencyMs:0}`, `KIND_META.agentHarness.scaling === null`, and that it is
      excluded from `CALLS_CONFIGURABLE`, `isCacheLike`, `splitsLoad`,
      `CONCURRENCY_BUDGET_PER_UNIT`.
- [x] **T2 — implement**: add `"agentHarness"` to the `ArenaKind` union + the above
      entries in `components.ts`; make T1 green.

### Non-scalable model behavior (AC2)
- [x] **T3 — test first**: in `model.test.ts`, a design with a harness under a
      saturating offered load reports the harness `bottleneck:false`, utilization ≈ 0.
- [x] **T4 — implement**: rely on the huge `baseCapacity`; confirm no special-casing
      needed in `effectiveCapacity`. Make T3 green.

### Latency orchestration (AC4)
- [x] **T5 — test first**: in `model.test.ts`, for `backend→harness→{llm,vectorDb}`,
      `turnPathLatenciesMs` gives the harness = Σ(children) and `endToEndLatencyMs`
      equals the same design without the harness.
- [x] **T6 — implement**: extend the sequential-sum branch in `turnPathLatenciesMs`
      to `kind === "backend" || kind === "agentHarness"`. Make T5 green.

### Fan-out readout (AC3)
- [x] **T7 — test first**: in `model.test.ts`, `fanOutFor(design, harnessId)` returns
      the harness's LLM child's `callsPerRequest` (and `null` when it has no LLM
      child).
- [x] **T8 — implement**: add the pure `fanOutFor` helper; make T7 green.

### Numbers-identical + routing-tax transparency (AC6) — the load-bearing one
- [x] **T9 — test first**: in `model.test.ts`, take a base design
      (`client→backend→{llm×N,vectorDb}`), snapshot `computeMetrics` +
      `endToEndLatencyMs` + `routingTaxFor(backend)`; build the same design with a
      pass-through harness inserted (`backend→harness→{llm,vectorDb}`); assert every
      non-harness node's metrics, the e2e latency, **and** `routingTaxFor(backend)`
      are unchanged.
- [x] **T10 — implement**: make `routingTaxFor` count LLM deployments through
      transparent harness children and return tax 0 for a harness node. Make T9 green.

### UI: node + panel (AC1 render, AC3 badge, AC5 explainer)
- [x] **T11 — test first**: in `ArenaPage.test.tsx` / a node test, dropping an
      `agentHarness` renders a node with the bilingual fan-out badge and **no**
      size/replicas controls; the ScalePanel shows the non-scalable explainer.
- [x] **T12 — implement**: render the badge in `ArenaNode.tsx` (mirror `client`'s
      non-scalable rendering) and branch the ScalePanel in `ArenaCanvas.tsx` on
      `scaling === null`. Make T11 green.

### i18n (AC5, §4)
- [x] **T13 — test first**: extend `i18n.test.ts` to assert `agentHarness`
      label/description/info and the fan-out + non-scalable strings exist in **both**
      `en` and `pt` (non-empty, distinct where expected).
- [x] **T14 — implement**: add all `{en,pt}` strings from the plan's i18n table.
      Make T13 green.

### Examples (AC7)
- [x] **T15 — test first**: update `examples.test.ts` to assert every preset contains
      exactly one wired `agentHarness` in the agent path (backend→harness→llm), and
      keep the existing latency/QPS assertions (unchanged by Design A).
- [x] **T16 — implement**: insert + wire the harness in `examples.ts` default +
      presets; update structural counts. Make T15 green.

### Cloud map (§5)
- [x] **T17**: fill `KIND_META.agentHarness.clouds` (azure/aws/gcp per the plan).

### Close-out
- [x] **T18 — refactor**: dedupe, clean types, ensure `client` and `agentHarness`
      share the non-scalable rendering path without copy-paste drift.
- [x] **T19 — verify-gates**: run the `verify-gates` skill (`npm run build` +
      `npm test`; backend `ruff`/`pytest` unaffected but run for completeness).
- [x] **T20 — GitHub Pages demo check** (standing rule): decide whether the mocked
      demo (058) needs re-capture — Arena is frontend-only, so likely a rebuild is
      enough; note the decision.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (T1–T16).
- [x] `npm run build` passes (`tsc --noEmit` + build) — types clean.
- [x] `npm test` green (run from `frontend/`).
- [x] No new `Stage`/protocol surface (Arena stays pure — §3).
- [x] All new user-facing text exists in en **and** pt (§4).
- [x] Cloud map filled for `agentHarness` (§5).
- [x] AC6 holds: inserting the harness changes **no** other node's numbers, e2e
      latency, or the backend routing tax.
- [x] `spec.md` status → `done`.
