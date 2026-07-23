// 100-arena-capacity-sandbox — the drag-and-drop canvas. A second, INDEPENDENT
// React Flow instance (it never imports lib/layout.ts or useSimulator, so the
// Simulator page is untouched — AC8). Nodes/edges are a controlled projection of
// `useArena`; metrics recompute synchronously on every edit ("real time").
//
// 107-arena-wiring-ux — wiring is the page's core gesture, so it's forgiving:
// enlarged handles (ArenaNode), a generous connectionRadius (snap), a visible
// connection line, and a mis-wired link is selectable + Backspace-removable.
// 116 — palette drops add a FREE node (107's auto-wire removed by user request);
// connecting is always the user's explicit drag gesture.

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
import { formatQps } from "./format";
import {
  computeMetrics,
  concurrencyBudgetFor,
  concurrencyStatusFor,
  effectiveCapacity,
  heldInFlight,
  quotaFactorsFor,
  routingTaxFor,
  worseStatus,
} from "./model";
import { EXAMPLES } from "./examples";
import { fanoutNudges } from "./nudges";
import { ARENA_DND_MIME } from "./Palette";
import { NOTE_MAX, useArena } from "./store";

const nodeTypes = { arena: ArenaNode };

/** 107 AC3 — the edge ids a React Flow change list asks to remove (pure). */
export function edgeIdsToRemove(changes: EdgeChange[]): string[] {
  return changes.filter((c) => c.type === "remove").map((c) => c.id);
}

/** 120 — the 📝 marker an annotated edge projects at its midpoint (React Flow's
 *  edge `label`). Pure so AC3's edge case is testable without React Flow layout
 *  (edge labels aren't rendered in jsdom). */
export function edgeLabelFor(edge: { note?: string }): string | undefined {
  return edge.note ? "📝" : undefined;
}

