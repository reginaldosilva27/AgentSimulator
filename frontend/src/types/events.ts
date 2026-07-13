// Mirror of backend/app/schemas.py — keep the two in sync.

export type Stage =
  | "frontend"
  // 088-network-layer: the real ingress chain — five appliance containers the
  // request genuinely transits (CoreDNS → Varnish → ModSecurity/CRS → HAProxy →
  // Kong). Each fires once, in this order, between frontend and backend, only when
  // the request's `network` toggle is on AND the chain is present. Each maps to its
  // own station and carries only what the appliance's forwarded headers prove.
  | "dns"
  | "cdn"
  | "waf"
  | "lb"
  | "apigw"
  // 084-network-edge: the production network edge (reverse proxy · TLS · load
  // balancer). A single observation event (like `frontend`) fired between
  // frontend and backend, only when the request's `edge` toggle is on. Maps to
  // the `edge` station; carries only what the forwarded headers prove (EdgeData).
  | "edge"
  | "backend"
  | "db.read"
  | "agent.route"
  // 057-deepagents-runtime: the DeepAgents preamble (Intermediate rung only) — an
  // explicit plan, a delegated researcher sub-agent, and a virtual file system the
  // orchestrator writes to and reads back. All four map to the `agent` station; the
  // Simple rung never emits them. Order: plan → fs.write → delegate → fs.write → fs.read.
  | "agent.plan"
  | "agent.fs.write"
  | "agent.fs.read"
  | "agent.delegate"
  | "agent.think"
  | "rag.embed"
  | "rag.search"
  // 070-hybrid-search: a sparse BM25 lane fused with the dense vector search (RRF),
  // a query-time RAG sub-stage between rag.search and rag.rerank. Maps to the `rag`
  // (Vector DB) station; the Vector | BM25 | → RRF fusion is shown in the RAG drill-in.
  | "rag.hybrid"
  // 054-rag-block-expansion: the Intermediate rung's local reranker, a query-time
  // RAG sub-stage between rag.search and rag.retrieve. Maps to the `rag` (Vector
  // DB) station and is detailed in the RAG drill-in.
  | "rag.rerank"
  | "rag.retrieve"
  // 056-ragless-pageindex: the RAGLESS / PageIndex path — a reasoning-based
  // retrieval that runs alongside Vector RAG when the `ragless` toggle is on
  // (Intermediate rung only). Build a document tree → the LLM navigates it →
  // select sections (the grounding). Maps to the `pageindex` station; never
  // emitted on Simple or when ragless is off.
  | "pageindex.tree"
  | "pageindex.navigate"
  | "pageindex.select"
  // 080-ingestion-pipeline-merge: the offline indexer write-path, five stages on the
  // `ingestion` station (storage.upload is its first phase). tokenize + metadata are
  // their own phases now: chunk → tokenize → embed → metadata → store.
  | "rag.ingest.chunk"
  | "rag.ingest.tokenize"
  | "rag.ingest.embed"
  | "rag.ingest.metadata"
  | "rag.ingest.store"
  | "storage.upload"
  | "mcp.discover"
  | "mcp.call"
  | "llm.prompt"
  | "llm.generate"
  // Verify / reflection loop (098-verify-reflection-loop): a critic judgement of the
  // drafted answer (pass / revise + reason). Fires once per generate round, only when
  // the request's `verify` toggle is on. Maps to the `agent` station. On the END event
  // `data` carries { decision: "pass" | "revise", reason, revision, max_revisions }.
  | "agent.verify"
  | "respond"
  | "db.write";

export type Phase = "start" | "progress" | "end";

export interface TraceEvent {
  trace_id: string;
  seq: number;
  ts: number;
  stage: Stage;
  phase: Phase;
  label: string;
  data: Record<string, unknown>;
  metrics: Record<string, number>;
}

export interface DoneEvent {
  trace_id: string;
  answer: string;
  session_id: string;
}

// 007-numeric-transparency — optional enrichments on existing event `data`
// payloads (no new Stage). `TraceEvent.data` stays an open record; these typed
// shapes let the inspector read the new fields safely.

