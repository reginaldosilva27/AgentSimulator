# Tasks: Arena annotations — justify design decisions on the canvas

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC1, AC4, AC6)**: failing tests in `store.test.ts` —
  `setNodeNote` stores/edits, empty clears the key (no `""` residue), input is
  capped at `NOTE_MAX = 280`, note round-trips through persistence.
- [x] **T2 — implement**: `ArenaNode.note` + `setNodeNote` + `NOTE_MAX` in
  `store.ts`; make T1 pass.
- [x] **T3 — test first (AC2)**: failing tests — `ArenaEdge.note`, `setEdgeNote`,
  `selectEdge`/`select` mutual exclusion.
- [x] **T4 — implement**: edge note + store edge selection; make T3 pass.
- [x] **T5 — test first (AC5)**: failing tests — removeNode/removeEdge/clear drop
  notes; pre-120 blob (no `note` fields) loads cleanly; non-string note in a
  corrupted blob is dropped by `loadArena`.
- [x] **T6 — implement**: loader validation; make T5 pass.
- [x] **T7 — test first (AC1/AC2/AC6 UI)**: failing tests in `ScalePanel.test.tsx`
  — note textarea renders for a selected node with label/placeholder/counter/
  clear; edge panel renders the same field for a selected edge; maxLength
  enforced.
- [x] **T8 — implement**: note field in `ScalePanel` + minimal `EdgePanel` in
  `ArenaCanvas.tsx`; make T7 pass.
- [x] **T9 — test first (AC3)**: failing tests in
  `ArenaCanvas.integration.test.tsx` — annotated node shows the 📝 marker,
  plain node shows none; annotated edge projects a marker label.
- [x] **T10 — implement**: marker badge in `ArenaNode.tsx` + edge label
  projection in `ArenaCanvas.tsx`; make T9 pass.
- [x] **T11 — i18n (AC7)**: extend `i18n.test.ts` for the new `t.arena.*` keys,
  then add them to `strings.ts` in en + pt.
- [x] **T12 — refactor**: dedupe the node/edge note field into one component,
  keep all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green (Vitest)
- [x] No protocol impact to mirror (frontend-only — verified no `schemas.py` /
  `events.ts` diff)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
