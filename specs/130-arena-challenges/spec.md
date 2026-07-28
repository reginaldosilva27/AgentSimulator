# Spec: Arena — challenge library

| | |
|---|---|
| **ID** | 130-arena-challenges |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-27 |

> Second of five specs building the **Challenges module** (129 → 133). Depends on
> **129** (the SLO engine) for every verdict. This is the spec that finally delivers the
> thing deferred since **spec 100**: *"a challenge library with scale targets"*.

## Problem / motivation

The Arena is a free sandbox. That is the right *second* experience and the wrong *first*
one: a blank canvas with 21 component kinds and four scaling knobs does not tell a newcomer
what a good answer looks like, or even what question is being asked. The example presets
(101/119/122) partly cover this — but an example is something you *read*, and architecture
is learned by being **stuck and then unstuck**.

A challenge inverts the loop. Instead of "here is a working fleet, notice the mechanism",
it says: **"16,000 users, one message every 20 seconds, no dropped requests, under
$1,500/hour. Go."** The user then discovers, by being wrong, that one LLM deployment is a
quota block, that scaling the vector DB changes nothing, and that provisioned headroom
bills even when idle. Those are exactly the lessons the model already encodes; the
challenge is only the *framing* that makes the user go looking for them.

Two things make this honest rather than a quiz-with-vibes:

- **The verdict is arithmetic.** 129 already derived the axes from the real capacity model.
  A challenge declares numbers, not opinions.
- **The givens are locked.** If the user can drag the users slider down, "meet the SLO" is
  trivially satisfiable and teaches nothing. The load story, the payload shape and the
  objectives belong to the *problem*, not to the player.

The comparison point (System Design Playground) is a library of interview problems whose
designs are judged qualitatively, with a 3% pass rate published on their own site. We can do
the harder and more useful version: problems whose pass condition is **computed**.

## Goals

- A **challenge library** — at least six challenges spanning easy / medium / hard, each with
  a bilingual **brief** (the ask, in an architect's words) and declared **objectives** (129
  targets).
- **Locked givens** per challenge: concurrent users, think time and payload/call shape are
  fixed by the problem and read-only while the challenge is active, with the lock explained
  rather than merely enforced.
- An optional **starting design** per challenge — usually a *deliberately broken* one (the
  under-provisioned single deployment, the fleet wired without a gateway) so the user starts
  by diagnosing, not by staring at a blank canvas.
- A **live objective checklist** (129's panel) plus a **verdict**: passed the moment every
  objective is met; nothing is submitted, nothing is graded server-side.
- Every challenge ships a **reference solution** — a design the model *verifies* satisfies
  the objectives, **with at least 20% slack** on each. This is a **correctness guarantee**, not
  just a hint: an unsatisfiable *or knife-edge* challenge is a bug, and the shipped tests must
  catch it (the 116 gotcha, where a 3 s latency target and a 1.5k quota made a pair of specs'
  presets unsatisfiable, is exactly this failure mode).
- Entering / leaving a challenge **never destroys the user's sandbox design**.
- Concept chips deep-linking the challenge's ideas into **Learn** (reuse 121's mechanism).
- Every new string ships **en + pt** (constitution §4).

## Non-goals

- **No attempt history, no progress badges, no best score** — that is 132.
- **No chaos / resilience challenges** — needs 131's faults; the challenge shape here must
  be *forward-compatible* with them but ships none.
- **No AI judge, no qualitative critique, no debate** — that is 133. The verdict here is the
  arithmetic from 129 and nothing else.
- **No new SLO metric.** If a challenge needs an axis 129 does not have, that is a 129
  amendment, not a challenge.
- **No backend, no new `Stage`/`TraceEvent`, no DB table, no protocol change.**
- **No change to the Simulator page**, the Build popover or `classify`.
- No timer / countdown, no leaderboard, no accounts.
- Not an interview-prep product: these teach the *agent-platform* capacity story
  specifically (LLM quota, agent fan-out, retrieval cost, semantic caching), not generic
  system-design trivia.

## User-facing behavior

- The Arena control bar gains a **Challenges** picker (pt: **Desafios**) beside the existing
  **Examples** one, listing each challenge with its **difficulty** badge.
