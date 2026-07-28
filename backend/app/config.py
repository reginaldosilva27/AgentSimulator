"""Application configuration.

Loads settings from environment / `.env`. The app runs **only** against OpenAI
and requires an `OPENAI_API_KEY`; there is no offline/mock mode. When the key is
missing, the provider/embedding factories fail fast with :class:`MissingAPIKeyError`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parent of the `app` package).
BACKEND_DIR = Path(__file__).resolve().parent.parent

# The single `.env` both pydantic-settings and `load_env_file` read.
ENV_FILE = BACKEND_DIR / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Bridge the whole `.env` into ``os.environ``.

    :class:`Settings` only maps the keys it declares; every other key in the
    file falls under ``extra="ignore"`` and never reaches ``os.environ``.
    Libraries that read the environment directly — notably LangSmith tracing
    (``LANGSMITH_TRACING`` / ``LANGSMITH_API_KEY`` / ``LANGSMITH_PROJECT``) —
    would then never see values placed in `backend/.env`. Loading the file here
    makes them visible while preserving precedence: ``override=False`` keeps any
    variable already present in the real environment (env > .env), matching how
    pydantic-settings resolves the same keys. A missing file is a no-op.
    """
    load_dotenv(path, override=False)


# Load eagerly on import so anything reading ``os.environ`` (LangSmith's tracer
# included) sees `.env` before the agent graph is built or the first run starts.
load_env_file()


class MissingAPIKeyError(RuntimeError):
    """Raised when an OpenAI-backed component is used without an API key.

    The app is OpenAI-only: rather than silently starting in a mock/fallback
    mode, the provider and embedding factories raise this so the failure is
    clear and names the variable to set.
    """

    def __init__(self) -> None:
        super().__init__(
            "OPENAI_API_KEY is required — this app runs only against OpenAI and has "
            "no offline/demo mode. Set OPENAI_API_KEY in backend/.env (or the "
            "environment) and restart."
        )


class MissingVertexAICredentialsError(RuntimeError):
    """Raised when Vertex AI provider is used without service account key JSON."""

    def __init__(self) -> None:
        super().__init__(
            "Google Service Account Key JSON is required for Vertex AI provider. "
            "Please configure and save it in settings first."
        )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM / embeddings ---
    openai_api_key: str = ""
    llm_model: str = "gpt-4.1-mini"
    embedding_model: str = "text-embedding-3-small"
    # 075-ollama-embeddings: which provider produces embeddings. Instance-global
    # (one Chroma collection = one vector dimension, so it can't be per-agent).
    # DB `app_config.embedding_provider` overrides this env default.
    embedding_provider: str = "openai"

    # --- Web search (052-web-search-tool) ---
    # Optional. Enables the `web_search` MCP tool (real Tavily search). Unlike
    # OPENAI_API_KEY this is NOT required: with no key the tool returns an honest
    # error string and the rest of the app runs unchanged.
    tavily_api_key: str = ""

    # --- Ollama (074-ollama-provider) ---
    # The default local Ollama server URL. Only the *default* — the live value is
    # persisted in the relational store (`app_config.ollama_base_url`) and editable
    # from the UI, so it survives restart. The backend (not the browser) connects
    # to this address; in Docker use `host.docker.internal`.
    ollama_base_url: str = "http://localhost:11434"

    # --- Vertex AI (089-vertex-ai-provider) ---
    vertexai_project: str = ""
    vertexai_location: str = "global"
    vertexai_credentials: str = ""

    # --- RAG ---
    rag_top_k: int = 4
    # 133-arena-ai-judge: the judge spends real tokens on an unauthenticated
    # endpoint, so it carries a per-process fixed-window cap. Process-local is the
    # right granularity for a single-instance app (§8) and is NOT a multi-replica
    # defence — see app/arena/ratelimit.py. 0 disables the judge entirely.
    arena_judge_rate_limit: int = 20
    arena_judge_rate_window_seconds: float = 60.0
    # Optional model override for judging; None uses the instance default.
    arena_judge_model: str | None = None
    chroma_dir: str = "app/data/chroma"
    corpus_dir: str = "app/data/corpus"
    # 072-chunking-strategies: the ingestion-time chunker. `recursive` (default) is
    # today's paragraph-packing splitter (byte-for-byte). `fixed`/`semantic`/`agentic`
    # are the alternatives the ⚙️ Settings picker + re-ingest can switch to. Stored as a
    # plain string (env CHUNK_STRATEGY) and coerced to ChunkStrategy where used.
    chunk_strategy: str = "recursive"

    # --- Reranker (054-rag-block-expansion) ---
    # The Intermediate rung re-scores a wider candidate pool with a local FlashRank
    # cross-encoder (ONNX, no torch, no API key) before trimming to top-k. The model
    # is downloaded once into `rerank_cache_dir` and cached process-wide; pre-bake it
    # into the image so runtime/CI never fetch it. `rerank_fetch_k` is the wider pool
    # the reranker sees (must exceed `rag_top_k` for reranking to add value).
    rerank_model: str = "ms-marco-MiniLM-L-12-v2"
    rerank_cache_dir: str = "app/data/flashrank"
    rerank_fetch_k: int = 10
    # 055-rerank-score-threshold: the default minimum rerank score. Ships ON at 0.05 so
    # near-zero-score chunks (e.g. an off-topic greeting that matches nothing) are dropped
    # from the grounding context by default — precision over recall on the Intermediate
    # rung. 0 = no filter (the 054 behavior). The UI slider overrides it per conversation.
    rerank_threshold_default: float = 0.05

    # 070-hybrid-search: the sparse BM25 lane + RRF fusion. `bm25_top_k` is how wide the
    # keyword lane ranks (mirrors `rerank_fetch_k` so both lanes feed a comparable pool);
    # `rrf_k` is the RRF damping constant — score = Σ 1/(rrf_k + rank). 60 is the de-facto
    # standard from the original RRF paper; larger flattens the rank weighting.
    bm25_top_k: int = 10
    rrf_k: int = 60

    # --- Application database (relational system of record) ---
    app_db_path: str = "app/data/app.sqlite3"

    # --- Object storage (034-storage-ingestion-flow) ---
    # Durable store uploaded documents land in before the indexer reads them. A
    # local filesystem stand-in for Blob/S3 (a mounted Docker volume, like chroma).
    storage_dir: str = "app/data/storage"

    # --- Network layer (088-network-layer) ---
    # True only when the backend runs behind the real ingress chain (DNS · CDN ·
    # WAF · TLS/LB · API-GW). The docker-compose network stack sets `NETWORK_CHAIN=1`
    # on the backend service; a bare `uvicorn` run leaves it False, so the frontend's
    # Build "Network" component is disabled (the appliance containers aren't there).
    # This is a presence flag only — the backend never starts/stops the containers.
    network_chain: bool = False

    # --- HTTP ---
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def has_tavily_key(self) -> bool:
        return bool(self.tavily_api_key.strip())

    @property
    def chroma_path(self) -> Path:
        return self._abs(self.chroma_dir)

    @property
    def app_db_path_abs(self) -> Path:
        return self._abs(self.app_db_path)

    @property
    def storage_path(self) -> Path:
        return self._abs(self.storage_dir)

    @property
    def corpus_path(self) -> Path:
        return self._abs(self.corpus_dir)

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @staticmethod
    def _abs(value: str) -> Path:
        p = Path(value)
        return p if p.is_absolute() else BACKEND_DIR / p


