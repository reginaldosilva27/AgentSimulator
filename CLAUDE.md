# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An educational visualizer of an agentic AI request lifecycle. The user types a message; the backend runs a real LangGraph agent (RAG → MCP tools → LLM) and emits every stage as a stream of trace events; the frontend animates those events across a graph of "stations" and lets you inspect the real data at each one. It runs **only against OpenAI** — an `OPENAI_API_KEY` is required (there is no offline/demo mode); with no key it fails fast at startup. Reasoning, embeddings, the vector store, the relational DB and MCP are all real.

## How we build here — SDD + TDD (non-negotiable)

This project is **spec-first (Spec-Driven Development)** and **test-first (Test-Driven Development)**, and that applies to **every task — even when the user does not ask for it.** The intent is written and reviewed *before* the code; acceptance criteria become failing tests. Two documents govern this, and the constitution wins on any conflict:

- **`.specify/constitution.md`** — the 10 non-negotiable principles (protocol-is-the-contract, single provider (OpenAI) required, everything is real, bilingual en/pt, cloud-agnostic, one source of truth for the visual model, pure projection, single-instance, **§9 TDD**, **§10 SDD**) + the quality gates + the amendment process.
- **`specs/README.md`** — the workflow: `specify → clarify → plan → tasks → implement (TDD) → verify`. `specs/000-core-pipeline/` is a worked example (every acceptance criterion points at a passing test); `specs/_template/` is what you copy to start.

### New feature → write a spec first (stop and do this)
When the user asks for a new feature or a behavior change, **do not jump to code.** Create the spec, and **if the user skipped it, remind them** before writing any code:

1. Copy `specs/_template/` to `specs/NNN-feature-name/` (zero-padded, sequential — `001-`, `002-`, …).
2. Fill `spec.md` — WHAT + WHY + numbered, **testable** acceptance criteria. No implementation detail. Resolve every open question ("clarify") before planning.
3. Fill `plan.md` — HOW: approach, affected files, protocol/i18n/cloud impact, and a test strategy that maps each acceptance criterion to a test.
4. Fill `tasks.md` — ordered TDD checklist; each implement task is preceded by the failing test that should drive it.
5. Implement **red → green → refactor**, checking boxes, and move the spec's status along (`draft → clarified → planned → in-progress → done`).

### TDD always
Acceptance criteria (for a feature) or a reproducing case (for a bug) become a **failing test first**; then code makes it pass; then refactor. Tests run against **real OpenAI** (CI provides the key as a secret) and assert **structurally** (stages fired, tool used, answer non-empty, relevant doc ranks first) to tolerate model variability. Keyless guard tests (e.g. fail-fast-without-a-key) still run without a key; `[openai]` tests are skipped when none is configured.

### Does this change need a spec?
Specs are for **features and behavior changes**, not every edit. TDD, by contrast, applies to anything that changes behavior.

| Change | Spec? | TDD? |
|---|---|---|
| New feature, new user-facing behavior, **new `Stage`/`Phase`**, new station/hop/tier, any event-protocol change | **Yes** — full `spec → plan → tasks` | Yes |
| Bug fix · small adjustment · behavior-preserving refactor | **No** | **Yes** — write a failing regression test first, then fix |
| Docs · comments · formatting · dependency bumps · pure chores | No | n/a |

**Gray-zone rule:** if a change touches the event protocol (§1), adds/removes a `Stage`, or adds a station/hop/tier, treat it as a **feature → spec required**, however small it looks. When unsure, write the spec.

### Done means the gates are green
Mirror of `ci.yml` + the constitution: `ruff check .` · `ruff format .` · `pytest -q` (with `OPENAI_API_KEY`) · `npm run build` (`tsc --noEmit` + build) · `npm test` (Vitest) — **plus** the protocol mirror in sync (§1), every `Stage` mapped to a station (§6), all new user-facing text in **en + pt** (§4), and the cloud map filled for any new tier/station (§5).

