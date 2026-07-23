// 102-arena-ai-gateway — the AI Gateway routes/load-balances across LLM
// deployments, so a fleet behind it aggregates capacity (AC1, AC2).

import { describe, expect, it } from "vitest";

import { BENCHMARKS, KIND_META, splitsLoad } from "./components";
import { computeMetrics, type ArenaDesign } from "./model";

describe("AI Gateway component (AC1, AC2)", () => {
  it("is a known kind that splits load like a router", () => {
    expect(BENCHMARKS.aiGateway).toBeDefined();
    expect(KIND_META.aiGateway.label.en.trim()).toBeTruthy();
    expect(KIND_META.aiGateway.label.pt.trim()).toBeTruthy();
    expect(splitsLoad("aiGateway")).toBe(true);
    expect(splitsLoad("llm")).toBe(false);
  });

  it("splits offered load evenly across the LLM fleet behind it (aggregate capacity)", () => {
    const gw = { id: "gw", kind: "aiGateway", size: "medium", replicas: 1 } as const;
    const llm = (id: string) =>
      ({ id, kind: "llm", size: "medium", replicas: 1 }) as const;
    const design: ArenaDesign = {
      nodes: [gw, llm("a"), llm("b"), llm("c"), llm("d")],
      edges: ["a", "b", "c", "d"].map((t) => ({ id: `gw-${t}`, source: "gw", target: t })),
    };
    const L = BENCHMARKS.llm.baseCapacity * 3; // would crush ONE llm (util 3)
    const m = computeMetrics(design, L);
    // Each of the 4 deployments sees ~L/4, so none is critical — the fleet absorbs it.
    for (const id of ["a", "b", "c", "d"]) {
      expect(m.get(id)!.arriving).toBeCloseTo(L / 4, 5);
      expect(m.get(id)!.bottleneck).toBe(false);
    }
  });
});
