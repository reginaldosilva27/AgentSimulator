"""FastAPI entrypoint.

Exposes a streaming chat endpoint (``POST /api/chat``) that runs the agent and
emits the lifecycle as Server-Sent Events, a trace-replay endpoint
(``GET /api/trace/{id}``), a health check, and the session / message / document
REST surface that backs the interactive chat (002-interactive-chat).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from contextlib import asynccontextmanager
from dataclasses import replace
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .agent import run_agent
from .agent.prompts import AGENT_PROMPT, GUARDRAILS_PROMPT
from .agent.tools import agent_tool_specs
from .arena.judge import JudgeInput, judge_design
from .arena.ratelimit import FixedWindowLimiter
from .config import (
    MissingAPIKeyError,
    effective_embedding_model_async,
    effective_embedding_provider_async,
    effective_openai_key,
    get_settings,
    has_effective_openai_key,
)
from .db.seed import seed_default_agent, seed_skills
from .db.store import (
    AgentLocked,
    CannotDeleteDefaultAgent,
    DuplicateSkillName,
    UnknownAgentId,
    get_store,
)
from .edge import read_edge
from .llm.context import history_pair_tokens
from .llm.models import (
    DEFAULT_PROVIDER,
    models_payload,
    provider_ids,
    providers_payload,
    vertexai_embedding_model_ids,
    vertexai_embedding_models_payload,
    vertexai_model_ids,
    vertexai_models_payload,
)
from .llm.provider import get_provider
from .mcp.client import get_registry
from .network import DNS_ORIGIN_HOST, network_available, read_network, resolve_dns
from .rag.chunking import CHUNK_PARAM_BOUNDS, ChunkStrategy
from .rag.ingest import active_chunk_strategy, build_index
from .rag.ingestion import delete_document_vectors, delete_uploaded_vectors, ingest_uploaded
from .rag.metrics import benchmark_queries
from .rag.store import index_matches_model, is_indexed, reset_vectorstore_cache
from .schemas import (
    ARENA_JUDGE_NOTE_MAX,
    ArenaJudgeRequest,
    ArenaJudgeResponse,
    ChatRequest,
    Phase,
    SimulateFailure,
    SkillIn,
    SkillOut,
    Stage,
)
from .storage.object_store import (
    clear_objects,
    delete_document_objects,
    object_key,
    put_object,
)
from .trace import TraceEmitter, trace_store


def _retrieved_chunks(emitter: TraceEmitter) -> list[dict[str, Any]]:
    """The chunks the agent retrieved this run, persisted with the message (D5/AC8).

    Prefers the vector ``rag.retrieve`` events. The agent may search the knowledge base
    **more than once** (each ``search_knowledge_base`` call is its own ``rag.retrieve``),
    so this returns **every** chunk from **every** search, in order, each tagged with the
    ``query`` that retrieved it and a 1-based ``search`` index. No dedup: the same chunk
    retrieved by two queries is honestly shown under both (with each query's own score),
    so "Sources used" groups by search and shows everything that grounded the answer —
    not just the final query's hits.

    066-retrieval-strategy-radio: under the RAGLESS strategy the vector path is skipped
    (no ``rag.retrieve``), so fall back to the PageIndex-selected sections
    (``pageindex.select`` END) — those are what actually grounded the answer."""
    out: list[dict[str, Any]] = []
    search = 0
    for ev in emitter.events:
        if ev.stage == Stage.RAG_RETRIEVE and ev.phase == Phase.END:
            search += 1
            query = ev.data.get("query")
            for chunk in ev.data.get("chunks", []) or []:
                out.append({**chunk, "query": query, "search": search})
    if out:
        return out
    for ev in reversed(emitter.events):
        if ev.stage == Stage.PAGEINDEX_SELECT and ev.phase == Phase.END:
            return list(ev.data.get("chunks", []))
    return []


def _applied_skills(emitter: TraceEmitter) -> list[str]:
    """The distinct skills the agent loaded this run (027-skills): the ``name`` arg
    of each successful ``load_skill`` ``mcp.call``. Persisted with the message so
    the "skills applied" badge survives reload/replay (a pure projection of the
    trace — no new Stage)."""
    applied: list[str] = []
    for ev in emitter.events:
        if ev.stage != Stage.MCP_CALL or ev.phase != Phase.END:
            continue
        if ev.data.get("tool") != "load_skill":
            continue
        result = ev.data.get("result", "")
        name = (ev.data.get("args") or {}).get("name")
        if name and isinstance(result, str) and not result.startswith("error:"):
            if name not in applied:
                applied.append(name)
    return applied


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Build the vector index on first boot if it's missing, or rebuild it if the
    # persisted index was built with a different embedding model (e.g. EMBEDDING_MODEL
    # changed, so the persisted dimension no longer matches the live one).
    try:
        if not is_indexed():
            count = build_index()
            print(f"[startup] Built vector index ({count} chunks).")
        elif not index_matches_model():
            reset_vectorstore_cache()  # drop any stale collection handle first
            count = build_index()
            print(f"[startup] Embedding model changed — rebuilt index ({count} chunks).")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not build index: {exc!r}")
    # 027-skills: seed the example skill catalog when it's empty (idempotent).
    try:
        added = await seed_skills()
        if added:
            print(f"[startup] Seeded {added} example skills.")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not seed skills: {exc!r}")
    # 043-persisted-agent: ensure the default "Agent Simulator" exists so the
    # first `create_session` after boot has something to clone.
    try:
        if await seed_default_agent():
            print("[startup] Seeded default agent.")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not seed default agent: {exc!r}")
    # 056-ragless-pageindex: pre-build the PageIndex document tree (cached) so the
    # RAGLESS path is "pre-indexed" like the vector store, not built on first request.
    try:
        from .rag.pageindex import build_tree

        tree = build_tree()
        print(f"[startup] Built PageIndex tree ({len(tree.children)} documents).")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not build PageIndex tree: {exc!r}")
    yield


app = FastAPI(title="AI Agent Simulator", version="0.1.0", lifespan=lifespan)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    # Read the model straight from settings so health stays inspectable even
    # without a key (constructing the provider would fail fast). `has_key` lets
    # the frontend surface a clear "OpenAI key required" state.
    settings = get_settings()

    provider = "openai"
    model = settings.llm_model
    try:
        from .db.store import DEFAULT_AGENT_ID, get_store

        agent = await get_store().get_agent(DEFAULT_AGENT_ID)
        if agent:
            provider = agent.get("provider", "openai")
            model = agent.get("model", settings.llm_model)
    except Exception:
        pass

    return {
        "status": "ok",
        "llm_provider": provider,
        "llm_model": model,
        # 078-openai-key-ui: reflect the EFFECTIVE key (UI/DB precedes env).
        "has_key": has_effective_openai_key(),
        "indexed": is_indexed(),
        "embedding_provider": await effective_embedding_provider_async(),
        "embedding_model": await effective_embedding_model_async(),
    }


# The maturity ladder (008-scenario-framework). The bilingual name/blurb live
# here so the scenario switcher prefills from /api/config (like the tools and the
# default prompt) — nothing about the ladder is hardcoded client-side. Only the
# `simple` rung executes today; the upper rungs are non-executing previews until
# their own specs (009+) light up their real nodes (`available` flips then).
SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "simple",
        "name": {"en": "Simple", "pt": "Simples"},
        "blurb": {
            "en": "ReAct + vector RAG + MCP tools, bounded loop — today's app.",
            "pt": "ReAct + RAG vetorial + ferramentas MCP, loop limitado — o app de hoje.",
        },
        "available": True,
    },
    {
        "id": "intermediate",
        "name": {"en": "Intermediate", "pt": "Intermediário"},
        "blurb": {
            "en": "Adds reranking, hybrid search and real token/cost accounting.",
            "pt": "Adiciona reranking, busca híbrida e contagem real de tokens/custo.",
        },
        # 054-rag-block-expansion lit up the first real Intermediate node — a local
        # cross-encoder reranker on the RAG path — so the rung now executes.
        "available": True,
    },
    {
        "id": "advanced",
        "name": {"en": "Advanced", "pt": "Avançado"},
        "blurb": {
            "en": "Production AI-Ops: gateway, guardrails, cache, evals, observability.",
            "pt": "AI-Ops de produção: gateway, guardrails, cache, evals, observabilidade.",
        },
        "available": False,
    },
]


@app.get("/api/config")
async def config() -> dict:
    """Defaults the experiment panel (006-interactive-experiments) prefills with,
    so nothing about the agent is hardcoded client-side. Like ``/api/health`` it
    is inspectable without an OpenAI key (the registry is independent of the LLM).
    The top-k bounds mirror ``ChatRequest.top_k`` (1..8); ``scenarios`` is the
    008 maturity ladder."""
    settings = get_settings()
    registry = await get_registry()
    return {
        # 042-agent-anatomy split the prior single prompt into two layers.
        # ``default_system_prompt`` now ships the **guardrails** text; the prior
        # role text is exposed separately as ``default_agent_prompt`` so the FE
        # can prefill each textarea independently.
        "default_system_prompt": GUARDRAILS_PROMPT,
        "default_agent_prompt": AGENT_PROMPT,
        "default_top_k": settings.rag_top_k,
        "top_k_min": 1,
        "top_k_max": 8,
        # 055-rerank-score-threshold — the minimum rerank-score slider (Intermediate).
        "default_rerank_threshold": settings.rerank_threshold_default,
        "rerank_threshold_step": 0.05,
        # 056-ragless-pageindex — default state of the RAGLESS (PageIndex) toggle.
        "ragless_default": False,
        # 071-retrieval-metrics — the labelled benchmark queries the RAG drill-in
        # offers as one-click chips, so the metrics (Precision@k / Recall@k / MRR)
        # are discoverable instead of hidden behind guessing the exact query.
        "benchmark_queries": benchmark_queries(),
        # 072-chunking-strategies — the chunker the live index was last built with,
        # plus the strategies the ⚙️ Settings picker + re-ingest can choose from. Labels
        # are i18n on the frontend; the backend only ships the ids.
        "chunk_strategy": active_chunk_strategy(),
        "chunk_strategies": [s.value for s in ChunkStrategy],
        # 081-chunking-config — per-strategy tunable parameters + their default/min/max,
        # so the Settings → Knowledge base picker renders exactly the relevant controls
        # (fixed/recursive: size+overlap; semantic: threshold+size; agentic: max_segments)
        # without hardcoding bounds. Single source of truth: CHUNK_PARAM_BOUNDS.
        "chunk_params": {
            strat.value: {
                key: {"default": default, "min": lo, "max": hi}
                for key, (default, lo, hi) in bounds.items()
            }
            for strat, bounds in CHUNK_PARAM_BOUNDS.items()
        },
        # The full tool list the agent sees — knowledge-base retrieval plus the
        # MCP tools (026-agent-tool-autonomy) — so the experiment panel lists every
        # tool the agent can choose, not just the MCP ones.
        "tools": [
            {"name": s.name, "description": s.description} for s in agent_tool_specs(registry, None)
        ],
        "scenarios": SCENARIOS,
        # 017-failure-injection: the allowed values for the "Simulate failure"
        # selector, so the frontend never hardcodes them (AC4).
        "failure_modes": [m.value for m in SimulateFailure],
        # 098-verify-reflection-loop: the default state of the "Verification loop"
        # toggle, so the experiment panel prefills without hardcoding it (AC8).
        "verify_default": False,
        # 042-agent-anatomy: the curated OpenAI chat-model list the Agent
        # Anatomy dialog renders, plus the server's resolved default. The FE
        # never hardcodes model ids; the API validates ``ChatRequest.model``
        # against this list. Keep the payload shape stable — frontend types
        # mirror it.
        "models": models_payload(),
        "default_model": settings.llm_model,
        # 065-provider-and-model-refresh: the LLM providers the dialog advertises.
        # OpenAI is the one usable provider; Ollama is a disabled preview. The FE
        # never hardcodes provider proper nouns.
        "providers": providers_payload(),
        "default_provider": DEFAULT_PROVIDER,
        # 074-ollama-provider: the default local server URL the FE prefills the
        # "Server URL" field with (the live, persisted value comes from
        # GET /api/settings/ollama). Never hardcoded client-side.
        "default_ollama_base_url": settings.ollama_base_url,
        "vertexai_models": vertexai_models_payload(),
        "vertexai_embedding_models": vertexai_embedding_models_payload(),
        "default_vertexai_project": settings.vertexai_project,
        "default_vertexai_location": settings.vertexai_location,
        # 075-ollama-embeddings: the effective embedding provider + model so the
        # Settings page prefills without hardcoding.
        "embedding_provider": await effective_embedding_provider_async(),
        "embedding_model": await effective_embedding_model_async(),
        # 088-network-layer: whether the real ingress chain (DNS · CDN · WAF · TLS/LB
        # · API-GW) is present (the Docker network stack is up). The Build "Network"
        # component is enabled only when True — a bare `uvicorn` run reports False
        # since the appliance containers aren't there.
        "network_available": network_available(),
    }


# --- Ollama provider (074-ollama-provider) ----------------------------------


class OllamaSettings(BaseModel):
    """Body of ``PUT /api/settings/ollama`` — the instance-wide local server URL."""

    base_url: str = Field(min_length=1, max_length=300)


@app.get("/api/settings/ollama")
async def get_ollama_settings() -> dict:
    """The persisted Ollama server URL (DB), falling back to the env default.

    The backend (the LLM caller) is what connects to this address, so it is
    stored server-side rather than only in the browser — it survives restart."""
    settings = get_settings()
    stored = await get_store().get_config("ollama_base_url")
    return {"base_url": stored or settings.ollama_base_url}


@app.put("/api/settings/ollama")
async def set_ollama_settings(body: OllamaSettings) -> dict:
    """Persist the Ollama server URL (instance-global ``app_config`` row)."""
    base_url = body.base_url.strip()
    if not base_url:
        raise HTTPException(status_code=422, detail="base_url cannot be blank")
    await get_store().set_config("ollama_base_url", base_url)
    return {"base_url": base_url}


@app.get("/api/ollama/models")
async def list_ollama_models(base_url: str | None = None) -> dict:
    """List the models installed on an Ollama server (proxies its ``/api/tags``).

    The backend probes the server (not the browser) so reachability + CORS are
    handled here. An unreachable/erroring server yields a structured
    ``{reachable: false, error, models: []}`` (HTTP 200) so the FE can show a
    helpful hint instead of treating it as a hard failure."""
    settings = get_settings()
    url = (base_url or "").strip()
    if not url:
        url = (await get_store().get_config("ollama_base_url")) or settings.ollama_base_url
    tags_url = url.rstrip("/") + "/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(tags_url)
            resp.raise_for_status()
            payload = resp.json()
    except Exception as exc:  # noqa: BLE001 - any failure is reported, not raised
        return {"reachable": False, "error": str(exc), "base_url": url, "models": []}
    models = [
        {"id": m["name"], "size": m.get("size"), "modified_at": m.get("modified_at")}
        for m in payload.get("models", [])
        if isinstance(m, dict) and m.get("name")
    ]
    return {"reachable": True, "base_url": url, "models": models}


# --- OpenAI key + dynamic model listing (078-openai-key-ui) -----------------

# Chat-capable OpenAI model id prefixes (excludes embeddings/audio/image models).
_OPENAI_CHAT_PREFIXES = ("gpt-", "o1", "o3", "o4", "chatgpt-")


class OpenAISettings(BaseModel):
    """Body of ``PUT /api/settings/openai`` — the OpenAI API key. Blank clears it."""

    api_key: str = Field(default="", max_length=300)


def _mask_key(key: str) -> str:
    """A safe hint for a stored secret — never the full value."""
    key = key.strip()
    if len(key) <= 8:
        return "sk-…" if key else ""
    return f"{key[:3]}…{key[-4:]}"


def _openai_client(key: str):
    """Construct an OpenAI client (lazy import). Patched in tests."""
    from openai import OpenAI

    return OpenAI(api_key=key)


def _list_openai_chat_models(key: str) -> dict:
    """Call OpenAI ``/v1/models`` and keep only chat-capable models."""
    try:
        client = _openai_client(key)
        raw = client.models.list()
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        return {"reachable": False, "error": str(exc), "models": []}
    ids = sorted(
        {
            m.id
            for m in getattr(raw, "data", [])
            if isinstance(getattr(m, "id", None), str) and m.id.startswith(_OPENAI_CHAT_PREFIXES)
        }
    )
    return {"reachable": True, "models": [{"id": i} for i in ids]}


@app.get("/api/settings/openai")
async def get_openai_settings() -> dict:
    """Report whether an OpenAI key is configured + a masked hint + its source.

    Never returns the full key (constitution §2). ``source`` is ``"db"`` when the
    UI-saved key is in effect, ``"env"`` when only the env key is set, else ``None``."""
    db_key = (await get_store().get_config("openai_api_key") or "").strip()
    env_key = get_settings().openai_api_key.strip()
    effective = db_key or env_key
    source = "db" if db_key else ("env" if env_key else None)
    return {
        "has_key": bool(effective),
        "masked": _mask_key(effective) or None,
        "source": source,
    }


@app.put("/api/settings/openai")
async def set_openai_settings(body: OpenAISettings) -> dict:
    """Save (or clear, when blank) the OpenAI key and test the connection.

    Persists to ``app_config`` (DB precedes env). On a non-blank key, a cheap
    ``/v1/models`` call validates it; the result rides the response so the UI can
    show connected/failed without a second round-trip."""
    key = body.api_key.strip()
    await get_store().set_config("openai_api_key", key)
    if not key:
        return {"ok": True, "has_key": has_effective_openai_key(), "masked": None, "tested": False}
    result = await asyncio.to_thread(_list_openai_chat_models, key)
    return {
        "ok": bool(result.get("reachable")),
        "has_key": True,
        "masked": _mask_key(key),
        "tested": True,
        "model_count": len(result.get("models", [])),
        "error": result.get("error"),
    }


@app.get("/api/openai/models")
async def list_openai_models() -> dict:
    """List the account's chat models live (effective key). No key / failure →
    structured ``{reachable: false, models: []}`` so the FE falls back to curated."""
    key = effective_openai_key()
    if not key:
        return {"reachable": False, "error": "no key configured", "models": []}
    return await asyncio.to_thread(_list_openai_chat_models, key)


# --- Vertex AI provider (089-vertex-ai-provider) ----------------------------


class VertexAISettings(BaseModel):
    """Body of ``PUT /api/settings/vertexai`` — Vertex AI credentials and configuration."""

    project: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=100)
    credentials: str | None = Field(default=None, max_length=10000)
    model: str = Field(default="gemini-2.5-flash", min_length=1, max_length=100)


def validate_vertexai_connection(
    project: str, location: str, credentials_json: str, model: str = "gemini-2.5-flash"
) -> tuple[bool, str | None]:
    """Test connection to Vertex AI using the given model.

    Tries to instantiate a ChatVertexAI client and run a simple invocation
    (a simple 1-token prediction check) to verify permissions and settings.
    The ``model`` argument uses whichever Gemini model the user selected so the
    test validates that specific model endpoint, not a hardcoded fallback.
    """
    try:
        import json

        from langchain_core.messages import HumanMessage
        from langchain_google_vertexai import ChatVertexAI

        gcp_creds = None
        if credentials_json and credentials_json.strip():
            import google.auth

            creds_data = json.loads(credentials_json.strip())
            gcp_creds, _ = google.auth.load_credentials_from_dict(
                creds_data,
                scopes=["https://www.googleapis.com/auth/cloud-platform"],
            )

        client = ChatVertexAI(
            model=model,
            project=project,
            location=location,
            credentials=gcp_creds,
            temperature=0,
            max_output_tokens=1,
        )

        # Make a very simple call
        client.invoke([HumanMessage(content="test")])
        return True, None
    except Exception as exc:
        return False, str(exc)


@app.get("/api/settings/vertexai")
async def get_vertexai_settings() -> dict:
    """The persisted Vertex AI credentials and configurations (DB), falling back to settings."""
    settings = get_settings()
    store = get_store()

    project = (await store.get_config("vertexai_project")) or settings.vertexai_project
    location = (await store.get_config("vertexai_location")) or settings.vertexai_location
    credentials = (await store.get_config("vertexai_credentials")) or settings.vertexai_credentials

    masked = None
    if credentials:
        try:
            import json

            masked = json.loads(credentials.strip()).get("client_email")
        except Exception:
            masked = "Credentials are saved."

    return {
        "project": project,
        "location": location,
        "has_credentials": bool(credentials),
        "masked_credentials": masked,
    }


@app.put("/api/settings/vertexai")
async def set_vertexai_settings(body: VertexAISettings) -> dict:
    """Save Vertex AI credentials and configurations, then validate the connection."""
    settings = get_settings()
    store = get_store()

    project = body.project.strip()
    location = body.location.strip()

    if not project or not location:
        raise HTTPException(status_code=422, detail="project and location cannot be blank")

    # Read existing credentials from DB / settings
    existing_creds = (
        await store.get_config("vertexai_credentials")
    ) or settings.vertexai_credentials

    existing_email = None
    if existing_creds:
        try:
            import json

            existing_email = json.loads(existing_creds.strip()).get("client_email")
        except Exception:
            pass

    creds_input = body.credentials
    use_existing = False

    if creds_input is not None:
        creds_stripped = creds_input.strip()
        if not creds_stripped:
            if existing_creds:
                use_existing = True
            else:
                use_existing = False
        elif existing_email and creds_stripped == existing_email:
            use_existing = True
        elif creds_stripped == "Credentials are saved.":
            use_existing = True
        else:
            try:
                import json

                creds_data = json.loads(creds_stripped)
                if not isinstance(creds_data, dict) or "client_email" not in creds_data:
                    raise ValueError("Missing 'client_email' in Service Account JSON")
            except Exception as e:
                raise HTTPException(
                    status_code=422, detail=f"Invalid Google Service Account Key JSON: {e}"
                ) from e
    else:
        use_existing = True

    if use_existing:
        if not existing_creds:
            raise HTTPException(
                status_code=422,
                detail="Google Service Account Key JSON is required and cannot be blank",
            )
        effective_creds = existing_creds
    else:
        if not creds_input or not creds_input.strip():
            raise HTTPException(
                status_code=422,
                detail="Google Service Account Key JSON is required and cannot be blank",
            )
        effective_creds = creds_input.strip()
        await store.set_config("vertexai_credentials", effective_creds)

    await store.set_config("vertexai_project", project)
    await store.set_config("vertexai_location", location)

    ok, error = await asyncio.to_thread(
        validate_vertexai_connection, project, location, effective_creds, body.model
    )

    masked = None
    if effective_creds:
        try:
            import json

            masked = json.loads(effective_creds.strip()).get("client_email")
        except Exception:
            masked = "Credentials are saved."

    return {
        "ok": ok,
        "error": error,
        "project": project,
        "location": location,
        "has_credentials": bool(effective_creds),
        "masked_credentials": masked,
    }


# --- Embeddings provider (075-ollama-embeddings) ----------------------------

_EMBEDDING_PROVIDERS = ("openai", "ollama", "vertexai")


class EmbeddingSettings(BaseModel):
    """Body of ``PUT /api/settings/embeddings`` — the instance-wide embedding
    provider + model. Both optional; only provided keys are changed."""

    provider: str | None = Field(default=None, max_length=40)
    model: str | None = Field(default=None, max_length=120)


@app.get("/api/settings/embeddings")
async def get_embedding_settings() -> dict:
    """The effective embedding provider + model (DB precedes env)."""
    provider = await effective_embedding_provider_async()
    db_model = await get_store().get_config("embedding_model")
    if provider == "openai":
        model_val = db_model if db_model is not None else ""
    elif provider == "vertexai":
        model_val = db_model or "gemini-embedding-2"
    else:
        model_val = db_model or ""

    return {
        "provider": provider,
        "model": model_val,
        "providers": list(_EMBEDDING_PROVIDERS),
    }


@app.put("/api/settings/embeddings")
async def set_embedding_settings(body: EmbeddingSettings) -> dict:
    """Persist the embedding provider/model (instance-global ``app_config``).

    Changing either changes the embedding space — the index rebuilds on the next
    startup (or via the explicit re-ingest) because the stored signature no longer
    matches (075). The blocking rebuild is never done inside this request."""
    if body.provider is not None:
        if body.provider not in _EMBEDDING_PROVIDERS:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "unknown embedding provider",
                    "provider": body.provider,
                    "allowed": list(_EMBEDDING_PROVIDERS),
                },
            )
        await get_store().set_config("embedding_provider", body.provider)
    if body.model is not None:
        await get_store().set_config("embedding_model", body.model.strip())

    # 095-vertex-ai-embeddings: validate or default Vertex AI embedding model
    provider = await effective_embedding_provider_async()
    model = await effective_embedding_model_async()

    if provider == "vertexai":
        if model not in vertexai_embedding_model_ids():
            if body.model is not None and body.model.strip() == model:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "model not allowed for provider",
                        "model": model,
                        "allowed": sorted(vertexai_embedding_model_ids()),
                    },
                )
            else:
                model = "gemini-embedding-2"
                await get_store().set_config("embedding_model", model)

    db_model = await get_store().get_config("embedding_model")
    if provider == "openai":
        model_val = db_model if db_model is not None else ""
    elif provider == "vertexai":
        model_val = db_model or "gemini-embedding-2"
    else:
        model_val = db_model or ""

    return {
        "provider": provider,
        "model": model_val,
    }


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    settings = get_settings()
    # 084-network-edge: read the production edge's evidence (forwarded headers a
    # real reverse proxy injects) up front — pure, no I/O. Emitted as a single
    # `edge` event before BACKEND when `req.edge` is on; with no proxy in front
    # it honestly reports `proxied=False`.
    edge_info = read_edge(request)
    # 088-network-layer: read the real ingress chain's evidence (forwarded headers the
    # DNS/CDN/WAF/LB/API-GW appliances inject) — pure, no I/O. Emitted as five stages
    # before BACKEND when `req.network` is on; honest "not seen" sub-records when the
    # chain isn't in front.
    network_info = read_network(request)
    # 074-ollama-provider: validate the optional provider override up front.
    if req.provider is not None and req.provider not in provider_ids():
        raise HTTPException(
            status_code=422,
            detail={
                "error": "unknown provider",
                "provider": req.provider,
                "allowed": sorted(provider_ids()),
            },
        )
    # A blank model override is rejected for either provider (AC4).
    if req.model is not None and not req.model.strip():
        raise HTTPException(status_code=422, detail="model cannot be blank")
    top_k = req.top_k or settings.rag_top_k
    # 055-rerank-score-threshold: explicit `is None` so a deliberate 0 from the FE
    # isn't overridden by a (future) non-zero default.
    rerank_threshold = (
        settings.rerank_threshold_default if req.rerank_threshold is None else req.rerank_threshold
    )
    trace_id = uuid.uuid4().hex
    emitter = TraceEmitter(trace_id, req.message)

    store = get_store()
    # Adopt the conversation this message belongs to, lazy-creating one if the
    # client didn't send a session_id. The id is echoed on the SSE `done` event.
    session = await store.ensure_session(req.session_id or uuid.uuid4().hex)
    session_id = session["id"]
    # 048-persist-traces: pin the session on the emitter so every subsequent
    # `emit` denormalizes session_id onto its trace_events row.
    emitter.session_id = session_id
    # 043-persisted-agent: the session always carries an inline agent (clone
    # of the seed default). Request-level overrides (006) still win when set
    # — falling back to the agent row only fills in the absent fields. So a
    # programmatic caller sending `system_prompt="X"` keeps today's behavior.
    agent = session.get("agent")
    effective_system_prompt = req.system_prompt
    effective_agent_prompt = req.agent_prompt
    effective_enabled_tools = req.enabled_tools
    effective_model = req.model
    # 074-ollama-provider: provider override (request wins, else the agent's row).
    effective_provider = req.provider
    # 049-agent-self-identity: name + description are server-resolved from the
    # bound agent row (not a 006 hot-override — the FE edits them via
    # PATCH /api/agents and they propagate to every session sharing the agent,
    # 044-shared-agent-catalog). Both stay None when no agent is bound, which
    # makes the prompt's identity layer collapse to the prior 042-anatomy
    # 3-layer assembly byte-for-byte.
    effective_agent_name: str | None = None
    effective_agent_description: str | None = None
    if agent is not None:
        if effective_system_prompt is None:
            effective_system_prompt = agent["system_prompt"]
        if effective_agent_prompt is None:
            effective_agent_prompt = agent["agent_prompt"]
        if effective_enabled_tools is None and agent["enabled_tools"] is not None:
            # The agent stores `enabled_tools` honestly now: None = all tools
            # (unset), [] = no tools (explicit), [...] = exactly those. Only
            # override when the agent actually pins a list — an explicit empty
            # list is respected (no tools), while None falls through to "all".
            effective_enabled_tools = list(agent["enabled_tools"])
        if effective_model is None:
            effective_model = agent["model"]
        if effective_provider is None:
            effective_provider = agent.get("provider")
        effective_agent_name = agent.get("name")
        effective_agent_description = agent.get("description")
    resolved_model = effective_model or settings.llm_model
    resolved_provider = effective_provider or "openai"

    # Enforce curated allowlist for Vertex AI models
    if resolved_provider == "vertexai":
        if resolved_model not in vertexai_model_ids():
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "model not allowed for provider",
                    "model": resolved_model,
                    "allowed": sorted(vertexai_model_ids()),
                },
            )

    # 078-openai-key-ui: the curated allowlist is no longer a hard gate — OpenAI
    # models are listed live from the account now, so any non-empty model id is
    # accepted (mirrors Ollama, 074). A blank `req.model` was already rejected
    # above; `resolved_model` falls back to the configured default, so it's never
    # empty here. The curated list survives only as the FE's offline prefill.
    # The local server URL the backend connects to for an Ollama run: the
    # persisted instance config, else the env default. (No-op for OpenAI.)
    ollama_base_url = (await store.get_config("ollama_base_url")) or settings.ollama_base_url

    # The resolved POST body the backend actually acted on, echoed onto the
    # frontend event so the client/backend inspector can show it verbatim
    # (007-numeric-transparency, Q2). top_k is the resolved value (default when
    # omitted); the 006 overrides are included only when the client sent them, so
    # the body reflects exactly what executed.
    request_body: dict[str, Any] = {
        "message": req.message,
        "session_id": session_id,
        "top_k": top_k,
        "rerank_threshold": rerank_threshold,
        "mode": req.mode,
        "runtime": req.runtime.value,
        # 042-agent-anatomy: always echo the **resolved** model (override or
        # configured default) so the FE can show what actually ran without
        # having to know about the server default. Resolves AC6.
        "model": resolved_model,
        # 074-ollama-provider: echo the resolved provider so the inspector shows
        # which backend actually ran (default "openai").
        "provider": resolved_provider,
    }
    if req.system_prompt is not None:
        request_body["system_prompt"] = req.system_prompt
    if req.agent_prompt is not None:
        request_body["agent_prompt"] = req.agent_prompt
    if req.enabled_tools is not None:
        request_body["enabled_tools"] = req.enabled_tools
    # Include the forced failure only when set (017) — a `none` run echoes nothing
    # extra, so the body still reflects exactly what executed (AC1).
    if req.simulate_failure != SimulateFailure.NONE:
        request_body["simulate_failure"] = req.simulate_failure.value
    # 061-scenario-builder: echo the reranker flag only when on, so a default run's
    # body stays minimal (mirrors the ragless echo below).
    if req.rerank:
        request_body["rerank"] = True
    # 070-hybrid-search: echo the hybrid flag only when on, so a default run's body
    # stays minimal (mirrors the rerank/ragless echoes).
    if req.hybrid:
        request_body["hybrid"] = True
    # 056-ragless-pageindex: echo the toggle only when on, so a default run's body
    # is byte-for-byte unchanged (AC1).
    if req.ragless:
        request_body["ragless"] = True
    # 098-verify-reflection-loop: echo the verify toggle only when on, so a default
    # run's body stays minimal (mirrors the rerank/hybrid/ragless echoes).
    if req.verify:
        request_body["verify"] = True
    # 084-network-edge: echo the edge flag only when on, so a default run's body
    # stays minimal (mirrors the rerank/hybrid/ragless echoes).
    if req.edge:
        request_body["edge"] = True
    # 088-network-layer: echo the network flag only when on.
    if req.network:
        request_body["network"] = True

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.FRONTEND,
                Phase.END,
                "User sent a message",
                {"message": req.message, "session_id": session_id, "request": request_body},
            )
            # 088-network-layer: the real ingress chain — five appliance hops the
            # request transited before the app saw it. 090-waf-after-lb: transit
            # order is DNS → CDN → TLS/LB → WAF → API-GW — the load balancer
            # terminates TLS (the single decryption point) so the WAF, which can
            # only inspect plaintext, sits *after* it. Emitted only when
            # `req.network` is on; each carries only what the appliance's forwarded
            # headers prove (honest "not seen" otherwise).
            if req.network:
                # 091: a real DNS query against the running CoreDNS for the origin
                # the edge fronts — gives the actual resolved address + TTL (the
                # header-derived `dns` only carried a next-hop name). Off the event
                # loop (bounded) + honest fallback to the header evidence on failure.
                dns_info = network_info.dns
                resolved = await asyncio.to_thread(resolve_dns, DNS_ORIGIN_HOST)
                if resolved.address:
                    dns_info = replace(
                        dns_info,
                        seen=True,
                        host=resolved.host,
                        address=resolved.address,
                        ttl=resolved.ttl,
                    )
                for stage, label, info in (
                    (Stage.DNS, "DNS: resolved the origin service", dns_info),
                    (Stage.CDN, "CDN: uncacheable — passed through", network_info.cdn),
                    (Stage.LB, "TLS terminated · load-balanced", network_info.lb),
                    (Stage.WAF, "WAF: OWASP rules inspected the request", network_info.waf),
                    (Stage.APIGW, "API gateway: routed · rate-limited", network_info.apigw),
                ):
                    await emitter.emit(stage, Phase.END, label, info.as_data())
            # 084-network-edge: the first hop in production. A single observation
            # event (like FRONTEND), fired only when the edge is enabled, carrying
            # only what the forwarded headers prove. With no proxy in front it is
            # honestly labelled "direct".
            if req.edge:
                await emitter.emit(
                    Stage.EDGE,
                    Phase.END,
                    "Edge: TLS terminated · load-balanced"
                    if edge_info.proxied
                    else "Direct access — no edge proxy",
                    edge_info.as_data(),
                )
            async with emitter.stage(
                Stage.BACKEND, "API received the request", {"message": req.message}
            ) as rec:
                # Read this conversation's recent history from the application
                # database (system of record) — the agent's long-term memory,
                # folded into the prompt context.
                async with emitter.stage(
                    Stage.DB_READ,
                    "Loading recent history",
                    {"table": "messages", "session_id": session_id},
                ) as db_rec:
                    history = await store.read_history(session_id)
                    # 039-memory-growth-visualization: per-pair token counts so
                    # the Agent's Long-term-Memory panel can draw the honest
                    # turn-by-turn growth of what re-enters the model's window
                    # next turn (only the visible text — never the compute).
                    db_rec.data = {
                        **history,
                        "recent_tokens": history_pair_tokens(history["recent"]),
                    }

                # 027-skills: advertise the global catalog to the agent by
                # name + description (the body is loaded on demand via load_skill).
                skills_catalog = [
                    {"name": s["name"], "description": s["description"]}
                    for s in await store.list_skills()
                ]

                await run_agent(
                    req.message,
                    top_k,
                    emitter,
                    history=history["recent"],
                    mode=req.mode,
                    session_id=session_id,
                    # 043-persisted-agent: fall back to the session's agent row
                    # when the request omits the field; the request's value
                    # still wins when present (006 hot-override).
                    system_prompt=effective_system_prompt,
                    agent_prompt=effective_agent_prompt,
                    enabled_tools=effective_enabled_tools,
                    rerank=req.rerank,
                    hybrid=req.hybrid,
                    runtime=req.runtime.value,
                    simulate_failure=req.simulate_failure,
                    skills_catalog=skills_catalog,
                    model=effective_model,
                    # 074-ollama-provider: which provider + local server to run on.
                    provider=resolved_provider,
                    base_url=ollama_base_url,
                    rerank_threshold=rerank_threshold,
                    # 056-ragless-pageindex: run the reasoning-based PageIndex path
                    # alongside Vector RAG (Intermediate rung only; no-op otherwise).
                    ragless=req.ragless,
                    # 098-verify-reflection-loop: opt-in critic pass after drafting.
                    verify=req.verify,
                    # 049-agent-self-identity: server-resolved from the bound
                    # agent row above; never a request override.
                    agent_name=effective_agent_name,
                    agent_description=effective_agent_description,
                )

                # Persist the finished message + the chunks retrieved for it
                # (D5) — separate from the RAG vector store. 040-message-
                # attachments: pass through the composer's pending document ids
                # so the relational link `message ↔ document` is written in the
                # same transaction (cross-session ids and already-linked ids
                # are filtered inside the store).
                async with emitter.stage(Stage.DB_WRITE, "Persisting the conversation") as db_rec:
                    db_rec.data = await store.write_message(
                        session_id,
                        trace_id,
                        req.message,
                        emitter.answer,
                        chunks=_retrieved_chunks(emitter),
                        skills=_applied_skills(emitter),
                        attached_document_ids=req.attachment_document_ids,
                    )

                rec.data = {
                    "answer": emitter.answer,
                    "delivery": req.mode,
                    "session_id": session_id,
                }
        except Exception as exc:  # noqa: BLE001 - report to the client, don't hang
            await emitter.emit(Stage.BACKEND, Phase.END, "error", {"error": str(exc)})
        finally:
            trace_store.save(emitter)
            await emitter.close()

    # Batch delivery: run the whole pipeline to completion, then return the
    # finished trace + answer as one JSON response. The client replays it. This
    # is the synchronous request/response contract — no live streaming.
    if req.mode == "batch":
        await producer()
        return emitter.summary()

    # Streaming delivery: fan trace events out over SSE as they happen.
    async def event_stream():
        task = asyncio.create_task(producer())
        done_seen = False
        try:
            while True:
                event = await emitter.queue.get()
                if event is emitter.DONE:
                    done_seen = True
                    break
                yield {"event": "trace", "data": event.model_dump_json()}
        finally:
            if done_seen:
                await task
            else:
                # The consumer was torn down before the producer finished — the
                # client disconnected (016-cancel-stream). Cancel the producer so
                # the in-flight agent run is genuinely interrupted *before*
                # db.write, discarding the turn. CancelledError is a
                # BaseException, so the producer's `except Exception` does not
                # swallow it; its `finally` still saves the partial trace and
                # closes the emitter (the queue is unbounded → the final put can't
                # deadlock with no reader).
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        # Reached only on normal completion; on disconnect the GeneratorExit
        # propagates out of the finally above and skips this farewell event.
        yield {
            "event": "done",
            "data": json.dumps(
                {"trace_id": trace_id, "answer": emitter.answer, "session_id": session_id}
            ),
        }

    return EventSourceResponse(event_stream())


@app.get("/api/trace/{trace_id}")
async def get_trace(trace_id: str):
    """Return a finished trace's summary.

    048-persist-traces: layered read. The bounded in-memory `TraceStore`
    (cap=50) serves the hot path; on a miss (older traces, restart, another
    instance) we reconstruct the same `TraceSummary` shape from
    `trace_events` + `messages`. Identical JSON shape on both paths.
    """
    summary = trace_store.get(trace_id)
    if summary is not None:
        return summary
    db_summary = await get_store().get_trace_summary(trace_id)
    if db_summary is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return db_summary


@app.get("/api/corpus")
async def list_corpus() -> dict:
    """List the shipped corpus files (042-agent-anatomy).

    Read-only metadata for the Agent Anatomy dialog's Knowledge Base subsection:
    filename, size in bytes, and a whitespace-collapsed first-240-chars preview.
    Only ``*.md`` files in :attr:`Settings.corpus_path` are returned, sorted by
    filename. Independent of the OpenAI key (the corpus is on disk, not in the
    LLM)."""
    corpus_dir = get_settings().corpus_path
    files: list[dict[str, Any]] = []
    if corpus_dir.exists():
        for path in sorted(corpus_dir.glob("*.md")):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            # Whitespace-collapsed first 240 chars — keeps the JSON small while
            # giving the FE enough to render a 1–2 line teaser.
            preview = " ".join(text.split())[:240]
            files.append(
                {
                    "filename": path.name,
                    "size_bytes": path.stat().st_size,
                    "preview": preview,
                }
            )
    return {"files": files}


class ChunkPreviewRequest(BaseModel):
    # 072-chunking-strategies: which chunker(s) to preview. "all" runs every strategy
    # so the playground can show them side by side. `text` is optional — defaults to a
    # sample corpus file so the contrast (fixed cuts mid-sentence) is always demonstrable.
    strategy: str = "all"
    text: str | None = Field(default=None, max_length=20000)
    # 081-chunking-config: per-strategy tunables (chunk_size/chunk_overlap/
    # semantic_threshold/max_segments). Only the keys relevant to a strategy apply;
    # omitting it reproduces 072 behavior. Out-of-bounds values are rejected (422).
    params: dict[str, float] | None = None


def _resolve_chunk_params(strategy: ChunkStrategy, overrides: dict[str, float] | None):
    """Validate ``overrides`` against ``strategy``'s bounds (422 on violation) and build a
    ``ChunkParams``. Irrelevant keys are ignored; omitting overrides ⇒ defaults (081)."""
    from .rag.chunking import CHUNK_PARAM_BOUNDS, clamp_params, param_in_bounds

    overrides = overrides or {}
    bounds = CHUNK_PARAM_BOUNDS.get(strategy, {})
    for key, value in overrides.items():
        if value is None or key not in bounds:
            continue
        if not param_in_bounds(strategy, key, float(value)):
            _default, lo, hi = bounds[key]
            raise HTTPException(
                status_code=422, detail=f"{key} for {strategy} must be within [{lo}, {hi}]"
            )
    return clamp_params(strategy, overrides)


@app.post("/api/rag/chunk-preview")
async def chunk_preview(req: ChunkPreviewRequest) -> dict:
    """Read-only chunking playground (072-chunking-strategies).

    Chunks a sample (or supplied) document with one or all strategies and returns the
    boundaries — WITHOUT embedding or mutating the index, so comparing strategies is
    instant and side-effect-free. `fixed`/`recursive` are keyless; `semantic`/`agentic`
    use OpenAI, so without a key (or on a malformed response) that strategy returns an
    `error` marker instead of failing the whole request."""
    from .rag.chunking import ChunkStrategy, chunk

    sample = req.text
    if not sample:
        corpus_dir = get_settings().corpus_path
        files = sorted(corpus_dir.glob("*.md")) if corpus_dir.exists() else []
        sample = files[0].read_text(encoding="utf-8") if files else ""

    if req.strategy == "all":
        strategies = list(ChunkStrategy)
    else:
        try:
            strategies = [ChunkStrategy(req.strategy)]
        except ValueError:
            return {"error": f"unknown strategy {req.strategy!r}", "previews": []}

    # Validate params up front (per strategy) so an out-of-bounds value is a clean 422,
    # not swallowed by the per-strategy error-marker fallback below.
    params_by_strategy = {strat: _resolve_chunk_params(strat, req.params) for strat in strategies}

    previews: list[dict[str, Any]] = []
    for strat in strategies:
        try:
            chunks = await asyncio.to_thread(chunk, sample, strat, params_by_strategy[strat])
            previews.append(
                {
                    "strategy": str(strat),
                    "count": len(chunks),
                    "chunks": [
                        {"text": c.text, "start": c.start, "end": c.end, "chars": len(c.text)}
                        for c in chunks
                    ],
                }
            )
        except Exception as exc:  # noqa: BLE001 - per-strategy, so one keyed strategy can't 500
            previews.append({"strategy": str(strat), "count": 0, "chunks": [], "error": str(exc)})
    return {"sample_chars": len(sample), "previews": previews}


@app.post("/api/rag/reindex")
async def reindex_corpus(req: ChunkPreviewRequest):
    """Re-ingest the corpus with a chosen chunking strategy, streaming the ingestion
    stages over SSE so the canvas animates Chunking -> Embedding -> Storing (072)."""
    from .rag.chunking import ChunkStrategy
    from .rag.ingest import reingest_corpus

    try:
        strategy = ChunkStrategy(req.strategy)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"unknown strategy {req.strategy!r}") from None

    # 081-chunking-config: validate the per-strategy params synchronously (422 on
    # out-of-bounds) BEFORE opening the SSE stream, so the client gets a clean error.
    params = _resolve_chunk_params(strategy, req.params)

    trace_id = uuid.uuid4().hex
    emitter = TraceEmitter(trace_id, f"reindex:{strategy}")
    result: dict[str, Any] = {"num_chunks": -1, "strategy": str(strategy)}

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.BACKEND, Phase.END, "Re-ingesting corpus", {"strategy": str(strategy)}
            )
            out = await reingest_corpus(strategy, emitter, params)
            result.update(out)
        except Exception as exc:  # noqa: BLE001 - report to the client, don't hang
            await emitter.emit(Stage.BACKEND, Phase.END, "error", {"error": str(exc)})
        finally:
            trace_store.save(emitter)
            await emitter.close()

    async def event_stream():
        task = asyncio.create_task(producer())
        try:
            while True:
                event = await emitter.queue.get()
                if event is emitter.DONE:
                    break
                yield {"event": "trace", "data": event.model_dump_json()}
        finally:
            await task
        yield {"event": "done", "data": json.dumps({"trace_id": trace_id, **result})}

    return EventSourceResponse(event_stream())


@app.post("/api/data/clear")
async def clear_data():
    """Reset both stores (025-clear-databases): remove every user-imported chunk
    from the vector store (the built-in corpus is kept, so retrieval still works
    with no rebuild), wipe all relational history, and delete every stored object.
    Returns the counts removed: ``sessions_deleted`` / ``messages_deleted`` /
    ``documents_deleted`` / ``vectors_removed`` / ``objects_deleted``. Idempotent —
    a second call returns all zeros."""
    vectors_removed = await asyncio.to_thread(delete_uploaded_vectors)
    objects_deleted = await asyncio.to_thread(clear_objects)
    counts = await get_store().clear_all()
    return {**counts, "vectors_removed": vectors_removed, "objects_deleted": objects_deleted}


# --- Sessions / messages / documents (002-interactive-chat) -----------------


@app.post("/api/sessions")
async def create_session():
    """Start a fresh, empty conversation (AC6)."""
    return await get_store().create_session()


@app.get("/api/sessions")
async def list_sessions():
    """Recent-first conversation list, each labeled by its first message (AC5)."""
    return await get_store().list_sessions()


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Single session lookup including the inlined agent + `message_count`
    (045-composer-agent-selector). The FE composer chip derives the lock
    state from `message_count`; this endpoint lets it refetch a single
    session after a 409 without listing the whole catalog."""
    row = await get_store().get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return row


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a conversation + its messages (keeps PDF embeddings — D6, AC4)."""
    return await get_store().delete_session(session_id)


class AgentPatch(BaseModel):
    """Body of ``PATCH /api/agents/{id}``.

    Partial update: every field is optional. The PATCH only touches the columns
    actually present in the request — sending ``{"name": "X"}`` leaves the
    prompts and model alone. Field bounds:

    - ``name``: 1..60 chars (after strip)
    - ``description``: 0..240 chars
    - ``system_prompt`` / ``agent_prompt``: ≤ 2000 chars each
    - ``model``: must be in the curated allowlist (`app/llm/models.py`)
    - ``enabled_tools``: list of tool names (subset of the advertised tools)
    """

    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=240)
    system_prompt: str | None = Field(default=None, max_length=2000)
    agent_prompt: str | None = Field(default=None, max_length=2000)
    model: str | None = Field(default=None, max_length=120)
    # 074-ollama-provider: "openai" | "ollama". Validated against the selectable
    # providers; the model allowlist check is skipped when provider is "ollama".
    provider: str | None = Field(default=None, max_length=40)
    enabled_tools: list[str] | None = Field(default=None)


class AgentCreate(BaseModel):
    """Body of ``POST /api/agents`` (044-shared-agent-catalog).

    Every field optional. ``clone_from`` picks the source agent (defaults to
    the seed default when absent). ``name`` defaults to ``"<source> (cópia)"``
    so consecutive clicks of "+ Novo" produce visually unique entries.
    """

    name: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=240)
    clone_from: str | None = Field(default=None)


class SessionPatch(BaseModel):
    """Body of ``PATCH /api/sessions/{id}`` (044-shared-agent-catalog).

    Today only the agent link is editable. Future fields go here (color,
    pinned, etc.) — they would be additive."""

    agent_id: str | None = Field(default=None)


@app.get("/api/agents")
async def list_agents():
    """The full agent catalog (044-shared-agent-catalog). Default first, then
    user-created agents alphabetically. The dialog header strip renders this."""
    return await get_store().list_agents()


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Direct read of an agent row (convenience). Sessions already include
    the agent inline, so the FE rarely calls this."""
    row = await get_store().get_agent(agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return row


@app.post("/api/agents")
async def create_agent(body: AgentCreate):
    """Create a new agent in the catalog (044-shared-agent-catalog).

    Cloned from ``body.clone_from`` (or the default when absent). The new
    row is non-default (``is_default=0``). The FE typically follows up with
    a ``PATCH /api/sessions/{id}`` to point the active conversation at it.
    """
    name = body.name.strip() if isinstance(body.name, str) else None
    desc = body.description.strip() if isinstance(body.description, str) else None
    return await get_store().create_agent(name=name, description=desc, clone_from=body.clone_from)


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete a non-default agent and re-point any sessions using it to the
    default (044-shared-agent-catalog).

    409 when the target is the default (the always-there fallback); 404 when
    the id is unknown.
    """
    try:
        result = await get_store().delete_agent(agent_id)
    except CannotDeleteDefaultAgent as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return result


@app.patch("/api/sessions/{session_id}")
async def patch_session(session_id: str, body: SessionPatch):
    """Update per-conversation metadata. Today: just the agent link
    (044-shared-agent-catalog). Future additive fields land here.
    """
    if body.agent_id is None:
        raise HTTPException(status_code=422, detail="agent_id is required")
    try:
        row = await get_store().set_session_agent(session_id, body.agent_id)
    except UnknownAgentId as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AgentLocked as exc:
        # 045-composer-agent-selector: the conversation is started; swapping
        # the agent at this point would break "one agent per chat". Structured
        # detail so a stale FE tab can recover gracefully (it shows the lock
        # tooltip + refreshes the session list to flip the chip locked).
        raise HTTPException(
            status_code=409,
            detail={"detail": "agent_locked", "message_count": exc.message_count},
        ) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return row


@app.patch("/api/agents/{agent_id}")
async def patch_agent(agent_id: str, body: AgentPatch):
    """Partial-update an agent (044-shared-agent-catalog).

    The agent is shared across every conversation that points to it, so this
    PATCH propagates immediately (the FE patches its in-memory session list
    on success). Validates ``model`` against the curated allowlist.
    """
    patch = body.model_dump(exclude_unset=True)
    # 074-ollama-provider: validate the provider, if present.
    if "provider" in patch and patch["provider"] not in provider_ids():
        raise HTTPException(
            status_code=422,
            detail={
                "error": "unknown provider",
                "provider": patch["provider"],
                "allowed": sorted(provider_ids()),
            },
        )

    # Validate model for vertexai provider
    provider = patch.get("provider")
    if provider is None:
        existing = await get_store().get_agent(agent_id)
        if existing:
            provider = existing.get("provider")
    if provider == "vertexai" and "model" in patch:
        if patch["model"] not in vertexai_model_ids():
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "model not allowed for provider",
                    "model": patch["model"],
                    "allowed": sorted(vertexai_model_ids()),
                },
            )

    # 078-openai-key-ui: the curated allowlist is no longer a hard gate (models are
    # listed live now). Any non-empty model id is accepted for either provider; a
    # blank one is rejected so a PATCH can't wipe the required column.
    if "model" in patch and isinstance(patch["model"], str) and not patch["model"].strip():
        raise HTTPException(status_code=422, detail="model cannot be blank")
    # Normalize name (strip), reject post-strip emptiness explicitly so 1..60
    # actually means "1..60 visible characters".
    if "name" in patch and isinstance(patch["name"], str):
        patch["name"] = patch["name"].strip()
        if not patch["name"]:
            raise HTTPException(status_code=422, detail="name cannot be blank")
    row = await get_store().update_agent(agent_id, patch)
    if row is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return row


@app.get("/api/sessions/{session_id}/messages")
async def list_messages(session_id: str):
    """A conversation's history, each message carrying its retrieved chunks (AC8)."""
    return await get_store().list_messages(session_id)


@app.get("/api/sessions/{session_id}/documents")
async def list_documents(session_id: str):
    """The PDFs uploaded to this conversation."""
    return await get_store().list_documents(session_id)


@app.post("/api/sessions/{session_id}/documents")
async def upload_document(session_id: str, file: Annotated[UploadFile, File()]):
    """Ingest a PDF into the vector store, streaming the ingestion stages over
    SSE so the canvas animates chunk -> embed -> store (D4, AC2, AC9)."""
    data = await file.read()
    filename = file.filename or "document.pdf"
    document_id = uuid.uuid4().hex
    trace_id = uuid.uuid4().hex
    emitter = TraceEmitter(trace_id, f"upload:{filename}")

    store = get_store()
    await store.ensure_session(session_id)
    # 048-persist-traces: pin the session on the upload emitter too, so every
    # ingestion event carries it through to `trace_events.session_id`.
    emitter.session_id = session_id
    # 040-message-attachments: captured by the producer below, read by the
    # done frame so the FE composer can stage the freshly-ingested doc as a
    # chip without a follow-up `GET /documents` round-trip. ``-1`` if the
    # producer never reaches the ingest result (early crash).
    ingest_result: dict[str, Any] = {"chunk_count": -1}

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.FRONTEND,
                Phase.END,
                "User uploaded a PDF",
                {"filename": filename, "session_id": session_id},
            )
            async with emitter.stage(
                Stage.BACKEND, "API received the upload", {"filename": filename}
            ) as rec:
                # 034-storage-ingestion-flow — persist the file to durable object
                # storage first, then let the indexer read it back. The write is
                # real (filesystem stand-in for Blob/S3), so the step is load-bearing.
                content_type = file.content_type or "application/pdf"
                key = object_key(session_id, document_id, filename)
                async with emitter.stage(
                    Stage.STORAGE_UPLOAD, "Storing the upload", {"filename": filename}
                ) as srec:
                    uri = await asyncio.to_thread(put_object, key, data, content_type)
                    srec.data = {
                        "key": key,
                        "uri": uri,
                        "filename": filename,
                        "size_bytes": len(data),
                        "content_type": content_type,
                    }
                    srec.metrics = {"size_bytes": float(len(data))}
                result = await ingest_uploaded(key, filename, session_id, document_id, emitter)
                # Track the document relationally (the vectors live in Chroma).
                await store.add_document(session_id, document_id, filename, result["chunk_count"])
                rec.data = result
                ingest_result["chunk_count"] = int(result["chunk_count"])
        except Exception as exc:  # noqa: BLE001 - report to the client, don't hang
            await emitter.emit(Stage.BACKEND, Phase.END, "error", {"error": str(exc)})
        finally:
            trace_store.save(emitter)
            await emitter.close()

    async def event_stream():
        task = asyncio.create_task(producer())
        try:
            while True:
                event = await emitter.queue.get()
                if event is emitter.DONE:
                    break
                yield {"event": "trace", "data": event.model_dump_json()}
        finally:
            await task
        yield {
            "event": "done",
            "data": json.dumps(
                {
                    "trace_id": trace_id,
                    "document_id": document_id,
                    "filename": filename,
                    "chunk_count": ingest_result["chunk_count"],
                }
            ),
        }

    return EventSourceResponse(event_stream())


@app.delete("/api/sessions/{session_id}/documents/{document_id}")
async def delete_document(session_id: str, document_id: str):
    """Remove a document: delete exactly its vectors, its stored object, then its
    relational row (AC3 · 034-storage-ingestion-flow)."""
    removed = await asyncio.to_thread(delete_document_vectors, document_id)
    objects_removed = await asyncio.to_thread(delete_document_objects, session_id, document_id)
    row = await get_store().delete_document(session_id, document_id)
    return {**row, "vectors_removed": removed, "objects_removed": objects_removed}


# --- Skills catalog (027-skills) --------------------------------------------


@app.get("/api/skills", response_model=list[SkillOut])
async def list_skills():
    """The global skill catalog, name-ordered — backs the ⚙️ Skills section."""
    return await get_store().list_skills()


@app.post("/api/skills", response_model=SkillOut)
async def create_skill(skill: SkillIn):
    """Create a skill. A duplicate ``name`` is a 409 (the handle must be unique)."""
    try:
        return await get_store().create_skill(skill.name, skill.description, skill.body)
    except DuplicateSkillName as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.put("/api/skills/{skill_id}", response_model=SkillOut)
async def update_skill(skill_id: str, skill: SkillIn):
    """Replace a skill's fields. 404 if it doesn't exist, 409 on a name clash."""
    try:
        row = await get_store().update_skill(skill_id, skill.name, skill.description, skill.body)
    except DuplicateSkillName as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="skill not found")
    return row


