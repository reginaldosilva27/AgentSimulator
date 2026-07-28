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
import { DEFAULT_CALL_SHAPE, DEFAULT_HIT_RATIO } from "./components";
import { COL, ROW, edge, node } from "./designKit";
import { equilibriumRps } from "./model";
import { DEFAULT_SLO_TARGETS } from "./slo";
import type { ArenaNode, ArenaState } from "./store";

export interface ArenaExample {
  id: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  /** 115 — the description's load story as TESTABLE data: the demanded rate the
   *  copy cites and the LLM tier's open-loop status at that demand. A test walks
   *  every preset and asserts these against the model, so copy can't go stale. */
  claims: { demandRps: number; llm: "healthy" | "warning" | "critical" };
  /** 119 — node-anchored explanation bubbles shown while this preset is loaded
   *  (≥2 per preset, one per node max; texts state MECHANISMS, not pinned
   *  figures, so future recalibrations don't stale them). */
  callouts: Array<{ nodeId: string; text: Record<Lang, string> }>;
  /** 121 — the Learn-topic ids this preset demonstrates, rendered as deep-link
   *  concept chips while it's loaded. Ids are validated by learnLinks.test.ts. */
  concepts?: readonly string[];
  build: () => Pick<ArenaState, "nodes" | "edges" | "users" | "thinkTimeSec">;
}

// 130 — the node/edge factories and the spacing constants now live in
// `designKit.ts`, shared with the challenge library (behaviour-preserving move).

