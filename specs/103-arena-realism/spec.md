# Spec: Arena — realism pack (users→RPS, agent call fan-out, honest overload, cost)

| | |
|---|---|
| **ID** | 103-arena-realism |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

An architecture audit of the Arena (calibrated against Azure's official PTU sizing
math and standard capacity-planning practice) found the mechanics sound but the
framing indefensible in front of a real architect:

1. **"Users / RPS" conflates two different things.** 100k *users* is not 100k req/s —
   with Little's Law (users ÷ think time), 100k concurrent users at 1 message/min is
   ~1.7k req/s. Without the conversion, every big-load scenario needs fantasy capacity.
2. **1 user request ≠ 1 LLM call.** A ReAct turn makes 2–5 model calls. This is *the*
   agent-specific truth a generic system-design tool misses, and the Arena missed it too.
3. **A real LLM deployment serves single-digit-to-tens of req/s** for agent-shaped
   calls (Azure PTU worked example: 1,000 RPM ≈ 17 rps needs 110 PTUs; agent-shaped
   2k-in/500-out on gpt-4.1 ≈ 1.3 rps per 100 PTUs). The `llm-fleet` preset's 16k rps
   of LLM capacity is ~100× fantasy.
4. **Overload shows "80s latency"** — real LLM APIs shed with 429s; they don't queue
   you for 80 seconds.
5. **A stray unwired node receives the full offered load** (any zero-indegree node is
   a source) — drop an orphan cache and it lights up.
6. **Preset inconsistencies**: CDN in the chat POST path (contradicts spec 090's own
   CDN-BYPASS-for-POST finding); a decorative LB with a single child in `scale-llm`;
   the queue's description implies it fixes sustained bottlenecks (it can't in a
   steady-state model).
7. Missing readouts an architect asks for first: **end-to-end latency** and **LLM cost**.

## Goals

- **Load control in users**: concurrent users + configurable think time; the model is
  driven by `rps = users / thinkTime` and the conversion is shown (Little's Law).
- **Calls-per-request** on agentic nodes (LLM, AI Gateway, MCP, Vector DB): each user
  request triggers N calls to that node (ReAct loop fan-out), configurable per node.
- **Load enters only at Client nodes** when any exist (fallback: all roots, preserving
  raw model tests); orphan nodes idle at 0.
- **Honest overload**: past 100% a node reports the shed rate ("dropping ~N req/s,
  429") instead of a meaningless multi-second latency.
- **End-to-end latency readout** (critical-path sum) and an **estimated LLM cost/hour**
  readout (from a stated per-call shape+price assumption).
- **Presets retuned** to defensible numbers under the new framing, incl. an
  **agent-with-tools** preset (MCP), CDN→API GW in `rag-cache`, LB fixed in
  `scale-llm`, and the fleet reframed as **"100k users"** with the conversion visible.
- Honest **queue** description (absorbs bursts; adds no sustained throughput).

## Non-goals

- Burst/transient modeling, p95/percentiles, per-provider rate-limit schedules,
  semantic caching, challenge mode, AI judge (all still deferred).
- No protocol/backend change — Arena stays frontend-only.

## Acceptance criteria

1. **AC1 — Little's Law drive** — Store holds `users` + `thinkTimeSec`;
   `offeredLoad = round(users / thinkTimeSec)`; changing either updates the model;
   persisted designs without `users` migrate (derive from stored rps).
2. **AC2 — calls-per-request fan-out** — A node with `callsPerRequest = k` sees
   `arriving = raw × k` in `computeMetrics`; defaults to 1 (no silent double-count
   behind a gateway); presets set it explicitly.
3. **AC3 — client-only sources** — With ≥1 `client` node, only client nodes receive
   offered load (an orphan node reports 0); with none, all roots do (back-compat).
4. **AC4 — shed rate** — `NodeMetrics.shedRps = max(0, arriving − capacity)`; the node
   box shows the shed readout (429) when saturated, in en + pt.
5. **AC5 — end-to-end latency** — A pure function returns the critical-path (longest)
   latency from a source to any reachable node; shown in the control bar.
6. **AC6 — LLM cost readout** — Estimated LLM $/hour = Σ(LLM nodes' throughput) ×
   stated cost/call × 3600, from a documented shape+price constant; shown with a hint
   stating the assumption, en + pt.
7. **AC7 — presets defensible** — `llm-fleet` is reframed as ~100k users with think
   time (offered rps ≤ 2000) and its LLM tier is not critical; `rag-cache` has no CDN
   in the POST path; `scale-llm` has no decorative single-child LB; a new
   `agent-tools` preset exercises MCP with calls-per-request; queue description
   updated. All bilingual.
8. **AC8 — bilingual** — every new string (labels, hints, readouts, preset meta)
   resolves in en + pt.

## Protocol / stage impact

None — frontend-only Arena change. No `Stage`/`TraceEvent`; `stations.ts` untouched.

## Open questions (clarify before planning)

- [x] Replace RPS slider or add users mode? → **Users + think time is the primary
  control**; derived rps always displayed. `setOfferedLoad` kept for compat.
- [x] Multiplier per edge or per node? → **Per node** (`callsPerRequest` on
  llm/aiGateway/mcp/vectorDb) — simpler UI, covers the gateway case (set it on the
  gateway, not the LLMs behind it, to avoid double-count).
- [x] Default `callsPerRequest` for a palette-dropped LLM? → **1** (explicit opt-in;
  presets demonstrate ×2–3; the scale panel hint teaches "an agent turn makes 2–3
  model calls"). Avoids silent double-counting behind gateways.
- [x] Cost basis? → gpt-4.1-mini global pricing with a 2k-in/500-out agent call
  (~$0.0016/call), stated in the hint + a source comment.

## Out of scope / deferred

Percentiles, burst modeling, cost per component (non-LLM), model-tier routing,
challenges + judge.
