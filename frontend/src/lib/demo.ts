// 058-online-demo-mode — the backend-less showcase build.
//
// A BUILD-TIME mode (`VITE_DEMO_MODE`), not a runtime toggle: the normal local
// build never enters any branch here (`isDemo()` is false), so it talks to the
// backend exactly as today — byte-for-byte. When the flag is on, every network
// read the app makes on boot/send is served from bundled REAL captured traces
// (see `demo/fixtures.ts`, constitution §3) plus a tiny per-tab in-memory session
// store. Nothing is persisted and nothing leaves the browser — hundreds of
// concurrent visitors get fully independent sessions because it's just a static
// bundle. The full, key-required live tool stays the GitHub-local route.

import type {
  AgentMeta,
  AppConfig,
  ChatChunk,
  ChatMessage,
  ClearResult,
  CorpusListing,
  DocumentMeta,
  SessionMeta,
  Skill,
} from "./chatApi";
import type { DoneEvent, TraceEvent, TraceSummary } from "../types/events";
import type { ChunkPreviewResult } from "./chatApi";
import { useLang } from "../i18n";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "./experiment";
import { DEMO_CHUNK_PREVIEW, DEMO_CONFIG, DEMO_TRACES } from "../demo/fixtures";

/** GitHub repo the demo banner points visitors at for the full live version. */
export const DEMO_REPO_URL = "https://github.com/reginaldosilva27/AgentSimulator";

/** True only in a `VITE_DEMO_MODE` build. A normal build never branches on this. */
export function isDemo(): boolean {
  const flag = import.meta.env.VITE_DEMO_MODE as string | undefined;
  return flag === "1" || flag === "true";
}

// --- curated sample questions ----------------------------------------------

// The fixed set a demo visitor can send — the same prompts as the empty-state
// examples. Each maps to a stable `id` that keys the captured-trace registry.
export interface DemoQuestion {
  id: string;
  label: { en: string; pt: string };
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { id: "rag", label: { en: "What is RAG and how does retrieval work?", pt: "O que é RAG e como funciona a recuperação?" } },
  { id: "math", label: { en: "What is 12 * (3 + 1)?", pt: "Quanto é 12 * (3 + 1)?" } },
  { id: "mcp", label: { en: "How do MCP tools work?", pt: "Como funcionam as ferramentas MCP?" } },
  { id: "time", label: { en: "What time is it right now?", pt: "Que horas são agora?" } },
];

/** Map a sent message back to a curated question id (matches either language). */
export function qidForMessage(message: string): string | null {
  const norm = message.trim().toLowerCase();
  for (const q of DEMO_QUESTIONS) {
    if (q.label.en.toLowerCase() === norm || q.label.pt.toLowerCase() === norm) return q.id;
  }
  return null;
}

/**
 * Resolve the captured trace for a (question, scenario, language) triple, with
 * graceful fallback so the demo never dead-ends (AC6): try the exact match, then
 * the same question in `en`, then in `simple`, then any capture for that question,
 * then the first `rag` capture as a last resort.
 */
export function selectDemoTrace(
  qid: string | null,
  scenario: string,
  lang: string,
): TraceSummary {
  const id = qid ?? "rag";
  const pick = (s: string, l: string) =>
    DEMO_TRACES.find((t) => t.qid === id && t.scenario === s && t.lang === l)?.fixture;
  const fixture =
    pick(scenario, lang) ??
    pick(scenario, "en") ??
    pick("simple", lang) ??
    DEMO_TRACES.find((t) => t.qid === id)?.fixture ??
    DEMO_TRACES[0].fixture;
  return fixture;
}

// --- in-memory per-tab store -----------------------------------------------

// One default read-only agent, derived from the captured `/api/config` defaults
// so the Agent station / dialog show coherent values with no backend.
const demoAgent: AgentMeta = {
  id: "demo-agent",
  name: "Agent Simulator",
  description: "Demo agent — replays real captured runs.",
  system_prompt: DEMO_CONFIG.default_system_prompt,
  agent_prompt: DEMO_CONFIG.default_agent_prompt,
  model: DEMO_CONFIG.default_model,
  provider: "openai",
  enabled_tools: DEMO_CONFIG.tools.map((t) => t.name),
  is_default: true,
  created_at: 0,
  updated_at: 0,
};

interface DemoStore {
  sessions: SessionMeta[];
  messages: Map<string, ChatMessage[]>;
  traces: Map<string, TraceSummary>;
  counter: number;
}

const store: DemoStore = { sessions: [], messages: new Map(), traces: new Map(), counter: 0 };

function freshId(prefix: string): string {
  store.counter += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2);
  return `${prefix}-${store.counter}-${rand}`.slice(0, 40);
}

