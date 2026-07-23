// 101-arena-examples + 103-arena-realism — the preset library (AC3, AC5–AC7).

import { describe, expect, it } from "vitest";

import { DEFAULT_EXAMPLE_ID, EXAMPLES, defaultDesign } from "./examples";
import {
  computeMetrics,
  concurrencyBudgetFor,
  concurrencyPressure,
  equilibriumRps,
  heldInFlight,
  routingTaxFor,
  rpsOf,
} from "./model";

const byId = (id: string) => EXAMPLES.find((e) => e.id === id)!;
const loadOf = (d: { users: number; thinkTimeSec: number }) => rpsOf(d.users, d.thinkTimeSec);

describe("arena example library (101 AC3, AC6)", () => {
  it("ships at least 3 presets, each with a bilingual title/description + a valid design", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(3);
    for (const ex of EXAMPLES) {
      expect(ex.title.en.trim(), `${ex.id} title.en`).toBeTruthy();
      expect(ex.title.pt.trim(), `${ex.id} title.pt`).toBeTruthy();
      expect(ex.description.en.trim(), `${ex.id} desc.en`).toBeTruthy();
      expect(ex.description.pt.trim(), `${ex.id} desc.pt`).toBeTruthy();

      const design = ex.build();
      expect(design.nodes.length, `${ex.id} has nodes`).toBeGreaterThan(0);
      expect(design.users, `${ex.id} has users`).toBeGreaterThan(0);
      expect(design.thinkTimeSec, `${ex.id} has think time`).toBeGreaterThan(0);
      // Every edge references real nodes in the same design.
      const ids = new Set(design.nodes.map((n) => n.id));
      for (const e of design.edges) {
        expect(ids.has(e.source), `${ex.id} edge source`).toBe(true);
        expect(ids.has(e.target), `${ex.id} edge target`).toBe(true);
      }
      // 103 AC3 — every preset has a client node, so load enters at the front door.
      expect(design.nodes.some((n) => n.kind === "client"), `${ex.id} has client`).toBe(true);
    }
  });

  it("has a default sample that is one of the presets and non-empty", () => {
    expect(EXAMPLES.some((e) => e.id === DEFAULT_EXAMPLE_ID)).toBe(true);
    const d = defaultDesign();
    expect(d.nodes.length).toBeGreaterThanOrEqual(3);
    expect(d.edges.length).toBeGreaterThan(0);
    // 110 — the seeded rate is the closed-loop equilibrium of the sample design.
    expect(d.offeredLoad).toBe(
      Math.round(equilibriumRps({ nodes: d.nodes, edges: d.edges }, d.users, d.thinkTimeSec)),
    );
  });
});

describe("123 — every preset is fronted by the agent harness", () => {
  it("wires exactly one agentHarness between the backend and its callees", () => {
    for (const ex of EXAMPLES) {
      const d = ex.build();
      const harnesses = d.nodes.filter((n) => n.kind === "agentHarness");
      expect(harnesses, `${ex.id} has one harness`).toHaveLength(1);
      const h = harnesses[0];
      const backend = d.nodes.find((n) => n.kind === "backend")!;
      // backend → harness, and the harness (not the backend) now feeds the callees.
      expect(
        d.edges.some((e) => e.source === backend.id && e.target === h.id),
        `${ex.id} backend→harness`,
      ).toBe(true);
      expect(
        d.edges.some((e) => e.source === backend.id && e.target !== h.id),
        `${ex.id} backend fans out ONLY to the harness`,
      ).toBe(false);
      expect(
        d.edges.some((e) => e.source === h.id),
        `${ex.id} harness feeds the callees`,
      ).toBe(true);
    }
  });
});

describe("presets teach their lesson through the model (101 AC5)", () => {
  const llmStatus = (id: string) => {
    const d = byId(id).build();
    const m = computeMetrics(d, loadOf(d));
    const llm = d.nodes.find((n) => n.kind === "llm")!;
    return m.get(llm.id)!.status;
  };

  it("the simple single-LLM agent saturates the LLM under its own load", () => {
    expect(llmStatus("simple-rag")).toBe("critical");
  });

  it("scaling the LLM horizontally clears the bottleneck at the same lesson load", () => {
    expect(llmStatus("scale-llm")).not.toBe("critical");
  });
});

