"""The LangGraph agent — a canonical, tool-calling ReAct loop.

Topology::

    START -> route -> think --(tool calls?)--> tools --+
                        ^                                |
                        +--------------------------------+
                        |
                        +--(no tool calls)--> generate -> respond -> END

The agent reasons over a **canonical message thread** (``AgentState.messages``):
the model is bound to the advertised tools and *chooses* what to call; its
``AIMessage(tool_calls=…)`` is appended to the thread and each tool's result
returns as a ``ToolMessage`` (026-agent-tool-autonomy). Every tool call —
including **knowledge-base retrieval**, which is just another tool
(``search_knowledge_base``) — is therefore an honest agent decision, visible as
the standard tool-calling chain in a LangSmith trace.

Each node emits trace stages through the :class:`TraceEmitter` it receives via
the runnable ``config``, so the whole run is observable from the frontend.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from functools import lru_cache
from time import perf_counter
from typing import Any, cast

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from ..llm.context import context_budget, context_window
from ..llm.pricing import usage_metrics
from ..llm.provider import LLMProvider, get_provider
from ..mcp.client import ToolRegistry, get_registry, jsonrpc_frames
from ..mcp.server import LOAD_SKILL_TOOL, found_for
from ..rag.pageindex import pageindex_retrieve
from ..rag.retriever import retrieve as rag_retrieve
from ..schemas import Phase, Stage
from ..trace import StageRecord, TraceEmitter
from .deepagents import run_deepagents_tool
from .prompts import (
    AGENT_PROMPT,
    CRITIC_PROMPT,
    GUARDRAILS_PROMPT,
    compose_system,
    critic_user_message,
    deepagents_block,
    deepagents_state_block,
    identity_block,
    revision_instruction,
    skills_block,
)
from .resilience import (
    CIRCUIT_OPEN,
    MAX_RETRIES,
    TREATMENT_FALLBACK,
    TREATMENT_GRACEFUL,
    backoff_ms,
)
from .state import AgentState
from .tools import RETRIEVAL_TOOL, agent_tool_specs, is_deepagents_tool, is_retrieval

MAX_ITERATIONS = 3
# 057-deepagents-runtime: a DeepAgent's loop is longer (plan → work steps → write files →
# delegate → answer), so the Intermediate rung gets more reasoning-round headroom than the
# Simple ReAct loop. Bounded all the same (and by ``recursion_limit``).
DEEPAGENTS_MAX_ITERATIONS = 8
# 098-verify-reflection-loop: the hard bound on the verify ⇄ generate revision loop. A
# `revise` verdict re-enters generation at most this many times; after that the answer is
# committed regardless (the critic could keep asking forever). Independent of MAX_ITERATIONS
# (the tool loop). Small on purpose: it bounds worst-case extra cost to ~N generate+critic rounds.
MAX_REVISIONS = 2


def _max_iterations(state: AgentState) -> int:
    return DEEPAGENTS_MAX_ITERATIONS if _with_deepagents(state) else MAX_ITERATIONS


# 017-failure-injection — deterministic, clearly-labelled *simulated* failures.
# The observation fed back to the model uses the MCP error convention
# (``error:`` prefix, like a real failed call) so the agent reasons over it and
# degrades/abstains. Labelled ``simulated: true`` on the event so it is honest.
SIMULATED_TOOL_ERROR = "error: simulated tool failure (injected by the failure simulator)"
SIMULATED_TIMEOUT = "simulated LLM timeout (injected by the failure simulator)"
# The degraded answer when the model keeps "timing out": the *fallback* the circuit
# breaker hands off to after retries are exhausted (051-failure-treatments). Framed
# as a deliberate graceful degradation, not a raw crash — the model produced nothing,
# so we abstain honestly rather than guess. The bilingual treatment labels the UI
# shows around it live in the frontend i18n (constitution §4).
DEGRADED_TIMEOUT_ANSWER = (
    "The model timed out after several retries — degraded gracefully, no reliable answer this turn."
)


def _deps(config: RunnableConfig) -> tuple[TraceEmitter, LLMProvider, ToolRegistry]:
    c = config["configurable"]  # type: ignore[index]
    return c["emitter"], c["provider"], c["registry"]


def _with_deepagents(state: Mapping[str, Any]) -> bool:
    """Whether the DeepAgents tools (057) are offered this run.

    Gated purely by the ``deepagents`` runtime (061-scenario-builder, was the
    Intermediate rung). The two seams are independent and **compose**: RAGLESS (056)
    only swaps what the retrieval tool grounds on (PageIndex instead of the vector
    pipeline) inside ``_run_retrieval_tool``, while the DeepAgents plan/file/delegate
    tools remain available for the agent to elect. A DeepAgents run with RAGLESS on
    therefore plans/delegates as usual and its retrieval steps use PageIndex.
    """
    return state.get("runtime") == "deepagents"


def _skills_advertised(state: AgentState) -> bool:
    """Whether ``load_skill`` is in the advertised tool set this run (027-skills).

    Gated exactly like any tool by the 006 ``enabled_tools`` override: ``None`` =
    all tools (advertised), a list must contain it, ``[]`` = none. When it is not
    advertised the agent can load nothing, so the catalog block is omitted.
    """
    enabled = state["enabled_tools"]
    return enabled is None or LOAD_SKILL_TOOL in enabled


def _identity_part(state: AgentState) -> str:
    """The agent's self-identity line (049-agent-self-identity) or ``""``.

    Reads ``agent_name`` / ``agent_description`` from state (resolved server-side
    from the session's bound agent row, 043/044) and defers rendering to
    :func:`identity_block`. When no name is bound the layer is omitted entirely
    so the 042-anatomy 3-layer assembly is reproduced byte-for-byte.
    """
    return identity_block(state.get("agent_name"), state.get("agent_description"))


def _system_parts(state: AgentState, *, final: bool = False) -> tuple[str, str, str]:
    """The three composition-time layers of the assembled system message.

    042-agent-anatomy split the prior single prompt into two independently
    overridable layers:

    - **guardrails** (``system_prompt`` override, default ``GUARDRAILS_PROMPT``)
      — platform-wide rules every agent in the simulator inherits.
    - **role** (``agent_prompt`` override, default ``AGENT_PROMPT``) — this
      agent's identity and tool-usage instructions.

    006-interactive-experiments semantics for each: non-blank override fully
    replaces the corresponding default; blank/whitespace falls back. 027-skills:
    the catalog block is the third layer, non-empty only when there are skills
    *and* ``load_skill`` is advertised. Returned separately so 036's context
    budget can attribute each to a distinct category. The 049-identity layer
    is resolved by :func:`_identity_part`; for budget accounting it joins the
    ``system`` slice (alongside guardrails + role) so the per-category totals
    stay coherent end-to-end.
    """
    sys_override = state.get("system_prompt")
    agent_override = state.get("agent_prompt")
    guardrails = sys_override if (sys_override and sys_override.strip()) else GUARDRAILS_PROMPT
    role = agent_override if (agent_override and agent_override.strip()) else AGENT_PROMPT
    # 057-deepagents-runtime: under the DeepAgents runtime append the guidance to the
    # role layer so the model knows it has the planning / file-system / delegation tools
    # (and to skip them for trivial requests). Empty under other runtimes (Simple/ReAct
    # byte-for-byte). Part of the role ⇒ 036's budget attributes it to the system slice.
    block = (
        deepagents_block(state.get("runtime", "react"), final=final)
        if _with_deepagents(state)
        else ""
    )
    if block:
        role = f"{role}\n\n{block}"
    catalog = state.get("skills_catalog") or []
    skills = skills_block(catalog) if (catalog and _skills_advertised(state)) else ""
    return guardrails, role, skills


def _effective_system(state: AgentState, *, final: bool = False) -> str:
    """The system message actually sent to the model.

    Layout: ``[identity + "\\n\\n" +] guardrails + "\\n\\n" + role [+ "\\n\\n"
    + skills]``. Without an agent row (identity blank) it falls back to
    today's 042-anatomy composition exactly.

    ``final=True`` is the **answer-time** variant used by ``generate_node``:
    under the DeepAgents runtime it swaps the planning mandate for the
    answer-only :data:`DEEPAGENTS_FINAL_PROMPT` and skips re-injecting the live
    plan/scratchpad, so a weaker model writes a clean answer instead of echoing
    its todos and workflow back to the user. Off the DeepAgents runtime ``final``
    is inert (ReAct/Simple byte-for-byte).
    """
    guardrails, role, skills = _system_parts(state, final=final)
    # Recompose via the canonical helper so this and ``compose_system`` can never
    # drift on the join separator. An empty catalog yields just the two layers.
    catalog = state.get("skills_catalog") or []
    catalog_for_block = catalog if skills else []
    composed = compose_system(guardrails, role, catalog_for_block, identity=_identity_part(state))
    # 057-deepagents-runtime: re-inject the live plan + scratchpad **during the loop** so the
    # agent SEES its todos/files every round (the TodoListMiddleware feedback loop) — this is
    # what makes it maintain a plan. At final-answer time (`final`) we omit it: the results
    # already live in the thread as ToolMessages, and re-showing the plan only tempts a weak
    # model to copy the scaffolding into the user's answer.
    if _with_deepagents(state) and not final:
        block = deepagents_state_block(state.get("plan") or [], state.get("vfs") or {})
        if block:
            composed = f"{composed}\n\n{block}"
    return composed


async def route_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, registry = _deps(config)

    async with emitter.stage(Stage.AGENT_ROUTE, "Agent received the query") as rec:
        rec.data = {
            "query": state["message"],
            "plan": "Decide which tools to call — search the knowledge base, run a "
            "calculation, check the time — then answer.",
            "memory_turns": len(state["history"]),
        }

    async with emitter.stage(Stage.MCP_DISCOVER, "Discovering available tools") as rec:
        specs = agent_tool_specs(
            registry, state["enabled_tools"], with_deepagents=_with_deepagents(state)
        )
        rec.data = {
            "transport": registry.transport,
            "tools": [{"name": s.name, "description": s.description} for s in specs],
            # The actual JSON-RPC discovery exchange (007); reconstructed for the
            # in-process fallback, faithful to the wire for mcp-stdio.
            "jsonrpc": jsonrpc_frames(
                "tools/list",
                {},
                {
                    "tools": [
                        {
                            "name": s.name,
                            "description": s.description,
                            "inputSchema": s.schema,
                        }
                        for s in specs
                    ]
                },
                reconstructed=registry.transport == "local-fallback",
            ),
        }
    return {}


async def _degrade_llm_timeout(
    rec: StageRecord,
    emitter: TraceEmitter,
    provider: LLMProvider,
    state: AgentState,
) -> dict[str, Any]:
    """051-failure-treatments: the injected ``llm_timeout`` resilience ladder.

    Retries the model call ``MAX_RETRIES`` times — each attempt its own ``llm.prompt``
    span that "times out" — waiting a real, exponentially-growing ``backoff_ms``
    between attempts. When the retries are exhausted the circuit breaker **opens**
    (recorded on the ``agent.think`` END, ``rec``) and the run degrades to the labelled
    fallback answer, routed straight to ``respond`` by ``_should_continue``. Real
    control flow; only the underlying call is injected (§3).
    """
    for attempt in range(1, MAX_RETRIES + 1):
        async with emitter.stage(
            Stage.LLM_PROMPT, f"Reasoning with the model (attempt {attempt})"
        ) as prompt_rec:
            prompt_rec.data = {
                "error": SIMULATED_TIMEOUT,
                "simulated": True,
                "attempt": attempt,
                "max_retries": MAX_RETRIES,
            }
            # Record the backoff only when another attempt follows (so the displayed
            # value is exactly what we sleep — no phantom wait on the last attempt).
            if attempt < MAX_RETRIES:
                prompt_rec.data["backoff_ms"] = backoff_ms(attempt)
        # Wait *between* attempts (outside the span) so the gap the learner sees is
        # the backoff, and the breaker gets real breathing room before retrying.
        if attempt < MAX_RETRIES:
            await asyncio.sleep(backoff_ms(attempt) / 1000)

    # Retries exhausted → trip the breaker and hand off to the fallback treatment.
    rec.data = {
        "model": provider.model_name,
        "decision": "error",
        "error": SIMULATED_TIMEOUT,
        "simulated": True,
        "attempt": MAX_RETRIES,
        "max_retries": MAX_RETRIES,
        "circuit": CIRCUIT_OPEN,
        "treatment": TREATMENT_FALLBACK,
    }
    return {
        "iterations": state["iterations"] + 1,
        "answer": DEGRADED_TIMEOUT_ANSWER,
    }


async def think_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, registry = _deps(config)
    specs = agent_tool_specs(
        registry, state["enabled_tools"], with_deepagents=_with_deepagents(state)
    )

    async with emitter.stage(Stage.AGENT_THINK, "Agent reasoning") as rec:
        # 051-failure-treatments: an injected llm_timeout no longer degrades on the
        # first hit — it drives a *real* retry → exponential backoff → circuit-breaker
        # → fallback ladder so the learner watches the treatment, not just the break.
        if state.get("simulate_failure") == "llm_timeout":
            return await _degrade_llm_timeout(rec, emitter, provider, state)
        # The agent reasons by *calling the model* — the LLM is its brain, used on
        # every round, not just to write the final answer. Wrap the decide call in
        # an llm.prompt span so the LLM station is observably active while it thinks
        # and the Agent → LLM round-trip animates (010-llm-as-brain). The span's END
        # still carries the assembled prompt preview the inspector shows. A *real*
        # model timeout (not the injected one) propagates to main.py's handler.
        async with emitter.stage(Stage.LLM_PROMPT, "Reasoning with the model") as prompt_rec:
            decision = await provider.decide(
                system=_effective_system(state),
                thread=state["messages"],
                tools=specs,
                history=state["history"],
            )
            # The retrieved-context readout (the inspector's "context window")
            # comes from state — the thread carries it as a ToolMessage.
            # 036-context-window-budget: attach the real model window + the
            # per-category tiktoken split (a labelled estimate) so the Agent
            # panel renders a /context-style budget against the real maximum.
            # 042-agent-anatomy: the system layer now spans guardrails + role;
            # the budget attributes their combined token count to ``system``.
            # 049-agent-self-identity: when an identity line is rendered, it
            # joins the same ``system`` slice so the per-category totals stay
            # coherent with what the model actually received (the identity
            # line ships as part of the same system message).
            guardrails, role, skills = _system_parts(state)
            identity = _identity_part(state)
            system_text = f"{guardrails}\n\n{role}"
            if identity:
                system_text = f"{identity}\n\n{system_text}"
            prompt_rec.data = {
                **decision.prompt_preview,
                "context": state["context"],
                "context_window": context_window(provider.model_name),
                "context_budget": context_budget(
                    system=system_text,
                    tools=specs,
                    skills=skills,
                    history=state["history"],
                    retrieved=state["context"],
                    thread=state["messages"],
                    retrieval_tools={RETRIEVAL_TOOL},
                    skill_tools={LOAD_SKILL_TOOL},
                ),
            }
        rec.data = {
            "model": provider.model_name,
            "decision": "call_tools" if decision.tool_calls else "answer",
            "tool_calls": [{"name": tc.name, "args": tc.args} for tc in decision.tool_calls],
        }
        # This reasoning round is a real LLM call — record its token usage + cost
        # so the LLM block can total rounds, tokens and US$ (011-token-cost).
        if decision.usage:
            rec.metrics.update(usage_metrics(provider.model_name, decision.usage))

    # Continue the loop only when there are tool calls AND we are within the
    # iteration bound. We append the tool-calling AIMessage to the thread *only*
    # when we will actually execute it, so the thread never ends with a dangling
    # AIMessage(tool_calls) that has no matching ToolMessage (which OpenAI rejects).
    iterations = state["iterations"] + 1
    continue_loop = bool(decision.tool_calls) and iterations <= _max_iterations(state)
    update: dict[str, Any] = {"iterations": iterations}
    if continue_loop:
        update["messages"] = [decision.message]
    return update


async def _run_mcp_tool(
    name: str,
    args: dict[str, Any],
    state: AgentState,
    registry: ToolRegistry,
    emitter: TraceEmitter,
    fail_tool: bool,
) -> str:
    """Execute an MCP tool, animating the MCP station (mcp.call)."""
    async with emitter.stage(
        Stage.MCP_CALL,
        f"Calling tool: {name}",
        start_data={"tool": name, "args": args},
    ) as rec:
        if fail_tool:
            output = SIMULATED_TOOL_ERROR
        else:
            output = await registry.call(name, args, enabled=state["enabled_tools"])
        is_error = str(output).startswith("error:")
        rec.data = {
            "tool": name,
            "args": args,
            "result": output,
            # 021-abstain-badge: a structured not-found signal on the open `data`
            # record (no new Stage). False = the tool returned empty/not-found, so
            # a well-behaved agent abstains on this sub-query; the UI badges it.
            # A simulated failure is an *error* (017), not an abstention, so it
            # keeps found=True (the error badge covers that case).
            "found": True if fail_tool else found_for(name, output),
            # The actual JSON-RPC tool-call exchange (007): a `tools/call` request
            # and a CallToolResult response with text content.
            "jsonrpc": jsonrpc_frames(
                "tools/call",
                {"name": name, "arguments": args},
                {"content": [{"type": "text", "text": output}], "isError": is_error},
                reconstructed=registry.transport == "local-fallback",
            ),
        }
        if fail_tool:
            rec.data["error"] = SIMULATED_TOOL_ERROR
            rec.data["simulated"] = True
            # 051-failure-treatments: name the agent's reaction — it reasons over this
            # error observation and abstains/degrades, which *is* graceful degradation.
            rec.data["treatment"] = TREATMENT_GRACEFUL
    return output


async def _run_retrieval_tool(
    args: dict[str, Any],
    state: AgentState,
    emitter: TraceEmitter,
    fail_tool: bool,
) -> tuple[str, str, list[dict[str, Any]]]:
    """Execute the knowledge-base retrieval tool, animating the RAG station.

    Returns ``(observation, context, chunks)``: the observation becomes the
    ToolMessage fed back to the model; context + chunks update the display mirrors.
    """
    query = args.get("query") or state["message"]

    # 056-ragless-pageindex → 066-retrieval-strategy-radio: retrieval is a radio. With the
    # `ragless` strategy active, the reasoning-based PageIndex path REPLACES the vector
    # pipeline entirely — no rag.* stage fires, and the selected sections are the grounding
    # the model answers from. (Pre-066 ran both side-by-side; the radio makes it either/or,
    # so "Sources used" honestly reflects only what grounded the answer.)
    if state.get("ragless"):
        context, chunks = await pageindex_retrieve(query, emitter, session_id=state["session_id"])
        observation = context or "(no relevant passages found in the knowledge base)"
        return observation, context, chunks

    if fail_tool:
        # 017: surface the injected failure on a rag.retrieve END (so it is visible
        # on the RAG station) without running the real search.
        async with emitter.stage(Stage.RAG_RETRIEVE, "Selecting top-k chunks") as rec:
            rec.data = {
                "chunks": [],
                "k": state["top_k"],
                "error": SIMULATED_TOOL_ERROR,
                "simulated": True,
                # 051-failure-treatments: the agent abstains on this sub-query —
                # graceful degradation, named so the learner reads handling, not break.
                "treatment": TREATMENT_GRACEFUL,
            }
        return SIMULATED_TOOL_ERROR, state["context"], state["chunks"]

    context, chunks = await rag_retrieve(
        query,
        state["top_k"],
        emitter,
        session_id=state["session_id"],
        rerank=state["rerank"],
        rerank_threshold=state["rerank_threshold"],
        hybrid=state["hybrid"],
    )

    observation = context or "(no relevant passages found in the knowledge base)"
    return observation, context, chunks


async def tools_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, registry = _deps(config)
    # The pending calls are the tool_calls on the AIMessage think just appended.
    last = state["messages"][-1]
    pending = getattr(last, "tool_calls", None) or []

    used = list(state["used_tools"])
    context = state["context"]
    chunks = list(state["chunks"])
    fail_tool = state.get("simulate_failure") == "tool_error"
    # 057-deepagents-runtime: working copies of the DeepAgents state the tools mutate (the
    # virtual file system + the recorded plan). Returned as state updates so they persist
    # across the think ⇄ tools loop, the same way the message thread accumulates. Read
    # defensively (empty default) so a tool call works even on a minimal hand-built state.
    vfs = dict(state.get("vfs") or {})
    plan = list(state.get("plan") or [])

    tool_messages: list[ToolMessage] = []
    for tc in pending:
        name = tc["name"]
        args = tc.get("args", {}) or {}
        call_id = tc.get("id", "")
        if is_retrieval(name):
            output, context, chunks = await _run_retrieval_tool(args, state, emitter, fail_tool)
        elif is_deepagents_tool(name):
            # The agent elected a DeepAgents tool (plan / file system / task). The handler
            # emits its agent.* stage and mutates vfs/plan in place; `task` spawns a real
            # sub-agent, so it needs the provider + registry.
            output = await run_deepagents_tool(
                name, args, dict(state), emitter, vfs, plan, provider=provider, registry=registry
            )
        else:
            output = await _run_mcp_tool(name, args, state, registry, emitter, fail_tool)
        # Feed the observation back as a ToolMessage so the next reasoning round
        # (and the trace) sees the canonical AIMessage(tool_calls) → ToolMessage
        # chain — the result is never stuffed into the system prompt.
        tool_messages.append(ToolMessage(content=str(output), tool_call_id=call_id, name=name))
        used.append(name)

    return {
        "messages": tool_messages,
        "used_tools": used,
        "context": context,
        "chunks": chunks,
        "vfs": vfs,
        "plan": plan,
    }


async def _finalize_plan(state: Mapping[str, Any], emitter: TraceEmitter) -> dict[str, Any]:
    """Close out a DeepAgents plan once the final answer is produced (067).

    The lead agent typically marks its synthesis todo ``in_progress`` and then answers
    directly — synthesising the answer *is* that step — without a final ``write_todos``
    to flip it to ``completed``, which leaves the plan looking unfinished. Now that the
    answer has been delivered, the runtime reconciles the plan: every remaining todo is
    marked ``completed`` and a closing ``agent.plan`` is emitted, so the plan honestly
    reflects that all its work is done. No-op when there is no plan (the Simple/ReAct
    runtime never plans) or the plan is already fully completed (nothing to reconcile).
    """
    plan = [dict(t) for t in (state.get("plan") or [])]
    if not plan or all(t.get("status") == "completed" for t in plan):
        return {}
    completed = [{"content": t.get("content", ""), "status": "completed"} for t in plan]
    async with emitter.stage(Stage.AGENT_PLAN, "Finalizing the plan") as rec:
        rec.data = {
            "todos": completed,
            "steps": [t["content"] for t in completed],
            "count": len(completed),
            "finalized": True,
        }
        rec.metrics["steps"] = float(len(completed))
    return {"plan": completed}


async def generate_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, _registry = _deps(config)

    # In stream mode each token is emitted as a PROGRESS event so the UI types
    # the answer out live; in batch mode we collect them silently and surface
    # the whole answer at once on the END event (the synchronous contract).
    streaming = state["mode"] != "batch"
    async with emitter.stage(Stage.LLM_GENERATE, "Generating the answer") as rec:
        tokens: list[str] = []
        # 029-ttft-throughput: measure time-to-first-token and generation
        # throughput with a monotonic clock (perf_counter — never wall-clock, to
        # avoid NTP skew). A streamed answer has two distinct clocks: the latency
        # the user feels before text appears (TTFT) and the rate it then types
        # out (tokens/sec). Both are real, additive keys on the generate END.
        # The provider yields tokens in batch mode too (only the per-token
        # PROGRESS emit is suppressed), so this measures in both modes (AC3).
        t0 = perf_counter()
        t_first: float | None = None
        async for token in provider.stream_answer(
            # final=True: the answer-only DeepAgents prompt (no planning mandate, no
            # re-injected todo list) so the plan/scaffolding never leaks into the reply.
            system=_effective_system(state, final=True),
            thread=state["messages"],
            history=state["history"],
        ):
            if t_first is None:
                t_first = perf_counter()
            tokens.append(token)
            if streaming:
                await emitter.emit(Stage.LLM_GENERATE, Phase.PROGRESS, data={"token": token})
        t_last = perf_counter()
        answer = "".join(tokens)
        rec.data = {"answer": answer, "model": provider.model_name, "delivery": state["mode"]}
        rec.metrics["tokens"] = float(len(tokens))
        if t_first is not None:
            rec.metrics["ttft_ms"] = round((t_first - t0) * 1000, 1)
            # Throughput over the post-first-token window. A single-token answer
            # has no such window, so fall back to the token count — keeps the
            # metric > 0 without a 1/ε blow-up.
            window = t_last - t_first
            rec.metrics["tokens_per_sec"] = (
                round(len(tokens) / window, 2)
                if len(tokens) >= 2 and window > 0
                else float(len(tokens))
            )
        # Real generation usage + cost (011), captured from the streamed final chunk.
        if provider.last_stream_usage:
            rec.metrics.update(usage_metrics(provider.model_name, provider.last_stream_usage))

    # 067: on a DeepAgents run, reconcile the plan to all-completed now that the answer
    # is written, so it doesn't read as unfinished. No-op for the Simple/ReAct runtime.
    plan_update = await _finalize_plan(state, emitter)

    # Close the canonical thread with the final assistant message.
    return {"answer": answer, "messages": [AIMessage(content=answer)], **plan_update}


async def verify_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    """098-verify-reflection-loop: judge the drafted answer, loop back on `revise`.

    A genuine critic model call (``provider.critique`` → a tool-less ``decide`` over the
    :data:`CRITIC_PROMPT`) scores the answer that ``generate_node`` just produced. On a
    ``revise`` verdict **within the bound** (``revisions < MAX_REVISIONS``) the critique is
    folded into the canonical thread as a user turn and the loop returns to ``generate`` (via
    ``_should_revise``); otherwise the answer is committed and the run proceeds to ``respond``.

    Runtime-agnostic: it keys only off ``verify_enabled`` (wired by ``_after_generate``), so it
    runs identically under the ReAct and DeepAgents runtimes. The critic's token usage is folded
    into the ``agent.verify`` metrics so the reflection cost stays visible (011).
    """
    emitter, provider, _registry = _deps(config)
    revisions = state["revisions"]

    async with emitter.stage(Stage.AGENT_VERIFY, "Verifying the answer") as rec:
        thread: list[AnyMessage] = [
            HumanMessage(
                content=critic_user_message(state["message"], state["answer"], state["context"])
            )
        ]
        verdict = await provider.critique(
            system=CRITIC_PROMPT, thread=thread, history=state["history"]
        )
        # Loop back only on a `revise` verdict that is still within the hard bound.
        will_revise = verdict.decision == "revise" and revisions < MAX_REVISIONS
        rec.data = {
            "decision": verdict.decision,
            "reason": verdict.reason,
            # Which draft this verdict judged (0 = the first draft), and the bound, so the
            # drill-in can show "revision 1 of 2". `will_revise` records whether the loop
            # actually re-entered generation (a capped `revise` commits instead).
            "revision": revisions,
            "max_revisions": MAX_REVISIONS,
            "will_revise": will_revise,
            "answer": state["answer"],
        }
        if verdict.usage:
            rec.metrics.update(usage_metrics(provider.model_name, verdict.usage))

    if will_revise:
        # Fold the critique into the thread so the next generate round honestly sees it,
        # and record the routing decision + bumped counter for the conditional edge.
        return {
            "verify_decision": "revise",
            "revisions": revisions + 1,
            "messages": [HumanMessage(content=revision_instruction(verdict.reason))],
        }
    return {"verify_decision": "pass"}


async def respond_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, _registry = _deps(config)
    emitter.answer = state["answer"]
    async with emitter.stage(Stage.RESPOND, "Returning the answer to the user") as rec:
        rec.data = {"answer": state["answer"]}
    return {}


def _after_generate(state: Mapping[str, Any]) -> str:
    """098-verify-reflection-loop: route the freshly-drafted answer.

    With the ``verify`` toggle on, the answer goes through the critic (``verify``) before
    it is committed; off, it goes straight to ``respond`` exactly as before — so the
    default run's stage stream is byte-for-byte unchanged (AC1).
    """
    return "verify" if state.get("verify_enabled") else "respond"


def _should_revise(state: Mapping[str, Any]) -> str:
    """098-verify-reflection-loop: loop back to generation, or commit the answer.

    ``verify_node`` sets ``verify_decision`` to ``"revise"`` only when it actually decided
    to loop (a ``revise`` verdict still within :data:`MAX_REVISIONS`); the bound is enforced
    there, so this edge is a simple read.
    """
    return "generate" if state.get("verify_decision") == "revise" else "respond"


def _should_continue(state: AgentState) -> str:
    # 017-failure-injection: a simulated LLM timeout in think_node degrades the run
    # — skip tools + generation and go straight to respond with the fallback answer.
    if state.get("simulate_failure") == "llm_timeout":
        return "respond"
    # think appends the tool-calling AIMessage only when it intends to loop, so a
    # trailing AIMessage with tool_calls is the signal to execute them.
    messages = state["messages"]
    if messages:
        last = messages[-1]
        if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
            return "tools"
    return "generate"


@lru_cache
def get_compiled_graph():
    builder = StateGraph(AgentState)
    builder.add_node("route", route_node)
    builder.add_node("think", think_node)
    builder.add_node("tools", tools_node)
    builder.add_node("generate", generate_node)
    builder.add_node("verify", verify_node)
    builder.add_node("respond", respond_node)

    builder.add_edge(START, "route")
    # 057-deepagents-runtime is tool-driven (no preamble node): on the Intermediate rung
    # the agent elects the DeepAgents tools (plan / file system / delegate) inside the
    # canonical think ⇄ tools loop, so the topology is unchanged from the ReAct loop.
    builder.add_edge("route", "think")
    builder.add_conditional_edges(
        "think",
        _should_continue,
        # "respond" is the 017 degraded path (simulated llm_timeout): skip tools +
        # generation and return the fallback answer set in think_node.
        {"tools": "tools", "generate": "generate", "respond": "respond"},
    )
    builder.add_edge("tools", "think")
    # 098-verify-reflection-loop: with `verify` on the draft goes through the critic first
    # (generate → verify), which either loops back (verify → generate) or commits
    # (verify → respond). Off, generate → respond directly (byte-for-byte baseline).
    builder.add_conditional_edges(
        "generate", _after_generate, {"verify": "verify", "respond": "respond"}
    )
    builder.add_conditional_edges(
        "verify", _should_revise, {"generate": "generate", "respond": "respond"}
    )
    builder.add_edge("respond", END)
    return builder.compile()


async def run_agent_state(
    message: str,
    top_k: int,
    emitter: TraceEmitter,
    history: list[dict[str, str]] | None = None,
    mode: str = "stream",
    session_id: str | None = None,
    system_prompt: str | None = None,
    agent_prompt: str | None = None,
    enabled_tools: list[str] | None = None,
    rerank: bool = False,
    runtime: str = "react",
    simulate_failure: str = "none",
    skills_catalog: list[dict[str, str]] | None = None,
    model: str | None = None,
    provider: str = "openai",
    base_url: str | None = None,
    agent_name: str | None = None,
    agent_description: str | None = None,
    rerank_threshold: float = 0.0,
    ragless: bool = False,
    hybrid: bool = False,
    verify: bool = False,
) -> AgentState:
    """Run the agent for one message and return the final graph state.

    Exposed (alongside :func:`run_agent`) so tests can inspect the canonical
    message thread (``state["messages"]``) the run produced.
    """
    llm_provider = get_provider(provider=provider, model=model, base_url=base_url)
    registry = await get_registry()
    graph = get_compiled_graph()

    initial: AgentState = {
        "message": message,
        "session_id": session_id,
        "top_k": top_k,
        "rerank_threshold": rerank_threshold,
        "mode": mode,
        "system_prompt": system_prompt,
        "agent_prompt": agent_prompt,
        "enabled_tools": enabled_tools,
        "model": model,
        "agent_name": agent_name,
        "agent_description": agent_description,
        "rerank": rerank,
        "runtime": runtime,
        "ragless": ragless,
        "hybrid": hybrid,
        "simulate_failure": simulate_failure,
        "verify_enabled": verify,
        "revisions": 0,
        "verify_decision": "",
        "history": history or [],
        "skills_catalog": skills_catalog or [],
        "messages": [HumanMessage(content=message)],
        "context": "",
        "chunks": [],
        "used_tools": [],
        "iterations": 0,
        "answer": "",
        "plan": [],
        "vfs": {},
    }
    config: RunnableConfig = {
        "configurable": {"emitter": emitter, "provider": llm_provider, "registry": registry},
        # Headroom for the DeepAgents loop (plan → work → files → delegate → answer);
        # each round is ~2 nodes, so this comfortably bounds DEEPAGENTS_MAX_ITERATIONS.
        "recursion_limit": 50,
    }
    return cast(AgentState, await graph.ainvoke(initial, config=config))


async def run_agent(
    message: str,
    top_k: int,
    emitter: TraceEmitter,
    history: list[dict[str, str]] | None = None,
    mode: str = "stream",
    session_id: str | None = None,
    system_prompt: str | None = None,
    agent_prompt: str | None = None,
    enabled_tools: list[str] | None = None,
    rerank: bool = False,
    runtime: str = "react",
    simulate_failure: str = "none",
    skills_catalog: list[dict[str, str]] | None = None,
    model: str | None = None,
    provider: str = "openai",
    base_url: str | None = None,
    agent_name: str | None = None,
    agent_description: str | None = None,
    rerank_threshold: float = 0.0,
    ragless: bool = False,
    hybrid: bool = False,
    verify: bool = False,
) -> str:
    """Run the full agent for one message, emitting trace events as it goes.

    ``history`` is long-term memory (prior turns) loaded from the application
    database; it is folded into the prompt context. ``mode`` controls delivery
    of the answer: ``"stream"`` emits per-token events, ``"batch"`` produces it
    in one shot. ``session_id`` scopes RAG retrieval to the base corpus plus this
    conversation's uploaded documents.

    Request-only overrides (006 + 042; all optional, omitting them reproduces
    today's behavior): ``system_prompt`` replaces the **guardrails** layer of
    the assembled prompt; ``agent_prompt`` replaces the **role** layer (the
    agent's identity / instructions); ``enabled_tools`` restricts which tools
    are discovered and callable (``None`` = all, ``[]`` = none) — including the
    knowledge-base retrieval tool; ``model`` picks the OpenAI model for this
    run (validated against the curated allowlist by the API layer).

    Server-resolved identity (049-agent-self-identity, not a request override):
    ``agent_name`` and ``agent_description`` are read from the session's bound
    agent row in ``main.py`` and folded into a leading "You are {name}. …"
    line of the system message so the model can honestly answer questions
    about its own identity. Omitting both keeps today's 3-layer assembly.
    """
    final_state = await run_agent_state(
        message,
        top_k,
        emitter,
        history=history,
        mode=mode,
        session_id=session_id,
        system_prompt=system_prompt,
        agent_prompt=agent_prompt,
        enabled_tools=enabled_tools,
        rerank=rerank,
        runtime=runtime,
        simulate_failure=simulate_failure,
        skills_catalog=skills_catalog,
        model=model,
        provider=provider,
        base_url=base_url,
        agent_name=agent_name,
        agent_description=agent_description,
        rerank_threshold=rerank_threshold,
        ragless=ragless,
        hybrid=hybrid,
        verify=verify,
    )
    return final_state["answer"]
