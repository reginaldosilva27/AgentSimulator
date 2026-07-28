# Plan: Arena — chaos / failure injection

> `spec.md` is **`clarified`**: the catalog is the **seven** component/region faults (**no**
> client traffic-surge — the users slider is not a fault), a starved node reads **`unreachable`
> plus a hint naming the upstream failure**, sandbox faults are **cleared on entering a
> challenge and not restored on exit**, and **129 gains no resilience axis** — a challenge with
> faults in its givens expresses resilience using the axes 129 already has.

## Approach

**The one decision that matters: faults are a field on `ArenaDesign`, applied by a pure
pre-pass inside `computeMetrics`.**

```ts
type ArenaFaultType =
  | "instanceDown" | "unitLoss" | "latencySpike"
  | "cacheFlush" | "quotaCut" | "regionOutage" | "dependencyDegraded"

interface ArenaFault {
  id: string
  type: ArenaFaultType
  nodeId?: string        // component-targeted faults
  region?: string        // regional faults
  magnitude?: number     // units lost / latency multiplier / cut fraction
}

interface ArenaDesign { nodes; edges; callShape?; faults?: ArenaFault[] }   // ← additive
```

This mirrors exactly how **117** added `callShape`: an optional field, absent ⇒ pre-existing
behaviour byte-for-byte (AC9). Because `computeMetrics`, `turnPathLatenciesMs`,
`endToEndLatencyMs`, `heldInFlight`, `llmCost`, `equilibriumRps` and 129's `measureDesign` all
take a `design`, **every** derived readout inherits chaos for free — no parallel code path, no
signature change, and AC4 (a latency spike moving the *equilibrium*) falls out rather than
being engineered.

The pre-pass is `applyFaults(design): ArenaDesign` in a new `chaos.ts`, returning a design
whose node specs are already degraded:

| fault | transform |
|---|---|
| `instanceDown` | `replicas → 0` (and a `down` marker so status logic can distinguish "0 units" from "not wired") |
| `unitLoss` | `replicas → max(0, replicas − magnitude)` |
| `latencySpike` | a `latencyMultiplier` on the spec, read where base latency enters the queueing curve |
| `cacheFlush` | `hitRatio → 0` on a cache-like node |
| `dependencyDegraded` | capacity × (1 − magnitude) **and** latency × k on an `externalApi` |
| `regionOutage` | every node with `region === R` treated as `instanceDown` |
| `quotaCut` | **not** a node transform — a factor consumed by `quotaFactorsFor` (114) |

Two of these need a touch inside `model.ts` rather than pure spec rewriting, and both are
narrow:
- **capacity 0 must be representable.** `effectiveCapacity` currently floors replicas at 1 in
  places (`Math.max(1, sp.replicas)` appears in the cost path). The floor has to become "0 is
  legal, and 0 capacity ⇒ throughput 0 ⇒ downstream `unreachable`" — with `unreachable`
  already in `NodeStatus`, the status rule is the only new logic (AC2).
- **a latency multiplier** has to enter the queueing curve. One multiplication at the point
  where the base latency is read, defaulting to 1.

`quotaCut` is threaded through `quotaFactorsFor(design)`, which already reads the design and
already squeezes every pool in a region proportionally — so the cut multiplies the regional
quota before that squeeze, and AC6 is a small extension of an existing rule rather than new
math.

**Transience.** `faults` live in the store as `faults: ArenaFault[]` and are **excluded from
the persisted blob** — the `exampleId` precedent (transient store state that never reaches
`localStorage`). AC8's "removing every fault returns every metric to its exact pre-fault
value" is then structural: with `faults: []`, `applyFaults` returns the input design
unchanged (identity, not a rebuilt copy — worth asserting).

