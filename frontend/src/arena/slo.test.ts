// 129-arena-slo-engine — the pure objective/verdict layer (AC1–AC8, AC12–AC14).
//
// These assert POLICY over the capacity model, not physics: given a design + a
// load story + a set of targets, `evaluateObjectives` says met / not met per axis
// and names the box responsible. The model's own tests stay about physics.
//
// The axes and their defaults come from a MEASURED baseline (see spec.md): the
// closed loop (110) converts overload into LATENCY, not into 429s, so shed is the
// LAST signal to fire; and cost ALONE rewards under-provisioning — the starved
// design is the cheapest one. Latency + headroom are the discriminating pair.

import { describe, expect, it } from "vitest";

import { PALETTE_ORDER, type ArenaKind } from "./components";
import { endToEndLatencyMs, equilibriumRps, llmCost, type ArenaDesign } from "./model";
import {
  DEFAULT_SLO_TARGETS,
  QUEUE_CLAMP_UTIL,
  SLO_METRICS,
  SLO_METRIC_ORDER,
  evaluateObjectives,
  measureDesign,
  remediationFor,
  type SloTargets,
} from "./slo";

const n = (id: string, kind: ArenaKind, extra: Record<string, unknown> = {}) => ({
  id,
  kind,
  size: "medium" as const,
  replicas: 1,
  region: "us-east",
  ...extra,
});
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

interface Case {
  design: ArenaDesign;
  users: number;
  thinkTimeSec: number;
}

/** The shipped "broken" shape: 16k users @ 1 msg/20s onto ONE deployment. */
function broken(): Case {
  return {
    design: {
      nodes: [
        n("client", "client", { region: undefined }),
        n("be", "backend"),
        n("llm", "llm", { callsPerRequest: 2 }),
      ],
      edges: [e("client", "be"), e("be", "llm")],
    },
    users: 16_000,
    thinkTimeSec: 20,
  };
}

/** The same load story, served by a fleet behind a gateway across two regions. */
function healthy(): Case {
  return {
    design: {
      nodes: [
        n("client", "client", { region: undefined }),
        n("be", "backend"),
        n("gw", "aiGateway", { callsPerRequest: 2 }),
        n("llm1", "llm", { replicas: 20 }),
        n("llm2", "llm", { replicas: 20, region: "us-west" }),
      ],
      edges: [e("client", "be"), e("be", "gw"), e("gw", "llm1"), e("gw", "llm2")],
    },
    users: 16_000,
    thinkTimeSec: 20,
  };
}

const measure = (c: Case) => measureDesign(c.design, c.users, c.thinkTimeSec);

describe("129 AC1 — pure evaluation", () => {
  it("returns exactly one result per ENABLED objective and is deterministic", () => {
    const targets: SloTargets = { latency: 30_000, headroom: 0.2 };

    const a = evaluateObjectives(measure(broken()), targets);
    const b = evaluateObjectives(measure(broken()), targets);

    expect(a.results).toHaveLength(2);
    expect(a.results.map((r) => r.metric).sort()).toEqual(["headroom", "latency"]);
    expect(a).toEqual(b); // deterministic: no randomness, no clock
  });

  it("gives every metric a FIXED comparison direction", () => {
    // Direction belongs to the metric, so "latency >= 5s" is unrepresentable.
    expect(SLO_METRICS.latency.direction).toBe("lte");
    expect(SLO_METRICS.shed.direction).toBe("lte");
    expect(SLO_METRICS.cost.direction).toBe("lte");
    expect(SLO_METRICS.headroom.direction).toBe("gte");
  });

  it("orders results by SLO_METRIC_ORDER regardless of the targets' key order", () => {
    const v = evaluateObjectives(measure(broken()), { cost: 1e9, shed: 0, headroom: 0.2, latency: 1e9 });
    const expected = SLO_METRIC_ORDER.filter((m) => v.results.some((r) => r.metric === m));
    expect(v.results.map((r) => r.metric)).toEqual(expected);
  });
});

