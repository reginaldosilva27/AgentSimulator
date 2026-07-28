# Plan: Arena — challenge library

> `spec.md` is **`clarified`** — see its Clarify section. The decisions that change this plan:
> challenge 1 is a **latency** challenge (the shed axis is nearly vacuous under the closed
> loop), **cost may never be a lone axis** (AC14), a **≥20% margin** is required on both sides
> (AC15), targets are **pinned and policed** by the reference walk, the brief lives in 129's
> tabbed bottom-right surface, and entering a challenge **un-dismisses 115's nudges** (AC17).

## Approach

A challenge is **data**, in the shape the presets already proved out. `examples.ts` is the
template to copy deliberately: a pure factory returning a design, plus machine-checkable
claims that a test walks so the prose cannot go stale. `challenges.ts` is that pattern with
the claim upgraded from a status word to a **129 verdict**.

```ts
interface ArenaChallenge {
  id: string
  difficulty: "easy" | "medium" | "hard"
  title: Record<Lang, string>
  brief: Record<Lang, string>          // the ask, in an architect's words
  givens: { users: number; thinkTimeSec: number; callShape: CallShape }
  objectives: SloTargets               // 129 — the pass condition, arithmetic
  start?: () => Pick<ArenaState, "nodes" | "edges">   // the broken starting point
  reference: () => Pick<ArenaState, "nodes" | "edges"> // the verified solution
  allowedKinds?: readonly ArenaKind[]  // absent = full palette
  concepts?: readonly string[]         // 121 Learn topic ids
}
```

**AC2, AC3, AC14 and AC15 are the load-bearing tests**, and they are cheap because 129 exists:
walk the library, build each design, `evaluateObjectives(measureDesign(design, givens…),
objectives)`, then assert
- `verdict.met === true` for `reference` and `false` for `start` (AC2/AC3);
- **≥20% slack** on every objective for `reference`, and **≥20% miss** on at least one for
  `start` (AC15) — the knife-edge guard, computed per axis from `(target − actual)/target`
  with the metric's direction;
- no challenge carries `cost` without `latency` or `headroom` (AC14).

That set makes the whole library self-policing — a recalibration (a 127-style latency change, a
128-style tier change, a quota re-anchor) turns an unsatisfiable **or marginal** challenge into a
**red test** instead of a frustrated user. This is the direct antidote to the 116 gotcha, and
AC15 exists because measurement caught challenge 4 already sitting on a 2.5 s margin.

**Authoring order matters because of AC15.** Challenge 4's demand must be raised until the
regional quota genuinely bites (at the shipped preset's load, `regional-quota` and `multi-region`
both clear a 30 s target). Expect to tune `users` upward, not the target downward — lowering the
target to squeeze a margin is what AC15 exists to prevent.

**Challenge mode in the store.** `ArenaState` gains `challengeId: string | null` plus a
**stash**: `sandbox: Pick<ArenaState, "nodes"|"edges"|"users"|"thinkTimeSec"|"callShape"> |
null`. `enterChallenge(id)` stashes the current sandbox, applies the givens and the starting
design; `exitChallenge()` restores the stash and clears it. Both are ordinary store actions —
no new mechanism.

**Locking is enforced in the store, not in the components** (AC6). `setUsers`, `setThinkTime`
and `setCallShape` become no-ops while `challengeId !== null`; the controls read the same
flag to render read-only. Enforcing it in the store means a locked given cannot be bypassed
by any future UI path, and the AC is testable without rendering anything. The lock is
*explained* in the UI (a title/hint), never silent — the 104 `ℹ️` convention.

**Palette restriction** (AC8) is a filter passed to `Palette.tsx`, applied *after* 126's
grouping and search so the two features compose; an absent `allowedKinds` means "all", so the
sandbox path is unchanged.

