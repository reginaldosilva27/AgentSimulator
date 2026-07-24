// 100-arena-capacity-sandbox — the pure capacity model (AC1–AC7).
//
// These assert the analytical model directly, with no DOM: given a design + an
// offered load, `computeMetrics` returns per-node QPS / utilization / latency /
// status. Numbers are read from the benchmark catalog so the tests stay robust
// to tuning the raw figures — they pin the *behaviour*, not magic constants.

import { describe, expect, it } from "vitest";

import {
  BENCHMARKS,
  CONCURRENCY_BUDGET_PER_UNIT,
  CROSS_REGION_LATENCY_MS,
  DEFAULT_CALL_SHAPE,
  LLM_COST_PER_CALL_USD,
  LLM_COST_PER_DEPLOYMENT_HOUR_USD,
  REGIONAL_LLM_QUOTA_RPS,
  ROUTING_TAX_CAP,
  ROUTING_TAX_RATE,
  SIZE_MULTIPLIER,
} from "./components";
import {
  computeMetrics,
  concurrencyBudgetFor,
  concurrencyPressure,
  concurrencyStatusFor,
  effectiveCapacity,
  endToEndLatencyMs,
  equilibriumRps,
  fanOutFor,
  heldInFlight,
  llmCost,
  routingTaxFor,
  turnPathLatenciesMs,
  worseStatus,
  type ArenaDesign,
} from "./model";

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
    const cap = BENCHMARKS.llm.baseCapacity; // 150 calls/s per medium deployment
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

// --- 103-arena-realism ------------------------------------------------------

describe("calls-per-request fan-out (103 AC2)", () => {
  it("multiplies the load arriving at a node by its callsPerRequest", () => {
    // An agent turn makes ~3 model calls: 100 user req/s → 300 LLM calls/s.
    const design: ArenaDesign = {
      nodes: [
        n("be", "backend"),
        n("llm", "llm", { callsPerRequest: 3, replicas: 10 }), // cap 1,500
      ],
      edges: [e("be", "llm")],
    };
    const m = computeMetrics(design, 100);
    expect(m.get("llm")!.arriving).toBe(300); // 100 requests × 3 calls
    expect(m.get("llm")!.utilization).toBeCloseTo(300 / 1500, 5);
  });
});

describe("load enters only at client nodes (103 AC3)", () => {
  it("gives an orphan node 0 load when a client source exists", () => {
    const design: ArenaDesign = {
      nodes: [n("c", "client"), n("be", "backend"), n("stray", "cache")],
      edges: [e("c", "be")], // "stray" is unwired
    };
    const m = computeMetrics(design, 1000);
    expect(m.get("be")!.arriving).toBe(1000); // via the client
    expect(m.get("stray")!.arriving).toBe(0); // orphan idles honestly
  });

  it("falls back to all roots when no client node exists (back-compat)", () => {
    const design: ArenaDesign = { nodes: [n("be", "backend")], edges: [] };
    expect(computeMetrics(design, 500).get("be")!.arriving).toBe(500);
  });
});

describe("honest overload — shed rate (103 AC4)", () => {
  it("reports the shed req/s past capacity (and 0 when healthy)", () => {
    const cap = BENCHMARKS.llm.baseCapacity;
    const design: ArenaDesign = { nodes: [n("a", "llm")], edges: [] };
    expect(computeMetrics(design, cap * 3).get("a")!.shedRps).toBeCloseTo(cap * 2, 5);
    expect(computeMetrics(design, cap / 2).get("a")!.shedRps).toBe(0);
  });
});

describe("end-to-end latency (103 AC5)", () => {
  it("sums node latencies along the critical (longest) path", () => {
    const design: ArenaDesign = {
      nodes: [n("c", "client"), n("be", "backend"), n("llm", "llm", { replicas: 10 })],
      edges: [e("c", "be"), e("be", "llm")],
    };
    const L = 100; // light load, so latencies ≈ base/(1-u) per node
    const m = computeMetrics(design, L);
    const expected =
      m.get("c")!.latencyMs + m.get("be")!.latencyMs + m.get("llm")!.latencyMs;
    expect(endToEndLatencyMs(design, L)).toBeCloseTo(expected, 5);
  });

  // 109 AC3 — superseded 103 behaviour: the backend ORCHESTRATES the turn, so its
  // branches happen in sequence (retrieve → generate) and SUM, not max().
  it("sums the backend's branches — an agent turn runs them in sequence (109 AC3)", () => {
    const design: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm", { replicas: 10 }), n("db", "appDb")],
      edges: [e("be", "llm"), e("be", "db")],
    };
    const L = 100;
    const m = computeMetrics(design, L);
    expect(endToEndLatencyMs(design, L)).toBeCloseTo(
      m.get("be")!.latencyMs + m.get("llm")!.latencyMs + m.get("db")!.latencyMs,
      5,
    );
  });
});

// --- 109-arena-agent-latency --------------------------------------------------

