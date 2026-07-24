# 🗺️ Roadmap — what's not implemented yet

🌐 **English** · [Português](#-roadmap--o-que-ainda-não-está-implementado)

This is the **contributor TODO list** for the AI Agent Simulator. Everything below is **visible on
the canvas as a "coming soon" preview tile** (Intermediate / Advanced rungs of the
[maturity ladder](../README.md#-the-maturity-ladder--simple--intermediate--advanced)) or is a
**cross-cutting seam** the code already keeps open — none of it is wired up to actually run yet.

Honesty first (constitution §3, *everything is real*): the preview tiles are clearly labelled and
**do not fake a run**. Sending is gated by `canSend(scenario)` on any rung whose real nodes have not
shipped. Each item here is therefore the *seed of its own spec*.

> **How to take one on.** Every behavior change in this project is **spec-first and test-first**
> (see [`.specify/constitution.md`](../.specify/constitution.md) §9–§10 and
> [`docs/development-workflow.md`](development-workflow.md)). Copy `specs/_template/` to
> `specs/NNN-feature-name/`, write `spec.md` → `plan.md` → `tasks.md`, then implement
> **red → green → refactor**. Pick an item, open a draft spec, and open an issue / PR — small
> targeted PRs are very welcome.

## Status legend

| Symbol | Meaning |
|---|---|
| 🟡 | Preview tile on the canvas — visual only, no backend yet |
| 🏷️ | Label-only marker — the node renders with a planned name but the runtime is unchanged |
| 🔧 | Cross-cutting seam in the code (no canvas tile) — ready for a real implementation |

---

## 🧭 Organizing model — rungs × tracks

> The maturity ladder is **one axis** (*"how production-ready?"*). The content below is genuinely
> **two-dimensional**, so we cross the rung with a **Track** (theme). A Track answers *"which
> subsystem am I studying?"* and narrows the preview clusters within a rung — so the Advanced rung
> stops being a wall of tiles. Tracks are a **client-side view filter only** (they never change
> execution); the axis itself ships as [`specs/059-scenario-tracks/`](../specs/059-scenario-tracks/).
> **"More scenarios" means add a track, not a rung** — the rungs stay fixed at three.

| Track | `id` | Theme |
|---|---|---|
| **RAG Quality** | `rag` | retrieval / data-plane — chunking, metadata, rerank, hybrid, MMR, self-query, compression, multi-vector, query expansion, metrics |
| **Agent Design** | `agent` | agent sophistication — ReAct → DeepAgents → multi-agent orchestration |
| **AI-Ops** | `aiops` | run it in production — gateway, semantic cache, eval runner, observability, router, multi-provider |
| **Security & Trust** | `security` | guardrails, secrets/DLP, supply chain, tool sandbox, identity/OIDC, jailbreak, auth/rate-limit |
| **Scale & Infra** | `scale` | multi-replica, shared state, workload identity |
| **Network & Edge** | `network` | network edge (reverse proxy · TLS · LB) ✅ · CDN · WAF · DNS · API gateway · internal mesh |

**The matrix — every roadmap item by `{rung × track}`** (✅ shipped · 🟡 preview · 🏷️ label · 🔧 seam):

| Rung ↓ / Track → | RAG Quality | Agent Design | AI-Ops | Security & Trust | Scale & Infra |
|---|---|---|---|---|---|
| **Simple** | embedding + vector RAG ✅ | ReAct agent ✅ | — | auth stub 🔧 | single-instance ✅ |
| **Intermediate** | chunking ✅ · metadata ✅ · rerank ✅ · hybrid ✅ · MMR 🟡 · self-query 🟡 · compression 🟡 · multi-vector 🟡 · query expansion 🟡 · metrics ✅ | DeepAgents ✅ · summarization 🟡 · honest token/cost ✅ | — | — | — |
| **Advanced** | RAGAS (full) → Eval | multi-agent: researcher/coder/critic 🏷️ | gateway 🟡 · cache 🟡 · eval/RAGAS 🟡 · observability 🟡 · model router 🔧 · multi-provider ✅ | guardrails 🟡 · secrets/DLP 🔧 · supply chain 🔧 · sandbox 🔧 · identity 🔧 · jailbreak 🔧 · auth/rate-limit 🔧 | multi-replica 🔧 |

The sections below are grouped by rung; within the Advanced rung each `###` is annotated with its
**Track** so the matrix and the prose stay in sync.

---

## ✅ Network & Edge track — first node SHIPPED (084-network-edge)

The **Network & Edge** track opens the classic distributed-systems axis around the agent (the
production network in front of and between the services). Its first node is **done**:

### ✅ Network edge (reverse proxy · TLS · LB) — SHIPPED (084-network-edge)
- **Status.** Done. A real `nginx` reverse proxy fronts the backend in `docker-compose`
  (`infra/nginx/nginx.conf`): it terminates TLS, load-balances and injects the forwarded headers
  (`X-Forwarded-*`, `X-Request-Id`). The backend emits one `edge` `Stage` from
  `backend/app/edge.py::read_edge` — reporting only what the headers prove and honestly showing
  `proxied=false` with no proxy in front. `ChatRequest.edge: bool = False` is opt-in at the protocol
  so an API-direct call is byte-for-byte; `edge` is a default-on Build toggle.
  **Revised (085):** the edge has **no node/tier of its own** — the `edge` stage maps to the
  `backend` station, and its chain (DNS · CDN · TLS/LB · WAF · API GW, only TLS/LB real) +
  forwarded headers render in the **`frontend→backend` hop detail** (click the arrow), not a box.
### ✅ Network layer chain (DNS · CDN · TLS/LB · WAF · API GW) — SHIPPED (088-network-layer)
- **Status.** Done (frontend + backend green; the five appliance containers need a live
  `docker compose up` to validate header injection + the real WAF 403). The five preview chain
  segments graduated to **five real, separately-deployed appliance containers** the request truly
  transits — `coredns` · `varnish` · `owasp/modsecurity-crs` · `haproxy` · `kong` — each emitting a
  new `Stage` (`dns`/`cdn`/`waf`/`lb`/`apigw`) from forwarded evidence (`backend/app/network.py`,
  the `edge.py` honesty seam). They are a single **advanced** Build component ("Network"/"Redes"),
  **reversing 084's "no box"** — the chain now renders as five stations in a public-zone `edge` tier
  between the client and the API. The containers come up with `docker compose up`; the toggle is
  **visualization/emission only** (no `docker.sock`, no lifecycle), gated on `NETWORK_CHAIN=1`
  (`/api/config.network_available`) so a bare `uvicorn` run disables it.
- **What's still open (later specs).** The interactive "send a blocked request" WAF demo and the
  rate-limit (burst → 429) demo; **internal service mesh / mTLS depth** (subnets, NSG, private
  endpoints); real TLS with a mounted cert. The 058 GitHub Pages demo is backend-less so the chain
  is naturally absent there (the toggle is disabled, as designed).

- **What was still open under 084, now closed by 088.** **CDN**, **WAF**, **DNS** and **API gateway**
  are real nodes. Remaining: **internal service mesh / mTLS depth**. Real TLS with a mounted cert (the
  nginx.conf has the commented `listen 8443 ssl` block ready). The 058 GitHub Pages demo fixtures
  don't include `edge`/network events — old fixtures render those stations idle (graceful fallback).

---

## 🟡 Intermediate rung — RAG quality & "DeepAgents"

**Tracks here:** `rag` (RAG Quality) · `agent` (Agent Design). The Intermediate rung is the
*RAG-quality + honest-cost* tier — the home of the whole retrieval module plus single-agent
DeepAgents. Today its scenario is selectable, the topology renders, but the new nodes are visual
previews.

### ✅ DeepAgents runtime — SHIPPED (057-deepagents-runtime)
- **Status.** Done. On the **Intermediate** rung the `DeepAgents` relabel is now backed by a
  **real, model-driven runtime** — planning, a virtual file system and sub-agent delegation are
  **tools the agent elects inside its ReAct loop** (not a scripted preamble; a greeting elects
  none of them). Simple never sees the tools (byte-for-byte).
- **What shipped — the four pillars, hand-built.** Six native tools (`agent/tools.py`, gated by
  `with_deepagents` — Intermediate and not RAGLESS) with handlers in
  `backend/app/agent/deepagents.py`: **(1) Planning** — `write_todos` maintains a todo list with
  per-item *status* (`agent.plan`); **(2) Virtual file system** — `write_file`/`read_file`/
  `edit_file`/`ls` over `AgentState["vfs"]` (`agent.fs.write`/`agent.fs.read`); **(3) Sub-agents** —
  `task` spawns a **real bounded sub-agent** (`run_subagent`: own prompt + tools + thread + ReAct
  loop, context quarantine — only its result returns) (`agent.delegate`); **(4) Detailed prompt** —
  `DEEPAGENTS_PROMPT` on the role layer. Four new `Stage`s mapped to the `agent` station + `reason`
  phase (§1, §6); the Agent drill-in gains **Plan** (with status badges) and **Virtual file system**
  panels + the sub-agent tool-trail (pure projection in `frontend/src/lib/deepagents.ts`); all prose
  bilingual (EN + PT). *Deferred:* the library's summarization middleware + the Advanced
  researcher/coder/critic trio. See [`specs/057-deepagents-runtime/`](../specs/057-deepagents-runtime/).
- **What's still open (later specs).** The Advanced-rung **DeepAgents + Multi-agents**
  orchestration (the full researcher/coder/critic trio under an orchestrator) — see the Advanced
  section below — and persisting the virtual FS across turns.

### ✅ Reranker (cross-encoder) — SHIPPED (054-rag-block-expansion)
- **Status.** Done. Reranking is a **real query-time sub-stage of the `rag` (Vector DB) station**
  (`rag.rerank`, no separate tile), and the Intermediate rung now executes.
- **What shipped.** A real reranker call between `rag.search` and `rag.retrieve` (new `rag.rerank`
  `Stage`), using a **local FlashRank cross-encoder** (`backend/app/rag/reranker.py`; ONNX, no
  torch, no key, deterministic). Retrieval fetches a wider pool (`rerank_fetch_k`), re-scores, and
  trims to `top_k`; the Simple rung never reranks (byte-for-byte). The stage is mapped in
  `STAGE_TO_STATION`/`STAGE_TO_PHASE`, with a readout + inspector rank-movement detail and the
  `RagDetail` "open full view" drill-in (Chunking → Embedding → Retrieval → Reranking), all
  bilingual (EN + PT). See [`specs/054-rag-block-expansion/`](../specs/054-rag-block-expansion/).
- **Course-map note (M2U3.2 — Bi-Encoders vs. Cross-Encoders).** The shipped reranker is the
  cross-encoder half. Still open as small enrichment specs: a **bi-encoder vs. cross-encoder**
  side-by-side in `RagDetail` (the *why is a second pass worth the latency?* explainer), a **latency
  readout** on the rerank sub-stage, and a **Cohere ReRank** (hosted) provider behind the same
  `reranker.py` seam as an alternative to local FlashRank.

### ✅ Hybrid search (BM25 + vector) — SHIPPED (070-hybrid-search)
- **Status.** Done. Hybrid search is a **real query-time sub-stage of the `rag` (Vector DB)
  station** (`rag.hybrid`, no separate tile — the 060 `comingSoon` `hybrid` tile was removed/
  absorbed, like the reranker). It **composes with the reranker** (fuse → rerank → retrieve).
- **What shipped.** A real sparse **BM25 lane** (`backend/app/rag/hybrid.py`; local `rank_bm25`,
  pure-python, deterministic, no key) runs alongside the dense vector search and the two ranked
  lists are fused with **Reciprocal Rank Fusion (RRF)** (`Σ 1/(rrf_k + rank)`, `rrf_k=60`). BM25
  ranks the **whole scoped corpus**, so a chunk the dense search missed can enter via an exact-term
  match. New `Stage rag.hybrid` (mapped to the `rag` station + `retrieve` phase), request input
  `hybrid: bool` (Vector-RAG only, cleared on RAGLESS). The Vector DB tile shows a `BM25+vector ·
  fused N` readout; the RAG drill-in gains a **Vector | BM25 | → RRF** fusion table (per chunk:
  vector rank, BM25 rank, RRF score, ↑ when BM25 lifted it), and the Inspector shows the fusion.
  Off / Simple is byte-for-byte (no `rag.hybrid`). All prose bilingual (en + pt). See
  [`specs/070-hybrid-search/`](../specs/070-hybrid-search/).
- **What's still open (later specs).** **Hybrid search lacks a captured fixture in the mocked
  GitHub Pages demo (058)** — the live app fuses, but the demo can't replay a hybrid run until its
  trace is captured (see the demo note in the deferred list). Weighted / learned fusion and a
  user-facing `rrf_k` slider are also deferred.

### 🟡 Summarization (context compaction) — *track: `agent`*
- **Where it shows up.** A **`comingSoon` preview tile** (`summarization`) on the Intermediate rung,
  under the DeepAgents node in the Agent tier, tagged track `agent`
  ([060-intermediate-preview-tiles](../specs/060-intermediate-preview-tiles/)). It is the rung's
  Agent-Design preview (pairs with the RAG cluster to light the Intermediate track selector).
- **What it is.** The one DeepAgents pillar 057 deferred: compact the running message thread when it
  grows too long — summarize old turns so the agent keeps context without blowing the token budget.
- **What a spec would add.** A real token-threshold summarization middleware in the agent loop (the
  library's summarization step), surfaced in the Agent drill-in's memory panel.

### 🟡 Advanced retrieval techniques (MMR · self-query · compression · multi-vector · query expansion)

The *RAG-quality* upgrades that sit inside (or just before/after) the `rag` station — the retrieval
half of the Intermediate rung, straight from the course map (M2U3.1, *Advanced Retrieval
Techniques*). **Two members already exist:** the cross-encoder **reranker** (✅ 054, shipped) and
**hybrid search** (🟡 above). The five below complete the family; each is the seed of its own spec,
and each would extend the `RagDetail` drill-in (Chunking → Embedding → Retrieval → Reranking → …)
with one more honest, inspectable step. None needs a cloud map — they live algorithmically inside
the `rag` station (library-level, e.g. LangChain), not a new tier.

- **Maximal Marginal Relevance (MMR) — diversity-aware retrieval.** Re-pick the top-k to balance
  *relevance to the query* against *novelty vs. already-picked chunks*, so the context window isn't
  filled with near-duplicates. A spec adds an `mmr` toggle + `lambda` on the retriever, a
  `rag.diversify` sub-stage (sibling of `rag.rerank`), and a before/after set view in the inspector.
- **Self-querying — natural language → metadata filter.** An LLM step that parses the user query
  into a structured metadata filter (`author = …`, `year > …`) **plus** the semantic query, so
  retrieval is *filtered*, not just ranked. Depends on the **Metadata** item below. A spec adds a
  `rag.self_query` sub-stage showing the extracted filter and the LLM call that produced it.
- **Contextual compression — filter/distil before prompting.** After retrieval, compress each chunk
  (extractive or LLM-based) down to the sentences that actually answer the query, cutting tokens and
  noise before the generate step. A spec adds a `rag.compress` sub-stage with a tokens-saved readout
  (ties into spec [011-token-cost](../specs/011-token-cost/) and the context budget 036).
- **Multi-vector retrieval — document-level semantics.** Index multiple vectors per document (e.g. a
  summary vector + child-chunk vectors, or hypothetical-question vectors) and retrieve parents from
  child hits. A spec adds the multi-vector index option to `ingest.py` and a `rag.search` readout
  that shows the child → parent expansion. Pairs naturally with **hierarchical chunking** below.
- **Query expansion & reformulation.** Rewrite/expand the user query (synonyms, HyDE, multi-query
  fan-out) before embedding, then fuse the result sets. A spec adds a `rag.expand` sub-stage listing
  the generated query variants and the fusion (overlaps with hybrid search's RRF fusion).

### ✅ Chunking strategies (ingestion-time) — SHIPPED (072-chunking-strategies)

- **What it is.** The course's M2U3.3 chunking ladder: **fixed size + token limits**, **overlap for
  context preservation**, **semantic chunking** (split on meaning, not character count) and
  **recursive/hierarchical chunking**. Chunking quality is upstream of every retrieval metric.
- **What shipped.** Configurable ingestion chunking (`backend/app/rag/chunking.py` — fixed /
  recursive / semantic / agentic) with per-strategy knobs (081) and a preview playground; the
  strategy + chunk stats surface in the Chunking panel of `RagDetail`, and re-ingest from ⚙️ Settings
  reuses the reindex path. See also 083 (chunk table) and 087 (overlap highlight).

### ✅ Metadata as a first-class citizen — SHIPPED (073-metadata-first-class)

- **What it is.** M2U3.3's metadata story: attach useful metadata to each chunk (source, section,
  author, date, type), **extract** metadata at ingest, **filter** on it at retrieval (the seam
  self-querying builds on), and use it for **evaluation/debugging** (*why did this chunk get
  retrieved?*).
- **What shipped.** Rich chunk metadata at ingest, a `where=`/`filters=` filter path in
  `retriever.py`, and "why retrieved" chips on each retrieved chunk in the Vector DB inspector +
  `RagDetail`. The self-query retriever (still 🟡 above) reuses this filter seam.

### ✅ Retrieval-quality metrics (Precision@k · MRR) — SHIPPED (071-retrieval-metrics)

- **What it is.** M2U3.1 §4's retrieval-quality measures: **Precision@k · Recall@k · MRR** (was the
  relevant chunk in the top-k, and how high?), the LLM-as-judge vs. manual-ground-truth trade-off,
  and where **RAGAS** fits. These quantify whether reranking / hybrid / MMR actually helped.
- **What shipped.** A labelled golden set + a metrics computation over `rag.retrieve`, with a readout
  showing Precision@k / Recall@k / MRR for the current run (so the *why rerank?* claim is measured,
  not asserted). The full **RAGAS** answer-quality suite stays in the Advanced **Eval Runner** (🟡).

---

## 🟡 Advanced rung — Multi-agents & AI-Ops

**Tracks here:** `agent` (multi-agent) · `aiops` · `security` · `scale`. The Advanced rung is the
*how-agents-live-in-production* tier. It adds a whole new **AI-Ops** tier (see `stations.ts` →
`tiers` → `aiops`) with five preview nodes, plus the multi-agent worker tree under the orchestrator.
With four tracks, this rung is where [`059-scenario-tracks`](../specs/059-scenario-tracks/) earns
its keep — pick a track to browse one cluster at a time instead of the whole wall. The
`security`-track items live in the **cross-cutting seams** section below (they have no canvas tile
yet); the matrix above is the authoritative grouping.

### 🏷️ Multi-agent orchestration (Researcher / Coder / Critic) — *track: `agent`*
- **Where it shows up.** `stations.ts` → stations `researcher`, `coder`, `critic` under the `agent`
  tier; `AGENT_SCENARIO_LABEL.advanced` renames the `agent` node to **`DeepAgents + Multi-agents`**
  (`pt`: `DeepAgentes + Multiagentes`). Hop fan-out (`agent → researcher | coder | critic`) already
  declared but `scenarios: ["advanced"]` and the targets are `comingSoon`. Glossary key
  `Multi-agent` in `strings.ts` — flagged *"Planned — not yet implemented."*
- **What it is.** An **orchestrator** agent that delegates focused tasks to **specialized
  sub-agents** instead of running one monolithic loop:
  - **Researcher** — runs retrieval / tool lookups, returns a digest.
  - **Coder** — does the work (writes code, calls tools, transforms data) under the plan.
  - **Critic** — reviews the draft answer for errors and gaps before it ships.
- **What a spec would add.**
  - A real orchestrator → sub-agent runtime in `backend/app/agent/` (each sub-agent gets its own
    bounded loop and tool subset).
  - Per-sub-agent `Stage`s (`agent.delegate`, `agent.subagent.*`) and mapping in
    `STAGE_TO_STATION` / `STAGE_TO_PHASE`.
  - Per-sub-agent activation in the canvas (the worker that's currently running highlights), and an
    Agent-detail tab that shows the delegation chain.
  - Tests proving delegation actually happens (e.g. a coding question routes to the Coder).

### 🟡 LLM Gateway (router · fallback · budget) — *track: `aiops`*
- **Where it shows up.** `stations.ts` → station `gateway` (tier `aiops`, `comingSoon: true`).
- **What it is.** A single egress for every model call — handles routing across providers/models,
  retries, fallback, and budget caps. The natural seam for **multi-provider** (see the
  cross-cutting section below).
- **Cloud examples.** Azure API Management (AI gateway) · Bedrock + API Gateway · Apigee / Vertex
  endpoints.
- **What a spec would add.**
  - A real gateway in front of `LLMProvider.decide` / `stream_answer` that can route by policy
    (cost, latency, model capability) and fall back on failure.
  - New `Stage`s for `gateway.route` and `gateway.fallback`, surfaced on the inspector.
  - Budget caps enforced server-side; the cap and remaining budget visible on the gateway tile.

### 🟡 Guardrails (input / output safety) — *track: `security`*
- **Where it shows up.** `stations.ts` → station `guardrails` (tier `aiops`, `comingSoon: true`).
- **What it is.** Checks prompts and answers for **prompt injection, PII and unsafe content**
  before they pass. Two real call sites: pre-LLM on the prompt, post-LLM on the answer.
- **Cloud examples.** Azure AI Content Safety · Bedrock Guardrails · Model Armor.
- **What a spec would add.**
  - Real input + output checks (e.g. `presidio` for PII, an open guardrails SDK for the rest).
  - New `Stage`s `guard.input` / `guard.output` with **fail-fast on block** and a clear blocked-answer
    UX (this overlaps with spec [017-failure-injection](../specs/017-failure-injection/) — reuse it).
  - Tests that prove a known-malicious prompt is blocked and a clean prompt passes through.

### 🟡 Semantic Cache (prompt / embedding cache) — *track: `aiops`*
- **Where it shows up.** `stations.ts` → station `cache` (tier `aiops`, `comingSoon: true`).
- **What it is.** Returns a stored answer for **semantically near queries** — big latency and cost
  savings. Keyed by embedding similarity, not by exact prompt text.
- **Cloud examples.** Azure Cache for Redis · ElastiCache (Redis) · Memorystore (Redis).
- **What a spec would add.**
  - A real cache check before the LLM call and an upsert after; configurable similarity threshold.
  - New `Stage`s `cache.lookup` (hit / miss) and `cache.upsert`; the HUD shows cache-hit savings
    (ties in with spec [011-token-cost](../specs/011-token-cost/) and
    [018-cumulative-hud](../specs/018-cumulative-hud/)).
  - Honesty: a cached answer must be **labelled as cached** in the UI (it's not a fresh LLM call).

### 🟡 Eval Runner (RAGAS / LLM-as-judge) — *track: `aiops`*
- **Where it shows up.** `stations.ts` → station `eval` (tier `aiops`, `comingSoon: true`).
- **What it is.** Scores answers against a **golden set** (faithfulness, answer relevancy, retrieval
  NDCG) and gates regressions in CI — the production answer to *"did our change make things
  better?"*.
- **Cloud examples.** Azure AI Evaluation · Bedrock model evaluation · Vertex Gen AI evaluation.
- **What a spec would add.**
  - A golden set under `backend/app/data/` and a runner under `backend/app/eval/`.
  - An on-demand "Run evals" action in the UI that streams results to a new inspector panel.
  - A CI gate that fails the build when faithfulness / NDCG drop below thresholds (extends
    `ci.yml`).

### 🟡 Observability sink (LLM traces · OpenTelemetry GenAI) — *track: `aiops`*
- **Where it shows up.** `stations.ts` → station `observability` (tier `aiops`, `comingSoon: true`).
- **What it is.** Captures **every prompt, completion, token count, latency and cost** as
  structured LLM traces — the production version of what spec
  [038-execution-traces](../specs/038-execution-traces/) shows inline.
- **Cloud examples.** Azure Monitor / App Insights · CloudWatch / X-Ray · Cloud Trace / Monitoring.
- **What a spec would add.**
  - Real OTel GenAI export from the backend (the trace already exists in-memory via
    `app/trace.py` — this is the production sink, not a new trace model).
  - A toggle (env + UI) to enable export; the observability tile shows the configured sink.

---

## 🔧 Cross-cutting seams — not on the canvas

These don't have a tile of their own — they're seams the code already keeps open. Each is a
genuine TODO for production-readiness.

### ✅ Multi-provider LLM support — SHIPPED (074-ollama-provider · 075-ollama-embeddings)
- **What it is.** The `LLMProvider` ABC (`backend/app/llm/provider.py`) is a thin seam; a second
  concrete provider implements `decide`/`stream_answer` and surfaces real `TokenUsage`.
- **What shipped.** **Ollama** is a real per-agent provider (`OllamaProvider`, `agents.provider`
  column, `app_config` URL) — an agent can run entirely on a local model, no OpenAI key needed.
  Embeddings can also run on local Ollama (075), with an instance-global provider/model and
  auto-rebuild via the embedding signature. This **amended constitution §2** (no longer
  single-provider). The **LLM Gateway** (🟡 above) is the natural next orchestrator (routing +
  fallback between providers).

### 🔧 Model router (per-request model selection) — *track: `aiops`*
- **Where the seam would live.** Either inside the future **LLM Gateway** tile, or as a router
  step in `get_provider()` / inside `OpenAIProvider`. Today the model is fixed to `LLM_MODEL`
  (default `gpt-4o-mini`).
- **What it is.** Route per request to the cheapest model that can do the job (e.g.
  classification → `gpt-4o-mini`; long-form reasoning → `gpt-4o`; tool-heavy → `gpt-4o`). The
  agent declares the *task class*; the router picks the model.
- **What a spec would add.** A routing policy (declarative table or a small classifier), a new
  `gateway.route` `Stage` showing the chosen model + the reason, and per-model cost accounting
  on the HUD.

### 🔧 Authentication, sessions & rate limiting — *track: `security`*
- **Where it's flagged.** Honest caveats in `stations.ts` (`frontend` + `backend` stations'
  `whatBreaks`): *"this demo has no real authentication — it is a stub; production needs login,
  sessions and rate limiting before the agent ever runs."*
- **What's missing.** A real authn/z layer at the FastAPI ingress (e.g. JWT / session cookies),
  rate limiting per identity, and a real session store.
- **What a spec would add.** A login flow, a session middleware, a rate-limit middleware, and a
  test matrix proving 401 on missing credentials and 429 on burst.

### 🔧 Multi-replica / shared state — *track: `scale`*
- **Where it's flagged.** `database` station `whatBreaks` ("this demo is single-instance; the
  trace store is in-memory, lost on restart, not shared across replicas"). Reinforced by
  constitution §7 (*single-instance*).
- **What's missing.** The in-memory `TraceStore` (and the `MemorySaver` in the LangGraph agent)
  are deliberately process-local. Production needs a shared backend (Redis / managed SQL) and a
  pool in front of the relational DB.
- **What a spec would add.** A pluggable `TraceStore` (Redis impl), a `Checkpointer` swap for
  LangGraph, and a load-test demonstrating two replicas serving the same conversation.
- **Constitution check.** §7 currently mandates *single-instance* — just as multi-provider
  amended §2 (074), amend the constitution as part of the spec.

### 🔧 Security & trust — the *cybersecurity* seams

The five seams below are the security cluster the project owes to a production-ready posture.
The visible tile in this area today is **Guardrails** (🟡 AIOps above), which is scoped to *content
safety* (injection · PII · toxicity). Everything below is about **identity, secrets, the supply
chain and runtime isolation** — none of it is wired up yet, and each is its own future spec.

### 🔧 Secrets management & egress DLP — *track: `security`*
- **Where the seam would live.** Today secrets come from `backend/.env` (`OPENAI_API_KEY` read via
  `pydantic-settings`). There is no redaction on prompts, answers, traces or logs — `prompt_preview`
  in `backend/app/trace.py` and the `trace_events` SQLite table (spec
  [048-persist-traces](../specs/048-persist-traces/)) store raw text.
- **What's missing.**
  - A real secrets backend (cloud KMS / Vault / Key Vault / Secrets Manager / Secret Manager)
    behind the same `Settings`, so keys are never on disk in plain text.
  - An **egress DLP filter** on every `TraceEvent` and every assistant message: redact API keys,
    cloud credentials, JWTs, emails, CPF/SSN-like strings before they hit the SSE stream, the
    SQLite store *and* the future observability sink.
  - A **prompt-side secret scanner** before the LLM call (catches `OPENAI_API_KEY=…` and friends
    pasted by the user) — the dual to Guardrails' PII check.
- **What a spec would add.**
  - A pluggable `SecretRedactor` invoked from `TraceEmitter._persist` and from the SSE writer; a
    small detection ruleset (regex + entropy) with bilingual test fixtures.
  - A `secrets.redact` `Stage` and inspector readout that says **what** was redacted (kind +
    count), never **the secret**.
  - Tests proving (a) a known-good key in the prompt never reaches the model; (b) a known-good
    key in the answer never reaches the SSE stream nor the DB.
- **Why it's its own seam (not Guardrails).** Guardrails is *content safety*; this is *secrets
  hygiene* — a separate detection problem whose failure mode is a leaked credential, not an
  unsafe sentence.

### 🔧 Supply chain (SBOM · dependency scan · MCP trust) — *track: `security`*
- **Where the seam would live.** Today CI (`.github/workflows/ci.yml`) runs `ruff` + `pytest` +
  `npm run build` + `npm test`. No SBOM, no dependency scan, no image verification, no MCP
  provenance check.
- **What's missing.**
  - **SBOM generation** in CI (CycloneDX or SPDX) for the backend (`pip-audit` / `cyclonedx-py`)
    and the frontend (`@cyclonedx/cyclonedx-npm`).
  - **Vulnerability scanning** that fails the build on critical CVEs (Snyk / Dependabot / Trivy /
    `pip-audit`), with a documented severity threshold.
  - **Image verification** in the `Dockerfile`s: base image digests pinned (no `:latest`), and the
    published image signed (e.g. cosign / Sigstore) so deploys can verify provenance.
  - **MCP server trust.** Today `backend/app/mcp/client.py` is happy to load tools from any stdio
    process; production needs an **allowlist of trusted MCP servers** (and one day, signed MCP
    manifests) — an untrusted MCP server can return a tool *description* that is itself a
    prompt-injection attack against the agent.
- **What a spec would add.**
  - CI jobs that produce an SBOM artifact per release and run the dep-scanner; image-signing in
    the publish workflow.
  - An `MCP_SERVER_ALLOWLIST` config in `backend/app/config.py` checked in `client.py` before
    `ClientSession.initialize()`; a test that an unlisted server raises and the agent falls back
    to `local-fallback`.
  - Bilingual blurbs in the Tools/MCP inspector readout naming the trust posture.

### 🔧 Tool runtime isolation (sandbox · egress control) — *track: `security`*
- **Where the seam would live.** Today `backend/app/mcp/server.py` runs **in the same process** as
  the agent in `local-fallback`, and over **stdio in the same container** in the normal path. The
  `calculator` and `current_time` tools are pure; `kb_lookup` and `load_skill` touch the DB. None
  are sandboxed.
- **What's missing.**
  - **Process/container isolation per tool** — a runner that executes each MCP tool in a sandbox
    (gVisor / Kata / Firecracker / a separate container with a read-only FS), so a compromised
    tool cannot read `.env` or the SQLite DB.
  - **Egress allowlist per tool** — declarative network policy (`current_time` may not reach the
    internet; `search_knowledge_base` may only reach the embedding endpoint and Chroma). Default
    deny; surface the allowlist on the tool's inspector card.
  - **Resource caps** — CPU, memory and wall-clock budget per tool call, enforced at the runner
    (today only the agent's `MAX_ITERATIONS=3` bound exists).
- **What a spec would add.**
  - A `ToolRunner` abstraction in `mcp/client.py` with a `LocalRunner` (today) and a
    `SandboxedRunner` (e.g. subprocess + seccomp on Linux, container in production).
  - New `Stage`s `tool.sandbox.start` / `tool.sandbox.deny` carrying the profile + egress
    decision; readouts on the Tools station.
  - Tests proving an offending tool (e.g. one that tries to open `/etc/passwd`) is blocked and
    the agent surfaces a typed error.

### 🔧 Identity (OIDC · workload identity · KMS) — *track: `security`*
- **Where the seam would live.** The existing *Authentication, sessions & rate limiting* seam
  above covers **user identity** at the FastAPI ingress. This seam is the missing **workload +
  key identity** layer: how the *backend itself* proves who it is to OpenAI, to the DB, to the
  secrets backend.
- **What's missing.**
  - **Workload identity** for the backend container (Azure Workload Identity / AWS IRSA / GKE
    Workload Identity) so the runtime has no static cloud credentials — it federates with the
    cloud IdP via OIDC.
  - **Service-to-service OIDC** between any future tier (gateway → backend, eval-runner → backend)
    instead of shared API keys.
  - **KMS-backed keys** for the SQLite DB and any future managed SQL — encryption at rest with a
    customer-managed key, rotation on schedule.
- **What a spec would add.**
  - A config selector for credential acquisition (`CREDENTIAL_MODE=env|workload-identity`) wired
    through `Settings`; a small integration test using a fake OIDC issuer.
  - A `secrets.acquire` `Stage` emitted once per cold start that records the source (env vs. IdP),
    surfaced on the backend station's tech list.
  - Cloud examples filled for all three (`clouds: { azure, aws, gcp }`) per constitution §5.
- **Why it's separate from the user-auth seam.** User auth answers *"who is talking to the
  agent?"*; this seam answers *"as whom is the agent talking to OpenAI, the DB and the vault?"* —
  different threat model.

### 🔧 Model abuse / jailbreak detection — *track: `security`*
- **Where the seam would live.** Adjacent to the **Guardrails** tile (🟡 AIOps above), but worth
  naming separately so it isn't confused with content safety. Guardrails today is scoped to
  *injection · PII · toxicity*; abuse detection is the **identity-aware behavioural** layer.
- **What's missing.**
  - **Per-identity budgets** beyond a plain ingress rate-limit — *N tokens/minute per user*,
    *M tool calls/minute*, *cost cap per session* — driven by the future user-auth seam.
  - **Jailbreak classifier** on the prompt (a small classifier or an LLM-judge) flagging known
    patterns; the result feeds the guardrails decision but is reported separately so we can tell
    *content unsafe* from *user trying to jailbreak*.
  - **Abuse-score telemetry** exported to the observability sink for trend analysis
    (Lakera / Adversa / public jailbreak datasets are the obvious comparables).
- **What a spec would add.**
  - A `jailbreak.score` `Stage` between `route` and `think`, emitting a score + label; soft-fail
    (warn + downgrade) below a threshold, hard-fail (refuse) above it.
  - HUD chip showing the score on the current turn; an opt-out for the educational mode so the
    canvas can demonstrate a flagged but allowed run.
  - Tests using public jailbreak fixtures (e.g. a subset of DAN-style prompts) — structural
    assertions, not exact-string.

---

## How to claim an item

1. **Open an issue** on the repo naming the item (e.g. *"Spec: Reranker (Intermediate rung)"*).
2. **Copy the spec template**: `cp -r specs/_template specs/NNN-your-feature/` (pick the next
   zero-padded number).
3. **Write `spec.md` first** — *WHAT + WHY + numbered, testable acceptance criteria.* No code yet.
4. **Plan + tasks** — `plan.md` (HOW, affected files, protocol/i18n/cloud impact) and
   `tasks.md` (TDD checklist; each implement task preceded by the failing test).
5. **Implement red → green → refactor**, keep the spec status moving (`draft → clarified → planned
   → in-progress → done`), and open a PR.
6. **Quality gates (mirror of `ci.yml` + constitution):** `ruff check .` · `ruff format .` ·
   `pytest -q` (with `OPENAI_API_KEY`) · `npm run build` · `npm test` · protocol mirror in sync
   (§1) · every `Stage` mapped to a station (§6) · all user-facing text in **en + pt** (§4) ·
   cloud map filled for any new tier/station (§5).

If a change touches the event protocol, adds/removes a `Stage`, or adds a station/hop/tier, it is
a **feature → spec required**, however small it looks (constitution §10, gray-zone rule).

---
---

# 🗺️ Roadmap — o que ainda não está implementado

🌐 [English](#%EF%B8%8F-roadmap--whats-not-implemented-yet) · **Português**

Esta é a **lista de TODO para colaboradores** do AI Agent Simulator. Tudo abaixo está **visível no
canvas como um bloco de prévia "em breve"** (degraus Intermediário / Avançado da
[escada de maturidade](../README.pt-BR.md#-a-escada-de-maturidade--simples--intermediário--avançado))
ou é uma **costura transversal** que o código já mantém aberta — nada disso está realmente ligado a
uma execução de verdade ainda.

Honestidade em primeiro lugar (constituição §3, *tudo é real*): os blocos de prévia são claramente
rotulados e **não fingem uma execução**. O envio é bloqueado por `canSend(scenario)` em qualquer
degrau cujos nós reais ainda não foram entregues. Cada item aqui é, portanto, a *semente da sua
própria spec*.

> **Como pegar um para si.** Toda mudança de comportamento neste projeto é **spec-first e
> test-first** (veja [`.specify/constitution.md`](../.specify/constitution.md) §9–§10 e
> [`docs/development-workflow.md`](development-workflow.md)). Copie `specs/_template/` para
> `specs/NNN-nome-da-feature/`, escreva `spec.md` → `plan.md` → `tasks.md`, depois implemente
> **red → green → refactor**. Escolha um item, abra uma spec em rascunho e abra uma issue / PR —
> PRs pequenos e focados são muito bem-vindos.

## Legenda de status

| Símbolo | Significado |
|---|---|
| 🟡 | Bloco de prévia no canvas — só visual, sem backend ainda |
| 🏷️ | Marcador só de rótulo — o nó é renderizado com um nome planejado, mas o runtime é o mesmo |
| 🔧 | Costura transversal no código (sem bloco no canvas) — pronta para uma implementação real |

---

## 🧭 Modelo de organização — degraus × tracks

> A escada de maturidade é **um eixo** (*"quão pronto pra produção?"*). O conteúdo abaixo é
> genuinamente **bidimensional**, então cruzamos o degrau com um **Track** (tema). Um Track responde
> *"qual subsistema estou estudando?"* e estreita os clusters de prévia dentro de um degrau — assim o
> degrau Avançado deixa de ser um muro de tiles. Tracks são **apenas um filtro de visão no
> client** (nunca mudam a execução); o eixo em si é entregue em
> [`specs/059-scenario-tracks/`](../specs/059-scenario-tracks/). **"Mais cenários" = adicionar um
> track, não um degrau** — os degraus ficam fixos em três.

| Track | `id` | Tema |
|---|---|---|
| **RAG Quality** | `rag` | recuperação / data-plane — chunking, metadados, rerank, híbrida, MMR, self-query, compressão, multi-vector, expansão de query, métricas |
| **Agent Design** | `agent` | sofisticação do agente — ReAct → DeepAgents → orquestração multi-agente |
| **AI-Ops** | `aiops` | rodar em produção — gateway, cache semântico, eval runner, observabilidade, router, multi-provider |
| **Security & Trust** | `security` | guardrails, segredos/DLP, cadeia de suprimentos, sandbox de tools, identidade/OIDC, jailbreak, auth/rate-limit |
| **Scale & Infra** | `scale` | multi-réplica, estado compartilhado, workload identity |
| **Network & Edge** | `network` | borda de rede (reverse proxy · TLS · LB) ✅ · CDN · WAF · DNS · API gateway · mesh interna |

**A matriz — cada item do roadmap por `{degrau × track}`** (✅ entregue · 🟡 prévia · 🏷️ rótulo ·
🔧 costura):

| Degrau ↓ / Track → | RAG Quality | Agent Design | AI-Ops | Security & Trust | Scale & Infra |
|---|---|---|---|---|---|
| **Simples** | embedding + RAG vetorial ✅ | agente ReAct ✅ | — | stub de auth 🔧 | instância única ✅ |
| **Intermediário** | chunking ✅ · metadados ✅ · rerank ✅ · híbrida ✅ · MMR 🟡 · self-query 🟡 · compressão 🟡 · multi-vector 🟡 · expansão de query 🟡 · métricas ✅ | DeepAgents ✅ · summarization 🟡 · custo/token honesto ✅ | — | — | — |
| **Avançado** | RAGAS (completo) → Eval | multi-agente: researcher/coder/critic 🏷️ | gateway 🟡 · cache 🟡 · eval/RAGAS 🟡 · observabilidade 🟡 · model router 🔧 · multi-provider ✅ | guardrails 🟡 · segredos/DLP 🔧 · cadeia de suprimentos 🔧 · sandbox 🔧 · identidade 🔧 · jailbreak 🔧 · auth/rate-limit 🔧 | multi-réplica 🔧 |

As seções abaixo estão agrupadas por degrau; dentro do degrau Avançado cada `###` é anotado com o
seu **Track** para a matriz e a prosa ficarem em sincronia.

---

## ✅ Track Network & Edge — primeiro nó ENTREGUE (084-network-edge)

O track **Network & Edge** abre o eixo clássico de sistemas distribuídos em volta do agente (a rede
de produção à frente e entre os serviços). Seu primeiro nó está **concluído**:

### ✅ Borda de rede (reverse proxy · TLS · LB) — ENTREGUE (084-network-edge)
- **Status.** Concluído. Um `nginx` real fica à frente do backend no `docker-compose`
  (`infra/nginx/nginx.conf`): termina o TLS, balanceia e injeta os headers de encaminhamento
  (`X-Forwarded-*`, `X-Request-Id`). O backend emite um `Stage` `edge` a partir de
  `backend/app/edge.py::read_edge` — reportando só o que os headers provam e mostrando honestamente
  `proxied=false` quando não há proxy à frente. `ChatRequest.edge: bool = False` é opt-in no
  protocolo, então uma chamada direta de API fica byte-for-byte; `edge` é um toggle ligado por
  padrão no Build. **Revisado (085):** a borda **não tem nó/tier próprio** — o `Stage` `edge` mapeia
  para a estação `backend`, e sua cadeia (DNS · CDN · TLS/LB · WAF · API GW, só o TLS/LB real) +
  os forwarded headers aparecem no **detalhe do hop `frontend→backend`** (clique na seta), não numa
  caixa.
- **O que ainda falta (specs futuras).** Cada segmento de prévia vira seu próprio nó real:
  **CDN**, **WAF**, **DNS**, **API gateway** e a **mesh interna / profundidade de mTLS** (subnets,
  NSG, private endpoints). TLS real com um cert montado (o nginx.conf já tem o bloco comentado
  `listen 8443 ssl`). As fixtures do demo no GitHub Pages (058) ainda não têm eventos `edge` — as
  antigas renderizam a caixa da borda ociosa (fallback gracioso) até serem recapturadas.

---

## 🟡 Degrau Intermediário — qualidade de RAG & "DeepAgents"

**Tracks aqui:** `rag` (RAG Quality) · `agent` (Agent Design). O degrau Intermediário é o nível de
*qualidade de RAG + custo honesto* — o lar do módulo inteiro de recuperação mais o DeepAgents de um
agente. Hoje o cenário é selecionável, a topologia é renderizada, mas os novos nós são prévias
visuais.

### ✅ Runtime DeepAgents — ENTREGUE (057-deepagents-runtime)
- **Status.** Concluído. No degrau **Intermediário** o rótulo `DeepAgents` agora tem um **runtime
  real e dirigido pelo modelo** — planejamento, sistema de arquivos virtual e delegação a
  subagente são **tools que o agente elege dentro do loop ReAct** (não um preâmbulo roteirizado;
  uma saudação não dispara nenhuma). O Simples nunca vê as tools (byte-for-byte).
- **O que foi entregue — os quatro pilares, feitos à mão.** Seis tools nativas (`agent/tools.py`,
  gateadas por `with_deepagents` — Intermediário e sem RAGLESS) com handlers em
  `backend/app/agent/deepagents.py`: **(1) Planejamento** — `write_todos` mantém uma lista de todos
  com *status* por item (`agent.plan`); **(2) Sistema de arquivos virtual** — `write_file`/
  `read_file`/`edit_file`/`ls` sobre `AgentState["vfs"]` (`agent.fs.write`/`agent.fs.read`);
  **(3) Subagentes** — `task` spawna um **subagente real e limitado** (`run_subagent`: prompt +
  tools + thread + loop ReAct próprios, contexto isolado — só o resultado volta) (`agent.delegate`);
  **(4) Prompt detalhado** — `DEEPAGENTS_PROMPT` na camada de role. Quatro novos `Stage`s mapeados
  para a estação `agent` + fase `reason` (§1, §6); o drill-in do Agente ganha painéis **Plano** (com
  selos de status) e **Sistema de arquivos virtual** + a trilha de tools do subagente (projeção pura
  em `frontend/src/lib/deepagents.ts`); toda prosa bilíngue (EN + PT). *Adiado:* o middleware de
  summarization da lib + o trio researcher/coder/critic do Avançado. Veja
  [`specs/057-deepagents-runtime/`](../specs/057-deepagents-runtime/).
- **O que ainda falta (specs futuras).** A orquestração **DeepAgents + Multiagentes** do degrau
  Avançado (o trio researcher/coder/critic sob um orquestrador) — veja a seção Avançado abaixo — e
  persistir o FS virtual entre turnos.

### ✅ Reranker (cross-encoder) — ENTREGUE (054-rag-block-expansion)
- **Status.** Concluído. O reranking é uma **sub-etapa real de tempo de consulta da estação `rag`
  (Vector DB)** (`rag.rerank`, sem tile separado), e o degrau Intermediário agora executa.
- **O que foi entregue.** Uma chamada real ao reranker entre `rag.search` e `rag.retrieve` (novo
  `Stage` `rag.rerank`), usando um **cross-encoder FlashRank local** (`backend/app/rag/reranker.py`;
  ONNX, sem torch, sem chave, determinístico). A recuperação busca um pool maior (`rerank_fetch_k`),
  reordena e corta para o `top_k`; o degrau Simples nunca reordena (byte-for-byte). O estágio está
  mapeado em `STAGE_TO_STATION`/`STAGE_TO_PHASE`, com readout + detalhe de movimento de rank no
  inspetor e o drill-in `RagDetail` "abrir visão completa" (Chunking → Embedding → Recuperação →
  Reranking), tudo bilíngue (EN + PT). Veja [`specs/054-rag-block-expansion/`](../specs/054-rag-block-expansion/).
- **Nota do mapa do curso (M2U3.2 — Bi-Encoders vs. Cross-Encoders).** O reranker entregue é a
  metade cross-encoder. Ainda em aberto como pequenas specs de enriquecimento: um **bi-encoder vs.
  cross-encoder** lado a lado no `RagDetail` (o explicador *por que uma segunda passada vale a
  latência?*), um **readout de latência** na sub-etapa de rerank, e um provedor **Cohere ReRank**
  (hospedado) atrás da mesma costura `reranker.py` como alternativa ao FlashRank local.

### ✅ Busca híbrida (BM25 + vetorial) — ENTREGUE (070-hybrid-search)
- **Status.** Concluído. A busca híbrida é uma **sub-etapa real de tempo de consulta da estação
  `rag` (Vector DB)** (`rag.hybrid`, sem tile separado — o tile `comingSoon` `hybrid` da 060 foi
  removido/absorvido, como o reranker). **Compõe com o reranker** (fundir → rerank → recuperar).
- **O que foi entregue.** Uma **lane esparsa BM25** real (`backend/app/rag/hybrid.py`; `rank_bm25`
  local, puro-python, determinístico, sem chave) roda ao lado da busca vetorial densa e as duas
  listas ranqueadas são fundidas com **Reciprocal Rank Fusion (RRF)** (`Σ 1/(rrf_k + posição)`,
  `rrf_k=60`). O BM25 ranqueia **todo o corpus do escopo**, então um trecho que a busca densa perdeu
  pode entrar por correspondência exata de termo. Novo `Stage rag.hybrid` (mapeado para a estação
  `rag` + fase `retrieve`), input de request `hybrid: bool` (só Vector RAG, limpo no RAGLESS). O tile
  do Vector DB mostra um readout `BM25+vetorial · fundido N`; o drill-in do RAG ganha a tabela de
  fusão **Vetorial | BM25 | → RRF** (por trecho: posição vetorial, posição BM25, escore RRF, ↑ quando
  o BM25 o elevou), e o Inspetor mostra a fusão. Off / Simples é byte-for-byte (sem `rag.hybrid`).
  Toda prosa bilíngue (en + pt). Veja [`specs/070-hybrid-search/`](../specs/070-hybrid-search/).
- **O que ainda falta (specs futuras).** **A busca híbrida não tem fixture capturada no demo mockado
  do GitHub Pages (058)** — a app ao vivo funde, mas o demo não consegue reproduzir um run híbrido
  até a trace ser capturada (veja a nota de demo na lista de adiados). Fusão ponderada / aprendida e
  um slider de `rrf_k` para o usuário também ficam adiados.

### 🟡 Sumarização (compactação de contexto) — *track: `agent`*
- **Onde aparece.** Um **tile de prévia `comingSoon`** (`summarization`) no degrau Intermediário,
  abaixo do nó DeepAgents na tier do Agente, tagueado com o track `agent`
  ([060-intermediate-preview-tiles](../specs/060-intermediate-preview-tiles/)). É a prévia de
  Agent-Design do degrau (faz par com o cluster RAG para acender o seletor de track do Intermediário).
- **O que é.** O pilar do DeepAgents que a 057 adiou: compactar o thread de mensagens quando ele
  cresce demais — resumindo turnos antigos para o agente manter contexto sem estourar o orçamento.
- **O que uma spec adicionaria.** Um middleware real de sumarização por limiar de tokens no loop do
  agente (o passo de summarization da lib), surfaceado no painel de memória do drill-in do Agente.

### 🟡 Técnicas avançadas de recuperação (MMR · self-query · compressão · multi-vector · expansão de query)

Os upgrades de *qualidade de RAG* que ficam dentro (ou logo antes/depois) da estação `rag` — a
metade de recuperação do degrau Intermediário, direto do mapa do curso (M2U3.1, *Advanced Retrieval
Techniques*). **Dois membros já existem:** o **reranker** cross-encoder (✅ 054, entregue) e a
**busca híbrida** (🟡 acima). As cinco abaixo completam a família; cada uma é a semente da sua
própria spec, e cada uma estenderia o drill-in `RagDetail` (Chunking → Embedding → Recuperação →
Reranking → …) com mais um passo honesto e inspecionável. Nenhuma precisa de mapa de nuvem — vivem
algoritmicamente dentro da estação `rag` (nível de biblioteca, ex.: LangChain), não em uma nova tier.

- **Maximal Marginal Relevance (MMR) — recuperação ciente de diversidade.** Reescolhe o top-k
  equilibrando *relevância à query* contra *novidade vs. trechos já escolhidos*, para a janela de
  contexto não ficar cheia de quase-duplicatas. Uma spec adiciona um toggle `mmr` + `lambda` no
  retriever, uma sub-etapa `rag.diversify` (irmã de `rag.rerank`) e uma visão antes/depois do
  conjunto no inspetor.
- **Self-querying — linguagem natural → filtro de metadados.** Um passo de LLM que interpreta a query
  do usuário em um filtro estruturado de metadados (`author = …`, `year > …`) **mais** a query
  semântica, para a recuperação ser *filtrada*, não só ranqueada. Depende do item **Metadados**
  abaixo. Uma spec adiciona uma sub-etapa `rag.self_query` mostrando o filtro extraído e a chamada
  de LLM que o produziu.
- **Compressão contextual — filtrar/destilar antes do prompt.** Após a recuperação, comprime cada
  trecho (extrativo ou via LLM) até as frases que de fato respondem à query, cortando tokens e ruído
  antes da etapa de geração. Uma spec adiciona uma sub-etapa `rag.compress` com readout de
  tokens-economizados (casa com a spec [011-token-cost](../specs/011-token-cost/) e o orçamento de
  contexto 036).
- **Recuperação multi-vetor — semântica em nível de documento.** Indexa múltiplos vetores por
  documento (ex.: um vetor de resumo + vetores de trechos-filho, ou vetores de perguntas
  hipotéticas) e recupera os pais a partir de acertos nos filhos. Uma spec adiciona a opção de índice
  multi-vetor ao `ingest.py` e um readout `rag.search` mostrando a expansão filho → pai. Combina
  naturalmente com **chunking hierárquico** abaixo.
- **Expansão & reformulação de query.** Reescreve/expande a query do usuário (sinônimos, HyDE,
  fan-out multi-query) antes do embedding, depois funde os conjuntos de resultados. Uma spec
  adiciona uma sub-etapa `rag.expand` listando as variantes de query geradas e a fusão (sobrepõe com
  a fusão RRF da busca híbrida).

### ✅ Estratégias de chunking (tempo de ingestão) — ENTREGUE (072-chunking-strategies)

- **O que é.** A escada de chunking do M2U3.3 do curso: **tamanho fixo + limites de token**,
  **overlap para preservação de contexto**, **chunking semântico** (dividir por significado) e
  **chunking recursivo/hierárquico**. A qualidade do chunking está a montante de toda métrica de
  recuperação.
- **O que entrou.** Chunking de ingestão configurável (`backend/app/rag/chunking.py` — fixo /
  recursivo / semântico / agêntico) com knobs por estratégia (081) e um playground de preview; a
  estratégia + estatísticas de chunk aparecem no painel Chunking do `RagDetail`, e re-ingerir a
  partir do ⚙️ Settings reusa o caminho de reindex. Veja também 083 (tabela de chunks) e 087
  (destaque de overlap).

### ✅ Metadados como cidadão de primeira classe — ENTREGUE (073-metadata-first-class)

- **O que é.** A história de metadados do M2U3.3: anexar metadados úteis a cada trecho (fonte, seção,
  autor, data, tipo), **extrair** na ingestão, **filtrar** por eles na recuperação (o seam sobre o
  qual o self-querying se apoia) e usá-los para **avaliação/depuração** (*por que este trecho foi
  recuperado?*).
- **O que entrou.** Metadados ricos por trecho na ingestão, um caminho de filtro `where=`/`filters=`
  no `retriever.py`, e chips "por que recuperado" em cada trecho recuperado no inspetor do Vector DB
  + `RagDetail`. O retriever de self-querying (ainda 🟡 acima) reusa esse seam de filtro.

### ✅ Métricas de qualidade de recuperação (Precision@k · MRR) — ENTREGUE (071-retrieval-metrics)

- **O que é.** As medidas de qualidade de recuperação do M2U3.1 §4: **Precision@k · Recall@k · MRR**
  (o trecho relevante estava no top-k, e quão alto?), o trade-off LLM-como-juiz vs. ground-truth
  manual, e onde o **RAGAS** se encaixa. Elas quantificam se reranking / híbrida / MMR de fato
  ajudaram.
- **O que entrou.** Um conjunto rotulado (golden set) + cálculo de métricas sobre `rag.retrieve`,
  com readout mostrando Precision@k / Recall@k / MRR para o run atual (para a afirmação *por que
  rerank?* ser medida, não afirmada). A suíte completa do **RAGAS** fica no **Eval Runner** Avançado
  (🟡).

---

## 🟡 Degrau Avançado — Multiagentes & AI-Ops

**Tracks aqui:** `agent` (multi-agente) · `aiops` · `security` · `scale`. O degrau Avançado é o
nível de *como agentes vivem em produção*. Ele adiciona uma nova tier inteira de **AI-Ops** (veja
`stations.ts` → `tiers` → `aiops`) com cinco nós de prévia, mais a árvore de workers multi-agente
sob o orquestrador. Com quatro tracks, é aqui que a [`059-scenario-tracks`](../specs/059-scenario-tracks/)
se paga — escolha um track para navegar um cluster por vez em vez do muro inteiro. Os itens do track
`security` vivem na seção de **costuras transversais** abaixo (ainda sem bloco no canvas); a matriz
acima é o agrupamento autoritativo.

### 🏷️ Orquestração multi-agente (Researcher / Coder / Critic) — *track: `agent`*
- **Onde aparece.** `stations.ts` → estações `researcher`, `coder`, `critic` sob a tier `agent`;
  `AGENT_SCENARIO_LABEL.advanced` renomeia o nó `agent` para **`DeepAgents + Multi-agents`**
  (`pt`: `DeepAgentes + Multiagentes`). O fan-out de hops (`agent → researcher | coder | critic`)
  já está declarado mas com `scenarios: ["advanced"]` e os alvos são `comingSoon`. Chave de
  glossário `Multi-agent` em `strings.ts` — marcada como *"Planejado — ainda não implementado."*
- **O que é.** Um agente **orquestrador** que delega tarefas focadas a **subagentes
  especializados** em vez de rodar um único loop monolítico:
  - **Researcher** — roda recuperação / consultas a ferramentas e devolve um resumo.
  - **Coder** — faz o trabalho (escreve código, chama ferramentas, transforma dados) sob o plano.
  - **Critic** — revisa a resposta rascunho em busca de erros e lacunas antes de sair.
- **O que uma spec adicionaria.**
  - Um runtime orquestrador → subagente real em `backend/app/agent/` (cada subagente tem seu
    próprio loop limitado e subconjunto de ferramentas).
  - `Stage`s por subagente (`agent.delegate`, `agent.subagent.*`) e mapeamento em
    `STAGE_TO_STATION` / `STAGE_TO_PHASE`.
  - Ativação por subagente no canvas (o worker em execução acende) e uma aba no detalhe do Agente
    mostrando a cadeia de delegação.
  - Testes provando que a delegação acontece de fato (ex.: uma pergunta de código vai para o Coder).

### 🟡 Gateway LLM (roteador · fallback · orçamento) — *track: `aiops`*
- **Onde aparece.** `stations.ts` → estação `gateway` (tier `aiops`, `comingSoon: true`).
- **O que é.** Uma saída única para toda chamada de modelo — cuida de roteamento entre
  provedores/modelos, retries, fallback e limites de orçamento. A costura natural para
  **multi-provider** (veja a seção transversal abaixo).
- **Exemplos de nuvem.** Azure API Management (AI gateway) · Bedrock + API Gateway · Apigee /
  Vertex endpoints.
- **O que uma spec adicionaria.**
  - Um gateway real na frente de `LLMProvider.decide` / `stream_answer` capaz de rotear por política
    (custo, latência, capacidade do modelo) e dar fallback em falha.
  - Novos `Stage`s para `gateway.route` e `gateway.fallback`, surfaceados no inspetor.
  - Limites de orçamento aplicados no servidor; o limite e o saldo restante visíveis no bloco do
    gateway.

### 🟡 Guardrails (segurança de entrada / saída) — *track: `security`*
- **Onde aparece.** `stations.ts` → estação `guardrails` (tier `aiops`, `comingSoon: true`).
- **O que é.** Verifica prompts e respostas contra **prompt injection, PII e conteúdo inseguro**
  antes de passarem. Dois pontos de chamada reais: pré-LLM no prompt, pós-LLM na resposta.
- **Exemplos de nuvem.** Azure AI Content Safety · Bedrock Guardrails · Model Armor.
- **O que uma spec adicionaria.**
  - Checagens reais de entrada + saída (ex.: `presidio` para PII, um SDK de guardrails open para o
    resto).
  - Novos `Stage`s `guard.input` / `guard.output` com **fail-fast em bloqueio** e uma UX clara de
    resposta bloqueada (sobrepõe com a spec [017-failure-injection](../specs/017-failure-injection/) —
    reusar).
  - Testes que provam que um prompt sabidamente malicioso é bloqueado e um prompt limpo passa.

### 🟡 Cache Semântico (cache de prompt / embedding) — *track: `aiops`*
- **Onde aparece.** `stations.ts` → estação `cache` (tier `aiops`, `comingSoon: true`).
- **O que é.** Devolve uma resposta armazenada para **consultas semanticamente próximas** — grande
  economia de latência e custo. Chave pela similaridade de embedding, não pelo texto exato do prompt.
- **Exemplos de nuvem.** Azure Cache for Redis · ElastiCache (Redis) · Memorystore (Redis).
- **O que uma spec adicionaria.**
  - Uma checagem real de cache antes da chamada ao LLM e um upsert depois; threshold de similaridade
    configurável.
  - Novos `Stage`s `cache.lookup` (hit / miss) e `cache.upsert`; o HUD mostra a economia de
    cache-hit (casa com as specs [011-token-cost](../specs/011-token-cost/) e
    [018-cumulative-hud](../specs/018-cumulative-hud/)).
  - Honestidade: uma resposta cacheada precisa ser **rotulada como cacheada** na UI (não é uma
    chamada fresca ao LLM).

### 🟡 Eval Runner (RAGAS / LLM-como-juiz) — *track: `aiops`*
- **Onde aparece.** `stations.ts` → estação `eval` (tier `aiops`, `comingSoon: true`).
- **O que é.** Pontua respostas contra um **golden set** (fidelidade, relevância da resposta, NDCG
  da recuperação) e barra regressões no CI — a resposta de produção para *"nossa mudança melhorou?"*.
- **Exemplos de nuvem.** Azure AI Evaluation · Bedrock model evaluation · Vertex Gen AI evaluation.
- **O que uma spec adicionaria.**
  - Um golden set sob `backend/app/data/` e um runner sob `backend/app/eval/`.
  - Uma ação "Rodar evals" sob demanda na UI que streama resultados para um novo painel de inspetor.
  - Uma porta de CI que falha o build quando fidelidade / NDCG caem abaixo dos thresholds (estende
    `ci.yml`).

### 🟡 Sink de Observabilidade (traces de LLM · OpenTelemetry GenAI) — *track: `aiops`*
- **Onde aparece.** `stations.ts` → estação `observability` (tier `aiops`, `comingSoon: true`).
- **O que é.** Captura **cada prompt, resposta, contagem de tokens, latência e custo** como traces
  estruturados de LLM — a versão de produção do que a spec
  [038-execution-traces](../specs/038-execution-traces/) mostra inline.
- **Exemplos de nuvem.** Azure Monitor / App Insights · CloudWatch / X-Ray · Cloud Trace /
  Monitoring.
- **O que uma spec adicionaria.**
  - Export OTel GenAI real do backend (o trace já existe em memória via `app/trace.py` — isso é o
    sink de produção, não um modelo de trace novo).
  - Um toggle (env + UI) para habilitar o export; o bloco de observabilidade mostra o sink
    configurado.

---

## 🔧 Costuras transversais — fora do canvas

Estas não têm bloco próprio — são costuras que o código já mantém abertas. Cada uma é um TODO
genuíno para prontidão de produção.

### ✅ Suporte a múltiplos provedores de LLM — ENTREGUE (074-ollama-provider · 075-ollama-embeddings)
- **O que é.** A ABC `LLMProvider` (`backend/app/llm/provider.py`) é uma costura fina; um segundo
  provedor concreto implementa `decide`/`stream_answer` e surfaceia `TokenUsage` real.
- **O que entrou.** **Ollama** é um provider real por-agente (`OllamaProvider`, coluna
  `agents.provider`, URL em `app_config`) — um agente pode rodar inteiro num modelo local, sem chave
  OpenAI. Embeddings também podem rodar em Ollama local (075), com provider/modelo instance-global e
  auto-rebuild via assinatura de embedding. Isso **emendou a constituição §2** (não é mais provedor
  único). O **Gateway de LLM** (🟡 acima) é o próximo orquestrador natural (roteamento + fallback
  entre provedores).

### 🔧 Roteador de modelos (seleção de modelo por requisição) — *track: `aiops`*
- **Onde a costura ficaria.** Dentro do futuro bloco **Gateway de LLM**, ou como um passo de
  roteamento em `get_provider()` / dentro de `OpenAIProvider`. Hoje o modelo é fixo em `LLM_MODEL`
  (padrão `gpt-4o-mini`).
- **O que é.** Rotear por requisição para o modelo mais barato que dá conta do trabalho (ex.:
  classificação → `gpt-4o-mini`; raciocínio longo → `gpt-4o`; muito uso de ferramentas → `gpt-4o`).
  O agente declara a *classe da tarefa*; o roteador escolhe o modelo.
- **O que uma spec adicionaria.** Uma política de roteamento (tabela declarativa ou um pequeno
  classificador), um novo `Stage` `gateway.route` mostrando o modelo escolhido + a razão, e
  contabilidade de custo por modelo no HUD.

### 🔧 Autenticação, sessões & rate limiting — *track: `security`*
- **Onde está sinalizado.** Ressalvas honestas em `stations.ts` (`whatBreaks` das estações
  `frontend` + `backend`): *"esta demo não tem autenticação real — é um stub; produção precisa de
  login, sessões e rate limiting antes de o agente rodar."*
- **O que falta.** Uma camada real de authn/z no ingress FastAPI (ex.: JWT / cookies de sessão),
  rate limiting por identidade, e um store de sessão real.
- **O que uma spec adicionaria.** Um fluxo de login, um middleware de sessão, um middleware de
  rate-limit e uma matriz de testes provando 401 sem credenciais e 429 sob burst.

### 🔧 Multi-réplica / estado compartilhado — *track: `scale`*
- **Onde está sinalizado.** `whatBreaks` da estação `database` ("esta demo é de instância única; o
  armazenamento de traces fica em memória, perdido ao reiniciar, não compartilhado entre
  réplicas"). Reforçado pela constituição §7 (*instância única*).
- **O que falta.** O `TraceStore` em memória (e o `MemorySaver` no agente LangGraph) são
  deliberadamente locais do processo. Produção precisa de um backend compartilhado (Redis / SQL
  gerenciado) e de um pool na frente do DB relacional.
- **O que uma spec adicionaria.** Um `TraceStore` plugável (impl Redis), uma troca do
  `Checkpointer` do LangGraph e um teste de carga demonstrando duas réplicas servindo a mesma
  conversa.
- **Checagem da constituição.** §7 atualmente exige *instância única* — assim como o
  multi-provider emendou a §2 (074), emendar a constituição como parte da spec.

### 🔧 Segurança & confiança — as costuras de *cibersegurança*

As cinco costuras abaixo são o cluster de segurança que o projeto deve a uma postura pronta para
produção. O único bloco visível nessa área hoje é o **Guardrails** (🟡 AIOps acima), cujo escopo é
*segurança de conteúdo* (injection · PII · toxicidade). Tudo abaixo é sobre **identidade,
segredos, cadeia de suprimentos e isolamento de runtime** — nada disso está ligado ainda, e cada
um é uma spec futura própria.

### 🔧 Gestão de segredos & DLP de egress — *track: `security`*
- **Onde a costura ficaria.** Hoje os segredos vêm do `backend/.env` (`OPENAI_API_KEY` lido via
  `pydantic-settings`). Não há redação em prompts, respostas, traces ou logs — `prompt_preview` em
  `backend/app/trace.py` e a tabela SQLite `trace_events` (spec
  [048-persist-traces](../specs/048-persist-traces/)) guardam texto cru.
- **O que falta.**
  - Um backend real de segredos (KMS na nuvem / Vault / Key Vault / Secrets Manager / Secret
    Manager) por trás do mesmo `Settings`, para que as chaves nunca fiquem em disco em texto puro.
  - Um **filtro DLP de egress** em todo `TraceEvent` e em toda mensagem do assistente: redigir
    chaves de API, credenciais de nuvem, JWTs, e-mails e strings tipo CPF/SSN antes de chegarem ao
    stream SSE, ao SQLite *e* ao futuro sink de observabilidade.
  - Um **scanner de segredos no lado do prompt** antes da chamada ao LLM (pega `OPENAI_API_KEY=…`
    e parecidos colados pelo usuário) — o dual da checagem de PII do Guardrails.
- **O que uma spec adicionaria.**
  - Um `SecretRedactor` plugável invocado a partir de `TraceEmitter._persist` e do writer SSE; um
    conjunto pequeno de regras de detecção (regex + entropia) com fixtures de teste bilíngues.
  - Um `Stage` `secrets.redact` e um readout no inspetor que diz **o que** foi redigido (tipo +
    contagem), nunca **o segredo**.
  - Testes provando (a) uma chave conhecida no prompt nunca chega ao modelo; (b) uma chave
    conhecida na resposta nunca chega ao stream SSE nem ao DB.
- **Por que é uma costura própria (e não Guardrails).** Guardrails é *segurança de conteúdo*; isto
  é *higiene de segredos* — um problema de detecção distinto cujo modo de falha é uma credencial
  vazada, não uma frase insegura.

### 🔧 Cadeia de suprimentos (SBOM · scan de dependências · confiança em MCP) — *track: `security`*
- **Onde a costura ficaria.** Hoje o CI (`.github/workflows/ci.yml`) roda `ruff` + `pytest` +
  `npm run build` + `npm test`. Sem SBOM, sem scan de dependências, sem verificação de imagem, sem
  checagem de proveniência de MCP.
- **O que falta.**
  - **Geração de SBOM** no CI (CycloneDX ou SPDX) para o backend (`pip-audit` / `cyclonedx-py`) e
    o frontend (`@cyclonedx/cyclonedx-npm`).
  - **Scan de vulnerabilidades** que faz o build falhar em CVEs críticos (Snyk / Dependabot /
    Trivy / `pip-audit`), com limiar de severidade documentado.
  - **Verificação de imagem** nos `Dockerfile`s: digests da imagem base pinados (sem `:latest`) e a
    imagem publicada assinada (ex.: cosign / Sigstore) para que os deploys verifiquem proveniência.
  - **Confiança em servidor MCP.** Hoje `backend/app/mcp/client.py` aceita carregar tools de
    qualquer processo stdio; produção precisa de uma **allowlist de servidores MCP confiáveis** (e
    um dia, manifestos MCP assinados) — um servidor MCP não confiável pode devolver uma
    *descrição* de tool que é em si um ataque de prompt-injection contra o agente.
- **O que uma spec adicionaria.**
  - Jobs de CI que produzem um artefato SBOM por release e rodam o dep-scanner; assinatura de
    imagem no workflow de publicação.
  - Uma config `MCP_SERVER_ALLOWLIST` em `backend/app/config.py` checada em `client.py` antes de
    `ClientSession.initialize()`; um teste de que um servidor fora da lista levanta e o agente cai
    para `local-fallback`.
  - Blurbs bilíngues no readout do inspetor de Tools/MCP nomeando a postura de confiança.

### 🔧 Isolamento de runtime de tools (sandbox · controle de egress) — *track: `security`*
- **Onde a costura ficaria.** Hoje `backend/app/mcp/server.py` roda **no mesmo processo** do agente
  no `local-fallback`, e por **stdio no mesmo container** no caminho normal. As tools `calculator`
  e `current_time` são puras; `kb_lookup` e `load_skill` tocam o DB. Nenhuma está em sandbox.
- **O que falta.**
  - **Isolamento por tool (processo/container)** — um runner que execute cada tool MCP em sandbox
    (gVisor / Kata / Firecracker / um container separado com FS read-only), para que uma tool
    comprometida não consiga ler `.env` ou o SQLite.
  - **Allowlist de egress por tool** — política de rede declarativa (`current_time` não pode
    alcançar a internet; `search_knowledge_base` só pode alcançar o endpoint de embeddings e o
    Chroma). Default deny; surfacear a allowlist no card de inspetor da tool.
  - **Limites de recursos** — orçamento de CPU, memória e tempo por chamada de tool, aplicado no
    runner (hoje só existe o limite `MAX_ITERATIONS=3` do agente).
- **O que uma spec adicionaria.**
  - Uma abstração `ToolRunner` em `mcp/client.py` com `LocalRunner` (hoje) e `SandboxedRunner`
    (ex.: subprocess + seccomp no Linux, container em produção).
  - Novos `Stage`s `tool.sandbox.start` / `tool.sandbox.deny` carregando o perfil + decisão de
    egress; readouts na estação Tools.
  - Testes provando que uma tool ofensiva (ex.: uma que tenta abrir `/etc/passwd`) é bloqueada e
    o agente surfacia um erro tipado.

### 🔧 Identidade (OIDC · workload identity · KMS) — *track: `security`*
- **Onde a costura ficaria.** A costura *Autenticação, sessões & rate limiting* acima cobre a
  **identidade do usuário** no ingress do FastAPI. Esta costura é a camada faltante de
  **identidade de workload + de chaves**: como o *próprio backend* prova quem é para a OpenAI,
  para o DB e para o backend de segredos.
- **O que falta.**
  - **Workload identity** para o container do backend (Azure Workload Identity / AWS IRSA / GKE
    Workload Identity) para que o runtime não tenha credenciais estáticas de nuvem — ele federa
    com o IdP da nuvem via OIDC.
  - **OIDC serviço-a-serviço** entre qualquer tier futura (gateway → backend, eval-runner →
    backend) em vez de chaves de API compartilhadas.
  - **Chaves apoiadas em KMS** para o SQLite e qualquer SQL gerenciado futuro — criptografia em
    repouso com chave gerenciada pelo cliente, rotação em cronograma.
- **O que uma spec adicionaria.**
  - Um seletor de config para aquisição de credencial (`CREDENTIAL_MODE=env|workload-identity`)
    cabeado pelo `Settings`; um teste de integração pequeno usando um issuer OIDC fake.
  - Um `Stage` `secrets.acquire` emitido uma vez por cold start registrando a fonte (env vs. IdP),
    surfaceado na lista `tech` da estação backend.
  - Exemplos de nuvem preenchidos para os três (`clouds: { azure, aws, gcp }`) pela constituição §5.
- **Por que é separada da costura de user-auth.** User-auth responde *"quem está falando com o
  agente?"*; esta responde *"como quem o agente fala com a OpenAI, o DB e o cofre?"* — modelo de
  ameaça diferente.

### 🔧 Abuso de modelo / detecção de jailbreak — *track: `security`*
- **Onde a costura ficaria.** Adjacente ao bloco **Guardrails** (🟡 AIOps acima), mas vale nomear
  separadamente para não confundir com segurança de conteúdo. Guardrails hoje tem escopo de
  *injection · PII · toxicidade*; detecção de abuso é a camada **comportamental ciente de
  identidade**.
- **O que falta.**
  - **Orçamentos por identidade** além de um rate-limit de ingress simples — *N tokens/minuto por
    usuário*, *M chamadas de tool/minuto*, *teto de custo por sessão* — apoiados pela costura
    futura de user-auth.
  - **Classificador de jailbreak** no prompt (um classificador pequeno ou LLM-juiz) sinalizando
    padrões conhecidos; o resultado alimenta a decisão do guardrails mas é reportado em separado
    para distinguir *conteúdo inseguro* de *usuário tentando jailbreak*.
  - **Telemetria de abuse-score** exportada para o sink de observabilidade para análise de
    tendência (Lakera / Adversa / datasets públicos de jailbreak são os comparáveis óbvios).
- **O que uma spec adicionaria.**
  - Um `Stage` `jailbreak.score` entre `route` e `think`, emitindo score + label; soft-fail (warn +
    downgrade) abaixo de um threshold, hard-fail (recusa) acima dele.
  - Chip no HUD mostrando o score no turno atual; um opt-out para o modo educacional para que o
    canvas possa demonstrar um run sinalizado mas permitido.
  - Testes usando fixtures públicas de jailbreak (ex.: um subset de prompts tipo DAN) — asserções
    estruturais, não string exata.

---

## Como reivindicar um item

1. **Abra uma issue** no repositório nomeando o item (ex.: *"Spec: Reranker (degrau
   Intermediário)"*).
2. **Copie o template de spec**: `cp -r specs/_template specs/NNN-sua-feature/` (escolha o próximo
   número com zero-padding).
3. **Escreva `spec.md` primeiro** — *O QUE + POR QUÊ + critérios de aceitação numerados e
   testáveis.* Sem código ainda.
4. **Plano + tarefas** — `plan.md` (COMO, arquivos afetados, impacto em protocolo/i18n/nuvem) e
   `tasks.md` (checklist TDD; cada tarefa de implementação precedida pelo teste que falha).
5. **Implemente red → green → refactor**, mantenha o status da spec andando (`draft → clarified →
   planned → in-progress → done`) e abra um PR.
6. **Portas de qualidade (espelho do `ci.yml` + constituição):** `ruff check .` · `ruff format .` ·
   `pytest -q` (com `OPENAI_API_KEY`) · `npm run build` · `npm test` · espelho do protocolo em
   sincronia (§1) · cada `Stage` mapeado para uma estação (§6) · todo texto voltado ao usuário em
   **en + pt** (§4) · mapa de nuvem preenchido para qualquer nova tier/estação (§5).

Se uma mudança toca o protocolo de eventos, adiciona/remove um `Stage`, ou adiciona uma
estação/hop/tier, ela é uma **feature → spec obrigatória**, por menor que pareça (constituição
§10, regra da zona cinza).
