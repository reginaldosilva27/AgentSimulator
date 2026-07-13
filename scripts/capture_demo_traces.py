#!/usr/bin/env python3
"""058-online-demo-mode — capture REAL traces for the backend-less showcase build.

Runs the four curated sample questions through the live backend (batch mode) for
each executing scenario (simple, intermediate, ragless, deepagents) and each language
(en, pt), saving the verbatim `TraceSummary` JSON into `frontend/src/demo/fixtures/`. Also
snapshots `/api/config`. These captures are what the GitHub Pages demo replays — they
are real runs of this pipeline (constitution §3), never hand-authored.

061-scenario-builder / 066-retrieval-strategy-radio removed the coarse `scenario`
field from `ChatRequest`; the rung behaviours are now explicit per-feature inputs.
So each demo "scenario" maps to the concrete request flags that reproduce it:
`intermediate` → `rerank: true` (cross-encoder reranker), `ragless` → `ragless: true`
(reasoning-based PageIndex retrieval), `hybrid` → `hybrid: true` (BM25 + vector RRF
fusion, 070), `hybrid-rerank` → `{hybrid, rerank}` (the compose path).

Usage:
    # 1. start the backend with a real OPENAI_API_KEY (and a built Chroma index):
    cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8011
    # 2. in another shell — all scenarios, or a subset:
    python scripts/capture_demo_traces.py --base http://localhost:8011
    python scripts/capture_demo_traces.py --base http://localhost:8011 --scenarios hybrid,hybrid-rerank

Re-run whenever the event protocol (§1) changes.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "demo" / "fixtures"

QUESTIONS = [
    ("rag", {"en": "What is RAG and how does retrieval work?", "pt": "O que é RAG e como funciona a recuperação?"}),
    ("math", {"en": "What is 12 * (3 + 1)?", "pt": "Quanto é 12 * (3 + 1)?"}),
    ("mcp", {"en": "How do MCP tools work?", "pt": "Como funcionam as ferramentas MCP?"}),
    ("time", {"en": "What time is it right now?", "pt": "Que horas são agora?"}),
]
# Each demo scenario → the request flags that make the live backend reproduce it.
SCENARIOS: dict[str, dict] = {
    "simple": {},
    "intermediate": {"rerank": True},
    "ragless": {"ragless": True},
    # The real DeepAgents runtime (planner + virtual file system + multi-search RAG), so
    # the demo replays the plan/step-trail, the local DeepAgents tool calls, and the
    # per-search "Sources used" grouping just like a live run. DeepAgents COMPOSES with the
    # reranker and the RAGLESS strategy (gated purely on runtime), so each combination the
    # Build popover can produce keys its own captured trace — the demo matches live exactly.
    "deepagents": {"runtime": "deepagents"},
    "deepagents-rerank": {"runtime": "deepagents", "rerank": True},
    "deepagents-ragless": {"runtime": "deepagents", "ragless": True},
    # 070-hybrid-search × DeepAgents — the Build popover lets hybrid (vector-only) compose
    # with the DeepAgents runtime, so these combos need their own captured traces or the
    # demo would replay a non-hybrid deepagents trace with Hybrid checked (card shows inactive).
    "deepagents-hybrid": {"runtime": "deepagents", "hybrid": True},
    "deepagents-hybrid-rerank": {"runtime": "deepagents", "hybrid": True, "rerank": True},
    # 070-hybrid-search — the BM25 + vector RRF fusion sub-stage, and its compose-with-
    # rerank path (the two combos the Build popover produces with hybrid on, ReAct runtime).
    "hybrid": {"hybrid": True},
    "hybrid-rerank": {"hybrid": True, "rerank": True},
    # 098-verify-reflection-loop — the opt-in critic/reflection loop (a per-run toggle,
    # not a Build component). Captured on the base (simple) selection so the demo can
    # replay the `agent.verify` pass + the drill-in Verification panel when the toggle is
    # on. `verify` composes with every scenario; only the base variant is captured here.
    "verify": {"verify": True},
}


def _get(base: str, path: str) -> dict:
    with urllib.request.urlopen(base + path, timeout=30) as r:
        return json.load(r)


def _post(base: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8011")
    # Comma-separated subset of SCENARIOS to (re)capture; default = all. Lets a single
    # new feature (e.g. 070 hybrid) be captured without re-running every existing fixture.
    ap.add_argument("--scenarios", default="")
    # Comma-separated subset of QUESTION ids to (re)capture; default = all.
    ap.add_argument("--questions", default="")
    # Skip re-snapshotting /api/config when only topping up a subset of scenarios.
    ap.add_argument("--no-config", action="store_true")
    args = ap.parse_args()

    wanted = [s.strip() for s in args.scenarios.split(",") if s.strip()] or list(SCENARIOS)
    unknown = [s for s in wanted if s not in SCENARIOS]
    if unknown:
        raise SystemExit(f"unknown scenarios: {unknown}; known: {list(SCENARIOS)}")

    qids = {q.strip() for q in args.questions.split(",") if q.strip()}
    questions = [q for q in QUESTIONS if not qids or q[0] in qids]

    OUT.mkdir(parents=True, exist_ok=True)
    if not args.no_config:
        json.dump(_get(args.base, "/api/config"), (OUT / "_config.json").open("w"), ensure_ascii=False)
        print("saved _config.json")
        # 072-chunking-strategies — snapshot the read-only chunk-preview (all strategies over
        # a sample corpus doc) so the demo's Chunking playground replays a REAL response with
        # no backend. Captured alongside /api/config (both are read-only boot snapshots).
        preview = _post(args.base, "/api/rag/chunk-preview", {"strategy": "all"})
        json.dump(preview, (OUT / "_chunk_preview.json").open("w"), ensure_ascii=False)
        strategies = ", ".join(p["strategy"] for p in preview.get("previews", []))
        print(f"saved _chunk_preview.json ({strategies})")

    for qid, langs in questions:
        for lang, text in langs.items():
            for scenario in wanted:
                flags = SCENARIOS[scenario]
                body = {"message": text, "mode": "batch", **flags}
                t0 = time.time()
                data = _post(args.base, "/api/chat", body)
                name = f"{qid}.{scenario}.{lang}.json"
                json.dump(data, (OUT / name).open("w"), ensure_ascii=False)
                stages = {e["stage"] for e in data["events"]}
                print(f"{name:30} events={len(data['events']):3} "
                      f"hybrid={'rag.hybrid' in stages} "
                      f"rerank={'rag.rerank' in stages} "
                      f"ragless={'pageindex.select' in stages} {round(time.time() - t0, 1)}s")


if __name__ == "__main__":
    main()
