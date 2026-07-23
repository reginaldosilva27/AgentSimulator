# Spec: Arena — example scenarios + default sample

| | |
|---|---|
| **ID** | 101-arena-examples |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena (spec 100) opens to a **blank canvas**. A newcomer has to know what to
drag and how to wire it before the "watch the bottleneck" idea lands — the empty
canvas doesn't explain itself. The reference tools all ship starter scenarios for
exactly this reason. We want the Arena to **explain its own idea on first sight**:
open onto a small, meaningful agent architecture already wired up and running, and
offer a short library of **example scenarios** the user can load with one click —
each one teaching a specific scaling lesson (the LLM is the wall; replicas clear it;
a cache offloads the DB; a full production shape at 100k users).

This directly answers the observation that a lone LLM is "always a bottleneck": the
examples make the *lever* obvious — horizontal replicas, an LB, a cache, a queue —
instead of leaving the user staring at one red box.

## Goals

- On a **first visit** (no design saved yet), the canvas opens with a **default
  sample** architecture already placed, wired, and showing live metrics — not empty.
- A small **Examples** control in the Arena lets the user load any of a handful of
  named preset scenarios (≥ 3), each replacing the current canvas.
- Each preset is a complete design (components + edges + per-node scaling + offered
  load) that **computes through the existing model** and demonstrates its lesson
  (e.g. the "simple" preset shows the LLM saturated; the "scaled" preset does not).
- Each preset carries a **bilingual title + one-line description** of its lesson.
- Everything stays within spec 100's constraints: frontend-only, no backend, no new
  `Stage`/`TraceEvent`, persisted to `localStorage`.

## Non-goals

- No AI judge / scoring, no challenge pass-fail (still deferred).
- No new component kinds, no protocol/DB change, no change to the capacity model math.
- Not touching the Simulator page.

## User-facing behavior

- First-ever open of the Arena shows the **default sample** (a simple RAG agent:
  Client → Backend → LLM, Backend → Vector DB) already running, so the idea reads at
  a glance. A user who has already built/cleared a canvas keeps their own state.
- An **Examples** menu (in the control bar) lists the presets by name; picking one
  loads it (replacing the canvas). A short description explains what each teaches.
- All preset names + descriptions + the menu label ship in **en and pt**.

## Acceptance criteria

1. **AC1 — default sample on first visit** — Given no persisted Arena design
   (`localStorage` empty for the Arena key), when the store initializes, the design
   is the default sample (non-empty: ≥ 3 components with edges), not an empty canvas.
2. **AC2 — returning user keeps their canvas** — Given a persisted design exists
   (including an explicitly emptied one), initialization loads that, NOT the sample.
3. **AC3 — example library** — There are at least 3 named presets, each exposing a
   bilingual title + description and a factory producing a valid `ArenaDesign`
   (components + edges + scaling + offered load).
4. **AC4 — loading a preset replaces the design** — Loading a preset sets the store's
   nodes/edges/offeredLoad to that preset and persists it (survives reload).
5. **AC5 — presets teach their lesson through the model** — The "simple single-LLM"
   preset yields a *critical* LLM under its own offered load; a "scaled" preset (LLM
   replicas + load balancer) yields the LLM **not** critical — verified via
   `computeMetrics`, so the teaching claim is real, not asserted.
6. **AC6 — bilingual** — Every preset title/description and the Examples menu label
   resolve in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Frontend-only content on top of spec 100.
- Mirror in `events.ts`: **n/a**. Station in `stations.ts`: **n/a**.

## Open questions (clarify before planning)

- [x] Default sample auto-load scope? → **Only on a truly fresh visit** (no Arena key
  in localStorage); a cleared/edited canvas is respected.
- [x] Does loading a preset warn before replacing? → **No** — it's a sandbox with a
  Reset already; presets replace directly (keep it frictionless).
- [x] How many / which presets for v1? → **Four**: simple RAG agent, scale-the-LLM,
  RAG + cache, production-100k. (Library is data-driven, easy to extend later.)

## Out of scope / deferred

- Saving user-named custom designs; sharing presets across sessions (DB).
- Challenge mode (target + pass/fail) and the AI judge — still future specs.