const now = () => Date.now() / 1000;

/** The chunks the agent retrieved this turn, reconstructed from the captured
 *  trace so a demo message carries its "Sources used" just like a live one.
 *  Mirrors the backend's `_retrieved_chunks`: EVERY chunk from EVERY `rag.retrieve`
 *  (the agent may search the KB more than once), in order, each tagged with the
 *  search's `query` + 1-based `search` index so the chat groups by search — no
 *  dedup. Falls back to the RAGLESS `pageindex.select` END when there was no
 *  vector retrieval. Kept byte-for-byte aligned with `main._retrieved_chunks`. */
function retrievedChunks(events: TraceEvent[]): ChatChunk[] {
  const out: ChatChunk[] = [];
  let search = 0;
  for (const ev of events) {
    if (ev.stage === "rag.retrieve" && ev.phase === "end") {
      search += 1;
      const query = ev.data.query as string | undefined;
      const chunks = (ev.data.chunks as ChatChunk[] | undefined) ?? [];
      for (const c of chunks) out.push({ ...c, query, search });
    }
  }
  if (out.length) return out;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.stage === "pageindex.select" && ev.phase === "end") {
      return (ev.data.chunks as ChatChunk[] | undefined) ?? [];
    }
  }
  return [];
}

/** Build (and record) a demo turn: clone the captured trace under a fresh id so
 *  repeated sends never collide, append the message to the in-memory thread, and
 *  index the cloned trace so `fetchTrace(message.id)` can revisit it. */
function buildTurn(sessionId: string, message: string): TraceSummary {
  const scenario = readScenario(verifyOnFor(sessionId));
  const lang = useLang.getState().lang;
  const base = selectDemoTrace(qidForMessage(message), scenario, lang);
  const id = freshId("demo");
  const events: TraceEvent[] = base.events.map((e) => ({ ...e, trace_id: id }));
  const trace: TraceSummary = { trace_id: id, message, answer: base.answer, events };
  store.traces.set(id, trace);

  const msg: ChatMessage = {
    id,
    message,
    answer: base.answer,
    chunks: retrievedChunks(events),
    skills: [],
    documents: [],
    created_at: now(),
  };
  const list = store.messages.get(sessionId) ?? [];
  list.push(msg);
  store.messages.set(sessionId, list);

  const session = store.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.message_count = list.length;
    session.updated_at = now();
    if (!session.title) session.title = message.length > 60 ? `${message.slice(0, 57)}…` : message;
  }
  return trace;
}

