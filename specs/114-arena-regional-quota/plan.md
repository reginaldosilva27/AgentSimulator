# Plan: Arena — regional quota + cross-region latency

> The HOW for `114-arena-regional-quota`. Best sequenced after 108–110 (e2e and
> equilibrium settled) so preset re-pins happen once; hard dependency is only 109
> (hop penalty rides the path-latency walk).

## Approach

Two independent mechanics, both in the pure model:

1. **Quota** (`frontend/src/arena/model.ts`): before propagation, group LLM nodes by
   `region ?? "unassigned"`; per group compute `raw = Σ effectiveCapacity(node)`;
   if `raw > REGIONAL_LLM_QUOTA_RPS`, each node's capacity is multiplied by
   `quota / raw` (proportional squeeze). Expose the factor on `NodeMetrics`
   (`quotaFactor: number`, 1 when unbound) so the UI can render "quota-limited".
   Composes with the 105 routing tax (independent multipliers) — capacity =
   `effectiveCapacity × (1 − routingTax) × quotaFactor`.
2. **Penalty** (`endToEndLatencyMs` / the 109 path walk): when traversing edge
   `a → b` with `a.region && b.region && a.region !== b.region`, add
   `CROSS_REGION_LATENCY_MS` to the child's contribution.

Constants live in `frontend/src/arena/components.ts` with honesty comments
(`REGIONAL_LLM_QUOTA_RPS = 3_000`, `CROSS_REGION_LATENCY_MS = 100`).

UI: scale panel shows a quota row for LLM nodes (`capacity × factor`, note when
factor < 1); the LLM ℹ️ (104) gains a sentence about the regional cap.

## Affected files

**Frontend**
- `frontend/src/arena/components.ts` — two constants + LLM `info` text update (en/pt).
- `frontend/src/arena/model.ts` — quota grouping + `quotaFactor` on `NodeMetrics`;
  cross-region term in the path walk.
- `frontend/src/arena/ArenaCanvas.tsx` — scale-panel quota note for LLM nodes.
- `frontend/src/arena/examples.ts` — preset adjustments if any pool lands over quota
  (descriptions stay truthful, en + pt).
- `frontend/src/i18n/*` — `quotaLimited` note + hint (en/pt); e2e hint mentions the
  cross-region penalty.
- Tests: `model.test.ts`, `ScalePanel.test.tsx`, `examples.test.ts`, `i18n.test.ts`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None (regions already persist per node since 106).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.quotaLimited(region)` | `Quota-limited — {region} is at its regional LLM quota` | `Limitado por cota — {region} atingiu a cota regional de LLM` |
| `arena.quotaHint` | `A region caps how much model capacity you can provision (subscription quota / PTU availability). Past the cap, more deployments in the same region add nothing — add another region or a higher quota tier.` | `Uma região limita quanta capacidade de modelo você consegue provisionar (cota da assinatura / disponibilidade de PTU). Acima do teto, mais deployments na mesma região não adicionam nada — adicione outra região ou um tier de cota maior.` |
| `arena.e2eHint` (append) | `Cross-region hops add ~100ms each.` | `Saltos entre regiões adicionam ~100ms cada.` |
| `KIND_META.llm.info` (append) | `Each region caps total LLM capacity (regional quota) — spreading pools across regions is how real fleets escape it.` | `Cada região limita a capacidade total de LLM (cota regional) — espalhar pools entre regiões é como frotas reais escapam disso.` |

## Cloud map (constitution §5)

n/a — no new kind; the quota concept maps to existing proper nouns already cited in
the LLM ℹ️ (PTU/TPM quotas).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | one region over quota → proportional capacities, total = quota; ≤ quota unchanged | `model.test.ts` |
| AC2 | 60 large in 1 region vs 3×20 in 3 regions — aggregate capacity pin | `model.test.ts` |
| AC3 | unassigned nodes share a pool; existing single-pool designs byte-for-byte | `model.test.ts` |
| AC4 | scale panel shows quota-limited note when factor < 1 | `ScalePanel.test.tsx` |
| AC5 | cross-region edge adds 100ms to e2e; same-region/unregioned adds 0 | `model.test.ts` |
| AC6 | `prod`/`llm-fleet` healthy + descriptions truthful under quota+penalty | `examples.test.ts` |
| AC7 | i18n parity | `i18n.test.ts` |

## Risks / trade-offs

- The quota changes the audited screenshot-style design (60 large in 3 regions stays
  fine at 2,000/region; the same 60 in ONE region caps at 3,000) — exactly the
  intended lesson, but any user's saved single-region mega-fleet will visibly shrink
  on upgrade; the quota-limited note explains why (no silent change).
- Proportional squeeze means adding replicas past the cap dilutes per-node capacity
  rather than being ignored — the panel note + saturating meters make it legible.
- One global quota constant is a simplification (real quotas vary by model/region);
  stated in the hint, per-region editing deferred.
