# Plan: Arena — per-node region

> HOW. Frontend-only; extends specs 100–105.

## Approach

Region is a per-node annotation: a curated code list in `components.ts`, an
optional field on `ArenaNode` (store-persisted with the node), a select in the
scale panel, and a badge on the node box. No model change.

## Affected files

- `arena/components.ts` — `ARENA_REGIONS` (6 generic codes: `us-east`, `us-west`,
  `eu-west`, `eu-north`, `sa-east`, `ap-south`; proper-noun-like, untranslated).
- `arena/store.ts` — `ArenaNode.region?: string`; `setRegion(id, region|null)`
  via `saveStruct` (clears `exampleId`).
- `arena/ArenaCanvas.tsx` — pass `region` into node data; ScalePanel region select
  (non-client kinds) with hint.
- `arena/ArenaNode.tsx` — region badge (📍-style chip) when set.
- `arena/examples.ts` — `prod` pools → `us-east`/`eu-west`; `llm-fleet` pools →
  `us-east`/`us-west`/`eu-west`/`sa-east`.
- `i18n/strings.ts` — `arena.region`, `arena.regionHint`, `arena.regionNone` en+pt.
- Tests: `store.test.ts` (AC1), `ScalePanel.test.tsx` (AC2),
  `ArenaCanvas.integration.test.tsx` (AC3 badge), `examples.test.ts` (AC4);
  AC5 rides the existing leafKeys parity test.

## Protocol / data model changes

None (localStorage node blob gains an optional field; old blobs load unchanged).

## i18n strings (constitution §4)

| key | en | pt |
|---|---|---|
| `arena.region` | Region | Região |
| `arena.regionHint` | Pools in different regions survive a region outage, cut latency near users and meet data residency — challenges will score this | Pools em regiões diferentes sobrevivem à queda de uma região, reduzem latência perto dos usuários e atendem residência de dados — os desafios vão pontuar isso |
| `arena.regionNone` | No region | Sem região |

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 | setRegion persists + clears exampleId | `store.test.ts` |
| AC2 | select renders + updates node | `ScalePanel.test.tsx` |
| AC3 | badge appears on the canvas node | `ArenaCanvas.integration.test.tsx` |
| AC4 | prod 2 distinct / fleet 4 distinct regions | `examples.test.ts` |
| AC5 | leafKeys parity (existing) | `arena/i18n.test.ts` |

## Risks / trade-offs

- Region codes untranslated (proper-noun convention, like cloud names).
- Annotation-only in v1 — stated in the hint so nobody expects latency changes.
