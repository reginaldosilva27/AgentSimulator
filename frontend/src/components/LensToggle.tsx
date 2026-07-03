import { useT } from "../i18n";
import { LENS_MODES, type LensMode, useLens } from "../lib/lens";

// 096-harness-loop-lens — the Harness ⇄ Loop lens control. A tight segmented
// switch (All · 🗺️ Harness · 🔄 Loop) that reframes the canvas emphasis without
// touching the run. Mirrors CloudToggle's styling. `all` is the default and
// reproduces today's view byte-for-byte; the legend + loop readout render in the
// canvas overlay (LensOverlay), not here, to keep the header compact.
const ICON: Record<LensMode, string> = { all: "◎", harness: "🧰", loop: "🔄" };

export function LensToggle() {
  const mode = useLens((s) => s.mode);
  const setMode = useLens((s) => s.setMode);
  const t = useT();

  return (
    <div
      className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-0.5"
      role="group"
      aria-label={t.lens.label}
      title={t.lens.label}
    >
      {LENS_MODES.map((m) => {
        const active = mode === m;
        const label = t.lens.mode[m];
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium leading-none transition ${
              active
                ? "bg-[var(--color-panel)] text-[var(--color-indigo-soft)] shadow-sm"
                : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            <span className="text-sm leading-none">{ICON[m]}</span>
            <span className="hidden xl:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
