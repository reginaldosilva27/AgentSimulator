# Spec: Arena ↔ Learn links — every component teaches its own theory

| | |
|---|---|
| **ID** | 121-arena-learn-links |
| **Status** | done |
| **Author** | Reginaldo Silva (+ Claude) |
| **Date** | 2026-07-23 |

## Problem / motivation

The app already has a full **Learn** page (sections → topics with what/why/how,
options and cloud mappings), and the Arena already has per-component ℹ️
explainers — but the two never meet. A user staring at a saturated LLM pool in
the Arena has no path to the Learn topics that explain tokens, providers or
cost; a user reading the Learn topic on vector search has no idea the Arena
lets them stress a Vector DB under load. Each surface pretends the other does
not exist.

Competing tools (System Design Playground, reviewed 2026-07-23) bind their
problem library to a learning library — the challenge names the concepts it
exercises, and each concept links to an article. The Arena should do the same
with the content we already have: the ℹ️ explainer is precisely where a
curious user is asking "tell me more", and the Learn page is precisely where
the longer answer already lives. This is also groundwork for the future
challenges module (each challenge will name the Learn topics it exercises,
reusing this same mapping).

## Goals

- Every Arena component whose concept is covered by an existing Learn topic
  offers **"learn more" links** from its ℹ️ explainer that open the Learn page
  with that topic selected.
- Example presets can name the **concepts they demonstrate** as tappable chips
  that deep-link into the same Learn topics.
- One **declared mapping** (component kind → Learn topic ids) is the single
  source of truth, testable, and reusable by the future challenges module.
- Navigation is two-way friendly: jumping to Learn never loses Arena work (the
  design already persists), and returning to the Arena resumes where the user
  left off.

## Non-goals

- No new Learn topics are authored in this spec — v1 links **existing topics
  only**; components without a matching topic (e.g. CDN) simply show no links.
  Writing the missing topics is its own content spec.
- No links from Learn back to specific Arena nodes (a "try it in the Arena"
  reverse link is deferred).
- No challenges module (the mapping is built to be reused by it, not to ship
  it).
- No URL routing / deep-linkable permalinks — page state stays in-memory as
  today.

## User-facing behavior

- The ℹ️ explainer of a mapped component (scale panel) gains a short **"Learn
  more" row** listing 1–3 topic links (topic titles in the active language);
  clicking one switches to the Learn page with that topic open in the detail
  panel.
- The Examples dropdown's loaded preset shows its **concept chips** (e.g. the
  regional-quota preset → "Tokens & cost", "Stateless scaling"); clicking a
  chip opens the same Learn topic.
- Switching back to the Arena (existing nav button) shows the canvas exactly as
  it was left.
- All new chrome ("Learn more" label, chip affordance) ships in **en + pt**
  (§4); topic titles are already bilingual in the Learn content.

## Acceptance criteria

1. **AC1 — mapping is total over existing topics.** Every Learn-topic id
   referenced by the component→topics mapping (and by preset concept chips)
   resolves to a real topic in the Learn content — no dead link can ship.
2. **AC2 — links render for mapped kinds.** Given a component kind with mapped
   topics (at minimum: LLM, Vector DB, MCP, App DB, Backend, Queue, Load
   balancer/API gateway, AI Gateway, Cache, Semantic cache), when its ℹ️
   explainer is open, then its "Learn more" links render with the topic titles
   in the active language.
3. **AC3 — unmapped kinds stay clean.** A component kind with no mapped topic
   renders its explainer with no "Learn more" row (no empty shell).
4. **AC4 — link navigates and selects.** Clicking a "Learn more" link switches
   the app to the Learn page **with that topic selected** (the topic detail is
   showing, not the unselected map).
5. **AC5 — Arena survives the round-trip.** After following a link to Learn and
   navigating back to the Arena, the canvas (nodes, edges, load, selection
   cleared or kept as today) matches the pre-navigation design.
6. **AC6 — preset concept chips.** At least two example presets declare concept
   chips; the loaded preset renders them, and clicking one opens the mapped
   Learn topic (same behavior as AC4).
7. **AC7 — bilingual chrome.** Every new UI string ships in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — frontend-only navigation + content
  mapping; no `TraceEvent`, no backend.
- Mirror in `frontend/src/types/events.ts`: n/a
- Station it maps to in `stations.ts`: none

## Open questions (clarify before planning)

- [x] Scope of surfaces — **both** (user, 2026-07-23): ℹ️ explainer links AND
  preset concept chips (AC6).
- [x] Minimum mapped set — **existing topics only** (user, 2026-07-23), and a
  content audit shows coverage is broader than feared: the Learn library
  already has `semantic-cache`, `llm-gateway`, `in-memory` (Redis) and
  `app-db` topics, so **only the CDN** lacks a topic and stays unmapped (AC3).
  No content authoring in this spec.
- [x] Round-trip selection — **clearing the Arena selection is acceptable**
  (simpler); AC5 pins the design/load surviving, not the transient selection.

## Out of scope / deferred

- Authoring missing Learn topics (caching / semantic caching / CDN / regional
  quotas as theory articles).
- "Try it in the Arena" reverse links from Learn topics.
- Challenge → Learn-topic mapping (the future challenges spec reuses the
  mapping introduced here).
- URL routing / shareable deep links.
