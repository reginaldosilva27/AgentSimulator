// 098-verify-reflection-loop — `deriveVerifyRounds(events)` projects the critic passes
// of a turn from the visible event slice, so the Agent drill-in can show the reflection
// loop honestly. Pure function: live + replay share it (AC9).

import { describe, expect, it } from "vitest";

import type { Phase, Stage, TraceEvent } from "../types/events";
import { deriveVerifyRounds } from "./verifyRounds";

let seq = 0;
function ev(
  stage: Stage,
  phase: Phase,
  data: Record<string, unknown> = {},
  metrics: Record<string, number> = {},
): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics };
}

function verify(
  decision: "pass" | "revise",
  reason: string,
  revision: number,
  willRevise: boolean,
): TraceEvent[] {
  return [
    ev("agent.verify", "start"),
    ev(
      "agent.verify",
      "end",
      { decision, reason, revision, max_revisions: 2, will_revise: willRevise },
      { total_tokens: 40, cost_usd: 0.0002 },
    ),
  ];
}

describe("deriveVerifyRounds", () => {
  it("returns [] when verification was off (AC9 empty state)", () => {
    seq = 0;
    const events = [ev("llm.generate", "end", { answer: "hi" }), ev("respond", "end")];
    expect(deriveVerifyRounds(events)).toEqual([]);
  });

  it("projects each critic pass in order with verdict + reason (AC9)", () => {
    seq = 0;
    const events: TraceEvent[] = [
      ...verify("revise", "cite the source", 0, true),
      ...verify("pass", "looks good now", 1, false),
    ];
    const rounds = deriveVerifyRounds(events);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({
      round: 1,
      decision: "revise",
      reason: "cite the source",
      revision: 0,
      maxRevisions: 2,
      willRevise: true,
    });
    expect(rounds[1]).toMatchObject({ round: 2, decision: "pass", willRevise: false });
    expect(rounds[0].costUsd).toBeCloseTo(0.0002);
    expect(rounds[0].totalTokens).toBe(40);
  });

  it("counts only passes that actually looped as revision rounds", () => {
    seq = 0;
    // A capped revise commits (will_revise=false) — it is NOT a revision round.
    const events = [...verify("revise", "still weak", 2, false)];
    const rounds = deriveVerifyRounds(events);
    expect(rounds).toHaveLength(1);
    expect(rounds.filter((r) => r.willRevise)).toHaveLength(0);
  });

  it("ignores START events and only counts closed passes (partial log)", () => {
    seq = 0;
    const events = [ev("agent.verify", "start")]; // no END yet
    expect(deriveVerifyRounds(events)).toEqual([]);
  });
});