## Commands

```bash
# Full stack (requires OPENAI_API_KEY in backend/.env)
docker compose up --build          # frontend :5173, backend :8000/docs

# Backend (from backend/)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.rag.ingest           # build/rebuild the Chroma index (idempotent)
uvicorn app.main:app --reload --port 8000
ruff check .                       # lint (CI gate)
ruff format .
pytest -q                          # all tests (needs OPENAI_API_KEY; keyless guard tests still run)
pytest tests/test_agent.py -q                              # one file
pytest tests/test_agent.py::test_math_question_invokes_calculator_tool   # one test
python -m app.mcp.server           # run the MCP server standalone (stdio)

# Frontend (from frontend/)
npm install
npm run dev                        # :5173
npm run build                      # tsc --noEmit + vite build (CI gate)
npm test                           # Vitest (CI gate) — runs *.test.ts(x) under src/
```

CI (`.github/workflows/ci.yml`) runs `ruff check` + `pytest` (Python 3.12) on the backend, and `npm run build` + `npm test` (Vitest, Node 20) on the frontend.

## Architecture — the load-bearing ideas

**The event protocol is the contract.** `backend/app/schemas.py` defines `Stage`, `Phase`, and `TraceEvent`; `frontend/src/types/events.ts` is a hand-maintained TypeScript mirror. **When you change one, change the other.** Every stage of the pipeline emits `TraceEvent`s that are both streamed to the browser over SSE *and* kept in a per-trace list for replay.

**Trace emission** (`backend/app/trace.py`). A `TraceEmitter` is threaded through every stage. Use `async with emitter.stage(Stage.X, label) as rec:` — it emits a `START` on enter, auto-times the body, and emits an `END` (with `rec.data` / `rec.metrics`) on exit. Use `emitter.emit(...)` directly for one-shot or `PROGRESS` events (e.g. per-token streaming). **Two-layer storage** (048-persist-traces): a bounded in-memory `TraceStore` (LRU=50) is the hot cache; every event is also persisted in real time to the `trace_events` SQLite table (`emit → _persist → store.write_trace_event`, via `asyncio.to_thread`; persist failures are logged + swallowed so SSE is never starved). `GET /api/trace/{id}` reads the cache first, then falls back to the DB and reconstructs the `TraceSummary` from there. **The app is still single-instance by design** (no shared state across replicas) — traces just survive restart now.

**The agent** (`backend/app/agent/graph.py`) is a bounded, canonical tool-calling ReAct loop:
`START → route → think ⇄ tools → generate → respond → END`. There is **no standalone `retrieve` node** — since 026-agent-tool-autonomy, retrieval is just another tool (`search_knowledge_base`, a *native* agent tool in `agent/tools.py`) that the model elects to call from `think`, so every retrieval is an honest agent decision visible as a normal tool-call chain. `think` decides (via the provider) whether to call tools; `_should_continue` loops back to `tools` while there are pending calls and `iterations <= MAX_ITERATIONS (3)`. The agent reasons over a canonical message thread (`AgentState.messages`) — `AIMessage(tool_calls=…)` is appended; each tool result returns as a `ToolMessage`. Nodes get their dependencies (`emitter`, `provider`, `registry`) from `config["configurable"]`, **not** from globals — see `_deps()`. The compiled graph is `lru_cache`d.

**Request-only inputs (not new stages).** `ChatRequest` carries a small set of optional overrides that change *how* a run executes without adding a pipeline stage. Omitting all of them reproduces today's behavior exactly:

