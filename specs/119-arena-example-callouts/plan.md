# Plan: 119-arena-example-callouts

## Approach

Pure content + projection. Callouts are data on `ArenaExample`
(`callouts: Array<{ nodeId, text: {en, pt} }>`); visibility is derived from the
existing `exampleId` (already transient and cleared by every structural edit)
plus one transient `calloutsHidden` flag in the store. Rendering rides the
custom node: `ArenaNodeData` gains an optional `callout?: string` and
`onDismissCallout`, and `ArenaNode` draws an absolutely-positioned bubble above
the box — anchored for free, moves with drags, no layout engine needed.

## Affected files

- `frontend/src/arena/examples.ts` — `callouts` on the `ArenaExample`
  interface + 2–4 bilingual callouts per preset (9 presets), each anchored to a
  real node id: the load story on `client`/`backend`, the fan-out on the
  gateway/LLM, the quota/cache/region lesson on the relevant box.
- `frontend/src/arena/store.ts` — `calloutsHidden: boolean` (transient, like
  `selectedId`); `hideCallouts()`; `loadExample` resets it to false.
- `frontend/src/arena/ArenaCanvas.tsx` — look up the active example's callouts
  when `exampleId` is set and `!calloutsHidden`; feed `callout` text (current
  lang) into the matching node's data.
- `frontend/src/arena/ArenaNode.tsx` — the bubble (rounded, panel bg, sky
  border, max-w, pointer above) + ✕ calling `onDismissCallout`.
- `frontend/src/i18n/strings.ts` — `arena.calloutHide` aria-label (en+pt).
- Tests: `examples.test.ts` (AC1), `ArenaCanvas.integration.test.tsx`
  (AC2/AC3), `store.test.ts` (AC4 + reset semantics).

## Test strategy (AC → test)

- AC1 → `examples.test.ts`: walk `EXAMPLES` — ≥2 callouts, node ids ⊆ build()
  ids, en+pt non-empty.
- AC2 → integration: `loadExample("simple-rag")` → its callout text visible;
  fresh store with `exampleId = null` → absent.
- AC3 → integration/store: `hideCallouts()` hides; `loadExample` re-shows.
- AC4 → `store.test.ts`: `loadExample` then `addNode` → `exampleId === null`
  (already pinned) — extend to assert callout visibility derivation.

## Protocol / i18n / cloud impact

None / all callout prose ships en+pt (AC1 enforces) / no new tier-station.

## Risks

- Bubble overlap on dense presets — mitigated: max 4 per preset, anchored to
  spread-out nodes, max-width + line-clamp.
- Callout claims drifting from the model as future specs retune numbers — the
  texts state *mechanisms* (fan-out, quota sharing, cache misses), not pinned
  figures, except where the preset's `claims` test already pins the figure.
