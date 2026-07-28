# Spec: Arena — capacity sandbox

| | |
|---|---|
| **ID** | 100-arena-capacity-sandbox |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-22 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The Simulator page teaches *one real request's* lifecycle end-to-end — honest, but it
never answers the question every architect actually gets asked: **"and when this has
100k users, where does it break?"** Tools like *System Design Playground* / *System
Design Simulator* turn that question into a game — drag components onto a canvas, push
traffic, watch QPS / latency / utilization light up per node, find the bottleneck, add a
cache or a read replica, watch it clear. That "what-if at scale" loop is exactly what
AgentSimulator is missing, and it is the natural companion to the real pipeline: the
Simulator shows *how one request flows*; the **Arena** shows *how the same architecture
behaves under load*.

Crucially, this must not compromise the project's spine (constitution §3, "everything is
real"). A live 100k-user load test is **not** what this is. The Arena is an **analytical
capacity model** — deterministic arithmetic over stated per-component benchmarks — and it
is labelled as an estimate, in its own page, with **no `TraceEvent`s and no `Stage`s**. It
never claims to have measured production traffic; it claims to *model* it. That honesty is
itself a teaching point.

## Goals

- A new top-level **Arena** page, reached from a button beside **Learn**, fully separate
  from the Simulator canvas (which is untouched).
- A **drag-and-drop canvas** where the user composes an agent architecture from a palette:
  the agentic stations (LLM, Vector DB, MCP, App DB, Backend) plus classic scaling
  primitives (Cache/Redis, Queue, Load Balancer, Read Replica, CDN, API Gateway).
- A **Play / offered-load control**: a slider (or input) for the number of concurrent
  users / requests-per-second driving the model.
- **Live per-node metrics** rendered in each box — **QPS, latency, utilization %, and a
  health status** (healthy / warning / critical) — that recompute in real time as the user
  changes load, edits the wiring, or scales a component.
- **Editable flow**: the user draws edges between components (e.g. route a read through a
  cache *before* the database) and the metrics update to reflect the new path.
- **Scaling controls per component**: **vertical** (a bigger instance → higher per-node
  capacity) and **horizontal** (N replicas → capacity × N), with the model reflecting both.
- **Bottleneck highlighting**: the saturated node(s) on the critical path are visually
  called out, and throughput downstream of a saturated node collapses (no phantom
  over-capacity).
- The whole thing is **honest**: a visible label frames it as a capacity *model /
  estimate* with stated assumptions, not a live load test.
- Designs **persist to `localStorage`** so a reload keeps the canvas.
- Every new string ships **en + pt** (constitution §4).

## Non-goals

> **Note (2026-07-27, added by 133-arena-ai-judge).** Two of the non-goals below have since
> been delivered, and one of them is **partly superseded** — recorded here as a pointer, not
> a rewrite (specs are append-only):
>
> - *"No pre-defined challenges"* → delivered by **130-arena-challenges** (with 129's SLO
>   engine, 131's chaos and 132's attempt history).
> - *"No AI judge / scoring"* → delivered by **133-arena-ai-judge**.
> - *"No backend … the Arena is frontend-only computation"* → **superseded in exactly one
>   place** by 133: a single stateless route (`POST /api/arena/judge`) that reads no
>   database, writes nothing, and emits no `TraceEvent`. A language judge cannot be mocked
>   without violating §3, so it needs a real server-side model call. Everything else on the
>   page — the whole capacity model — remains pure frontend computation, and the rest of this
>   non-goal (**no new `Stage`, no `TraceEvent`, no protocol change, no DB table**) still
>   holds exactly as written.

- **No pre-defined challenges / scenarios** with target-scale goals (deferred — future
  spec). v1 is a free sandbox.
- **No AI judge / scoring** of the design (deferred — future spec).
- **No backend, no new `Stage`, no `TraceEvent`, no protocol change, no DB table.** The
  Arena is frontend-only computation.
- **No change to the Simulator page**, the real pipeline, the Build popover, or `classify`.
- **Not a real load test** — it does not send traffic anywhere and does not call OpenAI.
- No cost modeling / token-economics in v1 (candidate for a later spec).

## User-facing behavior

- A new **Arena** button sits next to **Learn** in the header; clicking it opens the Arena
  page (and toggles back). Label: en **Arena** / pt **Arena**.
- The Arena shows a **component palette** on one side and a **canvas** in the middle. The
  user drags a component onto the canvas to add it, drags between two components to wire a
  flow, and selects a component to reveal its **scaling controls** (instance size +
  replica count).
