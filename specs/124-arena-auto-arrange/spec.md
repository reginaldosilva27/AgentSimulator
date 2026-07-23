# Spec: Arena auto-arrange button

| | |
|---|---|
| **ID** | 124-arena-auto-arrange |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

Arena node boxes grow dynamically: the connection-wall banner (118), the
bottleneck banner (108), region/replica badges and the in-flight row all add
height at runtime. A design laid out by hand (or by a preset) overlaps as soon
as a box grows — the user reported the Backend box (expanded by the connection
wall) covering its neighbours. Today the only remedy is dragging boxes apart by
hand, one at a time.

## Goals

- One click tidies the whole canvas: nodes flow left→right by graph depth
  (client → backend → gateway → pools), stacked without overlap inside each
  column, using each box's **actual rendered size** (so grown boxes get room).
- The action is discoverable next to the existing canvas controls.
- Tidying is a *move*, not a structural edit: the loaded preset stays selected
  (its notes panel survives), exactly like a hand drag.
- The result stays fully draggable afterwards — no persistent "auto layout mode".

## Non-goals

- No continuous/automatic re-layout on box growth (the user stays in control of
  when the canvas reflows).
- No edge routing changes; no changes to the capacity model.
- Nothing touches the Simulator page or the backend.

## User-facing behavior

A new button (with a bilingual tooltip) sits in the canvas control cluster.
Clicking it recomputes every node's position: columns ordered by dependency
depth, boxes in a column stacked with breathing room derived from their real
heights, columns vertically centered, and the view re-fitted so the whole
design is visible. Nodes keep their relative vertical order inside a column
(what was above stays above).

## Acceptance criteria

1. **AC1** — Given any wired design, when auto-arrange runs, then nodes are
   positioned in columns by graph depth (a node sits right of every node that
   feeds it) and no two boxes overlap, given their (measured or default) sizes.
2. **AC2** — Given two nodes at the same depth (e.g. two LLM pools), when
   auto-arrange runs, then they stack vertically with a visible gap, preserving
   their previous relative order.
3. **AC3** — Given a loaded example preset, when auto-arrange runs, then the
   preset stays selected (`exampleId` intact — non-structural, like a drag) and
   the new positions are persisted.
4. **AC4** — The button is visible on the canvas with a bilingual (en/pt)
   accessible label, and works with an empty canvas (no crash, no-op).
5. **AC5** — Disconnected nodes and cyclic wiring do not break the layout (every
   node still gets a finite position).

## Protocol / stage impact

- New/changed `Stage`(s): none (Arena is frontend-only — 100 AC8)
- Mirror in `frontend/src/types/events.ts`: n/a
- Station mapping: n/a

## Open questions (clarify before planning)

- [x] Where does the button live? → inside the React Flow `Controls` cluster
      (bottom-left) as a `ControlButton` — one cluster for canvas-wide actions.
- [x] Does it clear the loaded preset? → no; it only moves nodes (same rule as
      `moveNode`).

## Out of scope / deferred

- Auto-arrange on load / on box growth (could be a toggle later).
- Smart edge-crossing minimization (simple barycenter ordering is enough now).
