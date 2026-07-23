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
// the LLM (rate-limited, ~hundreds of calls/s per quota block) is the wall an
// agent hits long before the databases do — not to predict a real system to the
// decimal. 116 anchors the LLM figures to published quota tables (see below).

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
  | "semanticCache"
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
  // 116 — one deployment = one quota block. Anchor: Azure OpenAI Global Standard
  // quota for gpt-4.1-mini, per region/subscription (May-2026 docs), at the stated
  // agent-shaped call of ~2.5k tokens: Tier 1 = 5M TPM ≈ 33 calls/s · Tier 3 =
  // 46M ≈ 307 · Tier 5 = 150M ≈ 1,000. Medium (150) sits in the Tier 2–3 band;
  // the size ladder (75/150/300/600) spans Tiers 1→4. Latency is the BLENDED
  // per-call service time: a ReAct turn mixes short tool-decision rounds (~100
  // output tokens, under a second) with one long generate (~500 tokens, 3–4 s) —
  // the e2e turn readout multiplies it by calls-per-request.
  llm: { baseCapacity: 150, baseLatencyMs: 800 }, // rate-limited + slow — the agent's wall
  vectorDb: { baseCapacity: 2_000, baseLatencyMs: 25 },
  mcp: { baseCapacity: 1_000, baseLatencyMs: 50 },
  appDb: { baseCapacity: 3_000, baseLatencyMs: 10 },
  cache: { baseCapacity: 50_000, baseLatencyMs: 2 },
  // 112/116 — an embedding call + vector lookup per request: tens of ms, not a
  // key-value hit.
  semanticCache: { baseCapacity: 20_000, baseLatencyMs: 50 },
  queue: { baseCapacity: 20_000, baseLatencyMs: 5 },
  readReplica: { baseCapacity: 3_000, baseLatencyMs: 10 },
};

/** Default cache hit-ratio (editable per node); only misses reach the downstream. */
export const DEFAULT_HIT_RATIO = 0.8;

/** 112 — the semantic cache's honest default: it dedupes paraphrases, not
 *  sessions — real-world semantic hit rates are modest (~20–30%). Editable. */
export const DEFAULT_SEMANTIC_HIT_RATIO = 0.25;

/** 112 — kinds that serve a hit fraction locally and forward only the misses. */
export function isCacheLike(kind: ArenaKind): boolean {
  return kind === "cache" || kind === "semanticCache";
}

/** Per-kind default hit ratio for cache-like kinds (0 elsewhere). */
export function defaultHitRatioFor(kind: ArenaKind): number {
  if (kind === "cache") return DEFAULT_HIT_RATIO;
  if (kind === "semanticCache") return DEFAULT_SEMANTIC_HIT_RATIO;
  return 0;
}

/** 103 — kinds whose per-request call fan-out is user-configurable (the ReAct loop
 *  makes 2–5 model calls per turn; tools/retrieval can be hit more than once). */
export const CALLS_CONFIGURABLE: ReadonlySet<ArenaKind> = new Set<ArenaKind>([
  "llm",
  "aiGateway",
  "mcp",
  "vectorDb",
]);

/** 106/116 — the curated region list (cloud-agnostic codes; proper-noun-like, not
 *  translated — every provider has analogues). Since 114 it has teeth (regional
 *  quota + cross-region latency); 116 adds the extra US regions real fleets
 *  spread across and defaults every new infrastructure node to `us-east`. */
export const ARENA_REGIONS = [
  "us-east",
  "us-east-2",
  "us-central",
  "us-west",
  "eu-west",
  "eu-north",
  "sa-east",
  "ap-south",
] as const;
export type ArenaRegion = (typeof ARENA_REGIONS)[number];

/** 105 — client-side LLM routing tax: a non-router node that manages N LLM
 *  deployment endpoints directly (keys, health checks, per-deployment rate-limit
 *  bookkeeping, retries in app code) loses `RATE` of its capacity per deployment
 *  beyond the first, capped at `CAP`. Teaching estimates (order of magnitude),
 *  not benchmarks — routers (AI Gateway / LB) are purpose-built and exempt. */
export const ROUTING_TAX_RATE = 0.02;
export const ROUTING_TAX_CAP = 0.4;

/** 114 — fixed latency added to a hop whose endpoints declare DIFFERENT regions
 *  (mid-range of real inter-region RTTs; one constant, not a distance matrix). */
