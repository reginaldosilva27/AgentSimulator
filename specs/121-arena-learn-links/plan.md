# Plan: Arena ↔ Learn links — every component teaches its own theory

> The HOW. Written after `spec.md` is `clarified`. Decisions here must respect every
> principle in `.specify/constitution.md`; if one must bend, amend the constitution
> first and note it.

## Approach

One new pure module, `arena/learnLinks.ts`, declares the single source of
truth: `KIND_TO_TOPICS: Partial<Record<ArenaKind, readonly string[]>>` (1–3
Learn topic ids per mapped kind). A test walks every referenced id through
`allTopicsFor("en")` so a dead link cannot ship (AC1) — the same validation
covers preset concept chips. The future challenges module imports this same
module.

Cross-page navigation: the `page` state lives in `App.tsx` (`useState`) and
the Learn selection lives inside `LearnPage` — neither is reachable from deep
Arena components. Rather than drilling callbacks through
`ArenaPage → ArenaCanvas → ScalePanel`, a tiny zustand store
(`lib/learnTarget.ts`, mirroring `useSelection`/`useCloud` patterns) carries
the intent: `requestTopic(id)` sets a pending topic; `App` subscribes and
flips `page` to `"learn"` when one appears; `LearnPage` consumes it as its
initial `selected`. The store is transient (not persisted). Arena state needs
no protection — the design already persists in localStorage and `ArenaPage`
re-mounts from the store (AC5); the transient node selection may clear
(clarified).

Mapping (validated by the AC1 test at implementation time):

| kind | topics |
|---|---|
| `llm` | `openai-provider`, `tokens`, `token-cost` |
| `vectorDb` | `vector-db`, `vector-search`, `embeddings` |
| `mcp` | `tool-calling` |
| `appDb` | `app-db`, `persistence` |
| `readReplica` | `app-db`, `stateless-scaling` |
| `backend` | `api-tier`, `stateless-scaling` |
| `client` | `client-tier` |
| `queue` | `event-driven` |
| `loadBalancer` | `ingress`, `stateless-scaling` |
| `apiGateway` | `ingress` |
| `aiGateway` | `llm-gateway` |
| `cache` | `in-memory` |
| `semanticCache` | `semantic-cache` |
| `cdn` | — (no Learn topic yet; unmapped, AC3) |

Concept chips: `ExampleDef` in `examples.ts` gains optional
`concepts?: readonly string[]` (topic ids); `ArenaPage` renders them as chips
next to the Examples dropdown while that preset is loaded (`exampleId` is
already transient state that structural edits clear — chips disappear with
it, honestly). Start with `regional-quota` and `multi-region` (quota story:
`token-cost`, `llm-gateway`, `stateless-scaling`-flavored picks), plus
`semantic-cache` on the cache preset if present.

## Affected files

**Backend** — none.

**Frontend**
- `frontend/src/arena/learnLinks.ts` — **new**: `KIND_TO_TOPICS` +
  `learnTopicsFor(kind)`.
- `frontend/src/lib/learnTarget.ts` — **new**: transient zustand store
  (`pendingTopic`, `requestTopic`, `consumeTopic`).
- `frontend/src/App.tsx` — subscribe to `pendingTopic` → `setPage("learn")`.
- `frontend/src/learn/LearnPage.tsx` — initialize/effect `selected` from
  `consumeTopic()`.
- `frontend/src/arena/ArenaCanvas.tsx` — `ScalePanel`'s ℹ️ explainer gains the
  "Learn more" row (topic titles via `allTopicsFor(lang)`, click →
  `requestTopic`).
- `frontend/src/arena/examples.ts` — `concepts` field on ≥2 presets.
- `frontend/src/arena/ArenaPage.tsx` — concept chips for the loaded preset.
- `frontend/src/i18n/strings.ts` — `t.arena.learnMore`, `t.arena.concepts`.

## Protocol changes (constitution §1)

None — no Stage/Phase/TraceEvent; `schemas.py` / `events.ts` untouched.

## Data model changes

None. Nothing persisted (learnTarget is transient; concepts live in code).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `t.arena.learnMore` | Learn more | Saiba mais |
| `t.arena.concepts` | Concepts in this example | Conceitos neste exemplo |

(Topic titles are already bilingual in `learn/content.ts` — resolved via
`allTopicsFor(lang)`, nothing new to author.)

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 (no dead links) | every id in `KIND_TO_TOPICS` + every preset `concepts` id resolves in `allTopicsFor("en")` | `frontend/src/arena/learnLinks.test.ts` |
| AC2 (mapped kinds render links) | minimum kind set is mapped; ScalePanel explainer shows titled links in en and pt | `learnLinks.test.ts` + `ScalePanel.test.tsx` |
| AC3 (unmapped stays clean) | `learnTopicsFor("cdn")` is empty; explainer renders no "Learn more" row | `learnLinks.test.ts` + `ScalePanel.test.tsx` |
| AC4 (navigate + select) | clicking a link from Arena renders the Learn page with that topic's detail open | `frontend/src/App.mobile.test.tsx` pattern → new `App`-level test (ResizeObserver polyfill per 041) |
| AC5 (Arena survives round-trip) | after link → Learn → back, nodes/edges/users match the pre-navigation design | same App-level test |
| AC6 (preset chips) | loaded preset renders its chips; click sets `pendingTopic` | `frontend/src/arena/ArenaPage.test.tsx` |
| AC7 (bilingual chrome) | new keys exist in both languages | `frontend/src/arena/i18n.test.ts` |

## Risks / trade-offs

- **Content-id coupling**: `learnLinks.ts` references Learn topic ids as plain
  strings; a Learn refactor renaming ids would silently orphan links — the
  AC1 test turns that into a loud failure, which is the point.
- **Transient-store navigation** adds a second writer to `page` (today only
  header buttons set it); the App subscription must consume the pending topic
  exactly once or a stale target could re-open Learn — pinned by the AC4/AC5
  test.
- `exampleId` clearing on structural edits means chips vanish once the user
  edits the preset — intended (the canvas no longer *is* the example), and
  already the dropdown's behavior since 102.
