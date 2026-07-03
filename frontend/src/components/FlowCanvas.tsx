import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useMemo } from "react";

import { useLang, useT } from "../i18n";
import type { Strings } from "../i18n/strings";
import { cloudValue, useCloud } from "../lib/cloud";
import { formatTokens, formatUsd } from "../lib/cost";
import type { DerivedView, StationRuntime, UsageTotals } from "../lib/derive";
import { hasUploadActivity } from "../lib/derive";
import { HARNESS_ROLE, HARNESS_ROLE_COLOR } from "../lib/harness";
import { computeLayout } from "../lib/layout";
import { useLens } from "../lib/lens";
import { isLoopStation } from "../lib/loop";
import { useResolvedSelection } from "../lib/selection";
import { useSettings } from "../lib/settings";
import {
  boundaryFor,
  publicBoundaryFor,
  stationByIdFor,
  visibleHopsFor,
  visibleStationsFor,
  visibleTiersFor,
  type StationId,
} from "../lib/stations";
import { useSimulator } from "../store/useSimulator";
import type {
  ApiGwData,
  CdnData,
  DnsData,
  LbData,
  SimulatedError,
  WafData,
} from "../types/events";
import { FlowEdge } from "./edges/FlowEdge";
import { BoundaryNode } from "./nodes/BoundaryNode";
import { PublicFrontierNode } from "./nodes/PublicFrontierNode";
import { StationNode } from "./nodes/StationNode";
import { TierNode } from "./nodes/TierNode";

const nodeTypes = {
  station: StationNode,
  tier: TierNode,
  boundary: BoundaryNode,
  publicFrontier: PublicFrontierNode,
};
const edgeTypes = { flow: FlowEdge };

interface FlowCanvasProps {
  view: DerivedView;
  selected: StationId | null;
  onSelect: (id: StationId | null) => void;
}

