// 100-arena-capacity-sandbox — the custom React Flow node: a component box that
// renders its live modeled metrics (QPS · latency · util% · status) and lights
// up when it's the bottleneck. Pure projection of the NodeMetrics fed in `data`.

import { Handle, Position, type NodeProps } from "@xyflow/react";

import { useT } from "../i18n";
import { formatLatency, formatQps } from "./format";
import type { NodeStatus } from "./model";

export interface ArenaNodeData extends Record<string, unknown> {
  label: string;
  status: NodeStatus;
  qps: number;
  latencyMs: number;
  utilization: number;
  bottleneck: boolean;
  /** 103 — calls/s shed past capacity (the honest 429 rate). */
  shedRps: number;
  replicas: number;
  scaled: boolean; // size !== medium || replicas > 1 — show a badge
  /** 106 — region annotation shown as a badge (multi-region pools at a glance). */
  region?: string;
  /** 118 — held streams (113) vs the container budget; null when unbudgeted or
   *  the awaited path sheds (no honest figure). */
  held?: number | null;
  budget?: number | null;
  /** 118 — held > budget: the connection wall (independent of QPS utilization). */
  connectionWall?: boolean;
  /** 122 — lit while the pointer is on this node's entry in the example-notes
   *  panel (the spatial link the old anchored bubbles used to carry). */
  highlight?: boolean;
  /** 120 — the user's own note on this box (shows a 📝 marker + tooltip). */
  note?: string;
  /** 123 — the agent harness's turn fan-out (LLM calls/turn), shown as a badge so
   *  the model's elevated QPS + the multiplied e2e latency read as an agent trait.
   *  Only set for the harness node; `null` when it has no model child wired yet. */
  fanOut?: number | null;
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  healthy: "var(--color-ok)",
  warning: "var(--color-warn)",
  critical: "var(--color-rose)",
  unreachable: "var(--color-muted)",
};

export function ArenaNode({ id, data, selected }: NodeProps) {
  const t = useT();
  const d = data as ArenaNodeData;
  const color = STATUS_COLOR[d.status];
  const pct = Math.round(d.utilization * 100);

  return (
    <div
      className="relative min-w-[150px] rounded-xl border bg-[var(--color-panel)] px-3 py-2 text-[var(--color-ink)] shadow-sm transition"
      data-highlighted={d.highlight ? id : undefined}
      style={{
        borderColor: d.bottleneck
          ? "var(--color-rose)"
          : selected || d.highlight
            ? "var(--color-sky)"
            : "var(--color-line)",
        boxShadow: d.bottleneck
          ? "0 0 0 2px color-mix(in srgb, var(--color-rose) 45%, transparent)"
          : d.highlight
            ? "0 0 0 2px color-mix(in srgb, var(--color-sky) 45%, transparent)"
            : undefined,
      }}
    >
      {/* 107 — wiring is the core gesture: handles are enlarged (14px + ring)
          and grow on hover so grabbing a connection is forgiving. */}
      <Handle
        type="target"
        position={Position.Left}
        className="arena-handle transition-transform hover:scale-150"
        style={{
          width: 14,
          height: 14,
          background: "var(--color-sky)",
          border: "2.5px solid var(--color-panel)",
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold">{d.label}</span>
        <div className="flex shrink-0 items-center gap-1">
          {/* 120 — a note marker: the box carries the architect's justification. */}
          {d.note && (
            <span className="text-[10px] leading-none" aria-label={t.arena.noteLabel} title={d.note}>
              📝
            </span>
          )}
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color }}
            aria-label={t.arena.status[d.status]}
            title={t.arena.status[d.status]}
          />
        </div>
      </div>

      {/* 123 — the harness's turn fan-out, in words: the honest source of the
          LLM's elevated QPS and the multiplied end-to-end latency. */}
      {d.fanOut != null && (
        <div className="mt-0.5">
          <span className="inline-block rounded bg-[color-mix(in_srgb,var(--color-sky)_15%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-sky-soft)]">
            {t.arena.fanoutTurn(d.fanOut)}
          </span>
        </div>
      )}

      {(d.replicas > 1 || d.region) && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {d.replicas > 1 && (
            <span className="inline-block rounded bg-[var(--color-panel-2)] px-1 text-[9px] text-[var(--color-muted)]">
              ×{d.replicas}
            </span>
          )}
          {/* 106 — the pool's region: two LLM pools in different regions read
              differently at a glance. */}
          {d.region && (
            <span
              className="inline-block rounded bg-[var(--color-panel-2)] px-1 font-mono text-[9px] text-[var(--color-sky-soft)]"
              title={t.arena.regionHint}
            >
              {d.region}
            </span>
          )}
        </div>
      )}

      <dl className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-text-soft)]">
        <dt className="text-[var(--color-muted)]">{t.arena.metric.qps}</dt>
        <dd className="text-right font-mono">{formatQps(d.qps)}</dd>
        <dt className="text-[var(--color-muted)]">{t.arena.metric.latency}</dt>
        {/* 103 — past saturation a real API sheds (429s); a queue-latency figure
            would be fiction, so the box shows the shed rate instead. */}
        <dd className="text-right font-mono">{d.bottleneck ? "—" : formatLatency(d.latencyMs)}</dd>
        <dt className="text-[var(--color-muted)]">{t.arena.metric.util}</dt>
        <dd className="text-right font-mono" style={{ color }}>
          {pct}%
        </dd>
        {/* 118 — held streams vs the container budget, on the face: the wall
            that fells agent backends while their QPS reads green. */}
        {d.budget != null && (
          <>
            <dt className="text-[var(--color-muted)]" title={t.arena.inflightBudgetHint}>
              {t.arena.metric.inflight}
            </dt>
            <dd
              className="text-right font-mono"
              style={{ color: d.connectionWall ? "var(--color-rose)" : undefined }}
            >
              {d.held == null ? "—" : `~${formatQps(d.held)} / ${formatQps(d.budget)}`}
            </dd>
          </>
        )}
      </dl>

      {/* Utilization meter — visually saturates and turns critical past 100%. */}
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>

      {d.bottleneck && (
        <div className="mt-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--color-rose)]">
          {t.arena.bottleneck}
          <div className="font-mono text-[8.5px] font-normal normal-case tracking-normal">
            {t.arena.shedding(formatQps(d.shedRps))}
          </div>
        </div>
      )}

      {/* 118 — the connection wall names ITS failure mode: streams, not QPS. */}
      {d.connectionWall && d.held != null && (
        <div className="mt-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--color-rose)]">
          {t.arena.connectionWall}
          <div className="font-mono text-[8.5px] font-normal normal-case tracking-normal">
            {t.arena.connectionWallDetail(formatQps(d.held))}
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="arena-handle transition-transform hover:scale-150"
        style={{
          width: 14,
          height: 14,
          background: "var(--color-sky)",
          border: "2.5px solid var(--color-panel)",
        }}
      />
    </div>
  );
}
