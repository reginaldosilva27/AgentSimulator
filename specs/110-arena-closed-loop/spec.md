# Spec: Arena — closed-loop equilibrium (Little's Law on both ends)

| | |
|---|---|
| **ID** | 110-arena-closed-loop |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

Spec 103 introduced Little's Law on the *input* side (`rps = users / thinkTime`) but
the model stays **open-loop**: the offered rate never reacts to the latency it
causes. That produces physically impossible states — the audit's flagship case
(122,300 users, think 20s, 3 LLM pools × 20 large) reports 6,115 req/s *and* ~80s of
latency simultaneously, which by Little's Law (`L = λ·W`) implies **~490k requests
in flight from a population of 122k users**, each of whom can have at most one
request outstanding.

A population of N users is a **closed system**: a user who is waiting on a response
is not sending the next message. The offered rate self-throttles to
`rps = users / (thinkTime + responseTime)`. Solving that fixed point for the audit
case gives a very different — and true — verdict: ≈4,950 req/s at ~83% LLM
utilization with ~4.7s latency and **zero shed**, instead of "102%, dropping 38
req/s". Saturation in closed systems usually manifests as *latency degradation*,
not as a 429 storm — that is the lesson the Arena currently teaches wrong.

**Decision (2026-07-23): approved by the project owner** — the Arena moves to a
closed-loop equilibrium model.

## Goals

- The modeled rate is the **fixed point** `rps = users / (thinkTime + e2eSec(rps))`,
  computed deterministically (no randomness, no time — constitution §3 model purity).
- The control bar shows **both** numbers: nominal demand (`users / thinkTime`) and
  the effective equilibrium rate — the gap *is* the self-throttling lesson.
- The Little invariant holds: `throughput × e2eSec ≤ users` for every design.
- Shedding can still occur (a fleet small enough saturates even at the latency
  ceiling) — 108's saturation notice still applies then.

## Non-goals

- No burst/transient modeling (still steady-state).
- No challenge/scoring content.
- `computeMetrics(design, load)` keeps its open signature — equilibrium is a layer
  above it, not a rewrite of propagation.

## User-facing behavior

- Header: `122,300 users ≈ 6,115 req/s demanded → 4,952 req/s effective` (wording
  final in plan), with a hint explaining the closed loop, en + pt.
- When demand ≈ effective (healthy, fast system), the readout collapses to today's
  single figure (no noise).
- Node metrics/status/latency all reflect the equilibrium rate.

## Acceptance criteria

1. **AC1 — deterministic fixed point** — A pure function returns `rps` with
   `|rps − users/(thinkTime + e2eSec(rps))| ≤ 1` (req/s tolerance); same inputs →
   identical output (pinned by calling twice).
2. **AC2 — audit case verdict** — The audited design (client → apiGW → LB →
   backend×2 → aiGW×2 → 3 × llm large×20, cache 0.8 → vectorDb; 122,300 users,
   think 20s) converges to an equilibrium in **[4,700 .. 5,200] req/s** with LLM
   utilization in **[0.78 .. 0.88]** and **zero shed**.
3. **AC3 — Little invariant** — For a matrix of designs × loads (healthy, near-sat,
   over-sat), `equilibriumRps × e2eSec(equilibriumRps) ≤ users` always holds.
4. **AC4 — dual readout** — Header shows demanded and effective rates when they
   differ by >5%; collapses to one figure otherwise; hint in en + pt.
5. **AC5 — shed still possible** — A deliberately tiny fleet (e.g. 1 medium LLM,
   10k users, think 5s) still saturates at equilibrium: shed > 0 and 108's notice
   renders.
6. **AC6 — presets re-verified** — All example presets recomputed under equilibrium;
   `examples.test.ts` re-pinned; every preset description that cites numbers
   (req/s, utilization, "saturates"/"clears") updated to stay truthful, en + pt.
7. **AC7 — persistence compat** — Stored designs (localStorage `agentsim.arena`)
   load fine: `offeredLoad` is recomputed from `users`/`thinkTimeSec` on load; no
   migration break.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Open-loop or closed-loop? → **Closed-loop approved** by the owner (2026-07-23).
- [x] Iteration scheme? → Damped fixed-point iteration (α = 0.3, ≤ 60 iterations or
  until |Δ| ≤ 0.5 rps). Deterministic, pure, cheap (each step = one metrics pass).
  Convergence is guaranteed in practice because e2eSec is monotonically
  non-decreasing in rps and bounded (0.99 clamp) — the map is a contraction under
  damping; the iteration cap is the backstop.
- [x] What does the users slider drive now? → Same as today (`users`, `thinkTimeSec`);
  `offeredLoad` in the store becomes the *equilibrium* value (derived, never set
  directly). `setOfferedLoad` is removed from the public API or redefined as a
  back-compat shim that back-solves users — plan decides; **UI never exposes raw rps
  input anymore.**

## Out of scope / deferred

Percentile latencies, retry amplification (retry storms), per-user abandonment.
