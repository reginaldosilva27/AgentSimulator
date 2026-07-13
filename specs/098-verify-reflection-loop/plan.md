# Plan: Verify / reflection loop

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Insert a real **`verify` node** into the compiled LangGraph agent between `generate` and
`respond`. Today the wiring is:

```
START → route → think ⇄ tools → generate → respond → END
```

It becomes (only when the request opts in):

```
START → route → think ⇄ tools → generate → verify ─(revise)→ generate
                                                  └(pass / cap)→ respond → END
```

- **Gate.** A new optional `ChatRequest` field (working name `verify: bool = False`) is threaded
  into `AgentState` (working name `verify_enabled`), exactly like `simulate_failure` / `rerank` /
  `runtime`. A conditional edge out of `generate` routes to `verify` only when the flag is on;
  when off, `generate → respond` stays the literal edge it is today (AC1 byte-for-byte).
- **The verify node** runs a genuine critic LLM call: a dedicated critic prompt over
  `{question, drafted answer, grounding used}` asking for a structured verdict
  `{decision: "pass"|"revise", reason: str}`. It emits the new `agent.verify` stage (START/END)
  carrying that verdict in `rec.data`, and increments a **revision counter** in state.
- **The conditional edge out of `verify`** (`_should_revise`): `revise` **and**
  `revisions < MAX_REVISIONS` → back to `generate`; otherwise → `respond`. On `revise` the
  critique is appended to `AgentState.messages` (as a system/human turn) so the next `generate`
  round honestly sees it (AC5). `MAX_REVISIONS` is a module constant (fixed cap, AC3), independent
  of `MAX_ITERATIONS`.
- **Runtime-agnostic** (AC6): the node keys only off `verify_enabled`, never off `runtime`, so it
  runs identically under `react` and `deepagents`. The DeepAgents preamble/loop is untouched.
- **The critic call reuses the existing `LLMProvider` seam** — a new provider method (or a reuse of
  `decide`/`stream_answer` with the critic prompt) so it stays real OpenAI and honors the model
  override. Emits `llm.prompt`/`llm.generate`? → **No**: to keep the verify span self-contained and
  the token accounting coherent, the critic call's usage is folded into the `agent.verify` payload
  (metrics), not a second `llm.generate`. (Revisit if it complicates the four-way token parity —
  see Risks.)

**Alternative considered — DeepAgents `critic` sub-agent** (rejected for now): would only run under
one runtime and wouldn't realize the core-loop "loopcraft" the Learn page promises. Kept as the
future `critic` *mode* (spec Out-of-scope).

## Affected files

**Backend**
- `backend/app/schemas.py` — add `Stage.AGENT_VERIFY = "agent.verify"`; add `verify: bool = False`
  to `ChatRequest`.
- `backend/app/agent/state.py` — add `verify_enabled: bool` and `revisions: int` to `AgentState`.
- `backend/app/agent/graph.py` — new `verify_node`; `MAX_REVISIONS` constant; `_should_revise`
  conditional; register node + swap the `generate → respond` edge for the conditional wiring;
  thread `verify` through `run_agent` / `stream_agent` signatures into initial state; append
  critique to the thread on revise.
- `backend/app/agent/prompts.py` — new `CRITIC_PROMPT` (the verify judgement instruction).
- `backend/app/llm/provider.py` (+ `openai_provider.py`) — critic judgement method (or reuse) on
  the ABC + OpenAI impl; returns the structured verdict.
- `backend/app/main.py` — pass `request.verify` into the agent run; expose the verify default in
  `GET /api/config`.

**Frontend**
- `frontend/src/types/events.ts` — mirror `agent.verify` into the `Stage` union.
- `frontend/src/lib/stations.ts` — add `"agent.verify"` to the `agent` station's `stages`
  (updates `STAGE_TO_STATION` derivation). No new station/tile.
- `frontend/src/lib/phases.ts` — add `"agent.verify": "generate"` (or `"reason"`) to `STAGE_TO_PHASE`.
- `frontend/src/lib/experiment.ts` (`useExperiment`) — carry `verify` alongside `top_k` /
  `simulate_failure`; send it in the chat request.
- Composer / experiment controls (e.g. `SettingsPage` Experiment section + composer) — the toggle,
  prefilled from `/api/config`.
- Agent drill-in (`AgentDetail` + a `lib/` selector, e.g. `deriveVerifyRounds`) — the verification
  panel (pure projection from events).