// The captured demo fixtures are keyed by maturity rung. 061-scenario-builder made
// maturity a DERIVED label, so we read the global component selection (localStorage)
// and classify it — keeping the demo's (qid × rung × lang) lookup working. Read lazily
// from localStorage to avoid a hard import cycle at module load.
// 098-verify-reflection-loop — the per-run verify toggle (useExperiment, in-memory,
// not part of the Build selection). Read it for the active conversation so the demo can
// replay the captured `verify` trace when the loop is on.
function verifyOnFor(sessionId: string | null): boolean {
  const e = useExperiment.getState();
  return (e.byConv[sessionId ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT).verify;
}

function readScenario(verify = false): string {
  if (typeof localStorage === "undefined") return verify ? "verify" : "simple";
  try {
    const raw = localStorage.getItem("agentsim.selection");
    if (raw) {
      const parsed = JSON.parse(raw);
      const enabled: string[] = parsed.enabled ?? [];
      const runtime: string = parsed.runtime ?? "react";
      // 066-retrieval-strategy-radio — RAGLESS moved from `enabled` to the strategy radio.
      const retrieval: string = parsed.retrieval ?? (enabled.includes("ragless") ? "ragless" : "vector");
      // RAGLESS is its own captured pipeline (pageindex.*, no vector path) and is
      // mutually exclusive with the vector-only rerank, so it keys its own fixture
      // — check it before the rerank-driven "intermediate" bucket.
      const advanced = ["gateway", "guardrails", "cache", "eval", "observability"];
      if (runtime === "multiagent" || enabled.some((c) => advanced.includes(c))) return "advanced";
      // The reranker (a real intermediate upgrade) composes with everything;
      // summarization is preview (won't run) so it doesn't change the trace. 070 —
      // hybrid IS real (vector-only) and keys its own captured fixture (below).
      const rerank = enabled.includes("rerank");
      const hybrid = retrieval === "vector" && enabled.includes("hybrid");
      // DeepAgents (`runtime`) composes with the retrieval strategy + reranker exactly
      // like the live backend — each combination keys its OWN captured trace (agent.plan
      // + multi-search; with rerank → rag.rerank; with ragless → PageIndex). This is why
      // the demo matches local for every simple/intermediate selection.
      if (runtime === "deepagents") {
        if (retrieval === "ragless") return "deepagents-ragless";
        // 070-hybrid-search — hybrid (vector-only) composes with the DeepAgents runtime;
        // each combo keys its own captured fixture so Hybrid actually fuses in the demo.
        if (hybrid) return rerank ? "deepagents-hybrid-rerank" : "deepagents-hybrid";
        return rerank ? "deepagents-rerank" : "deepagents";
      }
      if (retrieval === "ragless") return "ragless";
      // 070-hybrid-search — hybrid composes with rerank; each combo keys its own fixture.
      if (hybrid) return rerank ? "hybrid-rerank" : "hybrid";
      if (rerank) return "intermediate";
      // 098-verify-reflection-loop — verify only has a base (simple-selection) capture,
      // so it keys the `verify` fixture only when nothing else upgraded the run.
      if (verify) return "verify";
    }
  } catch {
    // fall through to the default rung
  }
  return verify ? "verify" : "simple";
}

// --- demo network surface (mirrors chatApi / sse / health) ------------------

export function demoHealth() {
  return {
    status: "ok" as const,
    llmProvider: "openai",
    llmModel: DEMO_CONFIG.default_model,
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
    hasKey: true,
  };
}

export const demoGetConfig = (): Promise<AppConfig> => Promise.resolve(DEMO_CONFIG);
/** 072-chunking-strategies — replay the captured chunk-preview (the playground's
 *  strategy comparison) with no backend. The supplied `text` is ignored in demo:
 *  the bundled snapshot is over a fixed sample corpus doc. */
export const demoChunkPreview = (): Promise<ChunkPreviewResult> =>
  Promise.resolve(DEMO_CHUNK_PREVIEW);
export const demoListAgents = (): Promise<AgentMeta[]> => Promise.resolve([demoAgent]);
export const demoListSessions = (): Promise<SessionMeta[]> =>
  Promise.resolve([...store.sessions].sort((a, b) => b.updated_at - a.updated_at));
export const demoListMessages = (id: string): Promise<ChatMessage[]> =>
  Promise.resolve(store.messages.get(id) ?? []);
export const demoListDocuments = (): Promise<DocumentMeta[]> => Promise.resolve([]);
export const demoListSkills = (): Promise<Skill[]> => Promise.resolve([]);
export const demoGetCorpus = (): Promise<CorpusListing> => Promise.resolve({ files: [] });

export const demoCreateSession = (): Promise<SessionMeta> => {
  const session: SessionMeta = {
    id: freshId("sess"),
    title: null,
    agent: demoAgent,
    created_at: now(),
    updated_at: now(),
    message_count: 0,
  };
  store.sessions.push(session);
  return Promise.resolve(session);
};

export const demoSetSessionAgent = (id: string): Promise<SessionMeta> => {
  const s = store.sessions.find((x) => x.id === id);
  return Promise.resolve(
    s ?? { id, title: null, agent: demoAgent, created_at: now(), updated_at: now(), message_count: 0 },
  );
};

export const demoClearData = (): Promise<ClearResult> => {
  store.sessions = [];
  store.messages.clear();
  store.traces.clear();
  return Promise.resolve({
    sessions_deleted: 0,
    messages_deleted: 0,
    documents_deleted: 0,
    skills_deleted: 0,
    vectors_removed: 0,
  });
};

export const demoFetchTrace = (traceId: string): Promise<TraceSummary> => {
  const trace = store.traces.get(traceId);
  if (!trace) return Promise.reject(new Error("trace not found"));
  return Promise.resolve(trace);
};

export interface DemoChatHandlers {
  onTrace: (event: TraceEvent) => void;
  onDone: (event: DoneEvent) => void;
}

/** Stream-mode demo send: emit every captured event (the simulator paces the
 *  reveal exactly like a live run), then `done`. No backend, no key. */
export async function demoStreamChat(
  message: string,
  handlers: DemoChatHandlers,
  signal: AbortSignal | undefined,
  sessionId: string,
): Promise<void> {
  const trace = buildTurn(sessionId, message);
  for (const event of trace.events) {
    if (signal?.aborted) return;
    handlers.onTrace(event);
  }
  handlers.onDone({ trace_id: trace.trace_id, answer: trace.answer, session_id: sessionId });
}

/** Batch-mode demo send: build the turn and hand back the whole captured trace. */
export async function demoBatchChat(message: string, sessionId: string): Promise<TraceSummary> {
  return buildTurn(sessionId, message);
}
