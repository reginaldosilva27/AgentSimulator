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

import { applyFaults, quotaCutFactorFor, faultsOn, type ArenaFault } from "./chaos";
import {
  BENCHMARKS,
  CONCURRENCY_BUDGET_PER_UNIT,
  CROSS_REGION_LATENCY_MS,
  DEFAULT_CALL_SHAPE,
  DEFAULT_MODEL_TIER,
  defaultHitRatioFor,
  isCacheLike,
  LLM_COST_PER_DEPLOYMENT_HOUR_USD,
  llmBaseCapacityFor,
  llmBaseLatencyMsFor,
  llmCostPerCallUsd,
  regionalLlmQuotaRpsFor,
  ROUTING_TAX_CAP,
  ROUTING_TAX_RATE,
  SIZE_MULTIPLIER,
  splitsLoad,
  type ArenaKind,
  type CallShape,
  type InstanceSize,
  type ModelTier,
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
  /** 128 — LLM only: which model SKU runs here (latency + cost, not capacity).
   *  Absent resolves to the `mini` anchor, so pre-128 designs are unchanged. */
  modelTier?: ModelTier;
  /** 131 — DERIVED, set only by `chaos.ts::applyFaults`: scales this node's base
   *  latency (a latency spike / a degraded dependency). Absent = 1. Never
   *  authored by hand or persisted — it is a fault's footprint, not a knob. */
  latencyMultiplier?: number;
  /** 131 — DERIVED, as above: scales this node's capacity (a degraded
   *  dependency you cannot scale). Absent = 1. */
  capacityMultiplier?: number;
}

export interface ArenaEdge {
  id: string;
  source: string;
  target: string;
  /** 120 — optional free-text annotation justifying this connection. The model
   *  ignores it entirely (like a node's `region` in 106 v1); it's canvas content. */
  note?: string;
}

