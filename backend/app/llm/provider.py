"""LLM provider abstraction.

The agent never talks to OpenAI directly — it goes through an ``LLMProvider``.
The ABC stays as a thin seam, but there is exactly one implementation:
``get_provider()`` always returns the real :class:`OpenAIProvider`, and fails
fast with :class:`MissingAPIKeyError` when no key is configured. Tool
*execution* is always real (via MCP).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..config import MissingAPIKeyError, get_settings

if TYPE_CHECKING:
    from langchain_core.messages import AIMessage, AnyMessage


@dataclass
class ToolSpec:
    """A tool advertised to the model (derived from the MCP server)."""

    name: str
    description: str
    schema: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass
class TokenUsage:
    """Real token usage reported by the provider for one model call.

    011-token-cost: every LLM call (each reasoning round's ``decide`` + the final
    ``stream_answer``) reports this; the agent records it on the trace so the LLM
    block can show real tokens and cost.
    """

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

    @classmethod
    def from_metadata(cls, md: dict[str, Any] | None) -> TokenUsage | None:
        """Build from LangChain ``usage_metadata`` (input/output/total tokens)."""
        if not md:
            return None
        return cls(
            prompt_tokens=int(md.get("input_tokens", 0)),
            completion_tokens=int(md.get("output_tokens", 0)),
            total_tokens=int(md.get("total_tokens", 0)),
        )


@dataclass
class Verdict:
    """A critic's judgement of a drafted answer (098-verify-reflection-loop).

    ``decision`` is ``"pass"`` (the answer is good enough to commit) or ``"revise"``
    (send it back to generation). ``reason`` is a short, user-facing rationale shown
    in the verify drill-in. ``usage`` is the real token usage of the critic call (011),
    folded into the ``agent.verify`` metrics so the reflection cost stays visible.
    """

    decision: str
    reason: str
    usage: TokenUsage | None = None


@dataclass
class Decision:
    """The model's choice: call tools, or (when empty) produce the answer."""

    # The raw AI message the model returned, carrying its ``tool_calls`` and/or
    # content. The agent appends it to the canonical thread when it routes to the
    # tools node, so the next reasoning round (and a LangSmith trace) sees the
    # standard AIMessage(tool_calls) → ToolMessage chain (026-agent-tool-autonomy).
    message: AIMessage
    tool_calls: list[ToolCall]
    # Everything we sent the model, surfaced in the UI inspector.
    prompt_preview: dict[str, Any]
    # Real token usage for this decide call (011); None if the provider omits it.
    usage: TokenUsage | None = None


