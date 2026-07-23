# Spec: Arena — in-flight metric (held connections made visible)

| | |
|---|---|
| **ID** | 113-arena-inflight-metric |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena's backend reads "61% utilization, 51ms" while the LLM behind it takes
seconds. That hides the most common real-world agent outage: a **synchronous
backend holds its connection/thread/SSE stream open for the whole turn** — its own
CPU is fine, but thousands of held requests exhaust connection pools and memory
long before rps capacity does. The model prices a node's *service* time but never
shows how much work each node is **holding**.

Little's Law gives the number for free: `in-flight = throughput × time-in-system`.
For an orchestrating node, time-in-system is its own latency **plus the downstream
path it waits on** (exactly the agent-turn path latency spec 109 introduces). In the
audited case, the backend serves ~51ms of its own work but holds each request for
the full multi-second turn — hundreds-to-thousands of concurrent open streams on 2
containers, a number an architect asks for and the Arena can't show today.

## Goals

- Per-node derived metric: **held in-flight** = throughput × (own + awaited
  downstream path latency, in seconds).
- Surfaced in the scale panel with an explainer (threads/connection pools/SSE),
  bilingual.
- Consistent with 108's honesty: when the awaited path includes a shedding node, a
  numeric in-flight would be fiction → show `—`.

## Non-goals

- In-flight does **not** feed back into capacity/status in v1 (informative only; a
  connection-pool constraint is a possible future spec).
- No new component kinds, no challenge content.

## User-facing behavior

- Scale panel of a selected node shows `In flight: ~312` (or `—` when the awaited
  path is saturated) with an ℹ️ explaining held connections, en + pt.
- On the client node the figure reads as "users currently waiting" — with 110 in
  place it is ≤ the concurrent-users total by construction.

## Acceptance criteria

1. **AC1 — derived metric** — A pure function returns, per node, `heldInFlight =
   throughput × (pathLatencyMs(node)/1000)` where pathLatency is the node's own
   queued latency plus the downstream path it awaits (109 semantics: backend sums
   its branches; routers take the slowest pool; cpr multiplies). Pinned numerically
   for a chain and for a backend with two branches.
2. **AC2 — saturation honesty** — If any node on the awaited path is shedding
   (util > 1), the node's held in-flight is reported as undefined/`—`, not a number
   built on the clamped latency.
3. **AC3 — panel readout** — The scale panel shows the figure with the bilingual
   explainer; leaf nodes (e.g. LLM) show throughput × own latency.
4. **AC4 — population sanity** — With the closed-loop model (110), the client node's
   held in-flight ≤ `users` across the AC3 test matrix of 110.
5. **AC5 — bilingual** — all new strings resolve in en and pt.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Own-latency in-flight or held (own + downstream)? → **Held** — the own-latency
  number (~300 for the audit backend) misses the point; the held number (~thousands)
  is the one that teaches why sync agents fall over. Leaf nodes degenerate to
  own-latency naturally.
- [x] Should high in-flight change node status? → **Not in v1** (informative). A
  future spec may add per-kind connection limits; deferred explicitly.
- [x] Where to render? → Scale panel only (node boxes are already dense); the ℹ️
  explainer carries the lesson.

## Out of scope / deferred

Connection-pool capacity constraints, async/queue-based decoupling bonuses,
challenge scoring on in-flight.
