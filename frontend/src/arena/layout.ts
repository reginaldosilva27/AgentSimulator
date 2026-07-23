// 124-arena-auto-arrange — the pure layered layout behind the tidy button.
// Node boxes grow at runtime (connection-wall/bottleneck banners, badges), so a
// hand-placed design overlaps as boxes expand. `autoLayout` reflows the design:
// columns by graph depth (left→right along the wiring), rows stacked inside a
// column with breathing room from each box's REAL rendered size (measured by
// React Flow; a stated default when unmeasured, e.g. first paint or jsdom).
//
// Pure and dependency-free on purpose: the Arena graph is a shallow DAG, so a
// longest-path layering + order-preserving stacking covers it — no dagre/elk.

import type { ArenaEdge } from "./model";
import type { ArenaNode } from "./store";

/** Horizontal gap between columns / vertical gap between stacked boxes. */
export const GAP_X = 90;
export const GAP_Y = 48;

/** Fallback box size when the node hasn't been measured yet. */
export const DEFAULT_W = 190;
export const DEFAULT_H = 130;

export interface BoxSize {
  width: number;
  height: number;
}

/**
 * Adapt React Flow's `getInternalNode` into a `sizeOf` for `autoLayout`.
 * The REAL rendered dimensions live on the INTERNAL node (`measured`) — the
 * user nodes returned by `getNodes()` never carry them here, because our
 * controlled `onNodesChange` ignores dimension changes (that was the 124 bug:
 * every box fell back to DEFAULT_W and wall-grown banners still overlapped).
 */
export function measuredSizeOf(
  getInternalNode: (id: string) => { measured?: { width?: number; height?: number } } | undefined,
): (id: string) => BoxSize | undefined {
  return (id) => {
    const m = getInternalNode(id)?.measured;
    return m?.width && m?.height ? { width: m.width, height: m.height } : undefined;
  };
}

/**
 * Compute tidy positions for every node: `depth(n)` = longest path from a
 * source (in-degree 0), relaxed at most `nodes.length` times so user-drawn
 * cycles terminate (their members settle on close depths — finite, AC5).
 * Inside a column nodes keep their current top-down order (AC2); each column
 * is centered on the overall vertical midline.
 */
export function autoLayout(
  nodes: ArenaNode[],
  edges: ArenaEdge[],
  sizeOf: (id: string) => BoxSize | undefined,
): Record<string, { x: number; y: number }> {
  if (nodes.length === 0) return {};

  // --- layering: longest-path depth, cycle-safe (bounded relaxation) ---------
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      const ds = depth.get(e.source);
      const dt = depth.get(e.target);
      if (ds === undefined || dt === undefined) continue; // dangling edge
      if (ds + 1 > dt) {
        depth.set(e.target, ds + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // --- columns: group by depth, preserving the current vertical order --------
  const columns = new Map<number, ArenaNode[]>();
  for (const n of nodes) {
    const d = depth.get(n.id)!;
    const col = columns.get(d);
    if (col) col.push(n);
    else columns.set(d, [n]);
  }
  const size = (id: string): BoxSize => sizeOf(id) ?? { width: DEFAULT_W, height: DEFAULT_H };

  const pos: Record<string, { x: number; y: number }> = {};
  let x = 0;
  for (const d of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(d)!.slice().sort((a, b) => a.y - b.y);
    const totalH =
      col.reduce((sum, n) => sum + size(n.id).height, 0) + GAP_Y * (col.length - 1);
    let y = -totalH / 2; // center every column on the shared midline
    let widest = 0;
    for (const n of col) {
      const s = size(n.id);
      pos[n.id] = { x, y };
      y += s.height + GAP_Y;
      widest = Math.max(widest, s.width);
    }
    x += widest + GAP_X;
  }
  return pos;
}