export const CROSS_REGION_LATENCY_MS = 100;

/** 117-arena-llm-call-shape — the WORKLOAD's call shape: how many tokens one
 *  agent call carries. It is the single assumption behind three numbers that
 *  must move together — a deployment's calls/s (quota is TPM: capacity =
 *  TPM ÷ tokens/call), the per-call latency (prefill + decode) and the per-call
 *  cost. Global (one workload, one shape), editable in the control bar. */
export interface CallShape {
  /** Prompt-side tokens: system prompt + history + retrieved chunks + tool schemas. */
  inputTokens: number;
  /** Completion-side tokens the model generates. */
  outputTokens: number;
}

/** The stated default agent call (~2k in + 500 out ≈ 2.5k tokens) — the 116 anchor. */
export const DEFAULT_CALL_SHAPE: CallShape = { inputTokens: 2000, outputTokens: 500 };

/** Control-bar slider bounds (big system prompts + history push input to 8–16k). */
export const CALL_SHAPE_BOUNDS = {
  inputTokens: { min: 200, max: 16_000, step: 100 },
  outputTokens: { min: 100, max: 4_000, step: 50 },
} as const;

const tokensPerCall = (shape: CallShape) => shape.inputTokens + shape.outputTokens;

/** 117 — a MEDIUM deployment's quota block in TPM. Implied by the 116 anchor:
 *  150 calls/s × 2,500 tok/call × 60 s = 22.5M TPM (the Tier 2–3 band). */
export const LLM_DEPLOYMENT_TPM_MEDIUM = 22_500_000;

/** Calls/s one MEDIUM deployment sustains at this call shape (TPM ÷ tokens). */
export function llmBaseCapacityFor(shape: CallShape): number {
  return LLM_DEPLOYMENT_TPM_MEDIUM / 60 / tokensPerCall(shape);
}

/** 117 — per-call latency decomposition, calibrated so the default shape lands
 *  on the 116 blended 800 ms: fixed TTFT + prefill (input) + decode (output).
 *  Teaching slopes (stated, not measured): prefill ≈ 20k tok/s; decode ≈ 1 ms/tok
 *  — the BLENDED figure across a turn's mixed short/long rounds, not one stream. */
export const LLM_TTFT_MS = 200;
export const LLM_PREFILL_MS_PER_TOKEN = 0.05;
export const LLM_DECODE_MS_PER_TOKEN = 1.0;

export function llmBaseLatencyMsFor(shape: CallShape): number {
  return (
    LLM_TTFT_MS +
    shape.inputTokens * LLM_PREFILL_MS_PER_TOKEN +
    shape.outputTokens * LLM_DECODE_MS_PER_TOKEN
  );
}

/** gpt-4.1-mini global prices — the 103/116 cost anchor, now per-token inputs. */
export const LLM_INPUT_USD_PER_MTOK = 0.4;
export const LLM_OUTPUT_USD_PER_MTOK = 1.6;

/** Cost of one call at this shape (order-of-magnitude estimate, stated in the hint). */
export function llmCostPerCallUsd(shape: CallShape): number {
  return (
    (shape.inputTokens * LLM_INPUT_USD_PER_MTOK + shape.outputTokens * LLM_OUTPUT_USD_PER_MTOK) /
    1_000_000
  );
}

/** 103 — the default-shape per-call cost (≈ $0.0016), kept as the stated anchor. */
export const LLM_COST_PER_CALL_USD = llmCostPerCallUsd(DEFAULT_CALL_SHAPE);

/** 114/116/117 — a region caps how much MODEL capacity you can provision
 *  (subscription quota / PTU availability). TPM-denominated since 117: the cap
 *  is a token budget, so a heavier call shape buys fewer calls/s. Anchor: the
 *  top published Azure Global Standard tier for gpt-4.1-mini is 225M TPM per
 *  region ≈ 1,500 agent-calls/s at ~2.5k tok/call; 450M (≈3,000 calls/s at the
 *  default shape) is the order you reach with approved quota increases — every
 *  preset pool fits; stacking a whole fleet in one region does not, and
 *  spreading regions is the honest escape. Teaching constant (real quotas vary
 *  by model/region/tier), stated in the hint. */
export const REGIONAL_LLM_TPM = 450_000_000;

