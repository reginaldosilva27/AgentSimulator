# Plan: Arena example callouts as a side-panel list

## Approach

Move the 119 callouts from per-node absolute bubbles (`ArenaNode`) to one
`CalloutPanel` component rendered by `ArenaCanvas`, docked bottom-right (the
ScalePanel/EdgePanel own top-right; nudges own top-left; React Flow `Controls`
sit bottom-left). The store contract is untouched: `exampleId` +
`calloutsHidden` (+ `hideCallouts()`, reset in `loadExample`) already encode
every visibility rule (AC2/AC3) — only the *projection* changes.

Node highlight on hover: a transient `highlightId` local state in `ArenaCanvas`,
threaded to `ArenaNodeData.highlight`; `ArenaNode` renders the same sky border it
uses for `selected`. Pure UI state — not persisted, not in the store.

Alternatives considered: (a) collapse bubbles to per-node 💡 markers — still adds
canvas chrome per node; (b) guided tour — heavier, deferred. The side list wins on
zero occlusion.

## Affected files

**Frontend**
- `frontend/src/arena/ArenaNode.tsx` — delete the callout bubble block + the
  `callout?` field; add `highlight?: boolean` (border treatment).
- `frontend/src/arena/ArenaCanvas.tsx` — stop mapping `callout` into node data;
  compute the callout list (nodeId → component label + text) and render the new
  `CalloutPanel` (exported for tests); thread `highlight`.
- `frontend/src/i18n/strings.ts` — add `arena.calloutsTitle`; keep `calloutHide`.
- `frontend/src/arena/ArenaCanvas.integration.test.tsx` — rewrite the 119 block
  for the panel; add the AC4 highlight test.

**Backend** — none.

## Protocol changes (constitution §1)

None. Arena remains frontend-only (no Stage/TraceEvent).

## Data model changes

None (no persistence change; `calloutsHidden` stays transient/unpersisted).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.calloutsTitle` | Example notes | Notas do exemplo |
| `arena.calloutHide` (existing, reused) | Hide explanations | Ocultar explicações |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | loaded preset renders the panel with every callout labelled by component; no bubble markup on nodes | `frontend/src/arena/ArenaCanvas.integration.test.tsx` |
| AC2 | ✕ hides the panel; `loadExample` shows it again | same file |
| AC3 | structural edit (addNode) removes the panel | same file (existing test, retargeted) |
| AC4 | hovering an entry highlights the node; mouse-out clears | same file |
| AC5 | strings audit — `calloutsTitle` exists in en+pt | `frontend/src/arena/i18n.test.ts` pattern / strings shape (tsc enforces `Record<Lang,…>`) |

## Risks / trade-offs

- Losing the spatial anchor is the point, but it costs at-a-glance locality — the
  hover-highlight (AC4) restores the link. jsdom can't do real hover on React Flow
  internals, so the test fires `mouseEnter`/`mouseLeave` on the list entry and
  asserts the node wrapper/border state via the exported panel + node data path.
- Panel could grow tall on presets with many callouts → cap height with scroll
  (`max-h` + `overflow-y-auto`).
