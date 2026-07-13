"""System / agent prompts and the composition helper (042-agent-anatomy).

The simulator separates **environment-wide rules** from **the agent's role**
into two distinct prompt layers, each independently overridable per request:

- :data:`GUARDRAILS_PROMPT` — the **system prompt** layer. Platform-level rules
  every agent in the simulator inherits: safety, honesty, format. Edited by
  the platform owner; usually short.
- :data:`AGENT_PROMPT` — the **agent prompt** layer. *This* agent's role and
  instructions (what it is, how it should think, which tools it leans on).
  This is the layer end-users edit when they want to give the agent a new
  identity.

On top of those, :func:`identity_block` renders the **identity layer**:
``"You are {name}. {description}"`` resolved from the bound agent row
(``agents.name`` / ``agents.description``, 043/044). Without it the model has
no way to answer "what is your name?" — only the chat bubble label did.

The composed system message sent to the model is therefore
``[identity + "\\n\\n" +] GUARDRAILS_PROMPT + "\\n\\n" + AGENT_PROMPT
[+ "\\n\\n" + skills_block]`` (identity is prepended only when ``name`` is
non-blank, so a run without an agent row reproduces today's three-layer
assembly byte-for-byte; the skills block is appended by 027-skills only
when applicable). The guardrails / role layers accept request-level
overrides (006-style) — blank/whitespace falls back to the default for
that layer.
"""

from __future__ import annotations

GUARDRAILS_PROMPT = """Platform guardrails (apply to every agent):
- Be helpful, accurate and concise.
- When you used retrieved context or a tool result, rely on it and say so; \
do not invent facts.
- If you do not have enough information, say so plainly rather than guess.
- Refuse to help with illegal, harmful, deceptive or unsafe requests.
- Prefer plain prose; use bullet lists only when the user asks for them or \
the content is genuinely a list.
- You act in a single turn: there is no "later". Never tell the user to wait, \
nor say you will prepare, build or send something afterwards — produce the \
complete deliverable in this same response. If a request is large, deliver the \
best complete version you can now (you may note any remaining gaps at the end).
"""


AGENT_PROMPT = """You are the assistant inside an "AI Agent Simulator", a teaching tool \
that visualizes how an agentic application works.

You have tools available and you decide, on your own, whether and when to call them. \
Choose the tool that actually fits the question — do not force every question through \
the same tool:
- `search_knowledge_base` searches a knowledge base that covers **AI engineering only** \
(how LLMs, tokens, embeddings, RAG, prompting, agents and MCP work). For questions about \
those concepts — how something works, a comparison, a definition that would be documented \
there — call `search_knowledge_base` first and ground your answer in what it returns; do \
not answer such questions from memory alone.
- `web_search` searches the live internet. Use it for anything the AI-engineering \
knowledge base would NOT cover: current events, news, sports, real-world facts, people, \
companies, products, prices, or any recent or specific information. When a question is \
about the real world or up-to-date facts, prefer `web_search` over `search_knowledge_base` \
— the knowledge base will not have it.
- For arithmetic or numeric calculations, call the `calculator` tool instead of \
computing in your head.
- For the current date or time, call `current_time`.
- `kb_lookup` only returns a single canned one-line glossary string for a few basic \
terms; prefer `search_knowledge_base` for anything more than a trivial one-word \
definition.

If a tool comes back empty or irrelevant, do not give up immediately — first consider \
whether a different tool fits better (for example, fall back to `web_search` for a \
real-world fact the knowledge base did not have) before telling the user you could not \
find it.
"""


