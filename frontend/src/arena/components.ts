// 100-arena-capacity-sandbox — the component-kind catalog.
//
// This is the single source of truth for the Arena's per-component BENCHMARKS
// (throughput + latency) and its bilingual labels. It deliberately lives apart
// from the pure model (`model.ts`) so the numbers — and the cited assumptions
// behind them — are inspectable in one place. The honesty banner (AC10) points
// at exactly these figures.
//
// HONESTY (constitution §3): these are order-of-magnitude *teaching* benchmarks,
// not measured production numbers. `baseCapacity` is requests/sec a single
// medium-sized replica sustains; `baseLatencyMs` is its unloaded service time.
// The point of the Arena is to make relative bottlenecks legible — chiefly that
// the LLM (rate-limited, ~tens of rps/replica) is the wall an agent hits long
// before the databases do — not to predict a real system to the decimal.

import type { Lang } from "../i18n";

export type ArenaKind =
  // agentic stations (mirror the Simulator's real stations)
  | "client"
  | "backend"
  | "llm"
  | "vectorDb"
  | "mcp"
  | "appDb"
  // classic scaling primitives
  | "cdn"
  | "apiGateway"
  | "aiGateway"
  | "loadBalancer"
  | "cache"
  | "queue"
  | "readReplica";

export type InstanceSize = "small" | "medium" | "large" | "xlarge";

/** Vertical scaling: capacity multiplier per instance size (medium = 1×). */
export const SIZE_MULTIPLIER: Record<InstanceSize, number> = {
  small: 0.5,
  medium: 1,
  large: 2,
  xlarge: 4,
};

export const INSTANCE_SIZES: readonly InstanceSize[] = ["small", "medium", "large", "xlarge"];

export interface Benchmark {
  /** Sustained requests/sec for one medium replica. */
  baseCapacity: number;
  /** Unloaded service latency (ms) for one request. */
  baseLatencyMs: number;
}

/** Per-kind teaching benchmarks — see the honesty note at the top of the file. */
export const BENCHMARKS: Record<ArenaKind, Benchmark> = {
  client: { baseCapacity: 1_000_000, baseLatencyMs: 0 }, // the load source, never the wall
  cdn: { baseCapacity: 200_000, baseLatencyMs: 5 },
  apiGateway: { baseCapacity: 20_000, baseLatencyMs: 3 },
  // AI Gateway / LLM router — a thin proxy; capacity isn't the constraint (the LLM
  // deployments behind it are). Small added latency for the routing hop.
  aiGateway: { baseCapacity: 50_000, baseLatencyMs: 5 },
  loadBalancer: { baseCapacity: 100_000, baseLatencyMs: 1 },
  backend: { baseCapacity: 5_000, baseLatencyMs: 20 },
  llm: { baseCapacity: 50, baseLatencyMs: 800 }, // rate-limited + slow — the agent's wall
  vectorDb: { baseCapacity: 2_000, baseLatencyMs: 25 },
  mcp: { baseCapacity: 1_000, baseLatencyMs: 50 },
  appDb: { baseCapacity: 3_000, baseLatencyMs: 10 },
  cache: { baseCapacity: 50_000, baseLatencyMs: 2 },
  queue: { baseCapacity: 20_000, baseLatencyMs: 5 },
  readReplica: { baseCapacity: 3_000, baseLatencyMs: 10 },
};

/** Default cache hit-ratio (editable per node); only misses reach the downstream. */
export const DEFAULT_HIT_RATIO = 0.8;

/** Routers (load balancer, AI gateway) split traffic evenly across their children;
 *  every other kind fans out the full load to each child. */
export function splitsLoad(kind: ArenaKind): boolean {
  return kind === "loadBalancer" || kind === "aiGateway";
}

interface KindMeta {
  label: Record<Lang, string>;
  description: Record<Lang, string>;
  /** cloud example names (proper nouns — not translated; §5 vocabulary reuse). */
  clouds: { azure: string; aws: string; gcp: string };
}