- **Two-layer prompt (042-agent-anatomy)** — `system_prompt` replaces the **guardrails** layer (default `GUARDRAILS_PROMPT`, platform-wide rules) and `agent_prompt` replaces the **role** layer (default `AGENT_PROMPT`, this agent's identity). Both capped at 2000; blank/whitespace falls back. `_effective_system` composes guardrails + role + the skills catalog block (027-skills) into the single system message sent to the model.
- **Tools (006-interactive-experiments)** — `enabled_tools` (`None`=all, `[]`=none, list=only those) is filtered per-request via `ToolRegistry.specs(enabled)`, so `mcp.discover` honestly lists only enabled tools and the cached registry is never mutated.
- **`top_k`** (bounded 1..8) — RAG top-k override for the `search_knowledge_base` tool.
- **`model`** (042) — per-conversation OpenAI model override; validated against the curated allowlist in `llm/models.py` (422 on unlisted).
- **`scenario`** (008) and **`simulate_failure`** (017) — request-only enums, carried into state; see the maturity-ladder paragraph below and the failure-injection notes in `graph.py`.
- **`attachment_document_ids`** (040-message-attachments) — pins composer-uploaded documents to the turn that introduced them.

**Where these come from.** `GET /api/config` exposes the defaults (prompt, tool list, top-k bounds, model list) so the frontend prefills without hardcoding. **Agent identity (`name`, `description`, `system_prompt`, `agent_prompt`, `model`, `enabled_tools`) is now persisted in the `agents` SQLite table** (042-agent-anatomy → 043-persisted-agent → 044-shared-agent-catalog): one shared catalog of agents (**N sessions : 1 agent** — editing an agent propagates to every session using it), exposed via `GET/POST/DELETE/PATCH /api/agents` and bound to a session via `PATCH /api/sessions/{id}`. The "Configure agent" dialog opens from the Agent node; the composer's agent selector (045-composer-agent-selector) picks the active one and locks once a session has messages (server-enforced via `AgentLocked` → 409 `agent_locked`). What stays client-side in `useExperiment` (`frontend/src/lib/experiment.ts`) is just the per-conversation **`top_k`** + **`simulate_failure`**; the rest lives in the DB. The user-facing settings UI is a **dedicated `SettingsPage`** (041-settings-page), not a panel — the App `page` union is `"sim" | "learn" | "settings"` and `ConfigToggle` flips between them.

**The maturity ladder is now an à-la-carte builder (061-scenario-builder), not a rung selector.** The 008 global `Scenario` radio and the 059 `track` filter were **replaced** by a **component selection** (`frontend/src/lib/selection.ts`, a global `useSelection` store persisted to localStorage as `agentsim.selection`): the user composes the architecture in the header **"Build" popover** (`components/ScenarioBuilder.tsx`) by toggling individual `ComponentId`s on/off, and the maturity rung (`simple`|`intermediate`|`advanced`) becomes a **derived badge** via `classify(selection)`, never an input. A fixed skeleton (`frontend, backend, agent, llm, database`) is always on; `rag` + `mcp` are optional, default-on, so the default selection reproduces today's Simple set byte-for-byte. **084-network-edge (+ 085)** makes the network edge (reverse proxy / TLS / LB) **always-on platform behaviour** — `ChatRequest.edge: bool = True` (default flipped on 2026-06-22); it is **not** a Build component or a station (no toggle, no node — the user didn't want the box). The backend emits one `edge` `Stage` populated from the **forwarded headers** a real `nginx` (`docker-compose` + `infra/nginx/nginx.conf`) injects — honestly reporting `proxied=false` with no proxy in front (`backend/app/edge.py::read_edge`), and `edge=False` opts out. The `edge` stage **maps to the `backend` station** (the ingress it fronts); its full detail (the DNS·CDN·WAF·TLS/LB·API-GW chain + forwarded headers) renders in the **`frontend→backend` hop detail** (085 — click the arrow). DNS/CDN/WAF/API-gateway are preview-only chain segments (§3). The FE no longer sends `edge`; it relies on the backend default. The agent **runtime** is a radio (`react`|`deepagents`|`multiagent`). `stations.ts`'s `visibleStationsFor`/`visibleHopsFor`/`visibleTiersFor` and `computeLayout(expanded, selection, showUpload)` render exactly the selected stations (a `ResolvedSelection = {stations, runtime}`); a station shows iff it's in the selection (or is an upload-only node revealed by trace activity); a hop shows iff both endpoints are visible. **Two zones, honestly:** real components (rag · mcp · rerank · ragless · the deepagents runtime) execute and drive **per-feature request inputs**; preview components (`comingSoon`, `stages: []`) only draw a labelled box (§3 — they never fake a run; `STAGE_TO_STATION`/`STAGE_TO_PHASE` stay total). **The backend no longer takes a `scenario`** (061 removed it from `ChatRequest`): the behaviours it used to gate are explicit inputs — `rerank: bool` (reranker, was `scenario=="intermediate"` in `retriever.py`), `runtime` enum (DeepAgents preamble gate in `graph.py`), and the existing `ragless`. `/api/config` still ships the `scenarios` ladder metadata (names/blurbs) purely to label the derived badge. Sending is no longer gated (the skeleton always executes). The station `scenarios[]`/`tracks[]` fields remain as the maturity-floor + palette-category vocabulary.

