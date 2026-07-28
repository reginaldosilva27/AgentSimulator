# Plan: Arena — attempts, progress & best solution

> `spec.md` is **`clarified`**: an attempt is recorded on **every** transition into solved **and
> unconditionally on exit** (the drafted "first solve only" under-recorded refinements); cap
> **10** with the best never evicted; best = **cheapest passing**, ties by latency then earliest;
> reference reveal marks `assisted`; faults are recorded and marked but create no separate status;
> **two separate resets** (design vs progress).

## Approach

**A second `localStorage` key, deliberately.** Progress lives under
`agentsim.arena.progress`, separate from `agentsim.arena` (the design). That separation *is*
AC6: wiping a canvas is an everyday act, wiping a record of learning is not, and coupling them
would make `clear()` destructive in a way the user cannot anticipate. Two keys, two lifecycles.

**Shape:**

```ts
interface AttemptResult { metric: SloMetricId; target: number; actual: number; met: boolean }

interface ArenaAttempt {
  seq: number                 // monotonic per challenge — deterministic ordering
  at: number                  // epoch ms, from the injected clock
  passed: boolean
  results: AttemptResult[]
  costPerHourUsd: number      // denormalised for the best-attempt rule (AC3)
  e2eLatencyMs: number
  assisted?: boolean          // 130's reference solution was revealed
  design: Pick<ArenaState, "nodes" | "edges" | "callShape">
  faults?: ArenaFault[]       // 131 — what was broken at the time
}

interface ChallengeProgress { status: "attempted" | "solved"; attempts: ArenaAttempt[] }
type ArenaProgress = Record<string, ChallengeProgress>   // keyed by challenge id
```

`untried` is the **absence** of a record, not a stored value — so AC2's "never regresses" is
enforced in one place (`status: prev.status === "solved" ? "solved" : passed ? "solved" :
"attempted"`) and an unknown challenge id simply drops on load (AC7).

**A pure progress module + an impure boundary.** `progress.ts` holds pure functions —
`recordAttempt(progress, challengeId, attempt): ArenaProgress`, `bestAttempt(attempts)`,
`summarise(progress, challengeIds)`, `pruneHistory(attempts, cap)` — none of which touch time,
storage or the store. The store action supplies `at` from an injectable clock:

```ts
// store: the ONLY place wall-clock time enters the Arena
let clock: () => number = () => Date.now()
export const __setArenaClock = (fn: () => number) => { clock = fn }   // tests only
```

That is AC8. The rule the codebase already holds — `model.ts` forbids `Date.now` / `Math.random`
because they would break determinism and resume — stays intact: the pure model never sees a
timestamp, and `progress.ts` receives one as data. A test asserts by grep-shaped inspection
(`model.ts`, `slo.ts`, `challenges.ts`, `chaos.ts` contain no `Date.now`) so the boundary cannot
erode.

**Denormalising cost and latency** into the attempt (rather than recomputing from the snapshot)
is intentional: it makes AC3's ranking a pure sort over stored numbers, and it keeps a historical
attempt's figures **as they were measured** — a later model recalibration (127/128-style) must not
silently rewrite history. Restoring the design re-derives live numbers, which may legitimately
differ; the history panel labels stored figures as *from that attempt*.

**Eviction (AC9)** happens in `pruneHistory`: drop the oldest entry that is not the current best
passing attempt. Cap stated as a module constant so the test and the UI read the same number.

**Restore (AC5)** reuses 130's design-loading path and 131's `applyFault`, then leaves
`challengeId` and the locked givens untouched — restoring is an edit to the canvas, not a mode
change.

