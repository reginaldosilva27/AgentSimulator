# Tasks: Arena example callouts as a side-panel list

## Tasks

- [x] **T1 — test first (AC1/AC2/AC3)**: rewrite the 119 block in
      `ArenaCanvas.integration.test.tsx`: panel lists callouts with component
      labels, no node bubbles, ✕ hides, reload shows, structural edit removes.
- [x] **T2 — test first (AC4)**: hover/focus on a panel entry highlights the node.
- [x] **T3 — implement**: `CalloutPanel` in `ArenaCanvas.tsx`; remove the bubble
      from `ArenaNode.tsx`; thread `highlight`.
- [x] **T4 — i18n**: `arena.calloutsTitle` in en + pt (constitution §4).
- [x] **T5 — refactor + gates**: `npm test`, `npm run build` green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build) — 940/940 Vitest
- [x] `npm test` green
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
