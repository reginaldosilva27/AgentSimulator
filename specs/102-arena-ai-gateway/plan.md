# Plan: Arena — AI Gateway + fleet example + selection state

> HOW. Frontend-only; extends specs 100 + 101 (`frontend/src/arena/`).

## Approach

- Add `aiGateway` to `ArenaKind` with a benchmark + bilingual `KIND_META`, and make
  `splitsLoad(aiGateway) === true` so the existing model treats it as a router (splits
  load 1/N across children) with **zero model-math change**.
- Add an `llm-fleet` preset: Client → Backend(×3) → **AI Gateway** → 4× LLM(XLarge,×20),
  Backend → Cache → Vector DB(×2), at offeredLoad 10000. Tuned so the LLM tier is not
  critical (aggregate ≈ 4 × 4000 = 16000 ≫ 10000; backend 3×5000=15000; cache offloads
  the DB). Verified in tests via `computeMetrics`.
- Track the active example in the store (`exampleId: string | null`): set by a new
  `loadExample(id)` action; cleared by every structural mutation (add/remove/connect/
  removeEdge/setSize/setReplicas/setHitRatio/clear). `moveNode`/`dragNode`/`setOfferedLoad`
  keep it. The Examples `<select>` binds `value={exampleId ?? ""}`.

## Affected files

**Frontend**
- `arena/components.ts` — add `aiGateway` to `ArenaKind`, `BENCHMARKS`, `KIND_META`,
  `PALETTE_ORDER`; `splitsLoad` returns true for it.
- `arena/examples.ts` — add the `llm-fleet` preset.
- `arena/store.ts` — add `exampleId` state + `loadExample(id)`; clear `exampleId` in the
  structural mutations.
- `arena/ArenaPage.tsx` — `<select value={exampleId ?? ""}>`, `onChange` → `loadExample`.
- Tests: `arena/components.test.ts` (AC1/AC2 splitsLoad + aggregation via model),
  `arena/examples.test.ts` (AC3 fleet not critical + AC5 bilingual), `arena/store.test.ts`
  (AC4 exampleId set/cleared).

## Protocol changes (constitution §1)

None. No `Stage`/`TraceEvent`.

## Data model changes

None (localStorage only). `exampleId` is transient UI state (not persisted — a reload
re-derives an empty selection; the design still persists).

## i18n strings (constitution §4)

| location | en | pt |
|---|---|---|
| `KIND_META.aiGateway.label` | AI Gateway | AI Gateway |
| `KIND_META.aiGateway.description` | Routes / load-balances across LLM deployments (fallback = resilience) | Roteia / balanceia entre deployments de LLM (fallback = resiliência) |
| `examples.ts llm-fleet` title/description | (en) | (pt) |

## Cloud map (constitution §5)

n/a (Arena component, not a tier/station). `clouds` filled for `aiGateway` per KIND_META
convention (Azure API Management / AWS Bedrock Gateway / GCP Apigee-style names).

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 splits load | `splitsLoad(aiGateway)`, model splits 1/N | `arena/components.test.ts` |
| AC2 aggregate | gateway → N LLMs each get ~load/N | `arena/components.test.ts` |
| AC3 fleet survives | `llm-fleet` LLM not critical at its load | `arena/examples.test.ts` |
| AC4 selection state | loadExample sets id; edit clears it | `arena/store.test.ts` |
| AC5 bilingual | aiGateway + fleet meta en/pt | `arena/examples.test.ts` / `i18n.test.ts` |

## Risks / trade-offs

- `aiGateway` is mechanically identical to `loadBalancer` in a steady-state model
  (both split 1/N). Justified: the semantic/label distinction is the teaching value for
  an *agent* audience, and the description is honest that fallback ≠ extra throughput.
- `exampleId` not persisted — acceptable; it's a UI affordance, and a reloaded design
  isn't guaranteed to still equal a preset anyway.
