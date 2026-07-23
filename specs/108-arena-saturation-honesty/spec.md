# Spec: Arena — saturation honesty (no fictional latency, status that scares at 90%)

| | |
|---|---|
| **ID** | 108-arena-saturation-honesty |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

An architecture audit of the Arena (2026-07-23, simulated against the model itself)
found three places where the screen lies under or near saturation:

1. **The header reports a fictional latency when saturated.** The queueing curve
   clamps utilization at 0.99, so any over-capacity LLM reports `800/(1−0.99) =
   80,000ms` and the header shows "End-to-end latency: 80s". But the model *also*
   sheds the excess as 429s — you cannot both drop the overload and queue it for 80
   seconds. Spec 103 already accepted this on the node box (it shows `—` with the
   comment "a queue-latency figure would be fiction") — the header contradicts it.
2. **Node and header disagree**: the bottlenecked node shows `—`, the control bar
   shows `80s`, on the same screen, from the same numbers.
3. **97% utilization renders yellow.** `statusFor` is only `critical` past 100%, so a
   design that clears the 429s by one deployment (audit case B1: 97% util, 27s of
   queueing latency) looks "warning" — a student reads it as solved. Near-saturation
   is the *worst* operating point and the palette treats it as mild.

Bonus: the first-visit default (`simple-rag`, LLM at 1200%) greets a new user with
the fictional "80s" as their first impression of the Arena.

## Goals

- When any node is saturated, the control bar replaces the latency figure with an
  honest saturation notice carrying the total shed rate.
- Node boxes and the control bar always tell the same story.
- Status turns `critical` at ≥90% utilization (still `warning` at ≥70%), so the
  "cleared the 429s but unusable" zone reads red.

## Non-goals

- No change to the load model or the queueing curve itself (109/110 own that).
- No challenge/scoring content.
- The bottleneck badge semantics (util > 100%, shed readout) stay as spec 103 defined.

## User-facing behavior

- Control bar, saturated design: `End-to-end latency: 80s` → `Saturated — shedding
  ~115 req/s (429)` (sum of all nodes' shed), en + pt.
- Control bar, healthy design: unchanged.
- Node status dot / meter color: red from 90% utilization.
- First visit (default `simple-rag` sample): the saturation notice is what renders.

## Acceptance criteria

1. **AC1 — saturation notice** — Given a design where ≥1 node has utilization > 1,
   the control bar shows the saturation notice with the total shed req/s and does
   NOT show an end-to-end latency figure; with no saturated node the latency figure
   renders exactly as before.
2. **AC2 — no fictional figure anywhere** — The 0.99-clamped latency (e.g. 80s from
   an 800ms-base node) is never rendered while that node is shedding: node box shows
   `—` (already true) and the header shows the notice (new). One story per screen.
3. **AC3 — critical at 90%** — `statusFor(0.9) === "critical"`, `statusFor(0.89…) ===
   "warning"` (≥0.7), healthy below; bottleneck flag remains `util > 1` only.
4. **AC4 — honest first impression** — Loading the first-visit default sample renders
   the saturation notice (not a latency figure) in the control bar.
5. **AC5 — bilingual** — the notice + any new hint resolve in en and pt.

## Protocol / stage impact

None — frontend-only Arena change. No `Stage`/`TraceEvent`; `stations.ts` untouched.

## Open questions (clarify before planning)

- [x] Should `endToEndLatencyMs` itself change? → **No** — it stays a pure model
  function; the *presentation* layer (control bar) checks total shed > 0 and swaps
  the readout. 109 changes the math for its own reasons.
- [x] New status tier or move the threshold? → **Move the threshold** (critical ≥
  0.9). A fourth color adds palette noise without teaching more.
- [x] Does the node box change? → Only via `statusFor` (color). Its `—` + shed
  readout from 103 already behave correctly.

## Out of scope / deferred

Closed-loop equilibrium (110), agent-turn latency math (109), latency SLO scoring
(challenges module).
