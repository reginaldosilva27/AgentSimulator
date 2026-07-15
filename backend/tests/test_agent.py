"""End-to-end agent runs against OpenAI emit the expected stage sequence.

Assertions are structural (stages fired, tool used, answer non-empty, history
carried) so they tolerate model variability. The whole module needs a key.
"""

import asyncio

import pytest

from app.agent import run_agent
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai


async def _run(message: str, top_k: int = 3, history=None, system_prompt=None, enabled_tools=None):
    emitter = TraceEmitter("test", message)

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    answer = await run_agent(
        message,
        top_k,
        emitter,
        history=history,
        system_prompt=system_prompt,
        enabled_tools=enabled_tools,
    )
    await emitter.close()
    events = await drainer
    return answer, events


# A corpus-detail question (chunk size / top-k) the canned kb_lookup glossary
# cannot answer, so the agent must call search_knowledge_base — exercising the
# full pipeline including the conditional rag.* stages (026-agent-tool-autonomy).
_RETRIEVAL_QUESTION = "Why does chunk size matter in a RAG pipeline, and what is top-k?"


async def test_pipeline_emits_all_core_stages():
    answer, events = await _run(_RETRIEVAL_QUESTION)
    stages = {e.stage for e in events}
    for required in [
        "agent.route",
        "mcp.discover",
        "rag.embed",
        "rag.search",
        "rag.retrieve",
        "agent.think",
        "llm.prompt",
        "llm.generate",
        "respond",
    ]:
        assert required in stages, f"missing stage {required}"
    assert answer.strip()


async def test_sequence_numbers_are_monotonic():
    _answer, events = await _run("What is MCP?")
    seqs = [e.seq for e in events]
    assert seqs == sorted(seqs)
    assert len(seqs) == len(set(seqs))


async def test_math_question_invokes_calculator_tool():
    answer, events = await _run("What is 2 + 2?")
    calls = [e for e in events if e.stage == "mcp.call" and e.phase == "end"]
    assert calls, "expected a tool call"
    assert calls[0].data["tool"] == "calculator"
    assert "4" in calls[0].data["result"]
    assert "4" in answer


async def test_tool_call_carries_jsonrpc_frames():
    # AC2 (007) — a tool-calling chat yields non-empty request AND response
    # JSON-RPC frames on the mcp.call event (whatever transport is active).
    _answer, events = await _run("What is 2 + 2?")
    call = next(e for e in events if e.stage == "mcp.call" and e.phase == "end")
    jr = call.data["jsonrpc"]
    assert jr["request"]["method"] == "tools/call"
    assert jr["request"]["params"]  # non-empty request frame
    assert jr["response"]["result"]  # non-empty response frame
    assert isinstance(jr["reconstructed"], bool)


async def test_llm_generate_streams_tokens():
    _answer, events = await _run("What is an embedding?")
    progress = [e for e in events if e.stage == "llm.generate" and e.phase == "progress"]
    assert len(progress) > 1
    assert all("token" in e.data for e in progress)


async def test_llm_calls_carry_token_usage_and_cost():
    # 011-token-cost (AC2) — each real model call (every reasoning round's decide
    # + the final generation) records real tokens and a priced cost in `metrics`.
    _answer, events = await _run("What is 2 + 2?")
    think_ends = [e for e in events if e.stage == "agent.think" and e.phase == "end"]
    gen_end = next(e for e in events if e.stage == "llm.generate" and e.phase == "end")
    assert think_ends, "expected at least one reasoning round"
    for ev in [*think_ends, gen_end]:
        assert ev.metrics.get("prompt_tokens", 0) > 0, f"no prompt_tokens on {ev.stage}"
        assert ev.metrics.get("total_tokens", 0) > 0, f"no total_tokens on {ev.stage}"
        assert ev.metrics.get("cost_usd", -1) >= 0, f"no cost_usd on {ev.stage}"


# A long prior turn so the *stable prefix* (system prompt + tool schemas + this
# rendered history) clears OpenAI's ~1024-token cache floor — the measured bare
# prefix is ~900 tokens, just under, so a short cold call legitimately caches
# nothing (see spec 099). Padding history is the honest way to demonstrate the
# win: it's real long-term memory the agent genuinely re-sends every turn.
_CACHE_WARM_HISTORY = [
    {
        "message": "Give me a thorough overview of retrieval-augmented generation.",
        "answer": (
            "Retrieval-augmented generation grounds a language model in an external "
            "knowledge base. " * 40
        ),
    }
]


