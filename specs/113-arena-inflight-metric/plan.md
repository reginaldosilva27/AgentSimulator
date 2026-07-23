# Plan: Arena — in-flight metric

> The HOW for `113-arena-inflight-metric`. Depends on 109 (path-latency helper);
> AC4 additionally assumes 110 is in place.

## Approach

- `frontend/src/arena/model.ts`: export `heldInFlight(design, offeredLoad):
  Map<string, number | null>` composed from `computeMetrics` + the per-node
  path-latency helper extracted in 109 (T6 there). `null` when any node on the
  awaited path has `utilization > 1` (AC2). No change to `NodeMetrics` itself —
  a separate derived map keeps `computeMetrics` untouched and the dependency on
  109's helper explicit.
- `frontend/src/arena/ArenaCanvas.tsx` (scale panel): one new read-only row
  `In flight` with value or `—`, plus ℹ️ tooltip text.
- i18n keys for label + explainer.

## Affected files

**Frontend**
- `frontend/src/arena/model.ts` — `heldInFlight` derived map.
- `frontend/src/arena/ArenaCanvas.tsx` — scale-panel row + ℹ️.
- `frontend/src/i18n/*` — `inflight` label + `inflightInfo` (en/pt).
- Tests: `model.test.ts`, `ScalePanel.test.tsx`, `i18n.test.ts`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.metric.inflight` | `In flight` | `Em voo` |
| `arena.inflightInfo` | `Requests this component is holding open right now (Little's Law: throughput × time waiting, including everything downstream it waits on). A synchronous agent backend holds its connection/SSE stream for the WHOLE turn — connection pools and memory run out long before CPU does.` | `Requests que este componente mantém abertos agora (Lei de Little: vazão × tempo de espera, incluindo tudo que ele aguarda a jusante). Um backend de agente síncrono segura a conexão/stream SSE o turno INTEIRO — pools de conexão e memória acabam muito antes da CPU.` |

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | chain + two-branch backend numeric pins (thr × pathLatency/1000) | `model.test.ts` |
| AC2 | saturated downstream → `null`/`—` (never a clamped-latency product) | `model.test.ts` + `ScalePanel.test.tsx` |
| AC3 | panel renders value for orchestrator and leaf; ℹ️ present | `ScalePanel.test.tsx` |
| AC4 | client held in-flight ≤ users over 110's design matrix | `model.test.ts` |
| AC5 | i18n parity | `i18n.test.ts` |

## Risks / trade-offs

- Depends on 109's helper being exported — sequencing after 109 (and after 110 for
  the AC4 matrix reuse).
- Informative-only metric risks being missed; the ℹ️ and (later) the challenges
  module give it teeth. Deliberately not a constraint yet.
