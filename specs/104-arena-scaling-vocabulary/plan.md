# Plan: Arena — per-component scaling vocabulary + info explainers

> HOW. Frontend-only; extends specs 100–103.

## Approach

Extend `KIND_META` (already the bilingual per-kind catalog) with a `scaling` block
(`unit` + `sizeMeaning`, or `null` for non-scalable kinds) and a required `info`
paragraph. The scale panel (`ScalePanel` in `ArenaCanvas.tsx`) reads the vocabulary
instead of the generic labels, hides the scaling controls when `scaling === null`
(client), and gains a local info toggle. Export `ScalePanel` so it's directly
testable with a seeded store.

## Affected files

- `arena/components.ts` — `KindMeta` gains `info: {en,pt}` + `scaling: {unit,
  sizeMeaning} | null`; fill for all 13 kinds (client → `scaling: null`).
- `arena/ArenaCanvas.tsx` — `ScalePanel` (exported): unit label, size hint,
  capacity formula hint, ℹ️ toggle revealing `info[lang]`, no controls for client.
- `i18n/strings.ts` — `arena.infoLabel` (aria/button) + `arena.capacityHint`, en+pt.
- `arena/i18n.test.ts` — AC1/AC6: every kind has `info` en+pt; scalable kinds have
  `unit`/`sizeMeaning` en+pt; client `scaling === null`.
- `arena/ScalePanel.test.tsx` — **new**: AC2 (LLM shows "Deployments"), AC3 (info
  toggle reveals the LLM explainer), AC4 (client hides scaling controls).

## Protocol / data model changes

None.

## i18n strings (constitution §4)

`arena.infoLabel` ("About this component" / "Sobre este componente"),
`arena.capacityHint` (formula), plus per-kind `unit`/`sizeMeaning`/`info` in
`components.ts` — all en+pt, pinned by the extended i18n test.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1/AC6 | meta completeness en+pt; client non-scalable | `arena/i18n.test.ts` |
| AC2 | LLM panel shows "Deployments" | `arena/ScalePanel.test.tsx` |
| AC3 | info toggle reveals explainer | `arena/ScalePanel.test.tsx` |
| AC4 | client: no size/replicas/calls controls | `arena/ScalePanel.test.tsx` |
| AC5 | capacity `title` carries the formula hint | `arena/ScalePanel.test.tsx` |

## Risks / trade-offs

- "Deployments" kept untranslated in pt (industry term) — the pt info paragraph
  explains it; consistent with the proper-noun convention.
- Info state is local `useState` (per panel mount) — no persistence needed.