// Canonical JSON-RPC frames for an MCP exchange, on mcp.discover / mcp.call.
// `reconstructed` is true only for the in-process local fallback (badged in UI).
export interface JsonRpcFrames {
  request: { jsonrpc: string; id: number; method: string; params: Record<string, unknown> };
  response: { jsonrpc: string; id: number; result: unknown };
  reconstructed: boolean;
}

// The resolved POST /api/chat body the backend acted on, echoed on the
// `frontend` event (top_k resolved; 006/042 overrides present only when sent;
// `model` is always the resolved value — override or configured default).
export interface RequestBody {
  message: string;
  session_id: string;
  top_k: number;
  mode: string;
  // 042-agent-anatomy: always present (resolved server-side from override or
  // default), so the inspector can show what actually ran without guessing.
  model: string;
  system_prompt?: string;
  // 042-agent-anatomy: agent prompt (role) override; echoed only when set.
  agent_prompt?: string;
  enabled_tools?: string[];
  // 017-failure-injection — present only when a failure was forced (≠ none).
  simulate_failure?: string;
  // 084-network-edge — present only when the run was routed through the edge.
  edge?: boolean;
  // 088-network-layer — present only when the run was visualized through the chain.
  network?: boolean;
}

// 088-network-layer — what each ingress appliance did to this request, carried on
// its own stage `data`. Mirrors backend/app/network.py::*Info.as_data(). Each
// reports only what the appliance's forwarded headers prove (`seen` is false when
// the chain isn't in front — honest "not seen", like edge's `proxied`).
export interface DnsData {
  seen: boolean;
  host: string | null;
  address: string | null;
  ttl: number | null;
}
export interface CdnData {
  seen: boolean;
  cache: string | null; // "HIT" | "MISS" | "BYPASS"
  age: number | null;
  server: string | null;
  // 091 — additive (optional so older traces still type-check): hit count + the
  // human reason for the decision (e.g. "uncacheable method (POST)").
  hits?: number | null;
  reason?: string | null;
}
export interface WafData {
  seen: boolean;
  status: string; // "clean" | "blocked"
  rules: number | null;
  anomaly_score: number | null;
  engine: string | null;
  // 091 — the WAF's real config facts (anomaly block threshold + paranoia level).
  threshold?: number | null;
  paranoia?: number | null;
}
export interface LbData {
  seen: boolean;
  tls_version: string | null;
  scheme: string | null;
  upstream: string | null;
  server: string | null;
  // 091 — the load-balancing picture: pool size, algorithm, chosen backend.
  pool_size?: number | null;
  algorithm?: string | null;
  backend?: string | null;
}
export interface ApiGwData {
  seen: boolean;
  route: string | null;
  rate_limit_remaining: number | null;
  upstream_latency_ms: number | null;
  gateway: string | null;
  // 091 — the enforced policy (e.g. "rate-limit 60/min"), static + real.
  policy?: string | null;
}

// 084-network-edge — what the network edge did to this request, carried on the
// `edge` event `data`. Mirrors backend/app/edge.py::EdgeInfo.as_data(). Only
// what the forwarded headers prove: `proxied` is false (and `proxy_server` null)
// when no reverse proxy is in front (honest "direct access").
export interface EdgeData {
  proxied: boolean;
  tls: boolean;
  scheme: string;
  client_ip: string | null;
  request_id: string | null;
  proxy_server: string | null;
  forwarded_host: string | null;
}

// 079-db-query-detail — one real SQL statement an App Database operation ran,
// carried (ordered) on the `queries` key of the `db.read` / `db.write` END
// events. `sql` has the bound values inlined (display only). No new Stage.
export interface DbQuery {
  operation: string;
  sql: string;
  rows: number;
}