**Agent runtime relabel (canvas label tracks the runtime radio).** The **agent node is relabelled by the selected runtime** (061; was scenario-keyed): `react` keeps `Agent`/`ReAct`; **`deepagents` → `DeepAgents`** (planner + sub-agents + virtual file system — a **real** runtime, 057); **`multiagent` → `DeepAgents + Multi-agents`** (orchestrator + specialized sub-agents; a **preview** runtime that reveals the `researcher/coder/critic` preview stations, `pt`: `DeepAgentes + Multiagentes`). This is `AGENT_RUNTIME_LABEL` + `relabelAgentForRuntime` in `stations.ts` (applied inside `visibleStationsFor`), overriding only the agent node's `title`/`tag` — **same `agent` id, stages and identity** (the Inspector/AgentDetail still read the unscoped `stationByIdFor`). DeepAgents executes for real; the multi-agent runtime is still a label/preview until its own spec wires a real multi-agent runtime.

**OpenAI is required — there is no demo/mock mode.** The `LLMProvider` ABC (`llm/provider.py`, Strategy pattern) stays as a thin seam, but `get_provider()` always returns `OpenAIProvider`; with no `OPENAI_API_KEY` it raises `MissingAPIKeyError` (defined in `config.py`) rather than falling back. `get_embeddings()` (`rag/embeddings.py`) does the same. **Everything is real** — reasoning, embeddings, the LangGraph loop, the Chroma vector store, the SQLite app database, and MCP tool *execution*. `/api/health` reads the model straight from settings (and reports `has_key`) so it stays inspectable even without a key.

**MCP** (`backend/app/mcp/`). `server.py` is a real FastMCP server with four tools — `calculator`, `current_time`, `kb_lookup`, `load_skill` (027-skills) — speaking over stdio. `client.py`'s `ToolRegistry` prefers loading those tools via `langchain-mcp-adapters` over stdio, but **falls back to calling the tool functions in-process** if the transport is unavailable — the agent and UI behave identically (`transport` is `mcp-stdio` vs `local-fallback`). The tool logic lives in plain `_`-prefixed functions in `server.py` precisely so the fallback can reuse it; **if you add/change a tool, update both the `@mcp.tool()` registration and the `_load_local()` mirror in `client.py`.** Beyond the MCP tools, the registry also exposes one **native** agent tool — `search_knowledge_base` (`agent/tools.py`) — that wraps the RAG retriever; from the model's perspective it is just another callable tool, which is what makes retrieval an honest agent decision (026-agent-tool-autonomy).

