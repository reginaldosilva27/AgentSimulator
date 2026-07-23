# Spec: Arena LLM call shape — visible, customizable input/output tokens

| | |
|---|---|
| **ID** | 117-arena-llm-call-shape |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena's whole LLM tier is calibrated to ONE fixed, invisible call shape:
~2,000 input + 500 output tokens (≈2.5k tokens/call). That assumption drives
three load-bearing numbers — a deployment's calls/s (quota is TPM, so capacity =
TPM ÷ tokens/call), the blended per-call latency (~0.8 s), and the per-call cost
($0.0016) — yet it only appears in code comments and one ℹ️ hint.

Real agent calls are usually **bigger**: a long system prompt, conversation
history, retrieved chunks and tool schemas easily push input to 6–10k tokens,
which simultaneously *cuts a deployment's calls/s* (same TPM buys fewer calls),
*raises latency* and *raises cost*. Users reviewing the Arena (2026-07-23)
couldn't see the assumed payload anywhere, and couldn't model their own heavier
prompts.

## Goals

- Surface the assumed call shape (input/output tokens) in the Arena control bar
  as a first-class, editable **workload** setting (global — the shape belongs to
  the workload, not to one pool).
- Derive the three dependent numbers from the shape, consistently: per-deployment
  calls/s (TPM ÷ tokens), blended per-call latency, per-call cost — and the
  regional quota (also TPM-denominated).
- Keep the default shape byte-for-byte identical to today's behavior (2,000 in +
  500 out → medium = 150 calls/s, 800 ms, $0.0016/call, 3,000 calls/s regional
  quota).

## Non-goals

- No per-node/per-pool shape override (one workload, one shape — v1).
- No tokenizer or real prompt measurement; the shape is a stated modeling input.
- No backend/protocol change (Arena stays frontend-only, §3-honest).

## User-facing behavior

- The control bar gains a **Payload** control showing the current shape
  ("2k in / 500 out"). Clicking it opens a small panel with two sliders
  (input tokens 200–16,000; output tokens 100–4,000) and a live derived readout:
  tokens/call, per-medium-deployment calls/s, and cost per call — with a
  bilingual explainer of WHY the three move together (quota is TPM; latency
  follows output; cost follows both).
- Bigger payloads visibly squeeze the whole LLM tier: capacity drops, latency
  and cost rise, the closed-loop equilibrium recomputes on every change.
- Editing the shape deselects the Examples dropdown (the canvas no longer
  behaves like the preset); loading an example resets the shape to the default
  (presets' pinned claims stay true).
- The shape is persisted with the design (localStorage) and validated on load.

## Acceptance criteria

1. **AC1 — derived capacity.** `llmBaseCapacityFor(shape)` = medium-deployment
   TPM anchor ÷ 60 ÷ (input+output); at the default shape it equals
   `BENCHMARKS.llm.baseCapacity` (150); doubling tokens/call halves it.
2. **AC2 — derived latency.** `llmBaseLatencyMsFor(shape)` grows linearly with
   both input (prefill) and output (decode) tokens and equals
   `BENCHMARKS.llm.baseLatencyMs` (800) at the default shape.
3. **AC3 — derived cost & quota.** `llmCostPerCallUsd(shape)` = input×$0.40/M +
   output×$1.60/M (default → $0.0016); `regionalLlmQuotaRpsFor(shape)` = the
   regional TPM cap ÷ 60 ÷ tokens/call (default → 3,000). `llmCost` and
   `quotaFactorsFor` use them.
4. **AC4 — back-compat.** A design with no `callShape` (or the default one)
   produces byte-identical `computeMetrics` / `endToEndLatencyMs` /
   `equilibriumRps` results to pre-117 (every existing preset claim untouched).
5. **AC5 — store round-trip.** `callShape` persists to and loads from
   localStorage with bounds validation (garbage → default); `setCallShape`
   clamps to the slider bounds, recomputes the equilibrium and clears
   `exampleId`; `loadExample` resets the shape to default.
6. **AC6 — control bar.** The Payload control renders the current shape and
   the panel edits it; the derived readout (calls/s per medium deployment,
   $/call) updates live; all new prose ships en + pt.

## Protocol / stage impact

- New/changed `Stage`(s): **none** (Arena is frontend-only; no TraceEvents).
- Mirror in `frontend/src/types/events.ts`: n/a.
- Station mapping: n/a.

## Open questions (clarify before planning)

*(resolved with the user, 2026-07-23)*

- ~~Where do the token knobs live?~~ → Global, in the control bar (the shape is
  a property of the workload; per-node overrides rejected for v1).
- ~~Why is the experienced latency higher than the box suggests?~~ → Big system
  prompts + history mean bigger input; the knob lets users model exactly that.
