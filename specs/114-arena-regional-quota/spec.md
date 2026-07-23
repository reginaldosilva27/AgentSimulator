# Spec: Arena — regional quota + cross-region latency (regions with teeth)

| | |
|---|---|
| **ID** | 114-arena-regional-quota |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

Spec 106 added regions as a **pure annotation** — a badge the capacity model
ignores. The audit showed two consequences:

1. **Regions teach nothing yet.** Three LLM pools in three regions behave
   byte-for-byte like three pools in one region; the multi-region split the presets
   showcase has no modeled reason to exist.
2. **The real-world constraint is missing.** In practice a single region caps how
   much LLM capacity you can provision (subscription/region quota, PTU
   availability); "just stack ×20 deployments in us-east" is exactly what providers
   do *not* let you do. The multi-region pattern exists to escape a **regional
   quota** — the Arena should make that pressure real, which also gives the
   replicas-slider ceiling (×20) a story.
3. Cross-region hops cost real latency (~60–150ms RTT) that the model ignores, so
   spreading pools across the planet is currently free.

**Decision (2026-07-23): approved by the project owner** — regions get (a) a shared
per-region LLM capacity quota and (b) a fixed cross-region latency penalty on edges
that span regions. Resilience scenarios (lose a region) stay out — that is
challenges-module content and is explicitly deferred.

## Goals

- **Regional LLM quota**: the aggregate effective capacity of all LLM nodes in the
  same region is capped by a stated teaching quota; exceeding it visibly limits the
  pools ("quota-limited"), making "add another region" the honest escape hatch.
- **Cross-region penalty**: an edge whose endpoints declare different regions adds a
  fixed latency to that hop in the e2e path.
- Both constants documented with the same honesty framing as every Arena benchmark.

## Non-goals

- No region failure/resilience simulation (deferred to the challenges module).
- No per-region user/geo mix (single global client population stays).
- No per-region pricing.
- Non-LLM kinds are not quota-capped (the quota models model-capacity scarcity
  specifically).

## User-facing behavior

- An LLM node whose region is over quota shows a "quota-limited" note (scale panel
  + a compact badge state), and its effective capacity stops growing with more
  replicas/size — the ℹ️ explains why and points at adding a region.
- The e2e latency grows when the path crosses regions; the hop/e2e hint mentions the
  penalty.
- Region select (106) is unchanged; unassigned nodes form their own implicit pool.

## Acceptance criteria

1. **AC1 — quota caps a region** — Given LLM nodes in one region whose summed
   effective capacity exceeds `REGIONAL_LLM_QUOTA_RPS`, each node's effective
   capacity is scaled proportionally so the region's total equals the quota;
   utilization/shed/status all follow the capped capacity. A region at/below quota
   is unaffected (byte-for-byte).
2. **AC2 — spreading regions raises the ceiling** — Pinned numerically: the same
   total deployments split across 3 regions yields up to 3× the aggregate LLM
   capacity of stacking them all in one region (when each region stays ≤ quota).
3. **AC3 — unassigned pool** — LLM nodes with no region share one implicit
   "unassigned" quota pool (so the cap cannot be dodged by clearing the badge);
   existing single-pool presets (≤ quota) are unaffected.
4. **AC4 — quota-limited surfaced** — When a region is over quota, affected LLM
   nodes show a bilingual "quota-limited" indication in the scale panel (and the
   replicas/size controls' effect visibly saturates); the ℹ️ explains the escape
   (another region / higher quota tier), en + pt.
5. **AC5 — cross-region penalty** — An edge with both endpoints regioned and
   different adds `CROSS_REGION_LATENCY_MS` to that hop in the e2e path (109
   semantics); same-region or unregioned edges add nothing. Pinned numerically.
6. **AC6 — presets verified** — Multi-region presets (`prod`, `llm-fleet`) remain
   healthy under quota + penalty (adjust sizes/regions if needed); their
   descriptions stay truthful, en + pt.
7. **AC7 — bilingual** — every new string resolves in en and pt.

## Protocol / stage impact

None — frontend-only Arena change.

## Open questions (clarify before planning)

- [x] Which design? → **Quota + latency penalty** (owner-approved); resilience →
  challenges module; geo user mix → deferred.
- [x] Quota value? → `REGIONAL_LLM_QUOTA_RPS = 3_000` calls/s per region. Rationale:
  comfortably above every current preset's per-region pool (llm-fleet: 1,200/region;
  prod: 2,000/region) but below the audit's pathological "60 large in one region"
  (6,000) — the cap binds exactly on the anti-pattern. Teaching constant, honesty
  comment as usual.
- [x] Proportional scale-down or hard clip of the marginal node? → **Proportional**
  — order-independent (no "which node was added last" semantics), pure, and shows
  every pool in the region equally squeezed.
- [x] Penalty value? → `CROSS_REGION_LATENCY_MS = 100` (mid-range of real
  inter-region RTTs; one constant, not a distance matrix — this is a teaching model).
- [x] Does the routing tax (105) interact? → No change — tax applies to the
  *upstream* router-less node; quota applies to the LLM nodes' capacity. They
  compose multiplicatively as independent effects.

## Out of scope / deferred

Region failure toggles, per-region user populations, distance-based latency
matrices, per-region quota editing (single global constant in v1).
