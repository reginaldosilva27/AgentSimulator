# Tasks: Arena — realistic LLM latency

> Ordered TDD checklist (red → green → refactor). Frontend-only (Vitest from
> `frontend/`).

## Tasks

- [ ] **T1 — test first (AC1/AC2)**: in `components.test.ts`, assert the default
  latency is in [3000, 7000] ms, decode slope ⇒ 60–150 tok/s, decode term is the
  largest component, and `baseLatencyMs === llmBaseLatencyMsFor(DEFAULT)`. Update
  the existing `toBe(800)` pin to the new value. RED.
- [ ] **T2 — implement constants**: set `LLM_TTFT_MS=400`,
  `LLM_DECODE_MS_PER_TOKEN=8.0`, `BENCHMARKS.llm.baseLatencyMs=4500`; rewrite the
  calibration comments (gpt-4.1-mini anchor). GREEN (T1).
- [ ] **T3 — test first (AC4)**: in `model.test.ts`, pin that a `backend→llm`
  design holds MORE streams than the old 800 ms world (explicit expected figure
  for the new constants, or a computed lower bound). RED then GREEN.
- [ ] **T4 — verify AC3**: run the 116/117 capacity/quota/cost + latency-linearity
  tests — they must stay green with their EXISTING expected values (capacity/cost
  untouched). No code change expected; fix only if something leaked.
- [ ] **T5 — retune presets (AC5)**: run `examples.test.ts`; for each llm-healthy
  preset whose backend now exceeds 70% of its connection budget, raise its backend
  `replicas` until green. Note each bump in the preset's build comment. Do NOT
  change any preset's architecture or LLM pool.
- [ ] **T6 — refactor + gates**: `npm run build` (tsc) + full `npm test` from
  `frontend/`; live check in the app (LLM node + e2e readout now show seconds).
- [ ] **T7 — demo parity**: confirm the recalibration shows in the demo build
  (`VITE_DEMO_MODE=1 npm run build`) — Arena is pure-frontend so it's automatic;
  spot-check once.
- [ ] **T8 — memory**: update the Arena calibration memory note.

## Definition of done

- [ ] Every AC in `spec.md` maps to a passing test
- [ ] `npm run build` passes (`tsc --noEmit` + build)
- [ ] `npm test` green (Vitest, from `frontend/`)
- [ ] Capacity/quota/cost tests unchanged (only latency moved)
- [ ] No protocol impact; backend untouched
- [ ] `spec.md` status updated to `done`