- A prominent **offered-load control** ("Users / RPS") and a **Play/Pause** (or
  always-live) toggle drive the model.
- Each component box continuously shows **QPS · latency · util% · status**; saturated
  nodes are highlighted and their status reads *critical*.
- A persistent, plainly-worded **"modelo / estimativa"** banner or badge states that these
  numbers are an analytical estimate, not measured traffic, with a one-line note on the
  assumptions.
- All labels, the palette component descriptions, tooltips, the honesty banner, empty-state
  and status words exist in **both en and pt**.

## Acceptance criteria

<!-- Numbered, each one TESTABLE. These become the failing tests in tasks.md (TDD). -->

1. **AC1 — capacity cap** — Given a single component with benchmark capacity `C` and an
   offered load `L`, the model reports node throughput `min(L, C)` and utilization
   `min(1, L/C)`; when `L > C` the status is *critical* and the node is flagged as a
   bottleneck.
2. **AC2 — propagation through a path** — Given a wired path `A → B → C`, offered load
   propagates along edges via a deterministic topological accumulation, and the throughput
   reported downstream of a saturated node **collapses to that node's capacity** (never
   exceeds it) — no phantom over-capacity.
3. **AC3 — load balancer split vs. fan-out** — Given a load balancer with `N` downstream
   replicas, offered load is split ~evenly across them; given a non-LB fan-out, each child
   receives the full load. (Distinguishes the two accumulation rules.)
4. **AC4 — horizontal scaling clears a bottleneck** — Given a node saturated at replica
   count 1, increasing its replica count to `k` raises its effective capacity to ≈ `k × C`,
   and once `k × C ≥ L` its status leaves *critical*.
5. **AC5 — vertical scaling raises capacity** — Given a node, selecting a larger instance
   size increases that node's per-replica capacity `C` (and lowers/holds latency per the
   benchmark), reflected immediately in its metrics.
6. **AC6 — editing the flow re-routes load** — Given `Backend → DB`, inserting a cache so
   the path becomes `Backend → Cache → DB` with a cache hit-ratio reduces the QPS arriving
   at the DB (only misses pass through), demonstrably lowering DB utilization.
7. **AC7 — latency reflects queueing** — A node's reported latency rises as its utilization
   approaches 1 (a monotonic, deterministic queueing curve), so an over-loaded node shows
   both high util% and elevated latency.
8. **AC8 — Arena is a separate page** — The Arena is reachable from the header beside
   Learn; opening it does not mount/alter the Simulator canvas, and the Simulator continues
   to behave exactly as before (byte-for-byte for a default run).
9. **AC9 — persistence** — A composed design (components + edges + per-node scaling + load)
   round-trips through `localStorage`: after a reload the canvas is restored.
10. **AC10 — honesty label present** — The Arena always renders a plainly-worded label
    stating the numbers are an analytical estimate/model (not a live load test); it is
    present in both en and pt.
11. **AC11 — bilingual** — Every user-facing string introduced by the Arena resolves in
    both `en` and `pt` (no en-only / pt-only string).

## Protocol / stage impact

<!-- Constitution §1 & §6. Does this add or change a Stage/Phase/TraceEvent? -->

- New/changed `Stage`(s): **none** — the Arena is a pure analytical model; it emits no
  `TraceEvent`s and does not touch the real pipeline.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** — Arena components are their own vocabulary
  (they may reuse `stations.ts` labels/cloud metadata for consistency, but they are not
  pipeline stations and add no `Stage`).

## Open questions (clarify before planning)

<!-- All resolved 2026-07-22 with the author. -->

- [x] New separate page vs. mode of Simulator? → **Separate page**, button beside Learn.
- [x] Palette scope? → **Agentic stations + scaling primitives** (Cache, Queue, LB, Read
  Replica, CDN, API Gateway).
- [x] v1 scope? → **Capacity sandbox only** — challenges and AI judge deferred.
- [x] Persistence? → **localStorage** (no DB, no backend).
- [x] Honesty framing? → **Analytical model, clearly labelled estimate**; no `Stage`, no
  `TraceEvent`, frontend-only.

## Out of scope / deferred

- **Challenge library** with target-scale goals and pass/fail (future spec — "Arena
  challenges").
- **AI judge**: one or two real OpenAI judges scoring the design against a goal, with the
  rigor-vs-pragmatism debate (future spec — needs backend).
- **Cost / token-economics** overlay (LLM $/1k tok, cache savings) at scale.
- **Sharing / DB-persisted designs** across sessions.
- **Failure injection** at scale (kill a replica, watch cascade) — reuses 051 vocabulary.