const RAW_EXAMPLES: ArenaExample[] = [
  {
    id: "simple-rag",
    claims: { demandRps: 800, llm: "critical" },
    title: { en: "Simple RAG agent", pt: "Agente RAG simples" },
    description: {
      en: "16k users, 1 msg/20s (≈800 req/s). Each turn makes 2 LLM calls — one medium deployment (~150 calls/s of quota) saturates: the agent's wall.",
      pt: "16 mil usuários, 1 msg/20s (≈800 req/s). Cada turno faz 2 chamadas de LLM — um deployment médio (~150 chamadas/s de cota) satura: a parede do agente.",
    },
    callouts: [
      {
        nodeId: "client",
        text: {
          en: "16k users each sending 1 msg every 20s offer ≈800 req/s — Little's Law: users ÷ think time. Users and req/s are different units.",
          pt: "16 mil usuários mandando 1 msg a cada 20s ofertam ≈800 req/s — Lei de Little: usuários ÷ tempo entre mensagens. Usuários e req/s são unidades diferentes.",
        },
      },
      {
        nodeId: "llm",
        text: {
          en: "Each agent turn makes 2 model calls, and one deployment is a rate-limit quota block — the demand crushes it: THE wall agents hit first. Red = shedding 429s.",
          pt: "Cada turno do agente faz 2 chamadas ao modelo, e um deployment é um bloco de cota de rate limit — a demanda o esmaga: A parede que agentes batem primeiro. Vermelho = derrubando 429s.",
        },
      },
      {
        nodeId: "vectorDb",
        text: {
          en: "Retrieval is cheap next to the model: the vector DB idles while the LLM chokes. Scaling THIS box would fix nothing.",
          pt: "A recuperação é barata perto do modelo: o vector DB fica ocioso enquanto o LLM engasga. Escalar ESTA caixa não resolveria nada.",
        },
      },
      {
        // 123 — the harness is why the LLM QPS and the e2e latency are multiplied:
        // one user turn is N model calls. It runs in the backend, so it never
        // saturates itself — it makes the fan-out legible.
        nodeId: "harness",
        text: {
          en: "The agent loop runs IN the backend — not a tier you scale. It's here to show the fan-out: one user turn becomes 2 model calls, which is why the LLM QPS and the end-to-end latency read doubled.",
          pt: "O loop do agente roda NO backend — não é um tier que você escala. Está aqui para mostrar o fan-out: um turno de usuário vira 2 chamadas ao modelo, e é por isso que o QPS do LLM e a latência ponta-a-ponta aparecem dobrados.",
        },
      },
    ],
    build: () => ({
      users: 16_000,
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
    claims: { demandRps: 800, llm: "healthy" },
    title: { en: "Scale the LLM", pt: "Escalar o LLM" },
    description: {
      en: "Same 800 req/s, but the pool runs 4 XLarge deployments (a top quota tier, ×4) — the bottleneck clears. Quota tier × deployments is the lever.",
      pt: "Os mesmos 800 req/s, mas o pool roda 4 deployments XLarge (tier de cota alto, ×4) — o gargalo some. Tier de cota × deployments é a alavanca.",
    },
    callouts: [
      {
        nodeId: "llm",
        text: {
          en: "The lever: quota tier × deployments. 4 XLarge deployments multiply the pool's calls/s and the wall clears — same demand, no red.",
          pt: "A alavanca: tier de cota × deployments. 4 deployments XLarge multiplicam as chamadas/s do pool e a parede some — mesma demanda, sem vermelho.",
        },
      },
      {
        nodeId: "backend",
        text: {
          en: "Many containers, and NOT for CPU: every user holds a connection/SSE stream open for the whole multi-second turn — held streams size an agent backend.",
          pt: "Muitos containers, e NÃO por CPU: cada usuário segura uma conexão/stream SSE aberta o turno inteiro de vários segundos — streams seguradas dimensionam um backend de agente.",
        },
      },
    ],
    build: () => ({
      users: 16_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        // 118/127 — with realistic ~15s turns the backend HOLDS ~6.8k streams at
        // equilibrium, so it needs ~6 containers: the connection budget, not CPU, sizes it.
        node("backend", "backend", COL, ROW, { replicas: 6 }),
        node("llm", "llm", COL * 2, 0, { callsPerRequest: 2, size: "xlarge", replicas: 4 }),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2),
      ],
      edges: [edge("client", "backend"), edge("backend", "llm"), edge("backend", "vectorDb")],
    }),
  },
  {
    id: "rag-cache",
    claims: { demandRps: 200, llm: "healthy" },
    title: { en: "RAG with a cache", pt: "RAG com cache" },
    description: {
      en: "An API gateway fronts the POST path (a CDN would bypass it) and a cache serves repeat retrievals — only misses reach the vector DB.",
      pt: "Um API gateway na frente do caminho POST (um CDN daria bypass) e um cache serve leituras repetidas — só as falhas chegam ao vector DB.",
    },
    callouts: [
      {
        nodeId: "apigw",
        text: {
          en: "The managed front door: auth, quotas, rate limiting. A CDN would NOT help here — it bypasses dynamic POST calls like chat.",
          pt: "A porta de entrada gerenciada: auth, cotas, rate limiting. Um CDN NÃO ajudaria aqui — ele dá bypass em POSTs dinâmicos como o chat.",
        },
      },
      {
        nodeId: "cache",
        text: {
          en: "Repeat retrievals are served here; only the miss fraction continues. Raising the hit ratio is often cheaper than scaling the database behind it.",
          pt: "Leituras repetidas são servidas aqui; só a fração de misses segue adiante. Subir a taxa de acerto costuma sair mais barato que escalar o banco atrás.",
        },
      },
      {
        nodeId: "llm",
        text: {
          en: "4 deployments absorb 2 calls per turn comfortably — watch utilization here first when you raise the users slider.",
          pt: "4 deployments absorvem 2 chamadas por turno com folga — observe a utilização aqui primeiro ao subir o slider de usuários.",
        },
      },
    ],
    build: () => ({
      users: 4_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("apigw", "apiGateway", COL, ROW),
        node("backend", "backend", COL * 2, ROW, { replicas: 2 }),
        node("llm", "llm", COL * 3, 0, { callsPerRequest: 2, replicas: 4 }),
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
    claims: { demandRps: 100, llm: "healthy" },
    title: { en: "Agent with tools", pt: "Agente com tools" },
    description: {
      en: "The ReAct loop multiplies internal traffic: 100 user req/s become 300 LLM calls and 200 tool calls per second.",
      pt: "O loop ReAct multiplica o tráfego interno: 100 req/s de usuários viram 300 chamadas de LLM e 200 de tools por segundo.",
    },
    callouts: [
      {
        nodeId: "llm",
        text: {
          en: "The ReAct loop multiplies traffic: ×3 calls per request means 100 user req/s arrive here as 300 calls/s.",
          pt: "O loop ReAct multiplica o tráfego: ×3 chamadas por request significa que 100 req/s de usuários chegam aqui como 300 chamadas/s.",
        },
      },
      {
        nodeId: "mcp",
        text: {
          en: "Tools are hit twice per turn — external APIs and functions carry agent fan-out too, not just the model.",
          pt: "As tools são chamadas duas vezes por turno — APIs externas e functions também carregam o fan-out do agente, não só o modelo.",
        },
      },
      {
        nodeId: "vectorDb",
        text: {
          en: "Two retrievals per turn: the agent re-searches after reasoning. Internal traffic ≫ user traffic is the agent signature.",
          pt: "Duas recuperações por turno: o agente busca de novo depois de raciocinar. Tráfego interno ≫ tráfego de usuário é a assinatura do agente.",
        },
      },
    ],
    build: () => ({
      users: 2_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("backend", "backend", COL, ROW),
        node("llm", "llm", COL * 2, 0, { callsPerRequest: 3, replicas: 3 }),
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
    id: "semantic-cache",
    concepts: ["semantic-cache", "token-cost"],
    claims: { demandRps: 420, llm: "healthy" },
    title: { en: "Semantic cache shields the fleet", pt: "Cache semântico protege a frota" },
    description: {
      en: "8.4k users (≈420 req/s), 2 LLM calls/turn. A semantic cache answering ~30% of repeated questions is what keeps 6 deployments healthy — remove it and the same fleet saturates.",
      pt: "8,4 mil usuários (≈420 req/s), 2 chamadas de LLM por turno. Um cache semântico respondendo ~30% das perguntas repetidas é o que mantém 6 deployments saudáveis — sem ele, a mesma frota satura.",
    },
    callouts: [
      {
        nodeId: "semcache",
        text: {
          en: "Answers by embedding similarity: hits skip the model ENTIRELY. Honest hit rates are modest (~20–30%), and a loose threshold can serve a similar-but-WRONG answer.",
          pt: "Responde por similaridade de embeddings: acertos pulam o modelo POR COMPLETO. Taxas honestas são modestas (~20–30%), e um limiar frouxo pode servir uma resposta parecida porém ERRADA.",
        },
      },
      {
        nodeId: "llm",
        text: {
          en: "Only the ~70% misses reach this fleet — that shave is what keeps it healthy. Remove the cache and the same 6 deployments saturate.",
          pt: "Só os ~70% de misses chegam a esta frota — esse corte é o que a mantém saudável. Remova o cache e os mesmos 6 deployments saturam.",
        },
      },
    ],
    build: () => ({
      users: 8_400,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("backend", "backend", COL, ROW, { replicas: 3 }),
        // The third lever (112): hits skip the model entirely; only misses go on.
        node("semcache", "semanticCache", COL * 2, 0, { hitRatio: 0.3 }),
        node("llm", "llm", COL * 3, 0, { callsPerRequest: 2, replicas: 6 }),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2),
      ],
      edges: [
        edge("client", "backend"),
        edge("backend", "semcache"),
        edge("semcache", "llm"),
        edge("backend", "vectorDb"),
      ],
    }),
  },
  {
    id: "prod",
    claims: { demandRps: 600, llm: "healthy" },
    title: { en: "Production shape", pt: "Formato de produção" },
    description: {
      en: "12k users (≈600 req/s) through gateway + LB, replicated backend, an AI Gateway routing 2 LLM pools, cache + vector DB.",
      pt: "12 mil usuários (≈600 req/s) por gateway + LB, backend replicado, AI Gateway roteando 2 pools de LLM, cache + vector DB.",
    },
    callouts: [
      {
        nodeId: "aigw",
        text: {
          en: "The LLM router: splits calls across the pools behind it, so their quotas ADD UP. Its QPS reads ~2× the backend's because each turn makes 2 model calls.",
          pt: "O roteador de LLM: divide as chamadas entre os pools atrás dele, então as cotas SOMAM. O QPS aqui lê ~2× o do backend porque cada turno faz 2 chamadas ao modelo.",
        },
      },
      {
        nodeId: "llm2",
        text: {
          en: "A separate box = a separate pool: different region, its own quota and failure domain. The gateway fails over between them.",
          pt: "Uma caixa separada = um pool separado: outra região, cota e domínio de falha próprios. O gateway faz failover entre eles.",
        },
      },
      {
        nodeId: "backend",
        text: {
          en: "Replicated behind the LB — but check its In-flight row, not just CPU: it holds every user's stream for the whole turn.",
          pt: "Replicado atrás do LB — mas olhe a linha In-flight, não só a CPU: ele segura o stream de cada usuário o turno inteiro.",
        },
      },
    ],
    build: () => ({
      users: 12_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        node("apigw", "apiGateway", COL, ROW),
        node("lb", "loadBalancer", COL * 2, ROW),
        node("backend", "backend", COL * 3, ROW, { replicas: 5 }),
        node("aigw", "aiGateway", COL * 4, ROW * 0.4, { callsPerRequest: 2 }),
        // Two POOLS in different US regions (106/116) — the split is resilience/
        // latency intent, which the gateway routes across.
        node("llm1", "llm", COL * 5, 0, { size: "large", replicas: 3, region: "us-east" }),
        node("llm2", "llm", COL * 5, ROW, { size: "large", replicas: 3, region: "us-west" }),
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
    claims: { demandRps: 1667, llm: "healthy" },
    title: { en: "100k users", pt: "100 mil usuários" },
    description: {
      en: "100k concurrent users at 1 msg/min ≈ 1,667 req/s (Little's Law). An AI Gateway spreads ~3,300 LLM calls/s across a fleet of 4 pools × 2 XLarge deployments in 4 US regions.",
      pt: "100 mil usuários simultâneos a 1 msg/min ≈ 1.667 req/s (Lei de Little). Um AI Gateway espalha ~3.300 chamadas de LLM/s por uma frota de 4 pools × 2 deployments XLarge em 4 regiões dos EUA.",
    },
    callouts: [
      {
        nodeId: "client",
        text: {
          en: "100k concurrent users at 1 msg/min ≈ 1,667 req/s — Little's Law is what makes '100k users' servable at all.",
          pt: "100 mil usuários simultâneos a 1 msg/min ≈ 1.667 req/s — a Lei de Little é o que torna '100 mil usuários' atendíveis.",
        },
      },
      {
        nodeId: "aigw",
        text: {
          en: "One endpoint, four pools: the gateway spreads ~2× the user rate in model calls across the fleet, and their regional quotas add up.",
          pt: "Um endpoint, quatro pools: o gateway espalha ~2× a taxa de usuários em chamadas de modelo pela frota, e as cotas regionais somam.",
        },
      },
      {
        nodeId: "backend",
        text: {
          en: "Many containers at single-digit CPU: tens of thousands of held SSE streams (In-flight row) — memory and connections, not CPU, size agent backends.",
          pt: "Muitos containers com CPU de um dígito: dezenas de milhares de streams SSE seguradas (linha In-flight) — memória e conexões, não CPU, dimensionam backends de agente.",
        },
      },
      {
        nodeId: "llm3",
        text: {
          en: "Four US regions = four separate quota budgets. Stack all 8 deployments in one region and the regional cap would squeeze them.",
          pt: "Quatro regiões dos EUA = quatro orçamentos de cota separados. Empilhe os 8 deployments numa região só e a cota regional os apertaria.",
        },
      },
    ],
    build: () => ({
      users: 100_000,
      thinkTimeSec: 60,
      nodes: [
        node("client", "client", 0, ROW * 1.5),
        // 118/127 — ~20 containers at ~5% CPU: held streams (~24k across ~19s
        // turns), not QPS, size an agent backend.
        node("backend", "backend", COL, ROW * 1.5, { replicas: 20 }),
        node("aigw", "aiGateway", COL * 2, ROW * 1.5, { callsPerRequest: 2 }),
        // Four POOLS across four US regions (106/116) — the fleet the gateway routes.
        node("llm1", "llm", COL * 3, 0, { size: "xlarge", replicas: 2, region: "us-east" }),
        node("llm2", "llm", COL * 3, ROW, { size: "xlarge", replicas: 2, region: "us-east-2" }),
        node("llm3", "llm", COL * 3, ROW * 2, { size: "xlarge", replicas: 2, region: "us-central" }),
        node("llm4", "llm", COL * 3, ROW * 3, { size: "xlarge", replicas: 2, region: "us-west" }),
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
  {
    // 125-arena-component-expansion — two lessons in one design: the guardrails
    // moderation TOLL (a per-call latency tax on the model path) and the queue
    // DECOUPLING (async ingestion drains off the request path, so the worker's
    // heavy service time never reaches the user).
    id: "guardrails-async",
    concepts: ["guardrails", "event-driven"],
    claims: { demandRps: 200, llm: "healthy" },
    title: { en: "Guardrails + async ingestion", pt: "Guardrails + ingestão assíncrona" },
    description: {
      en: "4k users (≈200 req/s). Guardrails moderate every turn (a latency toll), and document ingestion runs async behind a queue — its worker's heavy jobs never touch the user-facing turn.",
      pt: "4 mil usuários (≈200 req/s). Guardrails moderam cada turno (um pedágio de latência), e a ingestão de documentos roda assíncrona atrás de uma fila — os jobs pesados do worker nunca tocam o turno do usuário.",
    },
    callouts: [
      {
        nodeId: "guard",
        text: {
          en: "Moderation runs on every turn (input + output) — it forwards everything but adds latency each time. A guardrail is never free: you pay for it on the turn path.",
          pt: "A moderação roda a cada turno (entrada + saída) — repassa tudo mas adiciona latência sempre. Um guardrail nunca é grátis: você paga no caminho do turno.",
        },
      },
      {
        nodeId: "worker",
        text: {
          en: "Ingestion drains a queue OFF the request path: this worker's heavy jobs are async, so their latency never reaches the user — only the enqueue does. Oversize it and it grows a backlog, not 429s.",
          pt: "A ingestão consome uma fila FORA do caminho da requisição: os jobs pesados deste worker são assíncronos, então sua latência nunca chega ao usuário — só o enfileiramento chega. Se ficar pequeno, acumula fila, não 429.",
        },
      },
      {
        nodeId: "mem",
        text: {
          en: "The agent's long-term memory: a read at the start of the turn and a write at the end (×2 per request) — distinct from retrieval (vector DB) and the system of record (app DB).",
          pt: "A memória de longo prazo do agente: uma leitura no início do turno e uma escrita no fim (×2 por request) — diferente da recuperação (vector DB) e da fonte da verdade (app DB).",
        },
      },
    ],
    build: () => ({
      users: 4_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW * 1.5),
        node("backend", "backend", COL, ROW * 1.5, { replicas: 2 }),
        // Moderation on the model path — a leaf hit twice per turn (in + out).
        node("guard", "guardrails", COL * 2, 0, { callsPerRequest: 2 }),
        node("llm", "llm", COL * 2, ROW, { callsPerRequest: 2, replicas: 6 }),
        node("vectorDb", "vectorDb", COL * 2, ROW * 2),
        // Long-term memory: read at turn start + write at turn end.
        node("mem", "memoryStore", COL * 2, ROW * 3, { callsPerRequest: 2 }),
        // Async ingestion pipeline: the queue decouples, the worker drains it.
        node("queue", "queue", COL * 2, ROW * 4),
        node("worker", "worker", COL * 3, ROW * 4, { replicas: 2 }),
      ],
      edges: [
        edge("client", "backend"),
        edge("backend", "guard"),
        edge("backend", "llm"),
        edge("backend", "vectorDb"),
        edge("backend", "mem"),
        edge("backend", "queue"),
        edge("queue", "worker"),
      ],
    }),
  },
  {
    // 116 AC5 — the quota lesson, part 1: two pools STACKED in one region share
    // the regional quota (subscription-level, not per-deployment) — provisioned
    // 4,800 calls/s of raw capacity, capped at 3,000, shedding under 3,200.
    id: "regional-quota",
    concepts: ["token-cost", "llm-gateway"],
    claims: { demandRps: 1600, llm: "critical" },
    title: { en: "Regional quota bites", pt: "A cota regional aperta" },
    description: {
      en: "32k users (≈1,600 req/s → 3,200 LLM calls/s). Both pools sit in us-east, so their quotas DON'T add up — the region caps them and requests shed as 429s.",
      pt: "32 mil usuários (≈1.600 req/s → 3.200 chamadas de LLM/s). Os dois pools estão em us-east, então as cotas NÃO somam — a região limita os dois e requests caem como 429.",
    },
    callouts: [
      {
        nodeId: "llm1",
        text: {
          en: "Both pools sit in us-east, and the quota is per REGION (subscription-level TPM): provisioned capacity above the cap simply doesn't exist — both squeeze and shed 429s.",
          pt: "Os dois pools estão em us-east, e a cota é por REGIÃO (TPM da assinatura): capacidade provisionada acima do teto simplesmente não existe — ambos são apertados e derrubam 429s.",
        },
      },
      {
        nodeId: "aigw",
        text: {
          en: "The router can't create capacity the region won't grant — splitting load between two capped pools doesn't help.",
          pt: "O roteador não cria capacidade que a região não concede — dividir a carga entre dois pools limitados não ajuda.",
        },
      },
    ],
    build: () => ({
      users: 32_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        // 118/127 — matches the multi-region twin's backend (12): the ONLY move
        // between the pair is the region split. (It sheds, so its held is null and
        // the 118 budget test skips it — the count is kept equal for the narrative.)
        node("backend", "backend", COL, ROW, { replicas: 12 }),
        node("aigw", "aiGateway", COL * 2, ROW, { callsPerRequest: 2 }),
        // Same subscription, same region — the quota pool is shared.
        node("llm1", "llm", COL * 3, ROW * 0.3, { size: "xlarge", replicas: 4 }),
        node("llm2", "llm", COL * 3, ROW * 1.7, { size: "xlarge", replicas: 4 }),
      ],
      edges: [
        edge("client", "backend"),
        edge("backend", "aigw"),
        edge("aigw", "llm1"),
        edge("aigw", "llm2"),
      ],
    }),
  },
  {
    // 116 AC5 — part 2: the SAME 8 deployments, same demand — moving one pool to
    // us-west gives each pool its own regional quota and the shedding stops.
    id: "multi-region",
    concepts: ["stateless-scaling", "token-cost"],
    claims: { demandRps: 1600, llm: "healthy" },
    title: { en: "Escape across regions", pt: "Escapar por regiões" },
    description: {
      en: "Same 32k users, same 8 deployments — one pool moved to us-west. Each region now has its own quota headroom: no 429s, the fleet breathes.",
      pt: "Os mesmos 32 mil usuários, os mesmos 8 deployments — um pool movido para us-west. Cada região agora tem sua própria folga de cota: sem 429, a frota respira.",
    },
    callouts: [
      {
        nodeId: "llm2",
        text: {
          en: "The ONLY change vs the previous preset: this pool moved to us-west, earning its own regional quota — the same 8 deployments now breathe.",
          pt: "A ÚNICA mudança vs o preset anterior: este pool foi para us-west, ganhando sua própria cota regional — os mesmos 8 deployments agora respiram.",
        },
      },
      {
        nodeId: "llm1",
        text: {
          en: "Alone in us-east, comfortably under the regional cap. Spreading regions is how real fleets escape quota walls.",
          pt: "Sozinho em us-east, com folga sob o teto regional. Espalhar regiões é como frotas reais escapam de paredes de cota.",
        },
      },
    ],
    build: () => ({
      users: 32_000,
      thinkTimeSec: 20,
      nodes: [
        node("client", "client", 0, ROW),
        // 118/127 — ~0.9k req/s of ~15s turns ≈ 13.6k held streams → 12 containers.
        node("backend", "backend", COL, ROW, { replicas: 12 }),
        node("aigw", "aiGateway", COL * 2, ROW, { callsPerRequest: 2 }),
        node("llm1", "llm", COL * 3, ROW * 0.3, { size: "xlarge", replicas: 4 }),
        node("llm2", "llm", COL * 3, ROW * 1.7, { size: "xlarge", replicas: 4, region: "us-west" }),
      ],
      edges: [
        edge("client", "backend"),
        edge("backend", "aigw"),
        edge("aigw", "llm1"),
        edge("aigw", "llm2"),
      ],
    }),
  },
];

/**
 * 123 — insert the Agent Harness between the backend and everything it calls:
 * reparent every `backend → X` edge to `harness → X`, add `backend → harness`,
 * and shift the boxes to the backend's right by one column so the new box has
 * room. Design A (display-only): the harness is latency-0 / capacity-∞ and lives
 * in the backend's region, so EVERY reported number stays identical — this is a
 * pure legibility overlay applied uniformly to the whole preset library.
 */
function withHarness(
  d: Pick<ArenaState, "nodes" | "edges" | "users" | "thinkTimeSec">,
): Pick<ArenaState, "nodes" | "edges" | "users" | "thinkTimeSec"> {
  const backend = d.nodes.find((n) => n.kind === "backend");
  if (!backend) return d; // no agent tier → nothing to front (defensive)
  const HARNESS_ID = "harness";
  const nodes: ArenaNode[] = d.nodes.map((n) => (n.x > backend.x ? { ...n, x: n.x + COL } : n));
  nodes.push(
    node(
      HARNESS_ID,
      "agentHarness",
      backend.x + COL,
      backend.y,
      // Same region as the backend it runs in — so no fictional cross-region hop
      // is introduced (114) and the e2e latency stays byte-identical.
      backend.region ? { region: backend.region } : {},
    ),
  );
  const edges = d.edges.map((e) =>
    e.source === backend.id
      ? { ...e, id: `${HARNESS_ID}-${e.target}`, source: HARNESS_ID }
      : e,
  );
  edges.push(edge(backend.id, HARNESS_ID));
  return { ...d, nodes, edges };
}

/** The preset library, each design fronted by the Agent Harness (123). */
export const EXAMPLES: ArenaExample[] = RAW_EXAMPLES.map((ex) => ({
  ...ex,
  build: () => withHarness(ex.build()),
}));

/** The sample loaded on a first visit (empty localStorage). */
export const DEFAULT_EXAMPLE_ID = "simple-rag";

export function defaultDesign(): ArenaState {
  const ex = EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID) ?? EXAMPLES[0];
  const d = ex.build();
  // 110 — the effective rate is the closed-loop equilibrium, not the raw demand.
  return {
    ...d,
    offeredLoad: Math.round(
      equilibriumRps({ nodes: d.nodes, edges: d.edges }, d.users, d.thinkTimeSec),
    ),
    dismissedNudges: [],
    callShape: DEFAULT_CALL_SHAPE,
    // 129 — the measured defaults: this sample is chosen to FAIL latency +
    // headroom (and meet shed, honestly), so the panel teaches on first visit.
    sloTargets: { ...DEFAULT_SLO_TARGETS },
    // 130 — a first visit lands in the free sandbox, never mid-challenge.
    challengeId: null,
    sandbox: null,
    referenceShown: false,
  };
}
