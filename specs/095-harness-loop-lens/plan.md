# Plan: Harness ⇄ Loop lens

> The HOW. Frontend-only, pure projection. No backend, no protocol change.

## Approach

Introduce a global **lens** store (mirrors `useCloud`/`useLang`): `mode ∈ {"all","harness","loop"}`,
persisted to `localStorage` under `agentsim.lens`, default `"all"`. The lens **reframes emphasis**;
it never changes what runs or what is visible.

Two new pure modules feed the reframing:

- **`lib/harness.ts`** — a *total* `Record<StationId, HarnessRole>` map (`HARNESS_ROLE`) plus a
  translated role vocabulary. `HarnessRole ∈ {tools, knowledge, memory, context, permissions,
  model, orchestration, delivery}`. Exhaustiveness is enforced the same way `STAGE_TO_STATION` is
  (a `Record<StationId, …>` literal → `tsc` fails on a missing key; a unit test double-checks).
- **`lib/loop.ts`** — `deriveLoopView(events, cursor)`: a pure projection returning the loop's
  control elements from the trace — the `think ⇄ tools` cycle presence, `iterations` (already in
  `deriveView`), the **stop reason** (`final-answer` | `max-iterations`), and a `failure` flag when
  a `simulate_failure` marker is present. Reuses `deriveView` output; adds no new event reads beyond
  what's already emitted.

Rendering consumes these without touching geometry:

- `FlowCanvas` reads the lens `mode`. In `harness`, each visible `StationNode` renders its role
  badge (looked up in `HARNESS_ROLE`) and applies a "map" emphasis class; in `loop`, the
  `think ⇄ tools` `FlowEdge`s get a highlighted/pulsing class, non-loop stations get a "dimmed"
  class, and a small **loop readout** (iteration `n/MAX`, stop reason, failure marker) shows. In
  `all`, none of this renders (baseline).
- A **`LensToggle`** segmented control lives in the header next to the Build popover, with a
  one-line legend linking to the Learn topics (096). Reuses the existing header control styling.

Alternatives considered: (a) tagging each station with a single `axis` — rejected because a station
is *harness* structurally yet *participates* in the loop temporally; the two axes are orthogonal
projections, not a partition. (b) A backend `lens` input — rejected, violates "pure projection" and
adds a needless `Stage`.

## Affected files

**Backend**
- None.

**Frontend**
- `frontend/src/lib/lens.ts` — new `useLens` Zustand store (`mode`, `setMode`), localStorage-backed.
- `frontend/src/lib/harness.ts` — new `HarnessRole` union + total `HARNESS_ROLE` map + `roleLabelFor(lang)`.
- `frontend/src/lib/loop.ts` — new `deriveLoopView(events, cursor)` pure projection.
- `frontend/src/components/LensToggle.tsx` — new segmented control + legend (header).
- `frontend/src/canvas/FlowCanvas.tsx` — read lens; apply badges / emphasis / loop readout.
- `frontend/src/canvas/StationNode.tsx` — render harness-role badge in harness mode.
- `frontend/src/canvas/FlowEdge.tsx` — loop-edge highlight class in loop mode.
- `frontend/src/App.tsx` (or the header component) — mount `LensToggle`.
- `frontend/src/i18n/strings.ts` — lens mode labels, role vocabulary, legend, loop-readout strings.
- Tests: `frontend/src/lib/harness.test.ts`, `frontend/src/lib/loop.test.ts`,
  `frontend/src/lib/lens.test.ts`, `frontend/src/i18n/lens.test.ts`,
  `frontend/src/canvas/lens.render.test.tsx`.

*(exact file names may shift to match current tree; the module boundaries above are the contract.)*

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed. `events.ts` untouched.

## Data model changes

None (no Chroma, no SQLite change).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `lens.mode.all` | All | Tudo |
| `lens.mode.harness` | Harness | Harness |
| `lens.mode.loop` | Loop | Loop |
| `lens.legend.harness` | The wiring: everything that isn't the model. | O cabeamento: tudo que não é o modelo. |
| `lens.legend.loop` | The cycle: reason → act → observe, until it stops. | O ciclo: raciocina → age → observa, até parar. |
| `lens.legend.learnMore` | Learn Harness & Loop Engineering | Aprenda Harness & Loop Engineering |
| `lens.role.tools` | Tools | Ferramentas |
| `lens.role.knowledge` | Knowledge | Conhecimento |
| `lens.role.memory` | Memory | Memória |
| `lens.role.context` | Context | Contexto |
| `lens.role.permissions` | Permissions | Permissões |
| `lens.role.model` | Model | Modelo |
| `lens.role.orchestration` | Orchestration | Orquestração |
| `lens.role.delivery` | Delivery | Entrega |
| `lens.loop.iteration` | Iteration {n}/{max} | Iteração {n}/{max} |
| `lens.loop.stop.final` | Stopped: final answer | Parou: resposta final |
| `lens.loop.stop.max` | Stopped: max iterations | Parou: máximo de iterações |
| `lens.loop.recovery` | Failure injected — recovery path | Falha injetada — caminho de recuperação |

*(final wording tunable during implementation; both languages required for each.)*

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | default mode is `all`; canvas has no badge/dim/readout in `all`; round-trip all→harness→all | `lens.test.ts`, `lens.render.test.tsx` |
| AC2 | set mode, re-read store from localStorage → same mode | `lens.test.ts` |
| AC3 | `HARNESS_ROLE` is total over every `StationId` (no missing/extra key) | `harness.test.ts` |
| AC4 | harness mode → role badge present per visible station; all/loop → absent | `lens.render.test.tsx` |
| AC5 | `deriveLoopView` returns iteration/stop-reason/failure from a fixture trace; readout renders only in loop mode | `loop.test.ts`, `lens.render.test.tsx` |
| AC6 | switching mode fires no fetch, doesn't mutate events/cursor, visible-station set unchanged | `lens.render.test.tsx` |
| AC7 | every lens string has `en` + `pt` | `i18n/lens.test.ts` |
| AC8 | legend link targets resolve to existing 096 topic ids | `lens.test.ts` (or content parity test) |

## Risks / trade-offs

- **Baseline byte-for-byte (AC1)** is the sharp edge: the `all` path must render exactly as today.
  Guard with a render test asserting no badge/dim/readout nodes exist in `all`.
- Loop stop-reason derivation depends on `iterations` + terminal event already present in
  `deriveView`; if a run is mid-flight the readout shows "in progress" honestly (no fabricated stop).
- Emphasis-only classes must not shift layout (`computeLayout` untouched) — use overlay/opacity, not
  size changes, so tiers/boundary don't reflow.
