"""Shared state for the agent graph."""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    message: str
    # Conversation this run belongs to; scopes RAG retrieval to the base corpus
    # plus this conversation's uploaded documents (None = corpus only).
    session_id: str | None
    top_k: int
    # Minimum rerank-score threshold (055). 0 = no filtering. Only the Intermediate
    # rung reranks, so this is a no-op on Simple.
    rerank_threshold: float
    # Delivery mode ("stream" | "batch"); batch generates the answer in one shot.
    mode: str
    # Experiment overrides (006-interactive-experiments), request-only inputs:
    #   system_prompt: replaces the GUARDRAILS layer (042-agent-anatomy split
    #                  the prior single prompt into guardrails + role); blank/
    #                  None falls back to the default ``GUARDRAILS_PROMPT``.
    #   agent_prompt:  replaces the ROLE layer (042-agent-anatomy); blank/None
    #                  falls back to the default ``AGENT_PROMPT``.
    #   enabled_tools: tool names to expose (None = all, [] = none) — gates the
    #                  retrieval tool too (026-agent-tool-autonomy).
    #   model:         per-conversation OpenAI model override (042-agent-anatomy);
    #                  validated against the curated allowlist by the API layer.
    #                  None = use the configured default (``settings.llm_model``).
    system_prompt: str | None
    agent_prompt: str | None
    enabled_tools: list[str] | None
    model: str | None
    # Self-identity (049-agent-self-identity), resolved server-side from the
    # session's bound agent row (043/044). Either may be None when no agent
    # is bound — the identity layer is then omitted from the system prompt
    # entirely, reproducing the prior 042-anatomy 3-layer assembly.
    agent_name: str | None
    agent_description: str | None
    # Per-feature builder inputs (061-scenario-builder), request-only — replace the
    # coarse 008 ``scenario`` gate. ``rerank`` turns on the cross-encoder reranker
    # (054); ``runtime`` selects the agent loop (``react`` | ``deepagents`` |
    # ``multiagent``) and gates the DeepAgents preamble (057). Defaults (False /
    # ``react``) reproduce today's Simple run byte-for-byte.
    rerank: bool
    runtime: str
    # RAGLESS / PageIndex (056-ragless-pageindex), request-only. When True the
    # retrieval tool runs the vector path (for display) AND the reasoning-based
    # PageIndex path (which grounds the answer). False (default) reproduces today's
    # behavior byte-for-byte.
    ragless: bool
    # Hybrid search (070-hybrid-search), request-only. When True the retrieval tool
    # runs a sparse BM25 lane alongside the dense vector search and fuses them with RRF
    # (Vector-RAG only). False (default) reproduces today's single-search behavior
    # byte-for-byte (no ``rag.hybrid`` stage).
    hybrid: bool
    # Forced failure for this run (017-failure-injection), request-only:
    #   "none" (default, unchanged) | "tool_error" | "llm_timeout".
    simulate_failure: str
    # Verify / reflection loop (098-verify-reflection-loop), request-only.
    #   verify_enabled — when True, a critic pass (verify_node) judges the drafted
    #                    answer and can loop back to generation, bounded by
    #                    MAX_REVISIONS. False (default) reproduces today's behavior
    #                    byte-for-byte (no agent.verify stage, no critic call).
    #   revisions      — how many revision rounds have been triggered so far (the
    #                    graph's hard bound reads this). Starts at 0.
    #   verify_decision — the last verify verdict routed on ("revise" ⇒ loop back to
    #                    generate; anything else ⇒ commit to respond). Set by verify_node.
    verify_enabled: bool
    revisions: int
    verify_decision: str
    # Long-term memory: prior {message, answer} turns from the application DB.
    history: list[dict[str, str]]
    # Skill catalog (027-skills), request-derived: each {name, description} advertised
    # in the system prompt so the agent knows what it can load via `load_skill`. The
    # body is never here — it is loaded on demand. Empty list = no skills advertised.
    skills_catalog: list[dict[str, str]]
    # The canonical ReAct message thread (026-agent-tool-autonomy). The agent is
    # called on this running thread: a HumanMessage, then AIMessage(tool_calls) →
    # ToolMessage pairs as it decides + observes, then the final AIMessage. The
    # ``add_messages`` reducer appends updates across nodes — this is what a
    # LangSmith trace renders as the standard tool-calling chain, and what makes
    # every tool call (including knowledge-base retrieval) an *agent decision*
    # rather than something injected into the prompt.
    messages: Annotated[list[AnyMessage], add_messages]
    # Display mirrors for the inspector (derived as the thread runs):
    #   context — text of the latest retrieval ToolMessage (the grounding context
    #             the inspector's "context window" view shows); "" until retrieved.
    #   chunks  — the ranked chunks from the latest retrieval (citations/persist).
    #   used_tools — names of tools executed this run.
    context: str
    chunks: list[dict[str, Any]]
    used_tools: list[str]
    iterations: int
    answer: str
    # DeepAgents working memory (057-deepagents-runtime), Intermediate rung only:
    #   plan — the todo list the agent maintains via write_todos: ordered
    #          {content, status} items (status pending/in_progress/completed), updated
    #          across the loop. Empty on Simple.
    #   vfs  — the virtual file system: an in-memory scratchpad (path -> content) the
    #          agent writes/reads/edits across steps via the file tools, so work survives
    #          beyond a single prompt's context window. Per-run working memory; not
    #          persisted to the DB across turns. Empty on Simple.
    plan: list[dict[str, str]]
    vfs: dict[str, str]
