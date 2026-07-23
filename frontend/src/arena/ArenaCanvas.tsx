// 100-arena-capacity-sandbox — the drag-and-drop canvas. A second, INDEPENDENT
// React Flow instance (it never imports lib/layout.ts or useSimulator, so the
// Simulator page is untouched — AC8). Nodes/edges are a controlled projection of
// `useArena`; metrics recompute synchronously on every edit ("real time").

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";

import { useLang, useT } from "../i18n";
import { ArenaNode, type ArenaNodeData } from "./ArenaNode";
import { INSTANCE_SIZES, KIND_META, type ArenaKind, type InstanceSize } from "./components";
import { computeMetrics, effectiveCapacity } from "./model";
import { ARENA_DND_MIME } from "./Palette";
import { useArena } from "./store";

const nodeTypes = { arena: ArenaNode };

export function ArenaCanvas() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const offeredLoad = useArena((s) => s.offeredLoad);
  const { addNode, dragNode, moveNode, removeNode, connect } = useArena.getState();

  const [selectedId, setSelectedId] = useState<string | null>(null);

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
            replicas: n.replicas,
            scaled: n.size !== "medium" || n.replicas > 1,
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
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "var(--color-edge-soft)" },
      })),
    [edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          // Persist only on drop (dragging === false); live frames just set state.
          if (c.dragging) dragNode(c.id, c.position);
          else moveNode(c.id, c.position);
        } else if (c.type === "remove") {
          removeNode(c.id);
          setSelectedId((prev) => (prev === c.id ? null : prev));
        }
      }
    },
    [dragNode, moveNode, removeNode],
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
          setSelectedId(addNode(kind, pos));
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
          onConnect={(c) => c.source && c.target && connect(c.source, c.target)}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          fitView
          minZoom={0.3}
          maxZoom={1.6}
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

/** The selected-node scaling controls (vertical size + horizontal replicas + cache). */
function ScalePanel({ id }: { id: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const node = useArena((s) => s.nodes.find((n) => n.id === id));
  const { setSize, setReplicas, setHitRatio, removeNode } = useArena.getState();
  if (!node) return null;

  return (
    <div className="absolute right-3 top-3 w-56 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-[var(--color-ink)] shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold">{KIND_META[node.kind].label[lang]}</span>
        <button
          onClick={() => removeNode(id)}
          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-rose-soft)] transition hover:border-[var(--color-rose)]"
        >
          {t.arena.remove}
        </button>
      </div>
      <p className="mb-0.5 mt-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
        {t.arena.scaling}
      </p>
      <p className="mb-2 text-[10px] text-[var(--color-text-soft)]">
        {t.arena.metric.capacity}:{" "}
        <span className="font-mono text-[var(--color-sky-soft)]">
          {Math.round(effectiveCapacity(node)).toLocaleString()} req/s
        </span>
      </p>

      <label className="block text-[10px] text-[var(--color-text-soft)]">{t.arena.size}</label>
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

      <label className="mt-2.5 block text-[10px] text-[var(--color-text-soft)]">
        {t.arena.replicas}: <span className="font-mono">{node.replicas}</span>
      </label>
      <input
        type="range"
        min={1}
        max={20}
        value={node.replicas}
        onChange={(ev) => setReplicas(id, Number(ev.target.value))}
        className="mt-1 w-full accent-[var(--color-sky)]"
        aria-label={t.arena.replicas}
      />

      {node.kind === "cache" && (
        <>
          <label className="mt-2.5 block text-[10px] text-[var(--color-text-soft)]">
            {t.arena.cacheHitRatio}: <span className="font-mono">{Math.round((node.hitRatio ?? 0) * 100)}%</span>
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
    </div>
  );
}
