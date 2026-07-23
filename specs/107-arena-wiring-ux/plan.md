# Plan: Arena — wiring UX

> HOW. Frontend-only; extends specs 100–106.

## Approach

- **Store** (`arena/store.ts`): `selectedId: string | null` + `select(id)`
  (transient, not persisted — mirrors `exampleId`); `dropNode(kind, pos)` =
  addNode + auto-wire from `selectedId` + select the new node; `removeNode`
  clears a matching selection.
- **Canvas** (`arena/ArenaCanvas.tsx`): replace the local `useState` selection
  with the store's; `onDrop` → `dropNode`; `connectionRadius={50}`; styled
  `connectionLineStyle`; `deleteKeyCode={["Backspace","Delete"]}`; controlled
  edge selection (local `Set` fed by select-changes) + `onEdgesChange` routing
  remove-changes to `store.removeEdge` via an exported pure
  `edgeIdsToRemove(changes)` helper; selected edges styled.
- **Handles** (`arena/ArenaNode.tsx`): `arena-handle` class — 14px, sky fill,
  panel ring, hover scale.
- **Palette** (`arena/Palette.tsx`): footer gains the auto-wire + delete-link
  hints (`arena.autoWireHint`, `arena.edgeHint`), en + pt.

## Affected files

`arena/store.ts` · `arena/store.test.ts` · `arena/ArenaCanvas.tsx` ·
`arena/ArenaCanvas.integration.test.tsx` · `arena/ArenaNode.tsx` ·
`arena/Palette.tsx` · `arena/ArenaPage.test.tsx` · `i18n/strings.ts`.

## Protocol / data model changes

None (selection is transient; nothing new persisted).

## i18n strings (constitution §4)

| key | en | pt |
|---|---|---|
| `arena.autoWireHint` | Tip: with a node selected, a dropped component is wired from it automatically | Dica: com um nó selecionado, um componente solto no canvas já é ligado a partir dele |
| `arena.edgeHint` | Click a link and press Backspace to remove it | Clique numa ligação e pressione Backspace para removê-la |

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 | dropNode wires from selected + selects new; free drop without selection | `store.test.ts` |
| AC2 | select/removeNode selection semantics | `store.test.ts` |
| AC3 | `edgeIdsToRemove` filters remove-changes | `ArenaCanvas.integration.test.tsx` (unit block) |
| AC4 | handles carry the `arena-handle` class | `ArenaCanvas.integration.test.tsx` |
| AC5 | hints render bilingually | `ArenaPage.test.tsx` + leafKeys parity |

## Risks / trade-offs

- Auto-wire may surprise a user who wanted a free node — mitigated by the hint +
  deselect-on-pane-click (already standard) + easy edge deletion (same spec).
- Keyboard-delete of edges is untestable in jsdom; the pure change-filter +
  store.removeEdge tests pin the wiring, the RF props are inspection-level.