export function ArenaCanvas() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const offeredLoad = useArena((s) => s.offeredLoad);
  // 117 — the workload call shape feeds every model call.
  const callShape = useArena((s) => s.callShape);
  // 107 — node selection lives in the store (drives the scale panel).
  const selectedId = useArena((s) => s.selectedId);
  // 120 — edge selection also lives in the store now (drives the note panel),
  // mutually exclusive with the node selection.
  const selectedEdgeId = useArena((s) => s.selectedEdgeId);
  const dismissedNudges = useArena((s) => s.dismissedNudges);
  const {
    dropNode,
    dragNode,
    moveNode,
    removeNode,
    removeEdge,
    connect,
    select,
    selectEdge,
    setCallsPerRequest,
    dismissNudge,
  } = useArena.getState();

  // 115 — the fan-out suggestion: derived from the design, suggested, never
  // auto-applied (the audited hand-built design ran the LLM path at cpr=1).
  const nudges = useMemo(
    () => fanoutNudges({ nodes, edges }).filter((nd) => !dismissedNudges.includes(nd.targetId)),
    [nodes, edges, dismissedNudges],
  );

  const metrics = useMemo(
    () => computeMetrics({ nodes, edges, callShape }, offeredLoad),
    [nodes, edges, callShape, offeredLoad],
  );

  // 118 — held streams per node (113's Little's-Law figure), now a status signal.
  const held = useMemo(
    () => heldInFlight({ nodes, edges, callShape }, offeredLoad),
    [nodes, edges, callShape, offeredLoad],
  );

  // 119 — the loaded sample's node-anchored explanation bubbles (visibility
  // derives from exampleId, which every structural edit already clears).
  const exampleId = useArena((s) => s.exampleId);
  const calloutsHidden = useArena((s) => s.calloutsHidden);
  const callouts = useMemo(() => {
    if (!exampleId || calloutsHidden) return new Map<string, string>();
    const ex = EXAMPLES.find((x) => x.id === exampleId);
    return new Map((ex?.callouts ?? []).map((c) => [c.nodeId, c.text[lang]]));
  }, [exampleId, calloutsHidden, lang]);

  const rfNodes = useMemo<Node<ArenaNodeData>[]>(
    () =>
      nodes.map((n) => {
        const m = metrics.get(n.id)!;
        // 118 — the effective status is the WORSE of QPS utilization and
        // connection pressure (held streams vs the container budget).
        const budget = concurrencyBudgetFor(n);
        const heldHere = held.get(n.id) ?? null;
        const pressureStatus = concurrencyStatusFor(heldHere, budget);
        return {
          id: n.id,
          type: "arena",
          position: { x: n.x, y: n.y },
          selected: n.id === selectedId,
          data: {
            label: KIND_META[n.kind].label[lang],
            status: pressureStatus ? worseStatus(m.status, pressureStatus) : m.status,
            qps: m.throughput,
            latencyMs: m.latencyMs,
            utilization: m.utilization,
            bottleneck: m.bottleneck,
            shedRps: m.shedRps,
            replicas: n.replicas,
            scaled: n.size !== "medium" || n.replicas > 1,
            region: n.region,
            held: heldHere,
            budget,
            connectionWall: budget !== null && heldHere !== null && heldHere > budget,
            callout: callouts.get(n.id),
            note: n.note,
          },
        };
      }),
    [nodes, metrics, held, callouts, selectedId, lang],
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const isSelected = e.id === selectedEdgeId;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
          selected: isSelected,
          // 120 — an annotated connection shows a 📝 marker at its midpoint.
          label: edgeLabelFor(e),
          markerEnd: { type: MarkerType.ArrowClosed },
          style: {
            stroke: isSelected ? "var(--color-sky)" : "var(--color-edge-soft)",
            strokeWidth: isSelected ? 2 : 1,
          },
        };
      }),
    [edges, selectedEdgeId],
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
  // 120 — React Flow's selection is routed into the store (single selection),
  // which drives both the highlight and the connection note panel.
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const id of edgeIdsToRemove(changes)) removeEdge(id);
      for (const c of changes) {
        if (c.type !== "select") continue;
        if (c.selected) selectEdge(c.id);
        else if (useArena.getState().selectedEdgeId === c.id) selectEdge(null);
      }
    },
    [removeEdge, selectEdge],
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
          // 107/116 — adds a free node and selects it (no auto-wire).
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

      {/* 115 — one chip per active fan-out nudge; Apply is one click, dismiss
          persists per node (and is pruned if the wiring changes). */}
      {nudges.length > 0 && (
        <div className="absolute left-3 top-3 z-10 flex w-60 flex-col gap-2">
          {nudges.map((nd) => (
            <div
              key={nd.targetId}
              className="rounded-xl border border-[var(--color-warn)] bg-[var(--color-panel)] p-2.5 text-[10px] leading-snug text-[var(--color-text-soft)] shadow-lg"
            >
              {t.arena.fanoutNudge}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => setCallsPerRequest(nd.targetId, 2)}
                  className="rounded border border-[var(--color-sky)] px-1.5 py-0.5 text-[10px] text-[var(--color-sky-soft)] transition hover:bg-[color-mix(in_srgb,var(--color-sky)_12%,transparent)]"
                >
                  {t.arena.fanoutApply}
                </button>
                <button
                  onClick={() => dismissNudge(nd.targetId)}
                  className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)] transition hover:border-[var(--color-text-soft)]"
                >
                  {t.arena.fanoutDismiss}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <ScalePanel id={selected.id} />}
      {selectedEdgeId && <EdgePanel id={selectedEdgeId} />}
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
  const offeredLoad = useArena((s) => s.offeredLoad);
  const callShape = useArena((s) => s.callShape);
  const { setSize, setReplicas, setHitRatio, setCallsPerRequest, setRegion, setNodeNote, removeNode } =
    useArena.getState();
  if (!node) return null;
  const design = { nodes, edges, callShape };
  const meta = KIND_META[node.kind];
  const scaling = meta.scaling;
  // 105 — client-side LLM routing overhead this node pays (0 unless it holds
  // LLM deployment endpoints directly; an AI Gateway in between removes it).
  const routing = routingTaxFor(design, id);
  // 114 — the regional quota squeeze on this pool (1 when under quota).
  const quotaFactor = quotaFactorsFor(design).get(id) ?? 1;
  // 113 — requests this node is holding open (Little's Law; null when the
  // awaited path sheds — a figure built on the clamped latency would be fiction).
  const held = heldInFlight(design, offeredLoad).get(id) ?? null;
  // 118 — the held-stream budget (null for kinds without a stated wall).
  const budget = concurrencyBudgetFor(node);

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
              {Math.round(
                effectiveCapacity(node, callShape) * (1 - routing.tax) * quotaFactor,
              ).toLocaleString()}{" "}
              req/s
            </span>
          </p>

          {/* 114 — the regional quota bites: more units here add nothing. */}
          {quotaFactor < 1 && (
            <p
              title={t.arena.quotaHint}
              className="mb-2 rounded-lg bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] p-1.5 text-[9.5px] leading-snug text-[var(--color-text-soft)]"
            >
              {t.arena.quotaLimited(node.region ?? t.arena.regionNone)}
            </p>
          )}

          {/* 113/118 — held connections/streams vs the container budget. */}
          <p
            className="mb-2 text-[10px] text-[var(--color-text-soft)]"
            title={`${t.arena.inflightInfo} ${budget !== null ? t.arena.inflightBudgetHint : ""}`.trim()}
          >
            {t.arena.metric.inflight}:{" "}
            <span
              className="font-mono"
              style={{
                color:
                  budget !== null && held !== null && held > budget
                    ? "var(--color-rose)"
                    : "var(--color-sky-soft)",
              }}
            >
              {held === null ? "—" : `~${formatQps(held)}`}
              {budget !== null && ` / ${formatQps(budget)}`}
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

          {/* 115 — the slider ceiling has a story: escape via pools/regions/tier. */}
          {node.replicas >= 20 && (
            <p className="mt-1 rounded-lg bg-[color-mix(in_srgb,var(--color-warn)_12%,transparent)] p-1.5 text-[9.5px] leading-snug text-[var(--color-text-soft)]">
              {t.arena.replicasCeilingHint}
            </p>
          )}

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

          {/* 112 — both cache-like kinds expose the hit-ratio knob. */}
          {(node.kind === "cache" || node.kind === "semanticCache") && (
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

      {/* 120 — the user's own justification for this box (shown for every node,
          including the client, since any choice is worth a note). */}
      <NoteField key={id} value={node.note ?? ""} onCommit={(v) => setNodeNote(id, v)} />
    </div>
  );
}

/**
 * 120 — the shared free-text note editor for a node or an edge. Local state
 * seeds from the stored note and commits on blur (so the canvas isn't persisted
 * on every keystroke); the counter tracks the live length against NOTE_MAX.
 * Remount it with `key={elementId}` so switching elements reseeds the field.
 */
function NoteField({ value, onCommit }: { value: string; onCommit: (note: string) => void }) {
  const t = useT();
  const [text, setText] = useState(value);
  return (
    <div className="mt-2.5">
      <label className="block text-[10px] text-[var(--color-text-soft)]">{t.arena.noteLabel}</label>
      <textarea
        aria-label={t.arena.noteLabel}
        placeholder={t.arena.notePlaceholder}
        maxLength={NOTE_MAX}
        rows={3}
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        onBlur={() => onCommit(text)}
        className="mt-1 w-full resize-none rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-1 text-[10px] leading-snug text-[var(--color-text-soft)]"
      />
      <div className="mt-0.5 flex items-center justify-between">
        {text.trim() ? (
          <button
            onClick={() => {
              setText("");
              onCommit("");
            }}
            className="text-[9px] text-[var(--color-muted)] transition hover:text-[var(--color-rose-soft)]"
          >
            {t.arena.noteClear}
          </button>
        ) : (
          <span />
        )}
        <span className="text-[9px] text-[var(--color-muted)]">{t.arena.noteCounter(text.length)}</span>
      </div>
    </div>
  );
}

/**
 * 120 — the selected-connection panel: mirrors the node scale panel's note
 * field for an edge (a wiring choice — a fallback pool, an async hop — is a
 * design decision too). Rendered when `selectedEdgeId` is set (mutually
 * exclusive with the node ScalePanel). Exported for direct testing.
 */
export function EdgePanel({ id }: { id: string }) {
  const t = useT();
  const edge = useArena((s) => s.edges.find((e) => e.id === id));
  const { setEdgeNote, removeEdge } = useArena.getState();
  if (!edge) return null;
  return (
    <div className="absolute right-3 top-3 w-56 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-[var(--color-ink)] shadow-lg">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[12px] font-semibold">{t.arena.edgePanelTitle}</span>
        <button
          onClick={() => removeEdge(id)}
          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-rose-soft)] transition hover:border-[var(--color-rose)]"
        >
          {t.arena.remove}
        </button>
      </div>
      <NoteField key={id} value={edge.note ?? ""} onCommit={(v) => setEdgeNote(id, v)} />
    </div>
  );
}
