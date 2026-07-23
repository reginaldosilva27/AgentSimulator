# Plan: 117-arena-llm-call-shape

## Approach

Introduce a `CallShape { inputTokens, outputTokens }` carried on `ArenaDesign`
(optional — absent means the default, so every existing call site and persisted
blob keeps working). The LLM tier's three shape-dependent numbers become pure
functions of the shape in `components.ts`; `model.ts` threads `design.callShape`
through capacity, latency, quota and cost. The UI is one new control-bar
popover.

**Calibration (all anchored to the 116 numbers so the default is byte-for-byte):**

- `DEFAULT_CALL_SHAPE = { inputTokens: 2000, outputTokens: 500 }` (the stated
  2.5k-token agent call).
- `LLM_DEPLOYMENT_TPM_MEDIUM = 22_500_000` — implied by 116: 150 calls/s ×
  2,500 tok × 60 s. `llmBaseCapacityFor(shape) = TPM/60/tokens` → 150 at default.
- Latency decomposition calibrated to the blended 800 ms at the default shape:
  `LLM_TTFT_MS = 200` (fixed overhead) + input × `LLM_PREFILL_MS_PER_TOKEN =
  0.05` (≈20k tok/s prefill) + output × `LLM_DECODE_MS_PER_TOKEN = 1.0`
  (blended decode across the turn's mixed rounds — teaching value, stated in
  comments): 200 + 100 + 500 = 800 ✓.
- `llmCostPerCallUsd(shape)` from `LLM_INPUT_USD_PER_MTOK = 0.40` /
  `LLM_OUTPUT_USD_PER_MTOK = 1.60` (gpt-4.1-mini global) → $0.0016 ✓.
  `LLM_COST_PER_CALL_USD` (the constant) is removed; `llmCost` takes the shape.
- `REGIONAL_LLM_TPM = 450_000_000` — implied by 116: 3,000 calls/s × 2,500 ×
  60. `regionalLlmQuotaRpsFor(shape) = TPM/60/tokens` → 3,000 at default.
  `REGIONAL_LLM_QUOTA_RPS` stays exported (= at-default value) for hints/tests.

`BENCHMARKS.llm` keeps `{150, 800}` as the default-shape anchor; a test pins
`llmBaseCapacityFor(DEFAULT_CALL_SHAPE) === BENCHMARKS.llm.baseCapacity` (and
same for latency) so the two can never drift.

## Affected files

- `frontend/src/arena/components.ts` — `CallShape`, `DEFAULT_CALL_SHAPE`,
  `CALL_SHAPE_BOUNDS`, the TPM/price/latency constants + the four derived
  functions; refresh LLM `info` copy to mention the configurable payload (en+pt).
- `frontend/src/arena/model.ts` — `ArenaDesign.callShape?`; `effectiveCapacity`
  gains an optional `shape` param (llm only); `computeMetrics`, `quotaFactorsFor`
  and `llmCost` read `design.callShape ?? DEFAULT_CALL_SHAPE`; llm base latency
  from `llmBaseLatencyMsFor`.
- `frontend/src/arena/store.ts` — `callShape` in `ArenaState` (persisted,
  validated in `loadArena`); `setCallShape` (clamped, structural — clears
  `exampleId`); `loadExample`/`loadDesign` reset to default; every
  `equilibriumRps({nodes, edges, callShape}, …)` call site threads it.
- `frontend/src/arena/ArenaPage.tsx` — the Payload popover (button + panel with
  two sliders + derived readout); design objects include `callShape`.
- `frontend/src/arena/ArenaCanvas.tsx` — `computeMetrics`/`ScalePanel` design
  objects include `callShape` (capacity line reflects the shape).
- `frontend/src/i18n/strings.ts` — `arena.payload*` strings (en+pt);
  `llmCostHint` re-worded to "at the configured call shape".
- Tests: `components.test.ts` (AC1–AC3), `model.test.ts` (AC4 parity + shape
  squeeze), `store.test.ts` (AC5), `ArenaPage.test.tsx` (AC6).

## Test strategy (AC → test)

- AC1–AC3 → `components.test.ts`: pin defaults ↔ BENCHMARKS, halving/doubling
  arithmetic, cost/quota formulas.
- AC4 → `model.test.ts`: a fixed design evaluated with `callShape` absent vs
  explicit default → identical metrics maps; with a 4× heavier shape → llm
  capacity ÷4, higher latency/cost.
- AC5 → `store.test.ts`: persist/load round-trip, garbage → default, clamps,
  `exampleId` cleared, `loadExample` resets.
- AC6 → `ArenaPage.test.tsx`: popover opens, slider edits update the readout +
  store.

## Protocol / i18n / cloud impact

None / all new prose en+pt / no new tier-station.

## Risks

- Persisted pre-117 designs have no `callShape` → validated default; behavior
  unchanged (AC4).
- The demo build (058) captures no Arena traces — no fixture re-capture needed.
