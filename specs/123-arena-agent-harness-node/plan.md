# Plan: Arena Agent Harness node

> The HOW. `spec.md` is `clarified` (Q1 → Design A, display-only). Everything here
> respects the constitution; the Arena is a pure frontend model with **no** Stage /
> TraceEvent surface (§3), so there are **no protocol changes**.

## Approach

Add a new **non-scalable** Arena component kind `agentHarness` that represents the
in-process ReAct orchestration loop. It sits between the Backend and the agent's
callees (LLM / Vector DB / MCP) and is a **pure legibility node** (Design A):

- **Latency-transparent**: `baseLatencyMs = 0`, so inserting it adds no turn time.
- **Capacity-transparent**: `baseCapacity` huge (like `client`), so it is never a
  bottleneck (AC2). Non-scalable — `scaling: null`, no size/replicas controls.
- **Fan-out-transparent**: it does **not** own `callsPerRequest`; the callees keep
  theirs. The harness merely *reads its LLM child's `callsPerRequest`* and renders
  it in words (AC3).
- **Orchestrator for latency**: in the turn-path DP it **sums its children** (the
  agent awaits retrieve→generate in sequence), exactly like `backend` does today —
  so with `backend → harness → {llm, vectorDb}` the e2e latency is byte-identical to
  today's `backend → {llm, vectorDb}` (AC4, AC6).
- **Routing-tax-transparent** (the subtle one): the 105 client-side LLM routing tax
  is charged to a compute node wired *directly* to LLM pools. Inserting the harness
  would otherwise move that tax onto the harness (whose huge capacity makes it
  toothless), silently deleting both the backend's cost and the 105 lesson. Fix:
  make `routingTaxFor` treat a harness as a **transparent conduit** — a node's LLM
  deployment count follows edges *through* harness children — and make the harness
  itself exempt (tax 0, like a router). Net: the backend keeps paying exactly the
  same tax it does today (AC6).

