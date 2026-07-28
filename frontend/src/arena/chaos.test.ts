// 131-arena-chaos — failure injection as a pure design transform.
//
// T1/AC9 COMES FIRST and is the safety net for everything else: this is the only
// spec in the 129–133 batch that edits `model.ts`, so the inert-when-unused proof
// is written before the edits. A fault is not new physics — it is the SAME
// analytical model re-evaluated with a component removed or degraded, which is
// also the honesty position (§3): we never simulate a crash.
//
// Determinism is structural here: no Math.random, no Date.now (the model forbids
// both), so a fault moves the design to a different deterministic operating point.

import { describe, expect, it } from "vitest";

import { DEFAULT_CALL_SHAPE, REGIONAL_LLM_QUOTA_RPS, type ArenaKind } from "./components";
import { EXAMPLES } from "./examples";
import { applyFaults, FAULT_META, type ArenaFault } from "./chaos";
import {
  computeMetrics,
  endToEndLatencyMs,
  equilibriumRps,
  quotaFactorsFor,
  type ArenaDesign,
} from "./model";

const n = (id: string, kind: ArenaKind, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  size: "medium" as const,
  replicas: 1,
  region: "us-east",
  ...extra,
});
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

const LANGS = ["en", "pt"] as const;

// ---------------------------------------------------------------------------
// AC9 — inert when unused. Written and committed BEFORE model.ts is touched.
// ---------------------------------------------------------------------------