**Why not put challenges in `examples.ts`?** They share a factory shape but differ in kind: an
example is *loaded and read* (and shows callouts), a challenge is *entered* (and locks state,
declares a pass condition, has two designs). Merging them would push a mode flag through
every preset. Separate module, shared helpers (`node()` / `edge()` / `COL` / `ROW` get
extracted so both use one set).

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/arena/challenges.ts` — **new**: `ArenaChallenge`, `CHALLENGES`, the six
  entries with their briefs, givens, objectives, start + reference designs.
- `frontend/src/arena/challenges.test.ts` — **new**: AC1, AC2, AC3, AC10, AC13.
- `frontend/src/arena/ChallengePanel.tsx` — **new**: brief + difficulty + objectives
  checklist (composing 129's `SloPanel`) + verdict + reference reveal + exit.
- `frontend/src/arena/ChallengePanel.test.tsx` — **new**: AC7, AC9, AC13.
- `frontend/src/arena/store.ts` — `challengeId`, `sandbox` stash, `enterChallenge` /
  `exitChallenge` / `loadReference`, the given-lock guards, persistence + sanitation.
- `frontend/src/arena/store.test.ts` — AC4, AC5, AC6, AC11.
- `frontend/src/arena/ArenaPage.tsx` — the **Challenges** picker beside Examples; mount the
  panel; pass the locked flag to the load controls.
- `frontend/src/arena/ArenaPage.test.tsx` — AC12 (sandbox unchanged when no challenge active).
- `frontend/src/arena/Palette.tsx` — accept + apply the allowed-kinds filter (AC8).
- `frontend/src/arena/Palette.test.tsx` — AC8.
- `frontend/src/arena/examples.ts` — extract the shared `node()` / `edge()` / spacing helpers
  (behaviour-preserving refactor, existing tests must stay green).
- `frontend/src/arena/learnLinks.ts` / `learnLinks.test.ts` — extend the topic-id validation
  walk to challenges (AC10).
- `frontend/src/i18n/strings.ts` — `arena.challenge.*` (en + pt).
- `frontend/src/arena/i18n.test.ts` — extend the bilingual walk.

## Protocol changes (constitution §1)

None. No `Stage`, no `TraceEvent`, no `schemas.py` / `events.ts` change, no `readoutFor` /
`renderDetail` case (the Arena has no `StationId`).

## Data model changes

None in SQLite or Chroma. `localStorage` only, inside the existing `agentsim.arena` blob:
`challengeId` + the `sandbox` stash. Sanitation follows the 128 precedent — an unknown
`challengeId` is dropped (AC11), and a malformed stash is dropped rather than partially
applied.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.challenge.nav` | Challenges | Desafios |
| `arena.challenge.pick` | Pick a challenge | Escolha um desafio |
| `arena.challenge.brief` | The ask | O pedido |
| `arena.challenge.difficulty.easy` | Easy | Fácil |
| `arena.challenge.difficulty.medium` | Medium | Médio |
| `arena.challenge.difficulty.hard` | Hard | Difícil |
| `arena.challenge.given` | Set by the problem | Definido pelo desafio |
| `arena.challenge.lockedHint` | The problem sets the load — your job is the architecture. | O desafio define a carga — seu trabalho é a arquitetura. |
| `arena.challenge.solved` | Solved | Resolvido |
| `arena.challenge.notYet(met, total)` | Not yet — {met} of {total} objectives met | Ainda não — {met} de {total} metas atingidas |
| `arena.challenge.showReference` | Show reference solution | Ver solução de referência |
| `arena.challenge.referenceHint` | One design that meets every objective — not the only one. | Um desenho que atinge todas as metas — não o único. |
| `arena.challenge.exit` | Leave challenge | Sair do desafio |
| `arena.challenge.exitHint` | Your sandbox design is kept. | Seu desenho do sandbox é preservado. |
| `arena.challenge.paletteLimited` | This challenge allows only some components. | Este desafio permite apenas alguns componentes. |
| `challenges.ts` — 6 × `title` + `brief` | (per challenge) | (per challenge) |

## Cloud map (constitution §5)

n/a — no new tier or station; challenges reuse the existing Arena component vocabulary.

## Test strategy (constitution §9 — TDD)

Vitest from `frontend/`. AC2/AC3 are the library-walking tests written **before** any
challenge content, so the first challenge is authored against a failing guarantee.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | walk `CHALLENGES`: unique ids, difficulty in the union, non-empty en+pt title/brief, ≥1 objective, givens present | `challenges.test.ts` |
| AC2 | walk: `evaluateObjectives(measureDesign(reference(), givens), objectives).met === true` | `challenges.test.ts` |
| AC3 | walk (where `start` exists): same evaluation ⇒ `.met === false` | `challenges.test.ts` |
| AC4 | `enterChallenge(id)` sets users/think/callShape to givens and the canvas to `start()` | `store.test.ts` |
| AC5 | sandbox D+L → enter → exit ⇒ store deep-equals the pre-enter snapshot | `store.test.ts` |
| AC6 | during a challenge, `setUsers` / `setThinkTime` / `setCallShape` leave the givens intact | `store.test.ts` |
| AC7 | render with a failing challenge ⇒ ✗ + "Not yet"; act(scale) ⇒ "Solved", no remount | `ChallengePanel.test.tsx` |
| AC8 | `allowedKinds` ⇒ palette lists exactly those; absent ⇒ full palette | `Palette.test.tsx` |
| AC9 | `loadReference()` puts the reference on the canvas and leaves `challengeId` set + givens locked | `store.test.ts` |
| AC10 | every `concepts` id resolves in `allTopicsFor` | `learnLinks.test.ts` |
| AC11 | persisted `challengeId` restored; `{challengeId:"nope"}` ⇒ sandbox mode, no throw | `store.test.ts` |
| AC12 | no challenge active ⇒ existing Arena page assertions + `model.test.ts` / `examples.test.ts` unchanged | `ArenaPage.test.tsx` + existing |
| AC13 | bilingual walk over `arena.challenge.*` + every challenge's title/brief | `i18n.test.ts` |
| AC14 | walk: no challenge declares `cost` without `latency` or `headroom` | `challenges.test.ts` |
| AC15 | walk: reference meets every objective with ≥20% slack; start misses one by ≥20% | `challenges.test.ts` |
| AC16 | walk: every latency-bearing challenge's brief explains the per-turn floor, en + pt | `challenges.test.ts` |
| AC17 | enter ⇒ `dismissedNudges` empty; exit ⇒ the sandbox's dismissals restored | `store.test.ts` |

## Risks / trade-offs

- **Content risk dominates.** The structure is small; the difficulty is authoring six
  challenges whose numbers are simultaneously *defensible*, *satisfiable* and *instructive*.
  AC2/AC3 catch the first two automatically; the third is editorial judgement and the reason
  the challenge set is an open question rather than a plan decision.
- **Recalibration coupling.** Pinned targets mean a future model recalibration can break AC2.
  That is the intended trade (a red test beats an impossible challenge), but it must be
  written down in `challenges.ts`' header comment so the next recalibrator knows to re-tune
  rather than to weaken the test.
- **Three panels, one corner.** 129's objectives, 130's brief and 122's example notes all want
  the bottom-right. Deciding this once (a tabbed surface) is cheaper than three placements.
- **The stash is a footgun** if a future action mutates the sandbox while a challenge is
  active. AC5 pins the round-trip; anything that writes to `nodes`/`edges` must go through
  the challenge-aware path.
- **`allowedKinds` must not silently hide a component the user needs**, or a challenge becomes
  unsolvable in a way AC2 *would* catch (the reference solution uses a forbidden kind) — worth
  asserting that too: every reference design uses only allowed kinds.
