// 100-arena-capacity-sandbox — the pure capacity model (AC1–AC7).
//
// These assert the analytical model directly, with no DOM: given a design + an
// offered load, `computeMetrics` returns per-node QPS / utilization / latency /
// status. Numbers are read from the benchmark catalog so the tests stay robust
// to tuning the raw figures — they pin the *behaviour*, not magic constants.

import { describe, expect, it } from "vitest";

import {
  BENCHMARKS,
  CROSS_REGION_LATENCY_MS,
  LLM_COST_PER_CALL_USD,
  LLM_COST_PER_DEPLOYMENT_HOUR_USD,
  REGIONAL_LLM_QUOTA_RPS,
  ROUTING_TAX_CAP,
  ROUTING_TAX_RATE,
  SIZE_MULTIPLIER,
} from "./components";
import {
  computeMetrics,
  effectiveCapacity,
  endToEndLatencyMs,
  equilibriumRps,
  heldInFlight,
  llmCost,
  routingTaxFor,
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

// --- 103-arena-realism ------------------------------------------------------

describe("calls-per-request fan-out (103 AC2)", () => {
  it("multiplies the load arriving at a node by its callsPerRequest", () => {
    // An agent turn makes ~3 model calls: 100 user req/s → 300 LLM calls/s.
    const design: ArenaDesign = {
      nodes: [
        n("be", "backend"),
        n("llm", "llm", { callsPerRequest: 3, replicas: 10 }), // cap 500
      ],
      edges: [e("be", "llm")],
    };
    const m = computeMetrics(design, 100);
    expect(m.get("llm")!.arriving).toBe(300); // 100 requests × 3 calls
    expect(m.get("llm")!.utilization).toBeCloseTo(300 / 500, 5);
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
  // The audited screenshot design: 122,300 users · think 20s · 3 LLM pools
  // (large ×20) behind an AI Gateway — open-loop it reads "102%, dropping 38
  // req/s, 80s"; a closed population self-throttles long before that.
  const auditDesign = (): ArenaDesign => ({
    nodes: [
      n("c", "client"),
      n("apigw", "apiGateway"),
      n("lb", "loadBalancer"),
      n("be", "backend", { replicas: 2 }),
      n("gw", "aiGateway", { replicas: 2 }),
      // One pool per region, as in the audited screenshot — each under the
      // regional quota (2,000 ≤ 3,000), so 114's cap does not bite here.
      n("llm1", "llm", { size: "large", replicas: 20, region: "us-east" }),
      n("llm2", "llm", { size: "large", replicas: 20, region: "us-west" }),
      n("llm3", "llm", { size: "large", replicas: 20, region: "eu-west" }),
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
    expect(rps).toBeGreaterThanOrEqual(4_700);
    expect(rps).toBeLessThanOrEqual(5_200);
    const m = computeMetrics(d, rps);
    for (const id of ["llm1", "llm2", "llm3"]) {
      expect(m.get(id)!.utilization, `${id} util`).toBeGreaterThanOrEqual(0.78);
      expect(m.get(id)!.utilization, `${id} util`).toBeLessThanOrEqual(0.88);
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
    const rps = equilibriumRps(d, 10_000, 5);
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
  const pool = (id: string, region?: string) =>
    n(id, "llm", { size: "large" as const, replicas: 20, ...(region ? { region } : {}) }); // 2000 rps raw

  const behindGateway = (llms: ReturnType<typeof pool>[]): ArenaDesign => ({
    nodes: [n("gw", "aiGateway"), ...llms],
    edges: llms.map((l) => e("gw", l.id)),
  });

  it("AC1 — an over-quota region is squeezed proportionally to exactly the quota", () => {
    // 60 large deployments (raw 6,000 rps) stacked in ONE region.
    const d = behindGateway([
      pool("a", "us-east"),
      pool("b", "us-east"),
      pool("c", "us-east"),
    ]);
    const m = computeMetrics(d, 100);
    const total = ["a", "b", "c"].reduce((s, id) => s + m.get(id)!.capacity, 0);
    expect(total).toBeCloseTo(REGIONAL_LLM_QUOTA_RPS, 5);
    for (const id of ["a", "b", "c"]) {
      expect(m.get(id)!.quotaFactor).toBeCloseTo(REGIONAL_LLM_QUOTA_RPS / 6000, 5);
      expect(m.get(id)!.capacity).toBeCloseTo(2000 * (REGIONAL_LLM_QUOTA_RPS / 6000), 5);
    }
  });

  it("AC1 — a region at/below quota is untouched (byte-for-byte)", () => {
    const d = behindGateway([pool("a", "us-east")]); // raw 2,000 ≤ 3,000
    const m = computeMetrics(d, 100);
    expect(m.get("a")!.quotaFactor).toBe(1);
    expect(m.get("a")!.capacity).toBeCloseTo(2000, 5);
  });

  it("AC3 — unassigned pools share one implicit quota pool (the cap can't be dodged)", () => {
    const d = behindGateway([pool("a"), pool("b")]); // raw 4,000, no region badges
    const m = computeMetrics(d, 100);
    const factor = REGIONAL_LLM_QUOTA_RPS / 4000;
    expect(m.get("a")!.quotaFactor).toBeCloseTo(factor, 5);
    expect(m.get("b")!.capacity).toBeCloseTo(2000 * factor, 5);
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
    expect(capOf(spread)).toBeCloseTo(6000, 5); // each region under its own quota
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
    const held = heldInFlight(design, 200); // llm (cap 50) sheds
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
