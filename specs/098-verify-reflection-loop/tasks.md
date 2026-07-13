# Tasks: Verify / reflection loop

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.
> Use the **`add-stage`** skill for the protocol-mirror steps.

## Protocol foundation (constitution §1 — do first, in one commit)

- [x] **T1 — Stage + mirror**: add `Stage.AGENT_VERIFY = "agent.verify"` to `backend/app/schemas.py`
      and mirror `"agent.verify"` into `frontend/src/types/events.ts` (same commit).
- [x] **T2 — exhaustive maps**: add `"agent.verify"` to the `agent` station's `stages` in
      `stations.ts` and `agent.verify → generate` (or `reason`) in `phases.ts`. Run the
      schema↔events / `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity tests → they define AC7.

## Backend — the loop (red → green)

- [x] **T3 — test AC1 (baseline)**: failing test in `backend/tests/test_verify_loop.py` — a
      verify-**off** run emits no `agent.verify` and the stage set equals the baseline.
- [x] **T4 — impl gate**: add `verify: bool = False` to `ChatRequest`; `verify_enabled` + `revisions`
      to `AgentState`; thread through `run_agent`/`stream_agent`; keep `generate → respond` literal
      when off. Make T3 pass.
- [x] **T5 — test AC2 (verify fires + verdict shape)**: verify-**on** run emits `agent.verify`
      START/END with `{decision ∈ {pass,revise}, reason≠""}`.
- [x] **T6 — impl verify node**: `CRITIC_PROMPT` in `prompts.py`; critic method on the
      `LLMProvider` ABC + OpenAI impl; `verify_node` in `graph.py` emitting `agent.verify` with the
      verdict + folded usage metrics. Make T5 pass.
- [x] **T7 — test AC3 (bounded/terminates)**: force a persistently-`revise` critic (provider seam)
      → assert revisions ≤ `MAX_REVISIONS` and the run terminates at `respond`.
- [x] **T8 — impl conditional edge**: `MAX_REVISIONS` const; `_should_revise` conditional out of
      `verify` (revise & under cap → `generate`, else → `respond`); register node + wiring. Green T7.
- [x] **T9 — test AC4/AC5 (pass proceeds; critique in context)**: pass → non-empty answer == latest
      draft; revise → critique text present in the next `generate` thread/prompt preview.
- [x] **T10 — impl critique fold**: append the critique to `AgentState.messages` on revise. Green T9.
- [x] **T11 — test AC6 (runtime-agnostic)**: `agent.verify` fires under `deepagents` when on, absent
      when off. Adjust node gating to key only off `verify_enabled`. Green.
- [x] **T12 — test AC8 (config)**: `GET /api/config` reports the verify default; expose it in
      `main.py`. Green.

## Frontend — projection (red → green)

- [x] **T13 — test AC9 (drill-in projection)**: failing `verify.test.ts(x)` for `deriveVerifyRounds`
      (lists verdicts/reason/round count from events; empty state when off).
- [x] **T14 — impl selector + panel**: `deriveVerifyRounds` in `lib/`; verification panel in
      `AgentDetail`; agent readout surfaces the verdict when present. Green T13.
- [x] **T15 — impl toggle**: `verify` in `useExperiment`; toggle in the Experiment controls /
      composer, prefilled from `/api/config`; send it in the chat request.

## Cross-cutting

- [x] **T16 — i18n (§4)**: add every string from `plan.md`'s i18n table in **en + pt**; parity
      test green (AC10).
- [x] **T17 — token parity**: verify the critic cost shows in the drill-in and doesn't break the
      HUD/BRAIN/Context/Traces four-way total (`token-totals-four-way-parity`).
- [x] **T18 — refactor**: clean up, keep all tests green; run the `verify-gates` skill.
- [ ] **T19 — demo (GitHub Pages)**: per the standing directive, ask whether the mocked demo (058)
      needs a re-capture for the new `agent.verify` stage.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format .`
- [x] `pytest -q` green (with `OPENAI_API_KEY`; keyless guard tests still run)
- [x] `npm run build` passes (`tsc --noEmit` + build) · `npm test` (Vitest) green
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`), `agent.verify` mapped to the `agent`
      station and to a `TimelinePhase`
- [x] All new user-facing text exists in en **and** pt
- [x] Cloud map: **n/a** (no new tier/station)
- [x] `spec.md` status updated to `done`
