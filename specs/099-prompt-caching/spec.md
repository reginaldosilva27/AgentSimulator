# Spec: Prompt caching — capture and visualize cached tokens & the cost they save

| | |
|---|---|
| **ID** | 099-prompt-caching |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-14 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The simulator already makes the *shape of cost* visible (rounds × tokens × rate,
011-token-cost) — but it only ever shows the **list price** of input tokens, as if
every token were billed fresh. That is not how the real bill works. OpenAI applies
**automatic prompt caching**: when a prompt's stable prefix (system prompt + tool
schemas + skills catalog, which this app already puts first) is re-sent, the cached
portion of the input tokens is billed at a **steep discount** (~50% off for the
`gpt-4o` family, ~75% off for the `gpt-4.1` family). The provider reports exactly how
many tokens were served from cache in `usage.prompt_tokens_details.cached_tokens`.

Today the app **throws that number away** (`TokenUsage.from_metadata` reads only
`input/output/total`), so it silently over-reports cost and misses one of the most
important production cost levers. For a teaching tool whose whole premise is
"everything is real, see the true cost", that is a real gap: a learner never sees that
a multi-round ReAct loop or a multi-turn conversation gets *cheaper per call* because
the prefix is cached.

This spec closes that gap: **capture the real `cached_tokens`, price the cached portion
at its discounted rate, and surface "N tokens cached · saved $X (Y%)"** so caching stops
being invisible and becomes a thing the learner can watch happen.

## Goals

- Read the real cached-token count the provider already reports and carry it through
  the existing usage/metrics pipeline (additive on today's `llm.prompt` / `llm.generate`
  metrics — **no new Stage**).
- Price the cached portion of input tokens at a discounted rate so `cost_usd` reflects
  the *true* cost, and expose the money saved vs. the all-fresh price.
- Surface, in the LLM station readout and its inspector, how many tokens were cached
  and how much that saved — per call and per turn — bilingual (en + pt).
- Make the payoff **demonstrable**: a realistic run (multi-round ReAct, or turn 2 of a
  conversation) shows `cached_tokens > 0` and a lower effective cost than the cold call.
- Stay honest about the threshold: OpenAI only caches prompts ≥ 1024 tokens, so a small
  cold call legitimately reports `0 cached` — the UI must show that truthfully, not fake
  a hit.

## Non-goals

- **Not** implementing our own cache or any explicit cache-control API. OpenAI caching
  is automatic; we only *observe and price* it. (Anthropic-style manual `cache_control`
  is out of scope — this project is OpenAI/real-provider only.)
- **Not** restructuring the prompt to force cache hits beyond what already exists. The
  app already puts the stable prefix first; we may *document* the ordering, but changing
  it is out of scope here.
- **Not** invoice-accurate billing. Cached rates go into the same **labelled teaching
  approximation** price table as the existing list prices.
- **Not** a new Stage, station, hop, or tier. Purely additive data on existing LLM
  stages + readout/inspector rendering.
- Ollama / Vertex providers: cached-token capture is best-effort — if a provider does
  not report cached tokens, the value is `0` and the UI shows no savings (no crash, no
  fabricated number).

## User-facing behavior

- **LLM station readout** (FlowCanvas): when a turn served tokens from cache, the LLM
  tile shows a compact readout, e.g. `1.2k cached · −$0.0003 (−74%)`. Zero cached ⇒ the
  cache readout is absent (unchanged from today).
- **LLM inspector / Execution traces**: the per-turn usage panel gains a "cached" line
  (cached tokens, discounted cost, amount saved vs. all-fresh). The cost estimate stays
  the discounted, true cost.
- **Honest cold state**: on a sub-1024-token cold call the panel shows `0 cached` (with
  a short "below cache threshold / first call" hint), so the learner understands *why*
  the second call is cheaper.
- All new prose (`cached`, `saved`, `below cache threshold`, tooltips) ships in **en +
  pt** (constitution §4).

## Acceptance criteria

