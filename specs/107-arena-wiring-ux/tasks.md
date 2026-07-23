# Tasks: Arena — wiring UX

> TDD (red → green). Run from `frontend/`.

- [x] **T1 — test**: `store.test.ts` — AC1 `dropNode` wires from the selected node
  + selects the new one; free drop with no selection; AC2 `select`/`removeNode`
  clears selection.
- [x] **T2 — impl**: store `selectedId`/`select`/`dropNode` + removeNode clearing.
- [x] **T3 — test**: integration — AC3 `edgeIdsToRemove` filter; AC4 handles carry
  `arena-handle`; `ArenaPage.test.tsx` — AC5 hints visible.
- [x] **T4 — impl**: canvas (store selection, dropNode, connectionRadius, line
  style, deleteKeyCode, edge selection + onEdgesChange), handles, palette hints,
  strings en/pt.
- [x] **T5 — verify**: full vitest + tsc + build green.

## Definition of done

- [x] AC1–AC5 map to passing tests · suite green · build clean
- [x] All new text en + pt · no protocol change · `spec.md` → done
