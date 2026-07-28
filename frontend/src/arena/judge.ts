// 133-arena-ai-judge — the client for the Arena's one backend route.
//
// This is the only place the Arena talks to a server. Everything else on the page
// is pure frontend computation, and that stays true: the request carries the
// figures the pure model ALREADY derived (see the backend's judge.py for why the
// model is not ported to Python), and the response is prose plus an echo of the
// deterministic verdict.

import { isDemo } from "../lib/demo";
import { API_BASE } from "../lib/sse";
import type { Lang } from "../i18n";
import { KIND_META } from "./components";
import { formatLatency, formatQps } from "./format";
import type { ArenaFault } from "./chaos";
import type { ArenaEdge } from "./model";
import type { DesignMeasurement, SloVerdict } from "./slo";
import type { ArenaNode } from "./store";

export interface JudgeCritique {
  rigorous: string;
  pragmatic: string;
  agreed: string;
  /** Echoed back from the request — the judge cannot reinterpret the arithmetic. */
  verdict_met: boolean;
  model: string;
}

/** Why a review is unavailable, when it is. `null` means it can run. */
export type JudgeUnavailable = "demo" | "no_provider" | "rate_limited" | "failed" | null;

export class JudgeError extends Error {
  constructor(readonly reason: Exclude<JudgeUnavailable, null>) {
    super(reason);
  }
}

/** One line per box, in the vocabulary the user sees on the canvas. */
function describeNodes(nodes: ArenaNode[], lang: Lang): string[] {
  return nodes.map((n) => {
    const parts = [`${KIND_META[n.kind].label[lang]} "${n.id}"`, `${n.replicas} unit(s)`, n.size];
    if (n.region) parts.push(n.region);
    if (n.modelTier) parts.push(`${n.modelTier} tier`);
    if (n.callsPerRequest && n.callsPerRequest > 1) parts.push(`${n.callsPerRequest} calls/turn`);
    if (n.hitRatio !== undefined) parts.push(`hit ratio ${Math.round(n.hitRatio * 100)}%`);
    return parts.join(" — ");
  });
}

function describeEdges(nodes: ArenaNode[], edges: ArenaEdge[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => `${e.source} → ${e.target}`);
}

function describeMetrics(m: DesignMeasurement, faults: ArenaFault[]): string[] {
  const lines = [
    `end-to-end latency of one agent turn: ${formatLatency(m.e2eLatencyMs)}${
      m.atLatencyCeiling ? " (at the model's ceiling — treat as a floor)" : ""
    }`,
    `headroom on the busiest box: ${Math.round(m.headroomPct * 100)}%`,
    `dropped requests: ${formatQps(m.shedRps)}/s`,
    `model spend: $${Math.round(m.costPerHourUsd).toLocaleString("en-US")}/h`,
    `effective request rate at equilibrium: ${formatQps(m.offeredLoad)}/s of ${formatQps(
      m.demandRps,
    )}/s demanded`,
  ];
  if (m.busiestNodeId) lines.push(`busiest box: ${m.busiestNodeId}`);
  if (faults.length > 0) {
    lines.push(
      `NOTE: these figures are measured with ${faults.length} fault(s) applied: ${faults
        .map((f) => `${f.type}${f.nodeId ? ` on ${f.nodeId}` : ""}${f.region ? ` in ${f.region}` : ""}`)
        .join(", ")}`,
    );
  }
  return lines;
}

export interface JudgeRequestInput {
  nodes: ArenaNode[];
  edges: ArenaEdge[];
  faults: ArenaFault[];
  measurement: DesignMeasurement;
  verdict: SloVerdict;
  users: number;
  thinkTimeSec: number;
  challenge?: string | null;
  lang: Lang;
}

/** Compose the request body. Exported so a test can assert what is sent. */
export function buildJudgeRequest(input: JudgeRequestInput) {
  return {
    design: describeNodes(input.nodes, input.lang),
    connections: describeEdges(input.nodes, input.edges),
    load: `${input.users.toLocaleString("en-US")} concurrent users, one message every ${
      input.thinkTimeSec
    }s`,
    metrics: describeMetrics(input.measurement, input.faults),
    objectives: input.verdict.results.map((r) => ({
      metric: r.metric,
      target: r.target,
      actual: r.actual,
      met: r.met,
    })),
    verdict_met: input.verdict.met,
    // 120 — the architect's own justifications. The backend wraps these in an
    // explicitly-untrusted block; we only forward them.
    notes: [
      ...input.nodes.filter((n) => n.note).map((n) => `${n.id}: ${n.note}`),
      ...input.edges.filter((e) => e.note).map((e) => `${e.source}→${e.target}: ${e.note}`),
    ],
    challenge: input.challenge ?? null,
    lang: input.lang,
  };
}

/**
 * Ask for a review. Rejects with a `JudgeError` carrying a machine-readable reason
 * so the UI can say WHY it is unavailable instead of failing vaguely.
 *
 * In the demo build there is no backend at all, so no request is attempted.
 */
export async function requestJudgement(
  input: JudgeRequestInput,
  signal?: AbortSignal,
): Promise<JudgeCritique> {
  if (isDemo()) throw new JudgeError("demo");

  const resp = await fetch(`${API_BASE}/api/arena/judge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildJudgeRequest(input)),
    signal,
  });

  if (!resp.ok) {
    if (resp.status === 503) throw new JudgeError("no_provider");
    if (resp.status === 429) throw new JudgeError("rate_limited");
    throw new JudgeError("failed");
  }
  return (await resp.json()) as JudgeCritique;
}
