# Tasks: Arena — palette grouped by component type (+ search)

> Ordered TDD checklist (red → green → refactor). Frontend-only. Depends on
> 125-arena-component-expansion for the full group table (implement 125 first;
> the exactly-once test keeps the merge honest either way).

## Tasks

- [ ] **T1 — test first (AC1)**: `components.test.ts` — flattened
  `PALETTE_GROUPS` covers every `ArenaKind` exactly once (compare against
  `Object.keys(BENCHMARKS)`); `PALETTE_ORDER` has identical contents (derived).
  RED.
- [ ] **T2 — implement**: `PaletteGroup` + `PALETTE_GROUPS` in `components.ts`;
  derive `PALETTE_ORDER`. GREEN (T1).
- [ ] **T3 — test first (AC3, pure)**: `filterPalette` unit tests — substring
  match on label+description, case/accent-insensitive, per-language, drops empty
  groups, no-match → `[]`. RED.
- [ ] **T4 — implement**: `filterPalette` (NFD normalize + strip marks). GREEN
  (T3).
- [ ] **T5 — test first (AC2/AC3 UI)**: new `Palette.test.tsx` — group headers
  render in order (en and pt); search narrows + shows bilingual empty state +
  clear restores. RED.
- [ ] **T6 — implement UI**: `Palette.tsx` renders groups + search input + empty
  state; i18n strings added. GREEN (T5).
- [ ] **T7 — test first (AC4)**: extend `ArenaCanvas.integration.test.tsx` —
  add-from-group while filtered → node added + 107 auto-wire intact. RED (if the
  behavior regressed) / pin GREEN.
- [ ] **T8 — i18n audit (AC5)**: loop test over new strings in `i18n.test.ts`;
  run the i18n-auditor agent over the diff.
- [ ] **T9 — refactor + gates**: `npm run build` + full `npm test` from
  `frontend/`; visual sanity pass (screenshot) of the grouped rail.
- [ ] **T10 — memory/demo check**: update Arena roadmap memory; ask the user
  about the 058 demo re-capture (standing directive — expected "no": the demo
  doesn't include the Arena).

## Definition of done

- [ ] Every AC in `spec.md` maps to a passing test
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npm test` green (Vitest, from `frontend/`)
- [ ] No protocol impact (none intended); backend untouched
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
