# Spec: Arena backend concurrency wall — held connections as a first-class limit

| | |
|---|---|
| **ID** | 118-arena-backend-concurrency |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

In a closed-loop agent system the LLM saturates first and self-throttles the
arrival rate, so the backend's **QPS** utilization stays low — the 200k-users
review case (2026-07-23) showed the backend green at 47% while the model's own
113 arithmetic said it was holding **~180,000 open requests/SSE streams**
(2,349 req/s × ~76 s turns, Little's Law). That is exactly what fells real
agent backends — connection pools, file descriptors and per-stream memory
exhaust long before CPU — yet the Arena only reveals the number in the
ScalePanel (a click away) and it never affects node status. The canvas told a
dishonest "all green" story.

## Goals

- Give the backend an explicit **concurrent-streams budget** (per container ×
  size × containers) — the teaching stand-in for connection pools / fds /
  per-stream memory.
- Surface held-in-flight **on the node face** and let it drive node status:
  over ~70% of budget → warning, over ~90% → critical, over 100% → a
  "connection wall" banner (bottleneck-style), independent of QPS utilization.
- Retune the presets so their stories stay coherent under the new wall (a
  healthy preset must also be connection-healthy).

## Non-goals

- No user-abandonment/timeout/retry modeling (candidate for a future spec —
  changes the equilibrium math itself).
- No budgets for other kinds in v1 (the backend is the synchronous orchestrator
  that holds the turn open; gateways/DBs release per hop).
- No backend/protocol change (Arena stays frontend-only, §3-honest).

## User-facing behavior

- The Backend node face gains an "In-flight" row: held streams vs budget
  (e.g. "~7.4k / 8k"). When the awaited path sheds, it shows "—" (the 108/113
  honesty rule: a figure built on clamped latency would be fiction).
- The node's status dot/meter reflects the WORSE of QPS utilization and
  connection pressure; crossing the budget draws the rose "connection wall"
  banner with the held count, mirroring the bottleneck treatment.
- The ScalePanel's in-flight line shows the budget and a bilingual explainer:
  what one container can hold open, why agent turns (seconds-long, streaming)
  hit this wall long before CPU, and that the fixes are more containers or a
  shorter turn.
- Presets that should read healthy get enough backend containers to hold their
  equilibrium in-flight load (scale-llm ×2, multi-region ×4, llm-fleet ×6…).

## Acceptance criteria

1. **AC1 — budget arithmetic.** `concurrencyBudgetFor(spec)` =
   `CONCURRENCY_BUDGET_PER_UNIT.backend (2,000) × SIZE_MULTIPLIER[size] ×
   replicas` for backend nodes and `null` for kinds without a budget.
2. **AC2 — pressure status.** `concurrencyPressure(held, budget)` maps
   held/budget onto the 108 thresholds (≥0.7 warning, ≥0.9 critical) and is
   `null` when `held` is null (shedding path) or the kind has no budget; the
   node's effective status is the worse of QPS status and pressure status.
3. **AC3 — the review case reads red.** A design shaped like the 200k-users
   review (single medium backend, saturated LLM path haircut to a long turn —
   any non-shedding fixture whose held ≫ budget) yields a backend that is
   `critical` by connection pressure while its QPS utilization alone would be
   `healthy`.
4. **AC4 — node face.** The Backend node renders the In-flight row (held vs
   budget, "—" when held is null) and the connection-wall banner when held >
   budget; the ScalePanel shows budget + explainer (en+pt).
5. **AC5 — presets stay coherent.** Every preset whose `claims.llm` is
   `healthy` also has a backend under 70% connection pressure at the modeled
   equilibrium (containers retuned where needed), pinned by a walker test.

## Protocol / stage impact

- New/changed `Stage`(s): **none** (Arena is frontend-only; no TraceEvents).
- Mirror in `frontend/src/types/events.ts`: n/a.
- Station mapping: n/a.

## Open questions (clarify before planning)

*(resolved with the user, 2026-07-23)*

- ~~Just show the number, or let it drive status?~~ → Budget + status
  (option A): the canvas must not read "all green" while holding 180k streams.
- ~~Model user abandonment too?~~ → Not now; explicitly deferred.
