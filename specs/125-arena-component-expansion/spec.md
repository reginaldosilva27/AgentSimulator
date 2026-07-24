# Spec: Arena — component expansion (worker, guardrails, external API, object store, memory store)

| | |
|---|---|
| **ID** | 125-arena-component-expansion |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-07-23 |

## Problem / motivation

A hands-on review of the competing System Design Playground (2026-07-23, see the
competitor-analysis memory) showed a 40-component palette against our 15. Most of
their extras are decorative (observability/network boxes with no simulation
effect), but the comparison exposed **five honest gaps** in the Arena's own story —
components that agent platforms really run, that our quantitative model can carry
with defensible numbers, and that unlock design lessons the current palette cannot
teach:

1. **The queue has no consumer.** We ship a `queue` kind, but nothing drains it —
   and worse, today work placed behind a queue still counts toward the user-facing
   turn latency, which is exactly backwards: the entire point of a queue is that
   the caller does *not* wait. There is no way to model async pipelines (batch
   ingestion, embedding jobs, notification fan-out) honestly.
2. **Guardrails are absent.** The Simulator's real agent has a guardrails prompt
   layer, but the Arena — the tool that teaches *capacity* — cannot show that
   moderation is a per-call tax on latency with its own quota wall.
3. **Every dependency is scalable.** All current kinds scale with replicas/size.
   Real agents call third-party APIs (via tools) whose rate limits **you cannot
   buy your way out of** — a fundamentally different kind of wall than the LLM
   quota, because the escape hatches (cache, backoff, provider tier) are
   architectural, not sliders.
4. **No blob tier.** The Simulator has a real Object Storage station (034/040);
   the Arena cannot represent attachments/artifacts, nor teach "blobs don't
   belong in the database".
5. **Memory is invisible.** Long-term agent memory (a read at turn start + a
   write at turn end, *every turn*) is a real, distinct load pattern the Arena
   cannot express — even though the Simulator visualizes exactly this distinction
   (039).

## Goals

- Five new palette kinds — **Worker**, **Guardrails**, **3rd-Party API**,
  **Object Store**, **Memory Store** — each with the full metadata treatment every
  kind gets (bilingual label/description/ℹ️ info, cloud examples, scaling
  vocabulary, teaching benchmark with stated assumptions).
- **Async honesty:** work behind a queue leaves the user-facing turn path. The
  queue decouples; an overloaded consumer grows a backlog instead of shedding
  user requests.
- **Non-scalable honesty:** the 3rd-party API cannot be scaled by the designer —
  its capacity is the provider's, and the UI says so.
- At least one new example preset that uses the new kinds and states its lesson
  via the 119 callout mechanism.

## Non-goals

- **No failure/chaos injection** (that is its own future spec; the competitor's
  chaos module is noted in the roadmap memory).
- **No cost-readout change**: the cost panel stays LLM-only; the guardrails
  per-call price is stated in its ℹ️ hint, not added to the bill.
- **No further competitor kinds**: serverless (cold starts), NoSQL, Search,
  Kafka-style streams, and all decorative observability/network boxes are
  explicitly deferred (see "Out of scope").
