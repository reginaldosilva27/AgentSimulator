# Plan: Arena — client-side LLM routing tax

> HOW. Frontend-only; extends specs 100–104.

## Approach

Add one design-aware helper to the pure model and thread it through capacity:

- `components.ts`: `ROUTING_TAX_RATE = 0.02`, `ROUTING_TAX_CAP = 0.4` (documented
  teaching estimates).
- `model.ts`: `routingTaxFor(design, nodeId)` → `{ tax, deployments }`: for a
  non-router node, `deployments` = Σ `replicas` over directly-wired children of
  kind `llm`; `tax = min(CAP, RATE × max(0, deployments − 1))`; routers → 0.
  `computeMetrics` multiplies that node's capacity by `(1 − tax)` and reports
  `routingTax` on `NodeMetrics` (0 for unreached).
- `ArenaCanvas.tsx` (ScalePanel): when `routingTaxFor(...) > 0`, an amber note
  `arena.routingTax(pct, n)` under the capacity line.
- `components.ts` (content): LLM `info` += "multiple boxes = different pools
  (regions/models/providers); deployments = identical copies in one pool" (en+pt).
- `strings.ts`: `arena.routingTax` builder en+pt.

## Affected files

- `arena/components.ts` — constants + LLM info sentence.
- `arena/model.ts` — `routingTaxFor` + capacity application + `NodeMetrics.routingTax`.
- `arena/model.test.ts` — AC1–AC3.
- `arena/examples.test.ts` — AC5 (scale-llm taxed yet healthy; prod/fleet untaxed).
- `arena/ArenaCanvas.tsx` + `arena/ScalePanel.test.tsx` — AC4.
- `i18n/strings.ts` — AC6 builder.

## Protocol / data model changes

None.

## i18n strings (constitution §4)

`arena.routingTax(pct, n)` — en: "Client-side LLM routing: −{pct} capacity
(managing {n} deployments — an AI Gateway removes this)"; pt: "Roteamento de LLM no
app: −{pct} de capacidade (gerenciando {n} deployments — um AI Gateway remove
isso)". LLM info sentence en+pt.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1/AC2 | tax math + monotonic util | `arena/model.test.ts` |
| AC3 | gateway removes tax; router exempt | `arena/model.test.ts` |
| AC4 | panel note visible when taxed | `arena/ScalePanel.test.tsx` |
| AC5 | scale-llm taxed+healthy; prod/fleet untaxed | `arena/examples.test.ts` |
| AC6 | builder en+pt (+ existing leafKeys parity) | `arena/i18n.test.ts` |

## Risks / trade-offs

- 2%/deployment (cap 40%) is a teaching estimate, not a benchmark — the note +
  constants comment say so (§3 honesty).
- Counting only *direct* LLM children keeps the story crisp (the node that holds
  the endpoints pays); a two-hop chain through a router pays nothing by design.
