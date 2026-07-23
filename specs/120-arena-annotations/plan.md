# Plan: Arena annotations — justify design decisions on the canvas

> The HOW. Written after `spec.md` is `clarified`. Decisions here must respect every
> principle in `.specify/constitution.md`; if one must bend, amend the constitution
> first and note it.

## Approach

An annotation is one optional `note?: string` on the elements that already
exist — `ArenaNode` (store) and `ArenaEdge` (model, ignored by
`computeMetrics`, exactly like `region` in 106 v1). No new entity, no new
store: notes ride the design through the existing localStorage persistence,
element removal and `clear()` for free (AC5 mostly falls out of the data
shape).

Two store actions (`setNodeNote` / `setEdgeNote`) trim input, cap at
`NOTE_MAX = 280`, and **delete the key** on empty (no `""` residue). Note
edits commit via `save` (not `saveStruct`): annotating is not a structural
edit, so it keeps the Examples dropdown selection — consistent with how
node dragging behaves.

Edge selection today lives inside React Flow (Backspace removal, 107). To
drive an edge note panel the same way the node scale panel works, edge
selection moves to the store as `selectedEdgeId` (mutually exclusive with
`selectedId`), mirroring what 107 did for nodes.

Presets ship **no** authored notes (see spec Non-goals): preset explanation is
119's node-anchored callouts. `examples.ts` is untouched by this spec — a big
simplification (no bilingual preset note content, no reading the language store
outside React).

Alternative considered: a separate `annotations: Record<elementId, string>`
map keyed by id — rejected because it re-implements the element lifecycle
(remove/clear/preset-load) that storing the note on the element gets for free.

## Affected files

**Backend** — none (Arena is frontend-only, 100).

**Frontend**
- `frontend/src/arena/model.ts` — `ArenaEdge` gains `note?: string` (model
  ignores it; a comment states so).
- `frontend/src/arena/store.ts` — `ArenaNode.note?: string`; `NOTE_MAX`
  export; actions `setNodeNote(id, note)` / `setEdgeNote(id, note)`;
  `selectedEdgeId: string | null` + `selectEdge(id | null)` (clears
  `selectedId`, and `select()` clears `selectedEdgeId`); `loadArena()`
  validation keeps `note` only when it is a string ≤ `NOTE_MAX` (pre-120 blobs
  load clean).
- `frontend/src/arena/ArenaCanvas.tsx` — project `note` into RF nodes/edges;
  edge click selects into the store (`selectEdge`); annotated edges get a 📝
  edge label marker; `ScalePanel` (lives here) gains the note textarea +
  counter + clear for nodes, and a new minimal `EdgePanel` renders the same
  field when `selectedEdgeId` is set.
- `frontend/src/arena/ArenaNode.tsx` — 📝 marker badge when `note` is present.
- `frontend/src/i18n/strings.ts` — new `t.arena.*` strings (label,
  placeholder, clear, connection-panel title), en + pt.

## Protocol changes (constitution §1)

None — no Stage/Phase/TraceEvent. `schemas.py` / `events.ts` untouched.

## Data model changes

None server-side. localStorage blob (`agentsim.arena`) gains optional `note`
fields; loader is backward-compatible (AC5).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `t.arena.noteLabel` | Note | Nota |
| `t.arena.notePlaceholder` | Why this choice? | Por que essa escolha? |
| `t.arena.noteClear` | Clear note | Limpar nota |
| `t.arena.noteCounter(n)` | {n}/280 | {n}/280 |
| `t.arena.edgePanelTitle` | Connection | Conexão |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 (node note stored + persists) | `setNodeNote` stores; persisted blob round-trips through `loadArena` | `frontend/src/arena/store.test.ts` |
| AC2 (edge note) | `setEdgeNote` stores; `selectEdge` drives the panel | `frontend/src/arena/store.test.ts` + `ScalePanel.test.tsx` |
| AC3 (marker) | node with note renders marker; without note renders none; annotated edge projects a label | `ArenaCanvas.integration.test.tsx` |
| AC4 (edit/remove, no residue) | edit updates; empty string deletes the key | `frontend/src/arena/store.test.ts` |
| AC5 (lifetime + pre-120 blob) | removeNode/removeEdge/clear drop notes; blob without notes loads | `frontend/src/arena/store.test.ts` |
| AC6 (cap 280) | overlong input is truncated/rejected at `NOTE_MAX` | `frontend/src/arena/store.test.ts` + panel maxLength in `ScalePanel.test.tsx` |
| AC7 (bilingual chrome) | new keys exist in both languages | `frontend/src/arena/i18n.test.ts` |

## Risks / trade-offs

- **Edge selection migration**: moving edge selection into the store must not
  break 107's Backspace removal — the integration test that pins
  `edgeIdsToRemove` behavior must stay green.
- **Persist-on-keystroke**: writing localStorage on every keypress is noisy;
  commit on blur/debounce, mirroring the `dragNode` (state-only) vs `moveNode`
  (persist) split.
