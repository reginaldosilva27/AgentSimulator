// 131-arena-chaos — the chaos panel: the fault catalog + the active-faults list.
//
// Two honesty duties beyond applying faults:
//  - the framing says what this IS (the same model re-evaluated with a box removed
//    or degraded, not a live outage);
//  - the active list is always visible, so the user can never be confused about why
//    the numbers moved. Nothing is random, nothing is hidden.
//
// Faults are transient by design (never persisted), which the panel states.

import { useState } from "react";

import { useLang, useT } from "../i18n";
import { ARENA_REGIONS, KIND_META } from "./components";
import { FAULT_META, FAULT_ORDER, type ArenaFaultType } from "./chaos";
import { useArena } from "./store";

/** A fault's target is either the selected node or a chosen region. */
export function ChaosPanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nodes = useArena((s) => s.nodes);
  const faults = useArena((s) => s.faults);
  const selectedId = useArena((s) => s.selectedId);
  const challengeId = useArena((s) => s.challengeId);
  const [region, setRegion] = useState<string>(ARENA_REGIONS[0]);

  const selected = nodes.find((n) => n.id === selectedId);
  const nameOf = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    return node ? KIND_META[node.kind].label[lang] : id;
  };

  /** A fault type is offerable when its target exists and its kinds allow it. */
  const canApply = (type: ArenaFaultType): boolean => {
    const meta = FAULT_META[type];
    if (meta.target === "region") return true;
    if (!selected) return false;
    return !meta.kinds || meta.kinds.includes(selected.kind);
  };

  return (
    <div className="text-[9.5px] leading-snug text-[var(--color-text-soft)]">
      <p className="text-[8.5px] text-[var(--color-muted)]">{t.arena.chaos.hint}</p>

      <label className="mt-1.5 flex items-center gap-1 text-[8.5px] text-[var(--color-muted)]">
        {t.arena.region}
        <select
          aria-label={t.arena.region}
          value={region}
          onChange={(ev) => setRegion(ev.target.value)}
          className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1 py-0.5 text-[9px] text-[var(--color-ink)]"
        >
          {ARENA_REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <ul className="mt-1.5 flex flex-col gap-1">
        {FAULT_ORDER.map((type) => {
          const meta = FAULT_META[type];
          const enabled = canApply(type);
          return (
            <li key={type} className="rounded-lg bg-[var(--color-panel-2)] p-1.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-semibold text-[var(--color-text-soft)]">
                  {meta.label[lang]}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {meta.magnitudes.length > 0 ? (
                    meta.magnitudes.map((mag) => (
                      <button
                        key={mag}
                        disabled={!enabled}
                        title={enabled ? meta.mechanism[lang] : t.arena.chaos.selectFirst}
                        aria-label={`${meta.label[lang]} ${mag}`}
                        onClick={() =>
                          useArena.getState().applyFault({
                            type,
                            magnitude: mag,
                            ...(meta.target === "region"
                              ? { region }
                              : { nodeId: selected!.id }),
                          })
                        }
                        className="rounded border border-[var(--color-line)] px-1 py-px text-[8.5px] tabular-nums text-[var(--color-muted)] transition enabled:hover:border-[var(--color-rose)] enabled:hover:text-[var(--color-rose-soft)] disabled:opacity-40"
                      >
                        {mag < 1 ? `−${Math.round(mag * 100)}%` : `×${mag}`}
                      </button>
                    ))
                  ) : (
                    <button
                      disabled={!enabled}
                      title={enabled ? meta.mechanism[lang] : t.arena.chaos.selectFirst}
                      aria-label={meta.label[lang]}
                      onClick={() =>
                        useArena.getState().applyFault({
                          type,
                          ...(meta.target === "region" ? { region } : { nodeId: selected!.id }),
                        })
                      }
                      className="rounded border border-[var(--color-line)] px-1.5 py-px text-[8.5px] text-[var(--color-muted)] transition enabled:hover:border-[var(--color-rose)] enabled:hover:text-[var(--color-rose-soft)] disabled:opacity-40"
                    >
                      {t.arena.chaos.apply}
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-0.5 text-[8.5px] text-[var(--color-muted)]">
                {meta.mechanism[lang]}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 border-t border-[var(--color-line)] pt-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[8px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            {t.arena.chaos.active}
          </span>
          {faults.length > 0 && (
            <button
              onClick={() => useArena.getState().clearFaults()}
              className="text-[8.5px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            >
              {t.arena.chaos.clearAll}
            </button>
          )}
        </div>

        {faults.length === 0 ? (
          <p className="mt-0.5 text-[8.5px] text-[var(--color-muted)]">{t.arena.chaos.none}</p>
        ) : (
          <ul className="mt-0.5 flex flex-col gap-1">
            {faults.map((f) => {
              const given = f.id.startsWith("given-") && !!challengeId;
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-1.5 rounded border border-[var(--color-rose)] bg-[color-mix(in_srgb,var(--color-rose)_8%,transparent)] px-1.5 py-1"
                >
                  <span>
                    ⚡{" "}
                    {t.arena.chaosFaultOn(
                      FAULT_META[f.type].label[lang],
                      f.nodeId ? nameOf(f.nodeId) : (f.region ?? ""),
                    )}
                  </span>
                  {given ? (
                    <span
                      title={t.arena.chaos.locked}
                      className="shrink-0 text-[8.5px] text-[var(--color-muted)]"
                    >
                      🔒
                    </span>
                  ) : (
                    <button
                      aria-label={`${t.arena.chaos.remove} ${f.id}`}
                      title={t.arena.chaos.remove}
                      onClick={() => useArena.getState().removeFault(f.id)}
                      className="shrink-0 text-[9px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
                    >
                      ✕
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-1 text-[8px] text-[var(--color-muted)]">{t.arena.chaos.transient}</p>
      </div>
    </div>
  );
}