**Alternative considered and rejected:** a separate `computeMetricsWithFaults(design, load,
faults)`. It would leave every *other* readout (cost, e2e, equilibrium, 129's verdict) blind to
chaos unless each one grew a `faults` parameter — seven signature changes and a permanent risk
that one path forgets. The additive-field approach is the same shape 117 already validated.

**UI.** A `ChaosPanel.tsx` with the catalog (grouped, each entry carrying its bilingual
mechanism sentence, the 104 `ℹ️` convention) + the active-faults list. Targeting reuses the
existing selected-node state (moved into the store by 107). A `⚡` marker on `ArenaNode.tsx`
follows 120's `📝` precedent, including its jsdom-friendly derivation (a pure
`faultMarkerFor`-style helper so the test does not fight React Flow's a11y tree — the 117–119
`getAllByTitle` gotcha).

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/arena/chaos.ts` — **new**: `ArenaFault`, `ArenaFaultType`, `FAULT_META`
  (bilingual + magnitudes), `applyFaults`, `quotaCutFactorFor`, `faultsOn(nodeId)`.
- `frontend/src/arena/chaos.test.ts` — **new**: AC1–AC9 (the pure layer).
- `frontend/src/arena/model.ts` — `faults?` on `ArenaDesign`; `applyFaults` pre-pass; allow
  zero units; `unreachable` status rule for starved nodes; latency multiplier in the queueing
  curve; `quotaFactorsFor` honours a quota cut.
- `frontend/src/arena/model.test.ts` — AC2, AC4, AC9 golden regression.
- `frontend/src/arena/ChaosPanel.tsx` — **new**: catalog + apply + active list + clear all.
- `frontend/src/arena/ChaosPanel.test.tsx` — **new**: AC10, AC13.
- `frontend/src/arena/ArenaNode.tsx` — the `⚡` faulted marker (+ pure helper for tests).
- `frontend/src/arena/store.ts` — `faults` (transient), `applyFault` / `removeFault` /
  `clearFaults`; challenge givens' faults applied on `enterChallenge` and locked (AC12).
- `frontend/src/arena/store.test.ts` — AC8, AC12.
- `frontend/src/arena/challenges.ts` — `givens.faults?` + at least one resilience challenge.
- `frontend/src/arena/challenges.test.ts` — 130's AC2 walk now evaluates references **with**
  the challenge's faults applied.
- `frontend/src/arena/slo.ts` — nothing to change (it consumes `design`), but AC11 gets a test.
- `frontend/src/arena/slo.test.ts` — AC11.
- `frontend/src/i18n/strings.ts` — `arena.chaos.*` (en + pt).
- `frontend/src/arena/i18n.test.ts` — extend the bilingual walk.

## Protocol changes (constitution §1)

None. No `Stage`, no `TraceEvent`, no `schemas.py` / `events.ts` change. Worth an explicit
note in the code comment: this is deliberately **not** spec 017 (real failure injection on a
real request, which does emit trace events) — same vocabulary, different layer.

## Data model changes

None in SQLite or Chroma. `localStorage`: **nothing added** — `faults` is transient by design
(AC8), like `exampleId`.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.chaos.title` | Chaos | Caos |
| `arena.chaos.hint` | The same model, re-evaluated with a component removed or degraded — not a live outage. | O mesmo modelo, reavaliado com um componente removido ou degradado — não é uma queda real. |
| `arena.chaos.apply` | Apply to selected | Aplicar ao selecionado |
| `arena.chaos.selectFirst` | Select a component first | Selecione um componente primeiro |
| `arena.chaos.active` | Active faults | Falhas ativas |
| `arena.chaos.none` | No faults applied | Nenhuma falha aplicada |
| `arena.chaos.remove` | Remove | Remover |
| `arena.chaos.clearAll` | Clear all faults | Remover todas as falhas |
| `arena.chaos.transient` | Faults are not saved — a reload restores the intact design. | Falhas não são salvas — recarregar restaura o desenho intacto. |
| `arena.chaos.locked` | This fault is part of the challenge. | Esta falha faz parte do desafio. |
| `arena.chaos.starved(name)` | Nothing reaches it — {name} is down upstream. | Nada chega até aqui — {name} está fora, acima no caminho. |
| `chaos.ts` `FAULT_META.instanceDown` | Instance down — this box serves nothing. | Instância fora — esta caixa não atende nada. |
| `chaos.ts` `FAULT_META.unitLoss` | Lose units — capacity drops by the units removed. | Perder unidades — a capacidade cai pelas unidades removidas. |
| `chaos.ts` `FAULT_META.latencySpike` | Latency spike — this box answers k× slower; waiting users send less, so the arriving rate falls too. | Pico de latência — esta caixa responde k× mais devagar; usuários esperando enviam menos, então a taxa de chegada também cai. |
| `chaos.ts` `FAULT_META.cacheFlush` | Cache flushed — every request now reaches the tier behind it (the stampede). | Cache limpo — toda requisição agora chega no tier atrás dele (a estampida). |
| `chaos.ts` `FAULT_META.quotaCut` | Quota cut — the region allows less model throughput; every pool there is squeezed. | Corte de cota — a região permite menos throughput de modelo; todo pool nela é comprimido. |
| `chaos.ts` `FAULT_META.regionOutage` | Region out — every box in that region serves nothing. | Região fora — toda caixa naquela região deixa de atender. |
| `chaos.ts` `FAULT_META.dependencyDegraded` | Dependency degraded — the third party you cannot scale gets slower and thinner. | Dependência degradada — o terceiro que você não escala fica mais lento e mais estreito. |

