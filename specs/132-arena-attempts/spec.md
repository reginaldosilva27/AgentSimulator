# Spec: Arena — attempts, progress & best solution

| | |
|---|---|
| **ID** | 132-arena-attempts |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-27 |

> Fourth of five specs building the **Challenges module** (129 → 133). Depends on **129**
> (verdict) and **130** (challenges); composes with **131** (a fault-bearing challenge is
> just another challenge). This is the spec that turns a set of puzzles into a **course**.

## Problem / motivation

With 130 in place a user can solve a challenge — and then lose it. Close the tab, or enter the
next challenge, and there is no record that the wall was ever cleared, no way to compare the
$1,800/h solution against yesterday's $2,400/h one, and no sense of a path through the
library. The learning loop stops at the moment it should compound.

Three concrete losses:

- **No memory of passing.** Nothing tells the user which challenges they have solved, so the
  library reads as a flat list rather than a progression. (The competitor publishes a 3% pass
  rate precisely because tracking passes is what makes a pass mean something.)
- **No comparison between attempts.** The interesting question after solving *"no dropped
  requests under $2,000/h"* is *"could I have done it cheaper?"* — which requires the previous
  attempt to still exist. This is where the cost and latency axes stop being scoreboard
  numbers and start being engineering trade-offs.
- **No way back to a design you had.** A user who scaled their way out of a bottleneck and then
  kept editing cannot return to the version that worked.

None of this needs a backend or an account. A challenge attempt is small (a verdict plus a
design snapshot), it is entirely local, and it belongs in `localStorage` next to the design —
under its **own key**, so clearing a canvas never erases a record of learning.

## Goals

- Record an **attempt** per solve-or-abandon: which challenge, the per-objective results, the
  overall verdict, and a **snapshot of the design** that produced it (plus any faults in force).
- Per-challenge **status** — untried · attempted · solved — surfaced as a badge in the
  challenge picker, and a library-level summary (*"3 of 6 solved"*).
- A **best attempt** per challenge, chosen by a stated, deterministic rule (cheapest passing
  design, then fastest) so "better" is defined rather than vibes.
- An **attempt history** panel: read the results of each past attempt and **restore its design
  to the canvas**.
- A **bounded** history (oldest attempts dropped) so `localStorage` cannot grow without limit.
- **Reset progress** as an explicit, confirmed action.
- The pure model stays **free of wall-clock time**: timestamps enter only at the store's
  boundary, through an injectable clock.
- Every new string ships **en + pt** (constitution §4).

## Non-goals

- **No accounts, no server-side storage, no leaderboard, no sharing.** Progress is local to the
  browser, and the UI says so.
- **No new scoring axis and no weighted 0–100 score.** The verdict stays 129's per-axis
  binary; "best" is a *tie-break rule over passing attempts*, not a new metric.
- **No AI judge / qualitative feedback on an attempt** — that is 133 (which may later attach
  its critique to an attempt recorded here).
- **No unlock gating** (solve easy to reveal medium). The library stays open; progress is
  informational, not a gate.
- **No backend, no new `Stage`/`TraceEvent`, no SQLite table, no protocol change.**
- No change to the Simulator page or to the relational store's history (a different feature for
  a different thing — real conversations).

## User-facing behavior

- Solving a challenge shows a **solved** state, and the challenge picker marks it from then on.
- The picker shows a **badge per challenge** (untried · attempted · solved) and a header
  summary: *"3 of 6 solved"* (pt: *"3 de 6 resolvidos"*).
- A **History** view for the active challenge lists past attempts — verdict, the per-objective
  actuals, and for passing ones the cost and latency achieved — newest first, with the **best**
  one marked.
- Any listed attempt can be **restored** to the canvas (its design, and its faults if it had
  any), so a user can pick up a previous line of attack.
- **Reset progress** wipes the record after an explicit confirmation, and says plainly that the
  record lives only in this browser.
- Progress survives reloads, and survives **clearing the sandbox design** — the two are stored
  separately on purpose.

## Acceptance criteria

1. **AC1 — an attempt is recorded** — Recording an attempt for a challenge appends an entry
   carrying the challenge id, the overall verdict, one result per objective (metric, target,
   actual, met), the design snapshot, and any faults in force at the time.
   - **AC1b — the recording trigger** — An attempt is recorded on **every** transition of the
     verdict from not-met to met, **and** unconditionally on leaving the challenge. Concretely:
     solving, then improving the design while it stays solved, then exiting yields **two**
     attempts — the second carrying the improved figures — so a later "could I do it cheaper?"
     comparison has both to compare. Staying not-met throughout and exiting yields exactly one
     (failed) attempt, and an enter→exit with nothing changed appends no near-duplicate.
