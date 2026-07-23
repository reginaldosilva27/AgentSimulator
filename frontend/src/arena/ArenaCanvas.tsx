// 100-arena-capacity-sandbox — the drag-and-drop canvas. A second, INDEPENDENT
// React Flow instance (it never imports lib/layout.ts or useSimulator, so the
// Simulator page is untouched — AC8). Nodes/edges are a controlled projection of
// `useArena`; metrics recompute synchronously on every edit ("real time").
//
// 107-arena-wiring-ux — wiring is the page's core gesture, so it's forgiving:
// enlarged handles (ArenaNode), a generous connectionRadius (snap), a visible
// connection line, palette drops auto-wire from the selected node (store
// `dropNode`), and a mis-wired link is selectable + Backspace-removable.

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";

import { useLang, useT } from "../i18n";
import { ArenaNode, type ArenaNodeData } from "./ArenaNode";
import {
  ARENA_REGIONS,
  CALLS_CONFIGURABLE,
  INSTANCE_SIZES,
  KIND_META,
  type ArenaKind,
  type InstanceSize,
} from "./components";
import { computeMetrics, effectiveCapacity, routingTaxFor } from "./model";
import { ARENA_DND_MIME } from "./Palette";
import { useArena } from "./store";

const nodeTypes = { arena: ArenaNode };

/** 107 AC3 — the edge ids a React Flow change list asks to remove (pure). */
export function edgeIdsToRemove(changes: EdgeChange[]): string[] {
  return changes.filter((c) => c.type === "remove").map((c) => c.id);
}

export function ArenaCanvas() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const offeredLoad = useArena((s) => s.offeredLoad);
  // 107 — node selection lives in the store (drives the panel + auto-wire).
  const selectedId = useArena((s) => s.selectedId);
  const { dropNode, dragNode, moveNode, removeNode, removeEdge, connect, select } =
    useArena.getState();

  // Edge selection is view-only state (which link is highlighted for deletion).
  const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());

  const metrics = useMemo(() => computeMetrics({ nodes, edges }, offeredLoad), [nodes, edges, offeredLoad]);

  const rfNodes = useMemo<Node<ArenaNodeData>[]>(
    () =>
      nodes.map((n) => {
        const m = metrics.get(n.id)!;
        return {
          id: n.id,
          type: "arena",
          position: { x: n.x, y: n.y },
          selected: n.id === selectedId,
          data: {
            label: KIND_META[n.kind].label[lang],
            status: m.status,
            qps: m.throughput,
            latencyMs: m.latencyMs,
            utilization: m.utilization,
            bottleneck: m.bottleneck,
            shedRps: m.shedRps,
            replicas: n.replicas,
            scaled: n.size !== "medium" || n.replicas > 1,
            region: n.region,
          },
        };
      }),
    [nodes, metrics, selectedId, lang],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
        selected: selectedEdges.has(e.id),
        markerEnd: { type: MarkerType.ArrowClosed },
        style: {
          stroke: selectedEdges.has(e.id) ? "var(--color-sky)" : "var(--color-edge-soft)",
          strokeWidth: selectedEdges.has(e.id) ? 2 : 1,
        },
      })),
    [edges, selectedEdges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          // Persist only on drop (dragging === false); live frames just set state.
          if (c.dragging) dragNode(c.id, c.position);
          else moveNode(c.id, c.position);
        } else if (c.type === "remove") {
          removeNode(c.id); // clears the store selection when it matches
        }
      }
    },
    [dragNode, moveNode, removeNode],
  );

  // 107 AC3 — a selected link is removable with Backspace/Delete.
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const id of edgeIdsToRemove(changes)) removeEdge(id);
      const selects = changes.filter((c) => c.type === "select");
      if (selects.length) {
        setSelectedEdges((prev) => {
          const next = new Set(prev);
          for (const c of selects) {
            if (c.selected) next.add(c.id);
            else next.delete(c.id);
          }
          return next;
        });
      }
    },
    [removeEdge],
  );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className="h-full w-full"
        onDrop={(ev) => {
          ev.preventDefault();
          const kind = ev.dataTransfer.getData(ARENA_DND_MIME) as ArenaKind;
          if (!kind || !(kind in KIND_META)) return; // ignore drags from other sources
          const pos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
          // 107 AC1 — auto-wires from the selected node + selects the new one.
          dropNode(kind, pos);
        }}
        onDragOver={(ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "copy";
        }}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(c) => c.source && c.target && connect(c.source, c.target)}
          onNodeClick={(_, node) => select(node.id)}
          onPaneClick={() => select(null)}
          fitView
          minZoom={0.3}
          maxZoom={1.6}
          // 107 — forgiving wiring: a dragged connection snaps to any handle
          // within 50px, and the in-progress line is clearly visible.
          connectionRadius={50}
          connectionLineStyle={{
            stroke: "var(--color-sky)",
            strokeWidth: 2,
            strokeDasharray: "6 3",
          }}
          deleteKeyCode={["Backspace", "Delete"]}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--color-dots)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="rounded-lg border border-dashed border-[var(--color-line)] px-4 py-2 text-[12px] text-[var(--color-muted)]">
            {t.arena.emptyCanvas}
          </p>
        </div>
      )}

      {selected && <ScalePanel id={selected.id} />}
    </div>
  );
}

