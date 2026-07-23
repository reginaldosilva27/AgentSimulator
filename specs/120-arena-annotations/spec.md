# Spec: Arena annotations — justify design decisions on the canvas

| | |
|---|---|
| **ID** | 120-arena-annotations |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena canvas answers *what happens* under load (QPS, latency, cost, quota),
but it cannot capture *why the architect made a choice*. A design full of
deliberate trade-offs — "4 XLarge deployments because one region caps at 3k
calls/s", "semantic cache in front because 25% of agent turns repeat" — reads as
an unexplained pile of boxes the moment its author walks away (or forgets).

Competing tools (e.g. System Design Playground, reviewed 2026-07-23) treat
**annotations as a first-class design artifact**: the justification is part of
the submission, and it is what a reviewer (human or AI) actually grades.
Bringing annotations to the Arena:

- lets users **think in writing** while designing — the pedagogical core of the
  whole app;
- lays the substrate the future challenges module and AI judge (deferred since
  100) will grade — a judge without the author's reasoning can only grade the
  drawing.

**Relationship to 119 (example callouts).** Spec 119 already ships *preset*
explanation as node-anchored callout bubbles, and explicitly scoped out
"free-form user annotations". This spec is the other half: the **user's own**
persistent notes on any element. The two are complementary — 119 = authored
preset content (transient, dismissible bubbles); 120 = user content (persistent,
travels with the design). Presets do **not** grow a second layer of authored
notes here (that would duplicate 119's callouts).

## Goals

- A user can attach a short free-text note to **any node and any edge** of the
  Arena canvas, edit it, and remove it.
- Annotated elements are **visibly marked** on the canvas so a note is
  discoverable without hunting; reading a note never requires more than one
  click (selecting the element).
- Annotations **persist with the design** (same lifetime as nodes/edges: they
  survive reload, are removed with their element, and are cleared by Reset).

## Non-goals

- No rich text, no markdown rendering, no images — plain text only.
- No AI feedback on the notes (that is the future judge spec).
- No backend, no persistence beyond localStorage (Arena stays frontend-only).
- No free-floating sticky notes detached from a node/edge (an annotation always
  belongs to an element; a canvas-level "design description" is deferred).
- No annotation on the load controls (users/think-time) — those are workload,
  not design.
- **No authored preset notes** — preset explanations already exist as 119's
  node-anchored callouts; this spec does not duplicate them.

## User-facing behavior

- Selecting a node shows a **note field** in the scale panel: placeholder text
  invites a justification ("Why this component / this sizing?"), typing saves
  it, clearing removes it.
- Selecting an edge (already possible since 107) now shows a small panel with
  the same note field for that connection.
- A node or edge carrying a note shows a small **note marker** on the canvas;
  the note text itself renders in the panel when the element is selected.
- Notes are capped (280 chars) with a live counter — annotations are captions,
  not essays.
- All chrome (label, placeholder, counter, clear action) ships in **en + pt**
  (constitution §4). The note *content* is the user's own prose and is never
  translated.

## Acceptance criteria

1. **AC1 — annotate a node.** Given a node is selected, when the user types a
   note and commits it, then the note is stored on that node, survives a page
   reload, and re-selecting the node shows the note text.
2. **AC2 — annotate an edge.** Given an edge is selected, when the user types a
   note and commits it, then the note is stored on that edge and re-selecting
   the edge shows it.
3. **AC3 — visible marker.** Given a node (or edge) carries a note, then the
   canvas renders a note marker on that element; elements without notes render
   no marker.
4. **AC4 — edit and remove.** Given an element with a note, when the user edits
   the text the stored note updates; when the user clears the text the note is
   removed (the stored element carries no empty-string residue) and the marker
   disappears.
5. **AC5 — lifetime follows the element.** Removing an annotated node/edge
   removes its note with it; Reset/clear leaves no notes behind; a persisted
   design missing the notes field (pre-120 localStorage blob) loads cleanly
   with no notes.
6. **AC6 — length cap.** Notes longer than 280 characters cannot be committed;
   the counter reflects the limit.
7. **AC7 — bilingual chrome.** Every new UI string (label, placeholder,
   counter, clear action) exists in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — the Arena is frontend-only and emits no
  `TraceEvent`s (100).
- Mirror in `frontend/src/types/events.ts`: n/a
- Station it maps to in `stations.ts`: none (Arena has its own component model)

## Open questions (clarify before planning)

- [x] Scope: nodes only, or nodes **and** edges? — **Both** (user, 2026-07-23):
  edges are already selectable since 107, and a connection choice is as much a
  decision as a box choice.
- [x] Do example presets ship authored bilingual notes? — **No, dropped on
  re-validation (2026-07-23)**: spec 119 (example callouts, now `done`) already
  delivers node-anchored preset explanations. Adding authored annotations would
  duplicate that, so 120 is now **user-notes-only**; the earlier "yes" is
  superseded. (Flagged to the user during validation.)

## Out of scope / deferred

- Canvas-level "design description" note (one note for the whole design) — a
  natural companion when the challenges module needs a submission summary.
- Exporting/sharing annotated designs (permalink/export spec, not yet written).
- Feeding notes to an AI judge (future challenges/judge spec).
