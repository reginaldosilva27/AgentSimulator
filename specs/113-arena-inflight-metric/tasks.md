# Tasks: Arena — in-flight metric

> Ordered TDD checklist. Depends on 109 (path-latency helper); AC4 uses 110's matrix.

## Tasks

- [x] **T1 — test first (AC1)**: failing `model.test.ts` — chain and two-branch pins
  for `heldInFlight`.
- [x] **T2 — test first (AC2)**: failing — saturated downstream ⇒ `null`.
- [x] **T3 — implement**: `heldInFlight` in `model.ts` (compose metrics + 109 helper);
  make T1–T2 pass.
- [x] **T4 — test first (AC4)**: failing — client in-flight ≤ users over the
  closed-loop design matrix.
- [x] **T5 — verify**: T4 passes via 110's equilibrium (no extra code expected — pin it).
- [x] **T6 — test first (AC3)**: failing `ScalePanel.test.tsx` — row renders value/`—`
  + ℹ️ text.
- [x] **T7 — implement**: scale-panel row; make T6 pass.
- [x] **T8 — i18n (AC5)**: en + pt; parity test.
- [x] **T9 — refactor**: keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] All new user-facing text in en **and** pt
- [x] No protocol impact
- [x] `spec.md` status updated to `done`
