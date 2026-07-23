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
  CROSS_REGION_LATENCY_MS,
  defaultHitRatioFor,
  isCacheLike,
  LLM_COST_PER_CALL_USD,
  LLM_COST_PER_DEPLOYMENT_HOUR_USD,
  REGIONAL_LLM_QUOTA_RPS,
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
  /** 106/114 — region annotation. Since 114 it has teeth: LLM pools sharing a
   *  region share the regional quota, and cross-region hops add latency. */
  region?: string;
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
  /** 114 — fraction of an LLM pool's capacity the regional quota allows (1 when
   *  the region is under quota; < 1 squeezes every pool in the region equally). */
  quotaFactor: number;
}

const WARNING_UTIL = 0.7;
/** 108 — near-saturation reads red: past ~90% the queueing curve is already
 *  catastrophic (latency ×10+) even though nothing is shed yet. */
const CRITICAL_UTIL = 0.9;

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

/**
 * 114 — the regional LLM quota. LLM pools sharing a region (or the implicit
 * "unassigned" pool when no badge is set — the cap can't be dodged by clearing
 * it) share `REGIONAL_LLM_QUOTA_RPS`: past it, every pool in the region is
 * squeezed proportionally (order-independent, all equally limited).
 */
export function quotaFactorsFor(design: ArenaDesign): Map<string, number> {
  const rawByRegion = new Map<string, number>();
  for (const sp of design.nodes) {
    if (sp.kind !== "llm") continue;
    const region = sp.region ?? "unassigned";
    rawByRegion.set(region, (rawByRegion.get(region) ?? 0) + effectiveCapacity(sp));
  }
  const factors = new Map<string, number>();
  for (const sp of design.nodes) {
    if (sp.kind !== "llm") {
      factors.set(sp.id, 1);
      continue;
    }
    const raw = rawByRegion.get(sp.region ?? "unassigned")!;
    factors.set(sp.id, raw > REGIONAL_LLM_QUOTA_RPS ? REGIONAL_LLM_QUOTA_RPS / raw : 1);
  }
  return factors;
}

/** Queueing curve: base / (1 - min(util, 0.99)). Monotonic; clamps near saturation. */
function queueLatency(baseLatencyMs: number, utilization: number): number {
  const u = Math.min(Math.max(utilization, 0), 0.99);
  return baseLatencyMs / (1 - u);
}

function statusFor(utilization: number): Exclude<NodeStatus, "unreachable"> {
  if (utilization >= CRITICAL_UTIL) return "critical";
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
  // 114 — the regional quota squeeze on LLM pools (1 for everything else).
  const quotaOf = quotaFactorsFor(design);

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
    const capacity = effectiveCapacity(spec) * (1 - taxOf.get(id)!) * quotaOf.get(id)!;
    const inbound = arriving.get(id)! * Math.max(1, spec.callsPerRequest ?? 1);
    inboundOf.set(id, inbound);
    const out = Math.min(inbound, capacity);

    const kids = childrenOf.get(id)!;
    if (kids.length) {
      // 112 — cache-like kinds serve their hit fraction locally (key-value cache
      // on the data path, semantic cache on the model path); misses flow on.
      const hit = isCacheLike(spec.kind) ? (spec.hitRatio ?? defaultHitRatioFor(spec.kind)) : 0;
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
    const quotaFactor = quotaOf.get(sp.id)!;
    const capacity = effectiveCapacity(sp) * (1 - routingTax) * quotaFactor;
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
        quotaFactor,
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
      quotaFactor,
    });
  }
  return metrics;
}

/**
 * 109 — per-node AGENT-TURN path latency (supersedes the 103 longest-path DP):
 *
 *   pathLatency(n) = cpr(n) × ( latency(n) + combine(children) )
 *   combine = Σ   for a `backend` (it orchestrates the turn: retrieve → generate
 *                 run in SEQUENCE, so its branches sum)
 *           = max otherwise (a router fans ONE call to one pool — alternatives —
 *                 and pass-through chains have a single child anyway)
 *
 * `callsPerRequest` multiplies the node's latency AND the branch behind it: k
 * serialized model calls each traverse the gateway + model (which is why the cpr
 * lives on the gateway OR the model, never both — 103's no-double-count rule).
 * Worst-case turn: cache misses charge the full miss path; the slowest pool wins.
 * Nodes trapped in a cycle (`unreachable`) contribute 0 — no honest latency credit.
 */
export function turnPathLatenciesMs(
  design: ArenaDesign,
  offeredLoad: number,
): Map<string, number> {
  const metrics = computeMetrics(design, offeredLoad);
  const byId = new Map(design.nodes.map((sp) => [sp.id, sp]));
  const childrenOf = new Map<string, string[]>();
  for (const sp of design.nodes) childrenOf.set(sp.id, []);
  for (const edge of design.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    childrenOf.get(edge.source)!.push(edge.target);
  }

  const memo = new Map<string, number>();
  const pathOf = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const m = metrics.get(id)!;
    if (m.status === "unreachable") {
      memo.set(id, 0); // cycle member — also cuts the recursion
      return 0;
    }
    const spec = byId.get(id)!;
    memo.set(id, 0); // guard: a reachable node pointing into a cycle terminates
    // 114 — a hop whose endpoints declare DIFFERENT regions pays the RTT penalty.
    const kids = childrenOf.get(id)!.map((kid) => {
      const child = byId.get(kid)!;
      const cross = spec.region && child.region && spec.region !== child.region;
      return pathOf(kid) + (cross ? CROSS_REGION_LATENCY_MS : 0);
    });
    const downstream =
      kids.length === 0
        ? 0
        : spec.kind === "backend"
          ? kids.reduce((a, b) => a + b, 0)
          : Math.max(...kids);
    const total = Math.max(1, spec.callsPerRequest ?? 1) * (m.latencyMs + downstream);
    memo.set(id, total);
    return total;
  };
  for (const sp of design.nodes) pathOf(sp.id);
  return memo;
}

