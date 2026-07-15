# Plan: Prompt caching — capture and visualize cached tokens & the cost they save

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Observe-and-price, not implement. OpenAI prompt caching is automatic — the model
already caches the stable prefix (system prompt + tool schemas + skills catalog, which
`_assemble` in `openai_provider.py` already puts first) and reports the hit count in
`usage.prompt_tokens_details.cached_tokens`. LangChain surfaces this as
`usage_metadata["input_token_details"]["cache_read"]`. We are currently **dropping** it.

The change threads one new integer (`cached_tokens`) through the *exact* pipeline that
011-token-cost already built for tokens/cost — so this is deliberately small and low-risk:

1. **Capture** it in `TokenUsage.from_metadata` (backend seam #1).
2. **Price** it in `pricing.py`: add a cached input rate per model, and make
   `cost_usd` / `usage_metrics` bill `(prompt − cached)` at full rate + `cached` at the
   cached rate, exposing `cost_saved_usd`. This makes the *reported* cost the true cost.
3. **Emit** it: `usage_metrics` already runs on every LLM call (`agent.think` decide,
   `llm.generate`, `agent.verify`); it now also emits `cached_tokens` + `cost_saved_usd`
   in `metrics`. No node code changes — the three call sites already spread
   `usage_metrics(...)` into `rec.metrics`.
4. **Project** it: extend `TurnUsage` + `tallyUsage` (`frontend/src/lib/usage.ts`) to
   sum `cachedTokens` / `costSavedUsd` across the turn's LLM calls, mirroring the token
   totals, so the HUD/canvas/traces stay in four-way parity (see the token-totals parity
   memory).
5. **Render** it: LLM station readout (`readoutFor` in FlowCanvas) + the LLM inspector /
   context-usage panel show "N cached · −$X (−Y%)" when `cachedTokens > 0`, and a short
   "below cache threshold / first call" hint when a real LLM call ran but cached is 0.

**Why not a new Stage?** The data is a property of an LLM call that already has a Stage
and already carries `metrics`. Adding a Stage would be dishonest (nothing new *happens*
in the pipeline) and would drag in the whole exhaustive-map ritual. 011 and 036 set the
precedent: enrich existing LLM metrics, no protocol enum change.

**Alternatives considered.** (a) A dedicated `llm.cache` Stage — rejected: no real
distinct step, violates "a Stage is a real pipeline step". (b) Manual `cache_control` —
N/A for OpenAI (automatic) and out of scope. (c) Computing savings only on the frontend
from raw cached tokens — rejected: pricing already lives in `pricing.py` (single source
of truth for rates); the FE must not re-encode the price table.

## Affected files

**Backend**
- `backend/app/llm/provider.py` — add `cached_tokens: int = 0` to `TokenUsage`;
  `from_metadata` reads `md["input_token_details"]["cache_read"]` (defensively, default 0).
- `backend/app/llm/pricing.py` — add cached input rate per model (extend `MODEL_PRICES`
  tuple or a parallel `CACHED_INPUT_PRICES` map — see Data model note); update `cost_usd`
  to accept `cached_tokens` and split the input billing; add `cost_saved_usd`; extend
  `usage_metrics` to emit `cached_tokens` + `cost_saved_usd`.
- (No changes to `graph.py` — the three `usage_metrics(...)` call sites already merge the
  returned dict into `rec.metrics`.)

**Frontend**
- `frontend/src/lib/usage.ts` — `TurnUsage` gains `cachedTokens` + `costSavedUsd`;
  `tallyUsage` sums them over the LLM-call END events; `cumulativeUsage` folds them too.
- `frontend/src/lib/cost.ts` — a small `formatSaved`/percent helper (reuse `formatTokens`).
- `frontend/src/components/FlowCanvas.tsx` (`readoutFor` LLM case) — cache readout line.
- LLM inspector panel + context/usage panel (whichever renders `TurnUsage`) — "cached"
  line with tokens + discounted cost + saved.
- `frontend/src/i18n/strings.ts` (or the relevant `{en,pt}` source) — new labels.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — **no change** (`metrics: dict[str, float]` is open).
- `frontend/src/types/events.ts` — **no change** (`metrics` is `Record<string, number>`).
- Emitted in: existing `agent.think` / `llm.generate` / `agent.verify` via
  `usage_metrics` (no node edits).
- Mapped to station: existing **LLM** station — no new mapping.
- `readoutFor` (FlowCanvas) + inspector: **extend the existing LLM case** (not a new
  StationId case) — no exhaustiveness change.

## Data model changes

None. No Chroma change, no SQLite table/column change, no migration. `trace_events`
persists the enriched `metrics` automatically (it stores the whole event). Pricing:
prefer a **separate `CACHED_INPUT_PRICES: dict[str, float]`** map keyed by model (USD per
1M cached input tokens) so the existing `(input, output)` tuple shape and its consumers
stay untouched; a missing entry ⇒ cached billed at full input rate (saved 0).

Cached rates to seed (labelled teaching approximation, USD / 1M input tokens):
`gpt-4o-mini` 0.075 · `gpt-4o` 1.25 · `gpt-4.1` 0.50 · `gpt-4.1-mini` 0.10 ·
`gpt-4.1-nano` 0.025. (Gemini/Ollama: omit ⇒ saved 0, honest.)

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| llm readout cached | `{n} cached` | `{n} em cache` |
| llm saved | `saved {amount} ({pct})` | `economizou {amount} ({pct})` |
| inspector cached line label | `Cached tokens` | `Tokens em cache` |
| inspector saved label | `Saved vs. all-fresh` | `Economia vs. tudo novo` |
| cold hint | `Below cache threshold (first / small call)` | `Abaixo do limiar de cache (1ª chamada / pequena)` |
| tooltip | `Repeated prefix billed at a discount (automatic prompt caching)` | `Prefixo repetido cobrado com desconto (cache de prompt automático)` |

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `from_metadata` reads `cache_read`; absent ⇒ 0 | `backend/tests/test_pricing.py` (or `test_provider.py`) |
| AC2 | split billing + `cost_saved_usd`; unlisted model ⇒ full rate, saved 0 | `backend/tests/test_pricing.py` |
| AC3 | `usage_metrics` emits `cached_tokens` + `cost_saved_usd` (0.0 when none) | `backend/tests/test_pricing.py` |
| AC4 | `tallyUsage` sums `cachedTokens`/`costSavedUsd`; absent ⇒ 0 | `frontend/src/lib/usage.test.ts` (+ keep `derive.usage.test.ts` green) |
| AC5 | LLM readout shows cache line iff `cachedTokens>0` | `frontend/src/lib/cost.test.ts` / a FlowCanvas readout test |
| AC6 | multi-round run reports `cached_tokens>0` and effective input cost < all-fresh | `backend/tests/test_agent.py` — `@pytest.mark.openai`, structural |
| AC7 | both en+pt present | i18n-auditor / existing i18n parity test |

All backend token/cost tests are keyless (synthetic `usage_metadata`) except AC6, which
is `@pytest.mark.openai` and asserts structurally (cache observed + saving > 0), never a
fixed token count — to tolerate model variability and the 1024-token threshold. Guard
AC6 so it needs a prompt ≥ 1024 tokens (multi-round with a retrieval ToolMessage);
document that a sub-threshold cold call legitimately yields 0.

## Risks / trade-offs

- **Threshold flakiness (AC6).** OpenAI only caches ≥ 1024-token prompts and cache
  warmth has a TTL; a run could report 0 cached. Mitigate: drive a multi-round ReAct turn
  whose repeated prefix is comfortably > 1024 (measured stable prefix ≈ 897 tokens, so
  include tools + a retrieval round), and assert `>= 0` with the *saving-is-consistent*
  invariant rather than requiring a hit on a specific call; if the environment yields no
  hit, xfail-with-reason rather than assert a false positive.
- **Rate drift.** Cached prices are approximations and will drift — same caveat the
  existing price table already carries; keep the "labelled teaching approximation" note.
- **Parity.** `cost_usd` now depends on cached tokens; the four-way token-total parity
  (HUD / BRAIN / Context / traces, per the parity memory) must keep agreeing — extend the
  parity test, don't just the readout.
- **Provider variance.** Ollama/Vertex may not report cached tokens; defaulting to 0
  keeps them honest (no fabricated savings), already covered by AC1's absent-field path.