Chosen over Design B (harness owns iterations) because Design A is byte-for-byte
non-disruptive, requires no preset re-tuning, and is the most §3-honest (it reports
today's model, just legibly).

## Affected files

**Backend**
- None. (Arena is frontend-only.)

**Frontend**
- `frontend/src/arena/components.ts` —
  - add `"agentHarness"` to the `ArenaKind` union;
  - `BENCHMARKS.agentHarness = { baseCapacity: 1_000_000, baseLatencyMs: 0 }`;
  - `KIND_META.agentHarness` with bilingual `label`/`description`/`info`, `clouds`,
    and `scaling: null`;
  - add to `PALETTE_ORDER` (right after `backend`, before `llm` — it belongs to the
    agent path);
  - **exclusions**: NOT in `CALLS_CONFIGURABLE`, `isCacheLike` false, `splitsLoad`
    false, no entry in `CONCURRENCY_BUDGET_PER_UNIT` (→ budget `null`).
- `frontend/src/arena/model.ts` —
  - `turnPathLatenciesMs`: extend the sequential-sum branch from
    `spec.kind === "backend"` to also cover `"agentHarness"`;
  - `routingTaxFor`: count a node's LLM deployments through transparent harness
    children (follow `harness → llm` edges) and return `{ tax: 0 }` when the node
    itself is a harness.
- `frontend/src/arena/ArenaNode.tsx` — render the harness's fan-out badge
  (`"ReAct loop · N LLM calls/turn"`), and render it as non-scalable (no ×replicas
  badge), mirroring how `client` is drawn.
- `frontend/src/arena/ArenaCanvas.tsx` — the ScalePanel lives here; branch on
  `scaling === null` (as `client` already does) to hide size/replicas and show the
  harness `info` explainer (AC5). Confirm `client` path can be reused verbatim.
- `frontend/src/arena/store.ts` — `dropNode` already defaults `size:"medium"`,
  `replicas:1`, and region for non-client kinds; confirm harness gets a region like
  other nodes (fine — it never affects capacity). No structural change expected.
- `frontend/src/arena/examples.ts` — insert an `agentHarness` node into the agent
  path of the default first-visit example and each preset, rewiring
  `backend → {llm,…}` to `backend → harness → {llm,…}`. Numbers stay identical by
  construction (Design A).
- A small pure helper `fanOutFor(design, harnessId): number | null` (in `model.ts`
  or `format.ts`) returning the harness's LLM child's `callsPerRequest`, unit-tested
  for AC3.

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent`; `schemas.py` and `events.ts` untouched;
nothing to map in `stations.ts` (Arena has its own catalog).

## Data model changes

**None.** No Chroma, no SQLite. Arena designs persist to `localStorage`
(`agentsim.arena`); adding a kind is backward-compatible — existing saved designs
simply have no harness and behave exactly as before (the harness is additive/opt-in;
the store's node validation already tolerates any `kind` string, see `store.ts:129`).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `KIND_META.agentHarness.label` | Agent Harness | Harness do Agente |
| `.description` | The ReAct loop that runs the agent | O loop ReAct que executa o agente |
| `.info` | The agent's orchestration loop (LangGraph/ReAct), running **in-process inside the Backend** — it is not a tier you scale on its own. It's shown as its own box to make the turn **fan-out** legible: one user request becomes N model calls as the loop thinks → calls tools → generates. To add capacity, scale the Backend (containers) and the LLM (quota), not the harness. | O loop de orquestração do agente (LangGraph/ReAct), rodando **in-process dentro do Backend** — não é um tier que você escala sozinho. É mostrado como caixa própria para tornar o **fan-out** do turno legível: um request de usuário vira N chamadas ao modelo à medida que o loop pensa → chama ferramentas → gera. Para ganhar capacidade, escale o Backend (containers) e o LLM (cota), não o harness. |
| fan-out badge (`ArenaNode`) | ReAct loop · {n} LLM calls/turn | loop ReAct · {n} chamadas LLM/turno |
| non-scalable note (ScalePanel) | Runs in the backend process — scale the Backend, not the harness. | Roda no processo do backend — escale o Backend, não o harness. |

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| `agentHarness` | Agent orchestration runtime | AI Foundry Agent Service | Bedrock Agents | Vertex AI Agent Engine |

## Test strategy (constitution §9 — TDD)

All tests are frontend Vitest under `frontend/src/arena/`.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 (kind exists, in palette, droppable) | `PALETTE_ORDER` includes `agentHarness`; `KIND_META`/`BENCHMARKS` populated; `dropNode("agentHarness")` creates a node | `components.test.ts`, `store.test.ts` |
| AC2 (non-scalable, never bottleneck) | `KIND_META.agentHarness.scaling === null`; for a saturating load, `computeMetrics` marks the harness `bottleneck:false`, util≈0 | `components.test.ts`, `model.test.ts` |
| AC3 (fan-out readout) | `fanOutFor(design, harnessId)` returns the LLM child's `callsPerRequest`; badge string renders bilingually | `model.test.ts`, `i18n.test.ts` |
| AC4 (e2e attributable, harness sums children) | in `backend→harness→{llm,vectorDb}`, `turnPathLatenciesMs` for the harness = Σ children; `endToEndLatencyMs` matches the pre-harness value | `model.test.ts` |
| AC6 (numbers identical + tax preserved) | property test: for a design, snapshot `computeMetrics` + `endToEndLatencyMs`; insert a pass-through harness between backend and its callees; assert every other node's metrics **and** e2e are unchanged, **and** `routingTaxFor(backend)` is unchanged | `model.test.ts` |
| AC5 (bilingual non-scalable explainer) | `info`/scaling-note present in en + pt | `i18n.test.ts` |
| AC7 (examples wired + still load) | every preset in `examples.ts` contains a wired `agentHarness`; existing `examples.test.ts` assertions pass (update structural counts) | `examples.test.ts` |

## Risks / trade-offs

- **Routing-tax transparency** is the one place Design A's "nothing changes" is not
  free — it needs the `routingTaxFor` conduit change, covered by a dedicated AC6
  assertion. If we got it wrong, the backend's utilization would silently drift.
- **Examples test churn**: inserting the harness changes node/edge counts, so
  structural assertions in `examples.test.ts` must be updated (values/latency
  assertions stay valid by Design A).
- **Deterministic + pure**: no `Date.now`/random introduced; the model stays a pure
  function of the design (Arena invariant).
- **Non-goal creep**: resist making the harness scalable or a second capacity wall —
  that would reintroduce the dishonesty this spec avoids.
