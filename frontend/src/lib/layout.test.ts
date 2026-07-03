// 032-network-boundary (AC1) — the public-internet / egress frontier geometry:
// a thin vertical line in the gap between the client tier's right edge and the
// private boundary's left edge, spanning the boundary's vertical extent, in every
// scenario, overlapping neither box.

import { describe, expect, it } from "vitest";

import { computeLayout } from "./layout";
import { DEFAULT_SELECTION, type ResolvedSelection, selectionOf } from "./selection";

// Representative selections spanning the maturity range (061-scenario-builder).
const SELECTIONS: { name: string; sel: ResolvedSelection }[] = [
  { name: "default (simple)", sel: DEFAULT_SELECTION },
  {
    name: "rich (intermediate)",
    sel: selectionOf(["mcp", "rerank", "hybrid", "summarization"], "deepagents", "vector"),
  },
  {
    name: "full (advanced)",
    sel: selectionOf(
      ["mcp", "gateway", "guardrails", "cache", "eval", "observability"],
      "multiagent",
      "vector",
    ),
  },
];

describe("harness lens gives the collapsed Agent extra height (095)", () => {
  it("agent is taller under the Harness lens, but only when collapsed", () => {
    const base = computeLayout(new Set(), DEFAULT_SELECTION, false, false).heights.agent;
    const harness = computeLayout(new Set(), DEFAULT_SELECTION, false, true).heights.agent;
    expect(harness).toBeGreaterThan(base); // room for core + Context-window badges

    // Expanded already has ample room, so the lens must not change it.
    const expBase = computeLayout(new Set(["agent"]), DEFAULT_SELECTION, false, false).heights.agent;
    const expHarness = computeLayout(new Set(["agent"]), DEFAULT_SELECTION, false, true).heights.agent;
    expect(expHarness).toBe(expBase);
  });

  it("leaves other stations' heights untouched under the Harness lens", () => {
    const base = computeLayout(new Set(), DEFAULT_SELECTION, false, false);
    const harness = computeLayout(new Set(), DEFAULT_SELECTION, false, true);
    for (const id of ["frontend", "backend", "rag", "llm", "mcp", "database"] as const) {
      expect(harness.heights[id]).toBe(base.heights[id]);
    }
  });
});

describe("upload node hidden by default (035 + 080 AC6)", () => {
  for (const { name, sel } of SELECTIONS) {
    it(`omits ingestion from the layout in ${name} with no upload`, () => {
      const layout = computeLayout(new Set(), sel);
      expect(layout.positions.ingestion).toBeUndefined();
      // the query-path data nodes are still laid out
      expect(layout.positions.rag).toBeDefined();
      expect(layout.positions.database).toBeDefined();
    });
  }
});

describe("ingestion write-path placement (080 AC8 · shown with showUpload)", () => {
  for (const { name, sel } of SELECTIONS) {
    it(`stacks ingestion → rag downward inside the services tier in ${name}`, () => {
      const layout = computeLayout(new Set(), sel, true);
      const { positions, heights, tierBoxes } = layout;

      // 080: object storage folded into ingestion, so the single ingestion node
      // sits above rag and the upload edge flows downward (source-bottom → target-top).
      expect(positions.ingestion).toBeDefined();
      expect(positions.ingestion.y).toBeLessThan(positions.rag.y);

      // Stacked, never overlapping its upper neighbour (database).
      expect(positions.ingestion.y).toBeGreaterThanOrEqual(
        positions.database.y + heights.database,
      );

      // The services tier box wraps ingestion (a member of that tier).
      const box = tierBoxes.services;
      expect(positions.ingestion.x).toBeGreaterThanOrEqual(box.x);
      expect(positions.ingestion.y + heights.ingestion).toBeLessThanOrEqual(box.y + box.h);
    });
  }
});

describe("intermediate preview tiles placement (060 AC7)", () => {
  // 070-hybrid-search removed the standalone `hybrid` tile (hybrid search is now the
  // `rag.hybrid` sub-stage of the `rag` station), so the former hybrid-placement test
  // was dropped. The `summarization` preview tile placement still holds.
  it("places summarization under the agent, inside the agent tier", () => {
    const sel = selectionOf(["mcp", "summarization"]);
    const { positions, heights, tierBoxes } = computeLayout(new Set(), sel);
    expect(positions.summarization).toBeDefined();
    expect(positions.summarization.x).toBe(positions.agent.x);
    expect(positions.summarization.y).toBeGreaterThanOrEqual(positions.agent.y + heights.agent);
    const box = tierBoxes.agent;
    expect(positions.summarization.y + heights.summarization).toBeLessThanOrEqual(box.y + box.h);
  });

  it("summarization never overlaps the sub-agent row under the multiagent runtime", () => {
    const sel = selectionOf(["mcp", "summarization"], "multiagent");
    const { positions, heights } = computeLayout(new Set(), sel);
    const subagentBottom = Math.max(
      positions.researcher.y + heights.researcher,
      positions.coder.y + heights.coder,
      positions.critic.y + heights.critic,
    );
    expect(positions.summarization.y).toBeGreaterThanOrEqual(subagentBottom);
  });
});

describe("public frontier geometry (032-network-boundary AC1)", () => {
  for (const { name, sel } of SELECTIONS) {
    it(`sits between the client tier and the private boundary in ${name}`, () => {
      const layout = computeLayout(new Set(), sel);
      const f = layout.publicFrontier;
      const clientRight = layout.tierBoxes.client.x + layout.tierBoxes.client.w;
      const boundaryLeft = layout.boundary.x;

      // Strictly between the client tier's right edge and the boundary's left edge.
      expect(f.x).toBeGreaterThan(clientRight);
      expect(f.x).toBeLessThan(boundaryLeft);

      // Spans the private boundary's vertical extent.
      expect(f.y).toBeCloseTo(layout.boundary.y, 0);
      expect(f.h).toBeCloseTo(layout.boundary.h, 0);
    });
  }
});
