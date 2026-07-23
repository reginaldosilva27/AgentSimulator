# Plan: Arena — provisioned LLM cost

> The HOW for `111-arena-provisioned-cost`. Independent of 108–110 (composes cleanly
> either way; usage side just reads whatever throughput the model reports).

## Approach

- New constant in `frontend/src/arena/components.ts` beside `LLM_COST_PER_CALL_USD`:
  `LLM_COST_PER_DEPLOYMENT_HOUR_USD = 100` (per medium deployment; × `SIZE_MULTIPLIER`),
  with the same honesty comment style (source of the ballpark + break-even math).
- New pure helper `llmCost(design, metrics)` in `frontend/src/arena/model.ts`
  returning `{ provisionedPerHour, usagePerHour }` — moves the existing inline
  usage sum out of `ArenaPage.tsx` so both figures are unit-testable.
- `ArenaPage.tsx` renders both (compact: omit a zero side), reusing the existing
  cost formatting; hint updated.

## Affected files

**Frontend**
- `frontend/src/arena/components.ts` — new constant + honesty comment.
- `frontend/src/arena/model.ts` — `llmCost` pure helper.
- `frontend/src/arena/ArenaPage.tsx` — dual cost readout (replaces inline sum).
- `frontend/src/i18n/*` — `llmCost` label variants + updated `llmCostHint` (en/pt).
- Tests: `model.test.ts` (or `components.test.ts`), `ArenaPage.test.tsx`, `i18n.test.ts`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.llmCostBoth(p, u)` | `~${p}/h provisioned + ~${u}/h usage` | `~${p}/h provisionado + ~${u}/h de uso` |
| `arena.llmCostHint` (updated) | `Teaching estimates: ~$100/h per medium deployment (provisioned, billed even idle — think PTUs) plus ~$0.0016 per agent-shaped call (~2k in / 500 out). Break-even ≈ 35% utilization.` | `Estimativas didáticas: ~$100/h por deployment médio (provisionado, cobrado mesmo ocioso — pense em PTUs) mais ~$0,0016 por chamada de agente (~2k entrada / 500 saída). Ponto de equilíbrio ≈ 35% de utilização.` |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `llmCost` sums replicas × size × rate; usage matches previous inline math | `model.test.ts` |
| AC2 | fleet + 0 load → provisioned > 0, usage = 0 | `model.test.ts` |
| AC3 | header renders both figures + hint | `ArenaPage.test.tsx` |
| AC4 | break-even pin: medium deployment at 35% util → usage ≈ provisioned; above → provisioned cheaper | `model.test.ts` |
| AC5 | i18n parity for new keys | `i18n.test.ts` |

## Risks / trade-offs

- Two dollar figures can crowd the control bar — compact formatting (`$12k/h + $23.5k/h`)
  and omitting zero sides keeps it one line.
- The $100/h ballpark will age; it lives in one commented constant like every other
  Arena benchmark (single source of truth, honesty note).
