// Visual model of the architecture: stations (the moving parts), grouped into
// tiers (deployable containers), connected by network hops (with protocols),
// all sitting inside a private network boundary (VNet / VPC).
//
// The model is cloud-agnostic: every tier/station/hop carries a `generic` role
// (the thing that matters, translatable) plus a `clouds` map of concrete
// example services per provider (Azure / AWS / GCP — proper nouns, not
// translated). The active provider is chosen in lib/cloud.ts; use `cloudValue`
// to resolve a label for it.
//
// Translatable prose is written as `{ en, pt }`; values identical in every
// language (code, protocols, proper nouns) stay plain strings. Use the
// `*For(lang)` builders to get fully-resolved, plain-string structures; results
// are cached per language so references stay stable across renders.

import type { Lang } from "../i18n";
import type { Stage } from "../types/events";
import type { CloudMap } from "./cloud";
// 061-scenario-builder: the visual model is driven by the à-la-carte selection
// (`ResolvedSelection`), not a single rung. `Maturity` (aliased `Scenario` here) and
// `Runtime` come from the selection module; the `scenarios[]`/`tracks[]` fields on
// stations are kept as the maturity-floor + palette-category vocabulary.
import type { Maturity as Scenario, ResolvedSelection, Runtime } from "./selection";
import type { Track } from "./track";

export type StationId =
  | "frontend"
  // 088-network-layer — the real ingress chain (one station per appliance), shown
  // only when the `network` Build component is on. Each owns exactly one Stage.
  | "dns"
  | "cdn"
  | "waf"
  | "lb"
  | "apigw"
  | "backend"
  | "agent"
  | "rag"
  | "pageindex" // 056-ragless-pageindex — reasoning-based retrieval box (owns pageindex.*)
  // 033-ingestion-node + 080-ingestion-pipeline-merge — the offline indexer. Owns the
  // whole upload write-path: storage.upload (durable object write, its "Object store"
  // phase, 034) → chunk → tokenize → embed → metadata → store. The standalone Object
  // Storage node was folded in here (080); it is now a phase in the ingestion drill-in.
  | "ingestion"
  | "mcp"
  | "llm"
  | "database"
  // 008-scenario-framework preview nodes (non-executing until their own spec):
  // (054-rag-block-expansion folded the reranker into the `rag` station — it owns
  // `rag.rerank` as a query-time sub-stage, shown in the RAG drill-in, not a tile.)
  | "gateway" // advanced — AI-Ops tier
  | "guardrails"
  | "cache"
  | "eval"
  | "observability"
  // Advanced-rung sub-agents (multi-agent preview): the orchestrator is the
  // relabelled `agent` node; these are the workers it delegates to. Non-executing
  // previews (label only) until a real multi-agent runtime ships in its own spec.
  | "researcher"
  | "coder"
  | "critic"
  // 060-intermediate-preview-tiles — the Intermediate rung's preview tile lighting up
  // its 059 `agent` track: `summarization` (Agent Design, under the agent), non-executing
  // (`stages: []`). (The `hybrid` tile was removed in 070 — hybrid search is now the
  // `rag.hybrid` sub-stage of the `rag` station, not a tile.)
  | "summarization";
export type TierId = "client" | "edge" | "api" | "agent" | "services" | "aiops";
export type NetworkZone = "public" | "private";

// Every element belongs to one or more rungs of the maturity ladder. Base
// elements (today's app) live in all three; a missing `scenarios` defaults to
// this set so existing data needs no annotation.
const ALL_SCENARIOS: Scenario[] = ["simple", "intermediate", "advanced"];

/** A translatable string: either identical across languages, or per-language. */
type Tr = string | { en: string; pt: string };
const r = (v: Tr, lang: Lang): string => (typeof v === "string" ? v : v[lang]);

// --- Resolved (public) types — what components consume, all plain strings ----

export interface TechRow {
  k: string;
  v: string;
}

export interface StationMeta {
  id: StationId;
  tier: TierId;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  tag: string; // tiny pill shown on the node, at-a-glance tech
  blurb: string; // what this station does
  // 028-why-this-layer: why the layer is its own thing, and the concrete failure
  // mode if it were removed or merged. Authored on the executing stations;
  // preview nodes may omit them (nothing depends on it there).
  why?: string;
  whatBreaks?: string;
  generic: string; // cloud-agnostic role (the thing that matters)
  clouds: CloudMap; // concrete example service per provider
  tech: TechRow[];
  stages: Stage[];
  position: { x: number; y: number };
  // Maturity-ladder membership (008). A preview node (`comingSoon`) carries no
  // live `stages` — nothing fakes a run on it.
  scenarios: Scenario[];
  comingSoon?: boolean;
  // Track (theme) membership — 059-scenario-tracks. Only consulted for
  // `comingSoon` previews: a track filter may hide a preview whose `tracks`
  // exclude the active theme. Omitted ⇒ all themes (a cross-cutting base node,
  // never hidden by any track). Flows through `StationSrc` automatically.
  tracks?: Track[];
}

export interface TierMeta {
  id: TierId;
  title: string;
  alias: string; // canonical n-tier name (Presentation / Application / Data …)
  generic: string; // cloud-agnostic description
  clouds: CloudMap; // example: what hosts this container/tier per provider
  accent: string;
  box: { x: number; y: number; w: number; h: number };
  scenarios: Scenario[];
  comingSoon?: boolean;
}

// How a hop communicates: a blocking request/response, or an asynchronous
// streamed response. The two streaming-capable hops (frontend↔backend and
// agent→llm) flip to "sync" under batch delivery — the canvas overrides them.
export type HopComm = "sync" | "async";

export interface HopMeta {
  source: StationId;
  target: StationId;
  label: string; // short label on the edge
  protocol: string; // full protocol description (inspector)
  detail: string;
  comm: HopComm; // sync (blocking) vs async (streamed) — default for stream mode
  secure: boolean; // draw a lock
  zone: NetworkZone; // public internet vs inside the private network
  controls: string; // network/security controls on this hop (WAF, mTLS, …)
  // 086-hop-detail-enrichment — the role + reasoning behind this communication
  // (why this protocol/zone, what it does, what would break). Rendered in the hop
  // detail under the theory. Optional in the type; authored for every real hop.
  why?: string;
  // Which node handles the edge attaches to (the API↔Agent hop is vertical).
  sourceHandle: "right" | "bottom";
  targetHandle: "left" | "top";
  scenarios: Scenario[];
}

export interface BoundaryMeta {
  id: string;
  label: string; // e.g. "Private network"
  generic: string;
  clouds: CloudMap; // VNet / VPC / VPC
  accent: string;
  box: { x: number; y: number; w: number; h: number };
}

// 032-network-boundary — the public-internet / egress frontier between the public
// client tier and the private interior. Unlike the private boundary it is
// **cloud-generic**: no `clouds` map, so its label never changes with the active
// provider (edge controls already live on the client tier + the frontend→backend
// hop). Geometry is computed in layout.ts.
export interface PublicFrontierMeta {
  id: string;
  label: string;
}

// --- Source data (translatable fields as `Tr`) -------------------------------

interface TechRowSrc {
  k: Tr;
  v: string;
}
type StationSrc = Omit<
  StationMeta,
  "title" | "subtitle" | "blurb" | "why" | "whatBreaks" | "generic" | "tech" | "scenarios"
> & {
  title: Tr;
  subtitle: Tr;
  blurb: Tr;
  why?: Tr;
  whatBreaks?: Tr;
  generic: Tr;
  tech: TechRowSrc[];
  scenarios?: Scenario[]; // omitted ⇒ ALL_SCENARIOS (base element, in every rung)
};
type TierSrc = Omit<TierMeta, "title" | "alias" | "generic" | "scenarios"> & {
  title: Tr;
  alias: Tr;
  generic: Tr;
  scenarios?: Scenario[];
};
type HopSrc = Omit<
  HopMeta,
  "label" | "protocol" | "detail" | "controls" | "why" | "scenarios"
> & {
  label: Tr;
  protocol: Tr;
  detail: Tr;
  controls: Tr;
  why?: Tr;
  scenarios?: Scenario[];
};
type BoundarySrc = Omit<BoundaryMeta, "label" | "generic"> & { label: Tr; generic: Tr };