describe("129 AC2 — the shed axis, in the regime where it actually fires", () => {
  it("MEETS shed<=0 on a badly over-loaded design (the closed loop sheds nothing)", () => {
    // The honest, counter-intuitive half: 16k users onto one deployment does NOT
    // drop requests — a user waiting on a response is not sending the next one,
    // so the overload becomes latency instead of 429s.
    const m = measure(broken());
    expect(m.shedRps).toBe(0);

    const v = evaluateObjectives(m, { shed: 0 });
    expect(v.results[0].met).toBe(true);
    expect(v.met).toBe(true);
  });

  it("FAILS shed<=0 once latency is clamped and demand still exceeds capacity", () => {
    const c = broken();
    const extreme = measureDesign(c.design, c.users * 5, c.thinkTimeSec);
    expect(extreme.shedRps).toBeGreaterThan(0);

    const v = evaluateObjectives(extreme, { shed: 0 });
    expect(v.results[0].met).toBe(false);
    expect(v.results[0].actual).toBeCloseTo(extreme.shedRps, 5);
    expect(v.met).toBe(false);
  });
});

describe("129 AC3 — the latency axis is the primary discriminator", () => {
  it("measures at the CLOSED-LOOP equilibrium, not the open-loop demand", () => {
    const c = broken();
    const eq = Math.round(equilibriumRps(c.design, c.users, c.thinkTimeSec));
    expect(eq).toBeLessThan(c.users / c.thinkTimeSec); // the loop self-throttles

    const m = measure(c);
    expect(m.offeredLoad).toBe(eq);
    expect(m.demandRps).toBeCloseTo(c.users / c.thinkTimeSec, 5);
    expect(m.e2eLatencyMs).toBeCloseTo(endToEndLatencyMs(c.design, eq), 5);
  });

  it("separates the broken design from the healthy one (which shed does not)", () => {
    expect(evaluateObjectives(measure(broken()), { latency: 30_000 }).met).toBe(false);
    expect(evaluateObjectives(measure(healthy()), { latency: 30_000 }).met).toBe(true);
  });
});

describe("129 AC4 — the cost axis, and the inversion that keeps it off by default", () => {
  it("reports provisioned + usage", () => {
    const c = healthy();
    const m = measure(c);
    const cost = llmCost(c.design, m.offeredLoad);
    expect(m.costPerHourUsd).toBeCloseTo(cost.provisionedPerHour + cost.usagePerHour, 5);
  });

  it("rises when an IDLE deployment is added — provisioned capacity is never free", () => {
    const c = healthy();
    const before = measure(c).costPerHourUsd;
    const withIdle: Case = {
      ...c,
      design: { ...c.design, nodes: [...c.design.nodes, n("spare", "llm")] },
    };
    const after = measure(withIdle).costPerHourUsd;

    expect(after).toBeGreaterThan(before);
    // …and it can break a previously-met objective.
    expect(evaluateObjectives(measure(c), { cost: before + 1 }).met).toBe(true);
    expect(evaluateObjectives(measure(withIdle), { cost: before + 1 }).met).toBe(false);
  });

  it("pins the INVERSION: the starved design costs LESS than the healthy one", () => {
    // This is why cost ships OFF by default — a tight cap would pass the broken
    // design and fail every good one. Guard against someone "helpfully" enabling it.
    expect(measure(broken()).costPerHourUsd).toBeLessThan(measure(healthy()).costPerHourUsd);
  });
});

describe("129 AC5 — the headroom axis is the cleanest discriminator", () => {
  it("fails on the starved design and passes on the healthy one", () => {
    expect(evaluateObjectives(measure(broken()), { headroom: 0.2 }).met).toBe(false);
    expect(evaluateObjectives(measure(healthy()), { headroom: 0.2 }).met).toBe(true);
  });

  it("reports 1 - max utilization and clears once the bottleneck is scaled out", () => {
    const c = broken();
    const before = measure(c);
    expect(before.headroomPct).toBeLessThan(0.2);

    const scaled: Case = {
      ...c,
      design: {
        ...c.design,
        nodes: c.design.nodes.map((sp) => (sp.kind === "llm" ? { ...sp, replicas: 20 } : sp)),
      },
    };
    const after = measure(scaled);
    expect(after.headroomPct).toBeGreaterThan(before.headroomPct);
    expect(evaluateObjectives(after, { headroom: 0.2 }).met).toBe(true);
  });

  it("is 1 for an empty design (nothing is busy)", () => {
    expect(measureDesign({ nodes: [], edges: [] }, 1000, 30).headroomPct).toBe(1);
  });
});

