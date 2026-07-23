# Plan: Arena — example scenarios + default sample

> HOW. Frontend-only; extends spec 100 (`frontend/src/arena/`).

## Approach

Add a **data-driven preset library** and wire it into the existing Arena store + page.
No model change. A preset is a pure factory returning an `ArenaDesign` plus positions
+ offered load, with bilingual metadata. The default sample is just the first preset,
loaded automatically only when nothing is persisted yet.

## Affected files

**Frontend**
- `frontend/src/arena/examples.ts` — **new**: the preset catalog. Each entry:
  `{ id, title: {en,pt}, description: {en,pt}, build(): { nodes: ArenaNode[]; edges: ArenaEdge[]; offeredLoad: number } }`.
  Node ids are literal + stable per preset (no counter needed). `DEFAULT_EXAMPLE_ID`
  points at the "simple RAG agent" sample. Four presets:
  1. `simple-rag` — Client→Backend→LLM, Backend→Vector DB. Load ~300 rps → LLM critical.
  2. `scale-llm` — Client→LB→Backend, Backend→LLM(replicas ×8), Backend→Vector DB.
     Same load → LLM no longer critical (teaches horizontal scaling).
  3. `rag-cache` — Client→CDN→Backend, Backend→Cache→Vector DB, Backend→LLM. Cache offloads reads.
  4. `prod-100k` — Client→API GW→LB→Backend(×N)→LLM(×N), + Cache + Vector DB. The full shape.
- `frontend/src/arena/store.ts` — **edit**: `loadArena()` returns the default sample
  when the localStorage key is **absent** (first visit); a present-but-empty blob is
  respected. Add a `loadDesign(design)` action (set nodes/edges/offeredLoad + persist).
- `frontend/src/arena/ArenaPage.tsx` — **edit**: an **Examples** menu/dropdown in the
  control bar; selecting an entry calls `loadDesign(build())`. Shows each description.
- `frontend/src/arena/examples.test.ts` — **new**: AC3/AC5 (library shape + the
  simple-vs-scaled model claim via `computeMetrics`) + AC6 bilingual.
- `frontend/src/arena/store.test.ts` — **edit**: AC1/AC2 (fresh → sample; present → kept)
  + AC4 (loadDesign persists).
- `frontend/src/i18n/strings.ts` — **edit**: `arena.examples` label (menu) in en + pt.
  (Preset titles/descriptions live localized in `examples.ts`, like `KIND_META`.)

## Protocol changes (constitution §1)

None. No `Stage`/`TraceEvent`; `schemas.py` ↔ `events.ts` untouched.

## Data model changes

None (localStorage only, existing `agentsim.arena` key).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.examples` | Examples | Exemplos |
| `examples.ts` per-preset `title`/`description` | (en) | (pt) |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 fresh → sample | store init with empty localStorage → non-empty default | `arena/store.test.ts` |
| AC2 returning kept | present (even empty) blob respected | `arena/store.test.ts` |
| AC3 library shape | ≥3 presets, each valid design + bilingual meta | `arena/examples.test.ts` |
| AC4 loadDesign persists | load → state + localStorage round-trip | `arena/store.test.ts` |
| AC5 lesson via model | simple → LLM critical; scaled → not | `arena/examples.test.ts` |
| AC6 bilingual | titles/descriptions + menu label en+pt | `arena/examples.test.ts` |

## Risks / trade-offs

- Loading a preset replaces the canvas without a warning — acceptable for a sandbox
  with a Reset button; documented in the spec's clarifications.
- `loadArena()` behavior change (empty→sample on first visit) must not break spec 100's
  AC9 tests, which set state directly / use a present key — verified in the test edits.
- The latency-unit bug (`80kms`) is a **separate bug fix** (its own regression test in
  `arena/format.test.ts`), not part of this feature's ACs.