describe("103 AC7 — defensible presets", () => {
  it("the 100k-users fleet stays under 2k rps (Little's Law) and its LLM tier is not critical", () => {
    const d = byId("llm-fleet").build();
    expect(d.users).toBeGreaterThanOrEqual(100_000);
    const rps = loadOf(d);
    expect(rps).toBeLessThanOrEqual(2_000); // 100k users ≠ 100k rps — the conversion is the lesson
    const m = computeMetrics(d, rps);
    const llms = d.nodes.filter((n) => n.kind === "llm");
    expect(llms.length).toBeGreaterThan(1);
    for (const llm of llms) expect(m.get(llm.id)!.status).not.toBe("critical");
    expect(d.nodes.some((n) => n.kind === "aiGateway")).toBe(true);
  });

  it("rag-cache has no CDN in the POST path (spec 090: CDNs bypass POST)", () => {
    const d = byId("rag-cache").build();
    expect(d.nodes.some((n) => n.kind === "cdn")).toBe(false);
    expect(d.nodes.some((n) => n.kind === "apiGateway")).toBe(true);
  });

  it("scale-llm has no decorative single-child load balancer", () => {
    const d = byId("scale-llm").build();
    for (const lb of d.nodes.filter((n) => n.kind === "loadBalancer")) {
      const children = d.edges.filter((e) => e.source === lb.id);
      expect(children.length, "an LB must split across ≥2 children").toBeGreaterThanOrEqual(2);
    }
  });

  it("scale-llm's backend pays the routing tax yet stays healthy; gateway presets don't (105 AC5)", () => {
    // Backend wired straight to 20 deployments → it holds the endpoints → taxed.
    const direct = byId("scale-llm").build();
    const directBe = direct.nodes.find((n) => n.kind === "backend")!;
    expect(routingTaxFor(direct, directBe.id).tax).toBeGreaterThan(0);
    const m = computeMetrics(direct, loadOf(direct));
    expect(m.get(directBe.id)!.status).not.toBe("critical"); // lesson load still fits

    // Behind an AI Gateway the backend manages ONE endpoint → no tax.
    for (const id of ["prod", "llm-fleet"]) {
      const d = byId(id).build();
      const be = d.nodes.find((n) => n.kind === "backend")!;
      expect(routingTaxFor(d, be.id).tax, `${id} backend untaxed`).toBe(0);
    }
  });

  it("multi-pool presets place their LLM pools in distinct regions (106 AC4)", () => {
    const distinctRegions = (id: string) => {
      const llms = byId(id).build().nodes.filter((n) => n.kind === "llm");
      const regions = llms.map((n) => n.region).filter(Boolean);
      expect(regions.length, `${id} pools annotated`).toBe(llms.length);
      return new Set(regions).size;
    };
    expect(distinctRegions("prod")).toBe(2); // us-east / eu-west
    expect(distinctRegions("llm-fleet")).toBe(4); // four pools, four regions
  });

  it("semantic-cache preset: the cache is what keeps the fleet healthy (112 AC4)", () => {
    const d = byId("semantic-cache").build();
    const rps = loadOf(d);
    const llm = d.nodes.find((n) => n.kind === "llm")!;
    const sc = d.nodes.find((n) => n.kind === "semanticCache")!;
    expect(computeMetrics({ nodes: d.nodes, edges: d.edges }, rps).get(llm.id)!.status).toBe(
      "healthy",
    );

    // Remove the semantic cache (rewire its parent straight to the LLM) and the
    // same fleet saturates — the cache IS the third lever.
    const parent = d.edges.find((e) => e.target === sc.id)!.source;
    const without = {
      nodes: d.nodes.filter((n) => n.id !== sc.id),
      edges: [
        ...d.edges.filter((e) => e.source !== sc.id && e.target !== sc.id),
        { id: `${parent}-${llm.id}`, source: parent, target: llm.id },
      ],
    };
    expect(computeMetrics(without, rps).get(llm.id)!.status).toBe("critical");
  });

  it("every preset's stated claims hold against the model (115 AC5)", () => {
    for (const ex of EXAMPLES) {
      const d = ex.build();
      expect(ex.claims.demandRps, `${ex.id} demand`).toBe(rpsOf(d.users, d.thinkTimeSec));
      const m = computeMetrics({ nodes: d.nodes, edges: d.edges }, ex.claims.demandRps);
      for (const llm of d.nodes.filter((n) => n.kind === "llm")) {
        expect(m.get(llm.id)!.status, `${ex.id} ${llm.id}`).toBe(ex.claims.llm);
      }
    }
  });

  it("agent-tools exercises the ReAct fan-out on LLM and MCP (calls per request > 1)", () => {
    const d = byId("agent-tools").build();
    const llm = d.nodes.find((n) => n.kind === "llm")!;
    const mcp = d.nodes.find((n) => n.kind === "mcp")!;
    expect(llm.callsPerRequest ?? 1).toBeGreaterThan(1);
    expect(mcp.callsPerRequest ?? 1).toBeGreaterThan(1);
    // The fan-out is visible in the model: LLM sees more calls than user requests.
    const rps = loadOf(d);
    const m = computeMetrics(d, rps);
    expect(m.get(llm.id)!.arriving).toBeGreaterThan(rps);
  });
});

