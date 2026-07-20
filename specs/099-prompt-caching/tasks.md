# Tasks: Prompt caching — capture and visualize cached tokens & the cost they save

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Backend — capture & price

- [x] **T1 — test first (AC1)**: `test_from_metadata_reads_cached_tokens` +
  `test_from_metadata_cached_tokens_defaults_to_zero` in `backend/tests/test_pricing.py`.
- [x] **T2 — implement (AC1)**: `cached_tokens: int = 0` on `TokenUsage`; `from_metadata`
  reads `input_token_details.cache_read` (`provider.py`).
- [x] **T3 — test first (AC2)**: `test_cost_usd_bills_cached_tokens_at_discount`,
  `test_cost_usd_default_keeps_011_signature`,
  `test_cost_usd_unlisted_cached_rate_falls_back_to_full`.
- [x] **T4 — implement (AC2)**: `CACHED_INPUT_PRICES` map + seed rates; `cost_usd(..., cached_tokens=0)`
  splits the input billing; `cost_saved_usd` helper (`pricing.py`).
- [x] **T5 — test first (AC3)**: `test_usage_metrics_includes_cached_keys`,
  `test_usage_metrics_zero_cached_is_zero_not_missing`.
- [x] **T6 — implement (AC3)**: `usage_metrics` passes cached tokens into `cost_usd` and
  emits `cached_tokens` + `cost_saved_usd` (`pricing.py`).

## Frontend — projection & render

- [x] **T7 — test first (AC4)**: `usage.test.ts` — sums `cachedTokens`/`costSavedUsd`;
  absent ⇒ 0; existing shape assertions updated. `derive.usage.test.ts` stays green.
- [x] **T8 — implement (AC4)**: `cachedTokens`/`costSavedUsd` on `TurnUsage`,
  `CumulativeUsage`, `UsageTotals`; summed in `tallyUsage` + `cumulativeUsage`;
  `ZERO_USAGE` updated.
- [x] **T9 — test first (AC5)**: `cost.test.ts` `formatPct` + `FlowCanvas.readout.test.ts`
  cache-saving readout (present iff `cachedTokens>0`).
- [x] **T10 — implement (AC5)**: `formatPct` in `cost.ts`; `readoutFor` LLM case appends
  the cache saving; InspectorPanel LLM usage panel gains cached/saved lines + cold hint.

## Cross-cutting gates

- [x] **T11 — protocol mirror**: n/a — no `Stage`/`schemas.py`/`events.ts` change (metrics
  map is open). Confirmed no protocol drift.
- [x] **T12 — i18n (AC7)**: `cachedSaving` readout + `cachedTokens`/`saved`/`cacheColdHint`
  inspector labels in en + pt; enforced by `tsc` (both blocks typed `Strings`).
- [x] **T13 — cloud map**: n/a — no new tier/station.
- [x] **T14 — openai demo test (AC6)**: `test_prompt_caching_metrics_are_present_and_consistent`
  — warms the cache, then asserts a later LLM call reports `cached_tokens > 0` and
  effective input cost < all-fresh; xfail-with-reason if no hit. Passed live.
- [x] **T15 — refactor**: `ruff format` applied; all green.
- [x] **T16 — demo recapture**: re-captured all 88 mocked 058 fixtures against the live
  backend (`scripts/capture_demo_traces.py`). Real cache hits (1024–1920 cached tokens)
  across nearly every scenario incl. the default `rag.simple`; the 8 `verify` fixtures
  stay honestly cold (terse persona ⇒ system prefix < 1024). Demo fixture tests + tsc green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` + `ruff format .` clean
- [x] `pytest -q` green (keyless token/cost tests; AC6 `[openai]` passed live)
- [x] `npm run build` passes (`tsc --noEmit` + build) and `npm test` green (764 tests)
- [x] Protocol mirror in sync (no change here), every Stage still mapped to a station
- [x] All new user-facing text exists in en **and** pt
- [x] Four-way token-total parity still holds (HUD / BRAIN / Context / traces)
- [x] `spec.md` status updated to `done`
