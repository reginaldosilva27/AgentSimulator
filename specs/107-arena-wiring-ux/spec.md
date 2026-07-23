# Spec: Arena — wiring UX (easy linking, auto-wire on drop, edge removal)

| | |
|---|---|
| **ID** | 107-arena-wiring-ux |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

Linking a freshly-dropped LLM to the AI Gateway is fiddly (user report with
screenshot): the connection handles are tiny default dots that are hard to grab,
there is no magnetic snapping so a near-miss drops the connection, and — worse — a
wrong link **cannot be removed at all** (the store has `removeEdge` but no UI path
reaches it). For a sandbox whose whole point is re-wiring flows, wiring must be
the easiest gesture on the page.

## Goals

- **Grabbable handles**: visibly larger connection handles with a hover cue.
- **Magnetic snapping**: an in-progress connection snaps to a nearby handle
  (generous connection radius), and the in-progress line is clearly styled.
- **Auto-wire on drop**: dropping a palette component while a node is selected
  wires `selected → new` automatically and selects the new node — "select the
  gateway, drop 3 LLMs, done". (Deselect first — click the canvas — to drop a
  free node.)
- **Edge removal**: clicking a link selects it; Backspace/Delete removes it (and
  the store edge). A palette hint teaches both gestures.
- **Selection moves to the store** (`useArena.selectedId`) — fixes the earlier
  reviewer nit and makes the drop behavior directly testable.

## Non-goals

- No free-floating "click-to-connect" mode; no edge re-routing/waypoints.
- No model change.

## Acceptance criteria

1. **AC1 — auto-wire on drop** — `dropNode(kind, pos)` adds the node, wires an
   edge from the currently-selected node (when one is selected), and selects the
   new node; with nothing selected it adds a free node. Persisted like any edit.
2. **AC2 — selection in the store** — `selectedId`/`select()` live in `useArena`
   (transient, not persisted); removing a node clears its selection.
3. **AC3 — edge removal** — Edge remove-changes from the canvas reach
   `store.removeEdge` (pure change-filter helper pinned by test); edges are
   selectable and deletable via Backspace/Delete.
4. **AC4 — grabbable handles** — Node handles render enlarged (custom class),
   and the canvas uses a generous `connectionRadius` + a visible connection line.
5. **AC5 — hints** — The palette footer teaches the auto-wire and the
   delete-a-link gestures, bilingual (en + pt).

## Protocol / stage impact

None — frontend-only Arena UX change.

## Open questions (clarify before planning)

- [x] Auto-wire direction? → `selected → new` (reads as "feed the selected node's
  flow into the new box"), matching the gateway→LLM case that motivated it.
- [x] Persist selection? → No — transient UI state, like `exampleId`.

## Out of scope / deferred

Click-to-connect mode; edge context menus; touch-specific gestures.

## Amendment (2026-07-23, via 116 follow-up)

**Auto-wire on palette drop (AC1/AC2) was REVERTED by user request**: dropping a
component with a node selected created surprise edges the user then had to
hunt down and delete. `dropNode` now only adds + selects the new node; wiring
is always the user's explicit drag gesture. The palette hint became
`arena.connectHint` ("drag from a node's round handle…"). Edge
selection/Backspace removal, enlarged handles, snap radius and store-held
selection all stand.
