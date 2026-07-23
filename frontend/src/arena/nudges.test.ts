// 115-arena-builder-nudges — the fan-out nudge derivation (AC1/AC2).
//
// A hand-wired backend→LLM (or AI Gateway→LLM) with the silent default of 1 call
// per request is exactly the mistake the audited design made: it understates an
// agent's load 2–5×. The nudge is DERIVED state (pure projection of the design),
// suggested — never auto-applied.

import { describe, expect, it } from "vitest";

import { EXAMPLES } from "./examples";
import type { ArenaDesign } from "./model";
import { fanoutNudges } from "./nudges";

const n = (id: string, kind: string, extra = {}) =>
  ({ id, kind, size: "medium", replicas: 1, ...extra }) as ArenaDesign["nodes"][number];
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

describe("fanoutNudges (115 AC1/AC2)", () => {
  it("suggests cpr=2 on the LLM when a backend is wired straight to it at fan-out 1", () => {
    const d: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm")],
      edges: [e("be", "llm")],
    };
    expect(fanoutNudges(d)).toEqual([{ targetId: "llm" }]);
  });

  it("targets the gateway (not the LLM) when an AI Gateway fronts the pool", () => {
    const d: ArenaDesign = {
      nodes: [n("be", "backend"), n("gw", "aiGateway"), n("llm", "llm")],
      edges: [e("be", "gw"), e("gw", "llm")],
    };
    expect(fanoutNudges(d)).toEqual([{ targetId: "gw" }]);
  });

  it("stays silent when the fan-out is already set on either side (no double-count)", () => {
    const onLlm: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm", { callsPerRequest: 2 })],
      edges: [e("be", "llm")],
    };
    expect(fanoutNudges(onLlm)).toEqual([]);

    const onGw: ArenaDesign = {
      nodes: [n("gw", "aiGateway", { callsPerRequest: 2 }), n("llm", "llm")],
      edges: [e("gw", "llm")],
    };
    expect(fanoutNudges(onGw)).toEqual([]);

    const behindGw: ArenaDesign = {
      nodes: [n("gw", "aiGateway"), n("llm", "llm", { callsPerRequest: 3 })],
      edges: [e("gw", "llm")],
    };
    expect(fanoutNudges(behindGw)).toEqual([]);
  });

  it("never fires on any built-in example (they all set the fan-out)", () => {
    for (const ex of EXAMPLES) {
      const d = ex.build();
      expect(fanoutNudges({ nodes: d.nodes, edges: d.edges }), ex.id).toEqual([]);
    }
  });
});
