// 101-arena-examples — the preset library (AC3, AC5, AC6).

import { describe, expect, it } from "vitest";

import { DEFAULT_EXAMPLE_ID, EXAMPLES, defaultDesign } from "./examples";
import { computeMetrics } from "./model";

describe("arena example library (AC3, AC6)", () => {
  it("ships at least 3 presets, each with a bilingual title/description + a valid design", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(3);
    for (const ex of EXAMPLES) {
      expect(ex.title.en.trim(), `${ex.id} title.en`).toBeTruthy();
      expect(ex.title.pt.trim(), `${ex.id} title.pt`).toBeTruthy();
      expect(ex.description.en.trim(), `${ex.id} desc.en`).toBeTruthy();
      expect(ex.description.pt.trim(), `${ex.id} desc.pt`).toBeTruthy();

      const design = ex.build();
      expect(design.nodes.length, `${ex.id} has nodes`).toBeGreaterThan(0);
      expect(design.offeredLoad, `${ex.id} has load`).toBeGreaterThan(0);
      // Every edge references real nodes in the same design.
      const ids = new Set(design.nodes.map((n) => n.id));
      for (const e of design.edges) {
        expect(ids.has(e.source), `${ex.id} edge source`).toBe(true);
        expect(ids.has(e.target), `${ex.id} edge target`).toBe(true);
      }
    }
  });

  it("has a default sample that is one of the presets and non-empty", () => {
    expect(EXAMPLES.some((e) => e.id === DEFAULT_EXAMPLE_ID)).toBe(true);
    const d = defaultDesign();
    expect(d.nodes.length).toBeGreaterThanOrEqual(3);
    expect(d.edges.length).toBeGreaterThan(0);
  });
});

describe("presets teach their lesson through the model (AC5)", () => {
  const byId = (id: string) => EXAMPLES.find((e) => e.id === id)!;
  const llmStatus = (id: string) => {
    const d = byId(id).build();
    const m = computeMetrics(d, d.offeredLoad);
    const llm = d.nodes.find((n) => n.kind === "llm")!;
    return m.get(llm.id)!.status;
  };

  it("the simple single-LLM agent saturates the LLM under its own load", () => {
    expect(llmStatus("simple-rag")).toBe("critical");
  });

  it("scaling the LLM horizontally clears the bottleneck at the same lesson load", () => {
    expect(llmStatus("scale-llm")).not.toBe("critical");
  });

  it("the LLM fleet survives ~10k rps — no LLM node is critical (AC3)", () => {
    const d = byId("llm-fleet").build();
    expect(d.offeredLoad).toBeGreaterThanOrEqual(10_000);
    const m = computeMetrics(d, d.offeredLoad);
    const llms = d.nodes.filter((n) => n.kind === "llm");
    expect(llms.length).toBeGreaterThan(1); // it's a fleet
    for (const llm of llms) expect(m.get(llm.id)!.status).not.toBe("critical");
    // and the AI Gateway is what fans the load across them
    expect(d.nodes.some((n) => n.kind === "aiGateway")).toBe(true);
  });
});
