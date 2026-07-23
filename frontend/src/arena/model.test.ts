// 100-arena-capacity-sandbox — the pure capacity model (AC1–AC7).
//
// These assert the analytical model directly, with no DOM: given a design + an
// offered load, `computeMetrics` returns per-node QPS / utilization / latency /
// status. Numbers are read from the benchmark catalog so the tests stay robust
// to tuning the raw figures — they pin the *behaviour*, not magic constants.

import { describe, expect, it } from "vitest";

import { BENCHMARKS, SIZE_MULTIPLIER } from "./components";
import { computeMetrics, effectiveCapacity, type ArenaDesign } from "./model";

const n = (id: string, kind: Parameters<typeof effectiveCapacity>[0]["kind"], extra = {}) => ({
  id,
  kind,
  size: "medium" as const,
  replicas: 1,
  ...extra,
});
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

describe("arena capacity model — single node (AC1)", () => {
  it("caps throughput at capacity and flags a bottleneck when offered load exceeds it", () => {
    const cap = BENCHMARKS.llm.baseCapacity; // e.g. 50 rps/replica
    const design: ArenaDesign = { nodes: [n("a", "llm")], edges: [] };

    const under = computeMetrics(design, cap / 2).get("a")!;
    expect(under.throughput).toBe(cap / 2);
    expect(under.utilization).toBeCloseTo(0.5, 5);
    expect(under.status).toBe("healthy");
    expect(under.bottleneck).toBe(false);

    const over = computeMetrics(design, cap * 4).get("a")!;
    expect(over.arriving).toBe(cap * 4);
    expect(over.throughput).toBe(cap); // collapses to capacity — no phantom over-capacity
    expect(over.utilization).toBeCloseTo(4, 5);
    expect(over.status).toBe("critical");
    expect(over.bottleneck).toBe(true);
  });
});

describe("arena capacity model — propagation through a path (AC2)", () => {
  it("collapses downstream flow to a saturated node's capacity", () => {
    // backend (cap high) -> llm (cap tiny) -> appDb : the llm is the wall.
    const design: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm"), n("db", "appDb")],
      edges: [e("be", "llm"), e("llm", "db")],
    };
    const L = BENCHMARKS.backend.baseCapacity; // saturate backend exactly (util 1.0)
    const m = computeMetrics(design, L);

    expect(m.get("llm")!.arriving).toBe(L); // full backend throughput reaches the llm
    expect(m.get("llm")!.throughput).toBe(BENCHMARKS.llm.baseCapacity); // llm caps it
    expect(m.get("llm")!.bottleneck).toBe(true);
    // the DB only sees what survived the llm — NOT the original offered load.
    expect(m.get("db")!.arriving).toBe(BENCHMARKS.llm.baseCapacity);
    expect(m.get("db")!.arriving).toBeLessThan(L);
  });

  it("marks nodes in a cycle unreachable rather than looping", () => {
    const design: ArenaDesign = {
      nodes: [n("a", "backend"), n("b", "backend")],
      edges: [e("a", "b"), e("b", "a")],
    };
    const m = computeMetrics(design, 100);
    expect(m.get("a")!.status).toBe("unreachable");
    expect(m.get("b")!.status).toBe("unreachable");
  });
});

describe("arena capacity model — load balancer split vs. fan-out (AC3)", () => {
  it("splits load evenly across a load balancer's children", () => {
    const design: ArenaDesign = {
      nodes: [n("lb", "loadBalancer"), n("b1", "backend"), n("b2", "backend")],
      edges: [e("lb", "b1"), e("lb", "b2")],
    };
    const L = 1000;
    const m = computeMetrics(design, L);
    expect(m.get("b1")!.arriving).toBeCloseTo(L / 2, 5);
    expect(m.get("b2")!.arriving).toBeCloseTo(L / 2, 5);
  });

  it("fans out the full load to each child of a non-LB node", () => {
    const design: ArenaDesign = {
      nodes: [n("be", "backend"), n("db1", "appDb"), n("db2", "appDb")],
      edges: [e("be", "db1"), e("be", "db2")],
    };
    const L = 1000; // below backend capacity so its throughput == L
    const m = computeMetrics(design, L);
    expect(m.get("db1")!.arriving).toBeCloseTo(L, 5);
    expect(m.get("db2")!.arriving).toBeCloseTo(L, 5);
  });
});

describe("arena capacity model — scaling (AC4 horizontal, AC5 vertical)", () => {
  it("horizontal scaling raises capacity to ~k×C and clears the bottleneck", () => {
    const cap = BENCHMARKS.llm.baseCapacity;
    const L = cap * 2 + 1; // over capacity at 1 replica
    const one: ArenaDesign = { nodes: [n("a", "llm")], edges: [] };
    expect(computeMetrics(one, L).get("a")!.status).toBe("critical");

    const three: ArenaDesign = { nodes: [n("a", "llm", { replicas: 3 })], edges: [] };
    const m = computeMetrics(three, L).get("a")!;
    expect(m.capacity).toBeCloseTo(cap * 3, 5);
    expect(m.status).not.toBe("critical"); // k×C ≥ L
  });

  it("vertical scaling raises per-replica capacity by the size multiplier", () => {
    const cap = BENCHMARKS.llm.baseCapacity;
    const medium = effectiveCapacity(n("a", "llm"));
    const large = effectiveCapacity(n("a", "llm", { size: "large" }));
    expect(medium).toBeCloseTo(cap * SIZE_MULTIPLIER.medium, 5);
    expect(large).toBeCloseTo(cap * SIZE_MULTIPLIER.large, 5);
    expect(large).toBeGreaterThan(medium);
  });
});

describe("arena capacity model — cache re-routes load (AC6)", () => {
  it("a cache forwards only the miss fraction (1 - hitRatio) to the database", () => {
    const L = 1000;
    const direct: ArenaDesign = {
      nodes: [n("be", "backend"), n("db", "appDb")],
      edges: [e("be", "db")],
    };
    const directDb = computeMetrics(direct, L).get("db")!;

    const cached: ArenaDesign = {
      nodes: [n("be", "backend"), n("cache", "cache", { hitRatio: 0.8 }), n("db", "appDb")],
      edges: [e("be", "cache"), e("cache", "db")],
    };
    const cachedDb = computeMetrics(cached, L).get("db")!;

    expect(cachedDb.arriving).toBeCloseTo(L * 0.2, 5); // only misses reach the DB
    expect(cachedDb.arriving).toBeLessThan(directDb.arriving);
    expect(cachedDb.utilization).toBeLessThan(directDb.utilization);
  });
});

describe("arena capacity model — queueing latency (AC7)", () => {
  it("latency rises monotonically with utilization and spikes near saturation", () => {
    const cap = BENCHMARKS.backend.baseCapacity;
    const design: ArenaDesign = { nodes: [n("a", "backend")], edges: [] };
    const low = computeMetrics(design, cap * 0.1).get("a")!.latencyMs;
    const mid = computeMetrics(design, cap * 0.5).get("a")!.latencyMs;
    const high = computeMetrics(design, cap * 0.9).get("a")!.latencyMs;

    expect(low).toBeGreaterThanOrEqual(BENCHMARKS.backend.baseLatencyMs);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });
});
