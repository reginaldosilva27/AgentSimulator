# Spec: Arena example callouts — node-anchored explanations for the presets

| | |
|---|---|
| **ID** | 119-arena-example-callouts |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena's example presets carry their whole lesson in one dropdown
description — once loaded, the canvas is a bare diagram of boxes and numbers.
The 2026-07-23 review found the samples hard to read without guidance: *why*
does the AI Gateway show double the backend's QPS? *why* is that LLM pool
orange? A sample should explain itself **in place**. (A future "challenge
mode" will deliberately strip these explanations and use an LLM judge to
validate the user's design — out of scope here; this spec is the sample-mode
half.)

## Goals

- Each example preset ships small, node-anchored explanation bubbles
  ("caixinhas") that appear when the preset is loaded — each one pointing at a
  specific node and explaining, in one or two sentences, what that box shows
  at this load (bilingual).
- The callouts are dismissible (one gesture hides them for the loaded sample)
  and disappear automatically the moment the canvas stops being the preset
  (any structural edit — the existing `exampleId` semantics).

## Non-goals

- No challenge mode / LLM judge (its own future spec).
- No free-form user annotations; callouts are preset content.
- No backend/protocol change (Arena stays frontend-only).

## User-facing behavior

- Loading an example shows 2–4 speech-bubble callouts, each anchored above its
  node, in the current language. A ✕ on any bubble hides them all for this
  sample (transient — reloading the example brings them back).
- Dragging nodes keeps the bubbles attached (they belong to the node); any
  structural edit (add/remove/rewire/rescale) clears the preset selection and
  the callouts with it.
- Every preset teaches its own claim in place: e.g. simple-rag's LLM bubble
  says "2 calls per turn → 1,600 calls/s against ~150 of quota — the wall";
  the fleet's gateway bubble explains why its QPS is double the backend's.

## Acceptance criteria

1. **AC1 — content.** Every preset in `EXAMPLES` declares ≥ 2 callouts; every
   callout's `nodeId` exists in that preset's `build()`; every callout text is
   non-empty in BOTH `en` and `pt`.
2. **AC2 — projection.** With an example loaded (`exampleId` set), the canvas
   renders that preset's callouts attached to their nodes; with no example
   active, none render.
3. **AC3 — dismissal.** The ✕ hides all callouts for the loaded sample
   (transient state, not persisted); re-loading an example resets it.
4. **AC4 — structural edits clear.** Any structural edit (the existing
   `saveStruct` paths) clears `exampleId` and therefore the callouts — pinned
   by a store test (drop a node → callouts gone).

## Protocol / stage impact

- New/changed `Stage`(s): **none** (Arena is frontend-only; no TraceEvents).
- Mirror in `frontend/src/types/events.ts`: n/a.
- Station mapping: n/a.

## Open questions (clarify before planning)

*(resolved with the user, 2026-07-23)*

- ~~Card, anchored boxes or guided tour?~~ → Node-anchored boxes ("caixinhas").
- ~~Challenge mode?~~ → Later, with an LLM judge — separate spec.
