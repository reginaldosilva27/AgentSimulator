// 129-arena-slo-engine — the objectives checklist.
//
// A pure projection of `slo.ts` over the live design: one row per TRACKED axis
// with its target, the model's actual value and a ✓/✗, plus — on a failed row —
// the culprit box and a remediation hint. Hovering a failed row lights that box
// up on the canvas (reusing 122's highlight channel), because the number and the
// box are the same lesson.
//
// It renders the panel BODY only; the surrounding chrome is the shared bottom-right
// tabbed surface in ArenaCanvas (Objectives · Notes, with 130 adding Brief).

import { useMemo, useState } from "react";

import { useLang, useT } from "../i18n";
import { KIND_META } from "./components";
import { formatLatency, formatQps } from "./format";
import {
  SLO_METRIC_ORDER,
  evaluateObjectives,
  measureDesign,
  remediationFor,
  type SloMetricId,
  type SloResult,
} from "./slo";
import { useArena } from "./store";

/**
 * Per-axis EDITING unit. The store keeps model units (ms, a 0..1 fraction); a
 * human types seconds and whole percents. Kept here because it is a UI concern —
 * `slo.ts` must not learn about input widgets.
 */
const INPUT: Record<
  SloMetricId,
  { toInput: (v: number) => number; fromInput: (v: number) => number; step: number; suffix: string }
> = {
  latency: { toInput: (v) => Math.round(v / 100) / 10, fromInput: (v) => v * 1000, step: 0.5, suffix: "s" },
  headroom: { toInput: (v) => Math.round(v * 100), fromInput: (v) => v / 100, step: 5, suffix: "%" },
  shed: { toInput: (v) => v, fromInput: (v) => v, step: 1, suffix: "/s" },
  cost: { toInput: (v) => Math.round(v), fromInput: (v) => v, step: 100, suffix: "$/h" },
};

/** Format an ACTUAL value in the axis's display unit. */
function formatActual(metric: SloMetricId, v: number): string {
  switch (metric) {
    case "latency":
      return formatLatency(v);
    case "headroom":
      return `${Math.round(v * 100)}%`;
    case "shed":
      return `${formatQps(v)}/s`;
    case "cost":
      return `$${Math.round(v).toLocaleString("en-US")}/h`;
  }
}