- Selecting a challenge switches the Arena into **challenge mode**:
  - the **brief** appears in a panel — the ask, the load story in words, the objectives;
  - the challenge's **starting design** loads onto the canvas;
  - the **givens are locked**: the users, think-time and payload controls render read-only
    with a lock affordance and a one-line explanation ("the problem sets the load — your job
    is the architecture");
  - the **objectives checklist** (129) shows live ✓/✗ per axis, with 129's culprit + hint on
    each failed row;
  - a **verdict** line reads *"Not yet — 2 of 3 objectives met"* / *"Solved"*.
- The palette may be **restricted** for a challenge (only certain component kinds), stated
  plainly in the brief rather than silently.
- **Concept chips** link the challenge's ideas to Learn topics.
- A **"Show reference solution"** action reveals the shipped reference design.
- **Exit challenge** returns to the sandbox with the user's own design and load story intact.
- Challenge mode survives a reload (you come back to where you were).

## Acceptance criteria

1. **AC1 — the library** — At least **six** challenges exist, each with a unique id, a
   `difficulty` of easy | medium | hard, a bilingual title and brief, locked givens (users,
   think time, call shape) and at least one 129 objective; a test walks every entry and
   asserts the shape and that both languages are non-empty.
2. **AC2 — every challenge is solvable** — For **every** challenge, evaluating its shipped
   **reference solution** under its own locked givens yields an overall verdict of *met*
   (all objectives satisfied). A test walks the whole library — this is the guarantee that
   no unsatisfiable challenge ships.
3. **AC3 — every challenge is actually a challenge** — For every challenge with a starting
   design, evaluating that starting design under the same givens **fails at least one**
   objective (otherwise it is solved on arrival). A test walks the whole library.
4. **AC4 — entering applies the problem** — Selecting a challenge sets the store's users,
   think time and call shape to the challenge's givens and replaces the canvas with its
   starting design.
5. **AC5 — the sandbox is preserved** — Given a sandbox design D with load story L, entering
   a challenge and then exiting restores exactly D and L (nodes, edges, per-node scaling,
   users, think time, call shape).
6. **AC6 — givens are locked** — While a challenge is active, attempts to change users,
   think time or call shape (through the store's own actions) leave the values at the
   challenge's givens, and the controls render in a read-only state.
7. **AC7 — live verdict** — With a challenge active, the checklist renders one row per
   objective with its ✓/✗; applying the scaling change that clears the bottleneck flips the
   verdict to solved **without a reload**.
8. **AC8 — restricted palette** — For a challenge that declares allowed component kinds, the
   palette offers exactly those kinds; a challenge that declares none offers the full
   palette.
9. **AC9 — reference solution reveal** — The reference solution can be loaded onto the
   canvas on request, and the challenge remains active (the givens stay locked) after it is.
10. **AC10 — concept chips** — Every Learn topic id referenced by a challenge resolves to a
    real topic (a test walks them, as 121 does for the presets).
11. **AC11 — challenge mode persists** — The active challenge id survives a reload; a
    persisted blob naming an unknown challenge falls back to sandbox mode without throwing.
12. **AC12 — no regression** — With no challenge active, the Arena behaves exactly as it does
    today (per-node metrics, header readouts, examples, presets all unchanged), and
    `computeMetrics` is untouched.
13. **AC13 — bilingual** — Every string introduced here resolves in both `en` and `pt`.
14. **AC14 — cost is never a lone axis** — A library-walking test asserts that **no** challenge
    declares a cost objective without also declaring latency or headroom. (Structural guard
    against the inversion 129 measured: a starved design is the cheapest one.)
15. **AC15 — a meaningful margin** — For every challenge, the **reference** solution meets each
    of its objectives with **at least 20% slack**, and the **starting** design misses at least
    one objective by **at least 20%**. Knife-edge challenges — where a small recalibration
    would invert the verdict — fail this test at authoring time.
16. **AC16 — the brief explains the latency floor** — Every challenge carrying a latency
    objective states in its brief, in both languages, why an agent turn costs seconds (fan-out ×
    output tokens × decode), so the honest figure is not read as a defect.
17. **AC17 — nudges re-fire inside a challenge** — Entering a challenge clears 115's dismissed
    nudges; exiting restores the sandbox's dismissals along with the rest of the stash.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — no `TraceEvent`s (constitution §3; the Arena is a model,
  and a challenge is a framing *of* that model).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none**.

## Clarify — resolved (2026-07-27)

129's measured baseline (see that spec) reshaped this one before a line was written: **the
shed axis is nearly vacuous under the closed loop**, so a challenge cannot be built on "no
dropped requests", and **cost alone rewards under-provisioning**.

- **Challenge 1 is a latency challenge, not a shed challenge.** *"16k users, answer in under
  30 s"* — the starting design delivers ~225 s. The lesson is unchanged (one deployment is a
  quota block; scaling the vector DB changes nothing); only the axis that measures it changes.
