# Spec: Arena — agent-turn latency (e2e counts serialized model calls)

| | |
|---|---|
| **ID** | 109-arena-agent-latency |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The end-to-end latency readout (103 AC5) models a *generic* request graph, not an
*agent turn*, and systematically underestimates the number an architect cares about:

1. **`callsPerRequest` is ignored by latency.** The throughput model correctly
   multiplies arrivals by `cpr` (a ReAct turn makes 2–5 model calls), but the latency
   model charges the LLM **once**. Three serialized model calls are ≥ 3× the model's
   queued latency — this is *the* reason agent products feel slow, and the Arena
   currently hides it.
2. **Siblings are treated as parallel when an agent turn is sequential.** From the
   backend, `retrieve` (cache → vector DB) and `generate` (gateway → LLM) are drawn
   as sibling branches, and the e2e takes the *slowest branch* (`max`). In a real
   turn they happen in sequence: retrieve **then** generate. The retrieval branch's
   latency silently disappears from the readout.

Audit example: `scale-llm` (LLM at 60%, cpr=2) reports ~2s e2e; an honest agent turn
is backend + retrieval + 2 × 2s of model latency ≈ 4+ s.

## Goals

- The e2e readout models an **agent turn**: a node visited `cpr` times contributes
  `cpr ×` its latency; stages the backend orchestrates sum in sequence.
- Pool fan-outs stay parallel: alternatives behind a router are one call landing on
  one pool — slowest-branch (`max`) remains correct there.
- Presets' e2e numbers re-pinned to the honest math.

## Non-goals

- No change to throughput/utilization/shed math (`computeMetrics` untouched).
- No closed-loop feedback (that is 110, which consumes this function).
- No UI redesign — same readout, honest number, plus an explaining hint.

## User-facing behavior

- The `End-to-end latency` figure grows to reflect serialized model calls (e.g.
  `scale-llm` roughly doubles). The hint under it explains: "an agent turn serializes
  its model calls — k calls ≈ k × model latency", en + pt.

## Acceptance criteria

1. **AC1 — cpr multiplies latency** — For a chain `client → backend → llm(cpr=k)`,
   e2e = client + backend + k × llm latency (pinned numerically for k = 1, 2, 3).
2. **AC2 — cpr on a router multiplies the routed branch** — For `backend →
   aiGateway(cpr=k) → llm`, e2e charges k × (gateway + llm) — each model call
   traverses the gateway; the LLM node itself needs no cpr (no double count).
3. **AC3 — backend children sum; router children max** — With `backend → {llm branch,
   cache→vectorDb branch}`, e2e = backend + (llm branch) + (cache branch). With a
   router fanning to two LLM pools, e2e uses the slowest pool only.
4. **AC4 — presets re-pinned** — `examples.test.ts` e2e expectations updated to the
   new math; every preset description that cites a latency stays truthful.
5. **AC5 — bilingual** — the new hint resolves in en and pt.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Which kinds serialize their children? → **`backend` only** (it orchestrates the
  turn). Routers (`loadBalancer`, `aiGateway`) keep `max` (alternative pools); every
  other kind keeps `max` (pass-through chains have single children anyway).
- [x] Does a cache's hit ratio discount the missed branch's latency? → **No (v1)** —
  charge the full miss path (worst-case turn). Simplification stated in the hint;
  a percentile model is out of scope.
- [x] Recursive definition? → `pathLatency(n) = cpr(n) × (latency(n) +
  combine(children))`, combine = Σ for backend, max otherwise. Client cpr is 1.

## Out of scope / deferred

Percentiles, hit-ratio-weighted expected latency, closed-loop equilibrium (110).
