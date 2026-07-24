# Plan: Arena — realistic LLM latency

> Frontend-only, pure-model change. Touches ONLY the latency term + preset tuning.

## Approach

Three constants in `components.ts`, plus the pinned literal and preset retuning:

| constant | before | after | meaning |
|---|---|---|---|
| `LLM_TTFT_MS` | 200 | **400** | first-token latency (hosted API, normal load) |
| `LLM_PREFILL_MS_PER_TOKEN` | 0.05 | 0.05 (unchanged) | ~20k tok/s prefill — not the bottleneck |
| `LLM_DECODE_MS_PER_TOKEN` | 1.0 | **8.0** | 125 tok/s decode — gpt-4.1-mini class |
| `BENCHMARKS.llm.baseLatencyMs` | 800 | **4500** | = `llmBaseLatencyMsFor(default)` (117 parity) |

Default call: `400 + 2000×0.05 + 500×8 = 400 + 100 + 4000 = 4500 ms` (≈ 4.5 s),
mid of the 3–7 s realistic band. Decode (4000 ms) dominates (AC2).

**Capacity / quota / cost are untouched** — they are TPM/price-derived
(`llmBaseCapacityFor`, `regionalLlmQuotaRpsFor`, `llmCostPerCallUsd`), so every
116/117 capacity/cost test keeps its exact expected value. Only latency-derived
figures move: node latency, `turnPathLatenciesMs`, `endToEndLatencyMs`,
`equilibriumRps`, `heldInFlight`.

**Preset retuning (AC5).** Longer turns pin more streams (Little's Law: held ≈
throughput × turn-time). `claims.llm` status is capacity-driven → unchanged, so
those assertions hold as-is. But the 118 test ("every llm-healthy preset's backend
< 70% of its connection budget at equilibrium") will fail where the turn grew:
bump those presets' backend `replicas` until green. This is the honest fix — the
connection wall (118) is exactly the lesson, and slower turns make it bite harder.
Determine the exact replica counts by running the suite and raising each failing
backend (no guessing in the spec; the test is the oracle).

Comments updated: the 116/117 calibration notes (the "≈1 ms/tok / 3–4 s / blended
800 ms" wording) rewritten to the new decode + the gpt-4.1-mini anchor (AC6).

## Affected files

**Frontend** (Arena only)
- `frontend/src/arena/components.ts` — the 3 latency constants + `BENCHMARKS.llm.baseLatencyMs`; calibration comments.
- `frontend/src/arena/examples.ts` — backend `replicas` retuned per preset where the 118 budget test now demands it.
- `frontend/src/arena/components.test.ts` — update the pinned `baseLatencyMs` expectation (was 800).
- `frontend/src/arena/model.test.ts` — any assertion pinning the old latency/e2e; add the AC4 held-rises check.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None (localStorage shape unchanged; persisted designs re-derive their latency).

## i18n strings (constitution §4)

No new strings and no number-bearing string changes (existing latency prose —
`e2eLatencyHint`, `payloadHint` — is already number-free). If the LLM ℹ️ explainer
gains a stated rate, it ships en + pt.

## Cloud map (constitution §5)

n/a — no new tier/station/kind.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `llmBaseLatencyMsFor(DEFAULT)` in [3000,7000] AND `=== BENCHMARKS.llm.baseLatencyMs`; update the pinned `toBe(800)` → new value | `components.test.ts` |
| AC2 | decode slope ⇒ 60–150 tok/s (`1000/slope`); decode term > TTFT + prefill at default | `components.test.ts` |
| AC3 | existing 116/117 capacity/quota/cost tests stay green unchanged; latency-linearity test stays green | `components.test.ts` |
| AC4 | a fixed `backend→llm` design: `heldInFlight(backend)` after > a recorded before-figure (or an explicit expected number for the new constants) | `model.test.ts` |
| AC5 | existing preset claims + 118 connection-budget tests pass after replica retune | `examples.test.ts` |
| AC6 | comment/constant present (soft — reviewed); any new hint en+pt | components.ts / i18n |

## Risks / trade-offs

- **Preset churn**: several backends need more replicas. That is honest (the 118
  lesson strengthens) but changes preset "shape" — keep each preset's *architecture*
  identical, only raise backend replicas (the connection-driven knob 118 already
  teaches). Note any bumped preset in its build comment.
- **Equilibrium shifts**: closed-loop rps drops (longer turns self-throttle more).
  Fine and expected — the header already shows demanded → effective.
- **No per-model variance**: a user picturing a fast model may still find 4.5 s
  high, or a reasoning-model user may find it low. Stated as a mini-class teaching
  constant; per-model is the deferred follow-up.
