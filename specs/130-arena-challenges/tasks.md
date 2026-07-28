# Tasks: Arena — challenge library

> Depends on **129** being `done` (`slo.ts` provides `measureDesign` + `evaluateObjectives`).
> Red → green → refactor. Vitest from `frontend/`.

## Tasks

- [x] **T0 — clarify**: **done 2026-07-27.** Reshaped by 129's measured baseline: challenge 1 is
      a **latency** challenge (shed is nearly vacuous under the closed loop); **cost is never a
      lone axis** (AC14); a **≥20% margin** is required on both sides (AC15 — measurement caught
      challenge 4 on a 2.5 s knife edge); targets **pinned + policed**; briefs **explain the
      ~15 s per-turn floor** (AC16); reference reveal free in v1; nudges **re-fire** in a
      challenge (AC17). The confirmed six-challenge table is in `spec.md`. Status → `clarified`.
- [x] **T1 — refactor first**: extract `node()` / `edge()` / `COL` / `ROW` out of
      `examples.ts` into a shared helper; existing `examples.test.ts` stays green
      (behaviour-preserving, so TDD here = the existing suite as the regression net).
- [x] **T2 — test first (AC1)**: `challenges.test.ts` — walk `CHALLENGES` for unique ids,
      valid difficulty, non-empty en+pt title/brief, ≥1 objective, complete givens. Fails
      (module does not exist).
- [x] **T3 — test first (AC2, AC3, AC14, AC15, AC16)**: the library-walking guarantees, written
      **before any challenge content** — every `reference()` **passes** its objectives with
      **≥20% slack**; every `start()` **misses** one by **≥20%**; no challenge carries `cost`
      without latency or headroom; every latency-bearing brief explains the per-turn floor in
      both languages; every reference uses only its `allowedKinds`.
- [x] **T4 — implement**: `challenges.ts` with the **first** challenge (*the agent's wall* — a
      **latency** challenge: 16k users @ 1 msg/20 s, e2e ≤ 30 s, starting at ~225 s): types,
      `CHALLENGES`, givens, objectives, `start`, `reference`. Iterate until T2/T3 pass.
- [x] **T5 — implement**: the remaining five challenges (the confirmed table in `spec.md`), one
      at a time, each landing green under T3's walk before starting the next. **Challenge 4
      needs its demand raised** until the regional quota bites hard enough for AC15's margin —
      raise `users`, never lower the target.
- [x] **T6 — test first (AC4, AC5)**: `store.test.ts` — `enterChallenge` applies givens +
      starting design; enter→exit restores the sandbox deep-equal.
- [x] **T7 — implement**: `challengeId` + `sandbox` stash + `enterChallenge` / `exitChallenge`
      in `store.ts`.
- [x] **T8 — test first (AC6, AC17)**: `setUsers` / `setThinkTime` / `setCallShape` are no-ops
      while a challenge is active; entering clears `dismissedNudges` and exiting restores the
      sandbox's dismissals.
- [x] **T9 — implement**: the given-lock guards in those three actions + the nudge reset/restore
      in `enterChallenge` / `exitChallenge` (the stash carries `dismissedNudges`).
- [x] **T10 — test first (AC11)**: persisted `challengeId` restores challenge mode; an unknown
      id falls back to sandbox without throwing; a malformed stash is dropped.
- [x] **T11 — implement**: persistence + sanitation in `loadArena` (128 `modelTier` precedent).
- [x] **T12 — test first (AC9)**: `loadReference()` loads the reference and keeps the
      challenge active with the givens still locked.
- [x] **T13 — implement**: `loadReference` action.
- [x] **T14 — test first (AC8)**: `Palette.test.tsx` — `allowedKinds` restricts the palette
      and composes with 126's groups + search; absent ⇒ full palette.
- [x] **T15 — implement**: the palette filter.
- [x] **T16 — test first (AC7)**: `ChallengePanel.test.tsx` — failing challenge renders ✗ +
      "Not yet"; a scaling action flips it to "Solved" with no reload.
- [x] **T17 — implement**: `ChallengePanel.tsx` (brief, difficulty badge, 129 checklist,
      verdict, reference reveal, exit) + the **Challenges** picker in `ArenaPage.tsx` + the
      locked/read-only state on the load controls.
- [x] **T18 — test first (AC10)**: extend `learnLinks.test.ts` to validate every challenge's
      `concepts` topic ids.
- [x] **T19 — implement**: concept chips in the panel (reuse 121's `learnTarget` deep link).
- [x] **T20 — regression (AC12)**: with no challenge active, `ArenaPage.test.tsx`,
      `model.test.ts`, `examples.test.ts` all green and `computeMetrics` untouched.
- [x] **T21 — i18n (§4)**: `arena.challenge.*` en + pt; extend the `i18n.test.ts` walk to
      cover every challenge's title + brief (AC13).
- [x] **T22 — cloud map (§5)**: n/a — no new tier/station (record the n/a).
- [x] **T23 — refactor**: `challenges.ts` header comment stating the pinned-targets trade
      (a recalibration must re-tune the challenge, never weaken T3's walk).
- [x] **T24 — demo check**: standing GitHub-Pages directive — confirm the mocked demo (058)
      needs no re-capture (Arena uses no fixtures) and say so.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] Every challenge's reference solution verified solvable by the model (AC2) and every
      starting design verified unsolved (AC3)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green (from `frontend/`)
- [x] No protocol change: no `Stage`, no `TraceEvent`, `schemas.py` ↔ `events.ts` untouched
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
