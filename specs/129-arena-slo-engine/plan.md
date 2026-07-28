# Plan: Arena — SLO engine + live verdict

> `spec.md` is **`clarified`** — all four questions resolved against the measured baseline
> recorded there. Defaults: e2e ≤ 30 s · headroom ≥ 20% · shed ≤ 0 tracked, **cost off**.
> Panel: a tabbed bottom-right surface. Culprit: highlighted on row hover.
>
> **The measurement changed the shape of this plan**, not just its numbers: latency and
> headroom are the primary axes, shed is the extreme-regime backstop, and cost is opt-in.
> `DEFAULT_SLO_TARGETS` therefore ships with **three** entries, not four.

## Approach

A new pure module `frontend/src/arena/slo.ts` sits *on top of* the model and imports from
it — never the other way round. It owns three things:

1. **The metric vocabulary.** `SLO_METRICS: Record<SloMetricId, SloMetricMeta>` where
   `SloMetricId = "shed" | "latency" | "cost" | "headroom"`, and each meta declares a fixed
   `direction: "lte" | "gte"`, a bilingual label, a unit and a `format` hook (reuse
   `format.ts`'s `formatQps` / `formatLatency`). Direction is a property of the *metric*,
   not of the target — so an incoherent objective ("latency ≥ 5s") is unrepresentable.
2. **`measureDesign(design, users, thinkTimeSec): DesignMeasurement`** — the one place the
   four aggregate figures are derived, each from the existing exported helpers so there is
   no second implementation to drift:
   - `offeredLoad = round(equilibriumRps(design, users, thinkTimeSec))` (the same value the
     store already derives — passed in, not re-derived, where the caller has it);
   - `shedRps = Σ metrics.get(id).shedRps` (exactly the sum `ArenaPage` already computes —
     that inline sum gets **replaced** by this call, so there is one definition);
   - `e2eLatencyMs = endToEndLatencyMs(design, offeredLoad)`;
   - `costPerHourUsd = provisionedPerHour + usagePerHour` from `llmCost(design, offeredLoad)`;
   - `headroomPct = 1 − max(utilization)` over nodes with `arriving > 0` (empty → 1);
   - plus `busiestNodeId` and `costliestLlmId` for AC6.
   It calls `computeMetrics` **once** and passes that map to the helpers where their
   signatures allow; where they recompute internally (they are cheap and pure) we accept it
   rather than widen signatures — AC11 forbids touching `computeMetrics`.
3. **`evaluateObjectives(measurement, targets): SloVerdict`** — maps enabled targets to
   `SloResult[]` (`{metric, target, actual, met, culpritNodeId?, atCeiling?}` — `atCeiling`
   carries AC13: the latency figure is a **lower bound**, so the UI renders `≥` plus the
   ceiling note instead of a precise value) and derives
   `met = results.every(r => r.met)`. Comparison is `actual <= target` / `actual >= target`
   by the metric's declared direction, with a **tolerance** of one display unit so a value
   that rounds to the target does not fail on a floating-point hair.

**Remediation hints** live in `slo.ts` as `REMEDIATION: Record<SloMetricId, {byKind:
Partial<Record<ArenaKind, Record<Lang,string>>>, fallback: Record<Lang,string>}>`. Keyed by
(metric, culprit kind) with a per-metric bilingual fallback, so AC7's matrix walk can never
find a hole: any kind that lacks a specific hint resolves the fallback. Hints state
*mechanisms* (the 119 rule) — "one deployment is a quota block; add deployments or spread
regions" — never pinned figures, so recalibrations (127/128-style) cannot stale them.

**Targets in the store.** `ArenaState` gains `sloTargets: SloTargets` where
`SloTargets = Partial<Record<SloMetricId, number>>` — **a metric absent means the objective
is off**. That makes AC8 structural (an off objective cannot be evaluated) and keeps
persistence trivial. Actions: `setSloTarget(metric, value | null)`. Sanitation follows the
128 `modelTier` precedent exactly: unknown keys dropped, non-finite/negative values dropped,
so a bad blob degrades to the defaults instead of throwing (AC10).

**Alternative considered and rejected:** putting the verdict inside `model.ts`. It would
couple the capacity model to a policy layer, and `model.ts` is already the largest, most
load-bearing file. Keeping `slo.ts` as a consumer means the model's tests stay about
physics and the SLO tests stay about policy.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/arena/slo.ts` — **new**: metric vocabulary, `measureDesign`,
  `evaluateObjectives`, `REMEDIATION`, `DEFAULT_SLO_TARGETS`.
- `frontend/src/arena/slo.test.ts` — **new**: AC1–AC8, AC12 (the pure layer).
- `frontend/src/arena/SloPanel.tsx` — **new**: the objectives checklist (rows, ✓/✗, target
  editor, per-row hint, verdict line).
- `frontend/src/arena/SloPanel.test.tsx` — **new**: AC9, AC12 (rendering + live update).
- `frontend/src/arena/store.ts` — `sloTargets` in `ArenaState`, `setSloTarget`, sanitation
  in `loadArena`, default targets in `defaultDesign`.
- `frontend/src/arena/store.test.ts` — AC10 (round-trip + malformed blob).
- `frontend/src/arena/ArenaPage.tsx` — mount the panel; **replace** the inline `totalShed`
  sum with `measureDesign` so the header and the panel cannot disagree.
- `frontend/src/i18n/strings.ts` — `arena.slo.*` block (en + pt).
- `frontend/src/arena/i18n.test.ts` — extend the existing bilingual walk to the new block.

## Protocol changes (constitution §1)

None. No `Stage`, no `TraceEvent`, no `schemas.py` / `events.ts` touch, no
`readoutFor` / `renderDetail` case (those switch over the Simulator's `StationId`, which the
Arena does not use).

## Data model changes

None in either store. `localStorage` only: `sloTargets` is added **inside** the existing
`agentsim.arena` blob (no new key), so an existing persisted design loads with the default
targets via sanitation.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.slo.title` | Objectives | Metas |
| `arena.slo.hint` | Targets checked against the capacity model — not measurements. | Metas verificadas contra o modelo de capacidade — não são medições. |
| `arena.slo.verdictAllMet` | All objectives met | Todas as metas atingidas |
| `arena.slo.verdictPartial(met, total)` | {met} of {total} objectives met | {met} de {total} metas atingidas |
| `arena.slo.target` | Target | Meta |
| `arena.slo.actual` | Actual | Atual |
| `arena.slo.off` | Off | Desligada |
| `arena.slo.enable` | Track this objective | Acompanhar esta meta |
| `arena.slo.culprit(name)` | Limited by: {name} | Limitado por: {name} |
| `arena.slo.metric.shed` | Dropped requests | Requisições descartadas |
| `arena.slo.metric.latency` | End-to-end latency | Latência ponta a ponta |
| `arena.slo.metric.cost` | Cost per hour | Custo por hora |
| `arena.slo.metric.headroom` | Headroom | Folga |
| `slo.ts` `REMEDIATION.shed.llm` | The model tier is the wall: one deployment is a rate-limit quota block. Add deployments, spread them across regions, or cut calls per turn. | O tier do modelo é a parede: um deployment é um bloco de cota de rate limit. Adicione deployments, espalhe por regiões ou reduza chamadas por turno. |
| `slo.ts` `REMEDIATION.shed.backend` | The backend is the wall, not the model tier — add containers (each holds a bounded number of open streams). | O backend é a parede, não o tier do modelo — adicione contêineres (cada um sustenta um número limitado de streams abertos). |
| `slo.ts` `REMEDIATION.latency.llm` | Decode time dominates an agent turn: a cheaper/faster tier, fewer output tokens or fewer calls per turn all pay off. | O tempo de decode domina o turno do agente: um tier mais rápido, menos tokens de saída ou menos chamadas por turno todos compensam. |
| `slo.ts` `REMEDIATION.cost.llm` | Provisioned capacity bills even when idle — right-size the pool, drop to a cheaper tier, or put a semantic cache in front of it. | Capacidade provisionada é cobrada mesmo ociosa — dimensione o pool, use um tier mais barato ou ponha um cache semântico na frente. |
| `slo.ts` `REMEDIATION.headroom.*` (fallback) | Running this close to capacity leaves nothing for a burst — add one horizontal unit. | Rodar tão perto da capacidade não deixa nada para um pico — adicione uma unidade horizontal. |
| `slo.ts` `REMEDIATION.*.fallback` | This box is the limit on this axis — scale it or take work off its path. | Esta caixa é o limite neste eixo — escale-a ou tire trabalho do caminho dela. |

(The table is the seed; the implementation fills every (metric, kind) pair a test can
reach, per AC7.)

## Cloud map (constitution §5)

n/a — no new tier or station. The Arena's component vocabulary (`KIND_META.clouds`) is
unchanged.

## Test strategy (constitution §9 — TDD)

Every AC lands in `frontend/src/arena/`. Vitest, run **from `frontend/`** (from the repo
root `npx` grabs a v4 without jsdom — the 101 gotcha).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `evaluateObjectives` returns one result per enabled target; twice ⇒ deep-equal | `slo.test.ts` |
| AC2 | saturated `simple-rag`-shaped design fails shed≤0 with `actual` = model shed; scale ⇒ met | `slo.test.ts` |
| AC3 | latency `actual` === `endToEndLatencyMs(design, equilibriumRps(...))`; lower target ⇒ ✗ | `slo.test.ts` |
| AC4 | cost `actual` === provisioned+usage; +1 idle deployment raises it and breaks the target | `slo.test.ts` |
| AC5 | headroom fails at 95% util, passes after replicas×k | `slo.test.ts` |
| AC6 | failed shed/latency/headroom ⇒ culprit = busiest node id; failed cost ⇒ costliest LLM; met ⇒ undefined | `slo.test.ts` |
| AC7 | matrix walk: every reachable (metric, kind) resolves a non-empty `en` **and** `pt` hint | `slo.test.ts` |
| AC8 | verdict = all-met; a target set to `null` disappears from results and flips the verdict | `slo.test.ts` |
| AC9 | render panel with a saturated design ⇒ ✗ row; act(scale) ⇒ ✓ row, no remount | `SloPanel.test.tsx` |
| AC10 | targets round-trip `agentsim.arena`; `{sloTargets:{bogus:"x",cost:-5}}` ⇒ defaults, no throw | `store.test.ts` |
| AC11 | golden: `computeMetrics`/`endToEndLatencyMs`/`llmCost` outputs for the default design unchanged; existing suite stays green | `model.test.ts` (existing) |
| AC12 | bilingual walk over `arena.slo.*` + `REMEDIATION` | `i18n.test.ts` |
| AC13 | past-ceiling design ⇒ latency result carries a lower-bound flag + ceiling note, not a precise value | `slo.test.ts`, `SloPanel.test.tsx` |
| AC14 | under `DEFAULT_SLO_TARGETS`: default design fails exactly {latency, headroom}; `llm-fleet` meets all three tracked axes; cost absent | `slo.test.ts` |
| AC15 | hovering a failed row marks the culprit node; mouse-out unmarks it | `SloPanel.test.tsx` |

## Risks / trade-offs

- **Double computation.** `measureDesign` calls `computeMetrics` and the helpers each call
  it again internally. It is pure, cheap and already run on every keystroke today; AC11
  (don't touch the signature) is worth more than the cycles. If profiling ever complains,
  the fix is a memo on the design object, not a signature change.
- **Tolerance on the comparison** must be stated and tested, or a value that *displays* as
  the target will read ✗ and look like a bug.
- **Panel real estate.** The Arena control bar is already dense (users, think time, payload,
  e2e, cost, shed, examples). The open question about placement is the real risk to UX
  quality here, not the arithmetic.
- **Default targets are a teaching choice.** They must make the shipped default design fail
  in an *instructive* way (shed) rather than in a discouraging way (all four ✗).
