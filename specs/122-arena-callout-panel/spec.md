# Spec: Arena example callouts as a side-panel list

| | |
|---|---|
| **ID** | 122-arena-callout-panel |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

Spec 119 introduced per-node explanation bubbles ("callouts") for loaded example
presets. In practice they pollute the canvas: every bubble opens at once, each is
~224px wide, and on dense presets (regional quota, fleet) the bubbles overlap each
other and cover neighbouring nodes — the user reported the visual clutter directly.
The pedagogy is right (each preset explains *why* its numbers work), but the
presentation fights the diagram it is explaining.

## Goals

- Keep the preset explanations (bilingual, per-node) but remove all node-anchored
  bubbles from the canvas.
- Present the explanations as a compact list in a side panel: one entry per callout,
  labelled with the component it refers to.
- Preserve the spatial link: pointing at a list entry visually highlights the
  corresponding node on the canvas.
- Keep the existing dismissal semantics: the list can be hidden for the loaded
  sample and reappears when a sample is (re)loaded; any structural edit still
  removes it (the design is no longer the preset).

## Non-goals

- No change to the callout *content* or to `examples.ts` authoring shape
  (`callouts: [{ nodeId, text: {en,pt} }]` stays).
- No guided tour / step navigation (parked).
- No change to user annotations (120 notes) or nudges (115).
- Nothing touches the Simulator page, the event protocol, or the backend.

## User-facing behavior

Loading an example preset no longer draws bubbles above nodes. Instead a "Example
notes" panel appears on the canvas (out of the way of the scale panel), listing each
callout as "«Component» — explanation". Hovering (or focusing) an entry highlights
the matching node on the canvas. A ✕ on the panel hides it for this sample;
re-loading a sample shows it again. Editing the design structurally (add/remove
node or edge) removes the panel, as it already removed the bubbles.

## Acceptance criteria

1. **AC1** — Given a loaded example preset, when the canvas renders, then no
   node-anchored callout bubble exists; instead a panel lists every callout of that
   preset, each entry prefixed by the component's label.
2. **AC2** — Given the notes panel is visible, when the user clicks its ✕, then the
   panel (and all callout texts) disappear; when the user re-loads a sample, the
   panel shows again.
3. **AC3** — Given a loaded preset, when the user makes a structural edit (e.g.
   adds a node), then the panel disappears (same rule that cleared the bubbles).
4. **AC4** — Given the notes panel is visible, when the user hovers/focuses a list
   entry, then the corresponding canvas node is visually highlighted; leaving
   clears the highlight.
5. **AC5** — All new user-facing text (panel title, etc.) ships in en **and** pt.

## Protocol / stage impact

- New/changed `Stage`(s): none (Arena is frontend-only, no `TraceEvent`s — 100 AC8)
- Mirror in `frontend/src/types/events.ts`: n/a
- Station mapping: n/a

## Open questions (clarify before planning)

- [x] Panel placement? → bottom-right of the canvas, so it never collides with the
      ScalePanel/EdgePanel (top-right) or the nudge chips (top-left).
- [x] Click behaviour on an entry? → hover/focus highlight only in this spec;
      selecting/centering is deferred.

## Out of scope / deferred

- Clicking an entry to select or pan to the node.
- Learn-topic links from callouts (121 covers concept links).
