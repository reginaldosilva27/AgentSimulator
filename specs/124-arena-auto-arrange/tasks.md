# Tasks: Arena auto-arrange button

## Tasks

- [x] **T1 — test first (AC1/AC2/AC5)**: `layout.test.ts` — columns by depth, no
      overlap, same-depth stacking preserves order, cycles/disconnected finite.
- [x] **T2 — implement**: `layout.ts` `autoLayout` (pure).
- [x] **T3 — test first (AC3)**: `store.test.ts` — `applyPositions` moves nodes,
      keeps `exampleId`, persists.
- [x] **T4 — implement**: `applyPositions` in `store.ts`.
- [x] **T5 — test first (AC4)**: integration — button title (en), click
      separates overlapping same-column boxes, empty canvas no-op.
- [x] **T6 — implement**: `ControlButton` in `ArenaCanvas.tsx` + `fitView`.
- [x] **T7 — i18n**: `arena.autoArrange` en + pt.
- [x] **T8 — gates**: `npm test` + `npm run build` green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
