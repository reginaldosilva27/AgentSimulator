# Plan: Arena — saturation honesty

> The HOW for `108-arena-saturation-honesty`.

## Approach

Two small, orthogonal edits:

1. **`statusFor` threshold** (`frontend/src/arena/model.ts`): add `CRITICAL_UTIL =
   0.9`; `utilization >= CRITICAL_UTIL → "critical"`, `>= WARNING_UTIL (0.7) →
   "warning"`. `bottleneck` stays `utilization > 1` — the badge and shed readout are
   about *dropping traffic*, the color is about *operating point*.
2. **Header swap** (`frontend/src/arena/ArenaPage.tsx`): the `useMemo` that computes
   `e2eMs`/`llmCostPerHour` also sums `shedRps` over all nodes. When `totalShed > 0`,
   render `t.arena.saturatedHeader(formatQps(totalShed))` (rose-colored) instead of
   the latency span. `endToEndLatencyMs` itself is untouched (pure model, reused by
   109/110).

No store, no persistence, no new component kinds.

## Affected files

**Frontend**
- `frontend/src/arena/model.ts` — `CRITICAL_UTIL` constant + `statusFor` change.
- `frontend/src/arena/ArenaPage.tsx` — total-shed computation + conditional header readout.
- `frontend/src/i18n/*` (arena strings) — `saturatedHeader` (en/pt) + hint.
- Tests: `model.test.ts`, `ArenaPage.test.tsx`.

**Backend** — none.

## Protocol changes (constitution §1)

None (frontend-only; no Stage/TraceEvent).

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.saturatedHeader(n)` | `Saturated — shedding ~{n} req/s (429)` | `Saturado — descartando ~{n} req/s (429)` |
| `arena.saturatedHint` | `Past capacity a real API sheds with 429s; a latency figure would be fiction. Scale the bottleneck to get a latency again.` | `Acima da capacidade uma API real descarta com 429; um número de latência seria ficção. Escale o gargalo para voltar a ter latência.` |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | saturated design → header shows notice, no latency; healthy design → latency unchanged | `frontend/src/arena/ArenaPage.test.tsx` |
| AC2 | with a shedding node, rendered output contains neither `80s` nor any latency for that node (node `—` pinned already; add header assertion) | `ArenaPage.test.tsx` |
| AC3 | `statusFor`-driven `computeMetrics` status: util 0.9 → critical, 0.89 → warning, 0.7 → warning, 0.69 → healthy; bottleneck only >1 | `frontend/src/arena/model.test.ts` |
| AC4 | render ArenaPage with empty storage (default sample) → saturation notice present | `ArenaPage.test.tsx` |
| AC5 | new keys exist in both langs | `frontend/src/arena/i18n.test.ts` |

## Risks / trade-offs

- Changing `statusFor` flips colors in existing presets/tests (`rag-cache` LLM at 67%
  stays warning-free; nothing crosses 0.9 in presets — verify in the AC3 test run).
- The header loses a number when saturated — intentional; the shed rate IS the number
  that matters there.