**RAG** (`backend/app/rag/`). `ingest.py` chunks the `data/corpus/*.md` files and builds a persistent Chroma collection (`ai_engineering`, cosine space). `retriever.py` embeds the query, does a top-k similarity search, and converts Chroma distance to a 0..1 score via `similarity = 1 - distance`. The index is auto-built on app startup if missing (`main.py` lifespan) and rebuilt fresh in `tests/conftest.py`. Rebuilds use Chroma's `reset_collection()` rather than deleting files (the dir is a mounted Docker volume). **Reranking (054-rag-block-expansion) is the first real Intermediate-rung upgrade:** on `scenario == "intermediate"`, `retriever.py` fetches a wider candidate pool (`rerank_fetch_k`) and `reranker.py` re-scores it with a **local FlashRank cross-encoder** (ONNX, no torch, no key — `RerankResult` carries the kept top-k + full rank movement), emitting `rag.rerank` between `rag.search` and `rag.retrieve`. **It is a query-time sub-stage of the `rag` (Vector DB) station — not a separate node** (`rag.stages` = `embed → search → rerank → retrieve`); the Vector DB tile animates it and shows a `reranked N→K` readout, the before/after detail rendering in the Vector DB inspector + the RAG drill-in. The Simple rung never reranks (byte-for-byte). The Vector DB tile has an "open full view" → `RagDetail` overlay (Chunking → Embedding → Retrieval → Reranking), a pure projection like `AgentDetail`.

**Two databases, on purpose.** Besides the RAG *vector* store, there is a *relational* application database (`backend/app/db/store.py`, `ConversationStore`) — a real SQLite store (managed SQL in production), the transactional system of record. **Seven tables** (`sessions`, `agents`, `messages`, `documents`, `message_documents`, `skills`, `trace_events`) — see [`docs/data-model.md`](docs/data-model.md) for the canonical reference (ERD, columns, cascade rules) and `_SCHEMA` in `store.py` for the source of truth (a schema-audit test pins them together). `main.py` emits `db.read` (load recent history) before the agent runs and `db.write` (persist the conversation) after, both inside the `BACKEND` stage; trace events stream into `trace_events` in real time (048-persist-traces). SQLite calls run via `asyncio.to_thread` so they don't block the event loop. The DB path is `app_db_path` in `config.py` (env `APP_DB_PATH`); `conftest.py` points it at a throwaway temp file. Keep the two stores distinct — embeddings vs transactional state are different jobs.

**Long-term memory is real.** `db.read` returns recent `{message, answer}` pairs; `main.py` passes them as `history` into `run_agent` → `AgentState.history` → the provider's `decide`/`stream_answer` (`history` param on the `LLMProvider` ABC and both impls), which folds them into the prompt and into `prompt_preview`. So the agent genuinely sees prior turns — working memory (per-request state) and long-term memory (the DB) are distinct, and the Agent drill-in visualizes both.

**Frontend rendering is a pure projection.** `frontend/src/lib/derive.ts`'s `deriveView(events, cursor)` turns the event log up to a cursor into everything the canvas draws (station statuses, the active hop and its direction, streamed answer, iteration count). **Live streaming and step/replay are the exact same code path — replay is just a smaller cursor.** The Zustand store (`store/useSimulator.ts`) holds the event list + cursor and drives both. `lib/sse.ts` is a custom fetch-based SSE client (the native `EventSource` only does GET; we need POST).

**Geometry vs. content are separate.** `lib/layout.ts`'s `computeLayout(expanded)` owns all canvas geometry — three columns (client / middle = API-over-Agent / data), stacked top-down, with per-station collapsed vs expanded heights; expanding a station reflows the ones below it and recomputes the tier boxes + the private-network boundary. `stations.ts` owns identity/content only. `FlowCanvas` reads positions/boxes from the layout, not from `stations.ts`.

