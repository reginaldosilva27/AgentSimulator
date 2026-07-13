# Spec: Verify / reflection loop

| | |
|---|---|
| **ID** | 098-verify-reflection-loop |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-11 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The simulator is being positioned as a gateway to learn **Harness Engineering** and
**Loop Engineering** (`096-harness-loop-lens`, `097-learn-harness-loop`). But those two
specs are purely *descriptive* — they **name and reframe** what already runs. The Learn
theory (`097` AC4) even promises **"loopcraft" — stacking verification / event /
hill-climbing loops** on top of the base ReAct cycle — yet **no such loop executes**:
the real loop is a fixed `route → think ⇄ tools → generate → respond` whose only
second-order behavior is a bounded tool iteration count and one-shot failure injection.

A **verification (reflection) loop** is the canonical first rung of loopcraft: after the
agent drafts an answer, a **critic pass** judges it (grounded? complete? answers the
question?) and, if it falls short, sends it back for **one or more bounded revisions**
before the answer is committed. This is exactly the "great vs mediocre agent" lever the
Learn page describes — and today the app can only talk about it, not show it.

We also validated it is **genuinely absent from the DeepAgents runtime**: DeepAgents ships
planning + a virtual file system + a single `researcher` sub-agent; the `critic` member of
the planned `researcher/coder/critic` trio is explicitly a *later spec* and does not exist.
So there is no self-critique anywhere in the graph today.

This spec makes the verification loop a **real, runtime-agnostic node in the core ReAct
graph** — so it lights up for ReAct *and* DeepAgents — gated by an **opt-in request input**
so the default run stays byte-for-byte identical to today.

## Goals

- Add a real **`verify` node** to the canonical agent loop, positioned after the answer is
  drafted and before it is committed: `… → generate → verify ⇄ generate → respond`.
- The verify pass is a genuine LLM judgement (a critic prompt over the drafted answer +
  the question + the grounding it used) that yields a structured **verdict** (pass/revise +
  a short reason), emitted as a new `agent.verify` trace stage.
- On a **revise** verdict, the loop returns to `generate` with the critique folded into the
  message thread, **bounded** by a small max-revisions cap (no infinite loops); on a **pass**
  verdict (or once the cap is hit) it proceeds to `respond`.
- The loop is **opt-in** via a request input (default off). With it off, the run is
  **byte-for-byte** what it is today — no `agent.verify` events, no extra model calls, no
  behavioral change.
- The visualization surfaces the loop honestly: the `agent.verify` stage animates the
  **agent** station, the drill-in shows each verdict + revision, and the **Loop lens**
  (`096`) foregrounds the new verify ⇄ generate edge — realizing the "loopcraft" the Learn
  page promised.

## Non-goals

- **Not** the DeepAgents `critic` sub-agent (`researcher/coder/critic` trio) — that stays a
  future spec. This verify node is a core-loop pass, orthogonal to and reused by every runtime.
- **Not** always-on. Verification is an experiment the learner turns on, not new platform
  behavior — the default baseline must not shift.
- No new *tool*, no new station, no new tier/hop. Reuses the existing `agent` station.
- Not multi-critic / voting / ensemble verification, and not hill-climbing over N drafts —
  a single critic with bounded revisions. Those richer loopcraft shapes are deferred.
- No change to `MAX_ITERATIONS` (the tool loop) — verify has its **own** independent bound.

## User-facing behavior

- A new **request input** turns the verification loop on for a conversation (default **off**).
  It surfaces as a small **toggle** in the experiment controls / composer, prefilled from
  `GET /api/config` so the frontend never hardcodes the default.
- With verify **on**, after the agent drafts its answer the canvas shows a **verify** step on
  the **agent** station; if the critic asks for a revision, the learner sees the loop return to
  generation and re-emit — the **iteration/loop readout** reflects the extra revision round(s).
- The **agent drill-in** gains a **verification panel**: each verdict (pass / revise), its short
  reason, and how many revision rounds ran, all composed client-side from the trace (pure
  projection — no extra request).
- With verify **off**, nothing changes anywhere — same stages, same readouts, same answer path.
- **Constitution §4:** every new string — the toggle label + help, the readout, the verdict
  labels (pass / revise), the panel heading and the "no verification ran" empty state — ships
  in **en + pt**. Proper nouns / protocol tokens stay untranslated.

