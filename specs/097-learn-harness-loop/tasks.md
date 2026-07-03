# Tasks: Learn — Harness & Loop Engineering

> TDD checklist, ordered. Each implementation task is preceded by the failing test that drives it.
> Frontend Learn-content only — no backend, no protocol change.

## Tasks

- [x] **T1 — test (AC1, AC6)**: `content.test.ts` — assert resolved Learn content contains topic ids
  `engineering-ladder`, `harness-engineering`, `loop-engineering`, each with ≥1 valid `{label,url}`
  link (fails: topics don't exist yet).
- [x] **T2 — impl**: add the `ai-engineering-disciplines` section + the three topic *skeletons*
  (ids + one link each) to `SECTIONS_SRC` in `content.ts`. Make T1 pass.
- [x] **T3 — test (AC2)**: extend `content.test.ts` — the three topics have non-empty
  what/why/how/options in **both** `en` and `pt` (reuse/extend the existing parity assertion).
- [x] **T4 — impl**: write full bilingual `what/why/how/options` prose for all three topics.
  Make T3 pass.
- [x] **T5 — test (AC5)**: ladder topic lists prompt → context → harness → loop in order and names
  the two axes the simulator makes visible.
- [x] **T6 — impl**: author the ladder topic body to satisfy T5.
- [x] **T7 — test (AC3)**: harness topic references the real harness pieces (tools/MCP, RAG,
  App DB memory, context budget, guardrails, model).
- [x] **T8 — impl**: author the harness topic body (grounded in real stations) to satisfy T7.
- [x] **T9 — test (AC4)**: loop topic references the real loop shape, `MAX_ITERATIONS`,
  `simulate_failure`.
- [x] **T10 — impl**: author the loop topic body (grounded in the real ReAct loop) to satisfy T9.
- [x] **T11 — refactor**: order the section sensibly in `SECTIONS_SRC`, confirm curated links
  resolve, keep all tests green.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test.
- [x] `npm run build` passes (`tsc --noEmit` + build).
- [x] `npm test` (Vitest) green — `content.test.ts` covers the three topics.
- [x] Zero backend diff; no new `Stage`; `events.ts` untouched.
- [x] All new prose exists in **en + pt** (constitution §4); proper nouns/URLs untranslated.
- [x] Topic ids `harness-engineering` / `loop-engineering` are stable (095 links to them).
- [x] `spec.md` status updated to `done`.
