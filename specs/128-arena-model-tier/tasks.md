# Tasks: Arena model tier (nano / mini / standard / large)

> Ordered TDD checklist. Each implement task is preceded by the failing test that
> drives it (red → green → refactor). Frontend-only; run tests from `frontend/`.

## Tasks

- [x] **T1 — test first (AC2, AC3, AC4, AC8)**: in `components.test.ts`, assert
  `MODEL_TIER_PROFILE.mini` equals the existing `LLM_*` constants; that
  `llmBaseLatencyMsFor(shape,"mini")` and `llmCostPerCallUsd(shape,"mini")` equal
  the no-arg (current) values; latency + cost strictly increasing nano<mini<
  standard<large; and no tier UI string contains a param-count (`/\d+\s*B/`,
  `billion`).
- [x] **T2 — implement**: add `ModelTier`, `MODEL_TIERS`, `DEFAULT_MODEL_TIER`,
  `MODEL_TIER_SKU`, `MODEL_TIER_PROFILE` (mini = existing constants) to
  `components.ts`; extend `llmBaseLatencyMsFor(shape, tier="mini")` +
  `llmCostPerCallUsd(shape, tier="mini")`. Make T1 green.
- [x] **T3 — test first (AC5)**: in `model.test.ts`, build a one-LLM design and
  assert `computeMetrics` capacity (calls/s) is identical across all four tiers
  for the same size/region/shape, while latency differs.
- [x] **T4 — implement**: `ArenaNodeSpec.modelTier?`; thread tier through
  `baseLatencyMsOf` (llm) + the two call sites + LLM cost aggregation in
  `model.ts` (`sp.modelTier ?? "mini"`). Make T3 green; T1 still green.
- [x] **T5 — test first (AC1, AC7)**: in `store.test.ts`, a node created without
  `modelTier` reads `mini`; hydrating a persisted design missing `modelTier`
  back-fills `mini`; `setModelTier` updates the node and re-persists to
  localStorage.
- [x] **T6 — implement**: `store.ts` — default LLM `modelTier=mini` on create,
  back-fill on load, `setModelTier` action + `isModelTier` guard. Make T5 green.
- [x] **T7 — test first (AC6, AC7)**: in `ArenaCanvas.integration.test.tsx`,
  selecting an LLM node shows a "Model tier" control with the 4 tiers + SKU
  sublabels + hint; clicking `Large` raises the node Latency readout, the header
  End-to-end latency and the LLM cost.
- [x] **T8 — implement**: render the Model tier segmented control in the LLM
  ScalePanel (`ArenaCanvas.tsx`), wired to `setModelTier`, with SKU sublabels +
  ℹ️ hint. Make T7 green.
- [x] **T9 — byte-for-byte guard (AC2)**: in `examples.test.ts`, assert a preset's
  full computed metrics are unchanged by this feature (all default to `mini`).
- [x] **T10 — i18n (§4)**: control heading, 4 tier labels, hint in **en + pt**
  (`components.ts` / `strings.ts`). SKU strings stay untranslated.
- [x] **T11 — refactor**: dedupe, keep every test green; confirm the `mini` profile
  is the single source for the old `LLM_*` constants (no duplicated magic numbers).

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [~] `npm test` (Vitest): all 128 tests green + 245/247 total. The 2 reds
  (`examples.test.ts` 118-AC5 backend stream budget, `ArenaPage.test.tsx` 108
  saturation notice) are **pre-existing**, caused by the uncommitted spec-127
  latency recalibration (`baseLatencyMs 800→4500`), NOT by 128 (which is
  byte-for-byte for the `mini` anchor). Stashing all frontend edits back to HEAD
  makes both pass; they must be fixed as part of finishing 127.
- [x] No protocol change (Arena pure model) — `schemas.py` ↔ `events.ts` untouched
- [x] All new user-facing text exists in en **and** pt (§4)
- [x] `mini` path is byte-for-byte identical to pre-128 (presets/examples unchanged)
- [x] `spec.md` status updated to `done`
