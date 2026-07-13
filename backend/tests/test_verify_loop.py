"""098-verify-reflection-loop: the opt-in verification (reflection) loop.

``verify`` is a request-only input (like the 006 overrides / 017 failure sim) — *not* a
TraceEvent field. Omitting it (or ``False``) reproduces today's run byte-for-byte (AC1):
no ``agent.verify`` stage, no critic call. When on, a critic pass (``verify_node``) judges
the drafted answer and can loop back to generation, bounded by ``MAX_REVISIONS`` (AC3).

Most coverage here is **deterministic + keyless**: the verdict parser, the two routing
functions, and the verify node itself driven by a fake provider (which exercises the real
``LLMProvider.critique`` path, since ``critique`` reuses ``decide``). The full-run structural
guarantees (verify fires / off is silent / runtime-agnostic) are ``@pytest.mark.openai``.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from pydantic import ValidationError

from app.agent.graph import (
    MAX_REVISIONS,
    _after_generate,
    _should_revise,
    verify_node,
)
from app.llm.provider import Decision, LLMProvider, parse_verdict
from app.main import app
from app.schemas import ChatRequest
from app.trace import TraceEmitter

# --- AC1: the request-input contract (keyless) ------------------------------


def test_chat_request_verify_defaults_false():
    # AC1 — omitting the field reproduces today's behavior (no verification).
    assert ChatRequest(message="hi").verify is False


def test_chat_request_accepts_verify_true():
    assert ChatRequest(message="hi", verify=True).verify is True


def test_chat_request_rejects_non_bool_verify():
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", verify="maybe")


# --- AC8: /api/config advertises the default --------------------------------


def test_config_advertises_verify_default():
    # AC8 — the frontend toggle prefills from here; inspectable without a key.
    with TestClient(app) as client:
        resp = client.get("/api/config")
        assert resp.status_code == 200
        assert resp.json()["verify_default"] is False


# --- parse_verdict: the critic-reply parser (keyless) -----------------------


@pytest.mark.parametrize(
    "reply,decision",
    [
        ("PASS", "pass"),
        ("pass — looks good", "pass"),
        ("REVISE: add the source", "revise"),
        ("revise: too vague", "revise"),
        ("  REVISE   the grounding is missing", "revise"),
        ("", "pass"),  # fail-safe: ambiguous ⇒ pass (never loop needlessly)
        ("The answer seems fine to me.", "pass"),
    ],
)
def test_parse_verdict(reply, decision):
    v = parse_verdict(reply)
    assert v.decision == decision
    assert v.reason  # always a non-empty rationale (AC2 shape)


def test_parse_verdict_extracts_reason():
    assert parse_verdict("REVISE: cite the retrieved chunk").reason == "cite the retrieved chunk"


# --- routing functions (keyless) --------------------------------------------


def test_after_generate_routes_by_toggle():
    # AC1 — off ⇒ straight to respond (baseline); on ⇒ through the critic.
    assert _after_generate({"verify_enabled": False}) == "respond"
    assert _after_generate({}) == "respond"
    assert _after_generate({"verify_enabled": True}) == "verify"


def test_should_revise_reads_decision():
    assert _should_revise({"verify_decision": "revise"}) == "generate"
    assert _should_revise({"verify_decision": "pass"}) == "respond"
    assert _should_revise({}) == "respond"


# --- verify_node driven by a fake provider (keyless, exercises real critique) ---


class _FakeCritic(LLMProvider):
    """A provider whose ``decide`` returns a canned reply, so the inherited (real)
    ``critique`` parses it into a verdict — no OpenAI key needed."""

    name = "fake"
    model_name = "fake-critic"

    def __init__(self, reply: str) -> None:
        self._reply = reply

    async def decide(self, *, system, thread, tools, history=None) -> Decision:
        return Decision(
            message=AIMessage(content=self._reply),
            tool_calls=[],
            prompt_preview={},
            usage=None,
        )

    async def stream_answer(self, *, system, thread, history=None):  # pragma: no cover
        yield ""


async def _run_verify(reply: str, *, revisions: int):
    """Drive verify_node once with a fake critic and collect its (update, events)."""
    emitter = TraceEmitter("test", "q")

    async def drain():
        events = []
        while True:
            ev = await emitter.queue.get()
            if ev is None:
                break
            events.append(ev)
        return events

    drainer = asyncio.create_task(drain())
    state = {
        "message": "What is RAG?",
        "answer": "A draft answer.",
        "context": "some grounding",
        "history": [],
        "revisions": revisions,
    }
    config = {
        "configurable": {
            "emitter": emitter,
            "provider": _FakeCritic(reply),
            "registry": None,
        }
    }
    update = await verify_node(state, config)
    await emitter.close()
    return update, await drainer


def _verify_ends(events):
    return [e for e in events if str(e.stage) == "agent.verify" and e.phase == "end"]


async def test_verify_node_emits_stage_with_verdict():
    # AC2 — the node fires an agent.verify END carrying a structured verdict.
    update, events = await _run_verify("REVISE: cite the source", revisions=0)
    ends = _verify_ends(events)
    assert len(ends) == 1
    data = ends[0].data
    assert data["decision"] in {"pass", "revise"}
    assert data["reason"]
    assert data["max_revisions"] == MAX_REVISIONS


async def test_verify_node_revises_within_bound():
    # AC3/AC5 — a revise verdict under the cap loops back (verify_decision=revise),
    # bumps the counter, and folds the critique into the thread as a new message.
    update, _ = await _run_verify("REVISE: too vague", revisions=0)
    assert update["verify_decision"] == "revise"
    assert update["revisions"] == 1
    assert len(update["messages"]) == 1  # the critique message appended to the thread


async def test_verify_node_commits_at_cap_even_on_revise():
    # AC3 — at the bound the node commits (routes to respond) despite a revise verdict,
    # and does NOT append another message. This is the hard stop against an infinite loop.
    update, _ = await _run_verify("REVISE: still not perfect", revisions=MAX_REVISIONS)
    assert update["verify_decision"] == "pass"
    assert "messages" not in update
    assert "revisions" not in update


async def test_verify_node_pass_commits():
    # AC4 — a pass verdict commits with no revision message.
    update, _ = await _run_verify("PASS", revisions=0)
    assert update["verify_decision"] == "pass"
    assert "messages" not in update


# --- Full-run structural guarantees (need a real model) ---------------------


@pytest.mark.openai
def test_verify_off_emits_no_verify_stage():
    # AC1 — omitting `verify` runs today's pipeline; NO agent.verify event fires.
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is 2 + 2?", "mode": "batch"})
        assert resp.status_code == 200
        events = resp.json()["events"]
        assert not any(e["stage"] == "agent.verify" for e in events)


@pytest.mark.openai
def test_verify_on_emits_verify_stage():
    # AC2 — with verify on, at least one agent.verify END fires with a real verdict,
    # and the committed answer is non-empty (AC4).
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={"message": "What is a token in an LLM?", "mode": "batch", "verify": True},
        )
        assert resp.status_code == 200
        events = resp.json()["events"]
        ends = [e for e in events if e["stage"] == "agent.verify" and e["phase"] == "end"]
        assert ends, "expected at least one agent.verify END event"
        assert ends[0]["data"]["decision"] in {"pass", "revise"}
        assert ends[0]["data"]["reason"]
        assert resp.json()["answer"].strip()


@pytest.mark.openai
def test_verify_runs_under_deepagents_runtime():
    # AC6 — the verify node is runtime-agnostic: it fires under the DeepAgents runtime too.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={
                "message": "Why does chunk size matter in RAG?",
                "mode": "batch",
                "verify": True,
                "runtime": "deepagents",
            },
        )
        assert resp.status_code == 200
        events = resp.json()["events"]
        assert any(e["stage"] == "agent.verify" for e in events)
