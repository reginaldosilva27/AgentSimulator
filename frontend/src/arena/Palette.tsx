// 100-arena-capacity-sandbox — the draggable component palette (left rail).
// Drag a card onto the canvas to add it (HTML5 DnD; the kind travels in
// dataTransfer, read by ArenaCanvas.onDrop).
//
// 126-arena-palette-groups — the palette is organized into titled groups (the
// story of the architecture, top-down) with a search field that narrows the list
// in the active language. Grouping is the single-source PALETTE_GROUPS; empty
// groups (e.g. all filtered out) render nothing.

import { useState } from "react";

import { useLang, useT } from "../i18n";
import { challengeById } from "./challenges";
import { filterPalette, KIND_META, PALETTE_GROUPS, type ArenaKind } from "./components";
import { useArena } from "./store";

export const ARENA_DND_MIME = "application/agentsim-arena-kind";

function PaletteItem({ kind, lang }: { kind: ArenaKind; lang: "en" | "pt" }) {
  const meta = KIND_META[kind];
  return (
    <div
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(ARENA_DND_MIME, kind);
        ev.dataTransfer.effectAllowed = "copy";
      }}
      className="cursor-grab rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-[var(--color-ink)] transition hover:border-[var(--color-sky)] active:cursor-grabbing"
      title={meta.description[lang]}
    >
      <div className="text-[11.5px] font-medium">{meta.label[lang]}</div>
      <div className="truncate text-[9.5px] text-[var(--color-muted)]">{meta.description[lang]}</div>
    </div>
  );
}

export function Palette() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [query, setQuery] = useState("");
  // 130 AC8 — a challenge may restrict the palette. Applied AFTER 126's grouping +
  // search so the two features compose; absent = the full catalog (the sandbox
  // path is byte-for-byte unchanged).
  const allowedKinds = useArena((s) => challengeById(s.challengeId)?.allowedKinds);

  const grouped = filterPalette(PALETTE_GROUPS, query, lang);
  const groups = allowedKinds
    ? grouped
        .map((g) => ({ ...g, kinds: g.kinds.filter((k) => allowedKinds.includes(k)) }))
        .filter((g) => g.kinds.length > 0)
    : grouped;

  return (
    <aside className="flex w-44 shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] p-2.5">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">
          {t.arena.paletteTitle}
        </h2>
        <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">{t.arena.paletteHint}</p>
      </div>

      {/* 126 — narrow the palette by name/description in the active language. */}
      <input
        type="search"
        value={query}
        onChange={(ev) => setQuery(ev.target.value)}
        placeholder={t.arena.searchPlaceholder}
        aria-label={t.arena.searchPlaceholder}
        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px] text-[var(--color-ink)] placeholder:text-[var(--color-muted)]"
      />

      {groups.length === 0 ? (
        <p className="mt-1 text-[10px] text-[var(--color-muted)]">{t.arena.searchEmpty}</p>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            <h3 className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {group.title[lang]}
            </h3>
            {group.kinds.map((kind) => (
              <PaletteItem key={kind} kind={kind} lang={lang} />
            ))}
          </div>
        ))
      )}

      <div className="mt-1 space-y-1 border-t border-[var(--color-line)] pt-2 text-[9.5px] leading-snug text-[var(--color-muted)]">
        <p>{t.arena.selectHint}</p>
        {/* 107 — the two wiring gestures, taught where the dragging starts. */}
        <p>{t.arena.connectHint}</p>
        <p>{t.arena.edgeHint}</p>
      </div>
    </aside>
  );
}