// Tiers = separate deployable units (containers). Network crosses their borders.
// `alias` is the canonical n-tier name so the friendly label stays market-aligned.
const TIERS_SRC: TierSrc[] = [
  {
    id: "client",
    title: { en: "Client Tier", pt: "Camada Cliente" },
    alias: { en: "Presentation", pt: "Apresentação" },
    generic: { en: "Static hosting / CDN + WAF", pt: "Hospedagem estática / CDN + WAF" },
    clouds: {
      azure: "Azure Static Web Apps + Front Door",
      aws: "S3 + CloudFront + WAF",
      gcp: "Cloud Storage + Cloud CDN + Cloud Armor",
    },
    accent: "var(--color-sky)",
    box: { x: 8, y: 64, w: 272, h: 196 },
  },
  // 088-network-layer — the real ingress chain (DNS · CDN · TLS/LB · WAF · API-GW).
  // 090-waf-after-lb: the LB terminates TLS before the WAF inspects the plaintext.
  // A public-zone tier between the client and the private API; shown only when the
  // `network` Build component is on. Each station is a separately-deployed appliance
  // container the request truly transits.
  {
    id: "edge",
    title: { en: "Network Edge", pt: "Borda de Rede" },
    alias: { en: "Ingress / edge", pt: "Ingresso / borda" },
    generic: {
      en: "DNS, CDN, load balancer, WAF and API gateway",
      pt: "DNS, CDN, balanceador, WAF e API gateway",
    },
    clouds: {
      azure: "Azure DNS · Front Door · App Gateway · WAF · API Management",
      aws: "Route 53 · CloudFront · ALB · WAF · API Gateway",
      gcp: "Cloud DNS · Cloud CDN · Cloud LB · Cloud Armor · API Gateway",
    },
    accent: "var(--color-sky)",
    box: { x: 312, y: 64, w: 240, h: 586 },
    scenarios: ["advanced"],
  },
  {
    id: "api",
    title: { en: "API Tier", pt: "Camada de API" },
    alias: { en: "Application", pt: "Aplicação" },
    generic: { en: "Containerized web service", pt: "Serviço web em container" },
    clouds: {
      azure: "Azure Container Apps (public ingress)",
      aws: "App Runner / ECS Fargate + ALB",
      gcp: "Cloud Run (HTTPS LB)",
    },
    accent: "var(--color-violet)",
    box: { x: 312, y: 64, w: 272, h: 196 },
  },
  {
    id: "agent",
    title: { en: "Agent Tier", pt: "Camada do Agente" },
    alias: { en: "Compute (private)", pt: "Compute (privado)" },
    generic: { en: "Private agent runtime service", pt: "Serviço de runtime privado do agente" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private subnet)",
      gcp: "Cloud Run (internal ingress)",
    },
    accent: "var(--color-pink)",
    box: { x: 312, y: 320, w: 272, h: 320 },
  },
  {
    id: "services",
    title: { en: "AI & Data Services", pt: "Serviços de IA e Dados" },
    alias: { en: "Data tier", pt: "Camada de dados" },
    generic: { en: "Managed AI + databases", pt: "IA gerenciada + bancos de dados" },
    clouds: {
      azure: "Azure OpenAI · AI Search · SQL",
      aws: "Bedrock · OpenSearch · RDS",
      gcp: "Vertex AI · Vector Search · Cloud SQL",
    },
    accent: "var(--color-ok)",
    box: { x: 956, y: 64, w: 300, h: 586 },
  },
  // 008-scenario-framework: the "AI Ops" tier the assessment called for — the
  // control + observability plane of a production agent. Advanced rung only;
  // its nodes are previews (coming soon) until their own specs land.
  {
    id: "aiops",
    title: { en: "AI Ops", pt: "Operações de IA" },
    alias: { en: "Observability & control plane", pt: "Plano de observabilidade e controle" },
    generic: {
      en: "Gateway, guardrails, cache, evals and observability",
      pt: "Gateway, guardrails, cache, evals e observabilidade",
    },
    clouds: {
      azure: "API Management · AI Content Safety · Monitor",
      aws: "API Gateway · Bedrock Guardrails · CloudWatch",
      gcp: "Apigee · Model Armor · Cloud Monitoring",
    },
    accent: "var(--color-warn)",
    box: { x: 1320, y: 64, w: 300, h: 586 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
];

// The private network (VNet / VPC) that wraps every tier except the public
// client — drawn as a boundary behind the tier boxes.
const BOUNDARY_SRC: BoundarySrc = {
  id: "vnet",
  label: { en: "Private network", pt: "Rede privada" },
  generic: { en: "Private network (VNet / VPC)", pt: "Rede privada (VNet / VPC)" },
  clouds: {
    azure: "Azure Virtual Network (VNet)",
    aws: "AWS VPC",
    gcp: "Google Cloud VPC",
  },
  accent: "var(--color-accent)",
  box: { x: 298, y: 6, w: 972, h: 656 },
};

// 032-network-boundary — the public-internet / egress frontier. Generic only:
// no `clouds` map, so the label is identical in every cloud (AC2).
const PUBLIC_BOUNDARY_SRC: { id: string; label: Tr } = {
  id: "public-internet",
  label: { en: "Public internet / egress", pt: "Internet pública / egress" },
};

const STATIONS_SRC: StationSrc[] = [
  {
    id: "frontend",
    tier: "client",
    title: "Frontend",
    subtitle: { en: "React UI · browser", pt: "UI React · navegador" },
    icon: "🖥️",
    accent: "var(--color-sky)",
    tag: "TLS 1.3",
    blurb: {
      en: "Runs in the user's browser. It POSTs the message over HTTPS and holds open a Server-Sent Events connection, rendering each stage — and the streamed answer — as events arrive.",
      pt: "Roda no navegador do usuário. Envia a mensagem via POST sobre HTTPS e mantém aberta uma conexão Server-Sent Events, renderizando cada etapa — e a resposta transmitida — conforme os eventos chegam.",
    },
    why: {
      en: "The UI is kept thin and client-side so a CDN can serve it globally while every secret and decision stays on the server — the browser is the only piece running on the user's device.",
      pt: "A UI é mantida fina e client-side para uma CDN servi-la globalmente enquanto todo segredo e decisão ficam no servidor — o navegador é a única peça rodando no dispositivo do usuário.",
    },
    whatBreaks: {
      en: "Put logic or keys in the browser and anyone can read them from devtools. Honest caveat: this demo has no real authentication — it is a stub; production needs login, sessions and rate limiting before the agent ever runs.",
      pt: "Coloque lógica ou chaves no navegador e qualquer um as lê pelo devtools. Ressalva honesta: esta demo não tem autenticação real — é um stub; produção precisa de login, sessões e rate limiting antes de o agente rodar.",
    },
    generic: { en: "Browser SPA on static hosting + CDN", pt: "SPA no navegador em hosting estático + CDN" },
    clouds: {
      azure: "Azure Static Web Apps",
      aws: "S3 + CloudFront",
      gcp: "Cloud Storage + Cloud CDN",
    },
    tech: [
      { k: { en: "runtime", pt: "runtime" }, v: "React + Vite (browser)" },
      { k: { en: "request", pt: "requisição" }, v: "POST /api/chat" },
      { k: { en: "payload", pt: "payload" }, v: "application/json" },
      { k: { en: "response", pt: "resposta" }, v: "text/event-stream (SSE)" },
      { k: { en: "security", pt: "segurança" }, v: "HTTPS · TLS 1.3" },
    ],
    stages: ["frontend", "respond"],
    position: { x: 40, y: 112 },
  },
  // 088-network-layer — the five real ingress appliances (Advanced rung), in transit
  // order. Each is a separately-deployed Docker container the request truly crosses;
  // its stage carries only what the appliance's forwarded headers prove.
  {
    id: "dns",
    tier: "edge",
    title: "DNS",
    subtitle: { en: "Name resolution", pt: "Resolução de nomes" },
    icon: "🧭",
    accent: "var(--color-sky)",
    tag: "CoreDNS",
    blurb: {
      en: "Resolves the service name to an address before any connection is made — returning an A record and a TTL that says how long the answer may be cached.",
      pt: "Resolve o nome do serviço para um endereço antes de qualquer conexão — retornando um registro A e um TTL que diz por quanto tempo a resposta pode ser cacheada.",
    },
    why: {
      en: "Nothing can be reached by name until DNS resolves it to an IP; the TTL lets resolvers cache the answer so every request doesn't pay a lookup. Here a real CoreDNS resolves the chain's internal service names.",
      pt: "Nada é alcançado por nome até o DNS resolvê-lo para um IP; o TTL deixa os resolvers cachearem a resposta para nem toda requisição pagar uma consulta. Aqui um CoreDNS real resolve os nomes internos da cadeia.",
    },
    whatBreaks: {
      en: "With no resolver, clients must hardcode IPs — every redeploy breaks them. Honest caveat: the browser still uses the host's resolver; CoreDNS resolves the chain's internal hops, not the user's lookup.",
      pt: "Sem resolver, clientes precisam fixar IPs — todo redeploy os quebra. Ressalva honesta: o navegador ainda usa o resolver do host; o CoreDNS resolve os hops internos da cadeia, não a consulta do usuário.",
    },
    generic: { en: "DNS resolver", pt: "Resolvedor DNS" },
    clouds: { azure: "Azure DNS", aws: "Route 53", gcp: "Cloud DNS" },
    tech: [
      { k: { en: "server", pt: "servidor" }, v: "CoreDNS" },
      { k: { en: "record", pt: "registro" }, v: "A / AAAA + TTL" },
    ],
    stages: ["dns"],
    position: { x: 312, y: 112 },
    scenarios: ["advanced"],
  },
  {
    id: "cdn",
    tier: "edge",
    title: { en: "CDN / Cache", pt: "CDN / Cache" },
    subtitle: { en: "Edge cache", pt: "Cache de borda" },
    icon: "⚡",
    accent: "var(--color-blue)",
    tag: "Varnish",
    blurb: {
      en: "An edge cache in front of the app. A cacheable GET can be a HIT (served from the edge) or a MISS (fetched from origin); the dynamic chat API is uncacheable, so it is always a BYPASS — passed straight through. The X-Cache header says which happened.",
      pt: "Um cache de borda na frente da app. Um GET cacheável pode ser HIT (servido da borda) ou MISS (buscado na origem); a API de chat dinâmica é não-cacheável, então é sempre um BYPASS — passada direto. O header X-Cache diz qual ocorreu.",
    },
    why: {
      en: "Caching cacheable responses at the edge cuts latency and offloads the origin — the app never recomputes what the cache can already answer. The chat API is dynamic and uncacheable, so the CDN never caches it (a BYPASS, not a coincidental MISS); a static GET could still be a real HIT. A real Varnish reports the decision here.",
      pt: "Cachear respostas cacheáveis na borda corta a latência e alivia a origem — a app nunca recomputa o que o cache já responde. A API de chat é dinâmica e não-cacheável, então a CDN nunca a cacheia (um BYPASS, não um MISS por acaso); um GET estático ainda poderia ser um HIT real. Um Varnish real reporta a decisão aqui.",
    },
    whatBreaks: {
      en: "Without a cache every request hits the origin, so a traffic spike becomes an origin overload. Honest caveat: this is a single edge cache, not a geo-distributed CDN with many PoPs.",
      pt: "Sem cache toda requisição bate na origem, então um pico de tráfego vira sobrecarga da origem. Ressalva honesta: é um único cache de borda, não um CDN geo-distribuído com vários PoPs.",
    },
    generic: { en: "CDN / edge cache", pt: "CDN / cache de borda" },
    clouds: { azure: "Azure CDN / Front Door", aws: "CloudFront", gcp: "Cloud CDN" },
    tech: [
      { k: { en: "cache", pt: "cache" }, v: "Varnish" },
      { k: { en: "signal", pt: "sinal" }, v: "X-Cache: HIT / MISS / BYPASS" },
    ],
    stages: ["cdn"],
    position: { x: 312, y: 220 },
    scenarios: ["advanced"],
  },
  {
    id: "lb",
    tier: "edge",
    title: { en: "TLS / Load Balancer", pt: "TLS / Balanceador" },
    subtitle: { en: "Terminate TLS · balance", pt: "Terminar TLS · balancear" },
    icon: "⚖️",
    accent: "var(--color-violet)",
    tag: "HAProxy",
    blurb: {
      en: "Terminates TLS (decrypts HTTPS) and balances the request onto a backend upstream, adding X-Forwarded-* headers so the app still sees the real client and scheme. As the single decryption point, it sits before the WAF — which can only inspect plaintext.",
      pt: "Termina o TLS (descriptografa o HTTPS) e balanceia a requisição para um upstream do backend, adicionando headers X-Forwarded-* para a app ainda ver o cliente e o esquema reais. Como único ponto de decriptação, fica antes do WAF — que só inspeciona texto claro.",
    },
    why: {
      en: "One place terminates TLS and spreads load so backends stay simple and replaceable; the forwarded headers preserve the client identity the app needs. A real HAProxy does this here.",
      pt: "Um único ponto termina o TLS e distribui a carga para os backends ficarem simples e substituíveis; os headers encaminhados preservam a identidade do cliente que a app precisa. Um HAProxy real faz isso aqui.",
    },
    whatBreaks: {
      en: "Without it every backend handles its own certs and there's no single place to add or drain instances. Honest caveat: §7 — this fronts a single backend (a one-node pool), not a horizontally scaled fleet.",
      pt: "Sem ele cada backend cuida dos próprios certificados e não há um único ponto para adicionar ou drenar instâncias. Ressalva honesta: §7 — ele fronteia um único backend (pool de um nó), não uma frota escalada horizontalmente.",
    },
    generic: { en: "TLS termination / load balancer", pt: "Terminação TLS / balanceador" },
    clouds: { azure: "Application Gateway", aws: "ALB / NLB", gcp: "Cloud Load Balancing" },
    tech: [
      { k: { en: "balancer", pt: "balanceador" }, v: "HAProxy" },
      { k: { en: "tls", pt: "tls" }, v: "TLS 1.3 termination" },
    ],
    stages: ["lb"],
    position: { x: 312, y: 328 },
    scenarios: ["advanced"],
  },
  {
    id: "waf",
    tier: "edge",
    title: "WAF",
    subtitle: { en: "Web App Firewall", pt: "Firewall de Aplicação" },
    icon: "🛡️",
    accent: "var(--color-warn)",
    tag: "ModSecurity",
    blurb: {
      en: "OWASP Core Rule Set inspects every (already-decrypted) request; a known attack signature (SQL injection, XSS) is blocked with a 403 before it ever reaches the app. A clean request passes through.",
      pt: "O OWASP Core Rule Set inspeciona cada requisição (já decriptada); uma assinatura de ataque conhecida (SQL injection, XSS) é bloqueada com 403 antes de chegar à app. Uma requisição limpa passa.",
    },
    why: {
      en: "A WAF is the rule engine that stops common web attacks before they touch application code — defense in depth. It inspects L7 (HTTP) content, so it runs after the load balancer decrypts the request. Here a real ModSecurity/CRS returns a real 403 on a malicious payload.",
      pt: "Um WAF é o motor de regras que barra ataques web comuns antes de tocarem o código da aplicação — defesa em profundidade. Ele inspeciona conteúdo L7 (HTTP), então roda depois de o balanceador descriptografar a requisição. Aqui um ModSecurity/CRS real retorna um 403 real num payload malicioso.",
    },
    whatBreaks: {
      en: "Without it, injection and scanner traffic reach the app and rely on perfect application code to be safe. A WAF is a layer, not a substitute for fixing the underlying vulnerability.",
      pt: "Sem ele, tráfego de injeção e scanners chega à app e depende de código perfeito para ser seguro. Um WAF é uma camada, não um substituto para corrigir a vulnerabilidade de fundo.",
    },
    generic: { en: "Web application firewall", pt: "Firewall de aplicação web" },
    clouds: { azure: "Azure WAF (Front Door)", aws: "AWS WAF", gcp: "Cloud Armor" },
    tech: [
      { k: { en: "engine", pt: "motor" }, v: "ModSecurity + OWASP CRS" },
      { k: { en: "action", pt: "ação" }, v: "block 403 / pass" },
    ],
    stages: ["waf"],
    position: { x: 312, y: 436 },
    scenarios: ["advanced"],
  },
  {
    id: "apigw",
    tier: "edge",
    title: { en: "API Gateway", pt: "API Gateway" },
    subtitle: { en: "Route · rate-limit", pt: "Rotear · rate-limit" },
    icon: "🚪",
    accent: "var(--color-indigo)",
    tag: "Kong",
    blurb: {
      en: "The single front door for the API: it routes by path, enforces rate limits and API keys, and reports headers like X-RateLimit-Remaining before forwarding to the backend.",
      pt: "A porta de entrada única da API: roteia por path, aplica rate limits e chaves de API, e reporta headers como X-RateLimit-Remaining antes de encaminhar ao backend.",
    },
    why: {
      en: "A gateway centralizes routing, authentication and quotas so every service doesn't reimplement them — one policy plane at the edge. A real Kong (DB-less) enforces it here.",
      pt: "Um gateway centraliza roteamento, autenticação e cotas para cada serviço não reimplementá-los — um plano de política único na borda. Um Kong real (sem banco) o aplica aqui.",
    },
    whatBreaks: {
      en: "Without it each service reinvents auth and rate limiting inconsistently, and there's no single chokepoint to apply a quota or revoke a key.",
      pt: "Sem ele cada serviço reinventa auth e rate limiting de forma inconsistente, e não há um ponto único para aplicar uma cota ou revogar uma chave.",
    },
    generic: { en: "API gateway", pt: "API gateway" },
    clouds: { azure: "API Management", aws: "API Gateway", gcp: "API Gateway / Apigee" },
    tech: [
      { k: { en: "gateway", pt: "gateway" }, v: "Kong (DB-less)" },
      { k: { en: "policy", pt: "política" }, v: "routing · rate-limit · keys" },
    ],
    stages: ["apigw"],
    position: { x: 312, y: 544 },
    scenarios: ["advanced"],
  },
  {
    id: "backend",
    tier: "api",
    title: "Backend",
    subtitle: "FastAPI · ASGI",
    icon: "⚙️",
    accent: "var(--color-violet)",
    tag: "ASGI",
    blurb: {
      en: "A FastAPI web service terminates TLS at the ingress, validates the request, reads recent history from the database, opens an SSE response, and invokes the agent — relaying every trace event back to the browser.",
      pt: "Um serviço web FastAPI encerra o TLS no ingress, valida a requisição, lê o histórico recente do banco, abre uma resposta SSE e invoca o agente — repassando cada evento de trace ao navegador.",
    },
    why: {
      en: "A thin, validated public edge is the only internet-facing surface: it terminates TLS, checks the request, and is the single door an attacker can knock on — keeping the agent runtime off the public internet.",
      pt: "Uma borda pública fina e validada é a única superfície voltada à internet: encerra o TLS, valida a requisição e é a única porta em que um atacante pode bater — mantendo o runtime do agente fora da internet pública.",
    },
    whatBreaks: {
      en: "Without a dedicated edge the agent runtime would face the internet directly. Honest caveat: this demo has no real auth — authentication is a stub; production needs authn/z, sessions and rate limiting at this layer before any agent work.",
      pt: "Sem uma borda dedicada o runtime do agente ficaria exposto direto à internet. Ressalva honesta: esta demo não tem autenticação real — é um stub; produção precisa de authn/z, sessões e rate limiting nesta camada antes de qualquer trabalho do agente.",
    },
    generic: { en: "Containerized API · public ingress", pt: "API em container · ingress público" },
    clouds: {
      azure: "Azure Container Apps",
      aws: "App Runner / ECS Fargate",
      gcp: "Cloud Run",
    },
    tech: [
      { k: { en: "server", pt: "servidor" }, v: "uvicorn (ASGI)" },
      { k: { en: "framework", pt: "framework" }, v: "FastAPI" },
      { k: { en: "streaming", pt: "streaming" }, v: "EventSourceResponse" },
      { k: { en: "middleware", pt: "middleware" }, v: "CORS" },
    ],
    // 084/085: the `edge` stage (network edge — reverse proxy/TLS/LB) maps to the
    // backend (the ingress it fronts). There is no separate edge node; the edge's
    // chain + forwarded headers surface in the frontend→backend hop detail (085).
    stages: ["edge", "backend"],
    position: { x: 340, y: 112 },
  },
  {
    id: "agent",
    tier: "agent",
    title: "Agent",
    // 053-agent-harness — name the runtime on the canvas card itself (not the
    // deployment tier): the agent station IS the harness. Glossary term explains it.
    subtitle: { en: "Agent Harness · LangGraph runtime", pt: "Agent Harness · runtime LangGraph" },
    icon: "🧠",
    accent: "var(--color-pink)",
    tag: "ReAct",
    blurb: {
      en: "A LangGraph state machine on a private network. It reasons in a loop: decide whether to call a tool — search the knowledge base, run a calculation, check the time — observe the result, and reason again, until it can answer. The agent owns every tool-call decision, including whether to retrieve.",
      pt: "Uma máquina de estados LangGraph em rede privada. Raciocina em loop: decidir se chama uma ferramenta — buscar na base de conhecimento, calcular, consultar a hora — observar o resultado e raciocinar de novo, até poder responder. O agente decide cada chamada de ferramenta, inclusive se vai recuperar contexto.",
    },
    why: {
      en: "The reasoning loop holds tool access and model credentials, so it runs on a private network the internet can't reach directly — least privilege at the most sensitive layer.",
      pt: "O loop de raciocínio detém o acesso às ferramentas e as credenciais do modelo, então roda numa rede privada que a internet não alcança diretamente — menor privilégio na camada mais sensível.",
    },
    whatBreaks: {
      en: "Put it in the public API container and a single web-tier compromise exposes every tool credential and the model egress — the blast radius becomes the whole system instead of one isolated service.",
      pt: "Coloque-o no container da API pública e um único comprometimento da camada web expõe todas as credenciais de ferramentas e a saída do modelo — o raio de impacto passa a ser o sistema inteiro em vez de um serviço isolado.",
    },
    generic: { en: "Private container runtime", pt: "Runtime privado em container" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [
      { k: { en: "runtime", pt: "runtime" }, v: "LangGraph StateGraph" },
      { k: { en: "pattern", pt: "padrão" }, v: "bounded ReAct loop" },
      { k: { en: "flow", pt: "fluxo" }, v: "route → think ⇄ tools (search KB · calc · …) → generate" },
      { k: { en: "state", pt: "estado" }, v: "in-process per request" },
    ],
    // 057-deepagents-runtime: the Intermediate-rung DeepAgents preamble (plan →
    // fs.write → delegate → fs.read) rides this same `agent` station — no new node.
    stages: [
      "agent.route",
      "agent.plan",
      "agent.fs.write",
      "agent.fs.read",
      "agent.delegate",
      "agent.think",
      // 098-verify-reflection-loop: the critic pass rides the same `agent` station
      // (a sub-stage like agent.think — no new node), fired only when `verify` is on.
      "agent.verify",
    ],
    position: { x: 340, y: 430 },
  },
  {
    id: "database",
    tier: "services",
    title: { en: "App Database", pt: "Banco da Aplicação" },
    subtitle: { en: "Relational · app state", pt: "Relacional · estado da app" },
    icon: "🗄️",
    accent: "var(--color-blue)",
    tag: "SQL",
    blurb: {
      en: "The application's system of record — conversations and history. A real SQLite store here (separate from the RAG vector DB); in production a managed relational service. The backend reads recent history and persists each conversation.",
      pt: "O sistema de registro da aplicação — conversas e histórico. Aqui é um SQLite real (separado do vector DB do RAG); em produção, um serviço relacional gerenciado. O backend lê o histórico recente e persiste cada conversa.",
    },
    why: {
      en: "Transactional conversation state needs ACID guarantees and a different engine than vector search, so the relational store is its own service — reached over a pooled, TLS connection.",
      pt: "O estado transacional da conversa precisa de garantias ACID e de um motor diferente do da busca vetorial, então o banco relacional é um serviço próprio — acessado por uma conexão TLS com pool.",
    },
    whatBreaks: {
      en: "Merge it into the vector DB and you lose ACID or pay vector-search latency on every read. Honest caveat: this demo is single-instance (the trace store is in-memory, lost on restart, not shared across replicas); production fronts the DB with a connection pool and runs more than one replica.",
      pt: "Funda-o no banco vetorial e você perde o ACID ou paga a latência da busca vetorial em cada leitura. Ressalva honesta: esta demo é de instância única (o armazenamento de traces fica em memória, perdido ao reiniciar, não compartilhado entre réplicas); produção coloca um pool de conexões na frente do banco e roda mais de uma réplica.",
    },
    generic: { en: "Managed relational database", pt: "Banco relacional gerenciado" },
    clouds: {
      azure: "Azure SQL / Cosmos DB",
      aws: "Amazon RDS / Aurora",
      gcp: "Cloud SQL / AlloyDB",
    },
    tech: [
      { k: { en: "engine", pt: "engine" }, v: "SQLite (dev) / managed SQL" },
      { k: { en: "protocol", pt: "protocolo" }, v: "in-process driver / SQL wire · TLS" },
      { k: { en: "access", pt: "acesso" }, v: "backend · private network" },
      { k: { en: "data", pt: "dados" }, v: "conversations, history" },
      { k: { en: "isolation", pt: "isolamento" }, v: "per-request connection" },
    ],
    stages: ["db.read", "db.write"],
    position: { x: 980, y: 112 },
  },
  {
    id: "rag",
    tier: "services",
    // 054 amendment: the node represents the whole query-time RAG pipeline (embed →
    // search → rerank → retrieve over the vector store), so it reads "RAG".
    title: "RAG",
    subtitle: { en: "Vector store · Chroma", pt: "Banco vetorial · Chroma" },
    icon: "📚",
    accent: "var(--color-ok)",
    tag: "VECTOR DB",
    blurb: {
      en: "Embeds the query and runs an approximate nearest-neighbor search over the knowledge base using cosine similarity, returning the most relevant top-k chunks as grounding context. It also ingests user-uploaded PDFs — chunk → embed → store — so the agent can ground answers on your own documents.",
      pt: "Gera o embedding da consulta e executa uma busca aproximada por vizinhos mais próximos na base de conhecimento usando similaridade de cosseno, retornando os top-k trechos mais relevantes como contexto de fundamentação. Também faz a ingestão de PDFs enviados pelo usuário — dividir → incorporar → armazenar — para o agente fundamentar respostas nos seus próprios documentos.",
    },
    why: {
      en: "Approximate-nearest-neighbour search over embeddings is a distinct job from transactional storage: a vector index (HNSW, cosine) makes 'find the most similar chunks' fast — something a relational DB can't do efficiently.",
      pt: "A busca aproximada por vizinhos mais próximos sobre embeddings é um trabalho distinto do armazenamento transacional: um índice vetorial (HNSW, cosseno) torna rápido 'achar os trechos mais similares' — algo que um banco relacional não faz de forma eficiente.",
    },
    whatBreaks: {
      en: "Without a vector store the agent can't ground answers in your documents — it falls back to the model's parametric memory, which goes stale and hallucinates on facts outside its training.",
      pt: "Sem um banco vetorial o agente não consegue fundamentar respostas nos seus documentos — recai na memória paramétrica do modelo, que envelhece e alucina sobre fatos fora do treinamento.",
    },
    generic: { en: "Managed vector database", pt: "Banco de dados vetorial gerenciado" },
    clouds: {
      azure: "Azure AI Search / Chroma",
      aws: "Amazon OpenSearch / Kendra",
      gcp: "Vertex AI Vector Search",
    },
    tech: [
      { k: { en: "store", pt: "armazenamento" }, v: "Chroma (persistent)" },
      { k: { en: "index", pt: "índice" }, v: "HNSW" },
      { k: { en: "metric", pt: "métrica" }, v: "cosine similarity" },
      { k: { en: "embeddings", pt: "embeddings" }, v: "text-embedding-3-small" },
      { k: { en: "query", pt: "consulta" }, v: "embed → search → retrieve top-k" },
    ],
    // 033-ingestion-node: the rag.ingest.* stages moved to the `ingestion`
    // station; the query-time RAG node keeps embed/search/(rerank)/retrieve.
    // 054-rag-block-expansion: `rag.rerank` is a query-time sub-stage of RAG (fires
    // only on the Intermediate rung); it animates this same Vector DB tile and its
    // before/after detail lives in the RAG drill-in (RagDetail), not a separate node.
    // 070-hybrid-search: `rag.hybrid` (BM25 + vector, RRF) is a query-time sub-stage of
    // RAG too (between search and rerank); it animates this same Vector DB tile and its
    // Vector | BM25 | → RRF fusion detail lives in the RAG drill-in, not a separate node.
    stages: ["rag.embed", "rag.search", "rag.hybrid", "rag.rerank", "rag.retrieve"],
    position: { x: 980, y: 320 },
  },
  {
    // 056-ragless-pageindex: a second, reasoning-based retrieval path (PageIndex).
    // Appears below the RAG node only when the per-conversation `ragless` toggle is on
    // (Intermediate rung). It builds a document tree, the LLM navigates it, and the
    // selected sections become the grounding — no embeddings, no vector DB.
    id: "pageindex",
    tier: "services",
    title: "RAGLESS",
    subtitle: { en: "PageIndex · tree search", pt: "PageIndex · busca em árvore" },
    icon: "🧭",
    accent: "var(--color-ok)",
    tag: "RAGLESS",
    blurb: {
      en: "Reasoning-based retrieval. Instead of embeddings and vector similarity, it builds a hierarchical tree (a table of contents) of the documents and lets the LLM navigate that tree by reasoning to pick the relevant section. No chunking, no embeddings, no vector DB — 'why this passage?' is an explainable path, not a cosine score. Runs alongside Vector RAG so you can compare the two.",
      pt: "Recuperação por raciocínio. Em vez de embeddings e similaridade vetorial, monta uma árvore hierárquica (um índice/sumário) dos documentos e deixa a LLM navegar essa árvore por raciocínio para escolher a seção relevante. Sem chunking, sem embeddings, sem banco vetorial — 'por que esta passagem?' é um caminho explicável, não um escore de cosseno. Roda junto do RAG vetorial para você comparar os dois.",
    },
    why: {
      en: "Embeddings are not the only way to retrieve. When documents are long and well-structured, navigating their table of contents by reasoning can beat similarity search and yields an auditable selection trace — the trade is a vector index for model calls.",
      pt: "Embeddings não são a única forma de recuperar. Quando os documentos são longos e bem estruturados, navegar o sumário por raciocínio pode superar a busca por similaridade e gera um rastro de seleção auditável — a troca é um índice vetorial por chamadas de modelo.",
    },
    whatBreaks: {
      en: "Skip reasoning-based retrieval and you only ever have similarity search: questions whose answer depends on document structure (which section, which step) lose the explainable navigation path, and a poorly-embedded chunk can never be recovered by reasoning over the hierarchy.",
      pt: "Sem a recuperação por raciocínio você só tem busca por similaridade: perguntas cuja resposta depende da estrutura do documento (qual seção, qual etapa) perdem o caminho de navegação explicável, e um chunk mal embeddado nunca é recuperado raciocinando sobre a hierarquia.",
    },
    generic: {
      en: "Reasoning-based retrieval (LLM tree search)",
      pt: "Recuperação por raciocínio (busca em árvore com LLM)",
    },
    clouds: {
      azure: "Azure OpenAI + AI Search (semantic)",
      aws: "Amazon Bedrock + Kendra",
      gcp: "Vertex AI + LLM tree search",
    },
    tech: [
      { k: { en: "index", pt: "índice" }, v: "heading tree (ToC)" },
      { k: { en: "retrieval", pt: "recuperação" }, v: "LLM navigation (reasoning)" },
      { k: { en: "embeddings", pt: "embeddings" }, v: "none" },
      { k: { en: "pipeline", pt: "pipeline" }, v: "tree → navigate → select" },
    ],
    stages: ["pageindex.tree", "pageindex.navigate", "pageindex.select"],
    scenarios: ["intermediate", "advanced"],
    position: { x: 980, y: 360 },
  },
  {
    id: "ingestion",
    tier: "services",
    title: { en: "Ingestion / Indexer", pt: "Ingestão / Indexador" },
    subtitle: { en: "Offline index build", pt: "Construção offline do índice" },
    icon: "📥",
    accent: "var(--color-ok)",
    tag: "INDEX",
    blurb: {
      en: "Builds the knowledge base offline. On upload it first writes the original to durable object storage, then reads it back and runs the pipeline: chunk → tokenize → embed → extract metadata → upsert the vectors into the index. Runs on startup (if missing), on each PDF upload, and rebuilds when the embedding model/dimension changes. Open the full pipeline to walk every phase.",
      pt: "Constrói a base de conhecimento offline. No upload, primeiro grava o original em armazenamento de objetos durável, depois o lê de volta e roda o pipeline: dividir → tokenizar → embeddar → extrair metadados → fazer upsert dos vetores no índice. Roda na inicialização (se ausente), a cada upload de PDF e reconstrói quando o modelo/dimensão de embedding muda. Abra o pipeline completo para percorrer cada fase.",
    },
    why: {
      en: "Indexing is the offline half of RAG and a different job from query-time search: documents are chunked, embedded and upserted ahead of time so retrieval can be fast at request time. Chunking strategy and refresh policy live here, not on the query path.",
      pt: "A indexação é a metade offline do RAG e um trabalho diferente da busca em tempo de consulta: documentos são chunkados, embeddados e feito upsert com antecedência para a recuperação ser rápida na requisição. A estratégia de chunking e a política de atualização vivem aqui, não no caminho da consulta.",
    },
    whatBreaks: {
      en: "Skip the indexer and there is nothing to retrieve — the agent has no grounding. A stale or badly-chunked index quietly wrecks answer quality: chunks too big bury the answer, too small lose context, and an index not re-embedded after a model change silently mismatches the query vectors.",
      pt: "Pule o indexador e não há o que recuperar — o agente fica sem fundamentação. Um índice desatualizado ou mal chunkado destrói silenciosamente a qualidade: chunks grandes demais soterram a resposta, pequenos demais perdem contexto, e um índice não re-embeddado após troca de modelo descasa silenciosamente dos vetores da consulta.",
    },
    generic: { en: "Offline indexing / ingestion job", pt: "Job de indexação / ingestão offline" },
    clouds: {
      azure: "Azure AI Search indexer / Functions",
      aws: "OpenSearch Ingestion / Glue",
      gcp: "Vertex AI Pipelines / Dataflow",
    },
    tech: [
      { k: { en: "object store", pt: "armazenamento de objetos" }, v: "Blob / S3 (durable original)" },
      {
        k: { en: "pipeline", pt: "pipeline" },
        v: "store → chunk → tokenize → embed → metadata → upsert",
      },
      { k: { en: "chunking", pt: "chunking" }, v: "active strategy · 900 chars / 150 overlap" },
      { k: { en: "embeddings", pt: "embeddings" }, v: "text-embedding-3-small" },
      { k: { en: "trigger", pt: "gatilho" }, v: "startup · PDF upload · dim drift" },
    ],
    // 080-ingestion-pipeline-merge: storage.upload (the durable object write, the
    // station's first "Object store" phase) was folded in here from the old standalone
    // Object Storage node, and tokenize + metadata are now their own phases.
    stages: [
      "storage.upload",
      "rag.ingest.chunk",
      "rag.ingest.tokenize",
      "rag.ingest.embed",
      "rag.ingest.metadata",
      "rag.ingest.store",
    ],
    position: { x: 980, y: 400 },
  },
  {
    id: "mcp",
    tier: "services",
    title: "MCP Tools",
    subtitle: "Model Context Protocol",
    icon: "🔧",
    accent: "var(--color-warn)",
    tag: "MCP",
    blurb: {
      en: "An MCP server exposes tools to the agent. The agent discovers them, and when the model chooses one, the call and its result travel over the MCP transport (here, stdio / JSON-RPC).",
      pt: "Um servidor MCP expõe ferramentas ao agente. O agente as descobre e, quando o modelo escolhe uma, a chamada e seu resultado trafegam pelo transporte MCP (aqui, stdio / JSON-RPC).",
    },
    why: {
      en: "Tools sit behind a standard protocol (MCP) as a separate process so the agent doesn't hard-link tool code, secrets or dependencies — they can be swapped, sandboxed and scaled independently.",
      pt: "As ferramentas ficam atrás de um protocolo padrão (MCP) como processo separado para o agente não acoplar código, segredos ou dependências de ferramentas — podem ser trocadas, isoladas e escaladas de forma independente.",
    },
    whatBreaks: {
      en: "Inline the tools and every tool dependency and secret lives in the agent process. Note stdio is local-only — when tools must scale or run out-of-process, MCP also speaks HTTP/SSE as the transport.",
      pt: "Embuta as ferramentas e toda dependência e segredo de ferramenta passa a viver no processo do agente. Note que o stdio é apenas local — quando as ferramentas precisam escalar ou rodar fora do processo, o MCP também fala HTTP/SSE como transporte.",
    },
    generic: { en: "Tool service (sidecar)", pt: "Serviço de ferramentas (sidecar)" },
    clouds: {
      azure: "Sidecar container / ACA",
      aws: "Sidecar / ECS task",
      gcp: "Sidecar / Cloud Run",
    },
    tech: [
      { k: { en: "protocol", pt: "protocolo" }, v: "Model Context Protocol" },
      { k: { en: "transport", pt: "transporte" }, v: "stdio (JSON-RPC)" },
      {
        k: { en: "tools", pt: "ferramentas" },
        v: "calculator, current_time, kb_lookup, web_search",
      },
    ],
    stages: ["mcp.discover", "mcp.call"],
    position: { x: 980, y: 430 },
  },
  {
    id: "llm",
    tier: "services",
    title: "LLM",
    subtitle: { en: "Chat completions", pt: "Chat completions" },
    icon: "✨",
    accent: "var(--color-orange)",
    tag: "stream",
    blurb: {
      en: "Receives the assembled prompt (system + context + tool results) over HTTPS and streams the answer back token by token — which is why the response types itself out in the chat.",
      pt: "Recebe o prompt montado (sistema + contexto + resultados de ferramentas) sobre HTTPS e transmite a resposta de volta token a token — por isso a resposta vai sendo digitada no chat.",
    },
    why: {
      en: "Generation runs on a managed model endpoint reached over TLS, not in your process: the weights are huge, GPU-bound and provider-operated, so you call them as a service.",
      pt: "A geração roda num endpoint de modelo gerenciado acessado por TLS, não no seu processo: os pesos são enormes, dependem de GPU e são operados pelo provedor, então você os chama como serviço.",
    },
    whatBreaks: {
      en: "Without a separate model endpoint you'd have to host and scale GPUs yourself; coupling it into the agent also removes the seam where a gateway can add routing, fallback, budgets and caching.",
      pt: "Sem um endpoint de modelo separado, você teria de hospedar e escalar GPUs por conta própria; acoplá-lo ao agente também remove o ponto onde um gateway pode adicionar roteamento, fallback, orçamentos e cache.",
    },
    generic: { en: "Managed model endpoint", pt: "Endpoint de modelo gerenciado" },
    clouds: {
      azure: "Azure OpenAI",
      aws: "Amazon Bedrock",
      gcp: "Vertex AI",
    },
    // The model is intentionally absent here: it's read live from /api/health and
    // injected by the inspector (B2), so it can never drift from the real env.
    tech: [
      { k: { en: "api", pt: "api" }, v: "Chat Completions" },
      { k: { en: "output", pt: "saída" }, v: "streamed token-by-token" },
      { k: { en: "security", pt: "segurança" }, v: "HTTPS · TLS" },
    ],
    stages: ["llm.prompt", "llm.generate"],
    position: { x: 980, y: 540 },
  },
  // --- 008-scenario-framework preview nodes (non-executing; stages: []) -------
  // (054-rag-block-expansion: the Intermediate reranker is no longer a separate
  // tile — `rag.rerank` is a query-time sub-stage of the `rag` station above,
  // surfaced in the RAG drill-in. Its cloud examples now live on the Learn
  // "reranker" topic as inline notes.)
  // Advanced rung: the AI-Ops control + observability plane.
  {
    id: "gateway",
    tier: "aiops",
    title: { en: "LLM Gateway", pt: "Gateway LLM" },
    subtitle: { en: "Router · fallback", pt: "Roteador · fallback" },
    icon: "🚦",
    accent: "var(--color-warn)",
    tag: "GATEWAY",
    blurb: {
      en: "A single egress for every model call: routing, retries, provider fallback and budget caps.",
      pt: "Uma saída única para toda chamada de modelo: roteamento, retries, fallback entre provedores e limites de orçamento.",
    },
    generic: { en: "LLM gateway / router", pt: "Gateway / roteador de LLM" },
    clouds: {
      azure: "API Management (AI gateway)",
      aws: "Bedrock + API Gateway",
      gcp: "Apigee / Vertex endpoints",
    },
    tech: [
      { k: { en: "role", pt: "papel" }, v: "router" },
      { k: { en: "features", pt: "recursos" }, v: "retry · fallback · budget" },
    ],
    stages: [],
    position: { x: 1340, y: 120 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["aiops"],
  },
  {
    id: "guardrails",
    tier: "aiops",
    title: { en: "Guardrails", pt: "Guardrails" },
    subtitle: { en: "Input / output safety", pt: "Segurança entrada/saída" },
    icon: "🛡️",
    accent: "var(--color-warn)",
    tag: "SAFETY",
    blurb: {
      en: "Checks prompts and answers for injection, PII and unsafe content before they pass.",
      pt: "Verifica prompts e respostas contra injection, PII e conteúdo inseguro antes de passarem.",
    },
    generic: { en: "Input/output safety filter", pt: "Filtro de segurança de entrada/saída" },
    clouds: {
      azure: "AI Content Safety",
      aws: "Bedrock Guardrails",
      gcp: "Model Armor",
    },
    tech: [{ k: { en: "checks", pt: "checagens" }, v: "injection · PII · toxicity" }],
    stages: [],
    position: { x: 1340, y: 240 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["security"],
  },
  {
    id: "cache",
    tier: "aiops",
    title: { en: "Semantic Cache", pt: "Cache Semântico" },
    subtitle: { en: "Prompt / embedding cache", pt: "Cache de prompt/embedding" },
    icon: "⚡",
    accent: "var(--color-warn)",
    tag: "CACHE",
    blurb: {
      en: "Returns a stored answer for semantically-near queries — big latency and cost savings.",
      pt: "Devolve uma resposta armazenada para consultas semanticamente próximas — grande economia de latência e custo.",
    },
    generic: { en: "Semantic / prompt cache", pt: "Cache semântico / de prompt" },
    clouds: {
      azure: "Azure Cache for Redis",
      aws: "ElastiCache (Redis)",
      gcp: "Memorystore (Redis)",
    },
    tech: [{ k: { en: "keys", pt: "chaves" }, v: "embedding similarity" }],
    stages: [],
    position: { x: 1340, y: 360 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["aiops"],
  },
  {
    id: "eval",
    tier: "aiops",
    title: { en: "Eval Runner", pt: "Eval Runner" },
    subtitle: { en: "RAGAS · LLM-judge", pt: "RAGAS · LLM-juiz" },
    icon: "🧪",
    accent: "var(--color-warn)",
    tag: "EVALS",
    blurb: {
      en: "Scores answers against a golden set (faithfulness, relevancy) and gates regressions in CI.",
      pt: "Pontua respostas contra um golden set (fidelidade, relevância) e barra regressões no CI.",
    },
    generic: { en: "Eval runner (RAGAS / LLM-judge)", pt: "Runner de avaliação (RAGAS / LLM-juiz)" },
    clouds: {
      azure: "Azure AI Evaluation",
      aws: "Bedrock model evaluation",
      gcp: "Vertex Gen AI evaluation",
    },
    tech: [{ k: { en: "metrics", pt: "métricas" }, v: "faithfulness · NDCG" }],
    stages: [],
    position: { x: 1340, y: 480 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["aiops"],
  },
  {
    id: "observability",
    tier: "aiops",
    title: { en: "Observability", pt: "Observabilidade" },
    subtitle: { en: "Traces · tokens · cost", pt: "Traces · tokens · custo" },
    icon: "📊",
    accent: "var(--color-warn)",
    tag: "OTEL",
    blurb: {
      en: "Captures every prompt, completion, token count, latency and cost as structured LLM traces.",
      pt: "Captura cada prompt, resposta, contagem de tokens, latência e custo como traces estruturados de LLM.",
    },
    generic: { en: "LLM trace / metrics sink", pt: "Coletor de traces/métricas de LLM" },
    clouds: {
      azure: "Azure Monitor / App Insights",
      aws: "CloudWatch / X-Ray",
      gcp: "Cloud Trace / Monitoring",
    },
    tech: [{ k: { en: "standard", pt: "padrão" }, v: "OpenTelemetry GenAI" }],
    stages: [],
    position: { x: 1340, y: 600 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["aiops"],
  },
  // --- Advanced-rung sub-agents (multi-agent preview) ------------------------
  // The orchestrator is the relabelled `agent` node ("DeepAgents + Multi-agents");
  // these are the specialized workers it delegates to. Label-only previews
  // (`stages: []`, comingSoon) so each agent is *visible as its own node* —
  // making clear there's a team, not one loop — without faking a run. A future
  // spec wires a real multi-agent runtime (and per-agent activation).
  {
    id: "researcher",
    tier: "agent",
    title: { en: "Researcher", pt: "Pesquisador" },
    subtitle: { en: "gathers context", pt: "reúne contexto" },
    icon: "🔎",
    accent: "var(--color-pink)",
    tag: "research",
    blurb: {
      en: "A sub-agent specialized in finding information: it runs retrieval and tool lookups, then hands a digest back to the orchestrator.",
      pt: "Um subagente especializado em achar informação: roda recuperação e consultas a ferramentas e devolve um resumo ao orquestrador.",
    },
    generic: { en: "Specialized retrieval sub-agent", pt: "Subagente de recuperação especializado" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [{ k: { en: "role", pt: "papel" }, v: "orchestrator–worker" }],
    stages: [],
    position: { x: 372, y: 700 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["agent"],
  },
  {
    id: "coder",
    tier: "agent",
    title: { en: "Coder", pt: "Programador" },
    subtitle: { en: "executes steps", pt: "executa passos" },
    icon: "💻",
    accent: "var(--color-pink)",
    tag: "execute",
    blurb: {
      en: "A sub-agent that does the work — writing code, calling tools, transforming data — under the orchestrator's plan.",
      pt: "Um subagente que faz o trabalho — escrever código, chamar ferramentas, transformar dados — sob o plano do orquestrador.",
    },
    generic: { en: "Specialized execution sub-agent", pt: "Subagente de execução especializado" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [{ k: { en: "role", pt: "papel" }, v: "orchestrator–worker" }],
    stages: [],
    position: { x: 560, y: 700 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["agent"],
  },
  {
    id: "critic",
    tier: "agent",
    title: { en: "Critic", pt: "Crítico" },
    subtitle: { en: "reviews output", pt: "revisa a saída" },
    icon: "⚖️",
    accent: "var(--color-pink)",
    tag: "review",
    blurb: {
      en: "A sub-agent that reviews the draft answer for errors and gaps before it ships, sending feedback to the orchestrator.",
      pt: "Um subagente que revisa a resposta rascunho em busca de erros e lacunas antes de sair, enviando feedback ao orquestrador.",
    },
    generic: { en: "Specialized review sub-agent", pt: "Subagente de revisão especializado" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [{ k: { en: "role", pt: "papel" }, v: "orchestrator–worker" }],
    stages: [],
    position: { x: 748, y: 700 },
    scenarios: ["advanced"],
    comingSoon: true,
    tracks: ["agent"],
  },
  // --- 060-intermediate-preview-tiles — the Intermediate rung's first previews ----
  // They light up the rung's 059 tracks (rag + agent) so the selector becomes
  // meaningful there. Non-executing (`stages: []`); each becomes real in its own
  // future spec (DeepAgents summarization middleware).
  // 070-hybrid-search: the `hybrid` preview tile was REMOVED — hybrid search is now a
  // real query-time sub-stage of the `rag` station (`rag.hybrid`), like the reranker,
  // not a tile of its own. Its cloud examples (AI Search hybrid / OpenSearch / Vertex
  // Search) live in the `Hybrid search` glossary entry below.
  {
    id: "summarization",
    tier: "agent",
    title: { en: "Summarization", pt: "Sumarização" },
    subtitle: { en: "Context compaction", pt: "Compactação de contexto" },
    icon: "🗜️",
    accent: "var(--color-pink)",
    tag: "MEMORY",
    blurb: {
      en: "Compacts the running message thread when it grows too long — summarizing old turns so the agent keeps context without blowing the token budget.",
      pt: "Compacta o thread de mensagens quando ele cresce demais — resumindo turnos antigos para o agente manter contexto sem estourar o orçamento de tokens.",
    },
    generic: {
      en: "Conversation summarization / context compaction",
      pt: "Sumarização de conversa / compactação de contexto",
    },
    clouds: {
      azure: "Azure OpenAI (summary calls)",
      aws: "Bedrock (summary calls)",
      gcp: "Vertex AI (summary calls)",
    },
    tech: [{ k: { en: "trigger", pt: "gatilho" }, v: "token threshold" }],
    stages: [],
    position: { x: 372, y: 560 },
    scenarios: ["intermediate", "advanced"],
    comingSoon: true,
    tracks: ["agent"],
  },
];

// Network hops between stations. Cross-tier hops are real network calls; each
// carries its security `zone` and the `controls` enforced on it.
const HOPS_SRC: HopSrc[] = [
  {
    source: "frontend",
    target: "backend",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS 1.3",
    detail: {
      en: "POST /api/chat — the public request that kicks off the whole pipeline",
      pt: "POST /api/chat — a requisição pública que dá início a todo o pipeline",
    },
    why: {
      en: "nginx sits at the network edge as a reverse proxy — the client never reaches the app server directly. Here it terminates TLS (decrypts HTTPS), can load-balance across backend replicas, and forwards the request with the real client in X-Forwarded-For/Proto and X-Request-Id. A reverse proxy can do far more than proxy: cache responses, gzip, rate-limit, serve static files and route by path — one hardened front door for everything behind it.",
      pt: "O nginx fica na borda de rede como reverse proxy — o cliente nunca alcança o servidor da aplicação direto. Aqui ele termina o TLS (descriptografa o HTTPS), pode balancear a carga entre réplicas do backend e encaminha a requisição com o cliente real em X-Forwarded-For/Proto e X-Request-Id. Um reverse proxy faz muito além de encaminhar: cachear respostas, gzip, rate-limit, servir arquivos estáticos e rotear por path — uma única porta de entrada endurecida para tudo atrás dele.",
    },
    comm: "async", // SSE response (flips to sync in batch mode)
    secure: true,
    zone: "public",
    controls: { en: "WAF · DDoS · TLS 1.3", pt: "WAF · DDoS · TLS 1.3" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  // 088-network-layer — the real ingress chain, in transit order. Shown only when the
  // `network` component is on; the direct frontend→backend hop is hidden then (the
  // request really traverses these appliances instead). Vertical down the edge column.
  {
    source: "frontend",
    target: "dns",
    label: { en: "resolve", pt: "resolver" },
    protocol: "DNS",
    detail: {
      en: "The hostname is resolved to an address before any connection opens",
      pt: "O hostname é resolvido para um endereço antes de qualquer conexão abrir",
    },
    why: {
      en: "Every request begins with a name lookup: DNS maps the hostname to an IP (with a TTL the resolver caches). Here a real CoreDNS resolves the chain's internal service names.",
      pt: "Toda requisição começa com uma consulta de nome: o DNS mapeia o hostname para um IP (com um TTL que o resolver cacheia). Aqui um CoreDNS real resolve os nomes internos da cadeia.",
    },
    comm: "async",
    secure: false,
    zone: "public",
    controls: { en: "DNSSEC · TTL", pt: "DNSSEC · TTL" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "dns",
    target: "cdn",
    label: "HTTPS",
    protocol: "HTTPS / TLS 1.3",
    detail: {
      en: "The resolved request reaches the CDN edge cache first",
      pt: "A requisição resolvida chega primeiro ao cache de borda da CDN",
    },
    why: {
      en: "Once resolved, traffic hits the CDN edge: a cache HIT is served from there, a MISS continues down the chain. A real Varnish reports HIT/MISS.",
      pt: "Resolvida, a requisição bate na borda da CDN: um HIT é servido ali, um MISS segue pela cadeia. Um Varnish real reporta HIT/MISS.",
    },
    comm: "sync",
    secure: true,
    zone: "public",
    controls: { en: "TLS 1.3 · cache", pt: "TLS 1.3 · cache" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  // 090-waf-after-lb: CDN → TLS/LB → WAF → API-GW. The LB is the single TLS-
  // termination point; the WAF inspects the request only after it is decrypted.
  {
    source: "cdn",
    target: "lb",
    label: { en: "balance", pt: "balancear" },
    protocol: "HTTPS / TLS 1.3",
    detail: {
      en: "The uncacheable request is passed to the load balancer, which terminates TLS",
      pt: "A requisição não-cacheável é passada ao balanceador, que termina o TLS",
    },
    why: {
      en: "The dynamic API is uncacheable, so the CDN passes it straight to the load balancer. The LB is the single TLS-termination point: it decrypts HTTPS, balances onto a backend upstream, and adds X-Forwarded-* so the app still sees the real client. A real HAProxy does this.",
      pt: "A API dinâmica é não-cacheável, então a CDN a passa direto ao balanceador. O LB é o único ponto de terminação de TLS: descriptografa o HTTPS, balanceia para um upstream do backend e adiciona X-Forwarded-* para a app ainda ver o cliente real. Um HAProxy real faz isso.",
    },
    comm: "sync",
    secure: true,
    zone: "public",
    controls: { en: "TLS 1.3 · X-Forwarded-*", pt: "TLS 1.3 · X-Forwarded-*" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  {
    source: "lb",
    target: "waf",
    label: { en: "inspect", pt: "inspecionar" },
    protocol: "HTTP",
    detail: {
      en: "The now-decrypted request is screened by the WAF rule engine",
      pt: "A requisição já decriptada é triada pelo motor de regras do WAF",
    },
    why: {
      en: "A WAF inspects L7 (HTTP) content, so it can only run on plaintext — which is why it sits after the LB decrypts the request. The WAF (OWASP CRS) screens it: known attack signatures get a 403; clean traffic passes. A real ModSecurity enforces it.",
      pt: "Um WAF inspeciona conteúdo L7 (HTTP), então só roda sobre texto claro — por isso fica depois de o LB descriptografar a requisição. O WAF (OWASP CRS) a inspeciona: assinaturas de ataque conhecidas levam 403; tráfego limpo passa. Um ModSecurity real o aplica.",
    },
    comm: "sync",
    secure: false,
    zone: "public",
    controls: { en: "OWASP CRS · 403", pt: "OWASP CRS · 403" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  {
    source: "waf",
    target: "apigw",
    label: { en: "route", pt: "rotear" },
    protocol: "HTTP",
    detail: {
      en: "Clean traffic reaches the API gateway, which routes and rate-limits",
      pt: "Tráfego limpo chega ao API gateway, que roteia e aplica rate-limit",
    },
    why: {
      en: "Past the WAF, the gateway is the single policy plane: it routes by path, enforces rate limits and API keys, and reports X-RateLimit-Remaining before forwarding. A real Kong (DB-less) enforces it — and, being the first hop past the WAF, it stamps the WAF-cleared evidence header.",
      pt: "Passado o WAF, o gateway é o plano único de política: roteia por path, aplica rate limits e chaves de API, e reporta X-RateLimit-Remaining antes de encaminhar. Um Kong real (sem banco) o aplica — e, por ser o primeiro hop depois do WAF, carimba o header de evidência de WAF aprovado.",
    },
    comm: "sync",
    secure: false,
    zone: "public",
    controls: { en: "rate-limit · API key", pt: "rate-limit · chave de API" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  {
    source: "apigw",
    target: "backend",
    label: { en: "forward", pt: "encaminhar" },
    protocol: { en: "Private network · HTTP", pt: "Rede privada · HTTP" },
    detail: {
      en: "Past the edge, the request enters the private network and reaches the app",
      pt: "Passada a borda, a requisição entra na rede privada e chega à app",
    },
    why: {
      en: "Only after clearing the whole chain does the request cross into the private network and reach the backend — the appliances are the hardened public front door the app sits behind.",
      pt: "Só depois de passar por toda a cadeia a requisição cruza para a rede privada e chega ao backend — as appliances são a porta pública endurecida atrás da qual a app fica.",
    },
    comm: "async",
    secure: true,
    zone: "public",
    controls: { en: "X-Forwarded-* · X-Request-Id", pt: "X-Forwarded-* · X-Request-Id" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "backend",
    target: "agent",
    label: { en: "internal", pt: "interno" },
    protocol: { en: "Private network · HTTP (mTLS)", pt: "Rede privada · HTTP (mTLS)" },
    detail: {
      en: "In-cluster service-to-service call, not exposed to the internet",
      pt: "Chamada serviço-a-serviço dentro do cluster, não exposta à internet",
    },
    why: {
      en: "The agent runtime holds tool access and model credentials, so it lives on a private network the internet can't reach. mTLS authenticates both ends and an NSG/Security Group restricts who may talk to whom — so a compromised public tier can't freely pivot to the agent. The backend blocks (sync) waiting for the agent's answer.",
      pt: "O runtime do agente detém o acesso às ferramentas e as credenciais do modelo, então vive numa rede privada que a internet não alcança. O mTLS autentica as duas pontas e um NSG/Security Group restringe quem pode falar com quem — então uma camada pública comprometida não pivota livremente para o agente. O backend bloqueia (sync) esperando a resposta do agente.",
    },
    comm: "sync", // backend awaits the agent run
    secure: true,
    zone: "private",
    controls: { en: "mTLS · NSG / Security Group", pt: "mTLS · NSG / Security Group" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  {
    source: "backend",
    target: "database",
    label: "SQL · TLS",
    protocol: {
      en: "Database connection — here a SQLite driver call (in-process, no socket); in production a SQL wire protocol (e.g. TDS for SQL Server, the PostgreSQL protocol) over TLS, through a connection pool",
      pt: "Conexão de banco — aqui uma chamada de driver SQLite (in-process, sem socket); em produção um protocolo de fio SQL (ex.: TDS no SQL Server, o protocolo do PostgreSQL) sobre TLS, via um pool de conexões",
    },
    detail: {
      en: "The backend reads recent history and persists each conversation. \"SQL\" is the query language; the transport differs by environment — an in-process file driver here, a pooled TLS connection to a managed SQL service in production.",
      pt: "O backend lê o histórico recente e persiste cada conversa. \"SQL\" é a linguagem de consulta; o transporte muda por ambiente — um driver de arquivo in-process aqui, uma conexão TLS com pool a um serviço SQL gerenciado em produção.",
    },
    why: {
      en: "Transactional conversation state needs ACID guarantees, so it lives in a relational store reached over a pooled, TLS connection via a Private Endpoint (no public exposure). 'SQL' is the query language; the transport is an in-process file driver here and a SQL wire protocol (PostgreSQL/TDS) in production. Pooling avoids paying a new TLS handshake per request.",
      pt: "O estado transacional da conversa precisa de garantias ACID, então vive num banco relacional acessado por uma conexão TLS com pool via Private Endpoint (sem exposição pública). 'SQL' é a linguagem; o transporte é um driver de arquivo in-process aqui e um protocolo de fio SQL (PostgreSQL/TDS) em produção. O pool evita pagar um novo handshake TLS por requisição.",
    },
    comm: "sync", // blocking read / write
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · NSG", pt: "Private Endpoint · NSG" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "agent",
    target: "rag",
    label: "TCP",
    protocol: "TCP",
    detail: {
      en: "Vector similarity query against the embedding index",
      pt: "Consulta de similaridade vetorial contra o índice de embeddings",
    },
    why: {
      en: "The agent sends the query embedding and gets back the top-k nearest chunks (cosine) from the vector index — an approximate-nearest-neighbour search a relational DB can't do efficiently. It stays on a private endpoint because it carries your indexed content; the agent blocks on the result before reasoning.",
      pt: "O agente envia o embedding da consulta e recebe os top-k trechos mais próximos (cosseno) do índice vetorial — uma busca aproximada por vizinhos que um banco relacional não faz de forma eficiente. Fica num endpoint privado porque carrega o seu conteúdo indexado; o agente bloqueia no resultado antes de raciocinar.",
    },
    comm: "sync", // blocking similarity query
    secure: false,
    zone: "private",
    controls: { en: "Private Endpoint", pt: "Private Endpoint" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    // 056-ragless-pageindex — the reasoning-based retrieval call. Shown only when the
    // RAGLESS toggle is on (Intermediate rung); mirrors the agent→rag hop.
    source: "agent",
    target: "pageindex",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS",
    detail: {
      en: "LLM navigation over the document tree (no vector query)",
      pt: "Navegação por LLM sobre a árvore do documento (sem consulta vetorial)",
    },
    why: {
      en: "Reasoning-based retrieval: instead of an embedding similarity search, the LLM navigates the document's heading tree to pick the relevant section. Same private TLS egress as the model call — the trade is a vector index for extra model calls, in exchange for an explainable selection path.",
      pt: "Recuperação por raciocínio: em vez de uma busca por similaridade de embeddings, a LLM navega a árvore de títulos do documento para escolher a seção relevante. Mesmo egress TLS privado da chamada do modelo — a troca é um índice vetorial por chamadas extras de modelo, em troca de um caminho de seleção explicável.",
    },
    comm: "sync", // blocking navigation call
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · TLS (egress)", pt: "Private Endpoint · TLS (egress)" },
    sourceHandle: "right",
    targetHandle: "left",
    scenarios: ["intermediate", "advanced"],
  },
  {
    source: "agent",
    target: "mcp",
    label: "MCP",
    protocol: "MCP · stdio (JSON-RPC)",
    detail: {
      en: "Tool discovery and invocation over the Model Context Protocol",
      pt: "Descoberta e invocação de ferramentas pelo Model Context Protocol",
    },
    why: {
      en: "Tools sit behind a standard protocol (MCP) so the agent doesn't hard-link their code, secrets or dependencies — they can be swapped, sandboxed and scaled on their own. Here the transport is stdio/JSON-RPC (local, same host); out-of-process or remote tools would speak HTTP/SSE instead.",
      pt: "As ferramentas ficam atrás de um protocolo padrão (MCP) para o agente não acoplar código, segredos ou dependências delas — podem ser trocadas, isoladas e escaladas sozinhas. Aqui o transporte é stdio/JSON-RPC (local, mesmo host); ferramentas fora do processo ou remotas falariam HTTP/SSE.",
    },
    comm: "sync", // request/response JSON-RPC tool call
    secure: false,
    zone: "private",
    controls: { en: "local IPC (stdio)", pt: "IPC local (stdio)" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "agent",
    target: "llm",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS",
    detail: {
      en: "Chat Completions request to the managed model endpoint",
      pt: "Requisição Chat Completions ao endpoint do modelo gerenciado",
    },
    why: {
      en: "Generation runs on a provider-operated model endpoint reached over TLS egress through a Private Endpoint — the weights are huge and GPU-bound, so you call them as a service. The answer streams back token by token (async), which is why the chat types itself out.",
      pt: "A geração roda num endpoint de modelo operado pelo provedor, acessado por egress TLS via Private Endpoint — os pesos são enormes e dependem de GPU, então você os chama como serviço. A resposta volta token a token (async), por isso o chat vai sendo digitado.",
    },
    comm: "async", // streams tokens back (flips to sync in batch mode)
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · TLS (egress)", pt: "Private Endpoint · TLS (egress)" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  // 034-storage-ingestion-flow + 080-ingestion-pipeline-merge — the upload write-path.
  // The Backend calls the indexer (backend→ingestion); the indexer persists the original
  // to durable object storage (its first "Object store" phase), reads it back, and upserts
  // the vectors (ingestion→rag). These animate only during a PDF upload; a normal chat
  // leaves them idle. (080 folded the standalone Object Storage node into the indexer, so
  // the old backend→storage hop is gone — durable storage is now an internal phase.)
  {
    source: "backend",
    target: "ingestion",
    label: { en: "ingest", pt: "ingestão" },
    protocol: {
      en: "Private network · invoke the indexer (in-process / mTLS)",
      pt: "Rede privada · invoca o indexador (em processo / mTLS)",
    },
    detail: {
      en: "The API hands the received file to the indexer, which persists it to durable object storage, reads it back, and builds the index",
      pt: "A API entrega o arquivo recebido ao indexador, que o persiste em armazenamento de objetos durável, lê de volta e constrói o índice",
    },
    why: {
      en: "Indexing is the offline half of RAG and a different job from query-time search, so it runs as a private, in-cluster call (mTLS) the API awaits before responding. Keeping the durable original in object storage means the index can be rebuilt later (e.g. after an embedding-model change) without re-uploading.",
      pt: "A indexação é a metade offline do RAG e um trabalho diferente da busca em tempo de consulta, então roda como uma chamada privada dentro do cluster (mTLS) que a API aguarda antes de responder. Manter o original durável no armazenamento de objetos permite reconstruir o índice depois (ex.: após troca do modelo de embedding) sem reenviar.",
    },
    comm: "sync", // the API awaits the indexing before responding
    secure: true,
    zone: "private",
    controls: { en: "mTLS · NSG / Security Group", pt: "mTLS · NSG / Security Group" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "ingestion",
    target: "rag",
    label: { en: "upsert", pt: "upsert" },
    protocol: { en: "Vector upsert (TCP)", pt: "Upsert de vetores (TCP)" },
    detail: {
      en: "The indexer upserts the chunk embeddings into the vector index",
      pt: "O indexador faz upsert dos embeddings dos chunks no índice vetorial",
    },
    why: {
      en: "The write half of RAG: the indexer pushes the chunk embeddings into the vector index over a private endpoint, ahead of time, so query-time retrieval stays fast. Doing it offline (not on the request path) is what keeps chat latency low.",
      pt: "A metade de escrita do RAG: o indexador empurra os embeddings dos chunks para o índice vetorial por um endpoint privado, com antecedência, para a recuperação em tempo de consulta ficar rápida. Fazer isso offline (fora do caminho da requisição) é o que mantém a latência do chat baixa.",
    },
    comm: "sync",
    secure: false,
    zone: "private",
    controls: { en: "Private Endpoint", pt: "Private Endpoint" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  // Orchestrator → sub-agents (advanced multi-agent preview). In-process
  // delegation, drawn as a small tree under the agent node. Advanced rung only.
  ...(["researcher", "coder", "critic"] as StationId[]).map(
    (target): HopSrc => ({
      source: "agent",
      target,
      label: { en: "delegates", pt: "delega" },
      protocol: {
        en: "In-process delegation (orchestrator → sub-agent)",
        pt: "Delegação em processo (orquestrador → subagente)",
      },
      detail: {
        en: "The orchestrator spawns the sub-agent with a focused task and tools, then collects its result. (Preview — not yet executed.)",
        pt: "O orquestrador cria o subagente com uma tarefa e ferramentas focadas e depois coleta o resultado. (Prévia — ainda não executado.)",
      },
      why: {
        en: "Multi-agent orchestration: instead of one monolithic loop, the orchestrator delegates a focused task to a specialized sub-agent with its own tools and isolated context, then folds back only its result. In-process delegation (same runtime), so there is no network hop. Preview — not yet executed.",
        pt: "Orquestração multiagente: em vez de um loop monolítico, o orquestrador delega uma tarefa focada a um subagente especializado com ferramentas e contexto isolados próprios, e dobra de volta só o resultado. Delegação em processo (mesmo runtime), então não há hop de rede. Prévia — ainda não executado.",
      },
      comm: "sync",
      secure: false,
      zone: "private",
      controls: { en: "In-process (same runtime)", pt: "Em processo (mesmo runtime)" },
      sourceHandle: "bottom",
      targetHandle: "top",
      scenarios: ["advanced"],
    }),
  ),
];

// --- Resolvers + per-language caches -----------------------------------------

function resolveStation(s: StationSrc, lang: Lang): StationMeta {
  return {
    ...s,
    title: r(s.title, lang),
    subtitle: r(s.subtitle, lang),
    blurb: r(s.blurb, lang),
    why: s.why ? r(s.why, lang) : undefined,
    whatBreaks: s.whatBreaks ? r(s.whatBreaks, lang) : undefined,
    generic: r(s.generic, lang),
    tech: s.tech.map((t) => ({ k: r(t.k, lang), v: t.v })),
    scenarios: s.scenarios ?? ALL_SCENARIOS,
  };
}

function resolveTier(t: TierSrc, lang: Lang): TierMeta {
  return {
    ...t,
    title: r(t.title, lang),
    alias: r(t.alias, lang),
    generic: r(t.generic, lang),
    scenarios: t.scenarios ?? ALL_SCENARIOS,
  };
}

function resolveHop(h: HopSrc, lang: Lang): HopMeta {
  return {
    ...h,
    label: r(h.label, lang),
    protocol: r(h.protocol, lang),
    detail: r(h.detail, lang),
    controls: r(h.controls, lang),
    why: h.why ? r(h.why, lang) : undefined,
    scenarios: h.scenarios ?? ALL_SCENARIOS,
  };
}

function resolveBoundary(b: BoundarySrc, lang: Lang): BoundaryMeta {
  return { ...b, label: r(b.label, lang), generic: r(b.generic, lang) };
}

const stationsCache: Partial<Record<Lang, StationMeta[]>> = {};
const stationByIdCache: Partial<Record<Lang, Record<StationId, StationMeta>>> = {};
const tiersCache: Partial<Record<Lang, TierMeta[]>> = {};
const tierByIdCache: Partial<Record<Lang, Record<TierId, TierMeta>>> = {};
const hopsCache: Partial<Record<Lang, HopMeta[]>> = {};
const boundaryCache: Partial<Record<Lang, BoundaryMeta>> = {};

export function stationsFor(lang: Lang): StationMeta[] {
  return (stationsCache[lang] ??= STATIONS_SRC.map((s) => resolveStation(s, lang)));
}

export function stationByIdFor(lang: Lang): Record<StationId, StationMeta> {
  return (stationByIdCache[lang] ??= stationsFor(lang).reduce(
    (acc, s) => {
      acc[s.id] = s;
      return acc;
    },
    {} as Record<StationId, StationMeta>,
  ));
}

export function tiersFor(lang: Lang): TierMeta[] {
  return (tiersCache[lang] ??= TIERS_SRC.map((t) => resolveTier(t, lang)));
}

export function tierByIdFor(lang: Lang): Record<TierId, TierMeta> {
  return (tierByIdCache[lang] ??= tiersFor(lang).reduce(
    (acc, t) => {
      acc[t.id] = t;
      return acc;
    },
    {} as Record<TierId, TierMeta>,
  ));
}

export function hopsFor(lang: Lang): HopMeta[] {
  return (hopsCache[lang] ??= HOPS_SRC.map((h) => resolveHop(h, lang)));
}

export function boundaryFor(lang: Lang): BoundaryMeta {
  return (boundaryCache[lang] ??= resolveBoundary(BOUNDARY_SRC, lang));
}

const publicBoundaryCache: Partial<Record<Lang, PublicFrontierMeta>> = {};

/** The public-internet / egress frontier label (cloud-generic — no cloud arg). */
export function publicBoundaryFor(lang: Lang): PublicFrontierMeta {
  return (publicBoundaryCache[lang] ??= {
    id: PUBLIC_BOUNDARY_SRC.id,
    label: r(PUBLIC_BOUNDARY_SRC.label, lang),
  });
}

// Lang-independent structural exports (ids / endpoints) — for pure logic such
// as deriveView that has no language context.
export const STATION_IDS: StationId[] = STATIONS_SRC.map((s) => s.id);
export const HOP_PAIRS: { source: StationId; target: StationId }[] = HOPS_SRC.map((h) => ({
  source: h.source,
  target: h.target,
}));

// Lang-independent mapping from a trace stage to the station that owns it.
// Preview nodes carry `stages: []`, so they contribute nothing here — the map
// stays total over the unchanged `Stage` enum (008 AC7).
export const STAGE_TO_STATION: Record<Stage, StationId> = STATIONS_SRC.reduce(
  (acc, station) => {
    for (const stage of station.stages) acc[stage] = station.id;
    return acc;
  },
  {} as Record<Stage, StationId>,
);

/**
 * The station that owns the event at `index`, via its stage (B5). Lets the
 * timeline jump the Inspector to the right node when a phase chip is clicked —
 * the same `STAGE_TO_STATION` affinity the guided tour uses.
 */
export function stationForEvent(events: { stage: Stage }[], index: number): StationId | undefined {
  const ev = events[index];
  return ev ? STAGE_TO_STATION[ev.stage] : undefined;
}

// --- Scenario scoping (008-scenario-framework) -------------------------------
// The visual model is scenario-aware: each element belongs to one or more rungs
// of the maturity ladder. These builders return only the active scenario's set,
// which the layout and the canvas render. `simple` reproduces today's set.

// The agent node's displayed label tracks the selected runtime (061-scenario-builder;
// was scenario-keyed). `deepagents` reframes it as DeepAgents (a real runtime, 057);
// `multiagent` as DeepAgents + Multi-agents (preview). The node stays the same live
// `agent` station (same id, stages and identity) — only its title/tag change.
// `react` keeps today's "Agent" / "ReAct".
const AGENT_RUNTIME_LABEL: Partial<Record<Runtime, { title: Tr; tag: string }>> = {
  deepagents: { title: "DeepAgents", tag: "DeepAgents" },
  multiagent: {
    title: { en: "DeepAgents + Multi-agents", pt: "DeepAgents + Multiagentes" },
    tag: "Multi-agent",
  },
};

// Apply the runtime-specific display label to the agent node (see
// AGENT_RUNTIME_LABEL). A no-op for every other station and for `react`; never
// mutates the cached meta (returns a fresh object only when it overrides).
function relabelAgentForRuntime(s: StationMeta, lang: Lang, runtime: Runtime): StationMeta {
  if (s.id !== "agent") return s;
  const override = AGENT_RUNTIME_LABEL[runtime];
  return override ? { ...s, title: r(override.title, lang), tag: override.tag } : s;
}

// 035-conditional-upload-nodes — the write-path nodes only matter during a PDF
// upload, so they (and any hop touching them) are hidden unless the current trace
// shows an upload (`showUpload`, derived from the event log by `hasUploadActivity`).
// They stay **real** stations (not `comingSoon`); this is render-gating only.
// 080-ingestion-pipeline-merge: object storage folded into the indexer, so the
// only upload-revealed station is `ingestion` (its drill-in walks the phases).
export const UPLOAD_ONLY_STATIONS: ReadonlySet<StationId> = new Set(["ingestion"]);

// Per-station glossary key for the dense, jargon-y compact readout each node
// shows ("decision: answer", "top-4 · score 0.50"). `StationNode` appends the
// matching one-line hint to the readout's native tooltip so the term isn't
// thrown without a definition. Only stations whose readout uses jargon need one;
// every value here must be a real key in the i18n `glossary` (pinned by a test).
export const READOUT_GLOSSARY_KEY: Partial<Record<StationId, string>> = {
  agent: "decision",
  rag: "top-k",
  pageindex: "RAGLESS",
};

// 061-scenario-builder — visibility is driven by the à-la-carte selection: a station
// is shown iff the `ResolvedSelection` includes it, OR it's an upload-only write-path
// node revealed by current trace upload activity (orthogonal to the selection). A hop
// shows iff both endpoints are visible. This subsumes the old scenario/track/ragless
// gating (RAGLESS = the `pageindex` station being in the selected set; previews = their
// station being selected; runtime relabels the agent node).
function isStationVisible(
  id: StationId,
  sel: ResolvedSelection,
  showUpload: boolean,
): boolean {
  if (UPLOAD_ONLY_STATIONS.has(id)) return showUpload;
  return sel.stations.has(id);
}

export function visibleStationsFor(
  lang: Lang,
  sel: ResolvedSelection,
  showUpload = false,
): StationMeta[] {
  return stationsFor(lang)
    .filter((s) => isStationVisible(s.id, sel, showUpload))
    .map((s) => relabelAgentForRuntime(s, lang, sel.runtime));
}

/** Lang-independent visible station ids for a selection — used by the layout. */
export function visibleStationIdsFor(sel: ResolvedSelection, showUpload = false): StationId[] {
  return STATIONS_SRC.filter((s) => isStationVisible(s.id, sel, showUpload)).map((s) => s.id);
}

export function visibleHopsFor(lang: Lang, sel: ResolvedSelection, showUpload = false): HopMeta[] {
  const visible = new Set(visibleStationIdsFor(sel, showUpload));
  // 088-network-layer — when the ingress chain is on, the request really traverses
  // the appliances, so the direct frontend→backend hop is replaced by the chain
  // (frontend→dns→…→apigw→backend). Hide the direct hop to avoid drawing both.
  const chainOn = visible.has("dns");
  return hopsFor(lang).filter((h) => {
    if (chainOn && h.source === "frontend" && h.target === "backend") return false;
    return visible.has(h.source) && visible.has(h.target);
  });
}

export function visibleTiersFor(lang: Lang, sel: ResolvedSelection, showUpload = false): TierMeta[] {
  // A tier is shown only if it has at least one visible station — an empty tier box
  // would be a stray label.
  const liveTierIds = new Set(
    STATIONS_SRC.filter((s) => isStationVisible(s.id, sel, showUpload)).map((s) => s.tier),
  );
  return tiersFor(lang).filter((t) => liveTierIds.has(t.id));
}
