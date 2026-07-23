# Spec: Arena Agent Harness node

| | |
|---|---|
| **ID** | 123-arena-agent-harness-node |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

> **Decision (Q1 resolved): Design A — display-only.** The harness does **not** own
> `callsPerRequest`; each callee keeps its own (LLM=2, VectorDB=1). The harness is a
> pass-through orchestrator that **reads and displays** the fan-out, and sums its
> children for turn latency (as the backend does today). Every existing QPS/latency
> number stays **byte-for-byte identical** — this is a legibility change, not a
> re-tuning. Chosen for §3 honesty and zero preset re-tuning.

## Problem / motivation

In the Arena, the fact that **an AI agent** sits at the center of the architecture
is invisible. The agent's defining behavior — a ReAct loop that makes **several
model calls per user turn** (the "fan-out") — is buried as a numeric
`callsPerRequest` property on the LLM node. A user looking at the canvas sees the
LLM QPS mysteriously at 2× the backend QPS, and the end-to-end latency at 2× a
single model call (e.g. 4.0s for a 2.0s model), with **nothing on the canvas that
says "this is because an agent loops and calls the model twice."**

Concretely: when asked "why is end-to-end latency 4s?", the honest answer is "the
agent runtime makes 2 model calls per turn" — but that runtime has no
representation. The agent currently lives *implicitly inside the Backend box*
("API server hosting the agent"), which is topologically honest (the LangGraph
loop runs in-process in the backend container) but pedagogically silent.

The Arena's whole purpose is to make architectural behavior **legible**. The agent
harness — the loop that orchestrates the turn — deserves to be a first-class,
visible box, so the fan-out reads as an honest consequence of "there is an agent
here" rather than an unexplained multiplier.

## Goals

- Make the presence of the AI agent **visible on the canvas** as its own box.
- Make the **fan-out** (N model/tool calls per turn) a legible, inspectable
  property of the agent, not a hidden number on the LLM.
- Give the agent runtime a home that matches the main Simulator's existing
  **"Agent Harness"** vocabulary (spec 053), reinforcing the shared mental model.
- Keep the model **honest** (constitution §3): the harness runs in-process in the
  backend, so it is **not** an independently-scalable capacity tier and must never
  be presented as another capacity wall.

## Non-goals

- Not adding a real backend `Stage`/`TraceEvent` — the Arena is a pure frontend
  capacity model with no protocol surface (constitution §3; the Arena has never
  emitted a Stage).
- Not making the harness a scalable tier with `size × replicas` — it is explicitly
  non-scalable (the user's chosen direction).
- Not modeling multi-agent / sub-agent orchestration (that is a later concern; this
  is the single ReAct harness).
- Not changing the LLM / Vector DB / MCP capacity or latency benchmarks.

## User-facing behavior

A new **Agent Harness** component is available in the Arena palette. When placed, it
sits between the Backend and the agent's callees (LLM / Vector DB / MCP) and
represents the ReAct orchestration loop.

- The node renders with a distinct label (**"Agent Harness"** / pt **"Harness do
  Agente"**) and a badge that states the fan-out in words, e.g. *"ReAct loop · N
  calls/turn"* / *"loop ReAct · N chamadas/turno"*.
- It is visibly **non-scalable** — no size/replicas controls (like the Client node);
  its ScalePanel explains *why* (the harness is code running in the backend
  process; scale the Backend, not the harness).
- Its readout shows the **fan-out multiplier** and makes clear this is what turns
  one user request into N model calls — the honest source of the LLM's elevated
  QPS and the multiplied end-to-end latency.
- All new prose ships in **en + pt** (constitution §4).
- The default first-visit example and the preset library are updated so the harness
  appears in the agent path (so the fan-out story is told out of the box).

## Acceptance criteria

1. **AC1** — The Arena component catalog exposes an `agentHarness` (or equivalent)
   kind with bilingual label/description/info; it appears in the palette and can be
   dropped onto the canvas.
2. **AC2** — The harness node is **non-scalable**: it exposes no size/replicas
   controls, and the capacity model never reports it as a bottleneck for any offered
   load (it is never the wall).
3. **AC3** — The harness node's readout **states the turn fan-out** in
   human-readable form (bilingual), derived from its LLM callee's
   `callsPerRequest` (e.g. "ReAct loop · 2 LLM calls/turn"). The multiplier itself
   stays configured on the LLM (Design A); the harness surfaces it legibly.
4. **AC4** — With the harness in the agent path, the **end-to-end latency** for a
   given offered load equals the modeled turn latency including the fan-out (i.e.
   the 4.0s-for-a-2.0s-model relationship is now attributable to the harness box),
   computed by the existing turn-path latency function treating the harness as a
   sequential orchestrator (sums its children, like the backend does today).
5. **AC5** — The harness ScalePanel/info explains, bilingually, that the harness is
   not independently scalable (it runs in the backend process) and that capacity is
   governed by the Backend and the LLM quota.
6. **AC6** — Inserting a harness as a pass-through between the backend and its
   agent callees leaves the reported capacity (QPS/utilization/shed) of every other
   node **and the end-to-end latency identical** to the harness-free design at the
   same offered load. (Guaranteed by Design A: harness base latency = 0, capacity
   effectively unbounded, non-splitting, `callsPerRequest` untouched on callees.)
7. **AC7** — The default first-visit example (and the preset library) include the
   harness node wired into the agent path, and all presets still load and pass the
   existing examples tests.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — the Arena is a pure frontend model with no
  `TraceEvent`/`Stage` surface (constitution §3).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (Arena components live in
  `frontend/src/arena/components.ts`, a separate catalog from the Simulator's
  `stations.ts`).

## Open questions (clarify)

- [x] **Q1 — fan-out semantics.** RESOLVED → **Design A (display-only)**. See the
  decision box at the top. The harness reads and displays the fan-out; callee
  `callsPerRequest` is untouched; all numbers stay identical.

## Out of scope / deferred

- Multi-agent / orchestrator + sub-agent topologies in the Arena.
- Any Arena "challenge / scoring" use of the harness.
- Distinguishing think-round latency from generate-round latency inside the harness
  (117 already blends this into the LLM benchmark).
