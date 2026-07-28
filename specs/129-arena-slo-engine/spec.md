# Spec: Arena — SLO engine + live verdict

| | |
|---|---|
| **ID** | 129-arena-slo-engine |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-27 |

> First of five specs that build the **Challenges module** (129 → 133). This one is the
> foundation: the *measuring stick*. It ships standalone value (a sandbox SLO panel) and
> is the layer 130 (challenge library), 131 (chaos) and 132 (attempts) all score against.

## Problem / motivation

The Arena models an architecture under load honestly — QPS, utilization, latency, shed
rate, cost — but it never says **whether the design is good enough**. The user reads four
numbers and has to hold the judgement in their head. That is the missing half of the
teaching loop: an architect is never asked "what is the utilization?", they are asked
"does this meet the SLO, inside the budget?"

Every ingredient for that verdict already exists in the pure model: `shedRps` per node
(108), `endToEndLatencyMs` at the closed-loop equilibrium (109/110), `llmCost`'s
provisioned + usage split (111), and per-node `utilization`. What is missing is a **named,
declared target** to compare them against, and a place that says **met / not met** while
the user edits.

This also closes the gap the competitor analysis flagged: their live panel shows the
problem's SLOs with met/✗ *plus a contextual remediation hint* ("Scale App Server
horizontally — it's the tier limit, not the data tier"). We have the better simulation and
no verdict; they have the weaker simulation and the verdict. This spec fixes our side.

Above all it is the **scoring contract** the Challenges module needs. Deciding the axes
here, once, as a pure and separately-tested layer, means 130 only has to declare
*numbers*, and 133's AI judge can be fed a verdict it is forbidden to overturn.

## Measured baseline (established during clarify)

Before fixing any target, the four candidate axes were **measured** against the shipped
default design and all ten presets. The result overturned three assumptions this spec was
originally drafted with, and is recorded here because 130's challenge set depends on it:

| design | demand | equilibrium | shed | e2e | cost/h | headroom |
|---|---|---|---|---|---|---|
| `simple-rag` (the "broken" one) | 800 | 72 | **0** | **225 s** | **$1,129** | 4% |
| `llm-fleet` (the "good" one) | 1,667 | 1,262 | **0** | 19.2 s | $24,138 | 47% |
| `guardrails-async` (best latency) | 200 | 123 | **0** | 12.6 s | $3,217 | 69% |
| `simple-rag` ×5 load | 4,000 | 87 | 24 | 900 s | $1,164 | −16% |
| `llm-fleet` ×20 load | 33,333 | 2,372 | **0** | **772 s** | $36,925 | 1% |

1. **The shed axis is nearly vacuous.** No preset drops anything. The closed loop (110)
   converts overload into **latency**, not into 429s — a user waiting on a response is not
   sending the next message. Shed appears only once latency hits its ceiling (~900 s, the
   `0.99` clamp ⇒ 100× base) **and** demand still exceeds capacity, which takes ~5× the
   shipped load. A design can sit at `shed = 0` and be unusable (`llm-fleet` ×20: 772 s,
   99% utilization, zero drops). Shed is the **last** signal to fire, not the first — the
   same finding 127 recorded.
2. **Cost, alone, rewards under-provisioning.** The broken design is the **cheapest**
   ($1,129/h) precisely because it is starved; the good ones cost $18k–24k/h. A tight cost
   cap would *pass* the broken design and *fail* every good one. Cost only teaches something
   when **paired** with a latency or headroom requirement.
3. **Headroom is the cleanest discriminator** — 4% on the broken design vs 47–69% on the good
   ones — and it carries none of cost's inversion. It was drafted as the "most arguable, maybe
   defer" axis; the measurement says the opposite, so it ships.

Latency and headroom are therefore the **primary** axes, shed is the honest extreme-regime
backstop, and cost is off by default.

## Goals

- A named set of **objective metrics** derived from the existing model — **latency** and
  **headroom** as the primary pair, **shed** as the extreme-regime backstop, and **cost** as
  an axis a challenge opts into.
- A **pure evaluation function**: given a design, a load story and a set of targets, return
  one result per objective — target, actual, met/not-met — with no randomness and no time.