2. **AC2 — status transitions and never regresses** — A challenge's status goes untried →
   attempted on a failed attempt and → solved on a passing one; once solved, a later failed
   attempt leaves the status **solved** (it is a record of having done it, not of the last try).
3. **AC3 — best attempt rule** — Among a challenge's **passing** attempts the best is the one
   with the lowest cost per hour, ties broken by lowest end-to-end latency, then by the earliest
   recorded; with no passing attempt there is no best. The rule is deterministic for a given
   history. A test also pins that **failing attempts are never candidates**, however cheap —
   this is what keeps the cost-first rule from rewarding the starved designs 129 measured.
4. **AC4 — library summary** — The summary counts solved challenges over the library total, and
   updates when a new challenge is solved.
5. **AC5 — restore an attempt** — Restoring a recorded attempt reproduces its design on the
   canvas exactly (nodes, edges, per-node scaling, regions, model tiers, notes) together with
   its faults, and leaves the challenge's locked givens intact.
6. **AC6 — progress is stored separately** — Progress persists under its **own** storage key;
   clearing/replacing the Arena design (including `clear()` and loading an example) leaves
   progress untouched, and vice versa.
7. **AC7 — malformed progress degrades safely** — A corrupt, foreign or partially-shaped
   persisted blob yields empty progress without throwing, and unknown challenge ids in the blob
   are dropped.
8. **AC8 — no clock in the pure layer** — Timestamps are supplied through an injectable clock at
   the store boundary; a test records attempts with a fixed fake clock and gets deterministic
   ordering, and neither `model.ts` nor the SLO/challenge/chaos pure modules reference
   `Date.now`.
9. **AC9 — history is bounded** — Beyond the per-challenge cap of **10**, recording an attempt
   drops the oldest **non-best** entry, and the best passing attempt is never evicted.
10. **AC10 — reset progress, separately from the design** — The progress reset clears every
    challenge's record (after confirmation) and the summary returns to zero solved, leaving the
    current canvas untouched; conversely the existing design reset leaves progress untouched. The
    two are distinct controls and neither does the other's job.
11. **AC11 — no regression** — With no challenge ever attempted, the Arena and the challenge
    flow behave exactly as after 130/131.
12. **AC12 — bilingual** — Every string introduced here resolves in both `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — no `TraceEvent`s (constitution §3).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none**.

## Clarify — resolved (2026-07-27)

- **Recording trigger: on every transition into *solved*, **and always on exit**.** The drafted
  proposal ("first solve, plus on exit if never solved") had the under-recording hole the plan
  flagged: a user who solves at $24,000/h and then refines to $18,000/h while staying solved
  would produce no second record, and the whole *"could I have done it cheaper?"* story would
  never fire. Recording unconditionally on exit closes it — the refined state is captured as its
  own attempt.
- **Per-challenge cap: 10**, with the best passing attempt never evicted. Eviction drops the
  oldest **non-best** entry.
- **Best attempt: cheapest first**, ties broken by lowest latency, then earliest recorded. The
  cost inversion 129 measured (a starved design is the cheapest) **does not apply here**, and
  this is why the rule is safe: only **passing** attempts are candidates, so latency and headroom
  are already inside target by definition. Among designs that all work, cost is the tie-break
  that means something.
- **Revealing 130's reference marks the attempt `assisted`** — decided in 130's clarify. Shown in
  the history, and it does **not** exclude the attempt from *solved*.
- **131's faults are recorded (AC1) and marked in the history**, but do **not** create a separate
  status. Passing with a region down is a visibly different achievement without needing a
  parallel progression to track it.
- **Two separate resets.** The existing design reset stays as it is; a distinct, confirmed
  progress reset is added. This makes AC6's key separation visible in the UI: clearing a canvas
  is routine, deleting a record of learning is not, and one button must never do both.

## Out of scope / deferred

- Export / import / permalink of a design or a result (a good future spec; would also serve
  sharing a challenge solution).
- Any server-side or cross-device progress.
- A weighted score, badges beyond solved, streaks, or unlock progression.
- Attaching 133's AI critique to a recorded attempt (natural follow-up once 133 exists).
