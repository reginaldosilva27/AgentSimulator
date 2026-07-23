# Tasks: Arena — regional quota + cross-region latency

> Ordered TDD checklist. Sequenced after 109 (path walk); ideally after 110 so preset
> pins move once.

## Tasks

- [x] **T1 — test first (AC1/AC3)**: failing `model.test.ts` — over-quota region
  squeezes proportionally to exactly the quota; ≤ quota byte-for-byte; unassigned
  nodes pool together.
- [x] **T2 — implement**: constants in `components.ts`; quota grouping + `quotaFactor`
  in `model.ts`; make T1 pass.
- [x] **T3 — test first (AC2)**: failing pin — 1-region stack vs 3-region spread
  aggregate capacity.
- [x] **T4 — verify**: T3 passes; compose-with-routing-tax regression (105 tests stay green).
- [x] **T5 — test first (AC5)**: failing — cross-region edge adds 100ms to e2e;
  same-region/unregioned adds 0.
- [x] **T6 — implement**: penalty in the path walk; make T5 pass.
- [x] **T7 — test first (AC4)**: failing `ScalePanel.test.tsx` — quota-limited note when
  factor < 1.
- [x] **T8 — implement**: scale-panel note + LLM ℹ️ append; make T7 pass.
- [x] **T9 — re-pin (AC6)**: verify/adjust `prod` + `llm-fleet` under quota+penalty;
  update `examples.test.ts` and descriptions (en + pt) if numbers moved.
- [x] **T10 — i18n (AC7)**: parity en/pt for all new keys.
- [x] **T11 — refactor**: keep green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` + `npm test` green
- [x] All new user-facing text in en **and** pt
- [x] No protocol impact
- [x] `spec.md` status updated to `done`