/** Calls/s the regional token budget allows at this call shape. */
export function regionalLlmQuotaRpsFor(shape: CallShape): number {
  return REGIONAL_LLM_TPM / 60 / (shape.inputTokens + shape.outputTokens);
}

/** The default-shape regional cap (≈ 3,000 calls/s) — the stated 114/116 anchor. */
export const REGIONAL_LLM_QUOTA_RPS = regionalLlmQuotaRpsFor(DEFAULT_CALL_SHAPE);

/** 111/116 — teaching cost basis for PROVISIONED model capacity (think Azure PTUs /
 *  Bedrock provisioned throughput): ~$300/h per MEDIUM deployment, scaled by
 *  SIZE_MULTIPLIER, billed even when idle. Calibrated against the usage side so
 *  the real trade-off shows: a medium deployment at full tilt would bill
 *  150 calls/s × $0.0016 × 3600 ≈ $864/h pay-per-call, so provisioned breaks even
 *  around ~35% utilization — busy fleets buy capacity, idle ones pay per call.
 *  Order-of-magnitude estimate (PTU-block pricing territory), stated in the hint. */
export const LLM_COST_PER_DEPLOYMENT_HOUR_USD = 300;

/** 118-arena-backend-concurrency — held-stream budget per MEDIUM unit, for the
 *  kinds that synchronously hold a connection open for the WHOLE agent turn.
 *  Teaching order-of-magnitude: an async API container sustains a few thousand
 *  open SSE/WebSocket streams before file descriptors, event-loop overhead and
 *  per-stream buffers bite (nginx/uvicorn defaults live in the single-digit
 *  thousands). Scaled by SIZE_MULTIPLIER (memory) × replicas. Kinds without an
 *  entry have no modeled wall — no fictional limits (§3). */
export const CONCURRENCY_BUDGET_PER_UNIT: Partial<Record<ArenaKind, number>> = {
  backend: 2_000,
};

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
  /** 104 — the ℹ️ explainer: what this box is + what its knobs mean here. */
  info: Record<Lang, string>;
  /** 104 — per-kind scaling vocabulary: what ONE horizontal unit is (`unit`) and
   *  what "instance size" means (`sizeMeaning`). `null` = not scalable (client:
   *  the load source's knob is the users slider, not infrastructure). */
  scaling: { unit: Record<Lang, string>; sizeMeaning: Record<Lang, string> } | null;
}

