# Spec: Arena — builder nudges (guardrails the audit case proved missing)

| | |
|---|---|
| **ID** | 115-arena-builder-nudges |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The audited hand-built design (122k users, 3 LLM pools × 20) made three mistakes the
UI silently allowed, each hiding a lesson the Arena exists to teach:

1. **The agent fan-out was forgotten.** The design ran with `callsPerRequest = 1` on
   the LLM path — a real ReAct turn makes 2–5 model calls (103), so the design
   "almost passed" while an honest version would sit at 200–300% utilization. The
   presets set cpr correctly, but a hand-wired design gets the silent default of 1
   and nothing suggests otherwise.
2. **Think time is the most decisive knob and the least visible.** The same design
   flips from 102% (think 20s) to 68% (30s) to 34% (60s) — the whole verdict lives
   in a small dropdown with no guidance on realistic ranges.
3. **The deployments slider ceiling (×20) is mute.** A user maxing it out gets no
   hint that the real-world escape is another pool/region or a bigger quota tier
   (which 114 makes mechanically true).

Additionally, after 110/114 land, preset copy and pins will have moved — this spec
closes with a calibration pass so every example's description matches what the model
actually shows.

## Goals

- **Fan-out nudge**: wiring a backend directly to an LLM, or an AI Gateway to an
  LLM, when the relevant `callsPerRequest` is unset/1, offers a one-click "set
  calls/request = 2" suggestion — never applied silently, dismissible.
- **Think-time guidance**: the control gets a bilingual hint with realistic ranges
  (chat ≈ 30–120s between messages) and its sensitivity made explicit.
- **Ceiling hint**: the replicas slider at max shows "add another pool/region or
  raise the tier".
- **Preset calibration pass**: every example's description verified against the
  post-110/114 model output.

## Non-goals

- No blocking validations — the Arena stays a sandbox; nudges suggest, never forbid.
- No challenge content.
- No auto-tuning of user designs.

## User-facing behavior

- On connecting `backend → llm` or `aiGateway → llm` where the turn's fan-out is
  still 1: a small dismissible chip near the scale panel / node — "An agent turn
  makes 2–5 model calls — set calls per request = 2?" with Apply / dismiss, en + pt.
- Think-time select: hint text with typical ranges, en + pt.
- Replicas slider at 20: inline hint pointing at pools/regions/tier, en + pt.

## Acceptance criteria

1. **AC1 — fan-out nudge appears** — Connecting `backend → llm` (no AI Gateway in
   between) or `aiGateway → llm` when the turn fan-out is 1 shows the suggestion;
   Apply sets `callsPerRequest = 2` on the right node (the gateway when present,
   else the LLM — never both, 103's no-double-count rule); dismiss hides it for
   that node without changing anything.
2. **AC2 — nudge never fires when fan-out exists** — If the gateway or LLM already
   has `callsPerRequest ≥ 2`, no suggestion renders (including presets — loading
   any built-in example shows zero nudges).
3. **AC3 — think-time hint** — The think-time control carries the realistic-range
   hint, en + pt.
4. **AC4 — ceiling hint** — With replicas at the slider max, the scale panel shows
   the escape-hatch hint (pool/region/tier), en + pt; below max it doesn't.
5. **AC5 — presets calibrated** — A test walks every example and asserts its
   description's load story matches the model (offered/equilibrium rate cited
   correctly; any "saturates"/"healthy"/"clears" claim true); copy fixed where stale,
   en + pt.
6. **AC6 — bilingual** — every new string resolves in en and pt.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Nudge on wire-time only or whenever the state exists? → **Whenever the state
  exists** (derived from the design, not an event) — simpler, pure-projection style;
  "dismissed" is a per-node flag in the store so it doesn't nag.
- [x] Auto-apply for new edges? → **Never silent** — one-click apply only (the
  103 decision to default cpr to 1 stands; this spec adds the teaching moment, not
  a new default).
- [x] Where does the chip render? → In/next to the scale panel of the involved node
  (already the home of per-node knobs); exact placement is plan detail.

## Out of scope / deferred

Design linting beyond these three (e.g. "cache before DB" suggestions), challenge
hints, an assistant/judge.
