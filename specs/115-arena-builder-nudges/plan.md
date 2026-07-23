# Plan: Arena — builder nudges

> The HOW for `115-arena-builder-nudges`. Last of the pre-challenges track — runs
> after 110 and 114 so the calibration pass (AC5) pins final numbers.

## Approach

- **Nudge derivation (pure)**: a helper in `frontend/src/arena/model.ts` (or a small
  `nudges.ts`) computes `fanoutNudges(design): Array<{nodeId, targetId}>` — for each
  `backend → llm` edge with no aiGateway between and turn fan-out 1, and each
  `aiGateway → llm` with gateway cpr 1, emit a suggestion targeting the node that
  should carry the cpr (gateway if present, else the LLM). Rendered as a dismissible
  chip in the scale panel region of `ArenaCanvas.tsx`.
- **Dismissal state**: `dismissedNudges: string[]` (node ids) in the Zustand store,
  persisted with the design; structural edits that remove the edge clear the flag.
- **Apply**: reuses the existing per-node update action (`callsPerRequest = 2`).
- **Hints**: static bilingual strings on the think-time control and on the replicas
  slider when `value === max` (the max lives where the slider is defined,
  `ArenaCanvas.tsx`).
- **Calibration (AC5)**: extend `examples.test.ts` with a description-truthfulness
  walk — parse each preset's cited req/s from its description (or store the numbers
  as structured fields on the example to avoid string-parsing fragility — preferred:
  add optional `claims` metadata to `ArenaExample` and assert against the model).

## Affected files

**Frontend**
- `frontend/src/arena/model.ts` (or `nudges.ts`) — `fanoutNudges` pure helper.
- `frontend/src/arena/store.ts` — `dismissedNudges` + actions.
- `frontend/src/arena/ArenaCanvas.tsx` — chip UI, think-time hint, ceiling hint.
- `frontend/src/arena/examples.ts` — optional `claims` metadata + copy fixes (en/pt).
- `frontend/src/i18n/*` — nudge/hint strings (en/pt).
- Tests: `model.test.ts` (or `nudges.test.ts`), `store.test.ts`,
  `ArenaCanvas.integration.test.tsx`, `examples.test.ts`, `i18n.test.ts`.

**Backend** — none.

## Protocol changes (constitution §1)

None.

## Data model changes

localStorage blob gains optional `dismissedNudges: string[]` — absent in old blobs,
defaulted to `[]` on hydrate (backwards-compatible, same pattern as 103's `users`
migration).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `arena.fanoutNudge` | `An agent turn makes 2–5 model calls — set calls per request = 2?` | `Um turno de agente faz de 2 a 5 chamadas de modelo — definir chamadas por request = 2?` |
| `arena.fanoutApply` | `Set to 2` | `Definir como 2` |
| `arena.fanoutDismiss` | `Keep 1` | `Manter 1` |
| `arena.thinkTimeHint` (updated) | `Seconds between messages per user. The single most decisive knob: chat users typically pause 30–120s — halving it doubles the load.` | `Segundos entre mensagens por usuário. O knob mais decisivo de todos: usuários de chat tipicamente pausam 30–120s — reduzir pela metade dobra a carga.` |
| `arena.replicasCeilingHint` | `At the per-pool max — real fleets escape by adding another pool/region or a higher quota tier.` | `No máximo por pool — frotas reais escapam adicionando outro pool/região ou um tier de cota maior.` |

## Cloud map (constitution §5)

n/a.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | nudge derived for backend→llm and aigw→llm @ fan-out 1; Apply sets cpr on the right node; dismiss persists | `nudges/model.test.ts` + `store.test.ts` + integration |
| AC2 | cpr ≥ 2 anywhere on the pair → no nudge; all presets → zero nudges | `model.test.ts` + `examples.test.ts` |
| AC3 | think-time hint rendered (en + pt) | `ArenaPage.test.tsx` / integration |
| AC4 | replicas at max → hint; below → none | `ScalePanel.test.tsx` |
| AC5 | every example's `claims` hold against the model | `examples.test.ts` |
| AC6 | i18n parity | `i18n.test.ts` |

## Risks / trade-offs

- Nudges as derived state (not events) keeps the pure-projection style but means the
  chip reappears after a reload unless dismissal is persisted — hence the store flag.
- String-parsed description checks would be brittle → structured `claims` metadata
  instead; descriptions stay prose, claims stay testable.