describe("agent-turn latency — cpr serializes model calls (109 AC1/AC2)", () => {
  it("charges k × the model's queued latency for callsPerRequest = k", () => {
    const e2eFor = (k: number) => {
      const design: ArenaDesign = {
        nodes: [
          n("c", "client"),
          n("be", "backend"),
          n("llm", "llm", { callsPerRequest: k, replicas: 10 }),
        ],
        edges: [e("c", "be"), e("be", "llm")],
      };
      const m = computeMetrics(design, 100);
      return {
        got: endToEndLatencyMs(design, 100),
        want: m.get("c")!.latencyMs + m.get("be")!.latencyMs + k * m.get("llm")!.latencyMs,
      };
    };
    for (const k of [1, 2, 3]) {
      const { got, want } = e2eFor(k);
      expect(got, `cpr=${k}`).toBeCloseTo(want, 5);
    }
  });

  it("cpr on a router multiplies the whole routed branch (gateway + model, no double count)", () => {
    const design: ArenaDesign = {
      nodes: [
        n("c", "client"),
        n("be", "backend"),
        n("gw", "aiGateway", { callsPerRequest: 2 }),
        n("llm", "llm", { replicas: 10 }),
      ],
      edges: [e("c", "be"), e("be", "gw"), e("gw", "llm")],
    };
    const m = computeMetrics(design, 100);
    expect(endToEndLatencyMs(design, 100)).toBeCloseTo(
      m.get("c")!.latencyMs +
        m.get("be")!.latencyMs +
        2 * (m.get("gw")!.latencyMs + m.get("llm")!.latencyMs),
      5,
    );
  });

  it("a router's pools stay parallel alternatives — slowest pool, never the sum (109 AC3)", () => {
    const design: ArenaDesign = {
      nodes: [
        n("lb", "loadBalancer"),
        n("big", "llm", { replicas: 10 }), // low util → fast
        n("small", "llm", { replicas: 2 }), // higher util → slower
      ],
      edges: [e("lb", "big"), e("lb", "small")],
    };
    const L = 100; // split 50/50 by the LB
    const m = computeMetrics(design, L);
    const slowest = Math.max(m.get("big")!.latencyMs, m.get("small")!.latencyMs);
    expect(endToEndLatencyMs(design, L)).toBeCloseTo(m.get("lb")!.latencyMs + slowest, 5);
  });
});

// --- 110-arena-closed-loop ----------------------------------------------------

describe("closed-loop equilibrium (110 AC1–AC3, AC5)", () => {
  // The audited scenario (rescaled by 116's calibration): 122,300 users ·
  // think 20s · 3 LLM pools (large ×5 = 4,500 calls/s total) behind an AI
  // Gateway — open-loop the demand (6,115 rps) reads 136%, dropping; a closed
  // population self-throttles to ~4,100 rps instead of shedding.
  const auditDesign = (): ArenaDesign => ({
    nodes: [
      n("c", "client"),
      n("apigw", "apiGateway"),
      n("lb", "loadBalancer"),
      n("be", "backend", { replicas: 2 }),
      n("gw", "aiGateway", { replicas: 2 }),
      // One pool per region — each under the regional quota (1,500 ≤ 3,000),
      // so 114's cap does not bite here.
      n("llm1", "llm", { size: "large", replicas: 5, region: "us-east" }),
      n("llm2", "llm", { size: "large", replicas: 5, region: "us-west" }),
      n("llm3", "llm", { size: "large", replicas: 5, region: "eu-west" }),
      n("cache", "cache", { hitRatio: 0.8 }),
      n("vdb", "vectorDb"),
    ],
    edges: [
      e("c", "apigw"),
      e("apigw", "lb"),
      e("lb", "be"),
      e("be", "gw"),
      e("gw", "llm1"),
      e("gw", "llm2"),
      e("gw", "llm3"),
      e("be", "cache"),
      e("cache", "vdb"),
    ],
  });
  const tinyFleet = (): ArenaDesign => ({
    nodes: [n("c", "client"), n("be", "backend"), n("llm", "llm")],
    edges: [e("c", "be"), e("be", "llm")],
  });

  it("AC1 — converges to a deterministic fixed point (residual ≤ 1 req/s)", () => {
    const d = auditDesign();
    const rps = equilibriumRps(d, 122_300, 20);
    const latSec = endToEndLatencyMs(d, rps) / 1000;
    expect(Math.abs(rps - 122_300 / (20 + latSec))).toBeLessThanOrEqual(1);
    expect(equilibriumRps(d, 122_300, 20)).toBe(rps); // same inputs → same output
  });

  it("AC2 — the audited 122k-user design self-throttles instead of shedding", () => {
    const d = auditDesign();
    const rps = equilibriumRps(d, 122_300, 20);
    expect(rps).toBeGreaterThanOrEqual(3_900);
    expect(rps).toBeLessThanOrEqual(4_300);
    const m = computeMetrics(d, rps);
    for (const id of ["llm1", "llm2", "llm3"]) {
      expect(m.get(id)!.utilization, `${id} util`).toBeGreaterThanOrEqual(0.87);
      expect(m.get(id)!.utilization, `${id} util`).toBeLessThanOrEqual(0.95);
      expect(m.get(id)!.shedRps, `${id} shed`).toBe(0);
    }
  });

  it("AC3 — Little's invariant: in-flight never exceeds the user population", () => {
    const cases: Array<{ d: ArenaDesign; users: number; think: number }> = [
      { d: auditDesign(), users: 122_300, think: 20 },
      { d: auditDesign(), users: 200_000, think: 10 },
      { d: tinyFleet(), users: 10_000, think: 5 },
      { d: tinyFleet(), users: 3_000, think: 30 },
    ];
    for (const { d, users, think } of cases) {
      const rps = equilibriumRps(d, users, think);
      const latSec = endToEndLatencyMs(d, rps) / 1000;
      expect(rps * latSec, `users=${users} think=${think}`).toBeLessThanOrEqual(users);
    }
  });

  it("AC5 — a fleet small enough still saturates at equilibrium (shed > 0)", () => {
    const d = tinyFleet();
    const rps = equilibriumRps(d, 20_000, 5);
    expect(computeMetrics(d, rps).get("llm")!.shedRps).toBeGreaterThan(0);
  });

  it("degenerates to Little's demand on an empty canvas / zero users", () => {
    expect(equilibriumRps({ nodes: [], edges: [] }, 60_000, 30)).toBeCloseTo(2_000, 5);
    expect(equilibriumRps(auditDesign(), 0, 20)).toBe(0);
  });
});

