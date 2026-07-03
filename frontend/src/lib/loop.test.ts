// 096-harness-loop-lens — AC5: deriveLoopView projects the loop's control elements
// from the trace — iteration count, stop reason (final-answer vs max-iterations),
// whether a real think⇄tools cycle turned, and a simulated-failure/recovery flag.

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { DEEPAGENTS_MAX_ITERATIONS, deriveLoopView, isLoopStation, MAX_ITERATIONS } from "./loop";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

// A finished run with `thinks` reasoning turns; `tool` adds an mcp.call act step.
function run(thinks: number, opts: { tool?: boolean; finish?: boolean; failure?: boolean } = {}): TraceEvent[] {
  seq = 0;
  const out: TraceEvent[] = [ev("frontend", "end", opts.failure ? { simulate_failure: "llm_timeout" } : {})];
  out.push(ev("backend", "start"));
  for (let i = 0; i < thinks; i++) {
    out.push(ev("agent.think", "start"));
    if (opts.tool) out.push(ev("mcp.call", "end", { tool: "calculator", result: "4" }));
    out.push(ev("agent.think", "end", { decision: opts.tool ? "tool" : "answer" }));
  }
  out.push(ev("respond", "end", { answer: "done" }));
  if (opts.finish !== false) out.push(ev("backend", "end"));
  return out;
}

describe("deriveLoopView (AC5)", () => {
  it("counts iterations and reports `final-answer` when the loop stops before the cap", () => {
    const events = run(1, { finish: true });
    const loop = deriveLoopView(events, events.length - 1);
    expect(loop.iterations).toBe(1);
    expect(loop.maxIterations).toBe(MAX_ITERATIONS);
    expect(loop.finished).toBe(true);
    expect(loop.stopReason).toBe("final-answer");
    expect(loop.failure).toBe(false);
  });

  it("reports `max-iterations` when the loop hits the cap", () => {
    const events = run(MAX_ITERATIONS, { tool: true, finish: true });
    const loop = deriveLoopView(events, events.length - 1);
    expect(loop.iterations).toBe(MAX_ITERATIONS);
    expect(loop.stopReason).toBe("max-iterations");
    expect(loop.looped).toBe(true); // a tool result means the cycle actually turned
  });

  it("is honest while the run is still turning: no stop reason yet", () => {
    const events = run(1, { finish: false });
    const loop = deriveLoopView(events, events.length - 1);
    expect(loop.finished).toBe(false);
    expect(loop.stopReason).toBeNull();
  });

  it("flags an injected failure / recovery path", () => {
    const events = run(1, { failure: true, finish: true });
    const loop = deriveLoopView(events, events.length - 1);
    expect(loop.failure).toBe(true);
  });

  it("also flags failure from a `simulated` marker on a span", () => {
    seq = 0;
    const events = [
      ev("frontend", "end"),
      ev("backend", "start"),
      ev("mcp.call", "end", { tool: "x", result: "boom", simulated: true }),
      ev("backend", "end"),
    ];
    const loop = deriveLoopView(events, events.length - 1);
    expect(loop.failure).toBe(true);
  });

  it("uses the wider DeepAgents cap (8), so 5 turns is a natural stop, not the cap", () => {
    // Regression: a DeepAgents run (plan/delegate present) with 5 reasoning turns
    // must read cap 8 (not the ReAct 3) — so "5 turns · cap 3 · hit the cap" (wrong,
    // contradictory) becomes "5 turns · cap 8 · answered on its own".
    seq = 0;
    const events: TraceEvent[] = [ev("frontend", "end"), ev("backend", "start")];
    events.push(ev("agent.plan", "end", { steps: ["a", "b"] })); // marks the runtime
    for (let i = 0; i < 5; i++) {
      events.push(ev("agent.think", "start"));
      events.push(ev("mcp.call", "end", { tool: "calculator", result: "4" }));
      events.push(ev("agent.think", "end", { decision: "tool" }));
    }
    events.push(ev("respond", "end", { answer: "48" }));
    events.push(ev("backend", "end"));

    const loop = deriveLoopView(events, events.length - 1);
    expect(loop.iterations).toBe(5);
    expect(loop.maxIterations).toBe(DEEPAGENTS_MAX_ITERATIONS); // 8, not 3
    expect(loop.stopReason).toBe("final-answer"); // 5 < 8 → answered on its own
  });

  it("respects the cursor (replay): an earlier cursor sees fewer iterations", () => {
    const events = run(2, { finish: true });
    const firstThinkEnd = events.findIndex((e) => e.stage === "agent.think" && e.phase === "end");
    const loop = deriveLoopView(events, firstThinkEnd);
    expect(loop.iterations).toBe(1);
    expect(loop.finished).toBe(false);
  });
});

describe("loop stations", () => {
  it("classifies the reason→act→observe stations as the loop", () => {
    for (const id of ["agent", "llm", "mcp", "rag", "pageindex"] as const) {
      expect(isLoopStation(id)).toBe(true);
    }
    for (const id of ["frontend", "backend", "database", "guardrails"] as const) {
      expect(isLoopStation(id)).toBe(false);
    }
  });
});
