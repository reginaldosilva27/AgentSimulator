# Tasks: Arena ↔ Learn links — every component teaches its own theory

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Tasks

- [ ] **T1 — test first (AC1, AC2, AC3)**: failing `learnLinks.test.ts` — every
  mapped topic id resolves in `allTopicsFor("en")`; the minimum kind set (llm,
  vectorDb, mcp, appDb, backend, queue, loadBalancer, apiGateway, aiGateway,
  cache, semanticCache) is mapped; `learnTopicsFor("cdn")` is empty.
- [ ] **T2 — implement**: create `arena/learnLinks.ts` with `KIND_TO_TOPICS` +
  `learnTopicsFor`; make T1 pass.
- [ ] **T3 — test first (navigation store)**: failing test — `requestTopic`
  sets `pendingTopic`; `consumeTopic` returns it once and clears it.
- [ ] **T4 — implement**: create `lib/learnTarget.ts`; make T3 pass.
- [ ] **T5 — test first (AC2/AC3 UI)**: failing `ScalePanel.test.tsx` — selected
  LLM node's ℹ️ explainer shows "Learn more" links with topic titles (en and
  pt); selected CDN node shows no row; clicking a link calls `requestTopic`.
- [ ] **T6 — implement**: "Learn more" row in the ScalePanel explainer; make T5
  pass.
- [ ] **T7 — test first (AC4, AC5)**: failing App-level test (ResizeObserver
  polyfill per 041) — from the Arena page, requesting a topic lands on the
  Learn page with that topic's detail open; navigating back to the Arena shows
  the same design (nodes/edges/users) as before.
- [ ] **T8 — implement**: App subscription (`pendingTopic` → `setPage("learn")`)
  + LearnPage initial selection via `consumeTopic`; make T7 pass.
- [ ] **T9 — test first (AC1 chips + AC6)**: failing tests — `examples.test.ts`
  asserts every `concepts` id resolves to a real topic; `ArenaPage.test.tsx`
  asserts the loaded preset renders its chips and clicking one calls
  `requestTopic`.
- [ ] **T10 — implement**: `concepts` on `ExampleDef` (≥2 presets annotated) +
  chips row in `ArenaPage`; make T9 pass.
- [ ] **T11 — i18n (AC7)**: extend `i18n.test.ts` for `t.arena.learnMore` /
  `t.arena.concepts`, then add both strings in en + pt.
- [ ] **T12 — refactor**: share the link/chip rendering, keep tests green.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npm test` green (Vitest)
- [ ] No protocol impact to mirror (frontend-only — verified no `schemas.py` /
  `events.ts` diff)
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
