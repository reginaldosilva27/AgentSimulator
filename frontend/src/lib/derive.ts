// Pure projection of the event log into what the canvas renders. Driving the
// view from "events up to a cursor" makes live streaming and step/replay the
// exact same code path — replay is just a smaller cursor.

import type { TraceEvent } from "../types/events";
import type { StationId } from "./stations";
import { HOP_PAIRS, STAGE_TO_STATION, STATION_IDS } from "./stations";
import { tallyUsage } from "./usage";

// 093-waf-block-visualization: "blocked" is the WAF's terminal state when it 403s a
// request — the request stops there and never reaches the backend.
export type StationStatus = "idle" | "active" | "done" | "blocked";

// 093 — a WAF block has NO server trace (the backend never runs), so it's modeled
// as a distinct outcome (held in the store, threaded into deriveView) rather than
// fabricated TraceEvents. Only the WAF blocks in this app (the sole 403 source).
export interface BlockedOutcome {
  at: "waf";
  httpStatus: number; // 403
  message: string; // the payload that was blocked
}

// The path the request physically traverses before the WAF (the front door + the
// pre-WAF appliances). On a block these render "reached"; the WAF renders "blocked";
// everything downstream stays "idle" (never reached).
const PRE_WAF_PATH: StationId[] = ["frontend", "dns", "cdn", "lb"];

export interface StationRuntime {
  status: StationStatus;
  events: TraceEvent[];
  latencyMs?: number;
}

/** One leg of the route the packet is currently travelling. */
export interface ActiveHop {
  id: string; // matches the edge id `${source}-${target}`
  reverse: boolean; // packet runs target→source relative to the edge direction
}

// 011-token-cost: real token usage + US$ cost, summed across every LLM call in
// the run (each reasoning round's decide on `agent.think` + the final generation
// on `llm.generate`). Accumulates with the cursor so the LLM block updates live.
export interface UsageTotals {
  rounds: number; // number of LLM calls (decide rounds + the generation)
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  // 099-prompt-caching — cached input tokens across the run's LLM calls and the
  // US$ they saved vs. the all-fresh price. 0 when nothing was cached.
  cachedTokens: number;
  costSavedUsd: number;
}

export interface DerivedView {
  stations: Record<StationId, StationRuntime>;
  activeStation: StationId | null;
  // The legs currently animating. The architecture is hub-and-spoke, so two
  // stations that aren't directly wired (e.g. mcp → rag) animate via the path
  // through their hub (mcp → agent → rag) — every leg is a real network edge.
  // Only the current leg(s) light up; edges go quiet once the packet passes
  // (a moving spotlight) — step through the timeline to revisit a stage.
  activeHops: ActiveHop[];
  // The SSE response streaming back to the client (frontend↔backend edge).
  streaming: boolean;
  answer: string;
  iterations: number; // agent reasoning turns so far
  usage: UsageTotals; // real tokens + cost across the run's LLM calls (011)
  // 029-ttft-throughput: real generation metrics off the llm.generate END event.
  // Both optional — absent on a legacy/replayed trace or a run with no tokens, so
  // the LLM readout omits the rows rather than rendering zeros.
  generation: { ttftMs?: number; tokensPerSec?: number };
  // 014-tour-scripted: the station the guided tour is currently narrating, so
  // the canvas can lead the eye to it. Exactly one while a tour stop is active;
  // null when idle/done (no `tourStation` passed). Independent of `activeStation`
  // (the spotlight follows the cursor; the emphasis follows the narration).
  emphasizedStation: StationId | null;
  // 093 — set when the run was blocked by the WAF (the chain 403'd it); drives the
  // "blocked at the WAF" rendering. Null on a normal run.
  blocked: BlockedOutcome | null;
}

function hopId(source: StationId, target: StationId): string {
  return `${source}-${target}`;
}

/**
 * 035-conditional-upload-nodes — is a PDF upload in scope in this event log?
 * True iff the trace carries the object-storage write (`storage.upload`) or any
 * offline-indexing stage (`rag.ingest.*`). Pure: the canvas uses this to reveal
 * the Storage + Ingestion nodes only during an upload (hidden on a plain chat).
 */
export function hasUploadActivity(events: TraceEvent[]): boolean {
  return events.some(
    (e) => e.stage === "storage.upload" || e.stage.startsWith("rag.ingest."),
  );
}

// Undirected adjacency over the real network edges. The 6 hops form a tree
// (backend and agent are the hubs), so there is exactly one path between any
// two stations — found with a plain BFS.
const ADJACENCY: Record<StationId, StationId[]> = (() => {
  const adj = {} as Record<StationId, StationId[]>;
  for (const id of STATION_IDS) adj[id] = [];
  for (const { source, target } of HOP_PAIRS) {
    adj[source].push(target);
    adj[target].push(source);
  }
  return adj;
})();

/** Shortest station path from→to (inclusive), or [] if from===to / unreachable. */
function findPath(from: StationId, to: StationId): StationId[] {
  if (from === to) return [];
  const prev = new Map<StationId, StationId>();
  const queue: StationId[] = [from];
  const seen = new Set<StationId>([from]);
  while (queue.length) {
    const node = queue.shift()!;
    if (node === to) break;
    for (const next of ADJACENCY[node]) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, node);
      queue.push(next);
    }
  }
  if (!seen.has(to)) return [];
  const path: StationId[] = [to];
  let cur = to;
  while (cur !== from) {
    cur = prev.get(cur)!;
    path.unshift(cur);
  }
  return path;
}

