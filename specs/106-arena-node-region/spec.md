# Spec: Arena — per-node region (multi-region pools made visible)

| | |
|---|---|
| **ID** | 106-arena-node-region |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

Spec 105 established that separate LLM boxes model **different pools** (regions /
models / providers) — but the canvas can't *show* it: the two "prod" LLM pools
look identical, and the user has no way to state the architectural intent ("this
pool is US-East, that one is EU-West") when composing. The user asked for exactly
this: configure a region on a box, see it on the canvas, and understand *why*
regions matter — which is also the seed for the challenge phase ("survive a region
outage" is only checkable if nodes know their region).

## Goals

- Every non-client node accepts an optional **region** from a small cloud-agnostic
  list (US East, US West, EU West, EU North, South America, Asia Pacific).
- The **scale panel** offers the region select with a bilingual hint explaining why
  regions matter (resilience to a region outage, latency near users, data
  residency).
- The **node box** shows a region badge when set — two LLM pools in different
  regions are visibly different at a glance.
- The **presets** exercise it: `prod`'s two LLM pools and `llm-fleet`'s four pools
  carry distinct regions.
- Region is an **annotation** in v1 — the capacity model ignores it (honest); its
  mechanical use (outage simulation / challenge scoring) is future work.

## Non-goals

- No model-math impact (no cross-region latency, no outage simulation yet).
- No free-text regions (curated list keeps the vocabulary clean); region codes are
  proper-noun-like and not translated.

## Acceptance criteria

1. **AC1 — store** — A node carries optional `region`; `setRegion` updates it,
   persists, and clears the active example selection (structural edit).
2. **AC2 — panel** — The scale panel shows the region select (with a none option)
   for non-client kinds, labelled + hinted bilingually; changing it updates the node.
3. **AC3 — canvas badge** — A node with a region renders a visible region badge.
4. **AC4 — presets** — `prod`'s two LLM pools have two distinct regions;
   `llm-fleet`'s four pools have four distinct regions (pinned by test).
5. **AC5 — bilingual** — New chrome strings (label, hint, none) resolve in en + pt.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Free text vs curated list? → **Curated list** (6 generic regions).
- [x] Which kinds? → **All except client** (multi-region applies to any tier).
- [x] Model impact now? → **None** (annotation); challenges use it later.

## Out of scope / deferred

Region-outage failure injection; cross-region latency; challenge scoring.