**Progressive disclosure (Transformer-Explainer style).** The canvas is simple by default; each `StationNode` has a ⊕ that toggles inline expansion (compact internals), tracked by `expanded: StationId[]` in the store. The **Agent** additionally has an "open full view" that sets `detail` and renders `AgentDetail` — a focused overlay (over `<main>`) showing the ReAct loop, working memory, long-term memory and context-window assembly, all **composed client-side from existing trace events** (no extra requests). `FlowEdge` shows a hover tooltip (protocol/detail/zone/controls) via a transparent wide hit-path; **clicking an edge (085-hop-communication-detail)** sets `selectedHop` (edge id `"source-target"`, mutually exclusive with the station/traces selection) and the Inspector renders that hop's detail — the communication theory **plus the real per-run data that crossed it** (`lib/hopDetail.ts::deriveHopData`, a pure projection: request body, forwarded headers, SQL, chunks, tool calls, prompt+usage). The network edge's chain lives here, on the `frontend→backend` hop.

**`frontend/src/lib/stations.ts` is the single source of truth for the visual model** — tiers (deployable containers, each with a friendly `title` + canonical n-tier `alias`), stations (moving parts), network hops (protocol + `zone` public/private + security `controls`), and the private-network `BOUNDARY_SRC` (VNet/VPC) drawn behind the tiers. It also derives `STAGE_TO_STATION`, which `deriveView` relies on: **every `Stage` must be listed in exactly one station's `stages` array**, or events for an unmapped stage will break the projection. Adding a pipeline stage therefore means: new `Stage` in `schemas.py` + `events.ts`, emit it in the relevant node, assign it to a station in `stations.ts`, **and add a `case` for that station in both `readoutFor` (FlowCanvas) and `renderDetail` (InspectorPanel)** — these switches are exhaustive over `StationId`. There is a **second exhaustive map over `Stage`**: `STAGE_TO_PHASE` in `frontend/src/lib/phases.ts` (the timeline phase rail, 004-timeline-phases) — a new `Stage` must be assigned a `TimelinePhase` there too, or `tsc` fails on the `Record<Stage, TimelinePhase>` (the `phases.test.ts` AC1 test also pins parity with `STAGE_TO_STATION`).

**Cloud overlay.** The model is cloud-agnostic: every tier/station/boundary carries a `generic` role (translatable, the thing that matters) plus a `clouds: { azure, aws, gcp }` map of concrete example services (proper nouns, **not** translated). The active provider lives in `frontend/src/lib/cloud.ts` (`useCloud`, mirrors the language store); `cloudValue(meta, cloud)` resolves the label — `"generic"` returns the role, otherwise the cloud-specific name. **Do not fork the app per cloud; add provider names to the `clouds` map.** When you add a tier/station, fill all three of `azure`/`aws`/`gcp`.

**i18n** (`frontend/src/i18n/`). Two languages (`en`/`pt`). Translatable prose in `stations.ts` and `learn/content.ts` uses `{ en, pt }` objects resolved by `*For(lang)` builders (results cached per language). Code, protocols, and proper nouns stay plain strings.

> **Rule: every new piece of user-facing text must ship in both English and Portuguese.** Whenever you add a station, hop, Learn topic, label, blurb, error message, or any prose the user can read, provide both `en` and `pt` — never add an English-only (or Portuguese-only) string. Use the `{ en, pt }` shape (or `strings.ts` for UI chrome). A new feature is not done until its `pt` text exists alongside its `en` text.

## Conventions