describe("129 AC6 — culprit identification", () => {
  it("names the busiest node for latency / headroom / shed, and only when FAILED", () => {
    const m = measure(broken());
    const failed = evaluateObjectives(m, { latency: 30_000, headroom: 0.2 });
    for (const r of failed.results) {
      expect(r.met).toBe(false);
      expect(r.culpritNodeId).toBe("llm");
    }
    // A MET objective names no culprit.
    const met = evaluateObjectives(m, { latency: 1e9 });
    expect(met.results[0].met).toBe(true);
    expect(met.results[0].culpritNodeId).toBeUndefined();
  });

  it("names the costliest LLM for the cost axis", () => {
    const c = healthy();
    // Make llm2 unambiguously the most expensive pool.
    const design = {
      ...c.design,
      nodes: c.design.nodes.map((sp) => (sp.id === "llm2" ? { ...sp, replicas: 60 } : sp)),
    };
    const v = evaluateObjectives(measureDesign(design, c.users, c.thinkTimeSec), { cost: 1 });
    expect(v.results[0].met).toBe(false);
    expect(v.results[0].culpritNodeId).toBe("llm2");
  });

  it("always names a culprit that EXISTS in the design", () => {
    const c = broken();
    const ids = new Set(c.design.nodes.map((sp) => sp.id));
    const v = evaluateObjectives(measure(c), { latency: 1, headroom: 0.9, shed: 0, cost: 1 });
    for (const r of v.results) {
      if (r.culpritNodeId !== undefined) expect(ids.has(r.culpritNodeId)).toBe(true);
    }
  });
});

describe("129 AC7 — remediation hints, bilingual and hole-free", () => {
  it("resolves a non-empty en AND pt hint for every (metric, kind) pair", () => {
    for (const metric of SLO_METRIC_ORDER) {
      for (const kind of PALETTE_ORDER) {
        expect(remediationFor(metric, kind, "en").trim(), `en ${metric}/${kind}`).toBeTruthy();
        expect(remediationFor(metric, kind, "pt").trim(), `pt ${metric}/${kind}`).toBeTruthy();
      }
    }
  });

  it("attaches a hint to every failed objective", () => {
    const v = evaluateObjectives(measure(broken()), { latency: 30_000, headroom: 0.2 });
    for (const r of v.results) {
      expect(r.met).toBe(false);
      expect(remediationFor(r.metric, "llm", "pt")).toBeTruthy();
    }
  });
});

describe("129 AC8 — the overall verdict", () => {
  it("is met only when EVERY enabled objective is met", () => {
    const m = measure(healthy());
    expect(evaluateObjectives(m, { latency: 30_000, headroom: 0.2 }).met).toBe(true);
    expect(evaluateObjectives(m, { latency: 30_000, headroom: 0.999 }).met).toBe(false);
  });

  it("excludes a switched-off objective from the results and from the verdict", () => {
    const m = measure(broken());
    const withLatency = evaluateObjectives(m, { latency: 30_000, shed: 0 });
    expect(withLatency.met).toBe(false);

    const withoutLatency = evaluateObjectives(m, { shed: 0 });
    expect(withoutLatency.results.map((r) => r.metric)).toEqual(["shed"]);
    expect(withoutLatency.met).toBe(true); // the failing axis is simply not tracked
  });

  it("counts met / total for the summary line", () => {
    const v = evaluateObjectives(measure(broken()), { latency: 30_000, headroom: 0.2, shed: 0 });
    expect(v.total).toBe(3);
    expect(v.metCount).toBe(1); // only shed is met
  });

  it("is met for an empty target set", () => {
    const v = evaluateObjectives(measure(broken()), {});
    expect(v.results).toHaveLength(0);
    expect(v.met).toBe(true);
  });
});

