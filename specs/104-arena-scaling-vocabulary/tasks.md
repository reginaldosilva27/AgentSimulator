# Tasks: Arena — per-component scaling vocabulary + info explainers

> TDD (red → green). Run from `frontend/`.

- [x] **T1 — test**: extend `arena/i18n.test.ts` — every kind has bilingual `info`;
  scalable kinds have bilingual `unit`/`sizeMeaning`; `client.scaling === null`.
- [x] **T2 — impl**: `components.ts` — `KindMeta.scaling` + `info` for all 13 kinds.
- [x] **T3 — test**: `arena/ScalePanel.test.tsx` — LLM shows "Deployments" (AC2);
  info toggle reveals explainer (AC3); client hides scaling controls (AC4);
  capacity hint present (AC5).
- [x] **T4 — impl**: export `ScalePanel`; per-kind labels + hints + ℹ️ toggle +
  client branch; `arena.infoLabel`/`arena.capacityHint` strings en+pt.
- [x] **T5 — verify**: full vitest + tsc + build green.

## Definition of done

- [x] AC1–AC6 map to passing tests · suite green · build clean
- [x] All new text en + pt · no protocol change · `spec.md` → done