/**
 * The selected-node scaling controls.
 *
 * 104 — the panel speaks each component's REAL scaling language: the horizontal
 * control is labelled with what one unit is there (LLM → deployments with their
 * own quota, backend → containers, app DB → read replicas, gateways → scale
 * units…), "instance size" carries the per-kind meaning as a hint, and an ℹ️
 * toggle reveals the kind's explainer. The client (the load source) shows no
 * knobs — its knob is the users slider. Exported for direct testing.
 */
export function ScalePanel({ id }: { id: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [showInfo, setShowInfo] = useState(false);
  const node = useArena((s) => s.nodes.find((n) => n.id === id));
  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const { setSize, setReplicas, setHitRatio, setCallsPerRequest, setRegion, removeNode } =
    useArena.getState();
  if (!node) return null;
  const meta = KIND_META[node.kind];
  const scaling = meta.scaling;
  // 105 — client-side LLM routing overhead this node pays (0 unless it holds
  // LLM deployment endpoints directly; an AI Gateway in between removes it).
  const routing = routingTaxFor({ nodes, edges }, id);

  return (
    <div className="absolute right-3 top-3 w-56 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-[var(--color-ink)] shadow-lg">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[12px] font-semibold">{meta.label[lang]}</span>
        <div className="flex items-center gap-1">
          <button
            aria-label={t.arena.infoLabel}
            title={t.arena.infoLabel}
            aria-expanded={showInfo}
            onClick={() => setShowInfo((v) => !v)}
            className="grid h-5 w-5 place-items-center rounded-full border text-[10px] font-serif italic transition"
            style={{
              borderColor: showInfo ? "var(--color-sky)" : "var(--color-line)",
              color: showInfo ? "var(--color-sky-soft)" : "var(--color-muted)",
            }}
          >
            i
          </button>
          <button
            onClick={() => removeNode(id)}
            className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-rose-soft)] transition hover:border-[var(--color-rose)]"
          >
            {t.arena.remove}
          </button>
        </div>
      </div>

      {/* 104 — what this box is + what its knobs mean here. */}
      {showInfo && (
        <p className="mt-1.5 rounded-lg bg-[var(--color-panel-2)] p-2 text-[10px] leading-snug text-[var(--color-text-soft)]">
          {meta.info[lang]}
        </p>
      )}

      {scaling && (
        <>
          <p className="mb-0.5 mt-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
            {t.arena.scaling}
          </p>
          <p className="mb-2 text-[10px] text-[var(--color-text-soft)]" title={t.arena.capacityHint}>
            {t.arena.metric.capacity}:{" "}
            <span className="font-mono text-[var(--color-sky-soft)]">
              {Math.round(effectiveCapacity(node) * (1 - routing.tax)).toLocaleString()} req/s
            </span>
          </p>

          {/* 105 — the visible cost of routing LLM endpoints in app code. */}
          {routing.tax > 0 && (
            <p className="mb-2 rounded-lg bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] p-1.5 text-[9.5px] leading-snug text-[var(--color-text-soft)]">
              {t.arena.routingTax(`${Math.round(routing.tax * 100)}%`, routing.deployments)}
            </p>
          )}

          <label
            className="block text-[10px] text-[var(--color-text-soft)]"
            title={scaling.sizeMeaning[lang]}
          >
            {t.arena.size}{" "}
            <span className="text-[9px] text-[var(--color-muted)]">
              · {scaling.sizeMeaning[lang]}
            </span>
          </label>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {INSTANCE_SIZES.map((s: InstanceSize) => (
              <button
                key={s}
                onClick={() => setSize(id, s)}
                className="rounded border px-1 py-1 text-[9.5px] transition"
                style={{
                  borderColor: node.size === s ? "var(--color-sky)" : "var(--color-line)",
                  color: node.size === s ? "var(--color-sky-soft)" : "var(--color-text-soft)",
                }}
              >
                {t.arena.sizes[s]}
              </button>
            ))}
          </div>

          {/* 106 — the pool's region: an annotation for architectural intent
              (multi-region resilience/latency/residency); model-neutral in v1. */}
          <label
            className="mt-2.5 block text-[10px] text-[var(--color-text-soft)]"
            title={t.arena.regionHint}
          >
            {t.arena.region}
          </label>
          <select
            aria-label={t.arena.region}
            title={t.arena.regionHint}
            value={node.region ?? ""}
            onChange={(ev) => setRegion(id, ev.target.value || null)}
            className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-1 text-[10px] text-[var(--color-text-soft)]"
          >
            <option value="">{t.arena.regionNone}</option>
            {ARENA_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Horizontal scale, in the kind's own unit (deployments/containers/…). */}
          <label className="mt-2.5 block text-[10px] text-[var(--color-text-soft)]">
            {scaling.unit[lang]}: <span className="font-mono">{node.replicas}</span>
          </label>
          <input
            type="range"
            min={1}
            max={20}
            value={node.replicas}
            onChange={(ev) => setReplicas(id, Number(ev.target.value))}
            className="mt-1 w-full accent-[var(--color-sky)]"
            aria-label={scaling.unit[lang]}
          />

          {/* 103 — the ReAct fan-out: calls this node receives per user request. */}
          {CALLS_CONFIGURABLE.has(node.kind) && (
            <>
              <label
                className="mt-2.5 block text-[10px] text-[var(--color-text-soft)]"
                title={t.arena.callsHint}
              >
                {t.arena.callsPerRequest}:{" "}
                <span className="font-mono">×{node.callsPerRequest ?? 1}</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={node.callsPerRequest ?? 1}
                onChange={(ev) => setCallsPerRequest(id, Number(ev.target.value))}
                className="mt-1 w-full accent-[var(--color-sky)]"
                aria-label={t.arena.callsPerRequest}
              />
            </>
          )}

          {node.kind === "cache" && (
            <>
              <label className="mt-2.5 block text-[10px] text-[var(--color-text-soft)]">
                {t.arena.cacheHitRatio}:{" "}
                <span className="font-mono">{Math.round((node.hitRatio ?? 0) * 100)}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((node.hitRatio ?? 0) * 100)}
                onChange={(ev) => setHitRatio(id, Number(ev.target.value) / 100)}
                className="mt-1 w-full accent-[var(--color-sky)]"
                aria-label={t.arena.cacheHitRatio}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