/** Bilingual palette metadata (constitution §4). Proper-noun cloud names stay plain. */
export const KIND_META: Record<ArenaKind, KindMeta> = {
  client: {
    label: { en: "Client", pt: "Cliente" },
    description: { en: "Where the users' load enters", pt: "Por onde a carga dos usuários entra" },
    clouds: { azure: "Browser / App", aws: "Browser / App", gcp: "Browser / App" },
  },
  backend: {
    label: { en: "Backend", pt: "Backend" },
    description: { en: "API server hosting the agent", pt: "Servidor de API que hospeda o agente" },
    clouds: { azure: "App Service", aws: "ECS / Fargate", gcp: "Cloud Run" },
  },
  llm: {
    label: { en: "LLM", pt: "LLM" },
    description: {
      en: "The model — rate-limited, the usual bottleneck",
      pt: "O modelo — limitado por rate limit, o gargalo mais comum",
    },
    clouds: { azure: "Azure OpenAI", aws: "Bedrock", gcp: "Vertex AI" },
  },
  vectorDb: {
    label: { en: "Vector DB", pt: "Vector DB" },
    description: { en: "Embedding similarity search", pt: "Busca por similaridade de embeddings" },
    clouds: { azure: "AI Search", aws: "OpenSearch", gcp: "Vertex Vector Search" },
  },
  mcp: {
    label: { en: "MCP Tools", pt: "MCP Tools" },
    description: { en: "External tool calls", pt: "Chamadas a ferramentas externas" },
    clouds: { azure: "Functions", aws: "Lambda", gcp: "Cloud Functions" },
  },
  appDb: {
    label: { en: "App DB", pt: "App DB" },
    description: { en: "Relational system of record", pt: "Banco relacional, fonte da verdade" },
    clouds: { azure: "Azure SQL", aws: "RDS", gcp: "Cloud SQL" },
  },
  cdn: {
    label: { en: "CDN", pt: "CDN" },
    description: { en: "Edge cache for static content", pt: "Cache de borda para conteúdo estático" },
    clouds: { azure: "Front Door", aws: "CloudFront", gcp: "Cloud CDN" },
  },
  apiGateway: {
    label: { en: "API Gateway", pt: "API Gateway" },
    description: { en: "Entry, auth, rate limiting", pt: "Entrada, auth, rate limiting" },
    clouds: { azure: "API Management", aws: "API Gateway", gcp: "API Gateway" },
  },
  aiGateway: {
    label: { en: "AI Gateway", pt: "AI Gateway" },
    description: {
      en: "Routes / load-balances across LLM deployments — their capacity adds up (fallback = resilience, not extra throughput)",
      pt: "Roteia / balanceia entre deployments de LLM — a capacidade soma (fallback = resiliência, não vazão extra)",
    },
    clouds: { azure: "APIM + AOAI", aws: "Bedrock Gateway", gcp: "Apigee + Vertex" },
  },
  loadBalancer: {
    label: { en: "Load Balancer", pt: "Load Balancer" },
    description: { en: "Splits load across replicas", pt: "Divide a carga entre réplicas" },
    clouds: { azure: "Load Balancer", aws: "ELB / ALB", gcp: "Cloud Load Balancing" },
  },
  cache: {
    label: { en: "Cache", pt: "Cache" },
    description: {
      en: "Serves hits; only misses hit the DB",
      pt: "Serve os acertos; só as falhas vão ao banco",
    },
    clouds: { azure: "Cache for Redis", aws: "ElastiCache", gcp: "Memorystore" },
  },
  queue: {
    label: { en: "Queue", pt: "Fila" },
    description: { en: "Absorbs bursts, decouples work", pt: "Absorve picos, desacopla o trabalho" },
    clouds: { azure: "Service Bus", aws: "SQS", gcp: "Pub/Sub" },
  },
  readReplica: {
    label: { en: "Read Replica", pt: "Réplica de Leitura" },
    description: { en: "Scales read throughput", pt: "Escala a vazão de leitura" },
    clouds: { azure: "SQL Replica", aws: "RDS Read Replica", gcp: "Cloud SQL Replica" },
  },
};

/** The palette order (agentic stations first, then scaling primitives). */
export const PALETTE_ORDER: readonly ArenaKind[] = [
  "client",
  "backend",
  "llm",
  "vectorDb",
  "mcp",
  "appDb",
  "cdn",
  "apiGateway",
  "aiGateway",
  "loadBalancer",
  "cache",
  "queue",
  "readReplica",
];