async def test_prompt_caching_metrics_are_present_and_consistent():
    # 099-prompt-caching (AC6) — every LLM call carries the cache metrics
    # (`cached_tokens`, `cost_saved_usd`), and when the provider actually served the
    # stable prefix from cache the saving is positive and the effective input cost is
    # strictly below the all-fresh price. Honest about the ~1024-token floor / cache
    # TTL: a run with no hit xfails (never fakes one). We warm the cache with one
    # identical run first, then assert on the second, so a hit is likely.
    from app.llm.pricing import cost_usd

    # 1) Warm: same large stable prefix, so OpenAI writes it to its prompt cache.
    await _run("What is top-k in retrieval?", history=_CACHE_WARM_HISTORY)
    # 2) Measure: an identical prefix should now read from cache.
    _answer, events = await _run("What is top-k in retrieval?", history=_CACHE_WARM_HISTORY)
    llm_ends = [
        e for e in events if e.phase == "end" and e.stage in ("agent.think", "llm.generate")
    ]
    assert llm_ends, "expected at least one LLM call"

    # Shape (always holds): both keys present + non-negative, and a saving only ever
    # accompanies real cached tokens — never a fabricated discount.
    for ev in llm_ends:
        cached = ev.metrics.get("cached_tokens", -1)
        saved = ev.metrics.get("cost_saved_usd", -1)
        assert cached >= 0, f"missing cached_tokens on {ev.stage}"
        assert saved >= 0, f"missing cost_saved_usd on {ev.stage}"
        if saved > 0:
            assert cached > 0, f"saving without cached tokens on {ev.stage}"

    # The win: a cache hit ⇒ effective cost strictly below the all-fresh price.
    hits = [e for e in llm_ends if e.metrics.get("cached_tokens", 0) > 0]
    if not hits:
        pytest.xfail("no prompt-cache hit this run (below threshold or cold cache)")
    for ev in hits:
        model = "gpt-4.1-mini"  # the server default (llm/models.py); labels the price
        prompt_tokens = int(ev.metrics["prompt_tokens"])
        completion_tokens = int(ev.metrics["completion_tokens"])
        cached = int(ev.metrics["cached_tokens"])
        discounted = cost_usd(model, prompt_tokens, completion_tokens, cached_tokens=cached)
        all_fresh = cost_usd(model, prompt_tokens, completion_tokens, cached_tokens=0)
        assert discounted < all_fresh, "cache hit did not lower the effective cost"
        assert ev.metrics["cost_saved_usd"] > 0


async def test_llm_prompt_carries_context_window_and_budget():
    # 036-context-window-budget (AC4) — every reasoning round's `llm.prompt` END
    # carries the real model window (int) + the per-category token split (the six
    # used categories), computed server-side with tiktoken. Additive `data`; no
    # new Stage.
    from app.llm.context import BUDGET_CATEGORIES

    _answer, events = await _run(_RETRIEVAL_QUESTION)
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    window = prompt.data["context_window"]
    budget = prompt.data["context_budget"]
    assert isinstance(window, int) and window > 0
    assert set(budget) == set(BUDGET_CATEGORIES)
    assert all(isinstance(v, int) and v >= 0 for v in budget.values())
    # This run grounds an answer, so the system prompt + advertised tool schemas
    # are non-empty real slices of the window.
    assert budget["system"] > 0
    assert budget["tool_defs"] > 0


async def test_reasoning_uses_the_llm_as_an_observable_span():
    # 010-llm-as-brain (AC1) — the agent reasons by *calling the model*: the decide
    # call is an `llm.prompt` START/END span (not an end-only marker), so the LLM is
    # observably active while deciding, and that span starts before any tool call.
    _answer, events = await _run("What is 2 + 2?")
    prompt_phases = {e.phase for e in events if e.stage == "llm.prompt"}
    assert "start" in prompt_phases and "end" in prompt_phases
    first_prompt_start = next(
        i for i, e in enumerate(events) if e.stage == "llm.prompt" and e.phase == "start"
    )
    first_mcp_call = next((i for i, e in enumerate(events) if e.stage == "mcp.call"), None)
    assert first_mcp_call is None or first_prompt_start < first_mcp_call


async def test_history_is_carried_into_the_prompt():
    history = [{"message": "What is RAG?", "answer": "RAG grounds an LLM in retrieved docs."}]
    _answer, events = await _run("And what about embeddings?", history=history)
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert prompt.data["history"] == history
    route = next(e for e in events if e.stage == "agent.route" and e.phase == "end")
    assert route.data["memory_turns"] == 1


# --- Experiment overrides (006-interactive-experiments) ---------------------


async def test_system_prompt_override_reaches_the_prompt():
    # AC1 — the override shows up in the assembled prompt's `system` block.
    marker = "UNIQUE-PERSONA-MARKER-XYZ"
    override = f"You are {marker}. Answer in one short sentence."
    answer, events = await _run("Say hello.", system_prompt=override)
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert marker in prompt.data["system"]
    assert answer.strip()


async def test_real_world_question_routes_to_web_search():
    """A current-events / real-world question (outside the AI-engineering KB)
    must elect ``web_search``, not ground itself on ``search_knowledge_base``.

    Reproduces the observed failure where "quem fez os gols?" was forced through
    the AI-engineering knowledge base and abstained. Structural + tolerant: we
    only require ``web_search`` to appear among the tools the agent called (it may
    also try others). The decision is OpenAI's; the Tavily result is irrelevant
    here (it degrades to an honest error without a key), so this needs only an
    OpenAI key.
    """
    _answer, events = await _run("Quem ganhou o último Grande Prêmio de Fórmula 1?")
    calls = [e for e in events if e.stage == "mcp.call" and e.phase == "end"]
    tools_called = {c.data["tool"] for c in calls}
    assert "web_search" in tools_called, f"expected web_search, got {tools_called}"


