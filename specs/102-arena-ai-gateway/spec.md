# Spec: Arena — AI Gateway (LLM routing) + fleet example + example selection state

| | |
|---|---|
| **ID** | 102-arena-ai-gateway |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena teaches that the LLM is the wall — but every current preset *stays* walled:
a single LLM deployment is rate-limited (~50 rps/replica), so even the "production"
preset saturates the LLM well before 10k users, and there's no example showing the
**way out**. In real agent systems the lever is an **AI Gateway / LLM router**: many
model deployments (regions, PTUs, providers) behind one router that load-balances
across them (and fails over between them). Their capacities **add up**, so aggregate
throughput scales with the fleet. The Arena has no component for this and no example
that survives real scale, so the lesson stops at "you're stuck."

Two smaller issues surfaced with the examples (spec 101): the Examples dropdown
**doesn't reflect the loaded preset** (it snaps back to the placeholder), and there's
no scenario that demonstrably handles ~10k rps.

## Goals

- A new **AI Gateway** component (LLM router) that **load-balances offered load across
  its downstream LLM deployments** — so a fleet of LLMs behind it aggregates capacity.
- A new **LLM fleet** example that **handles ~10k rps** with the LLM **not** a
  bottleneck (replicated backend + an AI-Gateway-fronted LLM fleet + cache + DB).
- The Examples dropdown **shows the currently-loaded preset** as selected, and reverts
  to the placeholder once the user edits the design so it no longer matches a preset.
- Stay within the Arena's constraints: frontend-only, no backend, no `Stage`, bilingual.

## Non-goals

- Modeling fallback/retry as extra throughput — fallback is **resilience**, not
  steady-state capacity; the AI Gateway models **routing/aggregation** only (its
  description says so, honestly).
- No AI judge / challenge mode (still deferred).

## User-facing behavior

- **AI Gateway** appears in the palette (agentic group, near the LLM) with a bilingual
  label + description noting it routes/load-balances across LLM deployments. Wired
  before a set of LLM nodes, it splits load across them (like the Load Balancer does
  for app servers), so their capacities sum.
- An **LLM fleet** preset in the Examples menu opens at ~10k rps with everything green
  (or warning), the LLM no longer critical — visibly answering "what would it take."
- Selecting a preset from the dropdown keeps it **shown as selected**; editing the
  canvas (add/remove/wire/scale) clears the selection back to the placeholder.
- All new text (component label/description, preset title/description) ships **en + pt**.

## Acceptance criteria

1. **AC1 — AI Gateway component** — `aiGateway` is a palette component with a benchmark,
   a bilingual label/description, and it **splits offered load evenly across its
   children** (like a load balancer) in `computeMetrics`.
2. **AC2 — fleet aggregates capacity** — Given an AI Gateway fanning to `N` LLM nodes,
   the load each LLM receives is `≈ offered / N`, so `N` deployments raise the LLM tier's
   effective aggregate capacity to `≈ N × per-node`.
3. **AC3 — fleet example survives scale** — The new `llm-fleet` preset, at its own
   offered load (≥ 10000), yields the LLM node(s) **not** `critical` (verified via
   `computeMetrics`).
4. **AC4 — dropdown reflects loaded preset** — After loading preset `X`, the store's
   active-example id is `X`; after any structural edit (add/remove/connect/scale), it is
   cleared to `null`.
5. **AC5 — bilingual** — The AI Gateway label/description, the fleet preset
   title/description, and any new chrome resolve in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Frontend-only Arena content. `events.ts`/`stations.ts`
  untouched. (`aiGateway` is an *Arena* component kind, not a pipeline station.)

## Open questions (clarify before planning)

- [x] New component vs. reuse Load Balancer? → **New `aiGateway` kind** — domain-relevant
  for an agent simulator (LLM routing ≠ generic app-server LB), and clearer in examples.
- [x] Model fallback as capacity? → **No** — routing/aggregation only; fallback is
  resilience, called out in the description honestly.
- [x] When does the dropdown clear? → On **structural edits** (nodes/edges/scaling);
  moving the load slider or dragging a node keeps the selection.

## Out of scope / deferred

- Semantic caching on the AI Gateway; per-provider rate-limit modeling; challenge mode;
  the AI judge.
