# Plan: 116-arena-openai-calibration

## Approach

Pure recalibration + preset work inside the existing Arena modules — the model's
shape (103–115) is untouched. All numbers carry cited anchors in comments.

**Calibration math (the anchors).** Agent-shaped call ≈ 2.5k tokens (2k in +
500 out — already the stated cost basis). Azure OpenAI Global Standard quota for
`gpt-4.1-mini`, per region/subscription (learn.microsoft.com quotas-limits,
May 2026): Tier 1 = 5M TPM / 5k RPM ≈ 33 calls/s · Tier 2 = 16M ≈ 107 · Tier 3 =
46M ≈ 307 · Tier 4 = 90M ≈ 600 · Tier 5 = 150M ≈ 1,000 · Tier 6 = 225M ≈ 1,500.
OpenAI direct Tier 5 (mini models): 30k RPM / 150M TPM ≈ 500 calls/s (RPM-bound).

- `baseCapacity` 50 → **150** (medium ≈ a Tier 2–3 block); with the shared
  `SIZE_MULTIPLIER` the ladder is 75/150/300/600 ≈ Tiers 1/2–3/3/4.
- `baseLatencyMs` stays **800** — the blended per-call service time (a ReAct
  turn mixes ~100-token tool-decision rounds, sub-second, with one ~500-token
  generate, 3–4 s). A full-completion 3 s was tried and rejected: through the
  0.99-clamped queueing curve it makes the 110 closed loop throttle every
  population below the 108 saturation lesson (simple-rag would need ~47k users
  to shed, whose "fix" twin would then exceed any single-region quota) — the
  two prior specs become mutually unsatisfiable.
- `REGIONAL_LLM_QUOTA_RPS` stays **3000**, re-anchored: top published tier
  (225M TPM ≈ 1,500 calls/s) × ~2 for approved quota increases. Lowering it to
  the raw 1,500 anchor was tried and rejected for the same coupling reason (it
  caps every single-region "scale it" lesson below the saturating load).
- `LLM_COST_PER_DEPLOYMENT_HOUR_USD` 100 → **300** (scales with capacity to keep
  the ~35% provisioned-vs-usage breakeven story; PTU-order pricing).
- `semanticCache.baseLatencyMs` 10 → **50** (a real embedding call + ANN lookup
  is tens of ms, not a key-value hit).

## Affected files

- `frontend/src/arena/components.ts` — constants above; `ARENA_REGIONS` +=
  `us-east-2`, `us-central` (after `us-east`); refresh header comment + LLM
  `info`/`sizeMeaning` copy (en+pt) to cite the tier anchor.
- `frontend/src/arena/store.ts` — `addNode`/`dropNode`: default
  `region: "us-east"` for every kind except `client`.
- `frontend/src/arena/examples.ts` — retune deployments/users per preset (see
  tasks); all non-client nodes get US regions; add the `regional-quota` +
  `multi-region` pair with `claims`.
- `frontend/src/arena/ArenaPage.tsx` — think-time options use
  `t.arena.thinkTimeOption(s)`.
- `frontend/src/i18n/strings.ts` — new `arena.thinkTimeOption`; refresh
  `costHint` ($300/h), `quotaHint` (tier anchor), LLM-related copy en+pt.
- Tests: `components.test.ts`, `store.test.ts`, `examples.test.ts`,
  `ArenaPage.test.tsx` (think-time option), `ScalePanel.test.tsx` (region
  default doesn't break 106 tests).

## Preset retune (new numbers: M=150, L=300, XL=600, quota 3000/region)

| preset | load | LLM calls/s | fleet | util → status |
|---|---|---|---|---|
| simple-rag | 16k users/20s = 800 rps | ×2 = 1600 | 1 M (150) | 10.7 → critical (sheds at the closed-loop equilibrium too: eq ≈ 89 rps → 178 calls > 150) |
| scale-llm | same | 1600 | 4 XL (2400) | 0.67 → healthy |
| rag-cache | 4k/20s = 200 | ×2 = 400 | 4 M (600) | 0.67 → healthy |
| agent-tools | 2k/20s = 100 | ×3 = 300 | 3 M (450) | 0.67 → healthy |
| semantic-cache | 8.4k/20s = 420 | miss 0.7 ×2 = 588 | 6 M (900) | 0.65 → healthy; without cache 840 → 0.93 critical |
| prod | 12k/20s = 600 | ×2 = 1200 split 2 pools | 2 × 3 L (900) us-east/us-west | 0.67 → healthy |
| llm-fleet | 100k/60s = 1667 | ×2 = 3334 split 4 | 4 × 2 XL (1200) us-east/us-east-2/us-central/us-west | 0.69 → healthy |
| regional-quota (new) | 32k/20s = 1600 | ×2 = 3200 split 2 | 2 × 4 XL (raw 2400 each) BOTH us-east: region raw 4800 → capped 3000 → 1500/pool | 1600 > 1500/pool → critical, sheds |
| multi-region (new) | same | 3200 split 2 | same 8 XL, one pool → us-west (2400 each, under quota) | 0.67 → healthy |

Fixture updates riding along (old literals, same intent): model.test 114 pools
resized (large ×5/×6), 110 audit design rescaled (pools large ×5, eq ≈ 4,124,
util ≈ 0.92, shed 0) and AC5 tiny fleet 20k users; ScalePanel llm-2 fixture
gets `region: "us-west"` + the store 110 test scales replicas (its LLM is
already XLarge).

## Test strategy (AC → test)

- AC1 → `components.test.ts`: pin the four constants + the ≈35% breakeven
  arithmetic.
- AC2 → `ArenaPage.test.tsx`: option text matches `1 msg every 20s` (en).
- AC3 → `store.test.ts`: `addNode("llm")` → region `us-east`;
  `addNode("client")` → undefined; `ARENA_REGIONS` contains the two new codes.
- AC4 → `examples.test.ts`: walk presets — every non-client node has a `us-*`
  region; prod/llm-fleet pools distinct (updates the 106 AC4 test: llm-fleet
  regions ⊂ US).
- AC5 → `examples.test.ts`: quota pair — one-region preset LLM `critical` with
  `quotaFactor < 1` + `shedRps > 0`; multi-region twin all pools `healthy`.
- AC6 → existing `claims` walker (115 AC5) re-pins every retuned preset; add
  assertion small/medium presets use ≤ 6 deployments per pool.
- AC7 → `components.test.ts`/i18n check: LLM info (en+pt) mentions the tier
  anchor; `costHint` mentions $300.

## Protocol / i18n / cloud impact

None / all new prose ships en+pt / no new tier-station (cloud map untouched).

## Risks

- Persisted localStorage designs keep their old (region-less, small-capacity)
  nodes — fine: loadArena tolerates missing region; metrics just improve.
- The demo build (058) doesn't capture Arena traces — no fixture re-capture
  needed (Arena is frontend-computed).
