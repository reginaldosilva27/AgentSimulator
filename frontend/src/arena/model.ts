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
  ROUTING_TAX_CAP,
  ROUTING_TAX_RATE,
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
  /** 103-arena-realism: calls this node receives PER user request (a ReAct turn
   *  makes 2–5 model calls; tools/retrieval may be hit more than once). Default 1.
   *  Set on the gateway OR the LLM behind it — not both (double-count). */
  callsPerRequest?: number;
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
  /** Calls/s arriving at the node — raw inbound × callsPerRequest (may exceed capacity). */
  arriving: number;
  /** 103: calls/s shed past capacity (the honest 429 rate). 0 when healthy. */
  shedRps: number;
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
  /** 105 — fraction of capacity lost to client-side LLM routing (0 when none). */
  routingTax: number;
}

const WARNING_UTIL = 0.7;

/** 103 — Little's Law: N concurrent users each sending a request every T seconds
 *  offer N/T req/s. The store and the presets both derive the modeled rps here. */
export function rpsOf(users: number, thinkTimeSec: number): number {
  return Math.max(0, Math.round(users / Math.max(1, thinkTimeSec)));
}

/** Effective capacity of a node: benchmark × vertical size × horizontal replicas. */
export function effectiveCapacity(spec: Pick<ArenaNodeSpec, "kind" | "size" | "replicas">): number {
  const base = BENCHMARKS[spec.kind].baseCapacity;
  const replicas = Math.max(1, spec.replicas);
  return base * SIZE_MULTIPLIER[spec.size] * replicas;
}

/**
 * 105 — client-side LLM routing tax. A NON-router node wired directly to LLM
 * node(s) manages those deployment endpoints itself (keys, health checks,
 * per-deployment rate-limit bookkeeping, retries in app code) and pays
 * `min(CAP, RATE × (D − 1))` of its capacity, where D = Σ replicas over its
 * direct LLM children. Routers (AI Gateway / Load Balancer) are purpose-built
 * and exempt — inserting one removes the upstream node's tax. Teaching
 * estimate, stated in the UI note.
 */
export function routingTaxFor(
  design: ArenaDesign,
  nodeId: string,
): { tax: number; deployments: number } {
  const node = design.nodes.find((sp) => sp.id === nodeId);
  if (!node || splitsLoad(node.kind)) return { tax: 0, deployments: 0 };
  const byId = new Map(design.nodes.map((sp) => [sp.id, sp]));
  let deployments = 0;
  for (const edge of design.edges) {
    if (edge.source !== nodeId) continue;
    const child = byId.get(edge.target);
    if (child?.kind === "llm") deployments += Math.max(1, child.replicas);
  }
  const tax = Math.min(ROUTING_TAX_CAP, ROUTING_TAX_RATE * Math.max(0, deployments - 1));
  return { tax, deployments };
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
 *  - offered load enters at the `client` node(s) when any exist (103 AC3 — an
 *    unwired stray node idles at 0); with no client, every root is a source
 *    (back-compat with raw designs);
 *  - a node's inbound is scaled by its `callsPerRequest` (103 AC2 — the ReAct
 *    fan-out: one user request → k calls to this node);
 *  - throughput = min(inbound, capacity) — the part that flows on — and the
 *    excess is reported as `shedRps` (the honest 429 rate, 103 AC4);
 *  - routers (LB / AI gateway) split their throughput 1/N across children; every
 *    other kind fans out the full throughput to each child; a cache forwards only
 *    its miss fraction (1 - hitRatio);
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

  // 105 — capacity lost to client-side LLM routing, per node (0 for routers).
  const taxOf = new Map(design.nodes.map((sp) => [sp.id, routingTaxFor(design, sp.id).tax]));

  // 103 AC3 — load enters at client nodes when present; else at every root.
  const hasClient = design.nodes.some((sp) => sp.kind === "client");
  const isSource = (sp: ArenaNodeSpec) =>
    hasClient ? sp.kind === "client" : indegree.get(sp.id) === 0;
  const arriving = new Map<string, number>();
  for (const sp of design.nodes) arriving.set(sp.id, isSource(sp) ? offeredLoad : 0);

  // Kahn topological sort — process each node only after all its parents.
  const queue: string[] = [];
  const remaining = new Map(indegree);
  for (const [id, deg] of remaining) if (deg === 0) queue.push(id);

  const inboundOf = new Map<string, number>(); // effective inbound (× callsPerRequest)
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const spec = nodes.get(id)!;
    const capacity = effectiveCapacity(spec) * (1 - taxOf.get(id)!);
    const inbound = arriving.get(id)! * Math.max(1, spec.callsPerRequest ?? 1);
    inboundOf.set(id, inbound);
    const out = Math.min(inbound, capacity);

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
    const routingTax = taxOf.get(sp.id)!;
    const capacity = effectiveCapacity(sp) * (1 - routingTax);
    if (!reached.has(sp.id)) {
      // Trapped in a cycle — no honest capacity credit (mirrors the reference tool).
      metrics.set(sp.id, {
        arriving: 0,
        shedRps: 0,
        throughput: 0,
        capacity,
        utilization: 0,
        latencyMs: BENCHMARKS[sp.kind].baseLatencyMs,
        status: "unreachable",
        bottleneck: false,
        routingTax,
      });
      continue;
    }
    const inbound = inboundOf.get(sp.id)!;
    const utilization = capacity > 0 ? inbound / capacity : 0;
    metrics.set(sp.id, {
      arriving: inbound,
      shedRps: Math.max(0, inbound - capacity),
      throughput: Math.min(inbound, capacity),
      capacity,
      utilization,
      latencyMs: queueLatency(BENCHMARKS[sp.kind].baseLatencyMs, utilization),
      status: statusFor(utilization),
      bottleneck: utilization > 1,
      routingTax,
    });
  }
  return metrics;
}

/**
 * 103 AC5 — the modeled end-to-end latency: the LONGEST (critical) path of node
 * latencies from a load source to any reachable node, assuming the hops on a
 * path are sequential (an agent turn is: edge → backend → retrieve → generate).
 * Parallel siblings are covered by taking the slowest branch.
 */
export function endToEndLatencyMs(design: ArenaDesign, offeredLoad: number): number {
  const metrics = computeMetrics(design, offeredLoad);
  const indegree = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  const ids = new Set(design.nodes.map((n) => n.id));
  for (const sp of design.nodes) {
    childrenOf.set(sp.id, []);
    indegree.set(sp.id, 0);
  }
  for (const edge of design.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    childrenOf.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }

  // Longest-path DP over the same topological order the metrics used.
  const dist = new Map<string, number>();
  const remaining = new Map(indegree);
  const queue: string[] = [];
  for (const sp of design.nodes) {
    if (indegree.get(sp.id) === 0) {
      queue.push(sp.id);
      dist.set(sp.id, metrics.get(sp.id)!.latencyMs);
    }
  }
  let worst = 0;
  while (queue.length) {
    const id = queue.shift()!;
    const d = dist.get(id)!;
    // Only paths that actually carry load count toward the user-visible latency.
    if (metrics.get(id)!.arriving > 0 || design.nodes.length === 1) worst = Math.max(worst, d);
    for (const kid of childrenOf.get(id)!) {
      const cand = d + metrics.get(kid)!.latencyMs;
      dist.set(kid, Math.max(dist.get(kid) ?? 0, cand));
      remaining.set(kid, remaining.get(kid)! - 1);
      if (remaining.get(kid) === 0) queue.push(kid);
    }
  }
  return worst;
}