**Alternative considered and rejected:** storing progress in the SQLite relational DB via a new
table. It would make progress durable across browsers and would fit `docs/data-model.md`'s
system-of-record story — but it drags the Arena into the backend (which 133 does deliberately and
this spec does not need), requires a migration + schema-audit + clear-coverage updates, and buys
nothing for a single-user local tool. If cross-device progress is ever wanted, it becomes its own
spec with a real reason.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/arena/progress.ts` — **new**: types, `recordAttempt`, `bestAttempt`,
  `summarise`, `pruneHistory`, `HISTORY_CAP`, load/save + sanitation for
  `agentsim.arena.progress`.
- `frontend/src/arena/progress.test.ts` — **new**: AC1–AC4, AC7, AC9, AC12.
- `frontend/src/arena/store.ts` — the progress slice (or a sibling `useArenaProgress` store),
  `recordAttempt` action with the injected clock, `restoreAttempt`, `resetProgress`,
  `__setArenaClock`; auto-record hook per the open question's proposal (a).
- `frontend/src/arena/store.test.ts` — AC5, AC6, AC8, AC10.
- `frontend/src/arena/AttemptHistory.tsx` — **new**: the history list (verdict, per-objective
  actuals, cost/latency, best marker, assisted + faulted markers, restore).
- `frontend/src/arena/AttemptHistory.test.tsx` — **new**: AC5 (UI), AC12.
- `frontend/src/arena/ChallengePanel.tsx` — solved state, the History entry point.
- `frontend/src/arena/ArenaPage.tsx` — status badges + the *"N of M solved"* summary in the
  Challenges picker; the progress-reset control.
- `frontend/src/arena/ArenaPage.test.tsx` — AC4, AC11.
- `frontend/src/i18n/strings.ts` — `arena.progress.*` (en + pt).
- `frontend/src/arena/i18n.test.ts` — extend the bilingual walk.

## Protocol changes (constitution §1)

None. No `Stage`, no `TraceEvent`, no `schemas.py` / `events.ts` change.

## Data model changes

**No SQLite and no Chroma change** — so no migration, no `user_version` bump, no
`docs/data-model.md` edit, and no `EXPECTED_TABLES` / `EXPECTED_CLEAR_KEYS` update (the
schema-audit and clear-coverage tests are untouched). New `localStorage` key only:
`agentsim.arena.progress`, versioned by a `v` field inside the blob so a future shape change can
migrate rather than discard.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.progress.summary(solved, total)` | {solved} of {total} solved | {solved} de {total} resolvidos |
| `arena.progress.status.untried` | Not tried | Não tentado |
| `arena.progress.status.attempted` | Attempted | Tentado |
| `arena.progress.status.solved` | Solved | Resolvido |
| `arena.progress.history` | Attempts | Tentativas |
| `arena.progress.noAttempts` | No attempts yet | Nenhuma tentativa ainda |
| `arena.progress.best` | Best so far | Melhor até agora |
| `arena.progress.attemptLabel(seq)` | Attempt #{seq} | Tentativa #{seq} |
| `arena.progress.passed` | Met every objective | Atingiu todas as metas |
| `arena.progress.failed(met, total)` | {met} of {total} objectives | {met} de {total} metas |
| `arena.progress.restore` | Load this design | Carregar este desenho |
| `arena.progress.restored` | Loaded — the challenge is still active. | Carregado — o desafio continua ativo. |
| `arena.progress.assisted` | Reference solution was shown | A solução de referência foi mostrada |
| `arena.progress.withFaults` | Solved with faults applied | Resolvido com falhas aplicadas |
| `arena.progress.figuresFromThen` | Figures as measured at the time of the attempt. | Números como medidos no momento da tentativa. |
| `arena.progress.localOnly` | Progress is kept in this browser only. | O progresso fica apenas neste navegador. |
| `arena.progress.reset` | Reset progress | Zerar progresso |
| `arena.progress.resetConfirm` | Delete every recorded attempt? This cannot be undone. | Apagar todas as tentativas registradas? Isso não pode ser desfeito. |

## Cloud map (constitution §5)

n/a — no new tier or station.

## Test strategy (constitution §9 — TDD)

Vitest from `frontend/`. The pure `progress.ts` layer carries most ACs and needs no rendering;
the fake clock makes ordering deterministic.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `recordAttempt` appends with verdict, results, snapshot, faults | `progress.test.ts` |
| AC1b | solve → improve → exit yields **two** attempts, the second with the improved figures; never-solved → exit yields exactly one | `store.test.ts` |
| AC2 | untried → attempted → solved; a later failure keeps `solved` | `progress.test.ts` |
| AC3 | best = cheapest passing, tie → lowest latency, tie → earliest; none passing ⇒ undefined | `progress.test.ts` |
| AC4 | `summarise` count; picker renders *"N of M solved"* and updates on a new solve | `progress.test.ts`, `ArenaPage.test.tsx` |
| AC5 | restore reproduces nodes/edges/scaling/regions/tiers/notes + faults; givens stay locked | `store.test.ts`, `AttemptHistory.test.tsx` |
| AC6 | progress under its own key; `clear()` / `loadExample()` leave it intact and vice versa | `store.test.ts` |
| AC7 | corrupt / foreign / unknown-id blob ⇒ empty progress, no throw | `progress.test.ts` |
| AC8 | fake clock ⇒ deterministic `at` + ordering; the pure modules contain no `Date.now` | `store.test.ts`, `progress.test.ts` |
| AC9 | at cap + 1, the oldest **non-best** entry is dropped and the best survives | `progress.test.ts` |
| AC10 | reset clears every record, summary back to 0, canvas untouched | `store.test.ts` |
| AC11 | with no attempts, 130/131 behaviour unchanged (existing suites green) | existing |
| AC12 | bilingual walk over `arena.progress.*` | `i18n.test.ts` |

## Risks / trade-offs

- **`localStorage` growth.** A design snapshot per attempt across a growing library is the one
  real footprint concern; the cap (AC9) is the mitigation and its number should be justified
  against a rough per-snapshot size, not guessed twice.
- **Denormalised figures can look "wrong"** after a model recalibration (a stored $1,800/h next
  to a live $2,100/h for the same design). Deliberate — history is a record — but it **must** be
  labelled (`figuresFromThen`), or it reads as a bug.
- ~~Auto-recording can under-record~~ — **resolved in clarify**: recording unconditionally on
  exit (not just on the first solve) is what makes a post-solve refinement land in the history.
  The residual risk is the opposite one: a user who enters and leaves a challenge repeatedly
  without touching anything generates near-duplicate failed attempts. Worth a cheap guard —
  skip the exit record when the design and verdict are unchanged since the last recorded
  attempt — and it needs its own test.
- **The clock boundary is easy to erode.** One convenience `Date.now()` in a pure module breaks
  AC8's guarantee silently; the grep-shaped test is the guard and belongs in the first commit.
- **Two resets in the UI** (design vs progress) risks a mis-click; the confirmation copy has to
  name exactly what is being deleted.
