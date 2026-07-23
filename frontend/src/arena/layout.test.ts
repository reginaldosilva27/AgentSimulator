// 124-arena-auto-arrange — the pure layered layout. Boxes grow at runtime
// (connection wall, bottleneck banners), so the tidy pass must honor per-node
// sizes: columns by graph depth, stacked rows with breathing room, no overlap.

import { describe, expect, it } from "vitest";

import { autoLayout, GAP_X, GAP_Y, measuredSizeOf } from "./layout";
import type { ArenaNode } from "./store";

const n = (id: string, kind: ArenaNode["kind"], x = 0, y = 0): ArenaNode => ({
  id,
  kind,
  size: "medium",
  replicas: 1,
  x,
  y,
});
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

/** Axis-aligned overlap check for two placed boxes. */
function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("autoLayout (124 AC1/AC2/AC5)", () => {
  it("AC1 — a chain flows left→right by depth and never overlaps", () => {
    const nodes = [n("client", "client"), n("backend", "backend"), n("llm", "llm")];
    const edges = [e("client", "backend"), e("backend", "llm")];
    // Tall backend (a connection-wall banner grew it) — it must get room.
    const sizes: Record<string, { width: number; height: number }> = {
      client: { width: 160, height: 120 },
      backend: { width: 420, height: 210 },
      llm: { width: 190, height: 140 },
    };
    const pos = autoLayout(nodes, edges, (id) => sizes[id]);

    expect(pos.client.x).toBeLessThan(pos.backend.x);
    expect(pos.backend.x).toBeLessThan(pos.llm.x);
    // Column spacing respects the widest box of the previous column.
    expect(pos.llm.x - pos.backend.x).toBeGreaterThanOrEqual(sizes.backend.width + GAP_X);

    const placed = nodes.map((nd) => ({ ...pos[nd.id], w: sizes[nd.id].width, h: sizes[nd.id].height }));
    expect(overlaps(placed[0], placed[1])).toBe(false);
    expect(overlaps(placed[1], placed[2])).toBe(false);
  });

  it("AC2 — same-depth nodes stack vertically with a gap, keeping their order", () => {
    // Two LLM pools fed by one gateway; llm-b currently sits ABOVE llm-a.
    const nodes = [
      n("gw", "aiGateway"),
      n("llm-a", "llm", 400, 300),
      n("llm-b", "llm", 400, -50),
    ];
    const edges = [e("gw", "llm-a"), e("gw", "llm-b")];
    const size = { width: 190, height: 180 };
    const pos = autoLayout(nodes, edges, () => size);

    // Same column…
    expect(pos["llm-a"].x).toBe(pos["llm-b"].x);
    // …previous relative order preserved (b was above a)…
    expect(pos["llm-b"].y).toBeLessThan(pos["llm-a"].y);
    // …with a real gap between the boxes.
    expect(pos["llm-a"].y - pos["llm-b"].y).toBeGreaterThanOrEqual(size.height + GAP_Y);
  });

  it("AC5 — cycles and disconnected nodes still get finite positions", () => {
    const nodes = [n("a", "backend"), n("b", "cache"), n("lone", "appDb")];
    const edges = [e("a", "b"), e("b", "a")]; // user-drawn cycle
    const pos = autoLayout(nodes, edges, () => ({ width: 160, height: 120 }));
    for (const nd of nodes) {
      expect(Number.isFinite(pos[nd.id].x)).toBe(true);
      expect(Number.isFinite(pos[nd.id].y)).toBe(true);
    }
  });

  it("AC4 — an empty canvas yields an empty map (no crash)", () => {
    expect(autoLayout([], [], () => undefined)).toEqual({});
  });
});

// --- regression: the button must read REAL rendered sizes -----------------------------
// getNodes() returns the USER nodes, which never carry `measured` here (our
// onNodesChange ignores dimension changes), so the first cut fell back to
// DEFAULT_W for every box and wide banners (connection wall) still overlapped.
// The fix reads React Flow's INTERNAL node via getInternalNode(id).measured.

describe("measuredSizeOf (124 regression — grown boxes get room)", () => {
  it("adapts getInternalNode → sizeOf, falling back when unmeasured", () => {
    const internal: Record<string, { measured?: { width?: number; height?: number } }> = {
      backend: { measured: { width: 500, height: 230 } },
      llm: { measured: {} }, // mounted but not yet measured
    };
    const sizeOf = measuredSizeOf((id) => internal[id]);
    expect(sizeOf("backend")).toEqual({ width: 500, height: 230 });
    expect(sizeOf("llm")).toBeUndefined();
    expect(sizeOf("ghost")).toBeUndefined();
  });

  it("a wall-grown backend pushes the next column past its real width", () => {
    const nodes = [n("backend", "backend"), n("gw", "aiGateway")];
    const edges = [e("backend", "gw")];
    const sizeOf = measuredSizeOf((id) =>
      id === "backend" ? { measured: { width: 505, height: 230 } } : { measured: {} },
    );
    const pos = autoLayout(nodes, edges, sizeOf);
    expect(pos.gw.x - pos.backend.x).toBeGreaterThanOrEqual(505 + GAP_X);
  });
});
