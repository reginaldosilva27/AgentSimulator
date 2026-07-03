import { useT } from "../i18n";
import { HARNESS_ROLE_COLOR, HARNESS_ROLES } from "../lib/harness";
import { deriveLoopView } from "../lib/loop";
import { useLens } from "../lib/lens";
import { useSimulator } from "../store/useSimulator";

// 095-harness-loop-lens — the lens legend + Loop readout, floated over the canvas.
// Kept out of the header (space) so the explainer has room. Renders nothing under
// the `all` lens (baseline untouched). Under `loop` it also surfaces the loop's
// control readout (iteration count · stop reason · failure), a pure projection of
// the trace via `deriveLoopView`. `onLearnMore` jumps to the Learn page (096).
export function LensOverlay({ onLearnMore }: { onLearnMore: () => void }) {
  const mode = useLens((s) => s.mode);
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const t = useT();

  if (mode === "all") return null;

  const legend = mode === "harness" ? t.lens.legend.harness : t.lens.legend.loop;
  const loop = mode === "loop" ? deriveLoopView(events, cursor) : null;
  const stopText =
    loop?.stopReason === "final-answer"
      ? t.lens.loop.stopFinal
      : loop?.stopReason === "max-iterations"
        ? t.lens.loop.stopMax
        : t.lens.loop.inProgress;
  // ✓ final answer reads as the *good* outcome (green); hitting the cap is the
  // warning outcome (amber); still turning is neutral. This is what stops "2 turns
  // · cap 3 · Answered" from looking like an unfinished 2-of-3 progress bar.
  const stopColor =
    loop?.stopReason === "final-answer"
      ? "var(--color-ok)"
      : loop?.stopReason === "max-iterations"
        ? "var(--color-warn)"
        : "var(--color-muted)";

  return (
    <div
      className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[300px] flex-col gap-1.5"
      data-testid="lens-overlay"
      data-lens-mode={mode}
    >
      <div className="pointer-events-auto rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_92%,transparent)] px-3 py-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
          <span>{mode === "harness" ? "🧰" : "🔄"}</span>
          <span>{mode === "harness" ? t.lens.mode.harness : t.lens.mode.loop}</span>
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-[var(--color-text-soft)]">{legend}</p>

        {mode === "harness" && (
          <div className="mt-2" data-testid="lens-role-legend">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {t.lens.roleLegendTitle}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {HARNESS_ROLES.map((role) => (
                <div key={role} className="flex items-center gap-1.5" title={t.lens.roleHint[role]}>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: HARNESS_ROLE_COLOR[role] }}
                  />
                  <span className="truncate text-[10px] text-[var(--color-text-soft)]">
                    {t.lens.role[role]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loop && (
          <div
            className="mt-1.5 flex flex-wrap items-center gap-1.5"
            data-testid="lens-loop-readout"
          >
            <span className="rounded-full border border-[var(--color-line)] px-1.5 py-px font-mono text-[9.5px] text-[var(--color-indigo-soft)]">
              {t.lens.loop.iteration(loop.iterations, loop.maxIterations)}
            </span>
            <span
              className="rounded-full px-1.5 py-px text-[9.5px]"
              style={{
                color: stopColor,
                border: `1px solid color-mix(in srgb, ${stopColor} 45%, transparent)`,
              }}
            >
              {stopText}
            </span>
            {loop.failure && (
              <span className="rounded-full border border-[color-mix(in_srgb,var(--color-warn)_50%,transparent)] px-1.5 py-px text-[9.5px] text-[var(--color-warn)]">
                {t.lens.loop.recovery}
              </span>
            )}
          </div>
        )}

        <button
          onClick={onLearnMore}
          className="mt-1.5 text-[10px] font-medium text-[var(--color-sky-soft)] underline-offset-2 transition hover:underline"
        >
          {t.lens.legend.learnMore}
        </button>
      </div>
    </div>
  );
}