describe("131 AC9 — zero faults is a no-op", () => {
  it("returns the SAME design object when there are no faults (identity, not a copy)", () => {
    const design: ArenaDesign = { nodes: [n("a", "llm")], edges: [] };
    expect(applyFaults(design)).toBe(design);
    const empty: ArenaDesign = { ...design, faults: [] };
    expect(applyFaults(empty)).toBe(empty); // identity, so nothing can drift
  });

  it("leaves every shipped preset's metrics untouched", () => {
    for (const ex of EXAMPLES) {
      const b = ex.build();
      const design: ArenaDesign = { nodes: b.nodes, edges: b.edges, callShape: DEFAULT_CALL_SHAPE };
      const load = Math.round(equilibriumRps(design, b.users, b.thinkTimeSec));

      const plain = computeMetrics(design, load);
      const withEmpty = computeMetrics({ ...design, faults: [] }, load);

      for (const node of b.nodes) {
        expect(withEmpty.get(node.id), `${ex.id}/${node.id}`).toEqual(plain.get(node.id));
      }
      expect(endToEndLatencyMs({ ...design, faults: [] }, load)).toBe(
        endToEndLatencyMs(design, load),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

describe("131 AC1 — an instance is down", () => {
  const design: ArenaDesign = {
    nodes: [n("client", "client", { region: undefined }), n("be", "backend"), n("llm", "llm")],
    edges: [e("client", "be"), e("be", "llm")],
    faults: [{ id: "f1", type: "instanceDown", nodeId: "llm" }],
  };

  it("zeroes capacity and throughput, sheds everything arriving, and is not healthy", () => {
    const m = computeMetrics(design, 100).get("llm")!;
    expect(m.capacity).toBe(0);
    expect(m.throughput).toBe(0);
    expect(m.shedRps).toBe(100);
    expect(m.status).not.toBe("healthy");
    expect(m.faulted).toBe(true);
  });
});

describe("131 AC2 — downstream of a down node goes unreachable, and says why", () => {
  const design: ArenaDesign = {
    nodes: [n("a", "backend"), n("x", "backend"), n("b", "llm")],
    edges: [e("a", "x"), e("x", "b")],
    faults: [{ id: "f1", type: "instanceDown", nodeId: "x" }],
  };

  it("gives the starved node no traffic, the unreachable status, and names the cause", () => {
    const m = computeMetrics(design, 100);
    expect(m.get("b")!.arriving).toBe(0);
    expect(m.get("b")!.throughput).toBe(0);
    expect(m.get("b")!.status).toBe("unreachable");
    // The starved box must not be mistaken for the broken one.
    expect(m.get("b")!.starvedBy).toBe("x");
    expect(m.get("b")!.faulted).toBeFalsy();
  });

  it("keeps a node with a SURVIVING inbound path healthy", () => {
    const diamond: ArenaDesign = {
      nodes: [n("a", "backend"), n("x", "backend"), n("y", "backend"), n("b", "llm")],
      edges: [e("a", "x"), e("a", "y"), e("x", "b"), e("y", "b")],
      faults: [{ id: "f1", type: "instanceDown", nodeId: "x" }],
    };
    const m = computeMetrics(diamond, 50);
    expect(m.get("b")!.arriving).toBeGreaterThan(0);
    expect(m.get("b")!.status).not.toBe("unreachable");
  });
});

describe("131 AC3 — losing horizontal units", () => {
  const base = (faults: ArenaFault[]): ArenaDesign => ({
    nodes: [n("llm", "llm", { replicas: 4 })],
    edges: [],
    faults,
  });

  it("reduces capacity to the surviving units", () => {
    const full = computeMetrics(base([]), 10).get("llm")!.capacity;
    const lost = computeMetrics(base([{ id: "f", type: "unitLoss", nodeId: "llm", magnitude: 3 }]), 10)
      .get("llm")!.capacity;
    expect(lost).toBeCloseTo(full / 4, 5); // 4 units → 1
  });

  it("losing every unit is exactly `instanceDown`", () => {
    const all = computeMetrics(base([{ id: "f", type: "unitLoss", nodeId: "llm", magnitude: 4 }]), 10)
      .get("llm")!;
    const down = computeMetrics(base([{ id: "f", type: "instanceDown", nodeId: "llm" }]), 10)
      .get("llm")!;
    expect(all.capacity).toBe(0);
    expect(all.capacity).toBe(down.capacity);
  });
});

describe("131 AC4 — a latency spike feeds the closed loop", () => {
  const design = (faults: ArenaFault[]): ArenaDesign => ({
    nodes: [n("client", "client", { region: undefined }), n("be", "backend"), n("llm", "llm", { replicas: 20 })],
    edges: [e("client", "be"), e("be", "llm")],
    faults,
  });

  it("raises end-to-end latency AND lowers the equilibrium rate", () => {
    const clean = design([]);
    const spiked = design([{ id: "f", type: "latencySpike", nodeId: "llm", magnitude: 5 }]);

    const eqClean = equilibriumRps(clean, 20_000, 30);
    const eqSpiked = equilibriumRps(spiked, 20_000, 30);
    expect(endToEndLatencyMs(spiked, 100)).toBeGreaterThan(endToEndLatencyMs(clean, 100));
    // Users waiting on a slow answer are not sending the next message.
    expect(eqSpiked).toBeLessThan(eqClean);
  });
});

describe("131 AC5 — a flushed cache raises downstream load (the stampede)", () => {
  const design = (faults: ArenaFault[]): ArenaDesign => ({
    nodes: [n("be", "backend"), n("cache", "cache", { hitRatio: 0.9 }), n("db", "appDb")],
    edges: [e("be", "cache"), e("cache", "db")],
    faults,
  });

  it("sends the full rate to the tier behind it", () => {
    const warm = computeMetrics(design([]), 1000).get("db")!;
    const flushed = computeMetrics(
      design([{ id: "f", type: "cacheFlush", nodeId: "cache" }]),
      1000,
    ).get("db")!;

    expect(warm.arriving).toBeCloseTo(100, 5); // 10% of 1000 missed
    expect(flushed.arriving).toBeCloseTo(1000, 5); // every request now reaches it
    expect(flushed.utilization).toBeGreaterThan(warm.utilization);
  });
});

describe("131 AC6 — a quota cut squeezes one region only", () => {
  const design = (faults: ArenaFault[]): ArenaDesign => ({
    // Each pool alone is under the regional quota, so only the cut can squeeze it.
    nodes: [
      n("east", "llm", { replicas: 18, region: "us-east" }),
      n("west", "llm", { replicas: 18, region: "us-west" }),
    ],
    edges: [],
    faults,
  });

  it("scales the cut region's quota factor and leaves the others alone", () => {
    const clean = quotaFactorsFor(design([]));
    expect(clean.get("east")).toBe(1);
    expect(clean.get("west")).toBe(1);

    const cut = quotaFactorsFor(
      design([{ id: "f", type: "quotaCut", region: "us-east", magnitude: 0.75 }]),
    );
    expect(cut.get("east")!).toBeLessThan(1);
    expect(cut.get("west")).toBe(1);
  });

  it("cuts the region's ceiling proportionally (114's rule, scaled)", () => {
    const cut = quotaFactorsFor(
      design([{ id: "f", type: "quotaCut", region: "us-east", magnitude: 0.5 }]),
    );
    // 18 deployments raw vs half the regional quota.
    const raw = computeMetrics(design([]), 0).get("east")!.capacity;
    expect(cut.get("east")!).toBeCloseTo((REGIONAL_LLM_QUOTA_RPS * 0.5) / raw, 3);
  });
});

describe("131 AC7 — a region outage", () => {
  const pools = (regions: string[]) =>
    regions.map((r, i) => n(`llm${i}`, "llm", { replicas: 20, region: r }));

  it("downs every box in that region; a second region keeps serving", () => {
    // The gateway carries NO region: a global router in front of regional pools.
    // (With the gateway inside the failing region, the outage takes the router out
    // too and nothing downstream is reached — correct, but it hides the lesson.)
    const multi: ArenaDesign = {
      nodes: [
        n("client", "client", { region: undefined }),
        n("gw", "aiGateway", { region: undefined }),
        ...pools(["us-east", "us-west"]),
      ],
      edges: [e("client", "gw"), e("gw", "llm0"), e("gw", "llm1")],
      faults: [{ id: "f", type: "regionOutage", region: "us-east" }],
    };
    const m = computeMetrics(multi, 1000);
    expect(m.get("llm0")!.capacity).toBe(0);
    expect(m.get("llm1")!.capacity).toBeGreaterThan(0);
    expect(m.get("llm1")!.shedRps).toBe(0);

    const single: ArenaDesign = {
      nodes: [
        n("client", "client", { region: undefined }),
        n("gw", "aiGateway", { region: undefined }),
        ...pools(["us-east"]),
      ],
      edges: [e("client", "gw"), e("gw", "llm0")],
      faults: [{ id: "f", type: "regionOutage", region: "us-east" }],
    };
    expect(computeMetrics(single, 1000).get("llm0")!.shedRps).toBeGreaterThan(0);
  });
});

describe("131 — a degraded dependency", () => {
  it("thins capacity AND slows the third party you cannot scale", () => {
    const design = (faults: ArenaFault[]): ArenaDesign => ({
      nodes: [n("api", "externalApi")],
      edges: [],
      faults,
    });
    const clean = computeMetrics(design([]), 10).get("api")!;
    const bad = computeMetrics(
      design([{ id: "f", type: "dependencyDegraded", nodeId: "api", magnitude: 0.5 }]),
      10,
    ).get("api")!;

    expect(bad.capacity).toBeLessThan(clean.capacity);
    expect(bad.latencyMs).toBeGreaterThan(clean.latencyMs);
  });
});

describe("131 — the catalog is bilingual and complete", () => {
  it("gives every fault type a non-empty en + pt mechanism sentence", () => {
    for (const [type, meta] of Object.entries(FAULT_META)) {
      for (const lang of LANGS) {
        expect(meta.label[lang]?.trim(), `${type} label ${lang}`).toBeTruthy();
        expect(meta.mechanism[lang]?.trim(), `${type} mechanism ${lang}`).toBeTruthy();
      }
    }
  });

  it("does NOT include a client traffic surge — that perturbs LOAD, not a component", () => {
    // The users slider already does this; calling it a fault would blur what a
    // fault is just to match a competitor's catalog entry.
    expect(Object.keys(FAULT_META)).not.toContain("trafficSurge");
  });
});
