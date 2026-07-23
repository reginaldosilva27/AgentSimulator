# Spec: Arena — semantic cache (the third lever on the LLM wall)

| | |
|---|---|
| **ID** | 112-arena-semantic-cache |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

The LLM is the Arena's designed bottleneck, but the sandbox offers only **two
levers** against it: more deployments (replicas) and a bigger quota tier (size).
Nothing on the palette can *reduce model calls*. The existing `cache` component sits
on the retrieval branch (it shields the vector DB, not the model), so every design
that hits the LLM wall has exactly one shape of answer: buy more capacity.

Real agent platforms have a third lever: a **semantic cache** (GPTCache-style,
Redis-with-vectors, gateway response caching) that answers repeated/similar
questions without invoking the model. Adding it to the palette gives cost/capacity
designs more than one correct solution — a prerequisite for the future challenges
module having interesting answers, and an honest, widely deployed pattern worth
teaching on its own.

## Goals

- New palette component **Semantic Cache**: sits in front of the LLM path; a hit is
  answered locally, only misses continue to the gateway/model.
- Honest defaults: semantic hit rates are **modest** (nothing like a key-value
  cache's 80%) — default 25%, editable.
- One new example preset showing the fleet-shrinking effect.

## Non-goals

- No challenge/scoring content.
- No modeling of embedding-lookup costs, staleness, or hit-quality risk beyond a
  stated hint (the classic semantic-cache failure — serving a *wrong* similar
  answer — is a caveat in text, not a model dimension).
- The existing `cache` kind is untouched.

## User-facing behavior

- Palette gains "Semantic Cache" with bilingual description, ℹ️ explainer, scaling
  vocabulary, and cloud examples — same treatment as every kind (specs 100/104).
- Wired `backend → semanticCache → aiGateway/llm`, the node shows its hit ratio;
  downstream LLM arrivals drop by the hit fraction.
- Examples dropdown gains a preset demonstrating "same load, smaller fleet".

## Acceptance criteria

1. **AC1 — new kind, full metadata** — `semanticCache` exists on the palette with
   label, description, ℹ️ info, scaling vocabulary (units/size meaning) and cloud
   examples for azure/aws/gcp, all bilingual where translatable (§4, §5).
2. **AC2 — miss-only forwarding** — In the model, a semantic-cache node forwards
   only `1 − hitRatio` of its throughput downstream; default hit ratio 0.25,
   distinct from `cache`'s 0.8; editable per node like `cache`'s.
3. **AC3 — shields the model** — Pinned numerically: `backend →
   semanticCache(0.25) → llm` reduces LLM arriving by 25% vs the same design
   without the cache (and cpr composes: fan-out applies to the calls that miss).
4. **AC4 — example preset** — A new example ("Semantic cache shields the fleet" /
   "Cache semântico protege a frota") loads a design where adding the cache takes
   the LLM tier from critical/warning to healthy at the same user load; pinned in
   tests; description bilingual and truthful under the current model.
5. **AC5 — honesty hint** — The ℹ️ states the modest-hit-rate reality and the
   wrong-similar-answer caveat, en + pt.

## Protocol / stage impact

None — frontend-only Arena change. (The simulator canvas/stations are untouched;
this is an Arena palette kind, not a station.)

## Open questions (clarify before planning)

- [x] Own kind or a `cache` variant? → **Own kind** — different default hit ratio,
  different placement (LLM branch), different explainer; sharing the forwarding
  mechanic is an implementation detail.
- [x] Default hit ratio? → **0.25** (semantic caches dedupe paraphrases, not
  sessions; >50% claims are marketing). Editable 0–100% like `cache`.
- [x] Where does `callsPerRequest` sit relative to it? → The cache dedupes **user
  turns** before the agent runs, so it sits before the gateway and the gateway/LLM
  cpr applies to *misses* — which the model's topological order already produces
  naturally (multiplier applies at the downstream node's inbound).

## Out of scope / deferred

Hit-quality modeling, embedding cost of the cache lookup itself, TTL/staleness,
challenge content using it.
