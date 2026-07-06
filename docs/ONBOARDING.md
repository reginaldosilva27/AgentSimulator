# 🧭 AI Agent Simulator — Onboarding Guide

> Generated from the [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) knowledge graph
> (`.understand-anything/knowledge-graph.json`). To explore it interactively, see
> [Understand the codebase](../README.md#-understand-the-codebase-knowledge-graph) in the README.

## 1. Project Overview

**AI Agent Simulator** is an interactive, educational **X-ray of a real agentic AI request lifecycle**. You type a message; a real **LangGraph** agent (RAG → MCP tools → LLM) runs and emits every stage as a stream of trace events; the frontend animates those events across a graph of clickable "stations" showing the *real* data. **Nothing is mocked** — it runs only against OpenAI. Bilingual (en/pt), built **spec-first and test-first**.

| | |
|---|---|
| **Languages** | Python, TypeScript, + CSS/HTML/JSON/TOML/Dockerfile |
| **Backend** | FastAPI · LangGraph · LangChain · MCP · Chroma · FlashRank |
| **Frontend** | React 18 · Vite · Zustand · React Flow · Framer Motion · Tailwind |
| **Deploy** | Docker (2-container stack: nginx-served frontend + FastAPI backend) |
| **Graph scope** | 558 nodes / 1091 edges · 10 layers · `backend/` + `frontend/` source |

---

## 2. Architecture Layers

The system decomposes into **10 layers**. The mental model: a request flows down the backend (top 7 layers), streams back as events, and the frontend (bottom 3 layers) projects them.

| Layer | Nodes | What lives here |
|---|--:|---|
| **Infrastructure & Build** | 17 | Dockerfiles, nginx config, build manifests (pyproject/package.json/tsconfig/vite), test harness |
| **Backend Core & Event Protocol** | 7 | `main.py` orchestration, `config.py`, **`schemas.py` (the contract)**, `trace.py`, edge headers |
| **Agent Runtime** | 7 | The bounded LangGraph ReAct loop, DeepAgents runtime, native agent tools |
| **LLM Providers** | 8 | `LLMProvider` Strategy seam + OpenAI/Ollama/VertexAI impls + model allowlist |
| **RAG & Retrieval** | 11 | Chroma pipeline: ingest/chunk → embed → search → rerank → hybrid BM25 → PageIndex → metrics |
| **MCP Tools** | 3 | Real FastMCP server + client `ToolRegistry` with dual stdio/in-process transport |
| **Persistence & Data** | 6 | SQLite `ConversationStore` (system of record), object storage, retrieval golden set |
| **Frontend Shell & UI** | 68 | React Flow canvas, inspector, chat panel, detail overlays, Settings/Configure pages, i18n |
| **Client Logic & State** | 60 | Pure-projection core: `stations.ts`, `derive`/`layout`/`selection`, SSE/REST clients, Zustand stores |
| **Demo Fixtures** | 83 | Backend-less GitHub Pages demo: fixtures loader + captured real-trace JSON files |

---

## 3. Key Concepts (the load-bearing ideas)

1. **The event protocol is the contract.** `schemas.py` (Python) and `events.ts` (TypeScript) are hand-maintained mirrors. Change one → change the other. Everything is keyed off `Stage`/`Phase`/`TraceEvent`.
2. **The backend never renders — it emits a truthful event stream.** The frontend is a **pure projection** of that stream (`derive.ts`). *Live streaming and step/replay are the exact same code path — replay is just a smaller cursor.*
3. **Retrieval is an honest agent decision.** There's no standalone `retrieve` node; `search_knowledge_base` is just a tool the model *elects* to call — so every RAG lookup is visible as a normal tool call.
4. **Bounded ReAct loop.** `START → route → think ⇄ tools → generate → respond → END`, capped at `MAX_ITERATIONS=3`.
5. **Two databases on purpose.** RAG *vector* store (Chroma) ≠ relational *system of record* (SQLite). Different jobs.
6. **Single source of truth for the visual model.** `stations.ts` defines tiers/stations/hops and derives `STAGE_TO_STATION` — every `Stage` must map to exactly one station or the projection breaks.
7. **Everything is real, OpenAI-only.** No mock mode; fails fast without `OPENAI_API_KEY`.
8. **Bilingual by default.** Every user-facing string ships in en + pt via `i18n/index.ts` (the most depended-upon file).

---

## 4. Guided Tour (recommended reading path — follow a message end-to-end)

| # | Stop | Files |
|--:|---|---|
| 1 | **Two Entry Points** — client + server front doors | `main.tsx`, `App.tsx`, `main.py` |
| 2 | **The `/api/chat` Lifecycle** — db.read → agent → SSE → db.write | `main.py`, `config.py` |
| 3 | **The Event Protocol Is the Contract** — the parity discipline | `schemas.py`, `events.ts` |
| 4 | **Emitting the Trace** — `async with emitter.stage(...)` span pattern | `trace.py` |
| 5 | **The Agent — A Bounded ReAct Loop** | `agent/graph.py` |
| 6 | **Tools & the DeepAgents Runtime** | `agent/tools.py`, `agent/deepagents.py` |
| 7 | **The LLM Provider Seam** — Strategy pattern, high fan-in | `llm/provider.py`, `llm/openai_provider.py` |
| 8 | **RAG — Retrieval as a Pipeline** | `rag/retriever.py`, `ingest.py`, `reranker.py`, `hybrid.py` |
| 9 | **MCP Tools & the Dual Transport** — dual registration gotcha | `mcp/server.py`, `mcp/client.py` |
| 10 | **Persistence — The System of Record** (7 tables) | `db/store.py` |
| 11 | **Pure Projection — Events → View** | `lib/sse.ts`, `lib/derive.ts`, `store/useSimulator.ts` |
| 12 | **The Visual Model & Its Geometry** | `lib/stations.ts`, `lib/layout.ts` |
| 13 | **Rendering & Inspection** | `ChatPanel.tsx`, `FlowCanvas.tsx`, `StationNode.tsx`, `InspectorPanel.tsx` |
| 14 | **Bilingual Prose & Packaging** | `i18n/index.ts`, both `Dockerfile`s |

**5 tour steps carry a language lesson:** async context managers as timed spans (4), LangGraph conditional-edge loops (5), hand-mirrored protocol contracts (3), MCP stdio + graceful in-process fallback (9), and multi-stage Docker builds (14).

---

## 5. File Map (backend, by layer)

**Backend Core** — `main.py` (orchestration + SSE), `config.py` (settings + fail-fast), `schemas.py` (protocol), `trace.py` (`TraceEmitter`), `edge.py` (forwarded headers).

**Agent Runtime** — `graph.py` (ReAct loop), `tools.py` (`search_knowledge_base` native tool), `deepagents.py` (planner + sub-agents + virtual FS).

**LLM Providers** — `provider.py` (ABC + dataclasses + `get_provider()`), `openai_provider.py` (primary), `ollama_provider.py`, `vertexai_provider.py`, `models.py` (allowlist), `context.py` (tiktoken budget), `pricing.py` (USD cost).

**RAG & Retrieval** — `retriever.py` (embed + top-k + optional hybrid/rerank), `ingest.py` (corpus → Chroma), `ingestion.py` (upload write-path, incl. PDF), `chunking.py` (4 strategies), `embeddings.py` (backend resolver), `store.py` (Chroma client), `reranker.py` (FlashRank), `hybrid.py` (BM25 + RRF), `pageindex.py` (RAGLESS), `metrics.py` (P@k/R@k/MRR).

**MCP Tools** — `server.py` (FastMCP: calculator, current_time, kb_lookup, load_skill, web_search), `client.py` (`ToolRegistry` + fallback).

**Persistence** — `db/store.py` (7-table SQLite), `db/seed.py` (default agent + skills), `storage/object_store.py` (S3-analog), `data/retrieval_golden.json`.

**Frontend** (high-level): `lib/stations.ts` + `lib/derive.ts` + `lib/layout.ts` are the projection core; `components/FlowCanvas.tsx` + `InspectorPanel.tsx` + `ChatPanel.tsx` are the surface; `store/useSimulator.ts` + `store/useChat.ts` hold state; `lib/chatApi.ts` + `lib/sse.ts` talk to the backend.

---

## 6. Complexity Hotspots (approach carefully — 42 files rated "complex")

**Backend:**
- 🔴 `agent/graph.py` — the ReAct state machine, failure injection, iteration bounding.
- 🔴 `db/store.py` — 7 tables + **versioned migration ritual** (`PRAGMA user_version`), agent catalog, trace persistence.
- 🔴 `config.py` — provider/model resolution + DB-backed config precedence + fail-fast contract.
- 🔴 `agent/deepagents.py` — planner + delegated sub-agents over a virtual FS.
- 🔴 `llm/ollama_provider.py` — tool-call extraction + stripping leaked tool-call JSON.

**Frontend:**
- 🔴 `lib/stations.ts` — **single source of truth**; touching it ripples across the whole canvas.
- 🔴 `store/useSimulator.ts` — drives both live + replay via one cursor.
- 🔴 `lib/derive.ts` — the pure projection everything renders from.
- 🔴 `components/InspectorPanel.tsx` + `FlowCanvas.tsx` — **exhaustive `switch` over `StationId`** (adding a station means adding cases here).
- 🔴 `i18n/strings.ts` — the giant bilingual string catalog.
- 🔴 `lib/chatApi.ts` / `lib/demo.ts` — REST client / demo replay engine.
- 🔴 `store/useChat.ts`, `components/AgentDetail.tsx`, `IngestionPipelinePanel.tsx`, `lib/executionTree.ts`, `lib/stationDetail.ts` — large drill-in / span-tree projections.

> **First-week tip:** read the tour in order (§4), then trace one real message from `ChatPanel.tsx` → `main.py` → `graph.py` → back to `derive.ts`. Don't touch `stations.ts` / `schemas.py` / `events.ts` until you understand the protocol-parity rule — those three are the spine.

---

*This guide is a static snapshot. For the live, clickable graph (search, layers, tour, per-file drill-ins), launch the Understand-Anything dashboard against the committed `.understand-anything/knowledge-graph.json` — see the README section linked at the top.*
