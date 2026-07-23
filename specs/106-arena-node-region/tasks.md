# Tasks: Arena — per-node region

> TDD (red → green). Run from `frontend/`.

- [x] **T1 — test**: `store.test.ts` — AC1 `setRegion` updates node + persists +
  clears `exampleId`; invalid region ignored.
- [x] **T2 — impl**: `ARENA_REGIONS` + `ArenaNode.region` + `setRegion`.
- [x] **T3 — test**: `ScalePanel.test.tsx` — AC2 select renders for backend/llm,
  absent for client; change updates the node.
- [x] **T4 — test**: `examples.test.ts` — AC4 prod 2 distinct + fleet 4 distinct
  regions; `ArenaCanvas.integration.test.tsx` — AC3 badge text on canvas.
- [x] **T5 — impl**: panel select + node badge + preset regions + strings en/pt.
- [x] **T6 — verify**: full vitest + tsc + build green.

## Definition of done

- [x] AC1–AC5 map to passing tests · suite green · build clean
- [x] All new text en + pt · no protocol change · `spec.md` → done
