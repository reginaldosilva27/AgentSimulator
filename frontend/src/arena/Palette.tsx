// 100-arena-capacity-sandbox — the draggable component palette (left rail).
// Drag a card onto the canvas to add it (HTML5 DnD; the kind travels in
// dataTransfer, read by ArenaCanvas.onDrop).

import { useLang, useT } from "../i18n";
import { KIND_META, PALETTE_ORDER, type ArenaKind } from "./components";

export const ARENA_DND_MIME = "application/agentsim-arena-kind";

export function Palette() {
  const t = useT();
  const lang = useLang((s) => s.lang);

  return (
    <aside className="flex w-44 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] p-2.5">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">
          {t.arena.paletteTitle}
        </h2>
        <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">{t.arena.paletteHint}</p>
      </div>
      {PALETTE_ORDER.map((kind: ArenaKind) => {
        const meta = KIND_META[kind];
        return (
          <div
            key={kind}
            draggable
            onDragStart={(ev) => {
              ev.dataTransfer.setData(ARENA_DND_MIME, kind);
              ev.dataTransfer.effectAllowed = "copy";
            }}
            className="cursor-grab rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-[var(--color-ink)] transition hover:border-[var(--color-sky)] active:cursor-grabbing"
            title={meta.description[lang]}
          >
            <div className="text-[11.5px] font-medium">{meta.label[lang]}</div>
            <div className="truncate text-[9.5px] text-[var(--color-muted)]">
              {meta.description[lang]}
            </div>
          </div>
        );
      })}
      <p className="mt-1 border-t border-[var(--color-line)] pt-2 text-[9.5px] leading-snug text-[var(--color-muted)]">
        {t.arena.selectHint}
      </p>
    </aside>
  );
}
