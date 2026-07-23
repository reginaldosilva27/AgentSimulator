// 100-arena-capacity-sandbox — the Arena page (a capacity SANDBOX, separate from
// the Simulator). Composition: palette (left) + drag-drop canvas (center) + an
// offered-load control (top) + a persistent honesty banner (constitution §3:
// this is an analytical model, not a live load test).

import { ReactFlowProvider } from "@xyflow/react";

import { useLang, useT } from "../i18n";
import { ArenaCanvas } from "./ArenaCanvas";
import { EXAMPLES } from "./examples";
import { Palette } from "./Palette";
import { useArena } from "./store";

export function ArenaPage() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const offeredLoad = useArena((s) => s.offeredLoad);
  const exampleId = useArena((s) => s.exampleId);
  const { setOfferedLoad, clear, loadExample } = useArena.getState();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Control bar: offered-load slider + reset. */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_45%,transparent)] px-4 py-2.5">
        <div>
          <h1 className="text-[13px] font-semibold text-[var(--color-ink)]">{t.arena.title}</h1>
          <p className="text-[10.5px] text-[var(--color-muted)]">{t.arena.tagline}</p>
        </div>
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <label
            className="whitespace-nowrap text-[11px] font-medium text-[var(--color-text-soft)]"
            title={t.arena.loadHint}
          >
            {t.arena.load}
          </label>
          <input
            type="range"
            min={100}
            max={500_000}
            step={100}
            value={offeredLoad}
            onChange={(ev) => setOfferedLoad(Number(ev.target.value))}
            className="min-w-[120px] flex-1 accent-[var(--color-sky)]"
            aria-label={t.arena.load}
          />
          <span className="w-28 whitespace-nowrap text-right font-mono text-[11px] text-[var(--color-sky-soft)]">
            {t.arena.users(offeredLoad)}
          </span>
        </div>
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