describe("client-side LLM routing tax (105 AC1–AC3)", () => {
  const beCap = BENCHMARKS.backend.baseCapacity;

  it("taxes a non-router node per directly-managed LLM deployment beyond the first (AC1)", () => {
    const one: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm")],
      edges: [e("be", "llm")],
    };
    expect(routingTaxFor(one, "be").tax).toBe(0); // D=1 → no tax

    const twenty: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm", { replicas: 20 })],
      edges: [e("be", "llm")],
    };
    const t20 = routingTaxFor(twenty, "be");
    expect(t20.deployments).toBe(20);
    expect(t20.tax).toBeCloseTo(Math.min(ROUTING_TAX_CAP, ROUTING_TAX_RATE * 19), 6);
    // capacity in the metrics reflects the tax
    const m = computeMetrics(twenty, 100);
    expect(m.get("be")!.capacity).toBeCloseTo(beCap * (1 - t20.tax), 5);
    expect(m.get("be")!.routingTax).toBeCloseTo(t20.tax, 6);
  });

  it("utilization rises monotonically as the backend manages more deployments (AC2)", () => {
    const util = (replicas: number) => {
      const d: ArenaDesign = {
        nodes: [n("be", "backend"), n("llm", "llm", { replicas })],
        edges: [e("be", "llm")],
      };
      return computeMetrics(d, 1000).get("be")!.utilization;
    };
    expect(util(5)).toBeGreaterThan(util(1));
    expect(util(20)).toBeGreaterThan(util(5));
  });

  it("an AI Gateway in between removes the backend's tax; routers are exempt (AC3)", () => {
    const gated: ArenaDesign = {
      nodes: [n("be", "backend"), n("gw", "aiGateway"), n("llm", "llm", { replicas: 20 })],
      edges: [e("be", "gw"), e("gw", "llm")],
    };
    expect(routingTaxFor(gated, "be").tax).toBe(0); // the gateway holds the endpoints now
    expect(routingTaxFor(gated, "gw").tax).toBe(0); // purpose-built router — exempt
    const m = computeMetrics(gated, 100);
    expect(m.get("be")!.capacity).toBeCloseTo(beCap, 5); // untaxed again
  });
});

// --- 114-arena-regional-quota ---------------------------------------------------

describe("regional LLM quota (114 AC1–AC3)", () => {
  // 116 recalibration: fixtures are sized relative to the constants — one pool
  // fits under the quota; stacking pools in a region overflows it.
  const POOL_RAW = 1500; // large ×5 = 300 × 5 (≤ the 3,000 quota on its own)
  const pool = (id: string, region?: string, replicas = 5) =>
    n(id, "llm", { size: "large" as const, replicas, ...(region ? { region } : {}) });

  const behindGateway = (llms: ReturnType<typeof pool>[]): ArenaDesign => ({
    nodes: [n("gw", "aiGateway"), ...llms],
    edges: llms.map((l) => e("gw", l.id)),
  });

  it("AC1 — an over-quota region is squeezed proportionally to exactly the quota", () => {
    // 15 large deployments (raw 4,500 calls/s) stacked in ONE region.
    const d = behindGateway([
      pool("a", "us-east"),
      pool("b", "us-east"),
      pool("c", "us-east"),
    ]);
    const m = computeMetrics(d, 100);
    const total = ["a", "b", "c"].reduce((s, id) => s + m.get(id)!.capacity, 0);
    expect(total).toBeCloseTo(REGIONAL_LLM_QUOTA_RPS, 5);
    const factor = REGIONAL_LLM_QUOTA_RPS / (3 * POOL_RAW);
    for (const id of ["a", "b", "c"]) {
      expect(m.get(id)!.quotaFactor).toBeCloseTo(factor, 5);
      expect(m.get(id)!.capacity).toBeCloseTo(POOL_RAW * factor, 5);
    }
  });

  it("AC1 — a region at/below quota is untouched (byte-for-byte)", () => {
    const d = behindGateway([pool("a", "us-east")]); // raw 1,500 ≤ 3,000
    const m = computeMetrics(d, 100);
    expect(m.get("a")!.quotaFactor).toBe(1);
    expect(m.get("a")!.capacity).toBeCloseTo(POOL_RAW, 5);
  });

  it("AC3 — unassigned pools share one implicit quota pool (the cap can't be dodged)", () => {
    // Two ×6 pools (raw 3,600), no region badges — still one shared cap.
    const d = behindGateway([pool("a", undefined, 6), pool("b", undefined, 6)]);
    const m = computeMetrics(d, 100);
    const factor = REGIONAL_LLM_QUOTA_RPS / 3600;
    expect(m.get("a")!.quotaFactor).toBeCloseTo(factor, 5);
    expect(m.get("b")!.capacity).toBeCloseTo(1800 * factor, 5);
  });

  it("AC2 — spreading the same fleet across regions raises the aggregate ceiling", () => {
    const stacked = behindGateway([
      pool("a", "us-east"),
      pool("b", "us-east"),
      pool("c", "us-east"),
    ]);
    const spread = behindGateway([
      pool("a", "us-east"),
      pool("b", "eu-west"),
      pool("c", "sa-east"),
    ]);
    const capOf = (d: ArenaDesign) => {
      const m = computeMetrics(d, 100);
      return ["a", "b", "c"].reduce((s, id) => s + m.get(id)!.capacity, 0);
    };
    expect(capOf(stacked)).toBeCloseTo(REGIONAL_LLM_QUOTA_RPS, 5);
    expect(capOf(spread)).toBeCloseTo(3 * POOL_RAW, 5); // each region under its own quota
  });
});

