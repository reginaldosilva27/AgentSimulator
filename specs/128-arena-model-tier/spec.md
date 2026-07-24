# Spec: Arena model tier (nano / mini / standard / large)

| | |
|---|---|
| **ID** | 128-arena-model-tier |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-24 |

## Problem / motivation

The Arena models the LLM as a single **gpt-4.1-mini class** endpoint. Every LLM
number is anchored to that one model: the per-call latency slopes (127 —
`LLM_DECODE_MS_PER_TOKEN = 8`, i.e. ~125 tok/s), the cost anchor (117 —
`$0.4 / $1.6` per Mtok) and the TPM quota. The code says so explicitly: *"A single
blended figure (no per-model variance yet — the Arena has no model selector)."*

But **which model you pick is one of the biggest production levers there is** —
it trades latency × cost × quality. When a user looks at a heavy LLM node (e.g.
21 s per call, $2.8k/h usage) they have no way to ask the obvious question:
*"what if I run a smaller/faster model here?"* The Arena can't tell that story yet.

This adds a **model tier** knob to the LLM node — nano / mini / standard / large,
each anchored to a **real OpenAI SKU** — that scales the per-call latency and the
per-call cost relative to the current mini anchor. It composes with (and is
orthogonal to) the existing "instance size" knob, which is a *quota/capacity*
tier (PTU/TPM), not a model.

## Goals

- Let the user pick a **model tier** per LLM node and see the latency + cost move.
- Anchor each tier to a **real OpenAI model SKU** (proper noun, honest) — never an
  invented parameter count (§3 honesty; OpenAI doesn't publish param counts).
- Keep the two axes clearly distinct: **model tier** (which model → speed/cost/
  quality) vs **instance size** (how much quota/PTU you provision → capacity).
- Preserve today's behavior **byte-for-byte** when the tier is `mini` (the anchor),
  so every existing preset/example and saved design is unchanged.
- Tell the honest tradeoff, including the one the Arena does **not** measure.

## Non-goals

- **Modeling answer quality.** The Arena measures capacity/latency/cost, not
  answer correctness. "Smaller = worse reasoning" is a **callout**, never a score.
- Changing the deployment's **capacity** (calls/s). Capacity stays a function of
  instance size + region + call shape (TPM quota). Model tier moves latency + cost
  only (see AC5 — orthogonality). Per-tier quota differences are deferred.
- Real parameter counts / open-model sizing (7B/70B…). Deferred; would only be
  honest for a local/Ollama-style provider, not for OpenAI.
- Any backend / event-protocol change. The Arena is a **frontend-only pure model**
  (spec 100) — no `Stage`, no `TraceEvent`.

## User-facing behavior

- The LLM node's **ScalePanel** gains a **"Model tier"** control (a 4-way segmented
  control, same shape as the existing "Instance size" one), with tiers
  **Nano · Mini · Standard · Large**. Default is **Mini**.
- Under each tier sits its **real SKU** as a non-translated sublabel
  (e.g. `gpt-4.1-nano`, `gpt-4.1-mini`, `gpt-4.1`, `gpt-5`).
- An ℹ️ hint (bilingual en/pt) explains the tradeoff **and** states plainly that
  the Arena models speed & cost here, **not answer quality** — a smaller model is
  cheaper and faster but may reason worse, which this sandbox does not score.
- Changing the tier updates the node readout (Latency), the header **End-to-end
  latency** and the **LLM cost** immediately.
- The chosen tier is saved with the design (localStorage) and survives reload.
- All new prose ships in **en + pt** (§4).

## Acceptance criteria

1. **AC1 — tier exists + default** — An LLM node carries a `modelTier` of
   `nano | mini | standard | large`. A node/design created without one (existing
   saved designs, presets) resolves to `mini`.
2. **AC2 — mini is byte-for-byte** — For an LLM node at `mini`, the computed
   per-call base latency and per-call cost equal **exactly** today's values (the
   `mini` multiplier is `1.0`). Every existing preset/example metric is unchanged.
3. **AC3 — latency monotonic** — For a fixed call shape, per-call base latency is
   strictly increasing across tiers: `nano < mini < standard < large`.
4. **AC4 — cost monotonic** — For a fixed call shape, per-call cost is strictly
   increasing across tiers: `nano < mini < standard < large`.
5. **AC5 — orthogonal to capacity** — A node's calls/s **capacity** (TPM quota) is
   identical across all four tiers for the same instance size + region + shape;
   model tier changes only latency + cost.
6. **AC6 — ScalePanel control** — The LLM ScalePanel renders a "Model tier" control
   with the four tiers, distinct from the "Instance size" control, each with its
   real SKU sublabel and a bilingual (en/pt) hint that includes the "not answer
   quality" honesty note.
7. **AC7 — persistence + live readout** — Selecting a tier persists with the design
   to localStorage, survives reload, and immediately updates the node's Latency
   readout, the header End-to-end latency and the LLM cost.
8. **AC8 — real SKU labels, no invented params** — Each tier maps to a real OpenAI
   SKU string surfaced in the UI; no parameter-count / size-in-billions value is
   shown anywhere (§3).

## Protocol / stage impact

- New/changed `Stage`(s): **none** — Arena is a frontend-only pure model (spec 100).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (Arena is not part of the
  station/trace pipeline).

## Open questions (clarify before planning)

_All resolved (see decisions below) — status advanced to `clarified`._

**Resolved decisions:**

1. **Per-node, not global.** `modelTier` lives on each LLM node (symmetric with the
   existing per-node `instanceSize`), so a fleet can mix a cheap router model and a
   big reasoning model. (The 117 *call shape* stays global — it's the workload, not
   the model.)
2. **Tiers → SKUs:** `nano → gpt-4.1-nano`, `mini → gpt-4.1-mini` (the anchor),
   `standard → gpt-4.1`, `large → gpt-5`. SKU strings are proper nouns, not
   translated.
3. **Capacity unchanged by tier** (AC5). Model tier moves latency + cost only;
   per-tier quota is deferred. Stated as an explicit teaching simplification.
4. **Multipliers anchored to real prices/speeds**, `mini = 1.0` on both axes.
   Concrete proposed values live in `plan.md` (to fine-tune during implementation);
   the spec only pins the **structure** (mini anchor + monotonicity), so tests
   tolerate tuning.

## Out of scope / deferred

- Per-tier **quota/capacity** differences (different TPM ceilings per model).
- Answer-quality modeling / a quality score.
- Open-model parameter-count sizing (Ollama/local), which would need its own anchor.
- Auto-routing simple calls to nano and hard calls to large (a model-router node).