- **Cost may never be a challenge's only quantitative axis.** A cost objective must be paired
  with latency or headroom, so that under-provisioning breaks the pair. This is **structural,
  not a convention**: a library-walking test fails if any challenge carries cost alone (AC14).
- **The briefs explain the ~15 s floor.** A good design lands at 13–20 s because an agent turn
  is fan-out × ~500 output tokens × 8 ms/token decode (127's calibration). Briefs say so, so
  the honest number reads as the lesson rather than as a bug: *"an agent turn is not a database
  query — your target is 30 s, not 300 ms."*
- **Targets are pinned in the brief and policed by the reference test.** Legible numbers
  ("≤ 30 s", "≤ $20,000/h"); AC2 proves the reference meets them. A future recalibration
  becomes a red test that someone re-tunes — never a weakened test.
- **A minimum margin is required** (new AC15). AC2/AC3 prove *that* the reference passes and
  the start fails, not that either does so comfortably. Measurement found challenge 4 sitting
  on a knife edge: `regional-quota` reaches 19.6 s and `multi-region` 14.8 s, so **both pass a
  30 s target**, and discriminating them would need ≤ 17 s — a 2.5 s margin a single
  recalibration could invert. The margin AC forces the demand up until the quota genuinely
  bites, at authoring time.
- **Revealing the reference is free in v1**; 132 will mark such an attempt `assisted` in the
  history without excluding it from *solved*.
- **The brief lives in the tabbed bottom-right surface** (Objectives · Brief · Notes) — decided
  together with 129's placement.
- **Entering a challenge un-dismisses 115's nudges**, and exiting restores the sandbox's
  dismissals (the stash already carries them). The fan-out nudge *is* the lesson of challenge 5.

**A gap that measurement closed, so it is not an axis:** a "service rate" objective (equilibrium
÷ demanded rate) was considered — `simple-rag` serves only 9% of its demanded rate, which is
more alarming than any other figure. It is **mathematically redundant** with latency: since
`rps = users / (think + e2e)` and a challenge pins `users` and `think`, rate is a strictly
decreasing function of latency, so constraining one constrains the other exactly. The latency
axis already means "am I serving the rate my users want". No fifth axis.

### The challenge set (confirmed)

| # | difficulty | challenge | objectives | teaches |
|---|---|---|---|---|
| 1 | easy | **The agent's wall** — 16k users @ 1 msg/20 s | e2e ≤ 30 s | one deployment is a quota block; the vector DB is not the problem |
| 2 | easy | **Answer faster** — latency at a modest load | e2e ≤ target | decode dominates; tier + output tokens are latency knobs |
| 3 | medium | **Halve the bill** | e2e **and** cost | provisioned vs usage; semantic cache; the pairing rule |
| 4 | medium | **One region is not enough** — demand tuned until the quota bites | e2e (+ headroom) | the regional ceiling; the cross-region latency price |
| 5 | medium | **The invisible tax** — backend wired to N deployments directly | e2e or headroom | 105's routing tax; a gateway *returns* capacity |
| 6 | hard | **100k users on a budget** | e2e + headroom + cost | everything at once |

Exact numbers are tuned at implementation time under AC2/AC3/AC15 — the walking tests are the
authority, and challenge 4's demand in particular must rise until the margin AC is satisfied.

## Out of scope / deferred

- Resilience challenges ("survive a region outage") — 131.
- Attempt history, pass badges, "3 of 6 solved" — 132.
- AI judge / design critique — 133.
- User-authored challenges, sharing, permalinks.
- Difficulty-aware ordering / unlocking (a progression tree).