async def test_complex_request_delivers_in_turn_instead_of_promising():
    """Regression: a "build me a complete X" request must come back as the
    deliverable, not a bare promise to do it later.

    Reproduces the observed failure where the agent answered "Vou preparar isso
    para você. Aguarde um momento." and the turn ended with nothing built. The
    assertion is structural + tolerant: the answer is substantive and does not
    end on a deferral phrase (en/pt). The guardrail makes single-turn delivery
    the contract; this guards the behavior end-to-end.
    """
    answer, _events = await _run(
        "Monte um relatório completo, com seções, sobre como funciona um pipeline RAG."
    )
    body = answer.strip()
    assert body, "expected a non-empty answer"
    # A substantive deliverable, not a one-line promise.
    assert len(body) > 200, f"answer too short to be the deliverable: {body!r}"
    # It must not merely defer. These are the giveaway phrases from the failure.
    tail = body[-120:].lower()
    for defer in ("aguarde", "wait a moment", "vou preparar", "i will prepare", "em breve"):
        assert defer not in tail, f"answer defers instead of delivering: {body!r}"


async def test_blank_system_prompt_falls_back_to_default():
    # AC1 — a blank/whitespace override is ignored; the default prompt is used.
    _answer, events = await _run("What is RAG?", system_prompt="   ")
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert "AI Agent Simulator" in prompt.data["system"]


async def test_disabling_calculator_re_plans_without_it():
    # AC2 — calculator off + a math question ⇒ discover lists only enabled tools
    # and the agent never calls the calculator (it answers some other way).
    enabled = ["current_time", "kb_lookup"]
    answer, events = await _run("What is 2 + 2?", enabled_tools=enabled)
    discover = next(e for e in events if e.stage == "mcp.discover" and e.phase == "end")
    discovered = {t["name"] for t in discover.data["tools"]}
    assert discovered == set(enabled)
    assert "calculator" not in discovered
    calls = [e for e in events if e.stage == "mcp.call" and e.phase == "end"]
    assert all(c.data["tool"] != "calculator" for c in calls)
    assert answer.strip()


async def test_all_tools_disabled_makes_no_tool_calls():
    # AC3 (006) + AC10 (026) — enabled_tools=[] ⇒ no discovery, no mcp.call, and
    # no retrieval either (the retrieval tool is gated like any tool); answer still
    # returned (an honest LLM-only run with no grounding).
    answer, events = await _run("What is 2 + 2?", enabled_tools=[])
    discover = next(e for e in events if e.stage == "mcp.discover" and e.phase == "end")
    assert discover.data["tools"] == []
    assert not [e for e in events if e.stage == "mcp.call"]
    assert not [e for e in events if e.stage in ("rag.embed", "rag.search", "rag.retrieve")]
    assert answer.strip()


async def test_no_overrides_discovers_all_tools_with_default_prompt():
    # AC5 (006) + AC1 (026) — no overrides ⇒ the agent sees the MCP tools *plus*
    # the knowledge-base retrieval tool, with the default prompt.
    _answer, events = await _run("What is MCP?")
    discover = next(e for e in events if e.stage == "mcp.discover" and e.phase == "end")
    discovered = {t["name"] for t in discover.data["tools"]}
    # 027-skills adds load_skill to the advertised set (the agent can load a skill).
    # 052-web-search-tool adds web_search (real Tavily internet search).
    assert {
        "calculator",
        "current_time",
        "kb_lookup",
        "search_knowledge_base",
        "load_skill",
        "web_search",
    } == discovered
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert "AI Agent Simulator" in prompt.data["system"]


# --- 026-agent-tool-autonomy: retrieval is an agent decision ----------------


async def test_math_question_skips_retrieval():
    # AC2 — a question the model answers without documents fires NO rag.* events:
    # retrieval only runs when the agent *decides* to call search_knowledge_base.
    _answer, events = await _run("What is 2 + 2?")
    rag = [e for e in events if e.stage in ("rag.embed", "rag.search", "rag.retrieve")]
    assert not rag, "math question should not trigger knowledge-base retrieval"


async def test_knowledge_question_retrieves_by_agent_decision():
    # AC3 — a corpus question makes the agent *decide* to call the retrieval tool,
    # and the rag.* events follow that decision (not a forced pre-step): the
    # search_knowledge_base decision is recorded on a think round at or before the
    # first rag.* event.
    answer, events = await _run(_RETRIEVAL_QUESTION)
    decision_idx = next(
        (
            i
            for i, e in enumerate(events)
            if e.stage == "agent.think"
            and e.phase == "end"
            and any(tc["name"] == "search_knowledge_base" for tc in e.data.get("tool_calls", []))
        ),
        None,
    )
    assert decision_idx is not None, "agent should decide to call search_knowledge_base"
    first_rag = next((i for i, e in enumerate(events) if e.stage == "rag.embed"), None)
    assert first_rag is not None, "expected a retrieval to run"
    assert decision_idx < first_rag, "retrieval must follow the agent's decision"
    assert answer.strip()