export function FlowCanvas({ view, selected, onSelect }: FlowCanvasProps) {
  const lang = useLang((s) => s.lang);
  const cloud = useCloud((s) => s.cloud);
  // 061-scenario-builder — the à-la-carte selection drives the visual model (which
  // stations are on + the agent runtime); RAGLESS is the `pageindex` station being in
  // the selection, previews are their station being selected.
  const sel = useResolvedSelection();
  const mode = useSettings((s) => s.mode);
  // 096-harness-loop-lens — the active lens reframes emphasis only (harness-role
  // badges / loop dimming + loop-edge highlight). `all` leaves everything untouched.
  const lens = useLens((s) => s.mode);
  const expanded = useSimulator((s) => s.expanded);
  const events = useSimulator((s) => s.events);
  // 085-hop-communication-detail — the selected hop (edge id) + its setter, so
  // clicking an arrow opens its detail in the Inspector (like selecting a station).
  const selectedHop = useSimulator((s) => s.selectedHop);
  const selectHop = useSimulator((s) => s.selectHop);
  const t = useT();
  // 035-conditional-upload-nodes — reveal the write-path nodes only when the
  // current trace shows an upload (pure projection of the event log).
  const showUpload = useMemo(() => hasUploadActivity(events), [events]);
  // Selection-scoped visual model: only the chosen stations/tiers/hops.
  const stations = visibleStationsFor(lang, sel, showUpload);
  const tiers = visibleTiersFor(lang, sel, showUpload);
  const hops = visibleHopsFor(lang, sel, showUpload);
  const boundary = boundaryFor(lang);
  const publicFrontier = publicBoundaryFor(lang);
  const stationById = stationByIdFor(lang);
  const ro = t.readout;
  const comms = t.comms;

  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const layout = useMemo(
    () => computeLayout(expandedSet, sel, showUpload, lens === "harness"),
    [expandedSet, sel, showUpload, lens],
  );

  const nodes: Node[] = useMemo(() => {
    // The private-network boundary sits behind everything (inserted first).
    const b = layout.boundary;
    const boundaryNode: Node = {
      id: `boundary-${boundary.id}`,
      type: "boundary",
      position: { x: b.x, y: b.y },
      data: { meta: boundary, service: cloudValue(boundary, cloud) },
      style: { width: b.w, height: b.h, pointerEvents: "none" },
      selectable: false,
      draggable: false,
      zIndex: 0,
    };

    // 032-network-boundary — the public-internet / egress frontier, a dashed line
    // in the gap between the client tier and the private boundary (behind nodes).
    const f = layout.publicFrontier;
    const frontierNode: Node = {
      id: "public-frontier",
      type: "publicFrontier",
      position: { x: f.x - 12, y: f.y },
      data: { label: publicFrontier.label },
      style: { width: 24, height: f.h, pointerEvents: "none" },
      selectable: false,
      draggable: false,
      zIndex: 0,
    };

    const tierNodes: Node[] = tiers.map((meta) => {
      const box = layout.tierBoxes[meta.id];
      return {
        id: `tier-${meta.id}`,
        type: "tier",
        position: { x: box.x, y: box.y },
        data: { meta, service: cloudValue(meta, cloud) },
        style: { width: box.w, height: box.h, pointerEvents: "none" },
        selectable: false,
        draggable: false,
        zIndex: 0,
      };
    });

    const stationNodes: Node[] = stations.map((meta) => ({
      id: meta.id,
      type: "station",
      position: layout.positions[meta.id],
      data: {
        meta,
        runtime: view.stations[meta.id],
        // Spotlight: only the current station is highlighted; others deactivate.
        isActive: view.activeStation === meta.id,
        // 014-tour-scripted: the station the guided tour is currently narrating —
        // a distinct, attention-leading highlight (independent of the spotlight).
        isEmphasized: view.emphasizedStation === meta.id,
        readout: readoutFor(meta.id, view.stations[meta.id], ro, view.usage),
        isSelected: selected === meta.id,
        expanded: expandedSet.has(meta.id),
        height: layout.heights[meta.id],
        width: layout.widths[meta.id],
        comingSoon: meta.comingSoon ?? false,
        // 011-token-cost: the LLM block totals rounds/tokens/cost across the run's
        // LLM calls — the aggregate spans agent.think + llm.generate, so thread it
        // in from the projection rather than recomputing per-station.
        usage: meta.id === "llm" ? view.usage : undefined,
        // 096-harness-loop-lens — Harness lens: color the station by its harness
        // role (a parts map in space). The Agent is special-cased as the runtime
        // CORE ("Agent Harness"), with a Context chip showing context engineering
        // nests inside it. Loop lens: dim the pure-harness stations so the
        // reason→act→observe cycle stands out. All undefined/false under `all`.
        harness:
          lens === "harness"
            ? meta.id === "agent"
              ? {
                  label: t.lens.core,
                  hint: t.lens.coreHint,
                  color: HARNESS_ROLE_COLOR[HARNESS_ROLE[meta.id]],
                  core: true,
                  contextChip: t.lens.contextChip,
                  contextHint: t.lens.contextHint,
                }
              : {
                  label: t.lens.role[HARNESS_ROLE[meta.id]],
                  hint: t.lens.roleHint[HARNESS_ROLE[meta.id]],
                  color: HARNESS_ROLE_COLOR[HARNESS_ROLE[meta.id]],
                }
            : undefined,
        dimmed: lens === "loop" && !isLoopStation(meta.id),
      },
      draggable: false,
      zIndex: 1,
    }));

    return [boundaryNode, frontierNode, ...tierNodes, ...stationNodes];
  }, [view, selected, stations, tiers, boundary, publicFrontier, cloud, ro, layout, expandedSet, lens, t]);

  const edges: Edge[] = useMemo(
    () =>
      hops.map((hop) => {
        const id = `${hop.source}-${hop.target}`;
        const activeHop = view.activeHops.find((h) => h.id === id);
        const active = Boolean(activeHop);
        const targetAccent = stationById[hop.target].accent;

        // The two streaming-capable hops flip async → sync under batch delivery.
        let comm = hop.comm;
        let commDetail = comm === "async" ? comms.asyncDetail : comms.syncDetail;
        if (id === "frontend-backend") {
          comm = mode === "stream" ? "async" : "sync";
          commDetail = mode === "stream" ? comms.deliveryStreamDetail : comms.deliveryBatchDetail;
        } else if (id === "agent-llm") {
          comm = mode === "stream" ? "async" : "sync";
          commDetail = mode === "stream" ? comms.llmStreamDetail : comms.llmBatchDetail;
        }

        return {
          id,
          source: hop.source,
          target: hop.target,
          sourceHandle: hop.sourceHandle,
          targetHandle: hop.targetHandle,
          type: "flow",
          data: {
            accent: targetAccent,
            label: hop.label,
            secure: hop.secure,
            zone: hop.zone,
            protocol: hop.protocol,
            detail: hop.detail,
            controls: hop.controls,
            comm,
            commDetail,
            active,
            reverse: activeHop?.reverse ?? false,
            // The SSE return packet only applies to live streaming delivery.
            stream: id === "frontend-backend" && view.streaming && mode === "stream",
            // 085 — highlight the edge whose hop detail is open in the Inspector.
            selected: id === selectedHop,
            // 096-harness-loop-lens — under the Loop lens, highlight the edges that
            // ARE the reason→act→observe cycle (both endpoints are loop stations).
            loop: lens === "loop" && isLoopStation(hop.source) && isLoopStation(hop.target),
            // Under the Harness lens, fade the arrows — the harness view is about
            // structure (parts in space), not flow, so the wiring recedes.
            faded: lens === "harness",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: active ? targetAccent : "var(--color-edge-soft)",
          },
        };
      }),
    [view, hops, stationById, mode, comms, selectedHop, lens],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      minZoom={0.4}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: false }}
      onNodeClick={(_, node) => {
        if (node.type === "station") onSelect(node.id as StationId);
      }}
      // 085 — clicking an arrow opens its hop detail in the Inspector. `onSelect`
      // (→ store.select) already clears any selected hop, so node/pane clicks reset it.
      onEdgeClick={(_, edge) => selectHop(edge.id)}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="var(--color-dots)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function lastWith(events: StationRuntime["events"], pred: (e: StationRuntime["events"][number]) => boolean) {
  for (let i = events.length - 1; i >= 0; i--) if (pred(events[i])) return events[i];
  return undefined;
}