describe("cross-region hop latency (114 AC5)", () => {
  const design = (beRegion?: string, llmRegion?: string): ArenaDesign => ({
    nodes: [
      n("c", "client"),
      n("be", "backend", beRegion ? { region: beRegion } : {}),
      n("llm", "llm", { replicas: 10, ...(llmRegion ? { region: llmRegion } : {}) }),
    ],
    edges: [e("c", "be"), e("be", "llm")],
  });

  it("adds the penalty only when both endpoints declare different regions", () => {
    const L = 100;
    const base = (d: ArenaDesign) => {
      const m = computeMetrics(d, L);
      return m.get("c")!.latencyMs + m.get("be")!.latencyMs + m.get("llm")!.latencyMs;
    };
    const cross = design("us-east", "eu-west");
    expect(endToEndLatencyMs(cross, L)).toBeCloseTo(base(cross) + CROSS_REGION_LATENCY_MS, 5);

    const same = design("us-east", "us-east");
    expect(endToEndLatencyMs(same, L)).toBeCloseTo(base(same), 5);

    const unregioned = design(undefined, "eu-west");
    expect(endToEndLatencyMs(unregioned, L)).toBeCloseTo(base(unregioned), 5);
  });
});

// --- 113-arena-inflight-metric --------------------------------------------------

describe("held in-flight — Little's Law per node (113 AC1/AC2/AC4)", () => {
  it("AC1 — an orchestrator holds requests for its own latency PLUS the awaited turn", () => {
    const design: ArenaDesign = {
      nodes: [
        n("c", "client"),
        n("be", "backend"),
        n("llm", "llm", { callsPerRequest: 2, replicas: 10 }),
      ],
      edges: [e("c", "be"), e("be", "llm")],
    };
    const L = 100;
    const m = computeMetrics(design, L);
    const held = heldInFlight(design, L);
    // Leaf: per-call service time only — throughput already counts each call.
    expect(held.get("llm")).toBeCloseTo(
      (m.get("llm")!.throughput * m.get("llm")!.latencyMs) / 1000,
      5,
    );
    // Orchestrator: held for its own latency + the 2 serialized model calls.
    expect(held.get("be")).toBeCloseTo(
      (m.get("be")!.throughput * (m.get("be")!.latencyMs + 2 * m.get("llm")!.latencyMs)) / 1000,
      5,
    );
  });

  it("AC1 — a backend with two branches holds for the SUM of both awaited branches", () => {
    const design: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm", { replicas: 10 }), n("db", "appDb")],
      edges: [e("be", "llm"), e("be", "db")],
    };
    const L = 100;
    const m = computeMetrics(design, L);
    const held = heldInFlight(design, L);
    expect(held.get("be")).toBeCloseTo(
      (m.get("be")!.throughput *
        (m.get("be")!.latencyMs + m.get("llm")!.latencyMs + m.get("db")!.latencyMs)) /
        1000,
      5,
    );
  });

  it("AC2 — a saturated awaited path yields — (null), never a clamped-latency figure", () => {
    const design: ArenaDesign = {
      nodes: [n("be", "backend"), n("llm", "llm"), n("db", "appDb")],
      edges: [e("be", "llm"), e("be", "db")],
    };
    const held = heldInFlight(design, 200); // llm (cap 150) sheds
    expect(held.get("llm")).toBeNull(); // its own queue figure would be fiction
    expect(held.get("be")).toBeNull(); // it awaits the saturated model
    expect(held.get("db")).not.toBeNull(); // the healthy sibling still reports
  });

  it("AC4 — at the closed-loop equilibrium, the client never holds more than the population", () => {
    const design: ArenaDesign = {
      nodes: [n("c", "client"), n("be", "backend"), n("llm", "llm", { replicas: 20 })],
      edges: [e("c", "be"), e("be", "llm")],
    };
    const users = 50_000;
    const rps = equilibriumRps(design, users, 20);
    const held = heldInFlight(design, rps);
    const atClient = held.get("c");
    expect(atClient).not.toBeNull();
    expect(atClient!).toBeLessThanOrEqual(users);
  });
});

