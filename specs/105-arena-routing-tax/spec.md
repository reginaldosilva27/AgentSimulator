# Spec: Arena — client-side LLM routing tax (the capacity case for an AI Gateway)

| | |
|---|---|
| **ID** | 105-arena-routing-tax |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

Today the model makes client-side LLM routing **free**: a backend wired directly to
an LLM node with 20 deployments loses nothing for managing 20 endpoints, 20 keys,
per-deployment rate-limit bookkeeping, health checks and retry logic in app code.
That understates reality and erases the *capacity* argument for an AI Gateway — the
user correctly observed that raising LLM deployments behind a bare backend should
raise the backend's overhead, and that a gateway's value is also **offloading that
routing work to a purpose-built component**, not only governance.

Secondary confusion (same session): why would the "prod" preset draw **two LLM
boxes** behind the gateway when one box with more deployments has identical
capacity? Because separate boxes model **different pools** (regions / models /
providers); the deployments slider models identical copies within one pool. The
info explainers don't say that yet.

## Goals

- A **routing tax**: a non-router node that is wired **directly** to LLM node(s)
  loses a stated fraction of its capacity per managed deployment beyond the first
  (bounded), representing client-side routing overhead (keys, health, rate-limit
  tracking, retries in app code).
- **Routers are exempt** (AI Gateway, Load Balancer are purpose-built) — so putting
  an AI Gateway between the backend and the LLM fleet **removes the backend's tax**.
  That is the capacity benefit the user asked for, made visible.
- The **scale panel shows the tax** when active (percentage + managed-deployment
  count + the hint that a gateway removes it), bilingual.
- The **LLM info** explains multiple-boxes-vs-deployments (pools vs. copies).
- Tax parameters are named constants with a documented teaching rationale.

## Non-goals

- No latency penalty for routing (capacity only, v1).
- No modeling of retry storms/fallback traffic.
- No protocol/backend change; Arena stays frontend-only.

## Acceptance criteria

1. **AC1 — tax applies** — For a non-router node directly wired to LLM node(s),
   effective capacity in `computeMetrics` is reduced by
   `min(TAX_CAP, TAX_RATE × (D − 1))` where `D` = total LLM deployments (Σ replicas
   of directly-wired LLM children). `D ≤ 1` → no tax.
2. **AC2 — monotonic** — More managed deployments → higher tax → higher utilization
   at the same load; reducing deployments lowers it.
3. **AC3 — gateway removes the tax** — Inserting an AI Gateway between the backend
   and the same LLM fleet restores the backend's untaxed capacity; the gateway
   itself (a router) pays no tax.
4. **AC4 — visible + explained** — `NodeMetrics` carries the tax; the scale panel
   shows a bilingual note (tax %, managed deployments, "an AI Gateway removes
   this") when the tax is non-zero.
5. **AC5 — presets stay coherent** — `scale-llm` (backend manages 20 deployments)
   shows a non-zero backend tax but no status regression at its lesson load; `prod`
   and `llm-fleet` backends (behind a gateway) pay zero tax — pinned by tests.
6. **AC6 — bilingual** — All new strings resolve in en + pt; the LLM info states
   "multiple boxes = different pools; deployments = identical copies".

## Protocol / stage impact

None — frontend-only Arena model + UI change.

## Open questions (clarify before planning)

- [x] Tax size? → **2% per managed deployment beyond the first, capped at 40%**
  (visible teaching effect; documented as an order-of-magnitude estimate of
  client-side routing overhead, not a benchmark).
- [x] Which kinds pay? → Any **non-router** kind directly wired to LLM children
  (in practice the backend). Routers (`aiGateway`, `loadBalancer`) exempt.
- [x] Latency penalty too? → **No** (deferred; capacity is the lesson).

## Out of scope / deferred

Routing latency penalty; retry-storm modeling; challenge scoring of resilience.
