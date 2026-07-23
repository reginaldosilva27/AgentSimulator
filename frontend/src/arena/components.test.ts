// 102-arena-ai-gateway — the AI Gateway routes/load-balances across LLM
// deployments, so a fleet behind it aggregates capacity (AC1, AC2).

import { describe, expect, it } from "vitest";

import {
  ARENA_REGIONS,
  BENCHMARKS,
  CALL_SHAPE_BOUNDS,
  CALLS_CONFIGURABLE,
  CONCURRENCY_BUDGET_PER_UNIT,
  DEFAULT_CALL_SHAPE,
  DEFAULT_HIT_RATIO,
  DEFAULT_SEMANTIC_HIT_RATIO,
  isCacheLike,
  KIND_META,
  LLM_COST_PER_CALL_USD,
  LLM_COST_PER_DEPLOYMENT_HOUR_USD,
  llmBaseCapacityFor,
  llmBaseLatencyMsFor,
  llmCostPerCallUsd,
  REGIONAL_LLM_QUOTA_RPS,
  regionalLlmQuotaRpsFor,
  splitsLoad,
  PALETTE_ORDER,
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

// --- 116-arena-openai-calibration ----------------------------------------------

describe("OpenAI-anchored LLM calibration (116 AC1)", () => {
  it("one medium deployment is a quota-tier block worth hundreds of calls/s", () => {
    // Anchor: Azure OpenAI Global Standard quota for gpt-4.1-mini, per region —
    // Tier 1 ≈ 33 calls/s … Tier 5 ≈ 1,000 calls/s at ~2.5k tokens/call. Medium
    // sits in the Tier 2–3 band; latency stays the blended per-call service time.
    expect(BENCHMARKS.llm.baseCapacity).toBe(150);
    expect(BENCHMARKS.llm.baseLatencyMs).toBe(800);
  });

  it("the regional quota is ~2× the top published per-region tier (increase territory)", () => {
    expect(REGIONAL_LLM_QUOTA_RPS).toBe(3000);
  });

  it("provisioned pricing scales with the recalibrated capacity (breakeven stays ≈ 35%)", () => {
    expect(LLM_COST_PER_DEPLOYMENT_HOUR_USD).toBe(300);
    // A medium deployment at full tilt pay-per-call ≈ $864/h, so provisioned
    // breaks even at ~35% utilization — the 111 teaching story is preserved.
    const fullTiltPerHour = BENCHMARKS.llm.baseCapacity * LLM_COST_PER_CALL_USD * 3600;
    const breakeven = LLM_COST_PER_DEPLOYMENT_HOUR_USD / fullTiltPerHour;
    expect(breakeven).toBeGreaterThan(0.3);
    expect(breakeven).toBeLessThan(0.4);
  });

  it("a semantic-cache hit costs an embedding call, not a key-value read", () => {
    expect(BENCHMARKS.semanticCache.baseLatencyMs).toBe(50);
  });

  it("offers the extra US regions for spreading pools (116 AC3)", () => {
    for (const r of ["us-east", "us-east-2", "us-central", "us-west"]) {
      expect(ARENA_REGIONS).toContain(r);
    }
  });

  it("cites the quota-tier anchor in the LLM copy, both languages (116 AC7)", () => {
    const meta = KIND_META.llm;
    expect(meta.info.en.toLowerCase()).toContain("quota tier");
    expect(meta.info.pt.toLowerCase()).toContain("tier de cota");
    expect(meta.scaling!.sizeMeaning.en).toMatch(/PTU|TPM/);
  });
});

// --- 117-arena-llm-call-shape ----------------------------------------------------

describe("LLM call shape drives capacity, latency, cost and quota (117 AC1–AC3)", () => {
  it("reproduces the 116 anchors exactly at the default shape (2k in + 500 out)", () => {
    expect(DEFAULT_CALL_SHAPE).toEqual({ inputTokens: 2000, outputTokens: 500 });
    expect(llmBaseCapacityFor(DEFAULT_CALL_SHAPE)).toBe(BENCHMARKS.llm.baseCapacity); // 150
    expect(llmBaseLatencyMsFor(DEFAULT_CALL_SHAPE)).toBe(BENCHMARKS.llm.baseLatencyMs); // 800
    expect(llmCostPerCallUsd(DEFAULT_CALL_SHAPE)).toBeCloseTo(LLM_COST_PER_CALL_USD, 6); // $0.0016
    expect(regionalLlmQuotaRpsFor(DEFAULT_CALL_SHAPE)).toBe(REGIONAL_LLM_QUOTA_RPS); // 3000
  });

  it("capacity and quota are TPM-denominated: doubling tokens/call halves both (AC1/AC3)", () => {
    const heavy = { inputTokens: 4000, outputTokens: 1000 }; // 2× the default 2.5k
    expect(llmBaseCapacityFor(heavy)).toBeCloseTo(BENCHMARKS.llm.baseCapacity / 2, 5);
    expect(regionalLlmQuotaRpsFor(heavy)).toBeCloseTo(REGIONAL_LLM_QUOTA_RPS / 2, 5);
  });

  it("latency grows linearly with output (decode) and input (prefill) tokens (AC2)", () => {
    const base = llmBaseLatencyMsFor(DEFAULT_CALL_SHAPE);
    const moreOut = llmBaseLatencyMsFor({ inputTokens: 2000, outputTokens: 1500 });
    const evenMoreOut = llmBaseLatencyMsFor({ inputTokens: 2000, outputTokens: 2500 });
    expect(moreOut).toBeGreaterThan(base);
    // linear: equal token increments add equal latency increments
    expect(evenMoreOut - moreOut).toBeCloseTo(moreOut - base, 5);
    const moreIn = llmBaseLatencyMsFor({ inputTokens: 10_000, outputTokens: 500 });
    expect(moreIn).toBeGreaterThan(base);
  });

  it("cost follows the published per-token prices (AC3)", () => {
    // 10k in + 1k out at $0.40/M in + $1.60/M out = $0.004 + $0.0016 = $0.0056
    expect(llmCostPerCallUsd({ inputTokens: 10_000, outputTokens: 1000 })).toBeCloseTo(0.0056, 6);
  });

  it("exposes sane editable bounds for the control-bar sliders (AC6)", () => {
    expect(CALL_SHAPE_BOUNDS.inputTokens.min).toBeLessThanOrEqual(DEFAULT_CALL_SHAPE.inputTokens);
    expect(CALL_SHAPE_BOUNDS.inputTokens.max).toBeGreaterThanOrEqual(8000); // big system prompts + history
    expect(CALL_SHAPE_BOUNDS.outputTokens.min).toBeLessThanOrEqual(DEFAULT_CALL_SHAPE.outputTokens);
    expect(CALL_SHAPE_BOUNDS.outputTokens.max).toBeGreaterThanOrEqual(2000);
  });
});

// --- 123-arena-agent-harness-node -------------------------------------------------

describe("123 — the agent harness component (AC1, AC2)", () => {
  it("is a palette kind with a latency-0, capacity-∞ benchmark", () => {
    expect(PALETTE_ORDER).toContain("agentHarness");
    expect(BENCHMARKS.agentHarness.baseLatencyMs).toBe(0);
    expect(BENCHMARKS.agentHarness.baseCapacity).toBeGreaterThanOrEqual(1_000_000);
  });

  it("is non-scalable (no scaling vocabulary — like the client)", () => {
    expect(KIND_META.agentHarness.scaling).toBeNull();
  });

  it("is excluded from routing, caching, fan-out config and the stream budget", () => {
    expect(splitsLoad("agentHarness")).toBe(false);
    expect(isCacheLike("agentHarness")).toBe(false);
    expect(CALLS_CONFIGURABLE.has("agentHarness")).toBe(false);
    expect(CONCURRENCY_BUDGET_PER_UNIT.agentHarness).toBeUndefined();
  });
});