// --- 112-arena-semantic-cache ---------------------------------------------------

describe("semantic cache shields the model (112 AC2/AC3)", () => {
  it("forwards only misses at its default 0.25 hit ratio — the LLM sees 25% fewer turns", () => {
    const withCache: ArenaDesign = {
      nodes: [
        n("be", "backend"),
        n("sc", "semanticCache"),
        n("llm", "llm", { callsPerRequest: 2, replicas: 10 }),
      ],
      edges: [e("be", "sc"), e("sc", "llm")],
    };
    const m = computeMetrics(withCache, 100);
    // cpr composes on the MISSES: 100 turns × 0.75 miss × 2 calls = 150 calls/s.
    expect(m.get("llm")!.arriving).toBeCloseTo(100 * 0.75 * 2, 5);
  });

  it("keeps the key-value cache's default at 0.8 and honours an edited hit ratio", () => {
    const kv: ArenaDesign = {
      nodes: [n("be", "backend"), n("c", "cache"), n("db", "appDb")],
      edges: [e("be", "c"), e("c", "db")],
    };
    expect(computeMetrics(kv, 100).get("db")!.arriving).toBeCloseTo(20, 5);

    const tuned: ArenaDesign = {
      nodes: [
        n("be", "backend"),
        n("sc", "semanticCache", { hitRatio: 0.3 }),
        n("llm", "llm", { replicas: 10 }),
      ],
      edges: [e("be", "sc"), e("sc", "llm")],
    };
    expect(computeMetrics(tuned, 100).get("llm")!.arriving).toBeCloseTo(70, 5);
  });
});

// --- 111-arena-provisioned-cost -----------------------------------------------

describe("LLM cost — provisioned + usage (111 AC1/AC2/AC4)", () => {
  const fleet = (replicas: number, size: "medium" | "large" = "medium"): ArenaDesign => ({
    nodes: [n("c", "client"), n("be", "backend"), n("llm", "llm", { replicas, size })],
    edges: [e("c", "be"), e("be", "llm")],
  });

  it("AC1 — provisioned bills replicas × size × rate, independent of load; usage bills served calls", () => {
    const d = fleet(4, "large");
    const low = llmCost(d, 10);
    const high = llmCost(d, 100);
    const provisioned = 4 * SIZE_MULTIPLIER.large * LLM_COST_PER_DEPLOYMENT_HOUR_USD;
    expect(low.provisionedPerHour).toBeCloseTo(provisioned, 5);
    expect(high.provisionedPerHour).toBeCloseTo(provisioned, 5); // load-independent
    const served = computeMetrics(d, 100).get("llm")!.throughput;
    expect(high.usagePerHour).toBeCloseTo(served * LLM_COST_PER_CALL_USD * 3600, 5);
    expect(high.usagePerHour).toBeGreaterThan(low.usagePerHour);
  });

  it("AC2 — an idle fleet still bills its provisioned capacity", () => {
    const { provisionedPerHour, usagePerHour } = llmCost(fleet(6), 0);
    expect(provisionedPerHour).toBeCloseTo(6 * LLM_COST_PER_DEPLOYMENT_HOUR_USD, 5);
    expect(usagePerHour).toBe(0);
  });

  it("AC4 — the trade-off is real: break-even ≈ 35% utilization for a medium deployment", () => {
    const d = fleet(1);
    const cap = BENCHMARKS.llm.baseCapacity;
    const at = (util: number) => llmCost(d, cap * util);
    // At ~35% utilization the usage bill crosses the provisioned bill.
    expect(at(0.3).usagePerHour).toBeLessThan(at(0.3).provisionedPerHour);
    expect(at(0.4).usagePerHour).toBeGreaterThan(at(0.4).provisionedPerHour);
  });
});

// --- 108-arena-saturation-honesty --------------------------------------------

