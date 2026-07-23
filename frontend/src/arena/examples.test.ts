// 101-arena-examples + 103-arena-realism — the preset library (AC3, AC5–AC7).

import { describe, expect, it } from "vitest";

import { DEFAULT_EXAMPLE_ID, EXAMPLES, defaultDesign } from "./examples";
import { computeMetrics, routingTaxFor, rpsOf } from "./model";

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
    expect(d.offeredLoad).toBe(rpsOf(d.users, d.thinkTimeSec));
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
