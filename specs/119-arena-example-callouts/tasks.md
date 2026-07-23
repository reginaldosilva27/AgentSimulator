# Tasks: 119-arena-example-callouts

TDD order — each implement task is driven by the failing test before it.

- [x] T1 (test, AC1) — `examples.test.ts`: every preset has ≥2 callouts, valid node ids, en+pt non-empty → red
- [x] T2 (impl, AC1) — `callouts` field + bilingual content for all 9 presets in `examples.ts` → green
- [x] T3 (test, AC4/AC3-store) — `store.test.ts`: `calloutsHidden` resets on `loadExample`; structural edit clears `exampleId` (callout source) → red
- [x] T4 (impl) — store flag + `hideCallouts` + reset in `loadExample` → green
- [x] T5 (test, AC2/AC3) — integration: callout visible after `loadExample`, hidden after ✕, absent with no example → red
- [x] T6 (impl) — ArenaCanvas lookup + ArenaNode bubble + `strings.ts` en+pt → green
- [x] T7 (verify) — `npm test`, `npm run build`, i18n audit, spec status → done
