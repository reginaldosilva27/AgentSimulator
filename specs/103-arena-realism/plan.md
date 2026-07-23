# Plan: Arena — realism pack

> HOW. Frontend-only; extends specs 100–102 (`frontend/src/arena/`).

## Approach

All changes stay inside the pure model + store + page. The model gains three honest
mechanics (calls fan-out, client-only sources, shed rate) and one derived readout
(critical-path latency); the store gains the Little's-Law drive (`users`,
`thinkTimeSec` → `offeredLoad`); presets are retuned against the researched numbers
(Azure PTU sizing; Little's Law capacity planning).

## Affected files

**Frontend (`src/arena/`)**
- `model.ts` — `ArenaNodeSpec.callsPerRequest?`; sources = client nodes when present;
  `NodeMetrics.shedRps`; new `endToEndLatencyMs(design, offeredLoad)` (longest-path DP
  over the topo order).
- `model.test.ts` — new cases AC2 (fan-out), AC3 (client-only + orphan 0), AC4 (shed),
  AC5 (e2e latency sums the chain). Existing tests unchanged (root fallback).
- `components.ts` — queue description honesty tweak; `LLM_COST_PER_CALL_USD` constant
  (documented shape+price); `CALLS_CONFIGURABLE` set (llm/aiGateway/mcp/vectorDb).
- `store.ts` — `users`/`thinkTimeSec` state + `setUsers`/`setThinkTime` (both recompute
  `offeredLoad`); `setCallsPerRequest`; migration (blob without `users` derives it);
  presets load users/think.
- `store.test.ts` — AC1 (drive + migration), calls action.
- `examples.ts` — retune all presets to `{users, thinkTimeSec}`; fix `rag-cache`
  (CDN→apiGateway), `scale-llm` (drop decorative LB); reframe `llm-fleet` as 100k
  users/60s (≈1.7k rps); add `agent-tools` preset (MCP + callsPerRequest).
- `examples.test.ts` — AC7 (fleet ≤2000 rps + not critical; no CDN in rag-cache;
  agent-tools exercises mcp).
- `ArenaNode.tsx` — shed readout (429) when saturated.
- `ArenaCanvas.tsx` (ScalePanel) — calls-per-request stepper for configurable kinds,
  with the "an agent turn makes 2–3 model calls" hint.
- `ArenaPage.tsx` — users slider + think-time select + derived-rps readout; e2e-latency
  readout; LLM cost/h readout with assumption hint.
- `i18n/strings.ts` — new `arena.*` keys (en+pt): usersLabel, thinkTime(+hint),
  usersReadout builder, callsPerRequest(+hint), shedding builder, e2eLatency, llmCost
  (+hint). Parity pinned by the existing leafKeys test.

## Protocol changes (constitution §1)

None.

## Data model changes

None (localStorage blob gains `users`/`thinkTimeSec`; absent fields migrate).

## i18n strings (constitution §4)

All new keys listed above ship en + pt (see strings.ts diff); preset meta bilingual in
`examples.ts` as before.

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 | users/think drive offeredLoad; migration | `store.test.ts` |
| AC2 | callsPerRequest multiplies arriving | `model.test.ts` |
| AC3 | client-only sources; orphan gets 0; rootless fallback | `model.test.ts` |
| AC4 | shedRps value + node readout string | `model.test.ts` (+ i18n parity) |
| AC5 | e2e latency = chain sum / longest path | `model.test.ts` |
| AC6 | cost = throughput × cost/call × 3600 | `model.test.ts` or `examples.test.ts` |
| AC7 | fleet ≤2k rps + LLM not critical; no cdn in rag-cache; agent-tools has mcp | `examples.test.ts` |
| AC8 | leafKeys parity + KIND_META loop (existing) | `arena/i18n.test.ts` |

## Risks / trade-offs

- `callsPerRequest` default 1 avoids double-counting behind gateways but makes the
  agent fan-out opt-in for hand-built designs — mitigated by the presets + panel hint.
- e2e latency uses the longest path (sequential assumption); parallel branches are
  summed pessimistically as max-path only — stated in the hint.
- Cost readout is a single-shape estimate (2k-in/500-out, gpt-4.1-mini prices) — the
  hint says so; it's an order-of-magnitude teaching number, consistent with §3 honesty.