export interface ArenaDesign {
  nodes: ArenaNodeSpec[];
  edges: ArenaEdge[];
  /** 117 — the workload's call shape (tokens per LLM call). Absent = the stated
   *  default (~2k in + 500 out), which reproduces pre-117 behavior exactly. */
  callShape?: CallShape;
  /** 131 — injected faults. Additive exactly like `callShape`: absent or empty
   *  reproduces pre-131 behavior byte-for-byte, and because every derived helper
   *  takes a `design`, all of them inherit chaos with no signature change. */
  faults?: ArenaFault[];
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
  /** 131 — a fault is applied to this box (its own, or its region's outage). */
  faulted: boolean;
  /** 131 — set when this box is starved because an UPSTREAM box is down: the id of
   *  the failure actually responsible, so the starved box is not blamed for it. */
  starvedBy?: string;
  /** 125 — true when EVERY inbound path to this node crosses a queue: the work is
   *  drained off the request path, so its latency never reaches the user-facing
   *  turn and its overload is a BACKLOG, not a shed (429). A property of the
   *  WIRING, not the kind — any node placed behind a queue earns it. */
  async: boolean;
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

/** Effective capacity of a node: benchmark × vertical size × horizontal replicas.
 *  117 — for LLM nodes the base is TPM ÷ tokens at the workload's call shape. */
export function effectiveCapacity(
  spec: Pick<ArenaNodeSpec, "kind" | "size" | "replicas"> & {
    /** 131 — a degraded dependency's capacity cut (absent = 1). */
    capacityMultiplier?: number;
  },
  shape: CallShape = DEFAULT_CALL_SHAPE,
): number {
  const base = spec.kind === "llm" ? llmBaseCapacityFor(shape) : BENCHMARKS[spec.kind].baseCapacity;
  // 131 — ZERO units is now legal and means "serves nothing" (a downed box). The
  // old `Math.max(1, ...)` floor silently gave a dead node a unit of capacity.
  const replicas = Math.max(0, spec.replicas);
  const degraded = spec.capacityMultiplier ?? 1;
  return base * SIZE_MULTIPLIER[spec.size] * replicas * degraded;
}

/**
 * 117/128 — unloaded service latency: shape-derived for the LLM (scaled by its
 * model tier), benchmark elsewhere.
 * 131 — plus the node's fault multiplier (absent = 1). Takes the SPEC rather than
 * the kind, because the figure now depends on the node, not just its kind.
 */
function specLatencyMsOf(spec: ArenaNodeSpec, shape: CallShape): number {
  const base =
    spec.kind === "llm"
      ? llmBaseLatencyMsFor(shape, spec.modelTier ?? DEFAULT_MODEL_TIER)
      : BENCHMARKS[spec.kind].baseLatencyMs;
  return base * (spec.latencyMultiplier ?? 1);
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
  // 123 — the harness itself is exempt (like a router): it holds no endpoints, it
  // runs inside the backend whose tax already covers the routing.
  if (!node || splitsLoad(node.kind) || node.kind === "agentHarness") {
    return { tax: 0, deployments: 0 };
  }
  const byId = new Map(design.nodes.map((sp) => [sp.id, sp]));
  const llmDeploymentsUnder = (parentId: string): number => {
    let d = 0;
    for (const edge of design.edges) {
      if (edge.source !== parentId) continue;
      const child = byId.get(edge.target);
      if (child?.kind === "llm") d += Math.max(1, child.replicas);
    }
    return d;
  };
  let deployments = llmDeploymentsUnder(nodeId);
  // 123 — the harness is TRANSPARENT for the tax: LLM endpoints it fronts are
  // still managed by this node's app code (the harness is that code, in-process),
  // so a harness inserted between the backend and its LLMs leaves the tax exactly
  // where it was. Count the harness's own LLM children too.
  for (const edge of design.edges) {
    if (edge.source !== nodeId) continue;
    if (byId.get(edge.target)?.kind === "agentHarness") {
      deployments += llmDeploymentsUnder(edge.target);
    }
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
  // 117 — the quota is a TOKEN budget: both a pool's capacity and the regional
  // cap are TPM ÷ tokens at the workload's call shape.
  // 131 — a `quotaCut` fault scales a region's ceiling BEFORE 114's proportional
  // squeeze, so the cut is a small extension of an existing rule, not new math.
  const faulted = applyFaults(design);
  const shape = faulted.callShape ?? DEFAULT_CALL_SHAPE;
  const baseQuotaRps = regionalLlmQuotaRpsFor(shape);
  const rawByRegion = new Map<string, number>();
  for (const sp of faulted.nodes) {
    if (sp.kind !== "llm") continue;
    const region = sp.region ?? "unassigned";
    rawByRegion.set(region, (rawByRegion.get(region) ?? 0) + effectiveCapacity(sp, shape));
  }
  const factors = new Map<string, number>();
  for (const sp of faulted.nodes) {
    if (sp.kind !== "llm") {
      factors.set(sp.id, 1);
      continue;
    }
    const region = sp.region ?? "unassigned";
    const raw = rawByRegion.get(region)!;
    const quotaRps = baseQuotaRps * quotaCutFactorFor(design, region);
    factors.set(sp.id, raw > quotaRps ? quotaRps / raw : 1);
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
export function computeMetrics(rawDesign: ArenaDesign, offeredLoad: number): Map<string, NodeMetrics> {
  // 131 — the fault PRE-PASS: everything below runs on the derived design, so the
  // whole model inherits chaos with no second code path. With no faults this is
  // the identity (AC9), and `rawDesign` is only kept to answer "is THIS box
  // faulted?" for the UI marker.
  const design = applyFaults(rawDesign);
  // 117 — the workload call shape drives the LLM tier's capacity + latency.
  const shape = design.callShape ?? DEFAULT_CALL_SHAPE;
  const nodes = new Map(design.nodes.map((sp) => [sp.id, sp]));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const sp of design.nodes) {
    childrenOf.set(sp.id, []);
    parentsOf.set(sp.id, []);
    indegree.set(sp.id, 0);
  }
  for (const edge of design.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    childrenOf.get(edge.source)!.push(edge.target);
    parentsOf.get(edge.target)!.push(edge.source);
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
  const outOf = new Map<string, number>(); // 131 — throughput, for the starvation rule
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const spec = nodes.get(id)!;
    const capacity = effectiveCapacity(spec, shape) * (1 - taxOf.get(id)!) * quotaOf.get(id)!;
    const inbound = arriving.get(id)! * Math.max(1, spec.callsPerRequest ?? 1);
    inboundOf.set(id, inbound);
    const out = Math.min(inbound, capacity);
    outOf.set(id, out);

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

  // 125 — async detection: a node is async when it has parents AND every parent is
  // a queue OR is itself async — i.e. EVERY inbound path crosses a queue. Computed
  // in topological order so every parent's flag is known first. A synchronous path
  // to the node (a diamond with one direct parent) keeps it synchronous.
  const asyncSet = new Set<string>();
  for (const id of order) {
    const parents = parentsOf.get(id)!;
    if (parents.length === 0) continue; // a source is synchronous
    const allViaQueue = parents.every(
      (p) => nodes.get(p)!.kind === "queue" || asyncSet.has(p),
    );
    if (allViaQueue) asyncSet.add(id);
  }

  // 131 AC2 — STARVATION: a node whose every inbound path is dead (all parents pass
  // on nothing) carries no honest traffic, so it reads `unreachable` rather than a
  // misleading "healthy at 0%". Walked in topological order, so `starvedBy` can
  // name the failure ACTUALLY responsible — the first downed ancestor, not the
  // innocent box in front of it.
  const starvedBy = new Map<string, string>();
  for (const id of order) {
    const parents = parentsOf.get(id)!;
    if (parents.length === 0) continue;
    if (parents.some((pid) => (outOf.get(pid) ?? 0) > 0)) continue; // a live path survives
    // Every path is dead: inherit the deepest named cause, else blame the parent
    // that is itself down/empty.
    const cause =
      parents.map((pid) => starvedBy.get(pid)).find((c): c is string => !!c) ??
      parents.find((pid) => (outOf.get(pid) ?? 0) === 0);
    if (cause) starvedBy.set(id, cause);
  }

  const metrics = new Map<string, NodeMetrics>();
  for (const sp of design.nodes) {
    const routingTax = taxOf.get(sp.id)!;
    const quotaFactor = quotaOf.get(sp.id)!;
    const capacity = effectiveCapacity(sp, shape) * (1 - routingTax) * quotaFactor;
    // 131 — read the fault marker off the RAW design: `applyFaults` has already
    // erased the fault into plain spec values by this point.
    const faulted = faultsOn(rawDesign, sp.id).length > 0;
    if (!reached.has(sp.id)) {
      // Trapped in a cycle — no honest capacity credit (mirrors the reference tool).
      metrics.set(sp.id, {
        arriving: 0,
        shedRps: 0,
        throughput: 0,
        capacity,
        utilization: 0,
        latencyMs: specLatencyMsOf(sp, shape),
        status: "unreachable",
        bottleneck: false,
        routingTax,
        quotaFactor,
        faulted,
        async: false,
      });
      continue;
    }
    const inbound = inboundOf.get(sp.id)!;
    // 131 — capacity 0 with work arriving is FULLY saturated, not idle: the old
    // `capacity > 0 ? … : 0` reported a downed box as 0% utilized. Reported as 1
    // (not Infinity) so headroom and every other aggregate stay finite.
    const utilization = capacity > 0 ? inbound / capacity : inbound > 0 ? 1 : 0;
    const starved = starvedBy.get(sp.id);
    metrics.set(sp.id, {
      arriving: inbound,
      shedRps: Math.max(0, inbound - capacity),
      throughput: Math.min(inbound, capacity),
      capacity,
      utilization,
      latencyMs: queueLatency(specLatencyMsOf(sp, shape), utilization),
      status: starved !== undefined ? "unreachable" : statusFor(utilization),
      bottleneck: utilization > 1 || (capacity === 0 && inbound > 0),
      routingTax,
      quotaFactor,
      faulted,
      ...(starved !== undefined ? { starvedBy: starved } : {}),
      async: asyncSet.has(sp.id),
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
    // 125 — an ASYNC child (drained off the request path behind a queue) is NOT
    // awaited: its latency never reaches the user-facing turn. The queue's own
    // enqueue latency still counts (the queue itself is synchronous).
    const kids = childrenOf
      .get(id)!
      .filter((kid) => !metrics.get(kid)!.async)
      .map((kid) => {
        const child = byId.get(kid)!;
        const cross = spec.region && child.region && spec.region !== child.region;
        return pathOf(kid) + (cross ? CROSS_REGION_LATENCY_MS : 0);
      });
    const downstream =
      kids.length === 0
        ? 0
        : // 123 — the backend AND the agent harness orchestrate the turn: their
          // branches (retrieve → generate) run in SEQUENCE, so they SUM. Every
          // other kind fans one call to alternatives → max.
          spec.kind === "backend" || spec.kind === "agentHarness"
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
    // 125 — an ASYNC child is not awaited synchronously (backlog, not held
    // streams), so its saturation must NOT null this node's held figure.
    const sat =
      metrics.get(id)!.bottleneck ||
      childrenOf
        .get(id)!
        .filter((kid) => !metrics.get(kid)!.async)
        .some(satOf);
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
 * 118-arena-backend-concurrency — the held-stream budget of a node: per-unit
 * benchmark × size × replicas, or `null` for kinds with no stated wall.
 */
export function concurrencyBudgetFor(
  spec: Pick<ArenaNodeSpec, "kind" | "size" | "replicas">,
): number | null {
  const perUnit = CONCURRENCY_BUDGET_PER_UNIT[spec.kind];
  if (perUnit === undefined) return null;
  return perUnit * SIZE_MULTIPLIER[spec.size] * Math.max(1, spec.replicas);
}

/** 118 — connection pressure: held ÷ budget; null when either side has no honest
 *  figure (a shedding path yields held = null; most kinds have no budget). */
export function concurrencyPressure(held: number | null, budget: number | null): number | null {
  if (held === null || budget === null || budget <= 0) return null;
  return held / budget;
}

/** 118 — pressure through the same 108 thresholds the QPS status uses. */
export function concurrencyStatusFor(
  held: number | null,
  budget: number | null,
): Exclude<NodeStatus, "unreachable"> | null {
  const p = concurrencyPressure(held, budget);
  return p === null ? null : statusFor(p);
}

const STATUS_RANK: Record<NodeStatus, number> = {
  healthy: 0,
  warning: 1,
  critical: 2,
  unreachable: 3,
};

/** 118 — a node's effective status is the WORSE of its independent signals. */
export function worseStatus(a: NodeStatus, b: NodeStatus): NodeStatus {
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
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
  const shape = design.callShape ?? DEFAULT_CALL_SHAPE;
  let provisionedPerHour = 0;
  let usagePerHour = 0;
  for (const sp of design.nodes) {
    if (sp.kind !== "llm") continue;
    provisionedPerHour +=
      Math.max(1, sp.replicas) * SIZE_MULTIPLIER[sp.size] * LLM_COST_PER_DEPLOYMENT_HOUR_USD;
    // 117/128 — the usage bill prices the workload's call shape at THIS node's tier.
    const perCallUsd = llmCostPerCallUsd(shape, sp.modelTier);
    usagePerHour += metrics.get(sp.id)!.throughput * perCallUsd * 3600;
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

/**
 * 123 — the turn fan-out the harness surfaces (Design A, display-only): the LLM
 * calls one agent turn makes, read from the harness's model-path child. That
 * child is either an LLM directly or an AI Gateway fronting a pool — both carry
 * `callsPerRequest` (the fan-out lives on whichever the backend talks to, never
 * both). Returns `null` when the harness has no model-path child wired yet.
 */
export function fanOutFor(design: ArenaDesign, harnessId: string): number | null {
  const byId = new Map(design.nodes.map((sp) => [sp.id, sp]));
  let fanOut: number | null = null;
  for (const edge of design.edges) {
    if (edge.source !== harnessId) continue;
    const child = byId.get(edge.target);
    if (child && (child.kind === "llm" || child.kind === "aiGateway")) {
      fanOut = Math.max(fanOut ?? 0, Math.max(1, child.callsPerRequest ?? 1));
    }
  }
  return fanOut;
}
