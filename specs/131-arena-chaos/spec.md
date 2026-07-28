# Spec: Arena — chaos / failure injection

| | |
|---|---|
| **ID** | 131-arena-chaos |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-27 |

> Third of five specs building the **Challenges module** (129 → 133). Depends on **129**
> (the verdict axes) and **130** (challenge givens) — a fault is what makes a *resilience*
> challenge possible. This is the one item on the competitor-gap list we have no answer to
> at all today.

## Problem / motivation

The Arena answers "does this architecture carry the load?" It cannot yet answer the question
that actually decides an architecture review: **"and when a piece of it is gone?"**

Today every capacity story in the Arena is a *steady state*. Nothing in the model can be
taken away, so the user never discovers the two lessons that separate a diagram from a
design:

- **Headroom is not resilience.** A single deployment at 60% utilization looks healthy and is
  one quota cut from shedding everything. Two deployments at 60% across two regions is a
  different system with the same steady-state readouts.
- **Some failures make load go *up*, not down.** Flush a cache and the tier behind it takes
  the full offered rate — the stampede. Nothing in the current model lets the user feel that.

The pieces are already in place, which is what makes this cheap: `NodeStatus` already has an
`unreachable` state (unused in practice), the regional LLM quota already squeezes pools
proportionally (114), the cross-region latency penalty already exists (114), and the closed
loop (110) already means a latency spike *reduces* the arriving rate the way a real
population of waiting users would. A fault is not new physics — it is a **pure transform of
the design** before the existing model runs.

Doing it as a design transform is also the honesty position (constitution §3): we are not
simulating a crash, we are **re-evaluating the same analytical model with a component
removed or degraded**, and saying exactly that.

## Goals

- A small, defensible **catalog of faults** — each one a mechanism the existing model can
  express honestly, not a scary label.
- Faults applied as a **pure transform**, so *every* existing derived readout (per-node
  metrics, end-to-end latency, the closed-loop equilibrium, cost, in-flight, 129's verdict)
  reflects them with no second code path and no signature churn.
- **Apply / remove / clear-all** from the UI, against a selected node or a whole region, with
  an **active-faults list** always visible (you can never be confused about why the numbers
  moved).
- Faulted nodes are **visibly marked** on the canvas, and nodes starved by an upstream failure
  read `unreachable` rather than silently reporting zero.
- **Faults are transient**: they are an experiment, not part of the design, so they are not
  persisted, and clearing them returns the model to *exactly* its baseline numbers.
- The forward seam for 130: a challenge may declare **faults as a given** ("hold the SLO with
  one region down"), turning resilience into a scored axis with no new machinery.
- Every new string ships **en + pt** (constitution §4).

## Non-goals

- **No randomness, no time-varying failure, no MTTR / recovery animation.** The model is a
  deterministic operating point; a fault moves it to a different deterministic operating
  point. No `Math.random`, no `Date.now` (the model forbids both, by construction).
- **No 29-failure catalog.** A long list of scary names most of which the model cannot express
  would be theatre. Every fault here must change the arithmetic in a way we can defend.
- **No retry / circuit-breaker / fallback modelling.** The Simulator already teaches those on
  a real request (spec 051); modelling them in the capacity math is a separate, larger idea.
- **No cascading-failure dynamics** (a downed node overloading its neighbour *over time*).
  Steady state only.
- **No backend, no new `Stage`/`TraceEvent`, no DB table, no protocol change.**
- No change to the Simulator page or to `spec 017`'s failure injection (a different feature on
  a different page — real request, real error path).

## User-facing behavior

- The Arena gains a **Chaos panel** (pt: **Caos**): a catalog of faults, grouped, each with a
  one-line bilingual explanation of *what it does to the model*.
- The user picks a fault and applies it to the **selected component** (or, for the regional
  ones, to a **region**). Applying is one click; nothing is random.
- An **Active faults** list shows every applied fault with its target, each individually
  removable, plus **Clear all**.
- A faulted node carries a **badge** on the canvas; a node whose every inbound path is dead
  reads **unreachable**.
- The header readouts and 129's objectives update immediately — the point of the feature is
  watching a healthy verdict turn red.
- A short honesty note states plainly: *the same model, re-evaluated with a component removed
  or degraded — not a live outage.*
- Faults are **not saved**: a reload comes back to the intact design.

## Acceptance criteria

1. **AC1 — a node is down** — Given a fault taking node X down, X's effective capacity is 0,
   its throughput is 0, it sheds everything arriving at it, and its status is not healthy.
2. **AC2 — downstream goes unreachable, and says why** — Given `A → X(down) → B`, B receives 0
   and reports **`unreachable`** (not `healthy`, not `critical`), no phantom traffic appears
   anywhere downstream, and B carries a bilingual hint **naming the upstream node** that is down
   — so the starved box is not mistaken for the broken one.
3. **AC3 — losing horizontal units** — Given a fault removing `k` units from a node with `n`
   units, effective capacity becomes that of `max(0, n − k)` units; `k ≥ n` is equivalent to
   the node being down (AC1).
4. **AC4 — a latency spike feeds the closed loop** — Given a fault multiplying a node's base
   latency, the end-to-end turn latency rises **and** the closed-loop equilibrium rate falls
   (users waiting are not sending) — i.e. the fault propagates through `equilibriumRps`, not
   just through the display.
5. **AC5 — a flushed cache raises downstream load** — Given `→ cache(hit ratio h) → tier`, a
   fault flushing the cache sets the effective hit ratio to 0, so the calls/s arriving at the
   tier rise to the full offered rate and the tier's utilization rises accordingly (the
   stampede).
