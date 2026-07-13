// 098-verify-reflection-loop — project the critic (verification) passes of a turn.
//
// When the `verify` toggle is on, the agent runs a critic pass after each draft: an
// `agent.verify` span carrying a { decision, reason, revision, will_revise } verdict.
// A `revise` verdict (within the bound) loops back to generation, so a turn can have
// several verify passes. This pure helper walks the visible event slice and returns
// one entry per pass so the Agent drill-in can show the reflection loop honestly — like
// `deriveLlmRounds`, it is a pure projection (live streaming + step/replay share it).

import type { TraceEvent } from "../types/events";

export interface VerifyRound {
  round: number; // 1-based pass index (the Nth time the critic judged a draft)
  decision: "pass" | "revise";
  reason: string;
  revision: number; // which draft this judged (0 = the first draft)
  maxRevisions?: number;
  willRevise: boolean; // whether this verdict actually looped back to generation
  costUsd?: number;
  totalTokens?: number;
}

const num = (m: Record<string, number>, k: string): number | undefined => {
  const v = m[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

const str = (d: Record<string, unknown>, k: string): string | undefined => {
  const v = d[k];
  return typeof v === "string" ? v : undefined;
};

/**
 * Build the ordered list of verification passes for a turn from its event log.
 * Empty when verification was off (no `agent.verify` events) — the drill-in then shows
 * the bilingual empty state. A partial log yields only the passes whose END was reached.
 */
export function deriveVerifyRounds(events: TraceEvent[]): VerifyRound[] {
  const ends = events.filter((e) => e.stage === "agent.verify" && e.phase === "end");
  return ends.map((e, i) => {
    const decision = str(e.data, "decision") === "revise" ? "revise" : "pass";
    const revision = typeof e.data.revision === "number" ? e.data.revision : i;
    const maxRevisions =
      typeof e.data.max_revisions === "number" ? e.data.max_revisions : undefined;
    return {
      round: i + 1,
      decision,
      reason: str(e.data, "reason") ?? "",
      revision,
      maxRevisions,
      willRevise: e.data.will_revise === true,
      costUsd: num(e.metrics, "cost_usd"),
      totalTokens: num(e.metrics, "total_tokens"),
    };
  });
}