- No changes to the Simulator canvas, stations, or the event protocol — the Arena
  remains a pure frontend model (100's honesty rule: no `Stage`, no `TraceEvent`).

## User-facing behavior

- The palette offers the five new components; dragging/clicking adds them wired
  by the existing 107 auto-wire rules. Each shows its benchmark readouts
  (util %, latency, shed) like every other node.
- A node fed **only through a queue** renders an "async" cue, its excess load
  reads as **backlog** (not 429s), and the e2e turn readout visibly ignores its
  latency — enqueueing is what the user waits for, not the job.
- **Guardrails** sits on the model path and defaults to 2 checks per call
  (input + output moderation), editable like other fan-outs (103).
- **3rd-Party API** offers no replicas/size controls (like the client); its ℹ️
  explains the honest escapes: cache in front, call it less, or negotiate a
  higher provider tier.
- **Memory Store** defaults to 2 calls per turn (read at start, write at end),
  editable.
- All new prose ships `en` + `pt` (constitution §4); cloud examples fill
  azure/aws/gcp (§5 vocabulary).

## Acceptance criteria

1. **AC1 — five kinds, full metadata** — `worker`, `guardrails`, `externalApi`,
   `objectStore`, `memoryStore` exist as `ArenaKind`s with: benchmark, bilingual
   `label`/`description`/`info`, all-three cloud examples, and scaling metadata;
   the palette lists all five.
2. **AC2 — async branch leaves the turn path** — Given `backend → queue → worker`,
   the worker's latency does **not** contribute to any upstream node's turn-path
   latency (the queue's own enqueue latency still does). A design where the
   worker's service time changes shows **no change** in e2e turn latency.
3. **AC3 — backlog, not shed** — A node whose only inbound path crosses a queue
   is flagged async in the metrics; when its inbound exceeds capacity the excess
   is reported as backlog growth (distinct wording from the 429/shed treatment),
   and an async node's saturation does **not** null the held-in-flight figure of
   upstream orchestrators (113) — callers are not holding its streams.
4. **AC4 — guardrails is a pass-through toll** — A `guardrails` node forwards
   100% of its throughput downstream (no hit ratio), participates in the
   turn-path latency, and defaults to `callsPerRequest = 2` (editable — it is in
   the configurable-fan-out set).
5. **AC5 — the external API cannot be scaled** — `externalApi` exposes no
   replicas/size scaling (same UI treatment as `client`); its capacity is the
   fixed stated benchmark; overload sheds honestly (the provider's 429s).
6. **AC6 — memory store models the turn's read+write** — `memoryStore` defaults
   to `callsPerRequest = 2` and is in the configurable set; with 1 000 turns/s
   arriving at the backend, the memory store sees 2 000 calls/s.
7. **AC7 — example preset** — A new example ("Guardrails + async ingestion" /
   "Guardrails + ingestão assíncrona") loads from the Examples dropdown, uses at
   least `guardrails`, `queue → worker`, and `memoryStore`, satisfies its stated
   load, and ships 119-style bilingual callouts explaining the two lessons
   (moderation tax; queue decoupling).
8. **AC8 — auto-arrange & readouts compose** — The 124 auto-arrange and the node
   readouts render the new kinds without special-casing (no unknown-kind
   fallbacks in the existing exhaustive maps; `tsc` stays green).

## Protocol / stage impact

- New/changed `Stage`(s): **none** — the Arena is a pure frontend model (100).
- Mirror in `frontend/src/types/events.ts`: n/a
- Station it maps to in `stations.ts`: n/a (Arena kinds are not Simulator stations)

## Open questions (clarify before planning)

*(all resolved 2026-07-23 with the user during the competitor-analysis review)*

- [x] Which competitor components enter? → The five above; serverless and the
  rest explicitly deferred (user approved the recommended list).
- [x] Does guardrails cost enter the bill? → No; hint-only (non-goal), the cost
  readout stays LLM-only until a dedicated cost spec.
- [x] Is the external API's limit editable? → Not in v1; fixed stated benchmark
  (the lesson is that it is not your knob). Revisit if a preset needs it.

## Out of scope / deferred

- **Serverless** (cold-start bimodal latency) — interesting but niche; own spec.
- **NoSQL / Search** — possible future variants of `appDb`/`vectorDb`.
- **Kafka / Pub/Sub / Event Stream** — a second messaging flavor only earns its
  place when the model supports fan-out to multiple consumers.
- **Observability & network boxes** (metrics/logs/tracing/VPC/…) — decorative in
  the competitor; would violate §3 honesty here.
- **Failure injection / chaos** — the competitor's strongest module; separate
  future spec (see roadmap memory).
- Guardrails cost in the bill; editable external-API tiers.
