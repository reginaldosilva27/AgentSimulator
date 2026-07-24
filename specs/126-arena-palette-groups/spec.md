# Spec: Arena — palette grouped by component type (+ search)

| | |
|---|---|
| **ID** | 126-arena-palette-groups |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The Arena palette is a single flat list. At 15 kinds it already reads as an
undifferentiated wall; with 125-arena-component-expansion it reaches 20. The
hands-on competitor review (System Design Playground, 2026-07-23) showed how much
a **grouped palette** helps: small-caps category headers turn the list into a
mental map of the architecture itself ("client things, edge things, data
things"), and the user explicitly liked this ("os deles são organizados por bloco
e tipo, isso é legal").

Grouping is not just tidier — it is *teaching surface*: the categories name the
tiers of an agent platform, so scanning the palette already communicates the
shape of the domain before a single node is dropped.

## Goals

- Palette rendered as **titled groups** in a fixed, story-telling order:
  client → edge → agentic core → data → scale/queues → external.
- Group titles are bilingual; every kind belongs to exactly one group.
- A **search field** filters components by label/description in the active
  language; non-matching groups disappear while searching.
- The grouping lives in the Arena's single-source component catalog, not in the
  rendering component.

## Non-goals

- No collapsible/accordion groups (fixed open; revisit if the palette doubles).
- No "start tutorial" button (the competitor has one; our onboarding-tour
  pattern (037) applied to the Arena would be its own spec).
- No changes to what the components *do* — pure presentation + one data
  structure; the model (`model.ts`) is untouched.
- No changes to the Simulator's Build popover or station palette.

## User-facing behavior

- The left rail shows groups with small-caps bilingual headers, in order:
  **Client / Cliente** · **Traffic & Edge / Tráfego & Edge** · **Agentic Core /
  Núcleo agêntico** · **Data / Dados** · **Scale & Queues / Escala & Filas** ·
  **External / Externo**.
- Each kind renders exactly once, inside its group, with the same card
  (label + description + drag/click-to-add) as today — 107 wiring behavior
  unchanged.
- Typing in the search box narrows the list to kinds whose label or description
  matches (case/accent-insensitive) in the current language; group headers with
  no matches are hidden; clearing restores all groups. An empty result shows a
  bilingual "no components match" line.
- If a group has no kinds (e.g. 126 ships before 125, leaving "External" empty),
  the group is omitted entirely — no empty headers.

## Acceptance criteria

1. **AC1 — grouped catalog is the single source** — The component catalog exports
   a grouped structure (ordered groups, each with a bilingual title and its
   kinds); every `ArenaKind` appears in **exactly one** group (pinned by test),
   and the flat palette order is derived from the groups (no second hand-kept
   list).
2. **AC2 — groups render** — The palette renders each non-empty group's title
   (in the active language) with its kinds beneath it, in the specified order;
   empty groups render nothing.
3. **AC3 — search filters** — Given the query "cache", only cache-like kinds
   (and their groups) remain; given a query matching nothing, the bilingual
   empty-state line renders; clearing the query restores the full palette.
   Matching is case- and accent-insensitive and runs over the active language's
   label + description.
4. **AC4 — add-to-canvas regression** — Clicking/dragging a kind from inside a
   group (including while a search filter is active) still adds the node with
   the 107 auto-wire behavior (selected→new) — pinned by an integration test.
5. **AC5 — bilingual** — Group titles, the search placeholder, and the
   empty-state line exist in `en` and `pt` (constitution §4).

## Protocol / stage impact

- New/changed `Stage`(s): **none** (frontend-presentation only).
- Mirror in `frontend/src/types/events.ts`: n/a
- Station it maps to in `stations.ts`: n/a

## Open questions (clarify before planning)

*(resolved 2026-07-23 with the user)*

- [x] Grouping scheme? → The six categories above (mirrors the competitor's
  block-and-type organization the user asked for, adapted to our agent-first
  catalog).
- [x] Search now or when the list grows? → Now — with 125 the palette hits 20
  items and the competitor validated the pattern.
- [x] Collapsible groups / tutorial button? → Deferred (non-goals).

## Out of scope / deferred

- Accordion/collapse per group; palette minimize.
- Arena onboarding tour (037 pattern) — own spec if wanted.
- Per-kind icons (the competitor uses text-only "+ Name" rows too).