// --- 116-arena-openai-calibration ----------------------------------------------

describe("US-region defaults + realistic fleets (116 AC4/AC6)", () => {
  it("every preset node except the client declares a US region", () => {
    for (const ex of EXAMPLES) {
      for (const node of ex.build().nodes) {
        if (node.kind === "client") {
          expect(node.region, `${ex.id}/${node.id} client has no region`).toBeUndefined();
        } else {
          expect(node.region, `${ex.id}/${node.id} region`).toMatch(/^us-/);
        }
      }
    }
  });

  it("no preset needs an absurd fleet — every LLM pool is ≤ 6 deployments", () => {
    for (const ex of EXAMPLES) {
      for (const llm of ex.build().nodes.filter((n) => n.kind === "llm")) {
        expect(llm.replicas, `${ex.id}/${llm.id} deployments`).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe("regional-quota lesson pair (116 AC5)", () => {
  it("two pools stacked in one region share the quota: squeezed and shedding (critical)", () => {
    const d = byId("regional-quota").build();
    const m = computeMetrics({ nodes: d.nodes, edges: d.edges }, loadOf(d));
    const pools = d.nodes.filter((n) => n.kind === "llm");
    expect(pools).toHaveLength(2);
    expect(new Set(pools.map((n) => n.region)).size).toBe(1); // both in us-east
    for (const p of pools) {
      const llm = m.get(p.id)!;
      expect(llm.quotaFactor, `${p.id} squeezed`).toBeLessThan(1); // the regional cap bites
      expect(llm.shedRps, `${p.id} sheds`).toBeGreaterThan(0); // honest 429s
      expect(llm.status, `${p.id} critical`).toBe("critical");
    }
  });

  it("the same fleet split across two US regions serves the same demand healthily", () => {
    const bite = byId("regional-quota").build();
    const escape = byId("multi-region").build();
    // Same load story, same total deployments — the ONLY move is the split.
    expect(escape.users).toBe(bite.users);
    expect(escape.thinkTimeSec).toBe(bite.thinkTimeSec);
    const total = (d: typeof bite) =>
      d.nodes.filter((n) => n.kind === "llm").reduce((s, n) => s + n.replicas, 0);
    expect(total(escape)).toBe(total(bite));

    const pools = escape.nodes.filter((n) => n.kind === "llm");
    expect(new Set(pools.map((n) => n.region)).size).toBe(pools.length); // distinct US regions
    const m = computeMetrics({ nodes: escape.nodes, edges: escape.edges }, loadOf(escape));
    for (const p of pools) {
      expect(m.get(p.id)!.quotaFactor, `${p.id} under quota`).toBe(1);
      expect(m.get(p.id)!.status, `${p.id} healthy`).toBe("healthy");
    }
  });
});

// --- 118-arena-backend-concurrency ------------------------------------------------

describe("presets stay under the backend stream budget (118 AC5)", () => {
  it("every llm-healthy preset's backend holds < 70% of its connection budget at equilibrium", () => {
    for (const ex of EXAMPLES) {
      if (ex.claims.llm !== "healthy") continue;
      const d = ex.build();
      const design = { nodes: d.nodes, edges: d.edges };
      const eq = equilibriumRps(design, d.users, d.thinkTimeSec);
      const held = heldInFlight(design, eq);
      for (const be of d.nodes.filter((sp) => sp.kind === "backend")) {
        const h = held.get(be.id);
        const budget = concurrencyBudgetFor(be)!;
        expect(h, `${ex.id}/${be.id} held is a number`).not.toBeNull();
        const pressure = concurrencyPressure(h!, budget)!;
        expect(pressure, `${ex.id}/${be.id} pressure ${pressure.toFixed(2)}`).toBeLessThan(0.7);
      }
    }
  });
});

// --- 119-arena-example-callouts ----------------------------------------------------

describe("node-anchored callouts on every preset (119 AC1)", () => {
  it("every preset ships ≥2 bilingual callouts anchored to real node ids", () => {
    for (const ex of EXAMPLES) {
      expect(ex.callouts.length, `${ex.id} has callouts`).toBeGreaterThanOrEqual(2);
      const ids = new Set(ex.build().nodes.map((n) => n.id));
      for (const c of ex.callouts) {
        expect(ids.has(c.nodeId), `${ex.id} anchors "${c.nodeId}"`).toBe(true);
        expect(c.text.en.trim(), `${ex.id}/${c.nodeId} en`).toBeTruthy();
        expect(c.text.pt.trim(), `${ex.id}/${c.nodeId} pt`).toBeTruthy();
      }
      // at most one callout per node — bubbles must not stack.
      expect(new Set(ex.callouts.map((c) => c.nodeId)).size).toBe(ex.callouts.length);
    }
  });
});
