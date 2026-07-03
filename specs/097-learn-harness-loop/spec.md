# Spec: Learn — Harness & Loop Engineering

| | |
|---|---|
| **ID** | 097-learn-harness-loop |
| **Status** | draft → clarified → planned → in-progress → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-03 |

## Problem / motivation

The AI Agent Simulator is being repositioned as a **gateway to learn Harness Engineering and Loop
Engineering** — two disciplines that are where real agents are won or lost, yet are named nowhere in
the app. The in-canvas lens (`096-harness-loop-lens`) lets a learner *see* the two axes; this spec
gives them the **theory** to go with the practice, on the **Learn** page.

The field has converged on a canonical ladder — **prompt → context → harness → loop engineering** —
with widely-cited definitions (Anthropic, LangChain, Addy Osmani, decodingAI). The Learn page
already teaches this project's architecture study-grade (`learn/content.ts`, the 023 format:
what / why / how / options / links, bilingual). We add the missing conceptual spine so a visitor who
came to "learn about Harness & Loop Engineering" (the README hook) lands on real content grounded in
the simulator's own stations and loop.

This is **Option C** of the proposal; it complements the lens (Option A).

## Goals

- A Learn section (or topics within an existing section) covering:
  1. **The Engineering Ladder** — prompt → context → harness → loop, "you are here" pointing at the
     simulator.
  2. **Harness Engineering** — *Agent = Model + Harness*; the components (tools, knowledge, memory,
     context, permissions, model, orchestration) mapped to the **real stations** of this app.
  3. **Loop Engineering** — the ReAct cycle, stop conditions (`MAX_ITERATIONS`), failure exits &
     recovery, and "loopcraft" (stacking verification/event/hill-climbing loops), mapped to the
     **real loop** (`route → think ⇄ tools → generate → respond`) and `simulate_failure`.
- Each topic follows the existing `Topic` shape (what / why / how / options / optional links) and is
  **bilingual (en + pt)**.
- The Harness/Loop topics are **grounded in this codebase** — they name the actual stations and loop
  the learner just watched, not generic prose — reinforcing the "everything is real" ethos.
- Curated external references (Anthropic harness/context essays, LangChain loop engineering, etc.).

## Non-goals

- **No backend change, no protocol change, no new `Stage`.** Pure Learn content (`learn/content.ts`)
  plus the strings it needs.
- Not a rewrite of the existing Learn sections — additive.
- No new interactive widget on the Learn page beyond what the current `TopicDetail`/`LearnMap`
  already render (a static "ladder" diagram, if any, uses existing rendering primitives).

## User-facing behavior

- On the **Learn** page, the learner finds the three topics above (grouped under a clear heading such
  as "AI Engineering disciplines" / "Disciplinas de Engenharia de IA").
- Each topic reads study-grade: what it is, why it matters, how it works **in this simulator**, other
  options / trade-offs, and links to authoritative sources.
- The `095` lens legend's "Learn more" link lands here (shared topic ids — `095` AC8 depends on
  these ids existing).
- **Constitution §4:** every string ships **en + pt**. Proper nouns (Anthropic, LangChain, ReAct,
  MCP) and URLs stay untranslated per the i18n convention.

## Acceptance criteria

1. **AC1** — The Learn content includes three new topics with stable ids: `engineering-ladder`,
   `harness-engineering`, `loop-engineering` (ids are what `095` links to).
2. **AC2** — Each of the three topics provides non-empty `what`, `why`, `how`, `options` in **both**
   `en` and `pt`; the existing content parity test (`content.test.ts`) passes over them.
3. **AC3** — The **Harness** topic explicitly names the real harness pieces of this app (at least:
   tools/MCP, RAG/knowledge, the App Database as memory, the context-window budget, guardrails/
   permissions, the model) — asserted structurally (the `how`/`where` text references these).
4. **AC4** — The **Loop** topic explicitly names the real loop of this app
   (`route → think ⇄ tools → generate → respond`), the stop condition (`MAX_ITERATIONS`), and the
   failure/recovery path (`simulate_failure`) — asserted structurally.
5. **AC5** — The **Ladder** topic presents the four rungs prompt → context → harness → loop in order
   and states which two this simulator makes visible.
6. **AC6** — Each topic carries at least one curated external `link` with a valid `{label, url}`
   shape; a test asserts the shape.
7. **AC7** — No `Stage`/protocol/backend change: the diff touches only Learn content + i18n strings
   (+ their tests). The backend gate stays green with zero backend diff.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** — Learn content only. (Topics may *reference* existing
  station ids via the existing `cloudRef`/`where` mechanisms, but add no station.)

## Open questions (clarify before planning)

- [ ] New Learn **section** ("AI Engineering disciplines") vs. three topics appended to an existing
  section? *Proposed default: a new dedicated section so it reads as a first-class learning track.*
- [ ] Include a small static **ladder diagram** (prompt→context→harness→loop) or keep it prose + the
  existing map? *Proposed default: prose first; a diagram can be a fast-follow.*

## Out of scope / deferred

- A guided, interactive "ladder" walkthrough tying each rung to a live run — future spec.
- Deep sub-topics per loop type (reflection, multi-agent, event-driven) beyond a paragraph each —
  can grow later as those loops become real behavior in the app.
