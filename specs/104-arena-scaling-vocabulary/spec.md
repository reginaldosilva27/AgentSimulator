# Spec: Arena — per-component scaling vocabulary + info explainers

| | |
|---|---|
| **ID** | 104-arena-scaling-vocabulary |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The scale panel says **"Replicas"** and **"Instance size"** on every box, but those
words mean different things per component — and on the LLM they're actively
misleading: an LLM "replica" is **not a container**, it's another **model
deployment with its own rate-limit quota** (e.g. Azure PTU blocks), and "size" is
the **quota tier per deployment**, not vCPU. On the backend, replicas *are*
containers/pods and size *is* vCPU/memory; on the app DB they're read replicas; on
a cache they're cluster nodes; on managed services (LB/gateways/CDN) they're scale
units/tiers. A learner (the Arena's whole audience) absorbs the wrong mental model
from the generic labels, and there's nowhere in the UI that explains what a box
*is* or how its knobs map to the capacity formula.

## Goals

- **Per-kind scaling vocabulary**: the scale panel labels the horizontal control
  with what one unit actually is (LLM → *Deployments*, Backend → *Containers*,
  App DB → *Read replicas*, Cache → *Cluster nodes*, gateways/LB/CDN → *Scale
  units*, …) and the vertical control with what "size" means there (LLM → *quota
  per deployment (PTUs/TPM)*, Backend → *vCPU/memory*, DBs → *instance class*, …).
- **Info explainer per component**: an ℹ️ button in the scale panel toggles a short
  bilingual paragraph: what the box represents, what its replicas/size mean, and
  any model caveat (queue adds no sustained throughput; DB replicas simplify to
  linear read scaling; LLM fleet = deployments behind a router).
- **Capacity formula visible**: the Capacity line gets a hover hint showing
  `capacity = base × size × units`.
- **Client is not scalable**: the load source shows no size/replicas controls
  (its knob is the users slider); its info says so.
- Everything bilingual (en + pt).

## Non-goals

- No model-math change (the multiplier semantics stay exactly as in 100/103).
- No per-kind different size multipliers (0.5/1/2/4 stays global) — only the
  *meaning* is labelled per kind.
- No protocol/backend change.

## Acceptance criteria

1. **AC1 — vocabulary data** — Every `ArenaKind` carries bilingual `info`; every
   scalable kind carries bilingual `unit` (horizontal) and `sizeMeaning`
   (vertical); `client` is marked non-scalable.
2. **AC2 — panel uses the vocabulary** — The scale panel renders the per-kind unit
   label (an LLM node shows *Deployments*, not *Replicas*) and the size hint.
3. **AC3 — info toggle** — The panel has an info affordance that reveals the
   kind's explainer text; toggling works and the text matches the active language.
4. **AC4 — client not scalable** — Selecting a client node shows no size/replicas/
   calls controls (info + remove only).
5. **AC5 — capacity hint** — The Capacity readout carries the formula hint.
6. **AC6 — bilingual** — All new strings (vocabulary, info texts, chrome) resolve
   in en + pt (pinned by the arena i18n test).

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Info as tooltip or expandable? → **Expandable paragraph** in the panel
  (mobile-friendly, room for 2–3 sentences), plus `title` hints on the labels.
- [x] Rename the node badge (×10)? → Keep — it's compact and the panel explains it.
- [x] LLM unit wording? → **Deployments** in both languages (the industry term;
  pt text explains "implantações do modelo com cota própria").

## Out of scope / deferred

Per-kind size multipliers; cost per non-LLM component; challenges + judge.
