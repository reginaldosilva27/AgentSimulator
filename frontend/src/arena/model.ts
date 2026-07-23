// 100-arena-capacity-sandbox — the pure, deterministic capacity model.
//
// No randomness, no time, no network. `computeMetrics(design, offeredLoad)` is
// the one function the whole Arena page projects from: it propagates offered
// load through the wired graph and returns per-node QPS / utilization / latency
// / status. Being pure + synchronous, it recomputes on every edit ("real time")
// and is trivially unit-testable (see `model.test.ts`, AC1–AC7).
//
// This is a MODEL (constitution §3): analytical arithmetic over the stated
// benchmarks in `components.ts`, not a live load test. It never sends traffic
// anywhere and emits no TraceEvents.

import {
  BENCHMARKS,
  DEFAULT_HIT_RATIO,
  SIZE_MULTIPLIER,
  splitsLoad,
  type ArenaKind,
  type InstanceSize,
} from "./components";

export interface ArenaNodeSpec {
  id: string;
  kind: ArenaKind;
  size: InstanceSize;
  /** Horizontal scaling — replica count (≥ 1). */
  replicas: number;
  /** Cache only: fraction served locally (0..1); only `1 - hitRatio` flows on. */
  hitRatio?: number;
}

export interface ArenaEdge {
  id: string;
  source: string;
  target: string;
}

export interface ArenaDesign {
  nodes: ArenaNodeSpec[];
  edges: ArenaEdge[];
}

export type NodeStatus = "healthy" | "warning" | "critical" | "unreachable";

export interface NodeMetrics {
  /** RPS arriving at the node (may exceed capacity). */
  arriving: number;
  /** RPS flowing out — min(arriving, capacity); collapses downstream flow. */
  throughput: number;
  /** Effective capacity — baseCapacity × sizeMultiplier × replicas. */
  capacity: number;
  /** arriving / capacity (can exceed 1). */
  utilization: number;
  /** Queueing latency (ms), rising as utilization → 1. */
  latencyMs: number;
  status: NodeStatus;
  /** True when over capacity (utilization > 1) — a bottleneck. */
  bottleneck: boolean;
}

const WARNING_UTIL = 0.7;

/** Effective capacity of a node: benchmark × vertical size × horizontal replicas. */
export function effectiveCapacity(spec: Pick<ArenaNodeSpec, "kind" | "size" | "replicas">): number {
  const base = BENCHMARKS[spec.kind].baseCapacity;
  const replicas = Math.max(1, spec.replicas);
  return base * SIZE_MULTIPLIER[spec.size] * replicas;
}

/** Queueing curve: base / (1 - min(util, 0.99)). Monotonic; clamps near saturation. */
function queueLatency(baseLatencyMs: number, utilization: number): number {
  const u = Math.min(Math.max(utilization, 0), 0.99);
  return baseLatencyMs / (1 - u);
}

function statusFor(utilization: number): Exclude<NodeStatus, "unreachable"> {
  if (utilization > 1) return "critical";
  if (utilization >= WARNING_UTIL) return "warning";
  return "healthy";
}

/**
 * Propagate `offeredLoad` (RPS) through `design` and return per-node metrics.
 *
 * Accumulation (Kahn topological order):
 *  - root nodes (no incoming edge) each receive the full offered load;
 *  - a node's throughput = min(arriving, capacity) — the part that flows on;
 *  - a load balancer splits its throughput 1/N across children; every other kind
 *    fans out the full throughput to each child; a cache forwards only its miss
 *    fraction (1 - hitRatio);
 *  - nodes trapped in a cycle never reach in-degree 0 → marked `unreachable`.
 */
export function computeMetrics(design: ArenaDesign, offeredLoad: number): Map<string, NodeMetrics> {
  const nodes = new Map(design.nodes.map((sp) => [sp.id, sp]));
  const childrenOf = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const sp of design.nodes) {
    childrenOf.set(sp.id, []);
    indegree.set(sp.id, 0);
  }
  for (const edge of design.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    childrenOf.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  // Offered load enters at the roots (no incoming edges).
  const arriving = new Map<string, number>();
  for (const sp of design.nodes) arriving.set(sp.id, indegree.get(sp.id) === 0 ? offeredLoad : 0);

  // Kahn topological sort — process each node only after all its parents.
  const queue: string[] = [];
  const remaining = new Map(indegree);
  for (const [id, deg] of remaining) if (deg === 0) queue.push(id);

  const throughput = new Map<string, number>();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const spec = nodes.get(id)!;
    const capacity = effectiveCapacity(spec);
    const out = Math.min(arriving.get(id)!, capacity);
    throughput.set(id, out);

    const kids = childrenOf.get(id)!;
    if (kids.length) {
      const hit = spec.kind === "cache" ? (spec.hitRatio ?? DEFAULT_HIT_RATIO) : 0;
      const forwarded = out * (1 - hit);
      const perChild = splitsLoad(spec.kind) ? forwarded / kids.length : forwarded;
      for (const kid of kids) {
        arriving.set(kid, (arriving.get(kid) ?? 0) + perChild);
        remaining.set(kid, remaining.get(kid)! - 1);
        if (remaining.get(kid) === 0) queue.push(kid);
      }
    }
  }

  const reached = new Set(order);
  const metrics = new Map<string, NodeMetrics>();
  for (const sp of design.nodes) {
    const capacity = effectiveCapacity(sp);
    if (!reached.has(sp.id)) {
      // Trapped in a cycle — no honest capacity credit (mirrors the reference tool).
      metrics.set(sp.id, {
        arriving: 0,
        throughput: 0,
        capacity,
        utilization: 0,
        latencyMs: BENCHMARKS[sp.kind].baseLatencyMs,
        status: "unreachable",
        bottleneck: false,
      });
      continue;
    }
    const inbound = arriving.get(sp.id)!;
    const utilization = capacity > 0 ? inbound / capacity : 0;
    metrics.set(sp.id, {
      arriving: inbound,
      throughput: Math.min(inbound, capacity),
      capacity,
      utilization,
      latencyMs: queueLatency(BENCHMARKS[sp.kind].baseLatencyMs, utilization),
      status: statusFor(utilization),
      bottleneck: utilization > 1,
    });
  }
  return metrics;
}
