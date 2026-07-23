# Tasks: 116-arena-openai-calibration

TDD order — each implement task is driven by the failing test before it.

- [x] T1 (test, AC1) — pin `BENCHMARKS.llm = {150, 3000}`, `REGIONAL_LLM_QUOTA_RPS = 1500`, `LLM_COST_PER_DEPLOYMENT_HOUR_USD = 300`, `semanticCache.baseLatencyMs = 50` in `components.test.ts` → red
- [x] T2 (impl, AC1) — recalibrate `components.ts` constants + header/inline anchor comments → green
- [x] T3 (test, AC3) — `store.test.ts`: drop non-client kind defaults `region: "us-east"`; client has none; `ARENA_REGIONS` ⊇ {us-east-2, us-central} → red
- [x] T4 (impl, AC3) — `components.ts` region list + `store.ts` addNode default → green
- [x] T5 (test, AC2) — `ArenaPage.test.tsx`: think-time options render "1 msg every Ns" → red
- [x] T6 (impl, AC2) — `thinkTimeOption` in `strings.ts` (en+pt) + `ArenaPage.tsx` → green
- [x] T7 (test, AC4/AC5/AC6) — `examples.test.ts`: US-region walk, quota pair (critical + quotaFactor<1 + shed / healthy twin), ≤6 deployments per small-preset pool; update 106 AC4 distinct-regions expectations → red
- [x] T8 (impl, AC4/AC5/AC6) — retune `examples.ts` per plan table; add `regional-quota` + `multi-region` presets (en+pt copy) → green
- [x] T9 (impl, AC7) — refresh LLM `info`/`sizeMeaning`, `costHint`, `quotaHint`, `replicaMaxHint` copy (en+pt) to the new anchors; grep for stale 50-rps/$100 claims
- [x] T10 (verify) — `npm test`, `npm run build`, i18n audit of new prose, update memory + spec status → done
