// Timeline phases (004-timeline-phases). A stable, ordered grouping of the
// existing trace `Stage`s into named pipeline steps — the labels the replay
// scrubber shows instead of anonymous ticks. This is a *frontend* projection
// only: it does NOT touch the event protocol, `deriveView`, or `STAGE_TO_STATION`.
//
// NOTE: a "timeline phase" is unrelated to the protocol `Phase` enum
// (start/progress/end). `STAGE_TO_PHASE` is a second exhaustive map over `Stage`,
// parallel to `STAGE_TO_STATION` — when a `Stage` is added it must be assigned
// here too (the AC1 test pins this by comparing key sets).

import type { Lang } from "../i18n";
import { UI } from "../i18n/strings";
import type { Stage, TraceEvent } from "../types/events";

export type TimelinePhase =
  | "request"
  | "memory"
  | "route"
  | "retrieve"
  | "reason"
  | "tools"
  | "generate"
  | "respond"
  | "persist";

// Canonical run order — the rail renders the full sequence so the learner always
// sees the complete pipeline map (phases that didn't fire are shown dimmed).
export const PHASE_ORDER: TimelinePhase[] = [
  "request",
  "memory",
  "route",
  "retrieve",
  "reason",
  "tools",
  "generate",
  "respond",
  "persist",
];

// Exhaustive grouping of every `Stage` into one phase. Typed as a full
// `Record<Stage, …>` so `tsc --noEmit` fails if a new `Stage` is left unmapped.
export const STAGE_TO_PHASE: Record<Stage, TimelinePhase> = {
  frontend: "request",
  // 088-network-layer — the ingress chain (DNS · CDN · WAF · TLS/LB · API-GW) is
  // all part of the request phase (it runs before the backend sees the request).
  dns: "request",
  cdn: "request",
  waf: "request",
  lb: "request",
  apigw: "request",
  // 084-network-edge — the edge is the first hop of the request phase (before backend).
  edge: "request",
  backend: "request",
  "db.read": "memory",
  "agent.route": "route",
  "rag.embed": "retrieve",
  "rag.search": "retrieve",
  // 070-hybrid-search — BM25 + vector fusion is part of the retrieve phase.
  "rag.hybrid": "retrieve",
  // 054-rag-block-expansion — reranking is part of the same retrieval phase.
  "rag.rerank": "retrieve",
  "rag.retrieve": "retrieve",
  // 056-ragless-pageindex — reasoning-based retrieval is still the retrieve phase.
  "pageindex.tree": "retrieve",
  "pageindex.navigate": "retrieve",
  "pageindex.select": "retrieve",
  "rag.ingest.chunk": "retrieve",
  // 080 — tokenize + metadata are part of the same indexer write-path phase.
  "rag.ingest.tokenize": "retrieve",
  "rag.ingest.embed": "retrieve",
  "rag.ingest.metadata": "retrieve",
  "rag.ingest.store": "retrieve",
  // 034-storage-ingestion-flow — persisting the uploaded file to durable object
  // storage is a write; "persist" is the truthful label (it sorts after retrieve
  // in the canonical rail, a harmless cosmetic on upload-only traces).
  "storage.upload": "persist",
  "agent.think": "reason",
  // 057-deepagents-runtime — the DeepAgents preamble (plan, FS ops, delegation) is
  // part of the agent's reasoning phase (it runs before the ReAct loop proper).
  "agent.plan": "reason",
  "agent.fs.write": "reason",
  "agent.fs.read": "reason",
  "agent.delegate": "reason",
  "llm.prompt": "reason",
  "mcp.discover": "tools",
  "mcp.call": "tools",
  "llm.generate": "generate",
  // 098-verify-reflection-loop — the critic pass judges the drafted answer and can
  // loop back to generation, so it belongs to the same generate phase.
  "agent.verify": "generate",
  respond: "respond",
  "db.write": "persist",
};

/** One phase that actually occurred in a run. */
export interface PhaseMarker {
  phase: TimelinePhase;
  index: number; // event index where the phase first begins (jump target)
  count: number; // number of maximal contiguous segments (≥ 2 ⇒ a ×N badge)
}

/**
 * The phases that occurred in `events`, in run order (by first occurrence), each
 * with the index of its first event and how many contiguous segments it spans.
 * A ReAct loop (reason → tools → reason → tools) yields reason/tools with
 * `count: 2`. Pure: never reads anything but its argument.
 */
export function phaseMarkers(events: TraceEvent[]): PhaseMarker[] {
  const order: TimelinePhase[] = [];
  const firstIndex = new Map<TimelinePhase, number>();
  const count = new Map<TimelinePhase, number>();
  let prev: TimelinePhase | null = null;

  for (let i = 0; i < events.length; i++) {
    const phase = STAGE_TO_PHASE[events[i].stage];
    if (!phase) continue; // defensive: an unmapped stage is skipped, not crashed
    if (!firstIndex.has(phase)) {
      firstIndex.set(phase, i);
      order.push(phase);
    }
    // A new contiguous segment starts whenever the phase changes.
    if (phase !== prev) count.set(phase, (count.get(phase) ?? 0) + 1);
    prev = phase;
  }

  return order.map((phase) => ({
    phase,
    index: firstIndex.get(phase)!,
    count: count.get(phase)!,
  }));
}

/** The phase the event at `cursor` belongs to, or null if the cursor is unset. */
export function activePhase(events: TraceEvent[], cursor: number): TimelinePhase | null {
  if (cursor < 0 || cursor >= events.length) return null;
  return STAGE_TO_PHASE[events[cursor].stage] ?? null;
}

// --- i18n labels (cached per language) ---------------------------------------

const labelsCache: Partial<Record<Lang, Record<TimelinePhase, string>>> = {};

/** Resolved phase labels for a language; the result is stable per language. */
export function phaseLabelsFor(lang: Lang): Record<TimelinePhase, string> {
  return (labelsCache[lang] ??= UI[lang].timeline.phases);
}