// 017-failure-injection — an injected (simulated) failure, carried as an `error`
// key on the open `data` record of an existing END event (mcp.call / llm.prompt).
// No new Stage/Phase or TraceEvent type change; this shape lets the inspector
// read it safely (à la 007's JsonRpcFrames).
export interface SimulatedError {
  error: string;
  simulated: boolean;
  // 051-failure-treatments — the *treatment* the simulator now exercises, carried
  // as additive keys on the same END `data` (no new Stage). For `llm_timeout`: each
  // retried `llm.prompt` span carries `attempt`/`max_retries` and (between attempts)
  // the `backoff_ms` it waited; the final `agent.think` END carries `circuit:"open"`
  // + `treatment:"fallback"`. For `tool_error`: the failed `mcp.call`/`rag.retrieve`
  // END carries `treatment:"graceful_degradation"`. All optional (older traces lack
  // them); mirrors backend/app/agent/resilience.py.
  attempt?: number;
  max_retries?: number;
  backoff_ms?: number;
  circuit?: string;
  treatment?: string;
}

// 021-abstain-badge — the structured not-found signal on an `mcp.call` END
// `data` record. `found === false` means the tool returned empty/not-found and
// the agent could honestly abstain. Optional (an older trace lacks it); `data`
// stays an open record (no required TraceEvent type change).
export interface ToolResultData {
  found?: boolean;
}

// 036-context-window-budget — the real per-category token split of the assembled
// prompt, computed server-side with tiktoken and emitted (additively) on the
// `llm.prompt` END `data`. Six "used" categories; Free space is derived on the
// client (window − used). Mirrors backend/app/llm/context.py BUDGET_CATEGORIES.
export interface ContextBudget {
  system: number;
  tool_defs: number;
  skills: number;
  memory: number;
  retrieved: number;
  messages: number;
}

// The assembled-prompt preview carried on the `llm.prompt` END `data` (the
// inspector reads it). 036 adds the real `context_window` (the model's max) +
// `context_budget` (the per-category split) alongside the existing fields. Both
// optional ⇒ older/replayed traces still type-check (AC9).
export interface PromptPreview {
  system?: string;
  context?: string;
  tools?: string[];
  messages?: { role: string; content: string }[];
  history?: { message: string; answer: string }[];
  context_window?: number;
  context_budget?: ContextBudget;
}

// 071-retrieval-metrics — the retrieval-quality scorecard carried additively on the
// `rag.retrieve` END `data.eval`, present ONLY when the run's query matches a labelled
// golden entry (else absent — honest "no ground truth"). Mirrors backend
// app/rag/metrics.py::evaluate. Relevance is at the source-file granularity.
export interface RetrievalEval {
  precision_at_k: number;
  recall_at_k: number;
  mrr: number;
  k: number;
  relevant_count: number;
  relevant_sources: string[];
  missed: string[];
  id?: string;
}

// 057-deepagents-runtime — typed read shapes for the DeepAgents event `data`
// (additive, like 036's ContextBudget). The drill-in reads these via pure
// projections in `lib/deepagents.ts`. `data` stays an open record.

// One todo item the lead agent maintains via write_todos.
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

// On the `agent.plan` END: the todo list (with per-item status) the agent maintains.
// `steps` (content-only) is kept for back-compat; `todos` carries the status.
export interface PlanData {
  steps: string[];
  todos?: TodoItem[];
  count?: number;
  model?: string;
  query?: string;
  // 067: the runtime's closing reconciliation (mark remaining todos completed once the
  // answer is produced). Folded into the last plan step, not rendered as a new block.
  finalized?: boolean;
}

// On `agent.fs.write` / `agent.fs.read` ENDs: one virtual-FS operation.
export interface VfsOpData {
  path: string;
  content: string;
  bytes?: number;
  found?: boolean;
  files?: string[];
}

// On the `agent.delegate` END: the hand-off to a real sub-agent (the `task` tool). The
// sub-agent ran its own bounded loop with an isolated context; only `result` returned to
// the lead agent. `steps` is the sub-agent's tool trail; `digest` mirrors `result`.
export interface DelegateData {
  subagent: string;
  subtask: string;
  result?: string;
  digest?: string;
  steps?: string[];
  rounds?: number;
  sources?: (string | null)[];
}

export interface TraceSummary {
  trace_id: string;
  message: string;
  answer: string;
  events: TraceEvent[];
}