/** Bilingual palette metadata (constitution §4). Proper-noun cloud names stay plain. */
export const KIND_META: Record<ArenaKind, KindMeta> = {
  client: {
    label: { en: "Client", pt: "Cliente" },
    description: { en: "Where the users' load enters", pt: "Por onde a carga dos usuários entra" },
    clouds: { azure: "Browser / App", aws: "Browser / App", gcp: "Browser / App" },
    info: {
      en: "The load source — your users' browsers and apps. It isn't infrastructure you scale: to change the load, move the concurrent-users slider and the think time.",
      pt: "A origem da carga — os navegadores e apps dos seus usuários. Não é infraestrutura que você escala: para mudar a carga, use o slider de usuários simultâneos e o tempo entre mensagens.",
    },
    scaling: null,
  },
  backend: {
    label: { en: "Backend", pt: "Backend" },
    description: { en: "API server hosting the agent", pt: "Servidor de API que hospeda o agente" },
    clouds: { azure: "App Service", aws: "ECS / Fargate", gcp: "Cloud Run" },
    info: {
      en: "The API service running the agent's code. Here a unit IS a container/pod behind the platform's load distribution, and size is each container's vCPU/memory. Capacity = base × size × containers.",
      pt: "O serviço de API que roda o código do agente. Aqui a unidade É um container/pod atrás da distribuição de carga da plataforma, e o tamanho é o vCPU/memória de cada container. Capacidade = base × tamanho × containers.",
    },
    scaling: {
      unit: { en: "Containers", pt: "Containers" },
      sizeMeaning: { en: "vCPU / memory per container", pt: "vCPU / memória por container" },
    },
  },
  llm: {
    label: { en: "LLM", pt: "LLM" },
    description: {
      en: "The model — rate-limited, the usual bottleneck",
      pt: "O modelo — limitado por rate limit, o gargalo mais comum",
    },
    clouds: { azure: "Azure OpenAI", aws: "Bedrock", gcp: "Vertex AI" },
    info: {
      en: "NOT containers: one unit is a model DEPLOYMENT with its own rate-limit quota (TPM/RPM — e.g. an Azure PTU block or a per-region deployment). Size is the quota tier of each deployment — anchored to published tables: at ~2.5k tokens/call, provider quota tiers run ≈33 calls/s (entry) to ≈1,000+ calls/s (top) per region, so Small≈75 · Medium≈150 · Large≈300 · XLarge≈600. Draw SEPARATE LLM boxes for different pools (regions/models/providers); the deployments slider is identical copies within one pool. With no AI Gateway in front, YOUR backend routes across the endpoints and pays a capacity tax for it. Each region caps total LLM capacity (regional quota) — spreading pools across regions is how real fleets escape it.",
      pt: "NÃO são containers: uma unidade é um DEPLOYMENT do modelo com cota própria de rate limit (TPM/RPM — ex.: um bloco de PTUs na Azure ou um deployment por região). O tamanho é o tier de cota de cada deployment — ancorado em tabelas publicadas: a ~2,5k tokens/chamada, os tiers de cota dos provedores vão de ≈33 chamadas/s (entrada) a ≈1.000+ chamadas/s (topo) por região, então Small≈75 · Medium≈150 · Large≈300 · XLarge≈600. Desenhe caixas de LLM SEPARADAS para pools diferentes (regiões/modelos/provedores); o slider de deployments são cópias idênticas dentro de um pool. Sem um AI Gateway na frente, é o SEU backend que roteia entre os endpoints e paga um imposto de capacidade por isso. Cada região limita a capacidade total de LLM (cota regional) — espalhar pools entre regiões é como frotas reais escapam disso.",
    },
    scaling: {
      unit: { en: "Deployments", pt: "Deployments" },
      sizeMeaning: {
        en: "Quota tier per deployment (PTUs / TPM)",
        pt: "Tier de cota por deployment (PTUs / TPM)",
      },
    },
  },
  vectorDb: {
    label: { en: "Vector DB", pt: "Vector DB" },
    description: { en: "Embedding similarity search", pt: "Busca por similaridade de embeddings" },
    clouds: { azure: "AI Search", aws: "OpenSearch", gcp: "Vertex Vector Search" },
    info: {
      en: "The vector search engine behind retrieval. Units are query replicas (the model scales read throughput linearly — a simplification); size is the node class (vCPU/RAM).",
      pt: "O motor de busca vetorial por trás da recuperação. As unidades são réplicas de consulta (o modelo escala a vazão de leitura linearmente — uma simplificação); o tamanho é a classe do nó (vCPU/RAM).",
    },
    scaling: {
      unit: { en: "Query replicas", pt: "Réplicas de consulta" },
      sizeMeaning: { en: "Node class (vCPU / RAM)", pt: "Classe do nó (vCPU / RAM)" },
    },
  },
  mcp: {
    label: { en: "MCP Tools", pt: "MCP Tools" },
    description: { en: "External tool calls", pt: "Chamadas a ferramentas externas" },
    clouds: { azure: "Functions", aws: "Lambda", gcp: "Cloud Functions" },
    info: {
      en: "The tool service the agent calls (MCP server, functions, APIs). Units are service instances; size is each instance's vCPU/memory. 'Calls per request' models how many tool calls one agent turn makes.",
      pt: "O serviço de ferramentas que o agente chama (servidor MCP, functions, APIs). As unidades são instâncias do serviço; o tamanho é o vCPU/memória de cada instância. 'Chamadas por request' modela quantas chamadas de tool um turno do agente faz.",
    },
    scaling: {
      unit: { en: "Instances", pt: "Instâncias" },
      sizeMeaning: { en: "vCPU / memory per instance", pt: "vCPU / memória por instância" },
    },
  },
  appDb: {
    label: { en: "App DB", pt: "App DB" },
    description: { en: "Relational system of record", pt: "Banco relacional, fonte da verdade" },
    clouds: { azure: "Azure SQL", aws: "RDS", gcp: "Cloud SQL" },
    info: {
      en: "The relational system of record. Units are read replicas (writes stay on the primary in real life — this model simplifies to linear scaling); size is the instance class.",
      pt: "O banco relacional, fonte da verdade. As unidades são réplicas de leitura (na vida real a escrita fica no primário — este modelo simplifica para escala linear); o tamanho é a classe da instância.",
    },
    scaling: {
      unit: { en: "Read replicas", pt: "Réplicas de leitura" },
      sizeMeaning: { en: "Instance class (vCPU / RAM)", pt: "Classe da instância (vCPU / RAM)" },
    },
  },
  cdn: {
    label: { en: "CDN", pt: "CDN" },
    description: { en: "Edge cache for static content", pt: "Cache de borda para conteúdo estático" },
    clouds: { azure: "Front Door", aws: "CloudFront", gcp: "Cloud CDN" },
    info: {
      en: "A managed global edge network — you rarely scale it yourself; the knobs here stand in for the provider's edge capacity. Note: CDNs bypass dynamic POST calls (they help static assets, not the chat path).",
      pt: "Uma rede de borda global gerenciada — você raramente a escala; os controles aqui representam a capacidade de borda do provedor. Nota: CDNs dão bypass em POSTs dinâmicos (ajudam assets estáticos, não o caminho do chat).",
    },
    scaling: {
      unit: { en: "Scale units", pt: "Unidades de escala" },
      sizeMeaning: { en: "Service tier", pt: "Tier do serviço" },
    },
  },
  apiGateway: {
    label: { en: "API Gateway", pt: "API Gateway" },
    description: { en: "Entry, auth, rate limiting", pt: "Entrada, auth, rate limiting" },
    clouds: { azure: "API Management", aws: "API Gateway", gcp: "API Gateway" },
    info: {
      en: "The managed front door: auth, quotas, rate limiting, routing. Units/tier are the provider's scale units — they raise the sustained requests/sec the gateway handles.",
      pt: "A porta de entrada gerenciada: auth, cotas, rate limiting, roteamento. Unidades/tier são as unidades de escala do provedor — elas aumentam os requests/s sustentados que o gateway atende.",
    },
    scaling: {
      unit: { en: "Scale units", pt: "Unidades de escala" },
      sizeMeaning: { en: "Service tier", pt: "Tier do serviço" },
    },
  },
  aiGateway: {
    label: { en: "AI Gateway", pt: "AI Gateway" },
    description: {
      en: "Routes / load-balances across LLM deployments — their capacity adds up (fallback = resilience, not extra throughput)",
      pt: "Roteia / balanceia entre deployments de LLM — a capacidade soma (fallback = resiliência, não vazão extra)",
    },
    clouds: { azure: "APIM + AOAI", aws: "Bedrock Gateway", gcp: "Apigee + Vertex" },
    info: {
      en: "An LLM router (LiteLLM, APIM GenAI gateway…): splits calls across the model deployments behind it, so their quotas ADD UP. Steady-state capacity is the SAME as backend-side routing — the differential is operational: one endpoint, central keys/quotas/cost tracking, failover across regions/providers, and no routing code in your apps. Set 'calls per request' here (not on the LLMs behind it).",
      pt: "Um roteador de LLM (LiteLLM, gateway GenAI do APIM…): divide as chamadas entre os deployments de modelo atrás dele, então as cotas SOMAM. A capacidade em regime permanente é a MESMA do roteamento feito pelo backend — o diferencial é operacional: um endpoint só, keys/cotas/custo centralizados, failover entre regiões/provedores e nenhum código de roteamento nos seus apps. Configure 'chamadas por request' aqui (não nos LLMs atrás dele).",
    },
    scaling: {
      unit: { en: "Instances", pt: "Instâncias" },
      sizeMeaning: { en: "Service tier", pt: "Tier do serviço" },
    },
  },
  loadBalancer: {
    label: { en: "Load Balancer", pt: "Load Balancer" },
    description: { en: "Splits load across replicas", pt: "Divide a carga entre réplicas" },
    clouds: { azure: "Load Balancer", aws: "ELB / ALB", gcp: "Cloud Load Balancing" },
    info: {
      en: "Splits incoming traffic 1/N across the nodes wired behind it. A managed service — units/tier stand in for the provider's scale units.",
      pt: "Divide o tráfego que chega em 1/N entre os nós ligados atrás dele. Serviço gerenciado — unidades/tier representam as unidades de escala do provedor.",
    },
    scaling: {
      unit: { en: "Scale units", pt: "Unidades de escala" },
      sizeMeaning: { en: "Service tier", pt: "Tier do serviço" },
    },
  },
  cache: {
    label: { en: "Cache", pt: "Cache" },
    description: {
      en: "Serves hits; only misses hit the DB",
      pt: "Serve os acertos; só as falhas vão ao banco",
    },
    clouds: { azure: "Cache for Redis", aws: "ElastiCache", gcp: "Memorystore" },
    info: {
      en: "In-memory cache: the hit ratio is served locally and only misses continue downstream. Units are cluster nodes; size is the node type. Raising the hit ratio is often cheaper than scaling the DB.",
      pt: "Cache em memória: a taxa de acerto é servida localmente e só as falhas seguem adiante. As unidades são nós do cluster; o tamanho é o tipo do nó. Subir a taxa de acerto costuma sair mais barato que escalar o banco.",
    },
    scaling: {
      unit: { en: "Cluster nodes", pt: "Nós do cluster" },
      sizeMeaning: { en: "Node type (memory)", pt: "Tipo do nó (memória)" },
    },
  },
  semanticCache: {
    label: { en: "Semantic Cache", pt: "Cache Semântico" },
    description: {
      en: "Answers repeated/similar questions without calling the model",
      pt: "Responde perguntas repetidas/parecidas sem chamar o modelo",
    },
    clouds: {
      azure: "Azure Managed Redis (vector)",
      aws: "MemoryDB (vector search)",
      gcp: "Memorystore for Redis",
    },
    info: {
      en: "Caches answers by embedding similarity: hits skip the model entirely; only misses continue. Honest hit rates are modest (~20–30% — it dedupes paraphrases, not sessions) and a too-loose threshold can serve a WRONG similar answer. Units are cluster nodes; size is node memory.",
      pt: "Faz cache de respostas por similaridade de embeddings: acertos pulam o modelo; só as falhas seguem adiante. Taxas de acerto honestas são modestas (~20–30% — ele deduplica paráfrases, não sessões) e um limiar frouxo demais pode servir uma resposta parecida ERRADA. As unidades são nós do cluster; o tamanho é a memória do nó.",
    },
    scaling: {
      unit: { en: "Cluster nodes", pt: "Nós do cluster" },
      sizeMeaning: { en: "Node type (memory)", pt: "Tipo do nó (memória)" },
    },
  },
  queue: {
    label: { en: "Queue", pt: "Fila" },
    // 103 honesty: in this steady-state model a queue passes load through — it
    // smooths bursts in real life but cannot fix a sustained bottleneck.
    description: {
      en: "Absorbs bursts, decouples work — adds no sustained throughput",
      pt: "Absorve picos, desacopla o trabalho — não aumenta a vazão sustentada",
    },
    clouds: { azure: "Service Bus", aws: "SQS", gcp: "Pub/Sub" },
    info: {
      en: "Buffers bursts and decouples producers from consumers. In this steady-state model it passes load through — it CANNOT fix an undersized consumer; scale the consumer instead. Units are partitions/throughput units.",
      pt: "Amortece picos e desacopla produtores de consumidores. Neste modelo de regime permanente ela repassa a carga — NÃO conserta um consumidor subdimensionado; escale o consumidor. As unidades são partições/unidades de vazão.",
    },
    scaling: {
      unit: { en: "Partitions", pt: "Partições" },
      sizeMeaning: { en: "Throughput units", pt: "Unidades de vazão" },
    },
  },
  readReplica: {
    label: { en: "Read Replica", pt: "Réplica de Leitura" },
    description: { en: "Scales read throughput", pt: "Escala a vazão de leitura" },
    clouds: { azure: "SQL Replica", aws: "RDS Read Replica", gcp: "Cloud SQL Replica" },
    info: {
      en: "A read-only copy of the primary database used to scale reads. Units are replicas; size is the instance class. Writes still go to the primary.",
      pt: "Uma cópia somente-leitura do banco primário usada para escalar leituras. As unidades são réplicas; o tamanho é a classe da instância. Escritas continuam indo ao primário.",
    },
    scaling: {
      unit: { en: "Replicas", pt: "Réplicas" },
      sizeMeaning: { en: "Instance class (vCPU / RAM)", pt: "Classe da instância (vCPU / RAM)" },
    },
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
  "semanticCache",
  "queue",
  "readReplica",
];
