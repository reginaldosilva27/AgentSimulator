// 101-arena-examples + 103-arena-realism — the preset scenario library.
//
// Each preset is a pure factory producing a complete design (placed nodes + edges)
// plus its LOAD STORY in Little's-Law terms: `users` concurrent users each sending
// one request every `thinkTimeSec` seconds → offered rps = users / thinkTimeSec.
// Framing the load in users (not raw rps) is what keeps the numbers defensible:
// e.g. 100k concurrent users at 1 msg/min ≈ 1,667 req/s — servable by a realistic
// LLM fleet — where "100k rps straight into an LLM" would be fantasy (Azure's PTU
// sizing math puts ONE deployment at single-digit-to-tens of agent-shaped req/s).
//
// `callsPerRequest` models the agent fan-out (a ReAct turn makes 2–5 model calls;
// tools/retrieval may be hit more than once per turn). Set it on the AI Gateway OR
// on the LLM directly behind the backend — never both (double-count).
//
// The designs teach THROUGH the real capacity model — examples.test.ts pins the
// simple-vs-scaled claim and the fleet's survival via computeMetrics.

import type { Lang } from "../i18n";
import { DEFAULT_HIT_RATIO } from "./components";
import { rpsOf, type ArenaEdge } from "./model";
import type { ArenaNode, ArenaState } from "./store";

export interface ArenaExample {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  build: () => Pick<ArenaState, "nodes" | "edges" | "users" | "thinkTimeSec">;
}

/** Terse node factory: kind + position + optional scaling overrides. */
function node(
  id: string,
  kind: ArenaNode["kind"],
  x: number,
  y: number,
  extra: Partial<ArenaNode> = {},
): ArenaNode {
  return { id, kind, size: "medium", replicas: 1, x, y, ...extra };
}
const edge = (source: string, target: string): ArenaEdge => ({
  id: `${source}-${target}`,
  source,
  target,
});

const COL = 210; // horizontal spacing between tiers
const ROW = 150; // vertical spacing between branches