export function SloPanel({ onHighlight }: { onHighlight: (nodeId: string | null) => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const callShape = useArena((s) => s.callShape);
  const users = useArena((s) => s.users);
  const thinkTimeSec = useArena((s) => s.thinkTimeSec);
  const sloTargets = useArena((s) => s.sloTargets);
  // 131 — faults are part of the design the verdict judges.
  const faults = useArena((s) => s.faults);
  const setSloTarget = useArena((s) => s.setSloTarget);

  // Pure + cheap, recomputed on every edit — the same instant loop as the node
  // metrics. This is also the single definition the header reads (no drift).
  const verdict = useMemo(
    () =>
      evaluateObjectives(
        measureDesign({ nodes, edges, callShape, faults }, users, thinkTimeSec),
        sloTargets,
      ),
    [nodes, edges, callShape, faults, users, thinkTimeSec, sloTargets],
  );

  const nameOf = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return node ? KIND_META[node.kind].label[lang] : id;
  };

  if (nodes.length === 0) {
    return <p className="text-[9.5px] leading-snug text-[var(--color-muted)]">{t.arena.slo.empty}</p>;
  }

  const untracked = SLO_METRIC_ORDER.filter((m) => sloTargets[m] === undefined);

  return (
    <div>
      <p
        className={`text-[10px] font-semibold ${
          verdict.met ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]"
        }`}
      >
        {verdict.met && verdict.total > 0
          ? t.arena.slo.verdictAllMet
          : t.arena.sloVerdictPartial(verdict.metCount, verdict.total)}
      </p>

      <ul className="mt-1.5 flex flex-col gap-1.5">
        {verdict.results.map((r) => (
          <Row
            key={r.metric}
            result={r}
            label={t.arena.slo.metric[r.metric]}
            culpritName={r.culpritNodeId ? nameOf(r.culpritNodeId) : null}
            hint={
              r.culpritNodeId
                ? remediationFor(
                    r.metric,
                    nodes.find((n) => n.id === r.culpritNodeId)!.kind,
                    lang,
                  )
                : null
            }
            onHighlight={onHighlight}
            onTarget={(v) => setSloTarget(r.metric, v)}
          />
        ))}
      </ul>

      {untracked.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {untracked.map((m) => (
            <button
              key={m}
              title={t.arena.slo.track}
              onClick={() => setSloTarget(m, DEFAULT_WHEN_TRACKED[m])}
              className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
            >
              + {t.arena.slo.metric[m]}
            </button>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[8.5px] leading-snug text-[var(--color-muted)]">{t.arena.slo.hint}</p>
    </div>
  );
}

/** The value an axis gets when the user switches it ON from the panel. Cost is
 *  the only one absent from the shipped defaults, so it needs a starting point. */
const DEFAULT_WHEN_TRACKED: Record<SloMetricId, number> = {
  latency: 30_000,
  headroom: 0.2,
  shed: 0,
  cost: 5_000,
};

function Row({
  result,
  label,
  culpritName,
  hint,
  onHighlight,
  onTarget,
}: {
  result: SloResult;
  label: string;
  culpritName: string | null;
  hint: string | null;
  onHighlight: (nodeId: string | null) => void;
  onTarget: (value: number | null) => void;
}) {
  const t = useT();
  const io = INPUT[result.metric];
  const [draft, setDraft] = useState<string | null>(null);

  const light = () => onHighlight(result.culpritNodeId ?? null);
  const unlight = () => onHighlight(null);

  return (
    <li
      tabIndex={0}
      onMouseEnter={light}
      onMouseLeave={unlight}
      onFocus={light}
      onBlur={unlight}
      className={`rounded-lg border p-1.5 text-[9.5px] leading-snug transition focus:outline-none ${
        result.met
          ? "border-transparent bg-[var(--color-panel-2)]"
          : "border-[var(--color-warn)] bg-[color-mix(in_srgb,var(--color-warn)_8%,transparent)]"
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-semibold text-[var(--color-text-soft)]">
          <span aria-hidden="true">{result.met ? "✓" : "✗"}</span> {label}
        </span>
        <span className="shrink-0 tabular-nums text-[var(--color-ink)]">
          {result.atCeiling ? "≥ " : ""}
          {formatActual(result.metric, result.actual)}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <label className="text-[8.5px] text-[var(--color-muted)]">
          {t.arena.slo.target}
          <input
            type="number"
            aria-label={`${label} — ${t.arena.slo.target}`}
            step={io.step}
            value={draft ?? String(io.toInput(result.target))}
            onChange={(ev) => setDraft(ev.target.value)}
            onBlur={(ev) => {
              const v = Number(ev.target.value);
              if (Number.isFinite(v)) onTarget(io.fromInput(v));
              setDraft(null);
            }}
            className="ml-1 w-14 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1 py-0.5 text-[9px] tabular-nums text-[var(--color-ink)]"
          />
          <span className="ml-0.5">{io.suffix}</span>
        </label>
        <button
          title={t.arena.slo.untrack}
          aria-label={`${label} — ${t.arena.slo.untrack}`}
          onClick={() => onTarget(null)}
          className="ml-auto grid h-4 w-4 place-items-center rounded text-[9px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
        >
          ✕
        </button>
      </div>

      {result.atCeiling && (
        <p className="mt-1 text-[8.5px] text-[var(--color-muted)]">{t.arena.slo.ceilingNote}</p>
      )}

      {!result.met && culpritName && (
        <p className="mt-1 text-[8.5px] text-[var(--color-text-soft)]">
          <span className="font-semibold text-[var(--color-warn)]">
            {t.arena.sloCulprit(culpritName)}
          </span>
          {hint ? ` — ${hint}` : ""}
        </p>
      )}
    </li>
  );
}