- **SDD + TDD are mandatory** (see "How we build here" above): a new feature gets a spec under `specs/` before code; a behavior change is driven by a failing test first. This holds even when the request doesn't mention it.
- Backend is async throughout; `ruff` with `line-length=100` (E501 ignored), `pytest` in `asyncio_mode=auto`. Tests run against real OpenAI (mark model/embedding-dependent tests `@pytest.mark.openai`; they're skipped without a key) and assert structurally to tolerate model variability.
- Frontend uses React 18 + Vite + TS + `@xyflow/react` (React Flow) + Framer Motion + Tailwind v4 (via `@tailwindcss/vite`). `npm run build` type-checks with `tsc --noEmit`, so keep types clean.
- Config is read from `backend/.env` (see `.env.example`); `VITE_API_BASE` (build-time) points the frontend at the backend (empty = same origin, set in `docker-compose.yml`).
- **Bilingual by default:** any new user-facing text must be added in both English and Portuguese (`{ en, pt }`) — see the i18n rule above.

**The Arena is a second page, and a different kind of honesty (100 → 133).** Beside the
Simulator and Learn sits **Arena** (`frontend/src/arena/`): a drag-and-drop **capacity
sandbox** that answers "and when this has 100k users, where does it break?" It is an
**analytical model**, not a load test — deterministic arithmetic over stated benchmarks,
labelled as an estimate (§3). `model.ts` is the pure core (`computeMetrics`: Kahn
propagation, capacity caps, queueing latency, the 110 **closed-loop equilibrium** where
`rps = users/(think + e2e)`); `components.ts` holds the per-kind benchmarks; `store.ts`
persists to `localStorage`. **No `Stage`, no `TraceEvent`** — the Arena never pretends to
have measured a real run, and `Date.now`/`Math.random` are forbidden in every pure module
(a test greps for them).

The **Challenges module** (129 → 133) sits on top of it:

- **`slo.ts` (129)** — the measuring stick: four axes (**latency · headroom** are the
  discriminating pair, **shed** is the extreme-regime backstop, **cost** is opt-in), a
  verdict, the culprit box and a bilingual remediation hint. Two findings are worth knowing
  before touching it, both **measured**: the closed loop turns overload into *latency*, not
  429s (a design can sit at `shed = 0` and be unusable), and **cost alone rewards
  under-provisioning** — the starved design is the cheapest one, which is why cost ships off
  by default.
- **`challenges.ts` (130)** — a library of problems with **locked givens** (the load belongs
  to the problem, not the player) and pinned targets. Every challenge ships a **reference
  solution** and a **broken starting design**, and library-walking tests assert the reference
  passes with **≥20% slack** while the start misses by ≥20%. A recalibration therefore breaks
  a *test*, never silently makes a challenge impossible — **re-tune the challenge, never
  weaken the walk.**
- **`chaos.ts` (131)** — failure injection as a **pure design transform**: `faults?` is an
  additive field on `ArenaDesign` (the shape 117's `callShape` proved), so *every* derived
  readout inherits it with no signature change. Faults are transient (never persisted).
- **`progress.ts` (132)** — attempt history under its **own** `localStorage` key, so clearing
  a canvas never erases a record of learning. Figures are denormalised on purpose: history
  must not be rewritten by a later recalibration.
- **`arena/judge.py` (133)** — the Arena's **only backend footprint**, and the one place spec
  100's "frontend-only" no longer holds: `POST /api/arena/judge` runs two opposed personas in
  parallel plus a synthesis (three real model calls — that independence is what earns the word
  *debate*). Stateless: no DB, no trace, no `Stage`. **The arithmetic is authoritative** — the
  response has no verdict field for the model to write into, and 120's user notes enter the
  prompt inside an explicitly-delimited **untrusted** block.

## Docs

- `docs/architecture.md` and `docs/how-it-works.md` — long-form walkthroughs of the running system (kept in sync with the code above).
- `docs/development-workflow.md` — how to build here (SDD + TDD), the contributor-facing companion to `.specify/constitution.md` and `specs/README.md`.
- `docs/data-model.md` — canonical schema reference for the SQLite relational store: ERD + per-table columns + cascade rules + "what's NOT a table" (tools / configs / vectors / objects). The schema-audit test (`backend/tests/test_schema_audit.py`) keeps this in sync with the code.
- `docs/roadmap.md` — bilingual contributor TODO list of every Intermediate / Advanced rung node and cross-cutting seam still labelled "coming soon" on the canvas; each item is the seed of its own future spec.