export const EXAMPLES: ArenaExample[] = [
  {
    id: "simple-rag",
    title: { en: "Simple RAG agent", pt: "Agente RAG simples" },
    description: {
      en: "6k users, 1 msg/20s (≈300 req/s). Each turn makes 2 LLM calls — one deployment saturates instantly: the agent's wall.",
      pt: "6 mil usuários, 1 msg/20s (≈300 req/s). Cada turno faz 2 chamadas de LLM — um deployment satura na hora: a parede do agente.",
    },
    build: () => ({
      users: 6_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("backend", "backend", COL, ROW),
        node("llm", "llm", COL * 2, 0, { callsPerRequest: 2 }),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2),
      ],
      edges: [edge("client", "backend"), edge("backend", "llm"), edge("backend", "vectorDb")],
    }),
  },
  {
    id: "scale-llm",
    title: { en: "Scale the LLM", pt: "Escalar o LLM" },
    description: {
      en: "Same 300 req/s, but the LLM runs 20 deployments (replicas) — the bottleneck clears. Horizontal scale is the lever.",
      pt: "Os mesmos 300 req/s, mas o LLM roda 20 deployments (réplicas) — o gargalo some. Escala horizontal é a alavanca.",
    },
    build: () => ({
      users: 6_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("backend", "backend", COL, ROW),
        node("llm", "llm", COL * 2, 0, { callsPerRequest: 2, replicas: 20 }),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2),
      ],
      edges: [edge("client", "backend"), edge("backend", "llm"), edge("backend", "vectorDb")],
    }),
  },
  {
    id: "rag-cache",
    title: { en: "RAG with a cache", pt: "RAG com cache" },
    description: {
      en: "An API gateway fronts the POST path (a CDN would bypass it) and a cache serves repeat retrievals — only misses reach the vector DB.",
      pt: "Um API gateway na frente do caminho POST (um CDN daria bypass) e um cache serve leituras repetidas — só as falhas chegam ao vector DB.",
    },
    build: () => ({
      users: 4_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("apigw", "apiGateway", COL, ROW),
        node("backend", "backend", COL * 2, ROW),
        node("llm", "llm", COL * 3, 0, { callsPerRequest: 2, replicas: 12 }),
        node("cache", "cache", COL * 3, ROW * 2, { hitRatio: DEFAULT_HIT_RATIO }),
        node("vectorDb", "vectorDb", COL * 4, ROW * 2),
      ],
      edges: [
        edge("client", "apigw"),
        edge("apigw", "backend"),
        edge("backend", "llm"),
        edge("backend", "cache"),
        edge("cache", "vectorDb"),
      ],
    }),
  },
  {
    id: "agent-tools",
    title: { en: "Agent with tools", pt: "Agente com tools" },
    description: {
      en: "The ReAct loop multiplies internal traffic: 100 user req/s become 300 LLM calls and 200 tool calls per second.",
      pt: "O loop ReAct multiplica o tráfego interno: 100 req/s de usuários viram 300 chamadas de LLM e 200 de tools por segundo.",
    },
    build: () => ({
      users: 2_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("backend", "backend", COL, ROW),
        node("llm", "llm", COL * 2, 0, { callsPerRequest: 3, replicas: 10 }),
        node("mcp", "mcp", COL * 2, ROW * 1.4, { callsPerRequest: 2 }),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2.6, { callsPerRequest: 2 }),
      ],
      edges: [
        edge("client", "backend"),
        edge("backend", "llm"),
        edge("backend", "mcp"),
        edge("backend", "vectorDb"),
      ],
    }),
  },
  {
    id: "prod",
    title: { en: "Production shape", pt: "Formato de produção" },
    description: {
      en: "12k users (≈600 req/s) through gateway + LB, replicated backend, an AI Gateway routing 2 LLM pools, cache + vector DB.",
      pt: "12 mil usuários (≈600 req/s) por gateway + LB, backend replicado, AI Gateway roteando 2 pools de LLM, cache + vector DB.",
    },
    build: () => ({
      users: 12_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("apigw", "apiGateway", COL, ROW),
        node("lb", "loadBalancer", COL * 2, ROW),
        node("backend", "backend", COL * 3, ROW, { replicas: 2 }),
        node("aigw", "aiGateway", COL * 4, ROW * 0.4, { callsPerRequest: 2 }),
        // Two POOLS in different regions (106) — same capacity as one box ×20;
        // the split is resilience/latency intent, which the gateway routes across.
        node("llm1", "llm", COL * 5, 0, { size: "large", replicas: 10, region: "us-east" }),
        node("llm2", "llm", COL * 5, ROW, { size: "large", replicas: 10, region: "eu-west" }),
        node("cache", "cache", COL * 4, ROW * 2, { hitRatio: DEFAULT_HIT_RATIO }),
        node("vectorDb", "vectorDb", COL * 5, ROW * 2.4),
      ],
      edges: [
        edge("client", "apigw"),
        edge("apigw", "lb"),
        edge("lb", "backend"),
        edge("backend", "aigw"),
        edge("aigw", "llm1"),
        edge("aigw", "llm2"),
        edge("backend", "cache"),
        edge("cache", "vectorDb"),
      ],
    }),
  },
  {
    id: "llm-fleet",
    title: { en: "100k users", pt: "100 mil usuários" },
    description: {
      en: "100k concurrent users at 1 msg/min ≈ 1,667 req/s (Little's Law). An AI Gateway spreads ~3,300 LLM calls/s across a fleet of 4 pools × 6 XLarge deployments.",
      pt: "100 mil usuários simultâneos a 1 msg/min ≈ 1.667 req/s (Lei de Little). Um AI Gateway espalha ~3.300 chamadas de LLM/s por uma frota de 4 pools × 6 deployments XLarge.",
    },
    build: () => ({
      users: 100_000,
      thinkTimeSec: 60,
      nodes: [
        node("client", "client", 0, ROW * 1.5),
        node("backend", "backend", COL, ROW * 1.5, { replicas: 3 }),
        node("aigw", "aiGateway", COL * 2, ROW * 1.5, { callsPerRequest: 2 }),
        // Four POOLS across four regions (106) — the fleet the gateway routes.
        node("llm1", "llm", COL * 3, 0, { size: "xlarge", replicas: 6, region: "us-east" }),
        node("llm2", "llm", COL * 3, ROW, { size: "xlarge", replicas: 6, region: "us-west" }),
        node("llm3", "llm", COL * 3, ROW * 2, { size: "xlarge", replicas: 6, region: "eu-west" }),
        node("llm4", "llm", COL * 3, ROW * 3, { size: "xlarge", replicas: 6, region: "sa-east" }),
        node("cache", "cache", COL * 2, ROW * 3.2, { hitRatio: DEFAULT_HIT_RATIO }),
        node("vectorDb", "vectorDb", COL * 3, ROW * 4.2, { replicas: 2 }),
      ],
      edges: [
        edge("client", "backend"),
        edge("backend", "aigw"),
        edge("aigw", "llm1"),
        edge("aigw", "llm2"),
        edge("aigw", "llm3"),
        edge("aigw", "llm4"),
        edge("backend", "cache"),
        edge("cache", "vectorDb"),
      ],
    }),
  },
];

/** The sample loaded on a first visit (empty localStorage). */
export const DEFAULT_EXAMPLE_ID = "simple-rag";

export function defaultDesign(): ArenaState {
  const ex = EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID) ?? EXAMPLES[0];
  const d = ex.build();
  return { ...d, offeredLoad: rpsOf(d.users, d.thinkTimeSec) };
}
