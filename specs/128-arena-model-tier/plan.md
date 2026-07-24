# Plan: Arena model tier (nano / mini / standard / large)

> The HOW. Written after `spec.md` is `clarified`. Frontend-only, pure model — no
> protocol change (Arena honesty, spec 100).

## Approach

Add a per-node `modelTier` to the LLM node. Today the LLM's latency and cost are
computed from **global constants** anchored to gpt-4.1-mini:
`llmBaseLatencyMsFor(shape)` (slopes `LLM_TTFT_MS`, `LLM_PREFILL_MS_PER_TOKEN`,
`LLM_DECODE_MS_PER_TOKEN`) and `llmCostPerCallUsd(shape)` (`LLM_INPUT_USD_PER_MTOK`,
`LLM_OUTPUT_USD_PER_MTOK`).

We generalise those two functions to read a **tier profile** instead of the bare
constants, keeping `mini` numerically **identical to today's constants** so the
default path is byte-for-byte (AC2). Both functions default their new `tier`
argument to `"mini"`, so every existing caller that doesn't pass a tier is
unchanged. The model layer (`buildModel`) threads each LLM node's `modelTier` into
`baseLatencyMsOf` and into the LLM cost aggregation. Capacity math
(`llmBaseCapacityFor` / TPM quota) is **not** touched — tier is orthogonal to
capacity (AC5). The ScalePanel (inside `ArenaCanvas.tsx`) gains a segmented
"Model tier" control next to the existing "Instance size" one, and the store gains
a `modelTier` field (default `mini`, back-filled on load) + a `setModelTier` action.

Alternative considered — a **global** model (like the 117 call shape). Rejected:
the call shape is the *workload* (one per design), but the *model* is a per-node
deployment choice; real fleets mix models (cheap router + big reasoner). Per-node
matches the existing per-node `instanceSize` and unlocks that lesson.

## Affected files

**Backend**
- none — Arena is frontend-only.