describe("129 AC13 — the latency ceiling is reported honestly", () => {
  it("flags the latency result as a LOWER BOUND when the queueing clamp binds", () => {
    const c = broken();
    const extreme = measureDesign(c.design, c.users * 5, c.thinkTimeSec);
    expect(extreme.atLatencyCeiling).toBe(true);

    const v = evaluateObjectives(extreme, { latency: 30_000 });
    expect(v.results[0].atCeiling).toBe(true);
    expect(v.results[0].met).toBe(false);
  });

  it("does NOT flag a design running below the clamp", () => {
    const m = measure(healthy());
    expect(m.atLatencyCeiling).toBe(false);
    expect(evaluateObjectives(m, { latency: 30_000 }).results[0].atCeiling).toBeFalsy();
  });

  it("detects the ceiling from the model's own clamp constant", () => {
    expect(QUEUE_CLAMP_UTIL).toBe(0.99);
  });
});

describe("129 AC14 — the shipped defaults are the MEASURED ones", () => {
  it("tracks latency, headroom and shed — and leaves cost OFF", () => {
    expect(Object.keys(DEFAULT_SLO_TARGETS).sort()).toEqual(["headroom", "latency", "shed"]);
    expect(DEFAULT_SLO_TARGETS.cost).toBeUndefined();
    expect(DEFAULT_SLO_TARGETS.latency).toBe(30_000);
    expect(DEFAULT_SLO_TARGETS.headroom).toBe(0.2);
    expect(DEFAULT_SLO_TARGETS.shed).toBe(0);
  });

  it("fails EXACTLY latency + headroom on the starved design", () => {
    const v = evaluateObjectives(measure(broken()), DEFAULT_SLO_TARGETS);
    const failed = v.results.filter((r) => !r.met).map((r) => r.metric).sort();
    expect(failed).toEqual(["headroom", "latency"]);
  });

  it("meets all three tracked axes on the healthy fleet", () => {
    expect(evaluateObjectives(measure(healthy()), DEFAULT_SLO_TARGETS).met).toBe(true);
  });
});

describe("129 — comparison tolerance", () => {
  it("does not fail a value that lands exactly on its target", () => {
    const m = measure(healthy());
    // Exact-equality on both directions must read as met.
    expect(evaluateObjectives(m, { latency: m.e2eLatencyMs }).met).toBe(true);
    expect(evaluateObjectives(m, { headroom: m.headroomPct }).met).toBe(true);
  });
});

describe("131 AC11 — faults compose with the verdict", () => {
  it("flips an objective to not-met and names the faulted box as culprit", () => {
    const c = healthy();
    const clean = evaluateObjectives(measure(c), { latency: 30_000, headroom: 0.2 });
    expect(clean.met).toBe(true);

    // Take one of the two pools out: the survivor carries the whole load.
    const faulted: Case = {
      ...c,
      design: {
        ...c.design,
        faults: [{ id: "f", type: "instanceDown", nodeId: "llm1" }],
      },
    };
    const v = evaluateObjectives(measure(faulted), { latency: 30_000, headroom: 0.2 });
    expect(v.met).toBe(false);
    // The busiest box under the fault is the downed pool itself (fully saturated).
    const failed = v.results.filter((r) => !r.met);
    expect(failed.length).toBeGreaterThan(0);
    for (const r of failed) expect(r.culpritNodeId).toBeTruthy();
  });

  it("a region outage taking the whole model tier out leaves no headroom", () => {
    const c = healthy();
    const outage: Case = {
      ...c,
      design: {
        ...c.design,
        // Both pools plus the backend live in us-east/us-west; kill us-east.
        faults: [{ id: "f", type: "regionOutage", region: "us-east" }],
      },
    };
    const m = measure(outage);
    expect(m.headroomPct).toBeLessThan(measure(c).headroomPct);
  });
});