/**
 * 113 — held in-flight per node, by Little's Law: `throughput × time-in-system`.
 * Time-in-system for an orchestrating node is its own latency PLUS the downstream
 * turn it synchronously awaits (109's turn-path, without this node's own cpr —
 * throughput already counts each call). This is the number that fells real agent
 * backends: connections/SSE streams held for the whole turn exhaust pools and
 * memory long before CPU does. `null` when the awaited path sheds — a figure
 * built on the clamped queue latency would be fiction (108's honesty rule).
 */
export function heldInFlight(design: ArenaDesign, offeredLoad: number): Map<string, number | null> {
  const metrics = computeMetrics(design, offeredLoad);
  const paths = turnPathLatenciesMs(design, offeredLoad);
  const byId = new Map(design.nodes.map((sp) => [sp.id, sp]));
  const childrenOf = new Map<string, string[]>();
  for (const sp of design.nodes) childrenOf.set(sp.id, []);
  for (const edge of design.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    childrenOf.get(edge.source)!.push(edge.target);
  }
  // Does this node's awaited subtree (itself included) shed anywhere?
  const satMemo = new Map<string, boolean>();
  const satOf = (id: string): boolean => {
    const cached = satMemo.get(id);
    if (cached !== undefined) return cached;
    satMemo.set(id, false); // cycle guard (cycle members are unreachable anyway)
    const sat = metrics.get(id)!.bottleneck || childrenOf.get(id)!.some(satOf);
    satMemo.set(id, sat);
    return sat;
  };
  const out = new Map<string, number | null>();
  for (const sp of design.nodes) {
    if (satOf(sp.id)) {
      out.set(sp.id, null);
      continue;
    }
    const cpr = Math.max(1, sp.callsPerRequest ?? 1);
    const heldMs = paths.get(sp.id)! / cpr; // per-request held time (own + awaited)
    out.set(sp.id, (metrics.get(sp.id)!.throughput * heldMs) / 1000);
  }
  return out;
}

/**
 * 111 — the two LLM bills. Provisioned: reserved capacity (PTU-style) priced per
 * deployment × size, billed even idle — headroom is never free. Usage: served
 * calls (429s aren't billed) at the stated per-call shape. Both are teaching
 * estimates; the constants live in components.ts with their assumptions.
 */
export function llmCost(
  design: ArenaDesign,
  offeredLoad: number,
): { provisionedPerHour: number; usagePerHour: number } {
  const metrics = computeMetrics(design, offeredLoad);
  let provisionedPerHour = 0;
  let usagePerHour = 0;
  for (const sp of design.nodes) {
    if (sp.kind !== "llm") continue;
    provisionedPerHour +=
      Math.max(1, sp.replicas) * SIZE_MULTIPLIER[sp.size] * LLM_COST_PER_DEPLOYMENT_HOUR_USD;
    usagePerHour += metrics.get(sp.id)!.throughput * LLM_COST_PER_CALL_USD * 3600;
  }
  return { provisionedPerHour, usagePerHour };
}

/**
 * 110 — closed-loop equilibrium. A population of N users is a CLOSED system: a
 * user waiting on a response is not sending the next message, so the offered
 * rate self-throttles to `users / (thinkTime + responseTime)`. This solves that
 * fixed point — `rps = users / (think + e2eSec(rps))` — by damped iteration
 * (deterministic, pure: no randomness, no time). e2eSec is monotonically
 * non-decreasing in rps and bounded (the 0.99 clamp), so the damped map
 * converges; the iteration cap is the backstop.
 */
export function equilibriumRps(design: ArenaDesign, users: number, thinkTimeSec: number): number {
  const think = Math.max(1, thinkTimeSec);
  const demand = Math.max(0, users) / think;
  if (demand === 0 || design.nodes.length === 0) return demand;
  // g(rps) = rps − users/(think + L(rps)) is monotone increasing (L is
  // non-decreasing in rps), with g(0) < 0 and g(demand) ≥ 0 — bisection finds
  // the unique root robustly even on the near-saturation cliff where a damped
  // iteration would limit-cycle. 60 halvings ≫ the 1 rps tolerance.
  const g = (rps: number) =>
    rps - Math.max(0, users) / (think + endToEndLatencyMs(design, rps) / 1000);
  let lo = 0;
  let hi = demand;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid;
    else hi = mid;
    if (hi - lo <= 0.25) break;
  }
  return (lo + hi) / 2;
}

/**
 * 103 AC5 (math revised by 109) — the modeled end-to-end latency of one agent
 * turn: the worst turn-path latency among the load-carrying sources.
 */
export function endToEndLatencyMs(design: ArenaDesign, offeredLoad: number): number {
  const metrics = computeMetrics(design, offeredLoad);
  const paths = turnPathLatenciesMs(design, offeredLoad);
  const indegree = new Map<string, number>(design.nodes.map((sp) => [sp.id, 0]));
  const ids = new Set(design.nodes.map((sp) => sp.id));
  for (const edge of design.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  const hasClient = design.nodes.some((sp) => sp.kind === "client");
  let worst = 0;
  for (const sp of design.nodes) {
    const isSource = hasClient ? sp.kind === "client" : indegree.get(sp.id) === 0;
    if (!isSource) continue;
    // Only sources that actually carry load count toward the user-visible latency.
    if (metrics.get(sp.id)!.arriving > 0 || design.nodes.length === 1) {
      worst = Math.max(worst, paths.get(sp.id)!);
    }
  }
  return worst;
}
