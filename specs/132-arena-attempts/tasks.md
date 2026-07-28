# Tasks: Arena — attempts, progress & best solution

> Depends on **129** + **130** being `done`; composes with **131** (records its faults).
> Red → green → refactor. Vitest from `frontend/`.

## Tasks

- [x] **T0 — clarify**: **done 2026-07-27.** Recorded on **every** transition into solved **and
      unconditionally on exit** (the drafted "first solve only" would have hidden post-solve
      refinements — AC1b); cap **10**, best never evicted; best = **cheapest passing** (safe
      because only passing attempts are candidates), ties by latency then earliest; reference
      reveal ⇒ `assisted`; faults recorded + marked, no separate status; **two separate resets**.
      Status → `clarified`.
- [x] **T1 — test first (AC8 guard)**: a test asserting the pure modules (`model.ts`, `slo.ts`,
      `challenges.ts`, `chaos.ts`, `progress.ts`) contain no `Date.now` / `Math.random`. Write it
      first so the clock boundary can never erode.
- [x] **T2 — test first (AC1, AC2)**: `progress.test.ts` — `recordAttempt` appends the full
      entry; status untried → attempted → solved and stays solved after a later failure.
- [x] **T3 — implement**: `progress.ts` types + `recordAttempt` + the status rule (`untried` =
      absence of a record).
- [x] **T4 — test first (AC3)**: best = cheapest passing, ties by latency then earliest; no
      passing attempt ⇒ no best; **a cheaper failing attempt is never chosen** (the guard that
      keeps cost-first from rewarding the starved designs 129 measured).
- [x] **T5 — implement**: `bestAttempt` over the denormalised `costPerHourUsd` / `e2eLatencyMs`.
- [x] **T6 — test first (AC9)**: at cap + 1, the oldest **non-best** entry is evicted and the
      best passing attempt survives.
- [x] **T7 — implement**: `pruneHistory` + `HISTORY_CAP`.
- [x] **T8 — test first (AC4, AC7)**: `summarise` counts solved/total; a corrupt / foreign /
      unknown-id blob yields empty progress without throwing.
- [x] **T9 — implement**: `summarise` + load/save + sanitation for `agentsim.arena.progress`
      (with the `v` version field).
- [x] **T10 — test first (AC6, AC8)**: progress lives under its own key — `clear()` and
      `loadExample()` leave it intact and vice versa; a fake clock gives deterministic `at`.
- [x] **T11 — implement**: the store slice + `recordAttempt` action with the injectable clock
      (`__setArenaClock`) + `resetProgress`.
- [x] **T11b — test first (AC1b)**: solve → improve while still solved → exit yields **two**
      attempts, the second carrying the improved cost/latency; never-solved → exit yields exactly
      one; **and** enter→exit with nothing changed does **not** append a near-duplicate.
- [x] **T12 — implement**: the auto-record trigger — on each not-met→met transition **and** on
      exit, with the no-op guard (skip the exit record when design + verdict are unchanged since
      the last recorded attempt).
- [x] **T13 — test first (AC5)**: restoring an attempt reproduces nodes/edges/scaling/regions/
      tiers/notes **and** its faults, with the challenge's givens still locked.
- [x] **T14 — implement**: `restoreAttempt` (reusing 130's load path + 131's `applyFault`).
- [x] **T15 — test first (AC10)**: reset clears every record, the summary returns to zero, the
      canvas is untouched.
- [x] **T16 — implement**: the confirmed progress-reset control (copy naming exactly what is
      deleted).
- [x] **T17 — test first (AC4 UI, AC12)**: `AttemptHistory.test.tsx` + `ArenaPage.test.tsx` —
      per-challenge badge, *"N of M solved"*, history rows with the best marker and the
      assisted / with-faults markers, restore button.
- [x] **T18 — implement**: `AttemptHistory.tsx`, the solved state + History entry in
      `ChallengePanel.tsx`, badges + summary in the Challenges picker.
- [x] **T19 — regression (AC11)**: with no attempts recorded, 130/131 suites and the Arena page
      behave exactly as before.
- [x] **T20 — i18n (§4)**: `arena.progress.*` in en **and** pt (incl. `figuresFromThen` and
      `localOnly`, which are honesty copy, not decoration); extend the `i18n.test.ts` walk.
- [x] **T21 — cloud map (§5)**: n/a — no new tier/station (record the n/a).
- [x] **T22 — data model (§ docs)**: confirm **no** SQLite change ⇒ `docs/data-model.md`,
      `EXPECTED_TABLES` and `EXPECTED_CLEAR_KEYS` untouched; note the localStorage key instead.
- [x] **T23 — refactor**: `progress.ts` header comment — the two-key separation, the clock
      boundary, and why figures are denormalised (history must not be rewritten by a
      recalibration).
- [x] **T24 — demo check**: standing GitHub-Pages directive — confirm the mocked demo (058)
      needs no re-capture and say so.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] No `Date.now` / `Math.random` in any pure Arena module (T1's guard green)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green (from `frontend/`)
- [x] No protocol change and no SQLite change: `schemas.py` ↔ `events.ts`, `_SCHEMA`,
      `docs/data-model.md` all untouched
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