# 057-deepagents-runtime: the extra guidance appended to the role layer **only on the
# Intermediate rung**, where the model is offered the DeepAgents tools. It tells the agent
# how to use them — and, crucially, to skip them for trivial requests so a greeting does
# not trigger planning or research. Off the Intermediate rung this block is never added,
# so Simple stays byte-for-byte.
DEEPAGENTS_PROMPT = """You are running as a DeepAgent — you handle tasks deliberately, \
not in one reflex step. You MUST follow this workflow for every user request that is an \
actual task or question (the ONLY exception is a bare greeting or social pleasantry with \
no task — then just reply):

1. PLAN FIRST. Before doing anything else, call `write_todos` to lay out an ordered plan \
(2–5 concrete steps). Do this even for seemingly simple questions — it is how you work.
2. WORK THE PLAN. Execute the steps. As you start a step call `write_todos` again to mark \
it `in_progress`, and after finishing it mark it `completed`, so your plan always reflects \
reality. Keep exactly one item `in_progress` at a time.
3. USE YOUR SCRATCHPAD. Use `write_file` / `read_file` / `edit_file` / `ls` to store \
intermediate findings (e.g. write research notes to `research.md`) so your work survives \
across steps instead of being lost to the context window.
4. DELEGATE RESEARCH. For self-contained investigation, call `task` to hand it to a \
sub-agent that runs with its own isolated context and returns only its result — keeping \
your own context clean.
5. FINISH. When every todo is `completed`, synthesise the final answer for the user from \
your plan, files and sub-agent results.

Always start with `write_todos`. A response that skips planning is a failure of your role.
"""


# 057-deepagents-runtime: the **final-answer** addendum, used in place of DEEPAGENTS_PROMPT
# when the loop is over and the model is writing the user-facing reply. The planning mandate
# is what a weaker model echoes ("Plan:", "PLAN FIRST", "Work the plan", the todo list) into
# the answer — so at answer time we drop it and instead instruct an answer-only synthesis.
# The plan, files and tool results already live in the message thread, so the model has
# everything it needs to answer without seeing the scaffolding again.
DEEPAGENTS_FINAL_PROMPT = """You have finished working through your plan. Write the final \
answer for the user now.

Reply with ONLY the answer itself — direct, clear prose (or the requested format) that \
addresses the request. Do NOT restate your plan, your todo list, your scratchpad files, \
or the step-by-step workflow, and never use scaffolding phrases like "Plan:", "PLAN \
FIRST", "Write todos", "Work the plan" or "Execute the step". Those are your internal \
process; the user must see only the result."""


def deepagents_state_block(plan: list[dict[str, str]], vfs: dict[str, str]) -> str:
    """Render the live DeepAgents working state for re-injection into the prompt.

    057-deepagents-runtime: a DeepAgent must *see* its own plan and files on every
    reasoning round (the library's ``TodoListMiddleware`` injects exactly this) — that
    feedback loop is what makes planning stick instead of being a write-only tool. Empty
    when there is nothing yet (so the first round just reads the mandate above). The graph
    appends this to the system message on the Intermediate rung only.
    """
    if not plan and not vfs:
        return ""
    lines = ["## Your DeepAgent working state (keep it current)"]
    if plan:
        lines.append("Todos:")
        for t in plan:
            lines.append(f"- [{t.get('status', 'pending')}] {t.get('content', '')}")
    else:
        lines.append("Todos: (none yet — call write_todos to plan before acting)")
    if vfs:
        lines.append("Files in your scratchpad:")
        for path in sorted(vfs):
            lines.append(f"- {path} ({len(vfs[path])} chars)")
    return "\n".join(lines)


def deepagents_block(runtime: str, *, final: bool = False) -> str:
    """The DeepAgents role addendum — non-empty only under the ``deepagents`` runtime.

    057-deepagents-runtime: kept as its own helper so ``graph._system_parts`` can append
    it to the role layer (and 036's budget attribute it to the ``system`` slice) without
    forking the assembly. 061-scenario-builder swapped the gate from the Intermediate
    rung to the explicit ``runtime`` input. Empty under other runtimes (ReAct unchanged).

    ``final=True`` returns the answer-only :data:`DEEPAGENTS_FINAL_PROMPT` instead of the
    looping :data:`DEEPAGENTS_PROMPT`, so the user-facing answer is not polluted with the
    planning mandate the model would otherwise echo (the plan/files/results stay in the
    message thread). Off the DeepAgents runtime both variants are empty.
    """
    if runtime != "deepagents":
        return ""
    return DEEPAGENTS_FINAL_PROMPT if final else DEEPAGENTS_PROMPT