@app.delete("/api/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete a skill from the catalog."""
    return await get_store().delete_skill(skill_id)


# --- 133-arena-ai-judge: the Arena's qualitative design critique -------------
#
# The Arena's ONLY backend route. Stateless: it reads no database and writes
# nothing, emits no `TraceEvent` and has no `Stage` (the judge is not part of the
# agentic request lifecycle — see app/arena/judge.py). This is the one place the
# "Arena is frontend-only" claim from spec 100 no longer holds, deliberately and
# as narrowly as possible: a language judge cannot be mocked without violating §3.

_arena_judge_limiter = FixedWindowLimiter(
    limit=get_settings().arena_judge_rate_limit,
    window_seconds=get_settings().arena_judge_rate_window_seconds,
)


@app.post("/api/arena/judge", response_model=ArenaJudgeResponse)
async def arena_judge(req: ArenaJudgeRequest) -> ArenaJudgeResponse:
    """Critique an Arena design qualitatively, grounded in its computed metrics."""
    settings = get_settings()

    # A blank override is rejected outright. NOTE: there is deliberately no curated
    # allowlist gate here — 078-openai-key-ui removed it app-wide (models are listed
    # live from the account now), so re-introducing one for the judge alone would
    # both contradict the app's own policy and break the day OpenAI ships a model.
    if req.model is not None and not req.model.strip():
        raise HTTPException(status_code=422, detail="model cannot be blank")

    # Bound the untrusted text server-side (the FE caps it too — 120's NOTE_MAX).
    for note in req.notes:
        if len(note) > ARENA_JUDGE_NOTE_MAX:
            raise HTTPException(
                status_code=422,
                detail={"error": "note too long", "max": ARENA_JUDGE_NOTE_MAX},
            )

    # Rate guard BEFORE the provider is touched: an exhausted window must never
    # spend a token.
    if not _arena_judge_limiter.allow():
        raise HTTPException(
            status_code=429,
            detail={
                "error": "judge rate limit reached",
                "limit": settings.arena_judge_rate_limit,
                "window_seconds": settings.arena_judge_rate_window_seconds,
            },
        )

    resolved_model = req.model or settings.arena_judge_model or settings.llm_model
    try:
        provider = get_provider(model=resolved_model)
    except MissingAPIKeyError as exc:
        # Honest unavailability (§3): a specific, machine-readable error — never a
        # fabricated critique.
        raise HTTPException(
            status_code=503,
            detail={"error": "no_provider", "message": str(exc)},
        ) from exc

    objectives = (
        "\n".join(
            f"- {o.metric}: target {o.target}, actual {o.actual} — {'MET' if o.met else 'NOT MET'}"
            for o in req.objectives
        )
        or "- (no objectives were being tracked)"
    )
    verdict_line = (
        "Every tracked objective is MET."
        if req.verdict_met
        else "At least one tracked objective is NOT MET."
    )

    result = await judge_design(
        provider,
        JudgeInput(
            design_summary="\n".join(
                ["Boxes:", *(f"- {line}" for line in req.design)]
                + (
                    ["Connections:", *(f"- {c}" for c in req.connections)]
                    if req.connections
                    else []
                )
            ),
            metrics_summary="\n".join([f"Load: {req.load}", *(f"- {m}" for m in req.metrics)]),
            objectives_summary=f"{objectives}\n{verdict_line}",
            notes=list(req.notes),
            lang=req.lang,
        ),
    )

    return ArenaJudgeResponse(
        rigorous=result.rigorous,
        pragmatic=result.pragmatic,
        agreed=result.agreed,
        # Echoed UNCHANGED: the judge cannot reinterpret the arithmetic.
        verdict_met=req.verdict_met,
        model=resolved_model,
    )