- An **overall verdict** (all enabled objectives met) derived from those results.
- For every failed objective, the **culprit**: which box in the design is responsible, plus
  a bilingual, kind-aware **remediation hint** ("the LLM tier is the limit — add
  deployments or spread regions, scaling the vector DB changes nothing").
- A **live SLO panel** on the Arena page that renders the checklist and re-evaluates on
  every edit, scale change or load change — same instant recompute as the node metrics.
- In the free sandbox the user **edits the targets** (and can disable an axis); the targets
  persist with the design.
- Zero change to the existing model's behaviour: with the panel ignored, every current
  readout is byte-for-byte what it is today.
- Every new string ships **en + pt** (constitution §4).

## Non-goals

- **No challenge library, no briefs, no locked givens, no pass/fail progression** — that is
  130. Here the targets are the user's own, freely editable.
- **No AI judge / qualitative critique** — that is 133. This verdict is arithmetic only.
- **No chaos / failure injection** — that is 131.
- **No attempt history** — that is 132.
- **No new `Stage`, `TraceEvent`, backend endpoint, DB table or protocol change.** Like the
  rest of the Arena this is frontend-only pure computation (constitution §3).
- **No change to `computeMetrics`' signature or numbers**, and no change to the Simulator
  page.
- **No invented availability percentage.** We report the *shed rate* the model actually
  derives; turning shed calls into a request-level availability figure would require
  per-turn call outcomes the model does not track (see Out of scope).
- No percentile latency (p95/p99). The model produces one deterministic latency per load
  point; presenting it as a percentile would be fiction.

## User-facing behavior

- The Arena gains an **"Objectives" (pt: "Metas") panel**. It lists one row per objective:
  the metric's name, its target, the **actual** value from the live model, and a **✓ / ✗**.
- A single **verdict line** summarises: *"3 of 4 objectives met"* / *"All objectives met"*.
- Each **failed** row expands (or shows inline) **why**: the responsible box by name, and a
  one-sentence remediation hint written for that box's kind.
- The four objectives, all with a fixed comparison direction so no nonsensical target can
  be composed:
  | metric | direction | meaning |
  |---|---|---|
  | Dropped requests (`shedRps`) | ≤ | calls/s refused past capacity — the honest 429 rate |
  | End-to-end latency (`e2eLatencyMs`) | ≤ | one agent turn at the closed-loop equilibrium |
  | Cost per hour (`costPerHourUsd`) | ≤ | provisioned + usage LLM bill (111) |
  | Headroom (`headroomPct`) | ≥ | 1 − the busiest node's utilization: room for a burst |
- **Defaults** (decided in clarify, from the measured baseline): **e2e ≤ 30 s**, **headroom ≥
  20%**, **shed ≤ 0** tracked; **cost off**. The broken default design fails two of the three;
  the `llm-fleet` preset passes all three. Cost stays off in the sandbox so a first-contact
  user is never taught that "cheaper is better" — a challenge turns it on *paired* with
  latency.
- Each target is **editable** in the sandbox, and each objective can be **switched off**
  (an off objective is excluded from the verdict and greyed). Cost is switched **on** the same
  way, from the same control.
- The panel lives in a **tabbed surface at the bottom-right** — the panel area 122 already
  introduced — sharing it with 130's brief and the example notes, so the canvas keeps its full
  width (124's auto-arrange just optimised for that width).
- **Hovering a failed row highlights the culprit box** on the canvas, reusing 122's
  `data-highlighted` mechanism — the number and the box are the same lesson.
- Past the model's latency ceiling the row reads **"≥ 900 s"** with a note that this is the
  model's limit, and points at the shed row for the rest of the story — the same refusal to
  print a fictional post-saturation figure that 108 established for the header.
- The panel carries the same honesty framing as the rest of the Arena: these are targets
  checked against an **analytical model**, not measurements.
- Targets survive a reload along with the design.

## Acceptance criteria

1. **AC1 — pure evaluation** — Given a design, a load story and a set of targets,
   evaluation returns exactly one result per **enabled** objective, each carrying
   `{metric, target, actual, met}`; calling it twice with the same inputs returns identical
   results (deterministic — no randomness, no clock).
2. **AC2 — dropped-requests objective, in the regime where it actually fires** — Under the
   closed loop, an over-loaded design does **not** shed until latency reaches its ceiling, so
   this AC pins both halves of that truth: (a) the shipped default design, though badly
   over-loaded, reports `shedRps = 0` and **meets** a `≤ 0` target — the axis is honest, not
   broken; (b) a design pushed into the extreme regime (≈5× that load) reports a non-zero
   `actual` equal to the model's total shed rate and **fails**. A test asserts both, so the
   nearly-vacuous nature of this axis is documented in the suite rather than discovered again.
3. **AC3 — latency objective, the primary discriminator** — The `e2eLatencyMs` objective's
   `actual` equals `endToEndLatencyMs` evaluated at the **closed-loop equilibrium** rate (not
   the open-loop demand). Against the default target it is **not met** for the shipped default
   design (~225 s) and **met** for the `llm-fleet` preset (~19 s) — i.e. the axis separates the
   broken design from the good one, which shed does not.
4. **AC4 — cost objective, and its inversion** — The `costPerHourUsd` objective's `actual`
   equals `provisionedPerHour + usagePerHour` from `llmCost`; adding an idle deployment raises
   it (provisioned capacity is never free) and can break a previously-met objective.
   Additionally, a test pins the **inversion** that justifies cost being off by default: the
   starved default design costs *less* than the healthy `llm-fleet` preset. This is the
   guard against a future edit "helpfully" turning cost on in the sandbox.
5. **AC5 — headroom objective, the cleanest discriminator** — The `headroomPct` objective
   compares `1 − max utilization` across load-carrying nodes against a `≥` target; the shipped
   default design (~4% headroom) fails the 20% default and the `llm-fleet` preset (~47%)
   passes, and a saturated node's design passes after horizontal scaling.
6. **AC6 — culprit identification** — Every **failed** objective names a `culpritNodeId`
   that exists in the design: the busiest node for shed/latency/headroom, the costliest LLM
   node for cost. A **met** objective names none.
7. **AC7 — remediation hint** — Every failed objective carries a non-empty hint resolved
   for the culprit's **kind** in the active language, and hints exist in **both** en and pt
   for every (metric, kind) pair that can be produced (a test walks the matrix).
8. **AC8 — overall verdict** — The verdict is `met` iff every **enabled** objective is met;
   an objective switched off is absent from the results and cannot affect the verdict.
9. **AC9 — live panel** — The panel renders each objective's row with its ✓/✗ and, after a
   scaling change that clears the bottleneck, re-renders as met **without a reload**.
10. **AC10 — targets persist + are sanitised** — Edited targets round-trip through
    `localStorage`; a malformed or foreign persisted blob falls back to the stated defaults
    without throwing.
11. **AC11 — no regression** — With the objectives feature present but untouched, every
    existing Arena readout (per-node metrics, header e2e/cost/shed, equilibrium) is
    unchanged, and `computeMetrics`' signature is unchanged.
12. **AC12 — bilingual** — Every string introduced here resolves in both `en` and `pt`.
13. **AC13 — the latency ceiling is reported honestly** — For a design past the model's latency
    ceiling, the latency row reports the figure as a **lower bound** (`≥`) carrying a
    ceiling note, never as a precise value, and the shed row is pointed to as the continuation
    of the story (108's rule, applied to the objectives panel).
14. **AC14 — defaults are the measured ones** — The shipped defaults are e2e ≤ 30 s, headroom ≥
    20%, shed ≤ 0, **cost off**; a test asserts that under these defaults the shipped default
    design fails exactly the latency and headroom axes while the `llm-fleet` preset meets all
    three tracked axes. (This is the 130-style self-policing guarantee applied to the defaults:
    a future recalibration turns into a red test, not a silently useless panel.)
15. **AC15 — culprit highlight** — Hovering a failed objective's row marks the culprit node on
    the canvas via the existing highlight mechanism, and leaves it unmarked on mouse-out.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — the Arena emits no `TraceEvent`s (constitution §3).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none** — the Arena is a separate page with its own
  component vocabulary (`arena/components.ts`), not the Simulator's station model.

## Clarify — resolved (2026-07-27)

All four questions were settled against the **measured baseline** above rather than by
argument. The originally-drafted proposals were wrong on three of them, which is the whole
value of having measured first.

- **Default targets** → **e2e ≤ 30 s · headroom ≥ 20% · shed ≤ 0 tracked; cost OFF.**
  *Drafted proposal was shed ≤ 0, e2e ≤ 5 s, cost ≤ $2,000/h, headroom ≥ 20% — three of those
  four were wrong:* e2e ≤ 5 s fails **every** preset (best is 12.6 s, because an agent turn is
  fan-out × 8 ms/token decode since 127); cost ≤ $2,000/h passes the **broken** design and
  fails every good one; and shed ≤ 0 is met by everything short of the extreme regime. Cost is
  off in the sandbox and is opted into by a challenge that pairs it with latency.
- **Is `headroomPct` in v1?** → **Yes.** Drafted as the most arguable axis; the measurement
  makes it the best discriminator (4% vs 47–69%) with none of cost's inversion.
- **Panel placement** → **a tabbed surface at the bottom-right** (Objectives · Brief · Notes),
  reusing 122's panel area. Keeps the canvas at full width, and settles 130's brief placement
  in the same decision.
- **Culprit highlight** → **yes, on row hover**, reusing 122's `data-highlighted` mechanism.
  Permanent highlighting was rejected: it would compete with the existing bottleneck highlight
  and with 131's `⚡` marker for the same node.

One consequence outside this spec, recorded for 130's clarify: **challenge #1 ("the agent's
wall") cannot be a "no dropped requests" challenge**, because the broken design already
satisfies that. It is a **latency** challenge.

## Out of scope / deferred

- **Request-level availability %** — needs per-turn call outcomes (did *any* of a turn's
  calls 429?), which the aggregate model does not carry. Would be a model change, not a
  reporting change.
- Percentile latency (p95/p99) — the model is a single deterministic operating point.
- Objectives over *resilience* ("survives a region outage") — needs 131's faults; they slot
  into this same result shape once faults exist.
- A resilience/architecture *score* (0–100). The verdict is deliberately binary per axis;
  weighted scoring is a 130/132 question.
