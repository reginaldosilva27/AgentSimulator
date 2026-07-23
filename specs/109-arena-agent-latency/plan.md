# Plan: Arena — agent-turn latency

> The HOW for `109-arena-agent-latency`.

## Approach

Rewrite `endToEndLatencyMs` (`frontend/src/arena/model.ts`) from a longest-path DP
into a **recursive turn-path evaluation** over the DAG (memoized, cycle-safe by
reusing the reachability the metrics already compute):

```
pathLatency(id) = cpr(id) × ( metrics(id).latencyMs + combine(children) )
combine = sum(...)  if kind === "backend"
        = max(...)  otherwise (routers = alternative pools; chains have 1 child)
e2e = max over load-carrying sources of pathLatency(source)
```

- `metrics(id).latencyMs` keeps the existing queueing curve (base/(1−min(u,0.99))).
- Only load-carrying nodes (`arriving > 0`) contribute, as today.
- Unreachable/cycle nodes contribute 0 (they already report `unreachable`).
- The signature stays `endToEndLatencyMs(design, offeredLoad)` — 110 builds on it.

Keeping `computeMetrics` untouched isolates the change: throughput/shed/status tests
must not move.

## Affected files

**Frontend**
- `frontend/src/arena/model.ts` — `endToEndLatencyMs` rewrite (+ exported helper if
  useful for 113's held-in-flight).
- `frontend/src/arena/ArenaPage.tsx` — hint text on the e2e readout (title attr).
- `frontend/src/i18n/*` — `e2eHint` updated (en/pt).
- Tests: `model.test.ts` (new AC1–AC3 pins), `examples.test.ts` (AC4 re-pins).

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.e2eHint` (updated) | `Modeled latency of one agent turn: serialized stages sum, and k calls per request cost k × the model's latency. Worst-case path (cache misses included).` | `Latência modelada de um turno do agente: etapas em sequência somam, e k chamadas por request custam k × a latência do modelo. Caminho de pior caso (incluindo cache miss).` |

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | chain with cpr 1/2/3 → e2e = client + backend + k×llm(queued), exact numbers | `frontend/src/arena/model.test.ts` |
| AC2 | gateway(cpr=2)→llm → e2e includes 2×(gw+llm); llm cpr unset | `model.test.ts` |
| AC3 | backend with two branches sums; router with two pools maxes | `model.test.ts` |
| AC4 | preset e2e expectations updated & descriptions still truthful | `frontend/src/arena/examples.test.ts` |
| AC5 | hint key in both langs | `i18n.test.ts` |

## Risks / trade-offs

- e2e numbers grow across the board — 110 and any UI copy citing latencies must land
  *after* this (or re-pin again). Sequencing: 108 → **109** → 110.
- Worst-case (miss-path, slowest pool) is deliberately pessimistic; stated in the hint.
- `simple-rag` (saturated) now hits 108's saturation notice, so the bigger fictional
  number is never rendered — ordering with 108 matters for AC4's truthfulness check.
