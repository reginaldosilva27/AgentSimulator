# Plan: Arena — capacity sandbox

> The HOW. Written after `spec.md` is `clarified`.

## Approach

**Frontend-only feature.** No backend, no `Stage`, no `TraceEvent`, no protocol/DB change.
The Arena is a new page rendered by `App` when `page === "arena"`, built on the React Flow
stack already in the repo (`@xyflow/react`) for the drag-and-drop canvas, and on Zustand
for its own store (mirroring `useSelection`/`useSimulator`).

The heart is a **pure, deterministic capacity model** (`arena/model.ts`) — no randomness,
no time, no network. Everything else (canvas, palette, node boxes) is a projection of that
model, so it is trivially unit-testable and honest by construction.

### The capacity model (the load-bearing math)

Each component **kind** carries a **benchmark**: `baseCapacity` (requests/sec per replica
at the `medium` instance size) and `baseLatencyMs`. These live in one table
(`arena/components.ts`) with a comment citing the order-of-magnitude assumptions — this is
the single source of truth and the thing the honesty banner refers to.

Per node the effective capacity is:

```
capacity = baseCapacity × sizeMultiplier(instanceSize) × replicas
```

with `sizeMultiplier`: `small 0.5 · medium 1 · large 2 · xlarge 4` (vertical scaling), and
`replicas` an integer ≥ 1 (horizontal scaling).

**Propagation** — build a DAG from the edges, run **Kahn topological sort**, and accumulate
offered load `L` (RPS from the load control) from the root node(s) (no incoming edges):

- `arriving(node) = Σ over incoming edges( throughput(parent) × edgeShare )`.
- `throughput(node) = min(arriving(node), capacity(node))` — this is what flows **out**, so
  a saturated node **collapses** downstream flow to its own capacity (AC2). No phantom
  over-capacity.
- **Load balancer** children each get `edgeShare = 1/childCount` (even split, AC3).
- **Cache** with hit-ratio `h` (default 0.8, editable): forwards only `(1 − h)` of its
  throughput to its downstream (the DB) — misses only (AC6); the `h` fraction is served
  locally.
- **Default fan-out** (non-LB node with multiple children): each child edge gets
  `edgeShare = 1` — full load to each (AC3), matching the reference tool's rule.
- `utilization(node) = arriving / capacity` (can exceed 1; display caps at a readable max).
- `status`: `healthy` if `util < 0.7`, `warning` if `0.7 ≤ util ≤ 1.0`, `critical` if
  `util > 1.0` (→ flagged as a bottleneck, AC1).
- **Latency** (queueing, AC7): `latency = baseLatencyMs / (1 − min(util, 0.99))` — a
  monotonic curve that rises toward the cap as util → 1; for `util > 1` it clamps to the
  `util = 0.99` value and the node reads *saturated*. Deterministic, no M/M/1 randomness.

