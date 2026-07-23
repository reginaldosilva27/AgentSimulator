// 101-arena-examples — the preset scenario library + the first-visit default sample.
//
// Each preset is a pure factory producing a complete `ArenaDesign` (placed nodes +
// edges + offered load) with bilingual metadata. Data-driven so the library is easy
// to extend. Node ids are literal and stable per preset (no counter needed). The
// designs are tuned so they teach their lesson THROUGH the real capacity model
// (examples.test.ts pins the simple-vs-scaled claim via computeMetrics).

import type { Lang } from "../i18n";
import { DEFAULT_HIT_RATIO } from "./components";
import type { ArenaEdge } from "./model";
import type { ArenaNode } from "./store";

export interface ArenaExample {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  build: () => { nodes: ArenaNode[]; edges: ArenaEdge[]; offeredLoad: number };
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
      en: "One of everything. Push the load up and watch the LLM saturate first — the classic agent wall.",
      pt: "Um de cada. Aumente a carga e veja o LLM saturar primeiro — a parede clássica do agente.",
    },
    build: () => ({
      offeredLoad: 300,
      nodes: [
        node("client", "client", 0, ROW),
        node("backend", "backend", COL, ROW),
        node("llm", "llm", COL * 2, 0),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2),
      ],
      edges: [edge("client", "backend"), edge("backend", "llm"), edge("backend", "vectorDb")],
    }),
  },
  {
    id: "scale-llm",
    title: { en: "Scale the LLM", pt: "Escalar o LLM" },
    description: {
      en: "Same load, but the LLM runs many replicas behind a load balancer — the bottleneck clears.",
      pt: "Mesma carga, mas o LLM roda várias réplicas atrás de um load balancer — o gargalo some.",
    },
    build: () => ({
      offeredLoad: 300,
      nodes: [
        node("client", "client", 0, ROW),
        node("lb", "loadBalancer", COL, ROW),
        node("backend", "backend", COL * 2, ROW),
        node("llm", "llm", COL * 3, 0, { replicas: 10 }),
        node("vectorDb", "vectorDb", COL * 3, ROW * 2),
      ],
      edges: [
        edge("client", "lb"),
        edge("lb", "backend"),
        edge("backend", "llm"),
        edge("backend", "vectorDb"),
      ],
    }),
  },
  {
    id: "rag-cache",
    title: { en: "RAG with a cache", pt: "RAG com cache" },
    description: {
      en: "A cache in front of the vector DB serves repeat reads, so only misses hit the store.",
      pt: "Um cache na frente do vector DB serve leituras repetidas — só as falhas vão ao banco.",
    },
    build: () => ({
      offeredLoad: 200,
      nodes: [
        node("client", "client", 0, ROW),
        node("cdn", "cdn", COL, ROW),
        node("backend", "backend", COL * 2, ROW),
        node("llm", "llm", COL * 3, 0, { replicas: 6 }),
        node("cache", "cache", COL * 3, ROW * 2, { hitRatio: DEFAULT_HIT_RATIO }),
        node("vectorDb", "vectorDb", COL * 4, ROW * 2),
      ],
      edges: [
        edge("client", "cdn"),
        edge("cdn", "backend"),
        edge("backend", "llm"),
        edge("backend", "cache"),
        edge("cache", "vectorDb"),
      ],
    }),
  },
  {
    id: "prod",
    title: { en: "Production shape", pt: "Formato de produção" },
    description: {
      en: "The full ingress-to-agent path: gateway, load balancer, replicated backend + LLM, cache and vector DB.",
      pt: "O caminho completo da borda ao agente: gateway, load balancer, backend + LLM replicados, cache e vector DB.",
    },
    build: () => ({
      offeredLoad: 600,
      nodes: [
        node("client", "client", 0, ROW),
        node("apigw", "apiGateway", COL, ROW),
        node("lb", "loadBalancer", COL * 2, ROW),
        node("backend", "backend", COL * 3, ROW, { replicas: 2 }),
        node("llm", "llm", COL * 4, 0, { replicas: 20 }),
        node("cache", "cache", COL * 4, ROW * 2, { hitRatio: DEFAULT_HIT_RATIO }),
        node("vectorDb", "vectorDb", COL * 5, ROW * 2),
      ],
      edges: [
        edge("client", "apigw"),
        edge("apigw", "lb"),
        edge("lb", "backend"),
        edge("backend", "llm"),
        edge("backend", "cache"),
        edge("cache", "vectorDb"),
      ],
    }),
  },
  {
    id: "llm-fleet",
    title: { en: "LLM fleet at 10k", pt: "Frota de LLMs a 10k" },
    description: {
      en: "What it takes to serve ~10k rps: a replicated backend + an AI Gateway routing across a fleet of LLM deployments (capacity adds up) + cache + DB replicas.",
      pt: "O que é preciso pra servir ~10k rps: backend replicado + um AI Gateway roteando entre uma frota de deployments de LLM (a capacidade soma) + cache + réplicas de banco.",
    },
    build: () => ({
      offeredLoad: 10_000,
      nodes: [
        node("client", "client", 0, ROW * 1.5),
        node("backend", "backend", COL, ROW * 1.5, { replicas: 3 }),
        node("aigw", "aiGateway", COL * 2, ROW * 1.5),
        // A fleet of LLM deployments behind the gateway — XLarge ×20 ≈ 4000 rps each.
        node("llm1", "llm", COL * 3, 0, { size: "xlarge", replicas: 20 }),
        node("llm2", "llm", COL * 3, ROW, { size: "xlarge", replicas: 20 }),
        node("llm3", "llm", COL * 3, ROW * 2, { size: "xlarge", replicas: 20 }),
        node("llm4", "llm", COL * 3, ROW * 3, { size: "xlarge", replicas: 20 }),
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

export function defaultDesign(): { nodes: ArenaNode[]; edges: ArenaEdge[]; offeredLoad: number } {
  const ex = EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID) ?? EXAMPLES[0];
  return ex.build();
}