1. **AC1 (backend — capture)** — Given LangChain `usage_metadata` that includes
   `input_token_details.cache_read = C`, when `TokenUsage.from_metadata` parses it, then
   the resulting `TokenUsage` carries `cached_tokens == C`; when the field is absent,
   `cached_tokens == 0` (back-compat).
2. **AC2 (backend — pricing)** — Given a model with a listed cached input rate and a
   `TokenUsage` with `cached_tokens = C` of `prompt_tokens = P`, when cost is computed,
   then the input cost bills `(P − C)` at the full input rate **plus** `C` at the cached
   rate (never double-counted), and a `cost_saved_usd` equal to `C × (full − cached)`
   rate is exposed. A model with no listed cached rate falls back to the full input rate
   for cached tokens (saved = 0), never crashes.
3. **AC3 (backend — metrics surface)** — Given an LLM call with cached tokens, when
   `usage_metrics` builds the trace `metrics`, then it includes `cached_tokens` and
   `cost_saved_usd` (both floats) alongside the existing keys, and the values are 0.0
   when nothing was cached.
4. **AC4 (frontend — projection)** — Given a turn's trace events whose LLM metrics carry
   `cached_tokens` / `cost_saved_usd`, when `tallyUsage` folds the turn, then `TurnUsage`
   exposes `cachedTokens` and `costSavedUsd` summed across every LLM call of the turn;
   absent metrics ⇒ both are 0 (back-compat, existing tests stay green).
5. **AC5 (frontend — readout)** — Given `cachedTokens > 0` for a turn, when the LLM
   station renders, then its readout shows the cached-token count and the saved amount/%;
   given `cachedTokens == 0`, no cache readout is shown.
6. **AC6 (demo of the cost win)** — Given a run where the same stable prefix is sent more
   than once (a multi-round ReAct turn, i.e. ≥ 2 `agent.think` decide calls over a prompt
   ≥ 1024 tokens), when the trace is inspected, then at least one later LLM call reports
   `cached_tokens > 0` and the turn's effective input cost is **strictly less** than the
   same tokens priced entirely at the full input rate. (Structural `@pytest.mark.openai`
   test — asserts the *shape*: cache read observed + saving > 0, tolerating model
   variability.)
7. **AC7 (i18n)** — Every new user-facing string exists in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — additive `metrics` keys (`cached_tokens`,
  `cost_saved_usd`) on the existing `agent.think` (llm.prompt), `llm.generate`, and
  `agent.verify` LLM calls, exactly like 011-token-cost / 036-context-budget added keys
  without a new Stage.
- Mirror in `frontend/src/types/events.ts`: **n/a** — `metrics` is an open
  `Record<string, number>`; no enum change. (`TraceEvent`/`Stage` unchanged.)
- Station it maps to in `stations.ts`: **none new** — the numbers render on the existing
  **LLM** station readout + inspector.

## Open questions (clarify before planning)

<!-- all resolved -->

- [x] Manual cache-control vs. observe-only? → **Observe-only.** OpenAI caching is
  automatic; we capture + price what the provider reports. (Non-goal above.)
- [x] New Stage or additive metrics? → **Additive metrics** on existing LLM stages,
  matching 011/036. No protocol enum change.
- [x] Where do cached prices live? → In `pricing.py`'s existing `MODEL_PRICES` table as a
  labelled teaching approximation (add a cached input rate per model).
- [x] Below-1024 cold calls? → Report `0 cached` honestly with a short hint; never fake a
  hit. Covered by AC5 (zero path) + AC1 (absent field ⇒ 0).

## Out of scope / deferred

- Cross-turn cache warmth badge on the Chat HUD (cumulative "$ saved this session") —
  natural follow-up once `TurnUsage.costSavedUsd` exists; a later spec.
- Vertex/Gemini "context caching" (a different, explicit mechanism) — best-effort 0 here;
  its own spec if we want to model it for real.
- Re-capturing the mocked GitHub Pages demo fixtures (058) to show the cache readout —
  tracked as a task, per the standing demo-recapture directive, but the visual capture is
  a follow-up, not an AC.