Cycle guard: if edges form a cycle, Kahn leaves nodes unranked — those are marked
`unreachable`/`no credit` (mirrors the reference's "disconnected components get no credit")
rather than looping.

`computeMetrics(design, offeredLoad) → Map<nodeId, NodeMetrics>` is the one pure function
the whole page renders from; AC1–AC7 test it directly with no DOM.

### UI

- **Palette** (left): draggable cards for the agentic kinds (`llm`, `vectorDb`, `mcp`,
  `appDb`, `backend`) + scaling primitives (`cache`, `queue`, `loadBalancer`, `readReplica`,
  `cdn`, `apiGateway`) + an entry `client`. Reuses `stations.ts` labels/cloud names for the
  agentic ones where they line up, but the Arena kinds are their own small catalog.
- **Canvas** (center): React Flow with `onDrop`/`onDragOver` to add nodes, `onConnect` to
  wire edges, a custom `ArenaNode` rendering **QPS · latency · util% · status** live and a
  selected-state panel with **instance-size** select + **replica** stepper (and, for a
  cache, the hit-ratio). Bottleneck nodes get a `critical` visual treatment.
- **Load control** (top): a slider/input for offered load (users≈RPS) driving `computeMetrics`
  on every change — "real time" = recompute-on-change (the model is cheap and synchronous).
- **Honesty banner** (persistent): plainly states these are **modeled estimates**, not a
  live load test, with a one-line note on the assumptions (AC10).

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/page.ts` — add `"arena"` to the `Page` union.
- `frontend/src/App.tsx` — an **Arena** header button beside Learn; render `<ArenaPage/>`
  when `page === "arena"`. Simulator mount path unchanged (AC8).
- `frontend/src/arena/model.ts` — **new**: types + `computeMetrics` (the pure model).
- `frontend/src/arena/model.test.ts` — **new**: AC1–AC7 unit tests (Vitest).
- `frontend/src/arena/components.ts` — **new**: the component-kind catalog (benchmarks +
  bilingual labels/descriptions + cloud names), the SoT the honesty banner cites.
- `frontend/src/arena/store.ts` — **new**: `useArena` Zustand store (design, offeredLoad,
  add/remove/connect/scale actions, localStorage persistence under `agentsim.arena`).
- `frontend/src/arena/store.test.ts` — **new**: AC9 persistence round-trip.
- `frontend/src/arena/ArenaPage.tsx`, `ArenaCanvas.tsx`, `ArenaNode.tsx`, `Palette.tsx` —
  **new**: the UI (projection of the store + model).
- `frontend/src/arena/ArenaPage.test.tsx` — **new**: AC8 (separate page), AC10 (honesty
  label), AC11 (bilingual render).
- `frontend/src/i18n/strings.ts` (+ `strings.test.ts`) — new `arena` section on `Strings`,
  filled for `en` and `pt`.

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent` change; `schemas.py` ↔ `events.ts` untouched;
no `readoutFor`/`renderDetail`/`STAGE_TO_STATION`/`STAGE_TO_PHASE` change. The Arena is not
a pipeline stage — it never touches the real run. (This is the §3 honesty guarantee.)

## Data model changes

**None.** No Chroma, no SQLite. Design state lives in `localStorage` (`agentsim.arena`),
same pattern as `agentsim.selection`.

## i18n strings (constitution §4)

All under a new `arena` key on `Strings` (illustrative — full list finalized in tasks):

| key / location | en | pt |
|---|---|---|
| `arena.title` | Arena | Arena |
| `arena.nav` | Arena | Arena |
| `arena.tagline` | Model your architecture under load | Modele sua arquitetura sob carga |
| `arena.honesty` | Estimated model — not a live load test. Numbers are analytical, from stated per-component benchmarks. | Modelo estimado — não é teste de carga real. Os números são analíticos, a partir de benchmarks declarados por componente. |
| `arena.load` | Users / RPS | Usuários / RPS |
| `arena.play` | Play | Rodar |
| `arena.emptyCanvas` | Drag a component to start | Arraste um componente para começar |
| `arena.metric.qps` | QPS | QPS |
| `arena.metric.latency` | Latency | Latência |
| `arena.metric.util` | Utilization | Utilização |
| `arena.status.healthy` | Healthy | Saudável |
| `arena.status.warning` | Warning | Alerta |
| `arena.status.critical` | Critical | Crítico |
| `arena.scale.size` | Instance size | Tamanho da instância |
| `arena.scale.replicas` | Replicas | Réplicas |
| `arena.cache.hitRatio` | Cache hit ratio | Taxa de acerto do cache |
| `arena.bottleneck` | Bottleneck | Gargalo |
| component labels/descriptions | (per kind, en) | (per kind, pt) |

## Cloud map (constitution §5)

**n/a** in the protocol sense — Arena components are not new tiers/stations and add no
`Stage`. Where an Arena kind mirrors an existing station (LLM, Vector DB, App DB, MCP,
Backend) it may reuse that station's `clouds` names for display consistency; the scaling
primitives (cache/queue/LB/replica/CDN/API-GW) already exist in `stations.ts`' vocabulary
and their cloud names can be reused. No new cloud-map rows are *required* by the constitution
because no tier/station is added.

## Test strategy (constitution §9 — TDD)

Model ACs are pure-function Vitest tests (no DOM); page ACs use RTL (already set up per
spec 040). Each AC → at least one test, written **red first**.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 capacity cap | single node `min(L,C)`, util, critical flag | `arena/model.test.ts` |
| AC2 propagation + collapse | `A→B→C`, saturated B caps C's inflow | `arena/model.test.ts` |
| AC3 LB split vs fan-out | LB even split; non-LB full fan-out | `arena/model.test.ts` |
| AC4 horizontal scaling | replicas k clears critical once k·C ≥ L | `arena/model.test.ts` |
| AC5 vertical scaling | larger size raises C | `arena/model.test.ts` |
| AC6 cache re-route | inserting cache (hit h) lowers DB QPS/util | `arena/model.test.ts` |
| AC7 queueing latency | latency monotonic in util, rises near 1 | `arena/model.test.ts` |
| AC8 separate page | Arena button mounts ArenaPage; Simulator unaffected | `arena/ArenaPage.test.tsx` (+ `App` test) |
| AC9 persistence | design round-trips localStorage | `arena/store.test.ts` |
| AC10 honesty label | banner text present | `arena/ArenaPage.test.tsx` |
| AC11 bilingual | every `arena.*` key resolves en + pt | `i18n/strings.test.ts` |

## Risks / trade-offs

- **Honesty (§3) is the whole ballgame.** The numbers are a *model*; the banner (AC10) and
  the benchmark comments must keep that explicit. If a future spec adds cost or challenges,
  the same framing carries.
- **Model fidelity vs. simplicity.** The queueing curve is a teaching approximation, not
  M/M/1 with real variance. Documented as such; deterministic so tests are stable.
- **Determinism:** no `Date.now()`/`Math.random()` in the model — required for stable tests
  and consistent with repo conventions.
- **React Flow reuse:** the Arena canvas is a *second, independent* React Flow instance; it
  must not import Simulator geometry (`lib/layout.ts`) or the `useSimulator` store, to keep
  AC8 (Simulator untouched) true.
- **Scope creep:** challenges + AI judge are explicitly deferred; keep v1 to the sandbox.
