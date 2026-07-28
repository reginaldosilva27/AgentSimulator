# Tasks: Arena — SLO engine + live verdict

> Red → green → refactor, in order. T1–T12 are the pure layer (no React), T13+ the UI.
> Run Vitest **from `frontend/`** (repo root picks up a v4 without jsdom).

## Tasks

- [x] **T0 — clarify**: **done 2026-07-27.** All four questions resolved against a measured
      baseline (recorded in `spec.md`), which overturned three of the four drafted proposals.
      Defaults: **e2e ≤ 30 s · headroom ≥ 20% · shed ≤ 0 tracked, cost OFF**; panel = tabbed
      bottom-right surface; culprit highlighted on row hover. Status → `clarified`.
- [x] **T1 — test first (AC1)**: `slo.test.ts` — `evaluateObjectives` returns one result per
      enabled target and is deterministic across two calls.
- [x] **T2 — implement**: `slo.ts` skeleton — `SloMetricId`, `SLO_METRICS` (with fixed
      directions), `DesignMeasurement`, `SloResult`, `SloVerdict`, `evaluateObjectives`.
- [x] **T3 — test first (AC2)**: **both halves** of the shed axis — the over-loaded default
      design reports `shed = 0` and **meets** `≤ 0` (honest, not broken), while a design in the
      extreme regime (≈5× that load) reports the model's non-zero shed rate and **fails**.
- [x] **T4 — implement**: `measureDesign` — shed sum + `busiestNodeId`.
- [x] **T5 — test first (AC3, AC4)**: latency `actual` equals `endToEndLatencyMs` at the
      **equilibrium** rate; cost `actual` equals provisioned + usage and an idle deployment
      raises it.
- [x] **T6 — implement**: latency + cost axes in `measureDesign` (incl. `costliestLlmId`).
- [x] **T7 — test first (AC5)**: headroom axis — 95% util fails a ≥20% target, passes after
      horizontal scaling.
- [x] **T8 — implement**: headroom axis (`1 − max util` over load-carrying nodes; empty ⇒ 1).
- [x] **T9 — test first (AC6, AC8)**: culprit per metric (present only when failed) and the
      overall verdict incl. an objective switched off (`null`) leaving the result set.
- [x] **T10 — implement**: culprit assignment + verdict derivation + the display-unit
      comparison tolerance.
- [x] **T11 — test first (AC7, AC12)**: matrix walk — every reachable (metric, culprit kind)
      resolves a non-empty hint in **both** `en` and `pt`; bilingual walk over `arena.slo.*`.
- [x] **T12 — implement**: `REMEDIATION` table (by-kind + per-metric fallback) — mechanisms,
      never pinned figures (the 119 rule).
- [x] **T12b — test first (AC13)**: a past-ceiling design ⇒ the latency result is flagged
      `atCeiling` and the panel renders `≥` + the ceiling note, never a precise figure (108's
      rule); the shed row is pointed to.
- [x] **T12c — implement**: the `atCeiling` flag in `measureDesign` + its rendering.
- [x] **T12d — test first (AC14, AC4-inversion)**: under `DEFAULT_SLO_TARGETS` the default
      design fails **exactly** {latency, headroom} and `llm-fleet` meets all three tracked
      axes, with cost absent; plus the pin that the starved design costs **less** than the
      healthy one (the guard against someone turning cost on in the sandbox).
- [x] **T12e — implement**: `DEFAULT_SLO_TARGETS` — three entries (e2e 30 s, headroom 20%,
      shed 0); cost deliberately absent.
- [x] **T13 — test first (AC10)**: `store.test.ts` — `sloTargets` round-trips
      `agentsim.arena`; a malformed blob (`{bogus:"x", cost:-5}`) degrades to defaults
      without throwing.
- [x] **T14 — implement**: `sloTargets` in `ArenaState` + `setSloTarget` + sanitation in
      `loadArena` + `DEFAULT_SLO_TARGETS` in `defaultDesign` (128 `modelTier` precedent).
- [x] **T15 — test first (AC9)**: `SloPanel.test.tsx` — a saturated design renders a ✗ row
      with its hint; a scaling action re-renders it as ✓ with no reload.
- [x] **T15b — test first (AC15)**: hovering a failed row marks the culprit node on the canvas
      and mouse-out unmarks it (122's `data-highlighted`; assert via the pure derivation, not
      React Flow's a11y tree — the 117–119 gotcha).
- [x] **T16 — implement**: `SloPanel.tsx` (rows, ✓/✗, target editor, on/off incl. turning cost
      **on**, verdict line, per-row culprit + hint, hover highlight) mounted in `ArenaPage.tsx`
      as the **Objectives tab** of the bottom-right tabbed surface (sharing it with the example
      notes; 130 adds the Brief tab).
- [x] **T17 — implement (AC11)**: replace `ArenaPage`'s inline `totalShed` sum with
      `measureDesign` so the header and the panel share one definition.
- [x] **T18 — regression (AC11)**: confirm the existing `model.test.ts` / `examples.test.ts`
      / `ArenaPage.test.tsx` suites stay green and `computeMetrics`' signature is untouched.
- [x] **T19 — i18n (§4)**: `arena.slo.*` in `strings.ts`, en **and** pt; extend the
      `i18n.test.ts` walk.
- [x] **T20 — cloud map (§5)**: n/a — no new tier/station (record the n/a, don't skip it).
- [x] **T21 — refactor**: tidy `slo.ts` doc comments (state the axes and the honesty
      framing, as the other arena modules do), keep tests green.
- [x] **T22 — demo check**: per the standing GitHub-Pages directive, confirm the mocked demo
      (058) needs **no** re-capture (the Arena uses no fixtures) and say so explicitly.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green (from `frontend/`)
- [x] `ruff check .` / `pytest -q` unaffected (no backend change) — run once to confirm
- [x] No protocol change: no `Stage`, no `TraceEvent`, `schemas.py` ↔ `events.ts` untouched
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