## Cloud map (constitution §5)

n/a — no new tier or station.

## Test strategy (constitution §9 — TDD)

Vitest from `frontend/`. **AC9 first**: a golden-value regression over the shipped presets
(pinning today's numbers) is written *before* the model is touched, so the additive change can
be proven inert.

| Acceptance criterion | Test | File |
|---|---|---|
| AC9 | golden metrics for the shipped presets with `faults` absent/`[]` ⇒ unchanged; `applyFaults(d)` with no faults returns `d` identically | `model.test.ts`, `chaos.test.ts` |
| AC1 | `instanceDown` ⇒ capacity 0, throughput 0, shed = arriving, status ≠ healthy | `chaos.test.ts` |
| AC2 | `A→X(down)→B` ⇒ B arriving 0 and status `unreachable`; nothing downstream carries load | `model.test.ts` |
| AC3 | `unitLoss` k<n ⇒ capacity of (n−k) units; k≥n ⇒ equals `instanceDown` | `chaos.test.ts` |
| AC4 | `latencySpike` ⇒ `endToEndLatencyMs` up **and** `equilibriumRps` down | `chaos.test.ts` |
| AC5 | `cacheFlush` ⇒ downstream arriving rises to the full rate; its utilization rises | `chaos.test.ts` |
| AC6 | `quotaCut` on region R ⇒ `quotaFactor` of R's pools scaled; other regions unchanged | `chaos.test.ts` |
| AC7 | `regionOutage` ⇒ two-region design sheds 0, single-region design sheds | `chaos.test.ts` |
| AC8 | `faults` absent from the persisted blob after `applyFault`; `clearFaults` ⇒ metrics deep-equal the pre-fault snapshot | `store.test.ts` |
| AC10 | panel lists each active fault with its target name, removes one, clears all; node renders the `⚡` marker | `ChaosPanel.test.tsx` |
| AC11 | with 129 objectives tracked, a fault flips an objective to ✗ and names the faulted/starved culprit | `slo.test.ts` |
| AC12 | a challenge with `givens.faults` applies them on enter, refuses removal while active, and its reference passes **with** them | `store.test.ts`, `challenges.test.ts` |
| AC13 | entering a challenge clears sandbox faults; exiting does not restore them | `store.test.ts` |
| AC14 | bilingual walk over `arena.chaos.*` + `FAULT_META` | `i18n.test.ts` |

## Risks / trade-offs

- **This is the first spec in the 129–133 batch that edits `model.ts`.** Three narrow edits
  (zero units, latency multiplier, quota cut) inside the most load-bearing file in the Arena.
  AC9's golden regression, written first, is the whole safety net — it must be committed before
  the edits, not after.
- **Zero capacity is a new regime.** Divide-by-zero and the `0.99` queueing clamp both need
  checking at capacity 0; the honest answer is "everything sheds, latency is not meaningful",
  and 108 already established the precedent of *not* printing a fictional latency past
  saturation. Reuse that framing rather than inventing an infinity.
- **`unreachable` is currently near-dead code.** Turning it on may surface it in places that
  never rendered it (readouts, status colours, the 129 culprit rule). Grep every consumer of
  `NodeStatus` before implementing.
- **Catalog creep.** The competitor's 29 failures are a marketing number; each fault we add
  must change the arithmetic defensibly. The proposed seven are the ones the model can express
  — resist the rest until the model can back them.
- **Chaos + closed loop can be counter-intuitive** (a slower node *reduces* arriving rate). It
  is correct and it is the lesson of 110, but the copy must say so or it reads as a bug.
