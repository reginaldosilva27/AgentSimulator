# Spec: Arena — realistic LLM latency (OpenAI-anchored decode)

| | |
|---|---|
| **ID** | 127-arena-llm-latency-calibration |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-24 |

## Problem / motivation

The Arena models a default agent call (2 000 in / 500 out) at **800 ms**. That
implies the model decodes at `LLM_DECODE_MS_PER_TOKEN = 1.0` → **1 000 tokens/s**,
which no OpenAI model comes close to. Real OpenAI output rates are ~80–150 tok/s
for the mini class and lower for the full models, so a 500-token completion takes
**~3.5–7 s**, not 0.8 s — the Arena's LLM is roughly **5–8× too fast**.

There is also an internal contradiction: the calibration comment already states "a
long generate (~500 tokens) takes 3–4 s", yet the decode slope makes exactly that
call land at 800 ms. Since 117 made latency a function of the call *shape* (and the
default shape's output IS 500 tokens), the per-call figure should honestly reflect
a 500-token generate.

This matters because latency is load-bearing: it drives the end-to-end turn time,
the closed-loop equilibrium rate (110), and the **held-in-flight streams** (113/118)
— the connection wall that sizes an agent backend. Understating decode by 5–8×
understates the very lesson the Arena exists to teach: slow model turns pin
connections open, so backends scale on streams long before CPU.

## Goals

- Recalibrate the decode (and TTFT) constants so the default agent call lands in
  the **OpenAI-defensible** range (gpt-4.1-mini class — consistent with the
  existing cost anchor, which already uses gpt-4.1-mini prices).
- Keep the calibration a **stated, cited teaching estimate** (the honesty banner
  already points at these constants), with the assumption written in the code.
- Retune the preset library so every preset stays defensible under the new,
  longer turns (backends provisioned for the honestly larger held-stream counts).

## Non-goals

- **No per-model latency** (varying decode by the selected model). The Arena has
  no model selector and adding one is a separate feature — deferred. The single
  blended figure is calibrated to the **gpt-4.1-mini** class (the implied model,
  matching the cost anchor), and the ℹ️/hint says so.
- **No capacity/quota/cost change.** Those are TPM- and price-derived and stay
  exactly as calibrated in 116/117 — this spec only touches the latency term.
- **No prefill-rate change.** Prefill (input processing) is not the bottleneck
  and its current ~20k tok/s is acceptable; left as-is (noted, not changed).
- No new `Stage`/`TraceEvent`; the Arena stays a pure frontend model (100, §3).

## User-facing behavior

- A default agent call now reads several seconds (not 800 ms); the LLM node's
  latency, the end-to-end turn readout, and the held-in-flight streams all rise
  to OpenAI-realistic figures.
- The presets still load "healthy" where they claimed to (their LLM tier status
  is unchanged — capacity, not latency, drives that), but their backends now show
  honestly higher held-stream counts and are provisioned accordingly.
- No labels change; any latency prose stays number-free (it already is). The
  calibration assumption is stated in the LLM ℹ️ explainer / code.

## Acceptance criteria

1. **AC1 — OpenAI-defensible default latency** — At the default shape
   (2 000 in / 500 out), the modeled per-call latency is in the **3–7 s** range
   (was 0.8 s), and `BENCHMARKS.llm.baseLatencyMs === llmBaseLatencyMsFor(DEFAULT_CALL_SHAPE)`
   still holds (117 parity).
2. **AC2 — decode dominates and is realistic** — `LLM_DECODE_MS_PER_TOKEN`
   corresponds to a **60–150 tok/s** output rate (i.e. 6.7–16.7 ms/token); the
   decode term (output × slope) is the largest component of the default call.
3. **AC3 — latency still linear in shape (117 preserved)** — Doubling output
   tokens still adds a proportional decode increment; capacity, quota and cost at
   any shape are **unchanged** from 116/117 (pinned: those tests stay green with
   their existing expected values).
4. **AC4 — held-in-flight rises honestly** — For a fixed design + load, the
   backend's held-in-flight (113) is strictly greater than before (longer turns
   pin more streams) — pinned with a before/after style assertion or an explicit
   expected figure.
5. **AC5 — presets stay defensible** — Every preset's stated `claims.llm` status
   still holds (unchanged), AND every llm-healthy preset's backend stays under
   its connection budget at equilibrium (the existing 118 test), retuning backend
   replicas where the longer turns now demand it.
6. **AC6 — the calibration is stated** — The new constants carry a comment citing
   the OpenAI output-rate assumption and the implied model (gpt-4.1-mini class),
   consistent with the honesty banner; any user-facing hint that implies a speed
   is bilingual (§4).

## Protocol / stage impact

- New/changed `Stage`(s): **none** — pure frontend model (100).
- Mirror in `frontend/src/types/events.ts`: n/a
- Station it maps to in `stations.ts`: n/a

## Open questions (clarify before planning)

*(resolved 2026-07-24 with the user)*

- [x] Recalibrate now? → Yes ("pode fazer esse ajuste").
- [x] Per-model latency? → Deferred (no Arena model selector yet); calibrate the
  single figure to the gpt-4.1-mini class (the cost-anchor model).
- [x] Target rate? → gpt-4.1-mini class, ~125 tok/s decode (8 ms/token), TTFT
  ~400 ms → default call ≈ 4.5 s (mid of the 3–7 s realistic band).

## Out of scope / deferred

- Per-model latency + an Arena model selector (own spec). → **Followed up by
  128-arena-model-tier**, which adds a per-node model-tier knob (nano/mini/
  standard/large) that scales this spec's mini anchor: nano faster, standard/large
  slower. This spec's 4.5 s figure is the `mini` anchor 128 multiplies from.
- Prefill-rate realism (big-context slowdown) — left as a future refinement.
- Streaming-vs-total nuance (the held-stream model already treats the full
  generate time as the hold, which is what matters for connections).
