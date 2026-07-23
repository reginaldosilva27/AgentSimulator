# Tasks: Arena — client-side LLM routing tax

> TDD (red → green). Run from `frontend/`.

- [x] **T1 — test**: `model.test.ts` — AC1 tax math (D≤1 → 0; D=20 → min(0.4, 0.02×19));
  AC2 util monotonic in D; AC3 gateway in between removes it, router exempt.
- [x] **T2 — impl**: constants + `routingTaxFor` + capacity application + `NodeMetrics.routingTax`.
- [x] **T3 — test**: `examples.test.ts` — AC5 scale-llm backend taxed yet not critical;
  prod + llm-fleet backends untaxed.
- [x] **T4 — test**: `ScalePanel.test.tsx` — AC4 note appears for a taxed backend.
- [x] **T5 — impl**: panel note + `arena.routingTax` en/pt + LLM info pools sentence.
- [x] **T6 — verify**: full vitest + tsc + build green.

## Definition of done

- [x] AC1–AC6 map to passing tests · suite green · build clean
- [x] All new text en + pt · no protocol change · `spec.md` → done
