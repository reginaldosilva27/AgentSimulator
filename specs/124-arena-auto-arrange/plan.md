# Plan: Arena auto-arrange button

## Approach

A **pure layered layout function** in a new `frontend/src/arena/layout.ts`:
`autoLayout(nodes, edges, sizeOf)` → `Record<id, {x,y}>`.

- **Depth** = longest path from any source (in-degree 0); cycle-safe via a
  relaxation loop capped at `nodes.length` iterations; disconnected nodes keep
  depth from their own component (a lone node is a source at depth 0).
- **Columns**: column `d` starts at the previous column's right edge + `GAP_X`;
  column width = the widest box in it.
- **Rows**: inside a column, nodes sort by their *current* y (preserves the
  user's vertical intent — AC2), then stack top-down with `GAP_Y` using each
  box's height; every column is centered on the overall vertical midline.
- **Sizes** come from a `sizeOf(id)` callback. In the browser, `ArenaCanvas`
  feeds React Flow's measured dimensions via `getInternalNode(id).measured`
  (adapted by `measuredSizeOf`); when unmeasured (jsdom, first paint) a stated
  default (`DEFAULT_W/H`) is used.
  **Post-done regression fix:** the first cut read `getNodes()[].measured`,
  which is always empty here — in controlled mode the user nodes only gain
  `measured` if `onNodesChange` applies dimension changes, and ours ignores
  them. Every box fell back to `DEFAULT_W` and wall-grown banners still
  overlapped (user-reported). Fixed by reading the INTERNAL node; verified live
  with a Playwright pass over all 6 presets at max load (no pairwise overlap).

Store gets one action, `applyPositions(pos)` — a batch `moveNode`: updates all
node positions in one `save()` (one persist), **without** clearing `exampleId`
(non-structural, AC3).

The button is a React Flow `ControlButton` inside the existing `<Controls>`
cluster; on click it computes the layout from `getNodes()` (measured sizes),
applies it, and calls `fitView` on the next frame.

Alternative considered: a dagre/elk dependency — rejected (heavy, and the
graph is a shallow DAG; ~60 lines of pure code cover it and stay testable).

## Affected files

**Frontend**
- `frontend/src/arena/layout.ts` — NEW: `autoLayout` + exported gaps/defaults.
- `frontend/src/arena/layout.test.ts` — NEW: pure tests (AC1/AC2/AC5).
- `frontend/src/arena/store.ts` — `applyPositions(pos)` action.
- `frontend/src/arena/ArenaCanvas.tsx` — `ControlButton` (⤲ icon) wired to
  `autoLayout` + `applyPositions` + `fitView`.
- `frontend/src/i18n/strings.ts` — `arena.autoArrange` (en + pt).
- `frontend/src/arena/ArenaCanvas.integration.test.tsx` — button test (AC3/AC4).
- `frontend/src/arena/store.test.ts` — `applyPositions` keeps `exampleId`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None (positions already persist in the localStorage blob).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.autoArrange` | Auto-arrange boxes | Reorganizar caixas |

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | chain layout: x strictly increases with depth; no pairwise overlap with given sizes | `frontend/src/arena/layout.test.ts` |
| AC2 | same-depth nodes stack with ≥ GAP_Y and keep relative order | same |
| AC5 | cycle + disconnected node → finite positions for all | same |
| AC3 | `applyPositions` keeps `exampleId` + persists | `frontend/src/arena/store.test.ts` |
| AC4 | button rendered with bilingual title; click moves overlapping same-column nodes apart; empty canvas no-op | `frontend/src/arena/ArenaCanvas.integration.test.tsx` |

## Risks / trade-offs

- jsdom never measures nodes → integration tests exercise the DEFAULT_W/H path;
  the measured path is a straight pass-through (`measured.width ?? DEFAULT_W`).
- Cycles are user-drawable; the relaxation cap keeps the loop total. A cycle's
  members land on close depths — acceptable (AC5 asks for finite, not pretty).