class LLMProvider(ABC):
    name: str = "base"
    model_name: str = "base"
    # Usage of the most recent `stream_answer` call. A token generator can't also
    # return a value, so the streaming usage is surfaced here as a side-channel
    # the agent reads after the stream completes (011-token-cost).
    last_stream_usage: TokenUsage | None = None

    @abstractmethod
    async def decide(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        tools: list[ToolSpec],
        history: list[dict[str, str]] | None = None,
    ) -> Decision:
        """Reason over the running message thread and decide what to do next.

        ``thread`` is the canonical ReAct conversation so far (a HumanMessage,
        then AIMessage(tool_calls) → ToolMessage pairs). The provider prepends a
        SystemMessage (the prompt only) followed by the long-term-memory
        ``history`` rendered as **real alternating turns** (Human/AI), then binds
        ``tools`` and calls the model. The returned :class:`Decision` carries the
        raw ``AIMessage`` (with any ``tool_calls``) so the agent can append it to
        the thread. ``history`` is the long-term memory: prior {message, answer}
        turns — sent as conversation turns, never folded into the system prompt.
        """

    @abstractmethod
    def stream_answer(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[str]:
        """Stream the final user-facing answer, token by token.

        Runs on the full thread (whose ToolMessages already carry any retrieved
        context / tool results), so the answer is grounded without stuffing
        results into the system prompt.
        """

    async def critique(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        history: list[dict[str, str]] | None = None,
    ) -> Verdict:
        """Judge a drafted answer and return a structured :class:`Verdict`.

        098-verify-reflection-loop: a **concrete** default that reuses :meth:`decide`
        (which every provider already implements) with **no tools** — the critic is a
        plain model call over a critic ``system`` prompt + a ``thread`` describing the
        question, the drafted answer and the grounding. It parses the model's reply into
        a ``pass``/``revise`` verdict. Providers may override for a structured-output
        path, but the shared implementation keeps every backend (OpenAI / Ollama /
        Vertex AI) working with no per-provider change and stays genuinely real.

        Fail-safe: an ambiguous reply is treated as ``pass`` so a real run never loops
        needlessly (the bound in the graph is the hard stop regardless).
        """
        decision = await self.decide(system=system, thread=thread, tools=[], history=history)
        content = decision.message.content
        text = content if isinstance(content, str) else str(content or "")
        return parse_verdict(text, usage=decision.usage)


def parse_verdict(text: str, *, usage: TokenUsage | None = None) -> Verdict:
    """Parse a critic reply into a :class:`Verdict` (098-verify-reflection-loop).

    The critic is instructed to answer ``PASS`` or ``REVISE: <reason>``. We read the
    leading token case-insensitively: a reply that starts with ``REVISE`` is a revision
    request (the rest, stripped of separators, is the reason); anything else — including
    an empty or malformed reply — is a **pass** (fail-safe, so an ambiguous critic never
    forces a needless revision). The hard loop bound lives in the graph regardless.
    """
    stripped = (text or "").strip()
    if stripped.upper().startswith("REVISE"):
        reason = stripped[len("REVISE") :].lstrip(" :.-—\t").strip()
        return Verdict("revise", reason or "The critic requested a revision.", usage)
    # Strip a leading "PASS" marker from the reason when present, else use the whole reply.
    reason = stripped
    if stripped.upper().startswith("PASS"):
        reason = stripped[len("PASS") :].lstrip(" :.-—\t").strip()
    return Verdict("pass", reason or "The answer passed verification.", usage)


def get_provider(
    *,
    provider: str = "openai",
    model: str | None = None,
    base_url: str | None = None,
) -> LLMProvider:
    """Return the LLM provider for this run, or fail fast when misconfigured.

    042-agent-anatomy: the optional ``model`` kwarg picks the model for this run;
    for OpenAI the API layer validates it against the curated allowlist first.
    ``None`` keeps today's behavior (use ``settings.llm_model``).

    074-ollama-provider: ``provider`` selects the backend. ``"openai"`` (default)
    is unchanged and fails fast with :class:`MissingAPIKeyError` when no key is
    configured. ``"ollama"`` returns a real local-Ollama provider and needs **no**
    OpenAI key; ``base_url`` is the local server address (falls back to the
    Ollama default).
    """
    settings = get_settings()

    if provider == "ollama":
        from .ollama_provider import OllamaProvider

        return OllamaProvider(
            model=model or settings.llm_model,
            base_url=base_url,
        )

    if provider == "vertexai":
        from ..config import MissingVertexAICredentialsError
        from ..db.store import get_store
        from .vertexai_provider import VertexAIProvider

        store = get_store()
        project = store._get_config_sync("vertexai_project") or settings.vertexai_project
        location = store._get_config_sync("vertexai_location") or settings.vertexai_location
        credentials = (
            store._get_config_sync("vertexai_credentials") or settings.vertexai_credentials
        )

        if not credentials or not credentials.strip():
            raise MissingVertexAICredentialsError()

        return VertexAIProvider(
            model=model or settings.llm_model,
            project=project,
            location=location,
            credentials=credentials,
        )

    # 078-openai-key-ui: the key may come from the UI/DB (DB precedes env).
    from ..config import effective_openai_key

    key = effective_openai_key()
    if not key:
        raise MissingAPIKeyError()
    from .openai_provider import OpenAIProvider

    return OpenAIProvider(
        model=model or settings.llm_model,
        api_key=key,
    )