@lru_cache
def get_settings() -> Settings:
    return Settings()


# --- 078-openai-key-ui: effective OpenAI key (DB precedes env) --------------

# The key the app actually uses: the UI-saved value in `app_config.openai_api_key`
# when present, else the env `OPENAI_API_KEY`. The store import is lazy because
# `db.store` imports this module (avoid an import cycle). A store/DB failure is
# swallowed so a broken DB never hides a perfectly good env key.
OPENAI_KEY_CONFIG_KEY = "openai_api_key"


def _db_config(key: str) -> str:
    """Read an `app_config` value (lazy store import; swallow DB errors)."""
    try:
        from .db.store import get_store

        return (get_store()._get_config_sync(key) or "").strip()
    except Exception:  # noqa: BLE001 - a DB hiccup must not mask the env default
        return ""


async def _db_config_async(key: str) -> str:
    """Read an `app_config` value asynchronously (lazy store import; swallow DB errors)."""
    try:
        from .db.store import get_store

        val = await get_store().get_config(key)
        return (val or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def effective_openai_key() -> str:
    return _db_config(OPENAI_KEY_CONFIG_KEY) or get_settings().openai_api_key.strip()


def has_effective_openai_key() -> bool:
    return bool(effective_openai_key())


# --- 075-ollama-embeddings: effective embedding config (DB precedes env) -----

EMBEDDING_PROVIDER_CONFIG_KEY = "embedding_provider"
EMBEDDING_MODEL_CONFIG_KEY = "embedding_model"
OLLAMA_BASE_URL_CONFIG_KEY = "ollama_base_url"
EMBEDDING_SIGNATURE_CONFIG_KEY = "embedding_signature"


def effective_embedding_provider() -> str:
    return _db_config(EMBEDDING_PROVIDER_CONFIG_KEY) or get_settings().embedding_provider


async def effective_embedding_provider_async() -> str:
    return (
        await _db_config_async(EMBEDDING_PROVIDER_CONFIG_KEY) or get_settings().embedding_provider
    )


def effective_embedding_model() -> str:
    return _db_config(EMBEDDING_MODEL_CONFIG_KEY) or get_settings().embedding_model


async def effective_embedding_model_async() -> str:
    return await _db_config_async(EMBEDDING_MODEL_CONFIG_KEY) or get_settings().embedding_model


def effective_ollama_base_url() -> str:
    """The Ollama server URL the backend connects to (shared by chat + embeddings,
    074). DB `app_config.ollama_base_url` overrides the env default."""
    return _db_config(OLLAMA_BASE_URL_CONFIG_KEY) or get_settings().ollama_base_url


def embedding_signature() -> str:
    """A `provider:model` stamp identifying the embedding space the index was built
    for. Stored at build time + compared on boot so a provider/model change forces a
    rebuild even when the vector dimensions happen to coincide (075)."""
    return f"{effective_embedding_provider()}:{effective_embedding_model()}"


# --- 095-vertex-ai-embeddings: effective Vertex AI config (DB precedes env) --

VERTEXAI_PROJECT_CONFIG_KEY = "vertexai_project"
VERTEXAI_LOCATION_CONFIG_KEY = "vertexai_location"
VERTEXAI_CREDENTIALS_CONFIG_KEY = "vertexai_credentials"


def effective_vertexai_project() -> str:
    return _db_config(VERTEXAI_PROJECT_CONFIG_KEY) or get_settings().vertexai_project.strip()


def effective_vertexai_location() -> str:
    return _db_config(VERTEXAI_LOCATION_CONFIG_KEY) or get_settings().vertexai_location.strip()


def effective_vertexai_credentials() -> str:
    return (
        _db_config(VERTEXAI_CREDENTIALS_CONFIG_KEY) or get_settings().vertexai_credentials.strip()
    )
