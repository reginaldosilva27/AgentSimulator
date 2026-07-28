# Tasks: Arena — chaos / failure injection

> Depends on **129** (verdict axes) and **130** (challenge givens) being `done`.
> **T1 is non-negotiable and comes first**: this is the first spec in the batch to edit
> `model.ts`, so the inert-by-default proof is written before any edit. Vitest from `frontend/`.

## Tasks

- [x] **T0 — clarify**: **done 2026-07-27.** Catalog = the **seven** component/region faults;
      **no** client traffic-surge (it perturbs load, not a component — the users slider already
      does it); a starved node reads **`unreachable` + a hint naming the upstream failure**;
      sandbox faults are **cleared on entering a challenge, not restored on exit** (AC13);
      **129 gains no resilience axis** — a challenge with faults in its givens expresses it.
      Status → `clarified`.
- [x] **T1 — test first (AC9), before touching `model.ts`**: golden-value regression pinning
      today's metrics for the shipped presets, plus `applyFaults(d)` with no faults returning
      `d` identically. Commit this net first.
- [x] **T2 — test first (AC1)**: `chaos.test.ts` — `instanceDown` ⇒ capacity 0, throughput 0,
      shed = arriving, status ≠ healthy.
- [x] **T3 — implement**: `chaos.ts` (`ArenaFault`, `ArenaFaultType`, `FAULT_META`,
      `applyFaults`) + `faults?` on `ArenaDesign` + the pre-pass call inside `computeMetrics` +
      zero units allowed in `effectiveCapacity` (audit every `Math.max(1, replicas)`).
- [x] **T4 — test first (AC2)**: `A→X(down)→B` ⇒ B arriving 0, status `unreachable`, no phantom
      downstream load, **and** a hint naming X as the upstream cause (en + pt).
- [x] **T5 — implement**: the starved-node status rule + the upstream-cause hint; grep **every**
      `NodeStatus` consumer (readouts, colours, 129's culprit rule) so newly-live `unreachable`
      renders correctly.
- [x] **T6 — test first (AC3)**: `unitLoss` k<n and k≥n (the latter equals `instanceDown`).
- [x] **T7 — implement**: `unitLoss`.
- [x] **T8 — test first (AC4)**: `latencySpike` ⇒ e2e latency up **and** `equilibriumRps` down.
- [x] **T9 — implement**: the latency multiplier at the point base latency enters the queueing
      curve (default 1); verify the capacity-0 regime does not print a fictional latency
      (reuse 108's framing).
- [x] **T10 — test first (AC5)**: `cacheFlush` ⇒ downstream arriving rises to the full rate.
- [x] **T11 — implement**: `cacheFlush` (effective hit ratio 0) + `dependencyDegraded`.
- [x] **T12 — test first (AC6, AC7)**: `quotaCut` squeezes only its region's pools;
      `regionOutage` — two-region design sheds 0, single-region sheds.
- [x] **T13 — implement**: quota cut threaded through `quotaFactorsFor` (114's proportional
      squeeze) + `regionOutage` as region-wide `instanceDown`.
- [x] **T14 — test first (AC8)**: `faults` never reaches the persisted blob; `clearFaults` ⇒
      metrics deep-equal the pre-fault snapshot.
- [x] **T15 — implement**: `faults` as **transient** store state (the `exampleId` precedent) +
      `applyFault` / `removeFault` / `clearFaults`.
- [x] **T16 — test first (AC10)**: `ChaosPanel.test.tsx` — catalog renders, apply targets the
      selected node, active list names targets, remove-one and clear-all work; node shows `⚡`
      (assert via the pure marker helper, not React Flow's a11y tree — the 117–119 gotcha).
- [x] **T17 — implement**: `ChaosPanel.tsx` + the `⚡` marker in `ArenaNode.tsx` (120's `📝`
      precedent, incl. the pure helper) + the honesty/transience note.
- [x] **T18 — test first (AC11)**: a fault flips a 129 objective to ✗ with the faulted/starved
      node as culprit.
- [x] **T19 — implement**: whatever culprit adjustment AC11 exposes (`slo.ts` consumes
      `design`, so ideally nothing).
- [x] **T20 — test first (AC12, AC13)**: a challenge with `givens.faults` applies them on enter,
      refuses removal while active, and its reference passes **with** them at 130's ≥20% margin
      (130's walking tests extended); entering clears sandbox faults and exiting does not
      restore them.
- [x] **T21 — implement**: `givens.faults` in `challenges.ts` + at least one resilience
      challenge (e.g. region outage in the givens, e2e + headroom as objectives) + the lock in
      `enterChallenge` / `removeFault` + the clear-on-enter rule.
- [x] **T22 — i18n (§4)**: `arena.chaos.*` + `FAULT_META` + the upstream-cause hint in en **and**
      pt; extend the `i18n.test.ts` walk (AC14).
- [x] **T23 — cloud map (§5)**: n/a — no new tier/station (record the n/a).
- [x] **T24 — refactor**: `chaos.ts` header comment — the design-transform architecture, the
      determinism rule (no `Math.random` / `Date.now`), and the explicit contrast with spec 017.
- [x] **T25 — demo check**: standing GitHub-Pages directive — confirm the mocked demo (058)
      needs no re-capture and say so.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] AC9's golden regression proves faults are inert when unused (`model.ts` edits safe)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green (from `frontend/`)
- [x] No protocol change: no `Stage`, no `TraceEvent`, `schemas.py` ↔ `events.ts` untouched
- [x] No `Math.random` / `Date.now` anywhere in `chaos.ts` or `model.ts`
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
