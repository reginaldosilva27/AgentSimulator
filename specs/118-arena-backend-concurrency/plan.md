# Plan: 118-arena-backend-concurrency

## Approach

Pure additive layer on 113's `heldInFlight`: a per-kind budget in
`components.ts`, two small pure functions in `model.ts`, and a projection
change in `ArenaCanvas`/`ArenaNode`. No change to `computeMetrics` itself —
QPS metrics stay as-is; the *effective* status is merged at projection time
(worse of the two signals), keeping the model layers separable and testable.

**Budget anchor.** `CONCURRENCY_BUDGET_PER_UNIT = { backend: 2_000 }` held
streams per MEDIUM container, scaled by `SIZE_MULTIPLIER` (memory scales with
size) × replicas. Teaching order: an async API container holds a few thousand
open SSE/WebSocket streams before fds/event-loop/per-stream buffers bite
(nginx/uvicorn defaults are single-digit thousands). Stated in comments + ℹ️.

**Pressure math.** held comes from 113 (`heldInFlight` — null when the awaited
subtree sheds). `concurrencyPressure(held, budget)`: null → null; else
held/budget through the same `WARNING_UTIL`/`CRITICAL_UTIL` thresholds.
`worseStatus(a, b)` picks by severity rank. ArenaCanvas computes `held` once
per render (it already recomputes metrics per edit) and feeds ArenaNodeData
`{held, budget, effective status, connectionWall}`.

**Preset retune (equilibrium in-flight ≈ eq_rps × turn seconds):**

| preset | eq ≈ | turn ≈ | held ≈ | budget needed |
|---|---|---|---|---|
| scale-llm | 675 | 3.7 s | 2.5k | backend ×2 (4k) |
| rag-cache | 178 | 4 s | 0.7k | ×1 ok |
| agent-tools | 79 | 5.2 s | 0.4k | ×1 ok |
| semantic-cache | 355 | 3.6 s | 1.3k | ×1 ok |
| prod | 505 | 3.9 s | 2.0k | ×2 (already) 4k ok |
| llm-fleet | 1,543 | 4.8 s | 7.4k | ×3 → **×6** (12k) |
| multi-region | 1,340 | 3.9 s | 5.2k | ×1 → **×4** (8k) |
| regional-quota | sheds | — | null | ×4 (symmetry with twin) |
| simple-rag | sheds | — | null | ×1 (unchanged) |

## Affected files

- `frontend/src/arena/components.ts` — `CONCURRENCY_BUDGET_PER_UNIT` + anchor
  comment; backend `info` copy gains the streams-budget sentence (en+pt).
- `frontend/src/arena/model.ts` — `concurrencyBudgetFor(spec)`,
  `concurrencyPressure(held, budget)`, `worseStatus(a, b)` (pure, exported).
- `frontend/src/arena/ArenaCanvas.tsx` — compute held map; merge status;
  feed `held`/`budget`/`connectionWall` into node data; ScalePanel in-flight
  line shows `held / budget` + explainer.
- `frontend/src/arena/ArenaNode.tsx` — In-flight row (backend), rose
  connection-wall banner when held > budget.
- `frontend/src/arena/examples.ts` — backend containers retuned per table.
- `frontend/src/i18n/strings.ts` — `arena.inflightBudget*`, connection-wall
  label (en+pt); refresh `inflightInfo`.
- Tests: `model.test.ts` (AC1–AC3), `ArenaCanvas.integration.test.tsx` /
  `ScalePanel.test.tsx` (AC4), `examples.test.ts` (AC5).

## Test strategy (AC → test)

- AC1/AC2 → `model.test.ts`: budget arithmetic incl. null kinds; pressure
  thresholds; null-held passthrough; worse-status merge.
- AC3 → `model.test.ts`: a single-backend + big-slow-LLM fixture where QPS
  util < 0.7 but held/budget > 0.9 → merged critical.
- AC4 → integration test: backend node shows "In-flight" row and the wall
  banner on an over-budget design; ScalePanel shows `held / budget`.
- AC5 → `examples.test.ts` walker: for every preset with `claims.llm ===
  "healthy"`, backend pressure < 0.7 at `offeredLoad = equilibrium`.

## Protocol / i18n / cloud impact

None / all new prose en+pt / no new tier-station.

## Risks

- Persisted designs with 1-container backends may now read warning/critical —
  intended (that's the lesson); the nudge copy tells the fix.
- llm-fleet gets 6 backend containers at ~5% QPS util — deliberately: the
  connection budget, not CPU, sizes agent backends (stated in the preset copy).
