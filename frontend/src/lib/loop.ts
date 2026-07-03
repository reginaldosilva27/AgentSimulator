// 096-harness-loop-lens — the loop axis. Where `harness.ts` classifies the wiring
// in space, this projects the agentic *cycle* in time from the trace: the ReAct
// loop (reason → act → observe), how many iterations ran, why it stopped, and
// whether a failure/recovery path was exercised. A pure projection over the event
// log up to the cursor — no new events, no request. Powers the Loop-lens readout.

import type { TraceEvent } from "../types/events";
import type { StationId } from "./stations";

// The bounded loop in graph.py: `_should_continue` loops back to tools while there
// are pending calls and `iterations <= _max_iterations(state)`. The cap depends on
// the runtime — the plain ReAct loop is bounded at 3; the DeepAgents runtime (plan +
// delegate + virtual FS) gets a wider budget of 8. Kept in sync with the backend
// constants (`MAX_ITERATIONS` / `DEEPAGENTS_MAX_ITERATIONS`) so the readout is honest.
export const MAX_ITERATIONS = 3;
export const DEEPAGENTS_MAX_ITERATIONS = 8;

// The DeepAgents runtime is honestly detectable from the trace: only it emits the
// planner / delegation / virtual-FS stages. So the correct cap is a pure projection
// of the event log — no need to thread the runtime selection through.
function isDeepAgentsRun(events: TraceEvent[]): boolean {
  return events.some(
    (e) =>
      e.stage === "agent.plan" ||
      e.stage === "agent.delegate" ||
      e.stage.startsWith("agent.fs."),
  );
}

// The stations that *are* the loop — the reason → act → observe cycle. The agent
// reasons; it acts through tools (MCP) and retrieval (RAG / RAGLESS); the model
// generates. Everything else is harness the loop rides on, not the loop itself.
export const LOOP_STATION_IDS: ReadonlySet<StationId> = new Set<StationId>([
  "agent",
  "llm",
  "mcp",
  "rag",
  "pageindex",
]);

/** Is this station part of the reason→act→observe cycle (vs. surrounding harness)? */
export function isLoopStation(id: StationId): boolean {
  return LOOP_STATION_IDS.has(id);
}

/** Why the loop ended — or `null` while it's still turning (honest "in progress"). */
export type StopReason = "final-answer" | "max-iterations" | null;

export interface LoopView {
  iterations: number; // completed reasoning turns (agent.think ENDs)
  maxIterations: number; // the bound the loop is capped at
  looped: boolean; // did the agent actually act via a tool (a real think⇄tools cycle)?
  finished: boolean; // has the run completed (outer backend stage closed)?
  stopReason: StopReason; // final-answer vs max-iterations; null while running
  failure: boolean; // was a simulated failure / recovery path exercised this run?
}

/**
 * Project the loop's control elements from the event log up to `upto` (inclusive).
 * Mirrors `deriveView`'s cursor semantics so the readout steps/replays in lockstep
 * with the canvas.
 */
export function deriveLoopView(events: TraceEvent[], upto: number): LoopView {
  const visible = upto >= 0 ? events.slice(0, upto + 1) : [];

  let iterations = 0;
  let looped = false;
  let failure = false;

  for (const ev of visible) {
    if (ev.stage === "agent.think" && ev.phase === "end") iterations += 1;
    // A real act step: the agent invoked a tool (MCP) or retrieval — the "act" in
    // reason→act→observe. Elected tool calls appear on agent.think too, but a tool
    // *result* (mcp.call / rag.retrieve) is the honest signal the loop turned.
    if (ev.stage === "mcp.call" || ev.stage === "rag.retrieve") looped = true;
    // 017/051 — an injected failure is echoed on the request body (frontend event)
    // and marked on the failing span (`simulated`) / its treatment.
    if (typeof ev.data.simulate_failure === "string" && ev.data.simulate_failure) failure = true;
    if (ev.data.simulated === true) failure = true;
  }

  const last = visible[visible.length - 1];
  const finished = Boolean(last && last.stage === "backend" && last.phase === "end");

  // The cap is runtime-dependent (ReAct 3 · DeepAgents 8), read from the trace.
  const maxIterations = isDeepAgentsRun(visible) ? DEEPAGENTS_MAX_ITERATIONS : MAX_ITERATIONS;

  let stopReason: StopReason = null;
  if (finished) {
    stopReason = iterations >= maxIterations ? "max-iterations" : "final-answer";
  }

  return { iterations, maxIterations, looped, finished, stopReason, failure };
}
