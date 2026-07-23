# Tasks: Arena — semantic cache

> Ordered TDD checklist. Independent of the 108–110 track.

## Tasks

- [x] **T1 — test first (AC1)**: failing `components.test.ts` — kind exists with full
  bilingual meta, clouds, scaling vocab, palette position.
- [x] **T2 — implement**: catalog entries in `components.ts`; make T1 pass.
- [x] **T3 — test first (AC2/AC3)**: failing `model.test.ts` — miss-only forwarding at
  default 0.25; `cache` unchanged at 0.8; LLM arriving −25% pin; cpr composes.
- [x] **T4 — implement**: cache-like branch in `model.ts`; make T3 pass.
- [x] **T5 — implement**: hit-ratio slider applies to the new kind in `ArenaCanvas.tsx`
  (extend the existing control's kind check; snapshot/interaction test).
- [x] **T6 — test first (AC4)**: failing `examples.test.ts` — new preset pinned
  (LLM unhealthy without cache, healthy with).
- [x] **T7 — implement**: preset in `examples.ts` (en + pt); make T6 pass.
- [x] **T8 — i18n/cloud audit (AC5)**: parity check en/pt; azure/aws/gcp filled.
- [x] **T9 — refactor**: keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] All new user-facing text in en **and** pt; cloud map filled for the new kind
- [x] No protocol impact
- [x] `spec.md` status updated to `done`