6. **AC6 — a quota cut squeezes a region** — Given a fault cutting a region's LLM quota by a
   fraction, every LLM pool in that region has its `quotaFactor` reduced proportionally
   (114's rule) and pools in other regions are untouched.
7. **AC7 — a region outage** — Given a fault taking region R out, every node whose region is R
   behaves as down (AC1); a design with equivalent capacity in a second region keeps serving
   (its shed rate stays 0), and a single-region design does not.
8. **AC8 — faults are transient and reversible** — Faults are excluded from the persisted
   design (a reload restores the intact design), and removing every fault returns **every**
   metric to its exact pre-fault value.
9. **AC9 — zero faults is a no-op** — With no faults applied, every model output is identical
   to pre-131 behaviour (a golden-value regression over the shipped presets).
10. **AC10 — the UI is honest about state** — The active-faults list shows one entry per
    applied fault with its target's name, each removable individually, plus a clear-all; a
    faulted node is visibly marked on the canvas.
11. **AC11 — faults compose with the verdict** — With 129's objectives tracked, applying a
    fault that saturates a tier flips the affected objective to not-met, and its culprit is
    the faulted (or starved) node.
12. **AC12 — a challenge may declare faults** — A 130 challenge can carry faults as part of
    its **givens**: they are applied on entering, are **not removable** while the challenge is
    active (they are the problem), and the challenge's reference solution satisfies the
    objectives **with the faults applied**, at 130's AC15 margin (the 130 walking tests cover
    it). This is how resilience becomes a scored axis without 129 gaining one.
13. **AC13 — sandbox faults do not cross the challenge boundary** — Entering a challenge clears
    any sandbox faults (the challenge's own take over); exiting does **not** restore them, since
    a fault is an experiment and was never part of the design.
14. **AC14 — bilingual** — Every string introduced here resolves in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — no `TraceEvent`s. (Note the contrast worth stating in the
  UI copy: spec **017**'s failure injection *is* a real error path on a real request and does
  emit trace events; this is a *model* perturbation on the Arena page. Two different features,
  deliberately.)
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none**.

## Clarify — resolved (2026-07-27)

- **The catalog is the proposed seven**, all component- or region-targeted:
  | # | fault | transform |
  |---|---|---|
  | 1 | Instance down | capacity → 0 |
  | 2 | Lose N units | replicas/deployments − N |
  | 3 | Latency spike ×k | base latency × k, k ∈ {2, 5, 10} |
  | 4 | Cache flushed | effective hit ratio → 0 (the stampede) |
  | 5 | Quota cut −x% | regional LLM quota × (1 − x) |
  | 6 | Region outage | every node in the region down |
  | 7 | Dependency degraded | an `externalApi`'s capacity × (1 − x) **and** latency × k |
- **A client "traffic surge ×k" is NOT included.** It perturbs the *load*, not a component, and
  the users slider already does exactly that — adding it as a "fault" would blur what a fault
  is for the sake of matching a competitor's catalog entry.
- **A starved node reads `unreachable`, plus a hint naming the upstream failure.** This turns
  what is currently near-dead code in `NodeStatus` into the state it was defined for, and the
  hint stops the user blaming the wrong box.
- **Faults are cleared on entering a challenge and are not restored on exit.** The challenge's
  own faults take over while it is active; sandbox faults were transient by definition (AC8), so
  restoring them would contradict the feature's own model. This is a deliberate asymmetry with
  130's AC5 stash, which restores *design* state.
- **129 does not gain a resilience axis.** A challenge that puts a region outage in its givens
  and demands e2e ≤ 30 s **is** a resilience test, expressed entirely in axes 129 already has.
  The reference solution must then pass **with the fault applied** (AC12), which is a stronger
  and more honest guarantee than a bolt-on axis, and keeps 129's vocabulary at four metrics.

## Out of scope / deferred

- Time-based dynamics: recovery, MTTR, retry storms, cascading collapse.
- Modelling resilience *patterns* (circuit breaker, bulkhead, hedged requests) in the capacity
  math — a large and interesting future spec.
- Randomised / scheduled chaos ("kill something every 30s"), which the pure model forbids.
- A resilience *score*.
