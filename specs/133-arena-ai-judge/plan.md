# Plan: Arena — AI judge (qualitative design critique)

> `spec.md` is **`clarified`** — all eight questions resolved (2026-07-27). The forks are closed:
> **3 calls** (2 personas in parallel + 1 synthesis), a **plain call site** in `arena/judge.py`
> (ABC and 098 untouched), **per-process rate limit + payload cap**, **single JSON response**,
> the **sandbox is judgeable** via its 129 targets, **instance-default model** with an
> allowlist-validated override, **no persistence** in v1, and **no constitution amendment** —
> spec 100 gets a supersede note and the docs get updated.

## Decisions from clarify

| fork | decision | why |
|---|---|---|
| calls per review | **2 personas in parallel + 1 synthesis** | independence is what earns the word "debate"; one structured call would make it a formatting convention (a small dishonesty) |
| provider seam | **plain call site** in `arena/judge.py` | leaves the ABC and 098's `critique()` alone; `OllamaProvider` is not conscripted for a separate page's feature |
| abuse guard | **per-process rate limit + payload cap** | unauthenticated token spend; cap required by AC6 anyway; consistent with single-instance (§8) |
| transport | **single JSON response** | the synthesis cannot start until both personas finish — most of the wait has nothing to stream; abort still cancels |
| model | **instance default, override validated against the allowlist** | 042's 422 precedent; 065 showed pinned model ids age badly |
| scope | **sandbox judgeable** using the user's 129 targets | the judge always has declared goals; never critiques in a vacuum |
| persistence | **none in v1** | attaching to a 132 attempt changes that spec's stored shape + history cap — its own decision |
| constitution | **no amendment** | §1/§3/§8 all intact; the "frontend-only" claim lives in spec 100 + docs |

## What is settled

**One stateless endpoint, no protocol involvement.** `POST /api/arena/judge`, alongside the
existing non-trace routes (`/api/rag/chunk-preview` is the closest precedent: a real,
model/embedding-touching endpoint that emits no `TraceEvent` and writes nothing). No `Stage`, no
`STAGE_TO_STATION` / `STAGE_TO_PHASE` entry, no `readoutFor` / `renderDetail` case, no SQLite
table, no `user_version` bump (AC9, AC10).

