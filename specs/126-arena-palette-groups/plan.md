# Plan: Arena — palette grouped by component type (+ search)

> Presentation-layer change + one catalog data structure. Model untouched.

## Approach

Add `PALETTE_GROUPS` to the Arena's single-source catalog (`components.ts`):

```ts
interface PaletteGroup {
  id: "client" | "edge" | "agenticCore" | "data" | "scaleQueues" | "external";
  title: Record<Lang, string>;
  kinds: ArenaKind[];
}
export const PALETTE_GROUPS: readonly PaletteGroup[] = [ … ];
```

`PALETTE_ORDER` becomes **derived** (`PALETTE_GROUPS.flatMap(g => g.kinds)`) so
every existing consumer keeps working and there is no second hand-kept list
(AC1). Exactly-once membership is pinned by a test comparing the flattened
groups against the `ArenaKind` union (via `Object.keys(BENCHMARKS)`).

Group assignment (after 125; before 125, the missing kinds simply aren't there
and `external` renders empty → omitted):

| group | kinds |
|---|---|
| client | client |
| edge | cdn, loadBalancer, apiGateway |
| agenticCore | backend, agentHarness, llm, aiGateway, guardrails, mcp |
| data | appDb, vectorDb, readReplica, memoryStore, objectStore |
| scaleQueues | cache, semanticCache, queue, worker |
| external | externalApi |

(`aiGateway`/`guardrails` sit in the agentic core, not edge — they exist because
of the model path; `worker` sits with the queue it drains.)

**Search** — a pure, exported helper (jsdom-friendly, the 120/122 pattern):

```ts
export function filterPalette(groups, query, lang): PaletteGroup[]
```

normalizes case + accents (`String.normalize("NFD")` + strip combining marks),
matches against `label[lang]` + `description[lang]`, drops empty groups.
`Palette.tsx` holds only local `useState` for the query and maps the filtered
groups; card rendering and the add/drag handlers are reused untouched (AC4).

## Affected files

**Frontend** (Arena only)
- `frontend/src/arena/components.ts` — `PaletteGroup`, `PALETTE_GROUPS`,
  derived `PALETTE_ORDER`, `filterPalette`.
- `frontend/src/arena/Palette.tsx` — group headers + search input + empty state;
  reuses the existing item card.
- `frontend/src/arena/i18n.ts` — `searchPlaceholder`, `searchEmpty` strings.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| group client | Client | Cliente |
| group edge | Traffic & Edge | Tráfego & Edge |
| group agenticCore | Agentic Core | Núcleo agêntico |
| group data | Data | Dados |
| group scaleQueues | Scale & Queues | Escala & Filas |
| group external | External | Externo |
| arena.searchPlaceholder | Search components… | Buscar componentes… |
| arena.searchEmpty | No components match | Nenhum componente encontrado |

## Cloud map (constitution §5)

n/a — no new tier/station/kind.

## Test strategy (constitution §9 — TDD)

Vitest, `frontend/src/arena/`:

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | flattened `PALETTE_GROUPS` === kinds of `BENCHMARKS` exactly once; `PALETTE_ORDER` derived (same array contents) | `components.test.ts` |
| AC2 | render `Palette`, assert group titles in order (en, then pt via language store); empty group absent (construct filtered case) | new `Palette.test.tsx` |
| AC3 | `filterPalette` unit tests: "cache" → cache+semanticCache group(s); accent-insensitive ("memoria" matches "Memória"); no-match → `[]`; component test asserts empty-state line + restore on clear | `components.test.ts` + `Palette.test.tsx` |
| AC4 | existing add/auto-wire integration (`ArenaCanvas.integration.test.tsx`) extended: add from within a group while a query is active → node added + auto-wired | `ArenaCanvas.integration.test.tsx` |
| AC5 | i18n loop test over the new strings (en+pt non-empty) | `i18n.test.ts` |

## Risks / trade-offs

- **Ordering dependency with 125**: groups reference 125's kinds. Implement 125
  first (user-chosen order). If flipped, the group table simply lists only
  existing kinds — AC1's exactly-once test keeps both specs honest at merge.
- React Flow a11y gotcha (117/119): interact via roles/titles that exist in
  jsdom; the pure `filterPalette` keeps the logic testable without DOM.
- Search normalization must not touch proper nouns/codes — matching is
  display-text only; kind ids are never user-visible search targets.