def identity_block(name: str | None, description: str | None) -> str:
    """Render the agent's self-identity as a leading prompt line.

    Returns ``""`` when ``name`` is blank/None — the prior 042-anatomy
    composition (``guardrails + role [+ skills]``) is then preserved
    byte-for-byte, so callers that never resolve an agent row keep today's
    behavior. With ``name`` present and ``description`` blank the block is
    just ``"You are {name}."``; with both present it is
    ``"You are {name}. {description}"`` on a single line.

    The text is intentionally English-only (a platform convention shared with
    ``GUARDRAILS_PROMPT`` / ``AGENT_PROMPT``); ``name`` and ``description``
    themselves are free text the user wrote in whatever language and pass
    through unchanged.
    """
    if not name or not name.strip():
        return ""
    name = name.strip()
    if description and description.strip():
        return f"You are {name}. {description.strip()}"
    return f"You are {name}."


def skills_block(catalog: list[dict[str, str]]) -> str:
    """Render the skill catalog as a system-prompt block — **name + description only**.

    027-skills: the agent advertises the catalog cheaply and loads a skill's full
    instructions on demand via the ``load_skill`` tool. Returns ``""`` for an empty
    catalog; the body is never included here (only via the tool).
    """
    if not catalog:
        return ""
    lines = [
        "You also have access to these reusable Skills. When one fits the user's "
        "request, call the `load_skill` tool with its exact name to load its full "
        "instructions, then follow them:"
    ]
    lines += [f"- {s['name']}: {s['description']}" for s in catalog]
    return "\n".join(lines)


def compose_system(
    guardrails: str,
    role: str,
    catalog: list[dict[str, str]],
    *,
    identity: str = "",
) -> str:
    """Compose the assembled system message.

    Returns ``[identity + "\\n\\n" +] guardrails + "\\n\\n" + role`` plus, when
    the catalog yields a non-empty block, ``"\\n\\n" + skills``. ``identity``
    is keyword-only and defaults to ``""`` so existing callers (and the
    042-anatomy 2-layer composition tests) keep working unchanged; a non-empty
    string is prepended at the very top. This is the canonical assembly
    helper; ``graph._effective_system`` calls it after resolving each layer.
    """
    base = f"{guardrails}\n\n{role}"
    block = skills_block(catalog)
    composed = f"{base}\n\n{block}" if block else base
    return f"{identity}\n\n{composed}" if identity else composed


# 098-verify-reflection-loop: the critic (verification) prompt + message builders.
# The verify node runs a genuine model judgement of the drafted answer and re-enters
# generation on a "revise" verdict, bounded by the graph's MAX_REVISIONS. The critic
# is deliberately strict-but-fair and MUST answer in a parseable one-line verdict so
# `provider.parse_verdict` can route the loop.
CRITIC_PROMPT = """You are a strict but fair reviewer of another assistant's draft answer. \
Judge ONLY whether the draft is good enough to send to the user, considering:
- Does it actually answer the question that was asked?
- Is it grounded in the provided context / tool results (not invented), when context exists?
- Is it complete, clear, and free of obvious errors or contradictions?

Do NOT rewrite the answer yourself. Reply with a single line, in EXACTLY one of these forms:
- `PASS` — the draft is good enough to send as-is.
- `REVISE: <one short sentence saying what must change>` — the draft needs another pass.

Be decisive: only ask for a revision when it would materially improve the answer."""


def critic_user_message(question: str, answer: str, grounding: str) -> str:
    """The critic's user turn: the question, the drafted answer, and the grounding it used.

    ``grounding`` is the retrieved-context readout (state["context"]); it may be empty
    when the turn used no retrieval — the critic then judges on question + answer alone.
    """
    parts = [
        "Review this draft answer.",
        f"\n## Question\n{question}",
    ]
    if grounding and grounding.strip():
        parts.append(f"\n## Context the assistant had\n{grounding.strip()}")
    parts.append(f"\n## Draft answer\n{answer}")
    parts.append("\nReply with `PASS` or `REVISE: <reason>`.")
    return "\n".join(parts)


def revision_instruction(reason: str) -> str:
    """The message folded back into the thread on a `revise` verdict.

    Appended as a user turn so the next `generate` round honestly sees the critique and
    revises its previous answer in response to it (spec 098 AC5).
    """
    reason = (reason or "").strip() or "Improve the answer's accuracy, grounding and completeness."
    return (
        "A reviewer checked your previous answer and asked for a revision:\n"
        f"> {reason}\n\n"
        "Revise your answer to address this feedback. Reply with only the improved "
        "answer, grounded in the context and tool results already in this conversation."
    )
