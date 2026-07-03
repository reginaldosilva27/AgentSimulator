# Plan: Learn — Harness & Loop Engineering

> The HOW. Frontend Learn-content only. No backend, no protocol, no new `Stage`.

## Approach

Add a new `SectionSrc` to `SECTIONS_SRC` in `frontend/src/learn/content.ts` — id
`ai-engineering-disciplines` — holding three `TopicSrc` entries (`engineering-ladder`,
`harness-engineering`, `loop-engineering`), authored in the existing `{ en, pt }` `Tr` shape and
resolved by the existing `sectionsFor(lang)` / `allTopicsFor(lang)` builders. No new component: the
current `TopicDetail` renders what/why/how/options/links already.

The Harness and Loop topics are **grounded in the real app**: their `how`/`where` prose names the
actual stations (Tools/MCP, Vector DB/RAG, App Database as memory, the context-window budget,
Guardrails, the model) and the actual loop (`route → think ⇄ tools → generate → respond`,
`MAX_ITERATIONS`, `simulate_failure`). Where useful they set `cloudRef` to an existing station id so
the "Build on {cloud}" column (024) works for free.

Topic ids are the contract shared with `095` (the lens legend links to `harness-engineering` /
`loop-engineering`), so they are stable and asserted.

## Affected files

**Backend**
- None.

**Frontend**
- `frontend/src/learn/content.ts` — new `ai-engineering-disciplines` section + 3 topics (bilingual).
- `frontend/src/learn/content.test.ts` — extend parity/shape assertions to cover the new ids
  (AC1–AC6). (If a generic parity test already iterates all topics, most ACs are covered; add the
  id-existence + grounded-substring assertions.)

*(No `strings.ts` change expected — Learn prose lives in `content.ts` as `Tr`. If a section heading
needs a UI-chrome string, add it to `strings.ts` in en + pt.)*

## Protocol changes (constitution §1)

None. `schemas.py` ↔ `events.ts` untouched; no new `Stage`/`Phase`/`TraceEvent`.

## Data model changes

None.

## i18n strings (constitution §4)

All prose authored inline as `{ en, pt }` in `content.ts`. Representative (full copy written at
implement time; **both languages required** for every field):

| topic / field | en (gist) | pt (gist) |
|---|---|---|
| `engineering-ladder` title | The Engineering Ladder | A Escada da Engenharia |
| `engineering-ladder` what | Prompt → Context → Harness → Loop: the four rungs of LLM engineering. | Prompt → Context → Harness → Loop: os quatro degraus da engenharia de LLM. |
| `harness-engineering` title | Harness Engineering | Engenharia de Harness |
| `harness-engineering` what | Everything that isn't the model — "Agent = Model + Harness". | Tudo que não é o modelo — "Agent = Model + Harness". |
| `loop-engineering` title | Loop Engineering | Engenharia de Loop |
| `loop-engineering` what | The cycle: reason → act → observe, until a stop condition. | O ciclo: raciocina → age → observa, até uma condição de parada. |

Proper nouns (Anthropic, LangChain, ReAct, MCP, LangGraph) and URLs stay untranslated.

## Cloud map (constitution §5)

n/a — no new tier/station. Topics may reuse existing `cloudRef` ids; no new `clouds{}` to fill.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | the three topic ids exist in resolved Learn content | `content.test.ts` |
| AC2 | each topic has non-empty what/why/how/options in en **and** pt (parity) | `content.test.ts` |
| AC3 | harness topic text references tools/MCP, RAG, App DB memory, context budget, guardrails, model | `content.test.ts` |
| AC4 | loop topic text references the loop shape, `MAX_ITERATIONS`, `simulate_failure` | `content.test.ts` |
| AC5 | ladder topic lists the four rungs in order + names the two the sim shows | `content.test.ts` |
| AC6 | each topic has ≥1 link with valid `{label,url}` | `content.test.ts` |
| AC7 | no backend diff (manual gate); FE build + vitest green | CI |

## Risks / trade-offs

- Grounded-substring assertions (AC3/AC4) can be brittle if worded too tightly — assert on stable
  anchors (`MAX_ITERATIONS`, `simulate_failure`, station names) rather than whole sentences.
- Keep the new section additive and ordered sensibly in `SECTIONS_SRC` so it reads as a first-class
  track without displacing the architecture-first flow.
