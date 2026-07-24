# Tasks: Arena — component expansion

> Ordered TDD checklist (red → green → refactor). Frontend-only (Vitest from
> `frontend/` — see the 101 gotcha: run vitest from `frontend/` or npx grabs v4
> without jsdom).

## Tasks

- [ ] **T1 — test first (AC1)**: `components.test.ts` — loop over the 5 new kinds
  asserting complete `KIND_META` (en+pt label/description/info non-empty, 3 cloud
  entries), a `BENCHMARKS` row, and presence in `PALETTE_ORDER`. RED.
- [ ] **T2 — implement**: add the 5 kinds to `ArenaKind`, `BENCHMARKS`,
  `KIND_META`, `PALETTE_ORDER`; add `DEFAULT_CPR` + membership of
  `guardrails`/`memoryStore` in `CALLS_CONFIGURABLE`. GREEN (T1).
- [ ] **T3 — test first (AC2)**: `model.test.ts` — `backend → queue → worker`:
  upstream `turnPathLatenciesMs` invariant under worker-latency change; queue's
  own latency still counted. RED.
- [ ] **T4 — test first (AC3)**: `model.test.ts` — `NodeMetrics.async` true for
  the worker (false when it also has a direct synchronous parent — diamond case);
  overloaded async node reports excess while `heldInFlight` upstream stays
  non-null. RED.
- [ ] **T5 — implement async detection**: `computeMetrics` computes the async
  set (every inbound path crosses a queue); `turnPathLatenciesMs` skips async
  children; `heldInFlight.satOf` stops at async children. GREEN (T3, T4).
- [ ] **T6 — test first (AC4/AC6)**: guardrails forwards 100% and defaults to
  cpr 2; memoryStore defaults to cpr 2 (1 000 → 2 000 arriving). RED.
- [ ] **T7 — implement**: `store.ts` node-creation reads `DEFAULT_CPR`. GREEN (T6).
- [ ] **T8 — test first (AC5)**: `externalApi`/`objectStore` have
  `scaling: null`; capacity unaffected by replicas/size; shed reported. RED.
- [ ] **T9 — implement**: ensure `ScalePanel`/model treat `scaling: null` kinds
  like `client` (no replica/size controls, fixed capacity). GREEN (T8).
- [ ] **T10 — UI**: async badge + backlog wording (node card + ScalePanel), en+pt
  strings; snapshot/behavioral assertions in `ScalePanel.test.ts`.
- [ ] **T11 — test first (AC7)**: `examples.test.ts` — new preset present, loads,
  satisfies its stated load, bilingual callouts. RED.
- [ ] **T12 — implement preset**: "Guardrails + async ingestion" in
  `examples.ts` with 119 callouts. GREEN (T11).
- [ ] **T13 — i18n audit**: every new string en+pt (constitution §4) — run the
  i18n-auditor agent over the diff.
- [ ] **T14 — refactor + gates**: `npm run build` (tsc, AC8) + full `npm test`;
  update the honesty-banner comment in `components.ts` if wording drifted.
- [ ] **T15 — docs/memory**: roadmap memory note; ask the user about the 058
  GitHub Pages demo re-capture (standing directive — Arena is not in the demo,
  expected "no", but ask).

## Definition of done

- [ ] Every AC in `spec.md` maps to a passing test
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npm test` green (Vitest, from `frontend/`)
- [ ] No protocol impact (none intended); backend untouched
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