- `frontend/src/i18n/strings.ts` — the new bilingual UI strings.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `Stage.AGENT_VERIFY = "agent.verify"`.
- `frontend/src/types/events.ts` — add `"agent.verify"` to the `Stage` union (same commit).
- Emitted in: `backend/app/agent/graph.py` — `verify_node`.
- Mapped to station in `frontend/src/lib/stations.ts`: **`agent`** (added to its `stages` array).
- `STAGE_TO_PHASE` (`phases.ts`): `agent.verify → generate` (or `reason`).
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) case added: **n/a for a new case** —
  both switches are keyed by **StationId**, and `agent` already has cases. The new stage flows
  through the existing `agent` station; only the drill-in gains the verify panel. (Confirm the
  agent readout surfaces the verdict when present.)

## Data model changes

None. No Chroma change, no SQLite schema change. Trace events for `agent.verify` persist via the
existing `trace_events` table (048) automatically — no migration.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `experiment.verify.label` | Verification loop | Loop de verificação |
| `experiment.verify.help` | After drafting, a critic pass checks the answer and can send it back for a bounded revision. | Após rascunhar, uma etapa crítica revisa a resposta e pode devolvê-la para uma revisão limitada. |
| `agent.verify.panelHeading` | Verification | Verificação |
| `agent.verify.verdict.pass` | passed | aprovada |
| `agent.verify.verdict.revise` | needs revision | precisa de revisão |
| `agent.verify.rounds` (fn) | {n} revision round(s) | {n} rodada(s) de revisão |
| `agent.verify.empty` | Verification was off for this run. | A verificação estava desligada nesta execução. |
| `readout.agent.verify` | verified · {decision} | verificado · {decision} |

## Cloud map (constitution §5)

n/a — no new tier/station (reuses the existing `agent` station, whose cloud map is already filled).

## Test strategy (constitution §9 — TDD)

Structural assertions against real OpenAI (`@pytest.mark.openai`), plus keyless structural tests
where the critic can be stubbed via the provider seam / a forced verdict.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 baseline byte-for-byte | verify-off run emits no `agent.verify`, stage set == baseline | `backend/tests/test_verify_loop.py` |
| AC2 verify fires + verdict shape | verify-on run has `agent.verify` START/END w/ `{decision, reason}` | `backend/tests/test_verify_loop.py` |
| AC3 bounded / terminates | force a persistently-`revise` critic → revisions ≤ cap, ends at `respond` | `backend/tests/test_verify_loop.py` |
| AC4 pass proceeds, answer intact | pass verdict → non-empty answer == latest draft | `backend/tests/test_verify_loop.py` |
| AC5 critique in context | on revise, critique text present in next `generate` prompt/thread | `backend/tests/test_verify_loop.py` |
| AC6 runtime-agnostic | `agent.verify` fires under `deepagents` when on; absent when off | `backend/tests/test_verify_loop.py` |
| AC7 protocol mirror | schema↔events parity + `STAGE_TO_STATION`/`STAGE_TO_PHASE` totality | existing `test_schema*` / `phases.test.ts` / `stations` parity test |
| AC8 config default | `GET /api/config` includes the verify default | `backend/tests/test_config.py` (or api test) |
| AC9 drill-in projection | `deriveVerifyRounds` lists verdicts from events; empty state off | `frontend/src/…/verify.test.ts(x)` |
| AC10 bilingual | new strings resolve in en + pt | existing i18n/content parity test |

## Risks / trade-offs

- **Token / four-way parity.** The critic call spends tokens. Folding its usage into
  `agent.verify.metrics` (not a second `llm.generate`) keeps the existing HUD/BRAIN/Context/Traces
  parity coherent — but the drill-in must *show* verify cost so it isn't hidden. Verify against
  `token-totals-four-way-parity` before calling done.
- **Determinism.** The critic is a real LLM; tests must assert **structurally** (verdict shape,
  bound, termination), forcing verdicts via the provider seam where a deterministic path is needed
  (AC3 persistently-revise). No assertion on *which* answers get revised.
- **Latency / cost.** Each revision is an extra generate + critic round; the fixed `MAX_REVISIONS`
  cap (small, e.g. 2) bounds worst-case cost. Default-off means zero cost for the baseline.
- **Loop-lens follow-up.** Wiring `agent.verify` into the 096 Loop-lens emphasis may exceed this
  spec; if so, land the stage + drill-in here and file the lens emphasis as a small follow-up.
