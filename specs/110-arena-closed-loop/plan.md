# Plan: Arena — closed-loop equilibrium

> The HOW for `110-arena-closed-loop`. Depends on 109 (agent-turn e2e).

## Approach

Add a pure layer **above** the existing model, in `frontend/src/arena/model.ts`:

```
export function equilibriumRps(design, users, thinkTimeSec): number {
  // g(rps) = rps − users/(think + L(rps)) is monotone increasing (L is
  // non-decreasing in rps): bisect [0, demand] to the unique root.
  ...60 halvings, tolerance 0.25 rps...
}
```

> **Implementation note (found during TDD):** the originally-planned damped
> fixed-point iteration limit-cycles on the near-saturation cliff (L jumps from
> milliseconds to the 80s clamp within a few rps once a quota-capped fleet sits
> on the edge — surfaced by 114's regional quota). Replaced with **bisection**
> on the monotone residual — equally pure/deterministic, robust on any slope.

- `computeMetrics` / `endToEndLatencyMs` keep their `(design, load)` signatures —
  equilibrium composes them; all existing model tests stay valid.
- **Store** (`frontend/src/arena/store.ts`): `offeredLoad` becomes derived —
  recomputed via `equilibriumRps` whenever `users`, `thinkTimeSec`, `nodes` or
  `edges` change (design changes shift the equilibrium too, unlike today). The
  103 migration path (deriving `users` from a stored rps) stays; `setOfferedLoad`
  becomes internal/back-compat only (kept for old tests, not called by UI).
- **Header** (`ArenaPage.tsx`): shows `users ≈ demand req/s` and, when
  `(demand − effective)/demand > 0.05`, appends `→ effective req/s` + hint.
- 108's saturation notice logic is unchanged and still fires when equilibrium sheds.

## Affected files

**Frontend**
- `frontend/src/arena/model.ts` — `equilibriumRps` (pure, exported).
- `frontend/src/arena/store.ts` — derived `offeredLoad` on every relevant mutation
  (setUsers/setThinkTime/addNode/dropNode/connect/disconnect/scale edits/loadDesign).
- `frontend/src/arena/ArenaPage.tsx` — dual readout + hint.
- `frontend/src/arena/examples.ts` — preset descriptions re-worded where numbers
  changed (en + pt).
- `frontend/src/i18n/*` — `effectiveRate` label + `closedLoopHint` (en/pt).
- Tests: `model.test.ts`, `store.test.ts`, `examples.test.ts`, `ArenaPage.test.tsx`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None (localStorage shape unchanged; `offeredLoad` still persisted, recomputed on load).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.effectiveRate(d, e)` | `{d} req/s demanded → {e} req/s effective` | `{d} req/s demandados → {e} req/s efetivos` |
| `arena.closedLoopHint` | `A user waiting on a slow answer isn't sending the next message: the load self-throttles to users ÷ (think time + response time). The gap between demanded and effective IS the latency cost.` | `Um usuário esperando uma resposta lenta não envia a próxima mensagem: a carga se auto-regula para usuários ÷ (tempo entre mensagens + tempo de resposta). A diferença entre demandado e efetivo É o custo da latência.` |

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | fixed-point residual ≤ 1 rps; two calls identical | `model.test.ts` |
| AC2 | audit design → equilibrium ∈ [4700, 5200], LLM util ∈ [0.78, 0.88], shed 0 | `model.test.ts` |
| AC3 | invariant `rps × e2eSec ≤ users` over a design/load matrix | `model.test.ts` |
| AC4 | header dual readout when gap >5%; single figure otherwise | `ArenaPage.test.tsx` |
| AC5 | tiny fleet still sheds at equilibrium + notice renders | `model.test.ts` + `ArenaPage.test.tsx` |
| AC6 | preset re-pins under equilibrium; description truthfulness | `examples.test.ts` |
| AC7 | store hydration recomputes offeredLoad from users/think | `store.test.ts` |

## Risks / trade-offs

- **Perf**: equilibrium runs ≤60 metric passes per edit. Designs are ≤ dozens of
  nodes; a pass is O(V+E) arithmetic — negligible. Pin with a coarse perf sanity
  test only if it ever shows up in profiling (not an AC).
- **Convergence**: damping + iteration cap guarantee termination; the clamp bounds
  L, so the map is bounded. AC1 pins the residual so silent non-convergence fails.
- **Every preset's numbers move** — this is the one spec where `examples.test.ts`
  gets a full re-pin; do it here once (115 only touches copy/nudges afterwards).
- **Teaching trade-off**: 429 storms become rarer (truthfully so); AC5 keeps one
  in the test suite so the shed path never rots.
