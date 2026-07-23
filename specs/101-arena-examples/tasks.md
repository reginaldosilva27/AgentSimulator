# Tasks: Arena — example scenarios + default sample

> TDD checklist (red → green). Frontend-only.

## Preset library

- [x] **T1 — test**: `arena/examples.test.ts` — AC3 (≥3 presets; each has bilingual
  title/description + `build()` returning a valid design) + AC6 (en/pt non-empty).
- [x] **T2 — impl**: `arena/examples.ts` — the 4 presets + `DEFAULT_EXAMPLE_ID` +
  `defaultDesign()` helper.
- [x] **T3 — test**: AC5 — via `computeMetrics`: `simple-rag` → LLM `critical`;
  `scale-llm` → LLM NOT `critical` (the teaching claim is real).
- [x] **T4 — impl**: tune the two presets' scaling/load so the model claim holds.

## Store wiring

- [x] **T5 — test**: `arena/store.test.ts` — AC1 (absent key → default sample, non-empty)
  + AC2 (present/empty blob respected) + AC4 (`loadDesign` persists + round-trips).
- [x] **T6 — impl**: `store.ts` — `loadArena()` seeds the sample when the key is absent;
  add `loadDesign(design)` action.

## Page wiring + i18n

- [x] **T7 — impl**: `ArenaPage.tsx` — Examples menu in the control bar → `loadDesign`.
- [x] **T8 — i18n**: `arena.examples` label en+pt in `strings.ts`; preset meta already
  bilingual in `examples.ts` (pinned by T1).

## Gates

- [x] **T9 — verify**: `npm test` + `npm run build` green; Simulator untouched.

## Definition of done

- [x] AC1–AC6 each map to a passing test
- [x] `npm test` (Vitest) green · `npm run build` clean
- [x] No protocol change; no new `Stage`
- [x] All new user-facing text en **and** pt
- [x] Demo (058): still frontend-only, no fixture capture needed
- [x] `spec.md` status → `done`
