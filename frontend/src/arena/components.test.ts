// 102-arena-ai-gateway — the AI Gateway routes/load-balances across LLM
// deployments, so a fleet behind it aggregates capacity (AC1, AC2).

import { describe, expect, it } from "vitest";

import {
  BENCHMARKS,
  DEFAULT_HIT_RATIO,
  DEFAULT_SEMANTIC_HIT_RATIO,
  KIND_META,
  PALETTE_ORDER,
  splitsLoad,
} from "./components";
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

// --- 112-arena-semantic-cache -------------------------------------------------

describe("semantic cache component (112 AC1/AC5)", () => {
  it("is a palette kind with full bilingual metadata, clouds and scaling vocabulary", () => {
    expect(PALETTE_ORDER).toContain("semanticCache");
    expect(BENCHMARKS.semanticCache).toBeDefined();
    const meta = KIND_META.semanticCache;
    expect(meta.label.en.trim()).toBeTruthy();
    expect(meta.label.pt.trim()).toBeTruthy();
    expect(meta.clouds.azure.trim()).toBeTruthy();
    expect(meta.clouds.aws.trim()).toBeTruthy();
    expect(meta.clouds.gcp.trim()).toBeTruthy();
    expect(meta.scaling).not.toBeNull();
    // it is NOT a router — it serves hits and passes misses through.
    expect(splitsLoad("semanticCache")).toBe(false);
  });

  it("states the honest modest-hit-rate reality in its explainer (both languages)", () => {
    const meta = KIND_META.semanticCache;
    expect(meta.info.en).toMatch(/20–30%|20-30%/);
    expect(meta.info.pt).toMatch(/20–30%|20-30%/);
  });

  it("defaults to a modest 25% hit ratio, distinct from the key-value cache's 80%", () => {
    expect(DEFAULT_SEMANTIC_HIT_RATIO).toBe(0.25);
    expect(DEFAULT_HIT_RATIO).toBe(0.8);
  });
});
