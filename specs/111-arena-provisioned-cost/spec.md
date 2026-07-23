# Spec: Arena — provisioned LLM cost (idle fleets are not free)

| | |
|---|---|
| **ID** | 111-arena-provisioned-cost |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The LLM cost readout (103 AC6) prices **served calls only** (`throughput ×
$0.0016/call`). Two consequences anti-teach real LLM economics:

1. **An idle fleet costs $0.** Sixty provisioned "large" deployments with zero
   traffic display no cost at all — the exact opposite of provisioned-throughput
   economics (Azure PTUs, Bedrock provisioned throughput, dedicated capacity),
   where reserved capacity bills while idle. "Headroom is free" is the wrong
   lesson to hand a student right before a challenges module scores cost.
2. **Cost freezes at saturation** (shed calls aren't billed), so a design that drops
   traffic looks *cheaper* than one that serves it.

Real fleets pay two bills: a **provisioned** one (per deployment, per hour,
regardless of traffic) and/or a **usage** one (per token/call). The Arena should
show both so over-provisioning has a visible price and the PTU-vs-pay-per-token
trade-off becomes legible.

## Goals

- LLM cost = **provisioned $/h** (per deployment × size, load-independent) +
  **usage $/h** (per served call, as today).
- Both figures visible; assumptions stated in the hint (order-of-magnitude teaching
  constants, same honesty framing as `LLM_COST_PER_CALL_USD`).
- The constants are calibrated so the trade-off is real: a busy deployment is
  cheaper provisioned; an idle one is cheaper pay-per-call.

## Non-goals

- No cost for non-LLM components (deferred, as in 103).
- No budget scoring (challenges module).
- No currency/locale work beyond existing formatting.

## User-facing behavior

- Control bar: `LLM cost: ~$12,000/h provisioned + ~$23,500/h usage` (compact when
  one side is 0), with a hint stating both assumptions, en + pt.
- An idle canvas with a provisioned fleet shows a non-zero cost for the first time.

## Acceptance criteria

1. **AC1 — pure cost function** — A pure function over (design, metrics) returns
   `{ provisionedPerHour, usagePerHour }`: provisioned = Σ over LLM nodes of
   `replicas × sizeMultiplier × RATE_USD_PER_DEPLOYMENT_HOUR`, independent of load;
   usage = Σ throughput × cost/call × 3600 (unchanged math).
2. **AC2 — idle fleet bills** — A design with LLM replicas and 0 offered load
   reports provisioned > 0 and usage = 0.
3. **AC3 — header shows both** — Both figures render when non-zero; hint states the
   per-deployment-hour and per-call assumptions, en + pt.
4. **AC4 — trade-off is real** — With the chosen constants, a deployment at high
   utilization costs less provisioned than the equivalent usage bill, and vice
   versa at low utilization (pinned numerically at the break-even).
5. **AC5 — bilingual** — all new strings resolve in en and pt.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Provisioned rate? → `LLM_COST_PER_DEPLOYMENT_HOUR_USD = 100` per **medium**
  deployment, scaled by `SIZE_MULTIPLIER`. Rationale: a medium deployment serves
  50 rps; at full utilization the usage bill would be 50 × $0.0016 × 3600 = $288/h,
  so provisioned wins when busy (break-even ≈ 35% utilization) — the trade-off both
  clouds actually present. Order-of-magnitude teaching constant, stated in the hint.
- [x] Replace or add to the usage figure? → **Add** — both bills shown; neither
  story is universally right and the pair is the lesson.
- [x] Does shed traffic bill? → No (unchanged) — 429s are cheap; the provisioned
  line is what keeps saturated designs from looking free.

## Out of scope / deferred

Non-LLM component costs, budget-constrained challenges, regional price variation.
