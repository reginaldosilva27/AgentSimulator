# Spec: Arena OpenAI-anchored calibration, US-region defaults & regional-quota lesson

| | |
|---|---|
| **ID** | 116-arena-openai-calibration |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

User review of the Arena (post-115) surfaced four related realism/clarity gaps:

1. **The LLM is too easy a bottleneck.** One "medium deployment" models 50 calls/s,
   so realistic loads need 12–20 deployments — a fleet size that reads absurd for
   small/medium environments. Real anchor (Azure OpenAI Global Standard quota for
   `gpt-4.1-mini`, per region/subscription, May-2026 docs): Tier 1 = 5M TPM ≈ **33
   agent-calls/s**, Tier 3 = 46M TPM ≈ **300/s**, Tier 5 = 150M TPM ≈ **1,000/s**
   (agent-shaped call ≈ 2.5k tokens). OpenAI direct (platform) Tier 5 for mini
   models ≈ 500 calls/s (30k RPM bound). One quota block is worth **hundreds**,
   not tens, of calls/s — the current benchmark undersells it by ~3–6×.
2. **The `1/20s` think-time option is cryptic.** It reads like a shutter speed (or
   "thinking time"); users can't tell it means "each user sends 1 message every
   20 s".
3. **No region default.** Nodes start with "No region", so the 114 quota/latency
   mechanics stay invisible until the user hand-assigns regions. Default should be
   East US everywhere; multi-pool presets should spread across **US** regions.
4. **The regional-quota escape has no worked example.** 114 built the mechanic
   (shared per-region cap, proportional squeeze) but no preset shows the
   "one region chokes → spread across regions relieves it" story.

## Goals

- Recalibrate the LLM benchmark (capacity, latency, quota, provisioned cost) to
  numbers defensible against published Azure OpenAI / OpenAI quota tables, so a
  small/medium architecture needs a *small* number of deployments.
- Make the think-time selector self-explanatory in both languages.
- Default every new/preset node to `us-east`; distribute multi-pool presets
  across US regions only.
- Ship a preset pair that teaches the regional-quota squeeze and the
  multi-region escape.

## Non-goals

- No change to the model's *shape* (propagation, queueing curve, closed loop,
  routing tax mechanics stay as specced in 103–115).
- No per-model quota catalog (the Arena stays model-agnostic; one stated
  agent-call shape).
- No backend/protocol change (Arena remains frontend-only, §3-honest).

## User-facing behavior

- The LLM ScalePanel sizes now anchor to quota tiers: Small ≈ 75, Medium ≈ 150,
  Large ≈ 300, XLarge ≈ 600 calls/s per deployment; the ℹ️/hints cite the anchor
  (Azure Global Standard tiers ≈ 33→1,500 calls/s per region at ~2.5k tok/call).
- Modeled per-call LLM latency stays the blended ~0.8 s service time (short
  tool-decision rounds + one long generate, averaged); the e2e turn readout
  multiplies it by calls-per-request, so turns still read in seconds under load.
- The think-time dropdown reads "1 msg / 20s" style with a bilingual pattern
  ("1 msg every 20s" / "1 msg a cada 20s").
- New nodes (palette drop) and all preset nodes except the client default to
  region `us-east`; the region list gains `us-east-2` and `us-central`; the
  `prod` and `llm-fleet` presets use US regions only.
- Presets need far fewer deployments (e.g. "Scale the LLM" = 4 XLarge
  deployments, not 20 medium; the fleet = 4 pools × 2 XLarge, not 4 × 6).
- Two new examples: **"Regional quota bites"** (two pools stacked in `us-east`
  share the quota — squeezed, shedding 429s) and **"Escape across regions"**
  (the same 8 XLarge with one pool moved to `us-west`, healthy again).

## Acceptance criteria

1. **AC1 — calibrated benchmark.** `BENCHMARKS.llm` is `{ baseCapacity: 150,
   baseLatencyMs: 800 }` (capacity = the Tier 2–3 quota-block anchor; latency
   stays the *blended* per-call service time — a ReAct turn mixes sub-second
   tool-decision rounds with one multi-second generate, and raising it to a
   full-completion 3 s would make the 108 saturation lesson and the 110 closed
   loop mutually unsatisfiable); `REGIONAL_LLM_QUOTA_RPS` stays `3000`,
   re-anchored as ≈ 2× the top published per-region tier (225M TPM ≈ 1,500
   calls/s) — the order reached with approved quota increases;
   `LLM_COST_PER_DEPLOYMENT_HOUR_USD` is `300` (breakeven stays ≈ 35%:
   150 × $0.0016 × 3600 ≈ $864/h at full tilt); `semanticCache.baseLatencyMs`
   is `50` (an embedding call + ANN lookup, not a key-value read).
2. **AC2 — think-time clarity.** The think-time `<option>` text is the bilingual
   "1 msg every Ns" pattern (en) / "1 msg a cada Ns" (pt), not bare `1/Ns`.
3. **AC3 — region defaults.** `ARENA_REGIONS` includes `us-east-2` and
   `us-central`; a palette drop of any non-client kind lands with
   `region === "us-east"`; a client drop has no region.
4. **AC4 — US-only presets.** Every preset node except `client` declares a
   region; all regions across all presets are US (`us-*`); multi-pool presets
   (`prod`, `llm-fleet`) still use distinct regions per pool.
5. **AC5 — quota lesson pair.** A "regional-quota" preset (1,600 req/s demand,
   two pools of 4 XLarge stacked in `us-east`) has both LLM pools `critical`
   (quota-squeezed, shedding), and its counterpart "multi-region" preset (the
   same 8 deployments with one pool moved to `us-west`, same demand) has every
   LLM pool `healthy` with `quotaFactor = 1` — both pinned via `claims` and
   `computeMetrics`.
6. **AC6 — presets stay honest at the new numbers.** Every existing preset's
   `claims` (demand + LLM status) still hold against the recalibrated model,
   with single-digit deployment counts for the small/medium presets (≤ 6 per
   pool) and descriptions updated to match.
7. **AC7 — copy cites the anchor.** The LLM info/size hint and the
   provisioned-cost hint mention the quota-tier anchor (both languages); no
   stale "50 rps"/"$100/h" claims remain in Arena strings.

## Protocol / stage impact

- New/changed `Stage`(s): **none** (Arena is frontend-only; no TraceEvents).
- Mirror in `frontend/src/types/events.ts`: n/a.
- Station mapping: n/a.

## Open questions (clarify before planning)

*(resolved with the user, 2026-07-23)*

- ~~Is 50 calls/s per deployment defensible?~~ → No; anchor to Azure Global
  Standard quota tiers (33–1,500 calls/s per region). Medium = 150.
- ~~Default region?~~ → `us-east` (East US) everywhere; multi-region presets
  spread across US regions.
- ~~Show a quota-relief case?~~ → Yes: the preset pair in AC5.