/** Turn a station path into the edge legs (with direction) the packet rides. */
function legsFor(path: StationId[]): ActiveHop[] {
  const legs: ActiveHop[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const hop = HOP_PAIRS.find(
      (h) => (h.source === a && h.target === b) || (h.source === b && h.target === a),
    );
    if (!hop) continue;
    // Packet travels a → b. The edge is drawn source → target; when its source
    // is b, the visual must run in reverse.
    legs.push({ id: hopId(hop.source, hop.target), reverse: hop.source === b });
  }
  return legs;
}

export function deriveView(
  events: TraceEvent[],
  upto: number,
  tourStation: StationId | null = null,
  blocked: BlockedOutcome | null = null,
): DerivedView {
  const stations = {} as Record<StationId, StationRuntime>;
  for (const id of STATION_IDS) stations[id] = { status: "idle", events: [] };

  const visible = upto >= 0 ? events.slice(0, upto + 1) : [];
  const distinct: StationId[] = [];
  const tokens: string[] = [];
  let respondAnswer = "";
  let generateAnswer = ""; // batch mode: the whole answer arrives on the END event
  let iterations = 0;
  // 029-ttft-throughput: surfaced from the llm.generate END metrics (if present).
  let ttftMs: number | undefined;
  let tokensPerSec: number | undefined;
  // 011-token-cost: real tokens + cost across the run's LLM calls. Shared with the
  // 018 HUD via tallyUsage so the two can never drift (UsageTotals is the subset
  // the LLM block reads; the tally also carries toolCalls/ragHits for the HUD).
  const usage: UsageTotals = tallyUsage(visible);

  for (const ev of visible) {
    const stationId = STAGE_TO_STATION[ev.stage];
    const runtime = stations[stationId];
    runtime.events.push(ev);

    if (ev.phase === "start") runtime.status = "active";
    else if (ev.phase === "end") {
      runtime.status = "done";
      if (typeof ev.metrics.latency_ms === "number") runtime.latencyMs = ev.metrics.latency_ms;
    }

    if (distinct[distinct.length - 1] !== stationId) distinct.push(stationId);

    if (ev.stage === "agent.think" && ev.phase === "end") iterations += 1;
    if (ev.stage === "llm.generate" && ev.phase === "progress" && typeof ev.data.token === "string") {
      tokens.push(ev.data.token);
    }
    if (ev.stage === "llm.generate" && ev.phase === "end") {
      if (typeof ev.data.answer === "string") generateAnswer = ev.data.answer;
      if (typeof ev.metrics.ttft_ms === "number") ttftMs = ev.metrics.ttft_ms;
      if (typeof ev.metrics.tokens_per_sec === "number") tokensPerSec = ev.metrics.tokens_per_sec;
    }
    if (ev.stage === "respond" && ev.phase === "end" && typeof ev.data.answer === "string") {
      respondAnswer = ev.data.answer;
    }
  }

  const last = visible[visible.length - 1];
  // The run is over once the outermost BACKEND stage closes — that END is the
  // *final* trace event (respond fires earlier, then db.write, then backend
  // closes). Keying this off `respond/end` left the Backend station stuck
  // pulsing "active" after every run, because respond is no longer last.
  const finished = Boolean(last && last.stage === "backend" && last.phase === "end");

  let activeStation: StationId | null = distinct[distinct.length - 1] ?? null;
  const prevStation: StationId | null = distinct[distinct.length - 2] ?? null;
  if (finished) activeStation = null;

  // The response streams back over the SSE connection while the model is
  // generating tokens or the answer is being returned (stream mode only — the
  // canvas gates this on the delivery mode).
  const streaming = Boolean(last && (last.stage === "llm.generate" || last.stage === "respond")) && !finished;

  // The packet travels prev → active along the unique tree path between them,
  // so cross-hub jumps (mcp → rag, llm → frontend, db → agent …) animate as the
  // real multi-leg route instead of teleporting.
  const activeHops: ActiveHop[] =
    activeStation && prevStation && activeStation !== prevStation
      ? legsFor(findPath(prevStation, activeStation))
      : [];

  // 093 — a WAF block overrides the projection: the request reached the WAF and was
  // stopped there (no events exist for it — the backend never ran). Light the path
  // up to the WAF, mark the WAF blocked, leave everything downstream untouched
  // ("idle" = not reached). `blocked == null` reproduces the normal projection.
  if (blocked) {
    for (const id of PRE_WAF_PATH) stations[id].status = "done";
    stations.waf.status = "blocked";
    return {
      stations,
      activeStation: null,
      activeHops: [],
      streaming: false,
      answer: "",
      iterations: 0,
      usage,
      generation: {},
      emphasizedStation: tourStation,
      blocked,
    };
  }

  return {
    stations,
    activeStation,
    activeHops,
    streaming,
    // Streaming: reassemble from tokens. Batch: the answer lands whole on the
    // generate END (then respond) — so it appears at once, not typed out.
    answer: tokens.length ? tokens.join("") : respondAnswer || generateAnswer,
    iterations,
    usage,
    generation: { ttftMs, tokensPerSec },
    emphasizedStation: tourStation,
    blocked: null,
  };
}
