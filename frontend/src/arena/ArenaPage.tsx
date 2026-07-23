// 100-arena-capacity-sandbox — the Arena page (a capacity SANDBOX, separate from
// the Simulator). Composition: palette (left) + drag-drop canvas (center) + the
// load controls (top) + a persistent honesty banner (constitution §3: this is an
// analytical model, not a live load test).
//
// 103-arena-realism: the load is framed in USERS via Little's Law (users ÷ think
// time = req/s) — the conversion is always shown, because "100k users" and
// "100k req/s" differ by orders of magnitude. The bar also carries the two
// readouts an architect asks for first: end-to-end latency (critical path) and
// the estimated LLM cost/hour (stated per-call assumption).

import { ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";

import { useLang, useT } from "../i18n";
import { ArenaCanvas } from "./ArenaCanvas";
import { EXAMPLES } from "./examples";
import { formatLatency, formatQps } from "./format";
import { computeMetrics, endToEndLatencyMs, llmCost, rpsOf } from "./model";
import { Palette } from "./Palette";
import { useArena } from "./store";

const THINK_TIMES = [10, 20, 30, 60, 120] as const;

export function ArenaPage() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const users = useArena((s) => s.users);
  const thinkTimeSec = useArena((s) => s.thinkTimeSec);
  const offeredLoad = useArena((s) => s.offeredLoad);
  const exampleId = useArena((s) => s.exampleId);
  const { setUsers, setThinkTime, clear, loadExample } = useArena.getState();

  const locale = lang === "pt" ? "pt-BR" : "en-US";

  // 103 AC5/AC6 — the derived readouts, recomputed on every edit (pure + cheap).
  // 108 — plus the total shed rate: when anything saturates, the header tells the
  // shed story instead of a fictional (0.99-clamped) latency figure.
  // 111 — the LLM bill is two-sided: provisioned (billed even idle) + usage.
  const { e2eMs, cost, totalShed } = useMemo(() => {
    if (nodes.length === 0) {
      return { e2eMs: 0, cost: { provisionedPerHour: 0, usagePerHour: 0 }, totalShed: 0 };
    }
    const design = { nodes, edges };
    const metrics = computeMetrics(design, offeredLoad);
    let shed = 0;
    for (const n of nodes) shed += metrics.get(n.id)!.shedRps;
    return {
      e2eMs: endToEndLatencyMs(design, offeredLoad),
      cost: llmCost(design, offeredLoad),
      totalShed: shed,
    };
  }, [nodes, edges, offeredLoad]);

  const fmtUsd = (v: number) =>
    v >= 100 ? Math.round(v).toLocaleString(locale) : v.toFixed(2);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Control bar: users + think time (Little's Law) · readouts · examples · reset. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_45%,transparent)] px-4 py-2.5">
        <div>
          <h1 className="text-[13px] font-semibold text-[var(--color-ink)]">{t.arena.title}</h1>
          <p className="text-[10.5px] text-[var(--color-muted)]">{t.arena.tagline}</p>
        </div>

        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <label className="whitespace-nowrap text-[11px] font-medium text-[var(--color-text-soft)]">
            {t.arena.usersLabel}
          </label>
          <input
            type="range"
            min={100}
            max={200_000}
            step={100}
            value={users}
            onChange={(ev) => setUsers(Number(ev.target.value))}
            className="min-w-[110px] flex-1 accent-[var(--color-sky)]"
            aria-label={t.arena.usersLabel}
          />
          <select
            aria-label={t.arena.thinkTime}
            title={t.arena.thinkTimeHint}
            value={thinkTimeSec}
            onChange={(ev) => setThinkTime(Number(ev.target.value))}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-1.5 py-1 text-[11px] text-[var(--color-text-soft)]"
          >
            {THINK_TIMES.map((s) => (
              <option key={s} value={s}>
                1/{s}s
              </option>
            ))}
          </select>
          {/* 110 — demanded (users ÷ think) vs effective (closed-loop equilibrium):
              when latency throttles the population by >5%, both figures show. */}
          {(() => {
            const demand = rpsOf(users, thinkTimeSec);
            const throttled = demand > 0 && (demand - offeredLoad) / demand > 0.05;
            return (
              <span
                className="whitespace-nowrap text-right font-mono text-[11px] text-[var(--color-sky-soft)]"
                title={throttled ? t.arena.closedLoopHint : t.arena.thinkTimeHint}
              >
                {t.arena.usersReadout(
                  users.toLocaleString(locale),
                  demand.toLocaleString(locale),
                )}
                {throttled && (
                  <span className="text-[var(--color-warn)]">
                    {" "}
                    {t.arena.effectiveRate(offeredLoad.toLocaleString(locale))}
                  </span>
                )}
              </span>
            );
          })()}
        </div>

        {/* 103 — the two architect readouts, derived from the same pure model. */}
        {nodes.length > 0 && (
          <div className="flex items-center gap-3 whitespace-nowrap text-[10.5px] text-[var(--color-muted)]">
            {totalShed > 0 ? (
              // 108 AC1/AC2 — one story per screen: the node box already shows "—"
              // for a shedding node; the header must not price the queue either.
              <span
                title={t.arena.saturatedHint}
                className="font-medium text-[var(--color-rose)]"
              >
                {t.arena.saturatedHeader(formatQps(totalShed))}
              </span>
            ) : (
              <span title={t.arena.e2eLatencyHint}>
                {t.arena.e2eLatency}:{" "}
                <span className="font-mono text-[var(--color-text-soft)]">
                  {formatLatency(e2eMs)}
                </span>
              </span>
            )}
            {(cost.provisionedPerHour > 0 || cost.usagePerHour > 0) && (
              <span title={t.arena.llmCostHint}>
                {t.arena.llmCost}:{" "}
                <span className="font-mono text-[var(--color-text-soft)]">
                  {[
                    cost.provisionedPerHour > 0
                      ? t.arena.llmCostProvisioned(fmtUsd(cost.provisionedPerHour))
                      : null,
                    cost.usagePerHour > 0 ? t.arena.llmCostUsage(fmtUsd(cost.usagePerHour)) : null,
                  ]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
              </span>
            )}
          </div>
        )}

        {/* 101 — load an example scenario (replaces the canvas; Reset clears it). */}
        <select
          aria-label={t.arena.examples}
          value={exampleId ?? ""}
          onChange={(ev) => {
            if (ev.target.value) loadExample(ev.target.value);
          }}
          className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1 text-[11px] text-[var(--color-text-soft)] transition hover:border-[var(--color-sky)]"
        >
          <option value="" disabled>
            {t.arena.examples}
          </option>
          {EXAMPLES.map((ex) => (
            <option key={ex.id} value={ex.id} title={ex.description[lang]}>
              {ex.title[lang]}
            </option>
          ))}
        </select>
        <button
          onClick={() => clear()}
          className="rounded-lg border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-text-soft)] transition hover:border-[var(--color-rose)] hover:text-[var(--color-rose-soft)]"
        >
          {t.arena.reset}
        </button>
      </div>

      {/* Palette + canvas. */}
      <div className="flex min-h-0 flex-1">
        <Palette />
        <ReactFlowProvider>
          <ArenaCanvas />
        </ReactFlowProvider>
      </div>

      {/* Honesty banner — always present (AC10). */}
      <div
        role="note"
        className="border-t border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-warn)_10%,transparent)] px-4 py-1.5 text-center text-[10.5px] text-[var(--color-text-soft)]"
      >
        {t.arena.honesty}
      </div>
    </div>
  );
}