export function readoutFor(
  id: StationId,
  rt: StationRuntime,
  ro: Strings["readout"],
  usage: UsageTotals,
): string {
  switch (id) {
    case "frontend": {
      const respond = lastWith(rt.events, (e) => e.stage === "respond" && e.phase === "end");
      if (respond) return ro.answerReceived;
      const msg = rt.events.find((e) => typeof e.data.message === "string")?.data.message as string | undefined;
      // Return the full question; the node clips it with CSS and reveals the
      // whole thing on hover (title tooltip) instead of hard-truncating here.
      return msg ? `"${msg}"` : "";
    }
    case "backend":
      return rt.status === "idle" ? "" : ro.fastapiSse;
    // 088-network-layer — the ingress appliances' compact readouts, from the real
    // evidence each one's stage carried (host/TTL · HIT/MISS · clean/blocked · TLS+
    // upstream · route+rate-limit). Honest "not detected" when no header was present.
    case "dns": {
      const e = lastWith(rt.events, (ev) => ev.stage === "dns" && ev.phase === "end");
      if (!e) return rt.status === "idle" ? "" : "…";
      const d = e.data as Partial<DnsData>;
      if (!d.seen) return ro.netUnseen;
      const ttl = typeof d.ttl === "number" ? ` · ${d.ttl}s` : "";
      return `${d.host ?? d.address ?? "resolved"}${ttl}`;
    }
    case "cdn": {
      const e = lastWith(rt.events, (ev) => ev.stage === "cdn" && ev.phase === "end");
      if (!e) return rt.status === "idle" ? "" : "…";
      const d = e.data as Partial<CdnData>;
      return d.seen ? (d.cache ?? "—") : ro.netUnseen;
    }
    case "waf": {
      // 093 — a real WAF block has no event (the request never reached the backend);
      // the blocked status is set on the runtime by deriveView's blocked override.
      if (rt.status === "blocked") return ro.wafBlocked("403");
      const e = lastWith(rt.events, (ev) => ev.stage === "waf" && ev.phase === "end");
      if (!e) return rt.status === "idle" ? "" : "…";
      const d = e.data as Partial<WafData>;
      if (d.status === "blocked") return ro.wafBlocked(d.rules != null ? `${d.rules}` : "rule");
      return d.seen ? ro.wafClean : ro.netUnseen;
    }
    case "lb": {
      const e = lastWith(rt.events, (ev) => ev.stage === "lb" && ev.phase === "end");
      if (!e) return rt.status === "idle" ? "" : "…";
      const d = e.data as Partial<LbData>;
      if (!d.seen) return ro.netUnseen;
      const up = d.upstream ? ` · ${d.upstream}` : "";
      return `${d.tls_version ?? d.scheme ?? "TLS"}${up}`;
    }
    case "apigw": {
      const e = lastWith(rt.events, (ev) => ev.stage === "apigw" && ev.phase === "end");
      if (!e) return rt.status === "idle" ? "" : "…";
      const d = e.data as Partial<ApiGwData>;
      if (!d.seen) return ro.netUnseen;
      const rl = typeof d.rate_limit_remaining === "number" ? ` · ${d.rate_limit_remaining}` : "";
      return `${d.route ?? "route"}${rl}`;
    }
    case "database": {
      const write = lastWith(rt.events, (e) => e.stage === "db.write" && e.phase === "end");
      if (write) return ro.dbPersisted;
      const read = lastWith(rt.events, (e) => e.stage === "db.read" && e.phase === "end");
      if (read) return ro.dbHistory((read.data.total_rows as number | undefined) ?? 0);
      return rt.status === "idle" ? "" : ro.dbQuerying;
    }
    case "agent": {
      const think = lastWith(rt.events, (e) => e.stage === "agent.think" && e.phase === "end");
      if (think) {
        const calls = (think.data.tool_calls as Array<{ name: string }> | undefined) ?? [];
        return calls.length ? ro.call(calls.map((c) => c.name).join(", ")) : ro.decisionAnswer;
      }
      // 057-deepagents-runtime: during the Intermediate-rung preamble (after the
      // planner fires, before the first think completes) surface the plan size.
      const plan = lastWith(rt.events, (e) => e.stage === "agent.plan" && e.phase === "end");
      if (plan) return ro.planned(((plan.data.steps as unknown[] | undefined) ?? []).length);
      return rt.status === "idle" ? "" : ro.routing;
    }
    case "ingestion": {
      // 033-ingestion-node + 080 — the offline indexer's compact readout. The object
      // store is the first phase: surface the stored object until chunking starts,
      // then chunk → embed → store as the ingestion runs.
      const iStore = lastWith(rt.events, (e) => e.stage === "rag.ingest.store" && e.phase === "end");
      if (iStore) return ro.ingestStored((iStore.data.chunks_stored as number | undefined) ?? 0);
      const iEmbed = lastWith(rt.events, (e) => e.stage === "rag.ingest.embed" && e.phase === "end");
      if (iEmbed) return ro.ingestEmbedding((iEmbed.data.num_vectors as number | undefined) ?? 0);
      const iChunk = lastWith(rt.events, (e) => e.stage === "rag.ingest.chunk");
      if (iChunk) return ro.ingestChunking((iChunk.data.num_chunks as number | undefined) ?? 0);
      const up = lastWith(rt.events, (e) => e.stage === "storage.upload" && e.phase === "end");
      if (up) return ro.storedObject(String(up.data.filename ?? up.data.key ?? ""));
      return rt.status === "idle" ? "" : ro.storing;
    }
    case "rag": {
      // 054-rag-block-expansion: on the Intermediate rung the query-time rerank
      // sub-stage fires here too; once it has, surface the rerank pool→kept so the
      // Vector DB tile shows the Intermediate upgrade without opening the drill-in.
      const rr = lastWith(rt.events, (e) => e.stage === "rag.rerank" && e.phase === "end");
      if (rr) {
        const k = (rr.data.k as number | undefined) ?? 0;
        const fetchK =
          (rr.data.fetch_k as number | undefined) ??
          (rr.data.candidates as unknown[] | undefined)?.length ??
          k;
        return ro.reranked(fetchK, k);
      }
      // 070-hybrid-search: when hybrid fired (and no rerank downstream of it), surface the
      // BM25 + vector fusion result so the tile shows the upgrade without opening the drill-in.
      const hy = lastWith(rt.events, (e) => e.stage === "rag.hybrid" && e.phase === "end");
      if (hy) {
        const fused =
          (hy.data.fused as number | undefined) ??
          (hy.data.candidates as unknown[] | undefined)?.length ??
          0;
        return ro.hybridFused(fused);
      }
      const ret = lastWith(rt.events, (e) => e.stage === "rag.retrieve" && e.phase === "end");
      if (ret) {
        const k = (ret.data.k as number | undefined) ?? (ret.data.chunks as unknown[] | undefined)?.length;
        const top = ret.metrics.top_score;
        return `top-${k}${typeof top === "number" ? ` · ${ro.score} ${top.toFixed(2)}` : ""}`;
      }
      return rt.status === "idle" ? "" : ro.embedding;
    }
    case "mcp": {
      const call = lastWith(rt.events, (e) => e.stage === "mcp.call" && e.phase === "end");
      // 017-failure-injection: a simulated tool error is badged so the learner
      // sees where the failure was injected.
      if (call?.data.simulated) return `${ro.simulatedError} · ${call.data.tool}`;
      if (call) return `${call.data.tool} → ${truncate(String(call.data.result), 14)}`;
      const disc = lastWith(rt.events, (e) => e.stage === "mcp.discover" && e.phase === "end");
      if (disc) return ro.toolsReady((disc.data.tools as unknown[] | undefined)?.length ?? 0);
      return "";
    }
    case "llm": {
      if (rt.status === "idle") return "";
      // 017-failure-injection: a simulated model timeout is recorded on the
      // llm.prompt END; surface the badge over the usual readout.
      const prompt = lastWith(rt.events, (e) => e.stage === "llm.prompt" && e.phase === "end");
      if (prompt?.data.simulated) {
        // 051-failure-treatments: while the timeout is being retried, show which
        // attempt we're on; once the last attempt fails the breaker opens → fallback.
        const sim = prompt.data as unknown as SimulatedError;
        if (sim.attempt && sim.max_retries) {
          return sim.attempt >= sim.max_retries
            ? ro.circuitOpen
            : ro.retrying(sim.attempt, sim.max_retries);
        }
        return ro.simulatedError;
      }
      const tokens = rt.events.filter((e) => e.stage === "llm.generate" && e.phase === "progress").length;
      if (rt.status === "active" && tokens) return ro.streaming(tokens);
      // Real tokens + cost once a round has reported usage (011-token-cost).
      if (usage.totalTokens > 0)
        return ro.tokensCost(formatTokens(usage.totalTokens), formatUsd(usage.costUsd));
      if (tokens) return ro.tokens(tokens);
      if (lastWith(rt.events, (e) => e.stage === "llm.prompt")) return ro.promptAssembled;
      return "…";
    }
    case "pageindex": {
      // 056-ragless-pageindex — the RAGLESS box's compact readout follows the
      // reasoning pipeline: building tree → navigating → selected N sections.
      const sel = lastWith(rt.events, (e) => e.stage === "pageindex.select" && e.phase === "end");
      if (sel) return ro.selected((sel.data.count as number | undefined) ?? 0);
      if (lastWith(rt.events, (e) => e.stage === "pageindex.navigate")) return ro.navigating;
      if (lastWith(rt.events, (e) => e.stage === "pageindex.tree")) return ro.buildingTree;
      return rt.status === "idle" ? "" : ro.buildingTree;
    }
    // 008-scenario-framework preview nodes: non-executing, so no live readout —
    // the "coming soon" badge on the node carries the message instead.
    case "gateway":
    case "guardrails":
    case "cache":
    case "eval":
    case "observability":
    case "researcher":
    case "coder":
    case "critic":
    case "summarization":
      return "";
  }
}