**The frontend computes, the backend judges.** The request carries the design *and* the numbers
the pure model already derived (129's `measureDesign` output + the objective results). The
backend does **not** recompute them.

*Why not port the model to Python?* Because a second implementation of `computeMetrics` —
routing tax, regional quota, closed-loop bisection, queueing curve, per-tier decode cost, seven
specs' worth of calibration (103–128) — would drift from the TypeScript one, and the drift would
be **silent**: the judge would critique numbers the user never saw. Trusting the client is the
lesser evil for an educational single-user tool, and the response echoes back the figures it
judged so any mismatch is inspectable. This trade-off must be stated in the endpoint's docstring,
not just here.

**The arithmetic is authoritative (AC2).** The response has no boolean. The request's verdict is
echoed unchanged and the model is instructed that the pass/fail is already decided and not its
business. Structural, not just prompted: there is no field for the model to write a verdict into.

**Notes are untrusted input (AC4).** 120's node/edge notes are user prose heading into a prompt —
the one genuine security surface in this spec. They go inside an explicitly delimited block
labelled as untrusted user content that must be *read and evaluated*, never *obeyed*, with the
per-note length cap already enforced client-side (`NOTE_MAX = 280`) re-validated server-side. The
test uses an instruction-shaped note and asserts the response's structure survives.

**Honest unavailability (AC5, AC11).** `get_provider()` already raises `MissingAPIKeyError` when
no key is configured, and `/api/health` already reports `has_key` — so the endpoint fails fast
with a specific error code and the UI disables the action with a reason. The demo build (058) has
no backend at all, so it must not even attempt the call: gate on the existing demo flag.

**Bilingual on both sides.** `lang` in the request instructs the model to answer in that language
(AC7); the UI chrome is ordinary `strings.ts` work in en + pt (AC12).

## The call structure (AC13)

```
                  ┌─ rigour persona   ─┐
request ─ validate┤                    ├─ synthesis ─ response
                  └─ pragmatism persona┘
   (rate limit + payload cap)   (both critiques in)
```

Two `asyncio.gather`-ed calls, neither receiving the other's output, then a third that receives
both. AC13 asserts this structurally — three calls, and neither persona prompt contains a sibling
critique — because "debate" is a claim about **how it works**, not about the layout. If the
structure were ever collapsed to one call for cost, the UI copy would have to stop saying debate.

## Affected files

**Backend**
- `backend/app/arena/judge.py` — **new**: the two persona prompts + the synthesis prompt, the
  untrusted-notes block, and the three provider calls (two `gather`-ed, one after). Isolated in its
  own package so the Arena's backend footprint is one directory and cannot creep into `agent/`.
- `backend/app/arena/ratelimit.py` — **new** (or a few lines in `judge.py`): a per-process
  token-bucket / fixed-window counter. No new dependency; single-instance by design (§8), so a
  process-local counter is the honest scope.
- `backend/app/schemas.py` — **new request/response models only** (`ArenaJudgeRequest`,
  `ArenaJudgeResponse`). **`Stage` / `Phase` / `TraceEvent` untouched** — with a comment at the
  site saying so, since this file is the protocol's home.
- `backend/app/main.py` — the `POST /api/arena/judge` route: rate guard → validate → judge →
  return; honest `MissingAPIKeyError` handling; 422 on an unlisted model override (AC14).
- `backend/app/llm/provider.py` — **untouched.** The ABC and 098's `critique()` stay as they are;
  `judge.py` calls the provider directly. `ollama_provider.py` is likewise untouched.
- `backend/.env.example` — the two new knobs: the judge rate limit and the optional judge model.
- `backend/tests/test_arena_judge.py` — **new**: AC1, AC3, AC4, AC6, AC7, AC13, AC14
  (`@pytest.mark.openai` only where a real call is needed) + AC5 as a **keyless guard test** that
  runs without a key.
- `backend/tests/test_schema_audit.py` / `test_clear_coverage.py` — **must pass unchanged** (AC10).

**Frontend**
- `frontend/src/arena/judge.ts` — **new**: the client (typed request/response, abort support).
- `frontend/src/arena/JudgePanel.tsx` — **new**: the three-part critique, the honesty framing next
  to the arithmetic verdict, in-flight + cancel, disabled-with-reason state.
- `frontend/src/arena/judge.test.ts` / `JudgePanel.test.tsx` — **new**: AC2, AC8, AC11, AC12 with
  a stubbed fetch (no real provider call from the frontend suite).
- `frontend/src/arena/ChallengePanel.tsx` — the entry point.
- `frontend/src/i18n/strings.ts` — `arena.judge.*` (en + pt).

**Docs (required, not optional)**
- `CLAUDE.md` and `docs/architecture.md` both currently describe the Arena as frontend-only. This
  spec makes that false in one narrow place; both must be updated in the same change, and
  `specs/100-arena-capacity-sandbox/spec.md` gets a pointer noting which non-goal 133 supersedes
  (per `specs/README.md`: append-only record, never edit history — a note, not a rewrite).

## i18n strings (constitution §4) — seed

| key / location | en | pt |
|---|---|---|
| `arena.judge.ask` | Ask for a review | Pedir uma revisão |
| `arena.judge.running` | Reviewing your design… | Revisando seu desenho… |
| `arena.judge.cancel` | Cancel | Cancelar |
| `arena.judge.rigorous` | The rigorous reviewer | O revisor rigoroso |
| `arena.judge.pragmatic` | The pragmatic reviewer | O revisor pragmático |
| `arena.judge.agreed` | What they agree on | No que eles concordam |
| `arena.judge.framing` | A language model's opinion about design quality. Whether the objectives are met is decided by the capacity model, not here. | A opinião de um modelo de linguagem sobre a qualidade do desenho. Se as metas foram atingidas, quem decide é o modelo de capacidade, não aqui. |
| `arena.judge.unavailable` | No model provider is configured for this instance — the review is unavailable. | Nenhum provedor de modelo está configurado nesta instância — a revisão não está disponível. |
| `arena.judge.demoUnavailable` | The online demo has no backend, so the review is unavailable here. | A demo online não tem backend, então a revisão não está disponível aqui. |
| `arena.judge.failed` | The review could not be completed. | Não foi possível concluir a revisão. |

## Test strategy (constitution §9 — TDD)

Split by what needs a real model. Keyless guard tests (AC5) run in CI without a key, exactly as
the fail-fast-without-a-key tests already do; provider-dependent tests are `@pytest.mark.openai`
and skipped without one, asserting **structurally** (all three sections non-empty, the metrics
appear in the composed prompt, the two languages differ) never by wording — the standing rule for
model-variability tolerance.

| AC | Test | File |
|---|---|---|
| AC1 | `[openai]` end-to-end: all three sections non-empty | `backend/tests/test_arena_judge.py` |
| AC2 | response carries no verdict field; the echoed verdict equals the sent one; UI solved-state unchanged by critique content | backend + `JudgePanel.test.tsx` |
| AC3 | composed prompt contains the supplied figures + objective results (no provider call needed) | `test_arena_judge.py` |
| AC4 | notes appear inside the delimited untrusted block; an instruction-shaped note leaves the structure intact | `test_arena_judge.py` (`[openai]` for the second half) |
| AC5 | **keyless**: no provider ⇒ specific error, no fabricated text; UI disabled with a reason | `test_arena_judge.py`, `JudgePanel.test.tsx` |
| AC6 | oversized / malformed payload ⇒ validation error, provider never called | `test_arena_judge.py` |
| AC7 | `[openai]` `pt` vs `en` differ and carry the language instruction | `test_arena_judge.py` |
| AC8 | abort mid-flight ⇒ no partial critique rendered | `JudgePanel.test.tsx` |
| AC9 | `Stage` / `Phase` / `TraceEvent` and `events.ts` unchanged; existing protocol tests green | existing suites |
| AC10 | schema-audit + clear-coverage pass unchanged | existing suites |
| AC11 | demo flag ⇒ unavailable, no fetch attempted | `judge.test.ts` |
| AC12 | bilingual walk over `arena.judge.*` | `i18n.test.ts` |
| AC13 | three calls; neither persona prompt contains the sibling critique; synthesis receives both | `test_arena_judge.py` |
| AC14 | unlisted model override ⇒ 422, provider never called; omitted ⇒ instance default | `test_arena_judge.py` |
| AC15 | no challenge active ⇒ review requestable, the sandbox's 129 targets sent as objectives | `judge.test.ts`, `JudgePanel.test.tsx` |
| AC6 (rate) | past the configured rate ⇒ honest 429, provider never called | `test_arena_judge.py` |

## Risks / trade-offs

- **The Arena stops being frontend-only.** The narrowest possible breach (one stateless route, its
  own package, no DB, no protocol) — but the claim appears in `CLAUDE.md`, `docs/architecture.md`
  and spec 100, and leaving any of them stale is worse than the breach itself.
- **Trusting client-supplied metrics** is a real soundness compromise, accepted with reasons above.
  If it ever becomes unacceptable, the fix is not "recompute in Python" but "move the whole model
  to one place" — a much larger spec.
- **Prompt injection via 120 notes** is the one genuine security surface here. Delimit, label,
  cap, and test with a hostile note.
- **Unauthenticated token spend** — mitigated by the per-process rate limit + payload cap, not
  eliminated. A process-local counter is the honest scope for a single-instance app (§8); it is
  **not** a defence for a multi-replica public deployment, and the docstring should say so rather
  than imply protection it does not have.
- **Cost and latency per review: three calls, wall-clock of roughly two.** That is the
  user-visible price of a real debate; the copy must not promise instant.
- **A judge that flatters is worthless.** The rigour persona must be prompted to find the *actual*
  weakest point given the numbers; a test cannot assert quality, so this needs a human read on
  real designs before the spec is called done — worth an explicit manual check in `tasks.md` once
  written.