## Acceptance criteria

1. **AC1 (default is byte-for-byte)** — With the verify input **absent or false**, a run emits
   **no** `agent.verify` events and the set of stages fired is identical to today's baseline for
   the same request; no extra model call is made for verification.
2. **AC2 (verify fires)** — With verify **on**, a run emits at least one `agent.verify` stage
   (a START/END pair) that carries a structured verdict payload with a decision in
   `{pass, revise}` and a non-empty reason string.
3. **AC3 (bounded)** — The verify → generate revision loop is bounded by a fixed max-revisions
   cap: across any run the number of revision rounds never exceeds the cap, and the graph always
   terminates at `respond` (a test drives a persistently-failing critic and asserts termination
   at the cap, not an infinite loop).
4. **AC4 (pass proceeds, answer intact)** — When the critic returns **pass** (or the cap is hit),
   the run proceeds to `respond` and the committed answer is non-empty; the answer that reaches
   `respond` is the most recent draft (a revision, when one occurred).
5. **AC5 (revise re-generates with the critique)** — When the critic returns **revise**, a new
   `generate` round runs and the critique is present in the model's context for that round
   (asserted structurally via the message thread / prompt preview), so the revision is an honest
   response to the critique.
6. **AC6 (runtime-agnostic)** — The verify node runs under **both** the `react` and `deepagents`
   runtimes when the input is on (asserted structurally: `agent.verify` fires in a DeepAgents run),
   and does **not** run under either when the input is off.
7. **AC7 (protocol mirror)** — `Stage.AGENT_VERIFY` (value `agent.verify`) exists in
   `backend/app/schemas.py` **and** its hand-maintained mirror `frontend/src/types/events.ts`;
   it is assigned to exactly one station (`agent`) in `STAGE_TO_STATION` and to a `TimelinePhase`
   in `STAGE_TO_PHASE`; the existing exhaustive-map / parity tests pass.
8. **AC8 (config exposes the default)** — `GET /api/config` reports the verify default so the
   frontend prefills the toggle without hardcoding it.
9. **AC9 (drill-in projection)** — The agent drill-in renders the verification panel from trace
   events only (pure projection): for a verify-on run it lists each verdict + reason + revision
   count; for a verify-off run it shows the bilingual empty state. No new network request.
10. **AC10 (bilingual)** — Every new user-facing string added by this spec resolves in both
    `en` and `pt` (the existing i18n/content parity tests cover them).

## Protocol / stage impact

- New/changed `Stage`(s): **`agent.verify`** (`Stage.AGENT_VERIFY`) — a per-revision judgement
  span emitted by the new verify node.
- Mirror in `frontend/src/types/events.ts`: **required** (add `agent.verify` to the `Stage` union).
- Station it maps to in `stations.ts`: **`agent`** (a new sub-stage of the agent station, like
  `agent.think` — no new tile). Add to `STAGE_TO_STATION` and `STAGE_TO_PHASE`.
- Request input: a new optional field on `ChatRequest` (default off) — request-only, threaded into
  `AgentState`, in the spirit of the existing `simulate_failure` / `top_k` / `rerank` inputs.

## Open questions (clarify before planning)

<!-- All resolved with the user before planning: -->
- [x] Where does verify live? → **A core `verify` node in the ReAct graph** (runtime-agnostic),
  not the DeepAgents critic sub-agent. (Confirmed 2026-07-11.)
- [x] How is it gated? → **Opt-in request input, default off**; baseline stays byte-for-byte.
  (Confirmed 2026-07-11.)
- [x] Does it exist in DeepAgents already? → **No** — validated in `app/agent/deepagents.py`
  (only a `researcher` sub-agent; `critic` is a future spec). (Confirmed 2026-07-11.)

## Out of scope / deferred

- **Verify *modes*** (an enum `off | self-check | critic-subagent`) instead of a bool — deferred;
  ship the bool first. The DeepAgents `critic` sub-agent is the natural home for a `critic` mode.
- **Multi-critic / voting / ensemble** verification and **hill-climbing over N drafts** — richer
  loopcraft shapes for a later spec.
- **Configurable max-revisions** as a user input (like a future `max_iterations` input) — ship a
  fixed cap first.
- Wiring the verify loop into the **Loop lens** emphasis (`096`) beyond the stage animating its
  station may land here or as a small follow-up, depending on plan scope.
