# Spec: Harness ⇄ Loop lens

| | |
|---|---|
| **ID** | 095-harness-loop-lens |
| **Status** | draft → clarified → planned → in-progress → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-03 |

## Problem / motivation

Modern LLM engineering climbs a ladder — **prompt → context → harness → loop** — and the last two
rungs are where agents are actually won or lost. Yet they are invisible in most tutorials, and
they are the two things this simulator *already renders* without ever naming them:

- The **harness** is the wiring in **space** — the stations, boxes and hops: tools, RAG, MCP,
  memory, the context window, guardrails, permissions, the model. *"Agent = Model + Harness. If
  you're not the model, you're the harness."*
- The **loop** is the behavior in **time** — the ReAct cycle `route → think ⇄ tools → generate →
  respond`, the iteration count, the stop condition (`MAX_ITERATIONS`), and failure recovery
  (`simulate_failure`). *What separates a great agent from a mediocre one — more than the model.*

We want to position the AI Agent Simulator as a **gateway to learn Harness Engineering and Loop
Engineering**. To do that the app must let the learner **see one axis at a time**: a lens that
lights up the harness (the map) or the loop (the journey) on demand, over the exact same real run.

This spec covers the **in-canvas lens (Option A)**. The Learn-page theory is `096-learn-harness-loop`.

## Goals

- A **lens control** in the header with three modes — **All** (today's view) · **Harness** ·
  **Loop** — that reframes the emphasis of the canvas without changing the run.
- In **Harness** mode: each visible station is annotated with its **harness role** (what it
  contributes to the scaffolding — Tools / Knowledge / Memory / Context / Permissions / Model /
  Orchestration), and the temporal/loop affordances are calmed.
- In **Loop** mode: the **ReAct cycle** is foregrounded — the `think ⇄ tools` hops are emphasized,
  the **iteration counter** and **stop condition** are surfaced, failure/recovery is called out,
  and pure-scaffolding stations recede.
- A short **legend/explainer** next to the lens names the two disciplines in one line each and
  links to the Learn topics.
- The whole thing is a **pure projection** — switching lenses fires no request, adds no `Stage`,
  and does not touch the trace, the event cursor, or replay/step.

## Non-goals

- **No backend change, no new `Stage`/`Phase`/`TraceEvent`.** This is a frontend reframing of data
  and structure that already exist.
- Not a replacement for the **Build** popover, the maturity ladder, or the cloud/lang overlays —
  the lens is orthogonal and composes with all of them.
- No new geometry engine: the lens changes **emphasis** (highlight/dim, badges, which panel leads),
  not the column/tier layout produced by `computeLayout`.
- Does not add or remove stations from a run; it never fakes loop activity that didn't happen.

## User-facing behavior

- The header gains a **lens toggle** (near Build): **All · 🗺️ Harness · 🔄 Loop**. Default is
  **All**, persisted to `localStorage`; a first-time visitor sees today's canvas byte-for-byte.
- **Harness lens** — the canvas reads as a *map*: every visible station carries a small
  **role badge** (from a fixed, translated vocabulary), the private-network boundary and hop
  security controls stay prominent, and animation is subdued.
- **Loop lens** — the canvas reads as a *journey*: the agent's `think ⇄ tools` loop edges pulse /
  highlight, the **iteration counter** and the **stop condition** (`iterations ≤ MAX_ITERATIONS`)
  are surfaced as a readout, a **failure/recovery** marker shows when `simulate_failure` is active,
  and stations that are pure scaffolding are dimmed.
- A one-line **legend** under the toggle explains each mode and links to Learn (096).
- **Constitution §4:** every new string — the three mode labels, all role badges, the legend, the
  stop-condition/iteration/recovery readouts, and any tooltip — ships in **en + pt**.

## Acceptance criteria

1. **AC1** — Given a fresh visitor (no stored preference), when the app loads, then the lens is
   **All** and the canvas renders identically to the pre-095 baseline (no badges, no dimming, no
   extra readouts). Switching to Harness/Loop and back to All returns to that baseline.
2. **AC2** — The lens mode is persisted: setting Harness (or Loop), reloading, then reading the
   restored mode yields the same mode.
3. **AC3** — Every station in the visual model is classified with exactly one **harness role** from
   a fixed vocabulary; the classification map is **total** over the station ids (a test fails if any
   station is unclassified), mirroring the existing exhaustive-map convention.
4. **AC4** — In **Harness** mode, each *visible* station exposes its role badge; in **All**/**Loop**
   mode it does not.
5. **AC5** — In **Loop** mode, the projection identifies the loop's control elements from the trace
   — the `think ⇄ tools` cycle, the current **iteration count**, and the **stop reason** (hit final
   answer vs reached `MAX_ITERATIONS`) — and surfaces them as a readout; in **All**/**Harness** mode
   that readout is absent. With `simulate_failure` active, a **recovery/failure** marker is present.
6. **AC6** — Switching lens modes performs **no network request**, does not mutate the event list or
   the replay cursor, and does not change which stations/hops are *visible* (only their emphasis).
   Replay/step behaves identically under every lens.
7. **AC7** — All lens strings (mode labels, role-badge vocabulary, legend, readouts, tooltips) are
   present in both `en` and `pt`; a parity test asserts no language is missing.
8. **AC8** — The legend links to the Learn Harness/Loop topics (096), and the link target ids exist.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (no new station) — this spec *reads* the existing
  `StationId` set and adds a derived harness-role map + a loop-element projection over the trace.

## Open questions (clarify before planning)

- [ ] Lens placement & shape: a 3-segment control in the header next to **Build** (recommended), or
  a small floating overlay on the canvas? *Proposed default: header segment.*
- [ ] Lens preference **global** (like cloud/lang) or per-session? *Proposed default: global
  localStorage key `agentsim.lens`, matching the cloud/lang stores.*

## Out of scope / deferred

- A literal "spacetime" split-screen (harness left, loop right) — a richer future visual; the Learn
  diagram (096) covers the concept for now.
- A "loopcraft" view stacking verification/event/hill-climbing loops (LangChain) — future spec once
  those loops exist as real behavior.

## v2 refinement (2026-07-03, user feedback)

First cut used role *badges* + dimming; the Harness axis read too much like the same diagram as
Loop, and the lens name **"Harness"** collided with the app's existing **"Agent Harness"** (the
agent runtime, 053). Refined so the two lenses read as *different kinds of diagram* and the naming
becomes a **nesting story**, not a collision:

- **Harness = a color-coded parts map (space).** Each station is tinted by its harness role
  (`HARNESS_ROLE_COLOR`), the connecting arrows fade, and the overlay carries a **role color legend**
  ("Parts of the harness"). Reads as an anatomy diagram, not a flow.
- **Naming resolved by nesting.** The Agent node is relabelled **"Agent Harness · core"** under the
  lens (it's the runtime at the centre of the wider harness, and it's what *runs* the Loop), and
  carries a **"Context window"** chip — showing that **context engineering ⊂ (Agent) Harness ⊂
  Harness Engineering**. The legend text disambiguates explicitly. No rename of the 053 label.
- **Glossary tooltips (i18n gate).** Every role badge + the core/context chips now carry a
  bilingual hover definition (`lens.roleHint`, `lens.coreHint`, `lens.contextHint`) — the
  canvas-jargon-tooltips convention.
- **Loop** kept its dim-non-loop + highlighted cycle + iteration/stop readout (it already read well).