describe("status turns critical at 90% utilization (108 AC3)", () => {
  const cap = BENCHMARKS.backend.baseCapacity;
  const design: ArenaDesign = { nodes: [n("a", "backend")], edges: [] };
  const at = (util: number) => computeMetrics(design, cap * util).get("a")!;

  it("is critical from 90% up — near-saturation is the worst operating point", () => {
    expect(at(0.9).status).toBe("critical");
    expect(at(0.95).status).toBe("critical");
    // …but it is NOT a bottleneck below 100%: nothing is being shed yet.
    expect(at(0.9).bottleneck).toBe(false);
    expect(at(0.9).shedRps).toBe(0);
  });

  it("keeps warning between 70% and 90%, healthy below 70%", () => {
    expect(at(0.89).status).toBe("warning");
    expect(at(0.7).status).toBe("warning");
    expect(at(0.69).status).toBe("healthy");
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

// --- 117-arena-llm-call-shape ----------------------------------------------------

describe("call shape threads through the model (117 AC4)", () => {
  const design = (): ArenaDesign => ({
    nodes: [n("client", "client"), n("backend", "backend"), n("llm", "llm", { callsPerRequest: 2 })],
    edges: [e("client", "backend"), e("backend", "llm")],
  });

  it("a design with no callShape behaves byte-for-byte like the explicit default", () => {
    const load = 60;
    const bare = computeMetrics(design(), load);
    const explicit = computeMetrics({ ...design(), callShape: DEFAULT_CALL_SHAPE }, load);
    for (const id of ["client", "backend", "llm"]) {
      expect(explicit.get(id)!).toEqual(bare.get(id)!);
    }
    expect(endToEndLatencyMs({ ...design(), callShape: DEFAULT_CALL_SHAPE }, load)).toBe(
      endToEndLatencyMs(design(), load),
    );
    expect(equilibriumRps({ ...design(), callShape: DEFAULT_CALL_SHAPE }, 2000, 20)).toBe(
      equilibriumRps(design(), 2000, 20),
    );
  });

  it("a heavier payload squeezes the LLM tier: less capacity, more latency, more cost", () => {
    const heavy = { inputTokens: 8000, outputTokens: 2000 }; // 4× the default 2.5k tokens
    const load = 20;
    const base = computeMetrics(design(), load).get("llm")!;
    const squeezed = computeMetrics({ ...design(), callShape: heavy }, load).get("llm")!;
    expect(squeezed.capacity).toBeCloseTo(base.capacity / 4, 5);
    expect(squeezed.latencyMs).toBeGreaterThan(base.latencyMs);
    const cheap = llmCost(design(), load);
    const pricey = llmCost({ ...design(), callShape: heavy }, load);
    expect(pricey.usagePerHour).toBeGreaterThan(cheap.usagePerHour * 3);
    // provisioned capacity is billed per deployment — shape-independent
    expect(pricey.provisionedPerHour).toBe(cheap.provisionedPerHour);
  });

  it("effectiveCapacity accepts a shape for LLM nodes and ignores it elsewhere", () => {
    const heavy = { inputTokens: 8000, outputTokens: 2000 };
    expect(effectiveCapacity(n("x", "llm"), heavy)).toBeCloseTo(
      BENCHMARKS.llm.baseCapacity / 4,
      5,
    );
    expect(effectiveCapacity(n("x", "backend"), heavy)).toBe(BENCHMARKS.backend.baseCapacity);
  });
});

// --- 118-arena-backend-concurrency ------------------------------------------------

describe("backend concurrency wall (118 AC1–AC3)", () => {
  it("budgets held streams per container × size × containers, and only where stated (AC1)", () => {
    expect(concurrencyBudgetFor(n("b", "backend"))).toBe(
      CONCURRENCY_BUDGET_PER_UNIT.backend!,
    );
    expect(concurrencyBudgetFor(n("b", "backend", { size: "large", replicas: 3 }))).toBe(
      CONCURRENCY_BUDGET_PER_UNIT.backend! * SIZE_MULTIPLIER.large * 3,
    );
    // Kinds without a stated budget have none — no fictional walls.
    expect(concurrencyBudgetFor(n("g", "aiGateway"))).toBeNull();
    expect(concurrencyBudgetFor(n("l", "llm"))).toBeNull();
  });

  it("maps pressure onto the 108 thresholds and stays silent without data (AC2)", () => {
    expect(concurrencyPressure(500, 1000)).toBeCloseTo(0.5, 5);
    expect(concurrencyPressure(null, 1000)).toBeNull(); // shedding path — no figure
    expect(concurrencyPressure(500, null)).toBeNull(); // no budget — no wall
    expect(concurrencyStatusFor(500, 1000)).toBe("healthy");
    expect(concurrencyStatusFor(750, 1000)).toBe("warning");
    expect(concurrencyStatusFor(950, 1000)).toBe("critical");
    expect(concurrencyStatusFor(null, 1000)).toBeNull();
  });

  it("merges by severity: the worse of QPS status and connection pressure wins", () => {
    expect(worseStatus("healthy", "critical")).toBe("critical");
    expect(worseStatus("warning", "healthy")).toBe("warning");
    expect(worseStatus("critical", "warning")).toBe("critical");
    expect(worseStatus("unreachable", "critical")).toBe("unreachable");
  });

  it("the 200k-users review case: a QPS-healthy backend is critical by held streams (AC3)", () => {
    // One medium backend (5,000 req/s of CPU, 2,000 held streams) in front of a
    // big-but-slow LLM pool: nothing sheds, QPS looks green, the wall is real.
    const design: ArenaDesign = {
      nodes: [
        n("client", "client"),
        n("backend", "backend"),
        n("llm", "llm", { size: "xlarge", replicas: 10, callsPerRequest: 2, region: "us-east" }),
      ],
      edges: [e("client", "backend"), e("backend", "llm")],
    };
    const load = 1500; // calls = 3,000 vs 6,000 capacity — util 50%, no shedding
    const m = computeMetrics(design, load).get("backend")!;
    expect(m.status).toBe("healthy"); // QPS lens alone says all green…
    const held = heldInFlight(design, load).get("backend")!;
    const budget = concurrencyBudgetFor(n("backend", "backend"))!;
    expect(held).toBeGreaterThan(budget); // …while it holds > its stream budget
    expect(worseStatus(m.status, concurrencyStatusFor(held, budget)!)).toBe("critical");
  });
});

// --- 123-arena-agent-harness-node -------------------------------------------------
//
// The harness is a non-scalable, latency-0, capacity-∞ orchestration node inserted
// between the backend and its callees. Design A: it changes NO number — it sums its
// children for latency (like the backend) and is transparent to the routing tax.

describe("123 — the agent harness node", () => {
  // base (harness-free) vs. the same design with a pass-through harness inserted.
  const base: ArenaDesign = {
    nodes: [
      n("client", "client"),
      n("backend", "backend"),
      n("llm", "llm", { replicas: 5, callsPerRequest: 2, region: "us-east" }),
      n("vectorDb", "vectorDb", { region: "us-east" }),
    ],
    edges: [e("client", "backend"), e("backend", "llm"), e("backend", "vectorDb")],
  };
  // Reparent backend→{llm,vectorDb} onto the harness; add backend→harness.
  const withHarness: ArenaDesign = {
    nodes: [...base.nodes, n("harness", "agentHarness", { region: "us-east" })],
    edges: [
      e("client", "backend"),
      e("backend", "harness"),
      e("harness", "llm"),
      e("harness", "vectorDb"),
    ],
  };
  const LOAD = 300; // llm sees 600 calls vs 750 cap → healthy, nothing sheds

  it("is never the bottleneck, even under a crushing load (AC2)", () => {
    const crushing = 1_000_000;
    const m = computeMetrics(withHarness, crushing).get("harness")!;
    expect(m.bottleneck).toBe(false);
    expect(m.utilization).toBeLessThan(0.01);
    expect(m.status).toBe("healthy");
  });

  it("has no held-stream budget of its own — the backend carries the wall (AC2)", () => {
    expect(concurrencyBudgetFor(n("harness", "agentHarness"))).toBeNull();
  });

  it("sums its children for turn latency, like the backend (AC4)", () => {
    const paths = turnPathLatenciesMs(withHarness, LOAD);
    // llm path = cpr(2) × 2s base; vectorDb path = its base; harness sums both.
    const llmPath = paths.get("llm")!;
    const vecPath = paths.get("vectorDb")!;
    expect(paths.get("harness")!).toBeCloseTo(llmPath + vecPath, 5);
  });

  it("leaves every other node's metrics + e2e latency identical (AC6, Design A)", () => {
    const mBase = computeMetrics(base, LOAD);
    const mH = computeMetrics(withHarness, LOAD);
    for (const id of ["client", "backend", "llm", "vectorDb"]) {
      expect(mH.get(id)!.arriving, `${id} arriving`).toBeCloseTo(mBase.get(id)!.arriving, 5);
      expect(mH.get(id)!.throughput, `${id} throughput`).toBeCloseTo(mBase.get(id)!.throughput, 5);
      expect(mH.get(id)!.utilization, `${id} util`).toBeCloseTo(mBase.get(id)!.utilization, 5);
      expect(mH.get(id)!.shedRps, `${id} shed`).toBeCloseTo(mBase.get(id)!.shedRps, 5);
    }
    expect(endToEndLatencyMs(withHarness, LOAD)).toBeCloseTo(endToEndLatencyMs(base, LOAD), 5);
  });

  it("keeps the routing tax on the backend (transparent harness), not toothless (AC6)", () => {
    // Backend wired straight to the 5-deployment pool pays the tax.
    expect(routingTaxFor(base, "backend").tax).toBeGreaterThan(0);
    // With the harness in between, the backend STILL pays the same tax…
    expect(routingTaxFor(withHarness, "backend").tax).toBeCloseTo(
      routingTaxFor(base, "backend").tax,
      5,
    );
    expect(routingTaxFor(withHarness, "backend").deployments).toBe(5);
    // …and the harness itself is exempt (it holds no endpoints).
    expect(routingTaxFor(withHarness, "harness").tax).toBe(0);
  });

  it("surfaces the turn fan-out read from its LLM child (AC3)", () => {
    expect(fanOutFor(withHarness, "harness")).toBe(2);
    // reads an AI-Gateway child's fan-out too (fan-out lives on the gateway there).
    const viaGw: ArenaDesign = {
      nodes: [
        n("harness", "agentHarness"),
        n("gw", "aiGateway", { callsPerRequest: 3 }),
        n("llm", "llm"),
      ],
      edges: [e("harness", "gw"), e("gw", "llm")],
    };
    expect(fanOutFor(viaGw, "harness")).toBe(3);
    // null when nothing on the model path is wired yet.
    expect(fanOutFor({ nodes: [n("harness", "agentHarness")], edges: [] }, "harness")).toBeNull();
  });
});

// --- 125-arena-component-expansion — async work behind a queue --------------------

describe("125 — async work behind a queue leaves the turn path (AC2, AC3)", () => {
  // client → backend → queue → worker : the worker drains the queue off the
  // request path, so its service time never reaches the user.
  const asyncDesign = (workerLatencyKind: "worker" = "worker"): ArenaDesign => ({
    nodes: [
      n("client", "client"),
      n("backend", "backend"),
      n("queue", "queue"),
      n("worker", workerLatencyKind),
    ],
    edges: [e("client", "backend"), e("backend", "queue"), e("queue", "worker")],
  });

  it("flags a node reached ONLY through a queue as async", () => {
    const m = computeMetrics(asyncDesign(), 100);
    expect(m.get("worker")!.async).toBe(true);
    expect(m.get("queue")!.async).toBe(false); // enqueue is synchronous
    expect(m.get("backend")!.async).toBe(false);
  });

  it("does NOT flag async when a synchronous path also reaches the node (diamond)", () => {
    // backend → worker (direct, sync) AND backend → queue → worker (async):
    // at least one inbound path is synchronous, so the node is synchronous.
    const design: ArenaDesign = {
      nodes: [n("client", "client"), n("backend", "backend"), n("queue", "queue"), n("worker", "worker")],
      edges: [
        e("client", "backend"),
        e("backend", "queue"),
        e("queue", "worker"),
        e("backend", "worker"),
      ],
    };
    expect(computeMetrics(design, 100).get("worker")!.async).toBe(false);
  });

  it("the async branch's latency does NOT reach the user-facing turn (AC2)", () => {
    // Worker latency is huge; the queue's own enqueue latency is what the user waits on.
    const e2e = endToEndLatencyMs(asyncDesign(), 100);
    // The turn path is backend + queue enqueue, NOT + the worker's 500ms service time.
    const queueLat = BENCHMARKS.queue.baseLatencyMs;
    const backendLat = BENCHMARKS.backend.baseLatencyMs;
    // generous upper bound: everything synchronous, but far below adding the worker's 500ms
    expect(e2e).toBeLessThan(backendLat + queueLat + BENCHMARKS.worker.baseLatencyMs);
    expect(e2e).toBeLessThan(200); // backend(20) + queue(5) region, nowhere near 500
  });

  it("changing the async worker's service time does not move the e2e turn latency", () => {
    // Two designs identical except the worker's replicas (which changes its util →
    // its queue latency). Since the worker is async, e2e is invariant.
    const slow = asyncDesign();
    const fast: ArenaDesign = {
      ...slow,
      nodes: slow.nodes.map((sp) => (sp.id === "worker" ? { ...sp, replicas: 8 } : sp)),
    };
    expect(endToEndLatencyMs(fast, 100)).toBe(endToEndLatencyMs(slow, 100));
  });

  it("an overloaded async consumer does not null the upstream held-in-flight (AC3)", () => {
    // Push load far past the worker's capacity: it would 'shed' if synchronous,
    // which nulls upstream held. Because it's async (backlog, not 429s), the
    // backend's held stays a real number.
    const load = BENCHMARKS.worker.baseCapacity * 5; // crushes the worker
    const held = heldInFlight(asyncDesign(), load);
    expect(held.get("backend"), "backend held is a real number").not.toBeNull();
    // the worker is still over capacity in the raw metrics (backlog grows)
    expect(computeMetrics(asyncDesign(), load).get("worker")!.utilization).toBeGreaterThan(1);
  });

  it("guardrails is a pass-through that adds to the turn path (AC4)", () => {
    // backend → guardrails(leaf) : forwards 100% (no hit ratio) and its latency,
    // times its default fan-out, is added to the turn.
    const design: ArenaDesign = {
      nodes: [n("client", "client"), n("backend", "backend"), n("guard", "guardrails", { callsPerRequest: 2 })],
      edges: [e("client", "backend"), e("backend", "guard")],
    };
    const m = computeMetrics(design, 100);
    // 100 req/s × cpr 2 = 200 calls/s arrive at guardrails (no hit-ratio shaving).
    expect(m.get("guard")!.arriving).toBeCloseTo(200, 5);
    // it is NOT async (no queue in front) — it lengthens the turn.
    expect(m.get("guard")!.async).toBe(false);
    const withGuard = endToEndLatencyMs(design, 100);
    const withoutGuard = endToEndLatencyMs(
      { nodes: design.nodes.filter((sp) => sp.id !== "guard"), edges: [e("client", "backend")] },
      100,
    );
    expect(withGuard).toBeGreaterThan(withoutGuard); // the moderation tax is visible
  });

  it("the memory store sees the turn's read + write (AC6)", () => {
    const design: ArenaDesign = {
      nodes: [n("client", "client"), n("backend", "backend"), n("mem", "memoryStore", { callsPerRequest: 2 })],
      edges: [e("client", "backend"), e("backend", "mem")],
    };
    // 1000 turns/s arriving at the backend → 2000 memory calls/s (read + write).
    expect(computeMetrics(design, 1000).get("mem")!.arriving).toBeCloseTo(2000, 5);
  });

  it("the 3rd-party API sheds honestly when overloaded (AC5)", () => {
    const design: ArenaDesign = {
      nodes: [n("client", "client"), n("backend", "backend"), n("api", "externalApi")],
      edges: [e("client", "backend"), e("backend", "api")],
    };
    const over = BENCHMARKS.externalApi.baseCapacity * 4;
    const m = computeMetrics(design, over);
    expect(m.get("api")!.shedRps).toBeGreaterThan(0); // the provider's 429s, synchronous
    expect(m.get("api")!.async).toBe(false);
  });
});