**Frontend**
- `frontend/src/arena/components.ts` —
  - add `ModelTier = "nano" | "mini" | "standard" | "large"`, `MODEL_TIERS`,
    `DEFAULT_MODEL_TIER = "mini"`, `MODEL_TIER_SKU: Record<ModelTier, string>`
    (`gpt-4.1-nano` / `gpt-4.1-mini` / `gpt-4.1` / `gpt-5`);
  - add `MODEL_TIER_PROFILE: Record<ModelTier, {ttftMs; prefillMsPerTok;
    decodeMsPerTok; inputUsdPerMtok; outputUsdPerMtok}>` where **`mini` reuses the
    existing `LLM_*` constants verbatim** (byte-for-byte);
  - extend `llmBaseLatencyMsFor(shape, tier = "mini")` and
    `llmCostPerCallUsd(shape, tier = "mini")` to read the profile;
  - bilingual `label` + `hint` strings for the control (incl. the "not answer
    quality" honesty note).
- `frontend/src/arena/model.ts` —
  - `ArenaNodeSpec` gains `modelTier?: ModelTier`;
  - `baseLatencyMsOf(kind, shape, tier?)` passes the node's tier for `llm`;
  - the two call sites (lines ~317, ~334) and the LLM cost aggregation (~514)
    read `sp.modelTier ?? "mini"`.
- `frontend/src/arena/store.ts` —
  - `ArenaNode` inherits `modelTier`; new-node creation defaults LLM nodes to
    `mini`; load/hydrate back-fills missing `modelTier` to `mini` (AC1);
  - `setModelTier(id, tier)` action + `isModelTier` guard (mirrors `isSize`).
- `frontend/src/arena/ArenaCanvas.tsx` — render the "Model tier" segmented control
  (LLM node only) with SKU sublabels + ℹ️ hint; wire to `setModelTier`.
- `frontend/src/i18n/strings.ts` — any UI-chrome strings (control heading) if not
  colocated in `components.ts`.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent`. No `schemas.py` / `events.ts` change. The
Arena is a pure client-side model (spec 100) — it never emits trace events.

## Data model changes

None (no Chroma, no SQLite). Only the localStorage-persisted Arena design gains an
optional `modelTier` per node; absence resolves to `mini` on load (AC1 back-fill).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| control heading | Model tier | Modelo |
| tier: nano | Nano | Nano |
| tier: mini | Mini | Mini |
| tier: standard | Standard | Padrão |
| tier: large | Large | Grande |
| hint | Which model runs on this deployment. A smaller tier is faster and cheaper per call; a bigger tier is slower and pricier. This sandbox models speed & cost only — **not answer quality** (a smaller model may reason worse). Capacity is set separately by instance size / quota. | Qual modelo roda neste deployment. Um tier menor é mais rápido e barato por chamada; um maior é mais lento e caro. Este sandbox modela só velocidade e custo — **não a qualidade da resposta** (um modelo menor pode raciocinar pior). A capacidade é definida à parte pelo tamanho da instância / cota. |

SKU strings (`gpt-4.1-nano`, `gpt-4.1-mini`, `gpt-4.1`, `gpt-5`) are proper nouns —
**not translated** (§4/§5 convention).

## Cloud map (constitution §5)

n/a — no new tier/station/boundary. Model tier is a property of the existing `llm`
node, which already carries its `clouds` map.

## Proposed tier profiles (numbers to fine-tune during implementation)

`mini` = exactly today's constants (TTFT 400 ms · prefill 0.05 · decode 8.0 ms/tok ·
$0.40 / $1.60 per Mtok). Anchored to real OpenAI SKUs; teaching order-of-magnitude:

| tier | SKU | TTFT ms | decode ms/tok (tok/s) | $ in/Mtok | $ out/Mtok |
|---|---|---|---|---|---|
| nano | gpt-4.1-nano | 300 | 5.0 (200) | 0.10 | 0.40 |
| mini | gpt-4.1-mini | 400 | 8.0 (125) | 0.40 | 1.60 |
| standard | gpt-4.1 | 500 | 13.0 (~77) | 2.00 | 8.00 |
| large | gpt-5 | 700 | 20.0 (50) | 5.00 | 15.00 |

(prefill ms/tok stays 0.05 across tiers — never the bottleneck.) Sanity at the
default 2k/500 shape: latency 2.9 / 4.5 / 7.1 / 10.8 s and cost strictly rising —
monotonic (AC3/AC4), `mini` unchanged (AC2). `gpt-5` figures flagged to re-check
against the published price/latency at implementation time (§3 honesty).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 default + back-fill | node without `modelTier` resolves to `mini`; store hydrate back-fills | `frontend/src/arena/store.test.ts` |
| AC2 byte-for-byte | `llmBaseLatencyMsFor(shape,"mini")` === `llmBaseLatencyMsFor(shape)` and === current value; same for cost; a preset's full metrics unchanged | `components.test.ts`, `examples.test.ts` |
| AC3 latency monotonic | latency nano<mini<standard<large for a fixed shape | `components.test.ts` |
| AC4 cost monotonic | cost nano<mini<standard<large for a fixed shape | `components.test.ts` |
| AC5 orthogonal capacity | `computeMetrics` capacity equal across all tiers, same size/region/shape | `model.test.ts` |
| AC6 control renders | ScalePanel shows Model tier control w/ 4 tiers + SKU + hint (en/pt) | `ArenaCanvas.integration.test.tsx` |
| AC7 persist + live | setModelTier persists to localStorage, survives reload, moves node latency + header e2e + LLM cost | `store.test.ts`, `ArenaCanvas.integration.test.tsx` |
| AC8 no invented params | no `B`/`billion`/param-count string in tier UI; only SKU strings | `components.test.ts` |

All Vitest (frontend). Run from `frontend/` (`npm test`) — never via a stray npx
that grabs vitest v4 without jsdom.

## Risks / trade-offs

- **Honesty (§3).** Model tier moves latency + cost but the Arena scores no quality
  — the hint must say so, or users read "nano is strictly better." Non-goal made
  explicit + surfaced in the hint (AC6).
- **Byte-for-byte.** Any drift in the `mini` profile vs the old constants breaks
  every preset. Mitigated by having `mini` literally reference the existing
  `LLM_*` constants + an equality test (AC2).
- **Two "size" knobs.** Model tier vs instance size can confuse. Mitigated by
  distinct headings + the hint's closing line ("capacity is set separately").
- **`gpt-5` price/latency** are estimates; flagged to re-verify at implementation.
  Numbers are teaching order-of-magnitude (consistent with 116/117/127).
