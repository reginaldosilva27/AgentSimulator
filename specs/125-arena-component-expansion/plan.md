# Plan: Arena — component expansion

> The HOW. Decisions here respect `.specify/constitution.md`; the Arena stays a
> pure frontend model (no protocol impact).

## Approach

All five kinds are additive entries in the existing single-source catalog
(`components.ts`): a `BENCHMARKS` row + a `KIND_META` row each, plus membership
in the existing behavior sets. Only **one real model change** is needed, and it
fixes a latent dishonesty rather than adding a mechanism: **async detection**.

**Async detection (AC2/AC3).** In `computeMetrics`' DAG walk, compute
`asyncOf: Set<id>` = nodes whose *every* inbound path crosses a `queue` node
(seeded: children of queues are async unless also fed by a non-async, non-queue
parent; async-ness propagates to descendants the same way). Expose
`NodeMetrics.async: boolean`. Then:

- `turnPathLatenciesMs` — when summing/maxing a node's children, skip async
  children (the queue's own latency still counts: enqueueing is synchronous).
- `heldInFlight` — the `satOf` recursion stops at async children (a saturated
  worker grows backlog; callers hold no stream on it).
- Readouts — for async nodes, present `shedRps` with backlog wording ("backlog
  grows +N/s" / "fila acumula +N/s") instead of the 429 wording, and render an
  `async` badge on the node card.

**Per-kind design (teaching benchmarks, stated assumptions):**

| kind | baseCapacity | baseLatencyMs | scaling | behavior sets |
|---|---|---|---|---|
| `worker` | 200 | 500 | units = workers; size = machine | — (plain compute; async comes from topology, not kind) |
| `guardrails` | 500 | 80 | units = moderation replicas | `CALLS_CONFIGURABLE`, default cpr 2 |
| `externalApi` | 50 | 300 | `scaling: null` (provider's, not yours) | — |
| `objectStore` | 25 000 | 30 | `scaling: null` (managed, auto-scales) | — |
| `memoryStore` | 3 000 | 15 | units = replicas; size = instance | `CALLS_CONFIGURABLE`, default cpr 2 |

Default `callsPerRequest` today is 1 everywhere; guardrails/memoryStore need a
**per-kind default cpr** — add `DEFAULT_CPR: Partial<Record<ArenaKind, number>>`
in `components.ts` and read it where nodes are created (`store.ts` add/drop
actions), so existing designs and presets are untouched.

Alternative considered: modeling the worker as a kind-level "async" flag —
rejected; async-ness is a property of the **wiring** (behind a queue), and any
kind placed behind a queue (e.g. an ingestion `vectorDb` write path) should earn
the same honest treatment.

## Affected files

**Frontend** (Arena only)
- `frontend/src/arena/components.ts` — `ArenaKind` +5; `BENCHMARKS`, `KIND_META`
  (bilingual + clouds + info + scaling), `PALETTE_ORDER`, `CALLS_CONFIGURABLE`
  (+guardrails, +memoryStore), new `DEFAULT_CPR`.
- `frontend/src/arena/model.ts` — async detection in `computeMetrics`;
  `NodeMetrics.async`; skip-async in `turnPathLatenciesMs` and `heldInFlight`.
- `frontend/src/arena/store.ts` — apply `DEFAULT_CPR` on node creation.
- `frontend/src/arena/ArenaCanvas.tsx` (node card) — `async` badge; backlog
  wording for async shed.
- `frontend/src/arena/ScalePanel.tsx` — backlog wording; non-scalable kinds
  already keyed off `scaling: null` (client precedent — verify `externalApi`/
  `objectStore` fall through the same branch).
- `frontend/src/arena/examples.ts` — new preset "Guardrails + async ingestion"
  with 119 callouts.
- `frontend/src/arena/i18n.ts` (arena strings) — badge + backlog labels.

**Backend** — none.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent`; Arena is frontend-pure (100).

## Data model changes

None (localStorage schema gains nothing; `callsPerRequest` already persists).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| KIND_META.worker.label | Worker | Worker |
| KIND_META.worker.description | Drains the queue off the request path | Consome a fila fora do caminho da requisição |
| KIND_META.guardrails.label | Guardrails | Guardrails |
| KIND_META.guardrails.description | Moderation check on every model call | Moderação em cada chamada ao modelo |
| KIND_META.externalApi.label | 3rd-Party API | API de terceiros |
| KIND_META.externalApi.description | A rate limit you don't control | Um rate limit que você não controla |
| KIND_META.objectStore.label | Object Store | Object Store |
| KIND_META.objectStore.description | Blobs and files — not a database | Blobs e arquivos — não é banco de dados |
| KIND_META.memoryStore.label | Memory Store | Memória do agente |
| KIND_META.memoryStore.description | Long-term memory: read+write every turn | Memória de longo prazo: leitura+escrita a cada turno |
| arena.asyncBadge | async | assíncrono |
| arena.backlogGrows | backlog grows +{n}/s | fila acumula +{n}/s |
| examples: guardrails-async title/blurb/callouts | (in examples.ts) | (idem) |

(ℹ️ `info` texts — one paragraph each, en+pt — written at implementation time;
each must state the benchmark's assumption per the honesty banner.)

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| worker | Queue consumer | Container Apps jobs / Functions | SQS + Lambda / ECS | Cloud Run jobs / Pub/Sub push |
| guardrails | Content moderation | Azure AI Content Safety | Bedrock Guardrails | Model Armor |
| externalApi | SaaS / partner API | (provider-agnostic: Stripe, Slack, ERP) | idem | idem |
| objectStore | Blob storage | Blob Storage | S3 | Cloud Storage |
| memoryStore | Agent memory store | Cosmos DB | DynamoDB | Firestore |

## Test strategy (constitution §9 — TDD)

Vitest, `frontend/src/arena/`:

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | 5 kinds present with complete KIND_META (loop asserts label/desc/info en+pt non-empty, 3 clouds) + in PALETTE_ORDER | `components.test.ts` |
| AC2 | `backend → queue → worker`: `turnPathLatenciesMs(backend)` unchanged when worker latency ×10; queue latency still counted | `model.test.ts` |
| AC3 | async flag set for worker (and NOT set when also wired synchronously); overloaded worker: `async && shedRps>0`; `heldInFlight(backend)` non-null despite worker saturation | `model.test.ts` |
| AC4 | guardrails forwards 100% (child arriving == guardrails throughput × cpr rules); default cpr 2 via `DEFAULT_CPR`; in `CALLS_CONFIGURABLE` | `model.test.ts` / `components.test.ts` |
| AC5 | `externalApi` scaling === null; capacity fixed w.r.t. replicas/size input; shed reported | `components.test.ts` / `model.test.ts` |
| AC6 | memoryStore default cpr 2 → 1000 turns/s ⇒ arriving 2000 | `model.test.ts` |
| AC7 | preset loads, satisfies its stated load (no bottleneck at preset sliders), callouts en+pt present | `examples.test.ts` |
| AC8 | `npm run build` (tsc exhaustiveness) + existing layout/store suites stay green | CI gates |

## Risks / trade-offs

- **Async definition edge cases** (diamond wiring: node fed by queue AND directly)
  — rule: async only when *every* inbound path crosses a queue; test pins this.
- **Backlog is steady-state fiction if oversold** — we deliberately do NOT model
  backlog *depth* (no time dimension); wording says "grows +N/s", never a size.
- **Benchmarks are teaching numbers** — each ℹ️ states its assumption, same
  treatment as 100/116; the honesty banner already points at `components.ts`.
- Presets/localStorage back-compat: new kinds are additive; old saved designs
  never reference them.
