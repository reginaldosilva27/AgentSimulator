// Curated learning content for the "Learn" page — a roadmap.sh-style map that
// explains this project's architecture, the software & Gen-AI concepts it uses
// (and why), security per layer, networking/infra, and databases.
//
// Everything is grounded in the actual codebase, so it doubles as documentation.
//
// Prose is authored as `{ en, pt }`; structural data (ids, icons, accents) and
// code/file-path references stay plain. Use `sectionsFor(lang)` /
// `allTopicsFor(lang)` to get fully-resolved, plain-string content (cached per
// language so references stay stable across renders).

import type { Lang } from "../i18n";
import { type CloudId, cloudValue } from "../lib/cloud";
import { boundaryFor, stationByIdFor, tierByIdFor } from "../lib/stations";

/** A translatable string: either identical across languages, or per-language. */
type Tr = string | { en: string; pt: string };
const r = (v: Tr, lang: Lang): string => (typeof v === "string" ? v : v[lang]);

// --- Resolved (public) types — what components consume, all plain strings ----

/** A curated external reference. Labels/URLs are proper nouns — never translated. */
export interface StudyLink {
  label: string;
  url: string;
}

export interface Topic {
  id: string;
  title: string;
  what: string; // what it is
  why: string; // why it's used here
  how: string; // how it works — the mechanism, study-grade
  options: string; // other options / alternatives + the trade-off
  where?: string; // where to find it in the project
  links?: StudyLink[]; // curated external references (optional)
  cloudRef?: string; // station/tier/boundary id whose clouds{} service name this borrows
  cloud?: { azure?: string; aws?: string; gcp?: string }; // hand-authored per-cloud note
}

export interface Section {
  id: string;
  title: string;
  icon: string;
  accent: string;
  intro: string;
  topics: Topic[];
}

// --- Source data (translatable fields as `Tr`) -------------------------------

type TopicSrc = Omit<Topic, "title" | "what" | "why" | "how" | "options" | "cloud"> & {
  title: Tr;
  what: Tr;
  why: Tr;
  how: Tr;
  options: Tr;
  cloud?: { azure?: Tr; aws?: Tr; gcp?: Tr };
};
type SectionSrc = Omit<Section, "title" | "intro" | "topics"> & {
  title: Tr;
  intro: Tr;
  topics: TopicSrc[];
};

const SECTIONS_SRC: SectionSrc[] = [
  {
    id: "architecture",
    title: { en: "Architecture & Layers", pt: "Arquitetura e Camadas" },
    icon: "🏛️",
    accent: "var(--color-sky)",
    intro: {
      en: "The app is split into independent layers (tiers). Each is a separate container that can be built, deployed, scaled and secured on its own.",
      pt: "O app é dividido em camadas independentes (tiers). Cada uma é um container separado que pode ser construído, implantado, escalado e protegido por conta própria.",
    },
    topics: [
      {
        id: "project-structure",
        title: { en: "Project structure", pt: "Estrutura do projeto" },
        what: {
          en: "A monorepo with backend/ (FastAPI + LangGraph agent, RAG, MCP), frontend/ (React + Vite), and docs/.",
          pt: "Um monorepo com backend/ (agente FastAPI + LangGraph, RAG, MCP), frontend/ (React + Vite) e docs/.",
        },
        why: {
          en: "Keeping backend and frontend in one repo with clear folders makes the system easy to read, build, test and deploy independently — while sharing one event contract.",
          pt: "Manter backend e frontend em um só repositório com pastas claras torna o sistema fácil de ler, construir, testar e implantar de forma independente — compartilhando um único contrato de eventos.",
        },
        how: {
          en: "Two deployable apps (`backend/`, `frontend/`) plus `docs/` live in one Git repo; each builds and ships on its own, but they share a single event contract so the wire format can't drift.",
          pt: "Dois apps implantáveis (`backend/`, `frontend/`) mais `docs/` vivem em um só repositório Git; cada um constrói e implanta por conta própria, mas compartilham um único contrato de eventos para o formato de transmissão não divergir.",
        },
        options: {
          en: "Alternatives: a polyrepo (one repo per service — stronger isolation, harder cross-cutting changes) or a tooling-managed monorepo (Nx, Turborepo, pnpm workspaces) once the number of packages grows.",
          pt: "Alternativas: um polyrepo (um repositório por serviço — mais isolamento, mudanças transversais mais difíceis) ou um monorepo gerenciado por ferramentas (Nx, Turborepo, pnpm workspaces) quando o número de pacotes cresce.",
        },
        where: "repository root · backend/ · frontend/ · docs/",
      },
      {
        id: "tiers",
        title: { en: "Tiered architecture", pt: "Arquitetura em camadas" },
        what: {
          en: "Four tiers, each with its classic n-tier name: Client (Presentation), API (Application), Agent (Compute/worker), and AI & Data Services (Data) — which holds the LLM, the vector DB and the application database.",
          pt: "Quatro camadas, cada uma com seu nome clássico de n-tier: Cliente (Apresentação), API (Aplicação), Agente (Compute/worker) e Serviços de IA e Dados (Dados) — que abriga o LLM, o vector DB e o banco de dados da aplicação.",
        },
        why: {
          en: "Separating tiers gives independent scaling and clear security boundaries: only the Client is on the public internet, everything else sits inside a private network (VNet / VPC). The friendly names stay aligned with the market-standard n-tier model.",
          pt: "Separar as camadas dá escalabilidade independente e fronteiras de segurança claras: só o Cliente fica na internet pública, todo o resto vive dentro de uma rede privada (VNet / VPC). Os nomes amigáveis ficam alinhados ao modelo n-tier padrão de mercado.",
        },
        how: {
          en: "Each tier is an independent unit of deployment with a network boundary around it; requests flow Client → API → Agent → Services, and only the Client is exposed to the internet.",
          pt: "Cada camada é uma unidade independente de implantação com uma fronteira de rede ao redor; as requisições fluem Cliente → API → Agente → Serviços, e só o Cliente fica exposto à internet.",
        },
        options: {
          en: "Alternatives to n-tier: a single monolith (simplest, scales as one block), microservices (many small services, more ops), or serverless functions (no servers to manage, but cold starts and lock-in).",
          pt: "Alternativas ao n-tier: um monólito único (mais simples, escala como um bloco), microsserviços (muitos serviços pequenos, mais operação) ou funções serverless (sem servidores para gerenciar, mas com cold starts e lock-in).",
        },
        where: "frontend/src/lib/stations.ts (TIERS_SRC · alias)",
      },
      {
        id: "client-tier",
        title: { en: "Client tier", pt: "Camada cliente" },
        what: {
          en: "A React single-page app running entirely in the user's browser, served as static files.",
          pt: "Um app React de página única rodando inteiramente no navegador do usuário, servido como arquivos estáticos.",
        },
        why: {
          en: "Static assets are cheap to host on a CDN and infinitely scalable; the heavy lifting (state, animation) happens on the user's device, not your servers.",
          pt: "Arquivos estáticos são baratos de hospedar em CDN e escalam infinitamente; o trabalho pesado (estado, animação) acontece no dispositivo do usuário, não nos seus servidores.",
        },
        how: {
          en: "The build is a bundle of static files (HTML/JS/CSS) uploaded to object storage and served from a CDN edge close to the user; there is no server-side rendering.",
          pt: "O build é um pacote de arquivos estáticos (HTML/JS/CSS) enviado para um armazenamento de objetos e servido por uma borda de CDN próxima ao usuário; não há renderização no servidor.",
        },
        options: {
          en: "Alternatives: server-side rendering (Next.js, Remix) for SEO and a faster first paint, or a managed host (Vercel, Netlify, Cloudflare Pages) instead of raw object storage + CDN.",
          pt: "Alternativas: renderização no servidor (Next.js, Remix) para SEO e primeiro paint mais rápido, ou um host gerenciado (Vercel, Netlify, Cloudflare Pages) no lugar de armazenamento de objetos + CDN puro.",
        },
        cloudRef: "client",
        where: "frontend/ · served by nginx in Docker",
      },
      {
        id: "api-tier",
        title: { en: "API tier (gateway)", pt: "Camada de API (gateway)" },
        what: {
          en: "A FastAPI service: the single public entrypoint. It terminates TLS, validates input, runs the agent, and streams events back.",
          pt: "Um serviço FastAPI: o único ponto de entrada público. Ele encerra o TLS, valida a entrada, executa o agente e transmite os eventos de volta.",
        },
        why: {
          en: "A gateway centralizes cross-cutting concerns (auth, CORS, rate limits, TLS) and is the only component exposed to the internet.",
          pt: "Um gateway centraliza preocupações transversais (autenticação, CORS, limites de taxa, TLS) e é o único componente exposto à internet.",
        },
        how: {
          en: "A long-running container behind a load balancer terminates TLS, runs the ASGI app, and holds the SSE response open for the life of a turn; it is the only tier with a public ingress.",
          pt: "Um container de longa duração atrás de um balanceador encerra o TLS, roda o app ASGI e mantém a resposta SSE aberta durante todo o turno; é a única camada com ingress público.",
        },
        options: {
          en: "Alternatives: serverless functions (great for spiky, short requests — but streaming and warm state are awkward), an API gateway fronting many services, or a Kubernetes ingress for full control.",
          pt: "Alternativas: funções serverless (ótimas para requisições curtas e irregulares — mas streaming e estado quente ficam difíceis), um API gateway na frente de vários serviços, ou um ingress no Kubernetes para controle total.",
        },
        cloudRef: "api",
        where: "backend/app/main.py",
      },
      {
        id: "agent-tier",
        title: { en: "Agent tier", pt: "Camada do agente" },
        what: {
          en: "The LangGraph agent runtime, on a private network — not reachable from the internet.",
          pt: "O runtime do agente LangGraph, em rede privada — inacessível pela internet.",
        },
        why: {
          en: "Isolating the agent protects model API keys and tools behind the API, and lets you scale the (CPU/latency-heavy) AI logic separately from the web layer.",
          pt: "Isolar o agente protege as chaves de API do modelo e as ferramentas atrás da API, e permite escalar a lógica de IA (pesada em CPU/latência) separadamente da camada web.",
        },
        how: {
          en: "The agent runs as a private service with no public address; the API reaches it over the internal network, and only it holds the model keys and makes egress calls to the LLM and tools.",
          pt: "O agente roda como um serviço privado sem endereço público; a API o alcança pela rede interna, e só ele guarda as chaves do modelo e faz chamadas de egress ao LLM e às ferramentas.",
        },
        options: {
          en: "Alternatives: fold the agent into the API process (simpler, but couples scaling and pushes keys outward), or move long tasks onto a queue + worker pool (Celery, SQS) for durability and backpressure.",
          pt: "Alternativas: juntar o agente ao processo da API (mais simples, mas acopla a escala e expõe as chaves), ou mover tarefas longas para uma fila + pool de workers (Celery, SQS) por durabilidade e backpressure.",
        },
        cloudRef: "agent",
        where: "backend/app/agent/",
      },
      {
        id: "services-tier",
        title: { en: "AI & data services", pt: "Serviços de IA e dados" },
        what: {
          en: "Stateful or managed dependencies: the application database (relational), the vector database (RAG), the MCP tool server, and the LLM endpoint.",
          pt: "Dependências com estado ou gerenciadas: o banco de dados da aplicação (relacional), o banco vetorial (RAG), o servidor de ferramentas MCP e o endpoint do LLM.",
        },
        why: {
          en: "Stateless app tiers stay simple and disposable; state and external capabilities live in dedicated services you manage and back up independently. Note the two databases: a relational one for app state, a vector one for retrieval — different jobs, different stores.",
          pt: "Camadas de aplicação sem estado ficam simples e descartáveis; o estado e as capacidades externas vivem em serviços dedicados que você gerencia e faz backup de forma independente. Repare nos dois bancos: um relacional para o estado da app, um vetorial para a recuperação — trabalhos diferentes, armazenamentos diferentes.",
        },
        how: {
          en: "Stateful dependencies sit behind their own (often private) endpoints — the relational DB, the vector DB, the MCP tool server and the model endpoint — each managed, backed up and scaled on its own.",
          pt: "As dependências com estado ficam atrás de seus próprios endpoints (em geral privados) — o banco relacional, o vetorial, o servidor de ferramentas MCP e o endpoint do modelo — cada um gerenciado, com backup e escalado por conta própria.",
        },
        options: {
          en: "Alternatives: self-host every dependency (max control, max ops) or go fully managed/serverless (less ops, less control). Splitting transactional and vector stores is itself a deliberate design choice.",
          pt: "Alternativas: hospedar você mesmo cada dependência (controle máximo, operação máxima) ou ir totalmente gerenciado/serverless (menos operação, menos controle). Separar o banco transacional do vetorial já é uma escolha de design.",
        },
        cloudRef: "services",
        where: "backend/app/db/ · backend/app/rag/ · backend/app/mcp/ · backend/app/llm/",
      },
    ],
  },
  {
    id: "software",
    title: { en: "Software Engineering", pt: "Engenharia de Software" },
    icon: "🧩",
    accent: "var(--color-violet)",
    intro: {
      en: "The patterns that keep the system clean: an event contract, swappable providers, an explicit state machine, type safety, tests and containers.",
      pt: "Os padrões que mantêm o sistema limpo: um contrato de eventos, provedores intercambiáveis, uma máquina de estados explícita, segurança de tipos, testes e containers.",
    },
    topics: [
      {
        id: "event-driven",
        title: { en: "Event-driven streaming", pt: "Streaming orientado a eventos" },
        what: {
          en: "Every stage emits a TraceEvent; the backend streams them to the browser over Server-Sent Events (SSE).",
          pt: "Cada etapa emite um TraceEvent; o backend os transmite ao navegador via Server-Sent Events (SSE).",
        },
        why: {
          en: "Events decouple the pipeline (producer) from the UI (consumer), enable real-time visualization, and let the same log drive live view and replay.",
          pt: "Eventos desacoplam o pipeline (produtor) da UI (consumidor), permitem visualização em tempo real e deixam o mesmo log alimentar a visão ao vivo e o replay.",
        },
        how: {
          en: "The pipeline pushes typed events as they happen; the browser holds one HTTP connection open and the server writes each event to it (SSE). The same event log can be replayed later.",
          pt: "O pipeline empurra eventos tipados conforme acontecem; o navegador mantém uma conexão HTTP aberta e o servidor escreve cada evento nela (SSE). O mesmo log de eventos pode ser reproduzido depois.",
        },
        options: {
          en: "Alternatives: WebSockets (bidirectional, heavier), short polling (simple, wasteful), or a message broker (Kafka, RabbitMQ) when many consumers need the same stream.",
          pt: "Alternativas: WebSockets (bidirecional, mais pesado), polling curto (simples, desperdiça recursos) ou um broker de mensagens (Kafka, RabbitMQ) quando muitos consumidores precisam do mesmo fluxo.",
        },
        links: [
          {
            label: "MDN — Server-sent events",
            url: "https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events",
          },
        ],
        where: "backend/app/trace.py · backend/app/main.py",
      },
      {
        id: "contract",
        title: { en: "Shared event contract", pt: "Contrato de eventos compartilhado" },
        what: {
          en: "The event schema is defined once with Pydantic and mirrored as TypeScript types.",
          pt: "O schema de eventos é definido uma vez com Pydantic e espelhado como tipos TypeScript.",
        },
        why: {
          en: "A single source of truth for the backend↔frontend protocol eliminates a whole class of integration bugs and makes the wire format self-documenting.",
          pt: "Uma única fonte de verdade para o protocolo backend↔frontend elimina uma classe inteira de bugs de integração e torna o formato de transmissão autodocumentado.",
        },
        how: {
          en: "Pydantic models define the schema on the backend; a hand-maintained TypeScript file mirrors them on the frontend. Change one side and the other must follow or the build breaks.",
          pt: "Modelos Pydantic definem o schema no backend; um arquivo TypeScript mantido à mão os espelha no frontend. Mude um lado e o outro precisa acompanhar ou o build quebra.",
        },
        options: {
          en: "Alternatives: generate the types from an OpenAPI / JSON-Schema spec, use a shared IDL like Protobuf/gRPC, or tRPC to share types directly when both ends are TypeScript.",
          pt: "Alternativas: gerar os tipos a partir de um spec OpenAPI / JSON-Schema, usar uma IDL compartilhada como Protobuf/gRPC, ou tRPC para compartilhar tipos diretamente quando os dois lados são TypeScript.",
        },
        where: "backend/app/schemas.py ↔ frontend/src/types/events.ts",
      },
      {
        id: "provider-pattern",
        title: { en: "Provider pattern (Strategy)", pt: "Padrão Provider (Strategy)" },
        what: {
          en: "An LLMProvider interface with one implementation today (OpenAI); the seam keeps the agent decoupled from any single model SDK.",
          pt: "Uma interface LLMProvider com uma implementação hoje (OpenAI); a costura mantém o agente desacoplado de qualquer SDK de modelo específico.",
        },
        why: {
          en: "The Strategy pattern lets the agent stay identical while the model behind it changes — so swapping models (or adding Azure OpenAI / Bedrock / Vertex later) never touches the agent loop.",
          pt: "O padrão Strategy mantém o agente idêntico enquanto o modelo por trás muda — então trocar de modelo (ou adicionar Azure OpenAI / Bedrock / Vertex depois) nunca mexe no loop do agente.",
        },
        how: {
          en: "An abstract `LLMProvider` declares the methods the agent needs (decide, stream); a concrete class implements them per vendor. The agent depends on the interface, never the SDK.",
          pt: "Um `LLMProvider` abstrato declara os métodos de que o agente precisa (decidir, transmitir); uma classe concreta os implementa por fornecedor. O agente depende da interface, nunca do SDK.",
        },
        options: {
          en: "Alternatives: a router library like LiteLLM (one API across 100+ models) or LangChain's chat-model abstraction — both are the Strategy pattern packaged as a dependency.",
          pt: "Alternativas: uma biblioteca roteadora como LiteLLM (uma API para mais de 100 modelos) ou a abstração de chat models do LangChain — ambas são o padrão Strategy empacotado como dependência.",
        },
        where: "backend/app/llm/provider.py",
      },
      {
        id: "state-machine",
        title: { en: "State machine orchestration", pt: "Orquestração por máquina de estados" },
        what: {
          en: "The agent is a LangGraph StateGraph with explicit nodes and edges, not ad-hoc control flow.",
          pt: "O agente é um StateGraph do LangGraph com nós e arestas explícitos, não um fluxo de controle improvisado.",
        },
        why: {
          en: "Modeling the loop as a graph makes it legible, testable, and easy to extend (add memory, retries, human-in-the-loop) without spaghetti.",
          pt: "Modelar o loop como um grafo o torna legível, testável e fácil de estender (memória, retentativas, humano no loop) sem virar espaguete.",
        },
        how: {
          en: "Nodes are functions; edges decide what runs next. A conditional edge loops `think → tools → think` while calls are pending and the step budget allows, then exits to `generate`.",
          pt: "Nós são funções; arestas decidem o que roda em seguida. Uma aresta condicional faz o loop `think → tools → think` enquanto há chamadas pendentes e o orçamento de passos permite, depois sai para `generate`.",
        },
        options: {
          en: "Alternatives: plain imperative control flow (fast to write, hard to inspect), or a durable workflow engine (Temporal, AWS Step Functions) when steps must survive crashes and retries.",
          pt: "Alternativas: fluxo de controle imperativo simples (rápido de escrever, difícil de inspecionar) ou um motor de workflow durável (Temporal, AWS Step Functions) quando os passos precisam sobreviver a falhas e retries.",
        },
        where: "backend/app/agent/graph.py",
      },
      {
        id: "type-safety",
        title: { en: "End-to-end type safety", pt: "Segurança de tipos ponta a ponta" },
        what: {
          en: "Pydantic models on the backend, strict TypeScript on the frontend.",
          pt: "Modelos Pydantic no backend, TypeScript estrito no frontend.",
        },
        why: {
          en: "Types catch mistakes at the boundaries (request bodies, event payloads) before runtime and serve as living documentation.",
          pt: "Tipos pegam erros nas fronteiras (corpos de requisição, payloads de eventos) antes da execução e servem como documentação viva.",
        },
        how: {
          en: "Pydantic validates and coerces data at the Python boundary at runtime; TypeScript checks the frontend at compile time (`tsc --noEmit`). Bad shapes fail before they reach logic.",
          pt: "O Pydantic valida e coage dados na fronteira Python em tempo de execução; o TypeScript checa o frontend em tempo de compilação (`tsc --noEmit`). Formatos errados falham antes de chegar à lógica.",
        },
        options: {
          en: "Alternatives on the frontend: runtime validators like Zod or io-ts that also infer types — useful where data crosses the wire and compile-time types alone can't guarantee the shape.",
          pt: "Alternativas no frontend: validadores em tempo de execução como Zod ou io-ts que também inferem tipos — úteis onde os dados cruzam a rede e tipos só em compilação não garantem o formato.",
        },
        where: "pydantic models · tsconfig strict mode",
      },
      {
        id: "testing-demo",
        title: { en: "Structural tests", pt: "Testes estruturais" },
        what: {
          en: "pytest covers the protocol, RAG, MCP and the agent against real OpenAI; assertions are structural (stages fired, tool used, answer non-empty, relevant doc ranks first) so they tolerate model variability.",
          pt: "O pytest cobre o protocolo, o RAG, o MCP e o agente contra a OpenAI real; as asserções são estruturais (etapas disparadas, ferramenta usada, resposta não vazia, doc relevante em primeiro) para tolerar a variabilidade do modelo.",
        },
        why: {
          en: "The app is OpenAI-only — there is no mock to fall back on, so tests exercise the real provider (CI supplies the key as a secret). Structural assertions keep them stable despite nondeterministic generations.",
          pt: "O app é exclusivamente OpenAI — não há mock para usar como fallback, então os testes exercitam o provider real (o CI fornece a chave como secret). As asserções estruturais os mantêm estáveis apesar das gerações não determinísticas.",
        },
        how: {
          en: "Tests hit the real model and assert structure — a stage fired, a tool was used, the answer is non-empty, the relevant doc ranks first — instead of pinning exact text the model may vary.",
          pt: "Os testes batem no modelo real e verificam estrutura — uma etapa disparou, uma ferramenta foi usada, a resposta não está vazia, o doc relevante ficou em primeiro — em vez de fixar texto exato que o modelo pode variar.",
        },
        options: {
          en: "Alternatives: record/replay cassettes (VCR.py) to freeze responses, full mocks (fast, but can drift from reality), or LLM-as-judge evals for graded quality scores.",
          pt: "Alternativas: cassetes record/replay (VCR.py) para congelar respostas, mocks completos (rápidos, mas podem divergir da realidade) ou avaliações com LLM-juiz para notas de qualidade.",
        },
        where: "backend/tests/",
      },
      {
        id: "config",
        title: { en: "12-factor configuration", pt: "Configuração 12-factor" },
        what: {
          en: "Config comes from environment variables / .env via pydantic-settings; nothing is hardcoded.",
          pt: "A configuração vem de variáveis de ambiente / .env via pydantic-settings; nada fica codificado no código.",
        },
        why: {
          en: "The same container image runs in every environment; secrets are injected at runtime, never committed. OPENAI_API_KEY is required — with no key the app fails fast at startup.",
          pt: "A mesma imagem de container roda em todos os ambientes; segredos são injetados em tempo de execução, nunca comitados. A OPENAI_API_KEY é obrigatória — sem chave, o app falha rápido na inicialização.",
        },
        how: {
          en: "`pydantic-settings` reads typed values from environment variables / `.env` at startup and fails fast if a required one (the API key) is missing — config is data, not code.",
          pt: "O `pydantic-settings` lê valores tipados de variáveis de ambiente / `.env` na inicialização e falha rápido se faltar um obrigatório (a chave de API) — configuração é dado, não código.",
        },
        options: {
          en: "Alternatives: a secrets manager (Vault, cloud KMS) for sensitive values, or runtime config maps / parameter stores so one image picks up environment-specific values without a rebuild.",
          pt: "Alternativas: um gerenciador de segredos (Vault, KMS de nuvem) para valores sensíveis, ou config maps / parameter stores em tempo de execução para uma imagem pegar valores por ambiente sem rebuild.",
        },
        where: "backend/app/config.py · .env.example",
      },
      {
        id: "containers",
        title: { en: "Containerization", pt: "Containerização" },
        what: {
          en: "Each service has a Dockerfile; docker-compose runs the whole stack with one command.",
          pt: "Cada serviço tem um Dockerfile; o docker-compose sobe toda a stack com um único comando.",
        },
        why: {
          en: "Containers give reproducible builds and dev/prod parity, and are the unit of deployment for the tiers above.",
          pt: "Containers garantem builds reproduzíveis e paridade dev/prod, e são a unidade de implantação das camadas acima.",
        },
        how: {
          en: "A Dockerfile pins the runtime, installs deps and copies the app into an image; `docker compose` wires the services, ports and volumes so one command brings the whole stack up.",
          pt: "Um Dockerfile fixa o runtime, instala dependências e copia o app em uma imagem; o `docker compose` conecta os serviços, portas e volumes para um comando subir toda a stack.",
        },
        options: {
          en: "Alternatives: Cloud Native Buildpacks or Nix for reproducible images without a Dockerfile, or shipping straight to a PaaS that builds from source — trading control for convenience.",
          pt: "Alternativas: Cloud Native Buildpacks ou Nix para imagens reproduzíveis sem Dockerfile, ou publicar direto em um PaaS que constrói a partir do código — trocando controle por conveniência.",
        },
        where: "backend/Dockerfile · frontend/Dockerfile · docker-compose.yml",
      },
      {
        id: "langgraph",
        title: { en: "LangGraph", pt: "LangGraph" },
        what: {
          en: "The framework the agent is built on: you declare a typed state, register nodes (functions) and wire edges (including conditional ones) into a graph, then compile and invoke it.",
          pt: "O framework em que o agente é construído: você declara um estado tipado, registra nós (funções) e conecta arestas (inclusive condicionais) em um grafo, depois compila e o invoca.",
        },
        why: {
          en: "LangGraph gives the ReAct loop a legible, testable shape — state in/out per node, an explicit step budget, and per-request dependencies passed via config[\"configurable\"] instead of globals. The compiled graph is cached.",
          pt: "O LangGraph dá ao loop ReAct uma forma legível e testável — estado entra/sai por nó, um orçamento de passos explícito e dependências por requisição passadas via config[\"configurable\"] em vez de globais. O grafo compilado é cacheado.",
        },
        how: {
          en: "StateGraph builds the DAG; add_conditional_edges decides whether to loop back to tools or finish; .compile() produces a runnable, and _deps() reads the emitter/provider/registry from the run config.",
          pt: "O StateGraph monta o DAG; add_conditional_edges decide se volta às ferramentas ou termina; .compile() produz um executável, e _deps() lê emitter/provider/registry da config da execução.",
        },
        options: {
          en: "Alternatives: LangChain's AgentExecutor (higher-level, less control), CrewAI or AutoGen (multi-agent first), the OpenAI Agents SDK, or a hand-rolled while-loop for full transparency.",
          pt: "Alternativas: o AgentExecutor do LangChain (mais alto nível, menos controle), CrewAI ou AutoGen (multiagente primeiro), o OpenAI Agents SDK, ou um while-loop feito à mão para transparência total.",
        },
        links: [
          { label: "LangGraph docs", url: "https://langchain-ai.github.io/langgraph/" },
        ],
        where: "backend/app/agent/graph.py · state.py",
      },
      {
        id: "i18n-bilingual",
        title: { en: "Internationalization (i18n)", pt: "Internacionalização (i18n)" },
        what: {
          en: "Every user-facing string ships in English and Portuguese. Prose is authored as { en, pt } objects resolved per language; UI chrome lives in a typed Strings interface that keeps both languages in lockstep.",
          pt: "Cada texto voltado ao usuário existe em inglês e português. A prosa é escrita como objetos { en, pt } resolvidos por idioma; o chrome da UI vive numa interface Strings tipada que mantém os dois idiomas em sincronia.",
        },
        why: {
          en: "A bilingual portfolio reaches a wider audience, and making pt non-optional (a project rule) means an English-only label can never silently ship — the type system and a parity test enforce it.",
          pt: "Um portfólio bilíngue alcança mais gente, e tornar o pt obrigatório (uma regra do projeto) significa que um rótulo só em inglês nunca passa despercebido — o sistema de tipos e um teste de paridade garantem isso.",
        },
        how: {
          en: "*For(lang) builders walk the source data, resolve each { en, pt } to a plain string, and cache the result per language; code, protocols and proper nouns stay untranslated plain strings.",
          pt: "Construtores *For(lang) percorrem os dados de origem, resolvem cada { en, pt } para uma string simples e cacheiam o resultado por idioma; código, protocolos e nomes próprios ficam como strings simples não traduzidas.",
        },
        options: {
          en: "Alternatives: a library like i18next or react-intl with ICU message format and pluralization, or extracted .po / JSON catalogs translated outside the codebase — better at scale, heavier to set up.",
          pt: "Alternativas: uma biblioteca como i18next ou react-intl com formato de mensagem ICU e pluralização, ou catálogos .po / JSON extraídos e traduzidos fora do código — melhores em escala, mais pesados de configurar.",
        },
        where: "frontend/src/i18n/ · *For(lang) builders in stations.ts & content.ts",
      },
    ],
  },
  {
    id: "genai",
    title: { en: "Gen AI Concepts", pt: "Conceitos de Gen AI" },
    icon: "🤖",
    accent: "var(--color-pink)",
    intro: {
      en: "The AI building blocks: tokens, embeddings, retrieval, agents, tools and streaming — and why each one is used here.",
      pt: "Os blocos de construção da IA: tokens, embeddings, recuperação, agentes, ferramentas e streaming — e por que cada um é usado aqui.",
    },
    topics: [
      {
        id: "tokens",
        title: { en: "Tokens & LLMs", pt: "Tokens e LLMs" },
        what: {
          en: "An LLM predicts the next token; both prompt and answer are measured in tokens, which drives cost and latency.",
          pt: "Um LLM prevê o próximo token; tanto o prompt quanto a resposta são medidos em tokens, o que determina custo e latência.",
        },
        why: {
          en: "Understanding tokens explains why context is budgeted and why longer answers take longer — the model does one forward pass per token.",
          pt: "Entender tokens explica por que o contexto é orçado e por que respostas mais longas demoram mais — o modelo faz um forward pass por token.",
        },
        how: {
          en: "A tokenizer (byte-pair encoding) splits text into subword tokens, each mapped to an id; the model does one forward pass per generated token, so cost and latency scale with token count.",
          pt: "Um tokenizador (byte-pair encoding) divide o texto em tokens de subpalavra, cada um mapeado a um id; o modelo faz um forward pass por token gerado, então custo e latência crescem com a contagem de tokens.",
        },
        options: {
          en: "Different model families use different tokenizers (OpenAI's cl100k / o200k, Llama's SentencePiece), so the same text costs a different number of tokens depending on the model.",
          pt: "Famílias de modelos diferentes usam tokenizadores diferentes (cl100k / o200k da OpenAI, SentencePiece do Llama), então o mesmo texto custa um número diferente de tokens conforme o modelo.",
        },
        links: [{ label: "OpenAI Tokenizer", url: "https://platform.openai.com/tokenizer" }],
        where: "knowledge corpus: llm-basics.md",
      },
      {
        id: "embeddings",
        title: { en: "Embeddings", pt: "Embeddings" },
        what: {
          en: "A vector that captures the meaning of text; similar meanings map to nearby vectors.",
          pt: "Um vetor que captura o significado de um texto; significados parecidos mapeiam para vetores próximos.",
        },
        why: {
          en: "Embeddings power semantic search — finding relevant text even when it shares no exact words with the query.",
          pt: "Embeddings alimentam a busca semântica — encontrar texto relevante mesmo quando ele não compartilha palavras exatas com a consulta.",
        },
        how: {
          en: "An embedding model maps text to a fixed-length vector (e.g. 1536 dims); training pulls similar meanings close and pushes different ones apart, so geometric distance ≈ semantic distance.",
          pt: "Um modelo de embedding mapeia texto para um vetor de tamanho fixo (ex.: 1536 dimensões); o treino aproxima significados parecidos e afasta os diferentes, então distância geométrica ≈ distância semântica.",
        },
        options: {
          en: "Alternatives to OpenAI's text-embedding-3: open models (BGE, E5, sentence-transformers) you can self-host, or Cohere / Voyage embeddings — they trade dimensions, cost and quality.",
          pt: "Alternativas ao text-embedding-3 da OpenAI: modelos abertos (BGE, E5, sentence-transformers) que você pode hospedar, ou embeddings da Cohere / Voyage — variam em dimensões, custo e qualidade.",
        },
        cloudRef: "llm",
        links: [
          { label: "OpenAI Embeddings guide", url: "https://platform.openai.com/docs/guides/embeddings" },
        ],
        where: "backend/app/rag/embeddings.py",
      },
      {
        id: "vector-search",
        title: { en: "Vector search & cosine", pt: "Busca vetorial e cosseno" },
        what: {
          en: "Comparing the query vector to stored vectors with cosine similarity to find the closest matches.",
          pt: "Comparar o vetor da consulta com os vetores armazenados usando similaridade de cosseno para achar as correspondências mais próximas.",
        },
        why: {
          en: "Cosine ignores magnitude and captures direction (meaning), which is the standard, robust metric for text retrieval.",
          pt: "O cosseno ignora a magnitude e captura a direção (o significado), que é a métrica padrão e robusta para recuperação de texto.",
        },
        how: {
          en: "Cosine similarity is the dot product of the L2-normalized query and stored vectors; Chroma returns a distance, and the retriever converts it to a 0..1 score via `similarity = 1 - distance`.",
          pt: "A similaridade de cosseno é o produto escalar dos vetores normalizados (L2) da consulta e dos armazenados; o Chroma retorna uma distância, e o retriever a converte num score 0..1 via `similaridade = 1 - distância`.",
        },
        options: {
          en: "Alternatives: dot-product or Euclidean (L2) distance, or Maximal Marginal Relevance (MMR) to trade a little similarity for more diversity among the returned chunks.",
          pt: "Alternativas: produto escalar ou distância euclidiana (L2), ou Maximal Marginal Relevance (MMR) para trocar um pouco de similaridade por mais diversidade entre os trechos retornados.",
        },
        where: "backend/app/rag/retriever.py",
      },
      {
        id: "rag",
        title: { en: "Retrieval-Augmented Generation", pt: "Geração Aumentada por Recuperação (RAG)" },
        what: {
          en: "Retrieve relevant chunks at query time and put them in the prompt as grounding context.",
          pt: "Recuperar trechos relevantes no momento da consulta e colocá-los no prompt como contexto de fundamentação.",
        },
        why: {
          en: "RAG lets the model answer about private or recent data it never trained on, and reduces hallucinations by grounding answers in real sources.",
          pt: "O RAG permite ao modelo responder sobre dados privados ou recentes nos quais ele nunca treinou, e reduz alucinações ao fundamentar as respostas em fontes reais.",
        },
        how: {
          en: "At query time: embed the question, retrieve the top-k nearest chunks, and paste them into the prompt as context — the model answers from what's in front of it, grounded in real sources.",
          pt: "No momento da consulta: gere o embedding da pergunta, recupere os top-k trechos mais próximos e cole-os no prompt como contexto — o modelo responde a partir do que está diante dele, fundamentado em fontes reais.",
        },
        options: {
          en: "Alternatives: stuff everything into a long context window (simpler, costlier), fine-tune the model on the data (no retrieval, but stale), or GraphRAG / agentic RAG for multi-hop questions.",
          pt: "Alternativas: jogar tudo numa janela de contexto longa (mais simples, mais caro), fazer fine-tuning do modelo nos dados (sem recuperação, mas desatualizado), ou GraphRAG / RAG agêntico para perguntas multi-hop.",
        },
        links: [
          { label: "RAG paper (Lewis et al., 2020)", url: "https://arxiv.org/abs/2005.11401" },
        ],
        where: "backend/app/rag/",
      },
      {
        id: "chunking",
        title: { en: "Chunking", pt: "Chunking (fatiamento)" },
        what: {
          en: "Splitting documents into overlapping pieces before embedding them.",
          pt: "Dividir documentos em pedaços sobrepostos antes de gerar seus embeddings.",
        },
        why: {
          en: "Chunk size trades off relevance vs. context: too big dilutes, too small loses meaning. Overlap keeps ideas from being cut in half.",
          pt: "O tamanho do chunk equilibra relevância vs. contexto: grande demais dilui, pequeno demais perde sentido. A sobreposição evita que ideias sejam cortadas ao meio.",
        },
        how: {
          en: "The ingester splits each document into pieces of a target token size with some overlap, so a chunk is big enough to be meaningful but small enough to retrieve precisely.",
          pt: "O ingester divide cada documento em pedaços de um tamanho-alvo em tokens com alguma sobreposição, para um chunk ser grande o bastante para ter sentido e pequeno o bastante para ser recuperado com precisão.",
        },
        options: {
          en: "Alternatives: recursive splitting on structure (headings, paragraphs), semantic chunking (split where meaning shifts), or parent-document / late chunking that retrieves small but feeds large.",
          pt: "Alternativas: divisão recursiva pela estrutura (títulos, parágrafos), chunking semântico (dividir onde o sentido muda), ou parent-document / late chunking que recupera pequeno mas alimenta grande.",
        },
        where: "backend/app/rag/ingest.py",
      },
      {
        id: "agents-react",
        title: { en: "Agents & the ReAct loop", pt: "Agentes e o loop ReAct" },
        what: {
          en: "An LLM in a loop that can reason, call a tool, observe the result, and decide again — with a step limit.",
          pt: "Um LLM em loop que pode raciocinar, chamar uma ferramenta, observar o resultado e decidir de novo — com um limite de passos.",
        },
        why: {
          en: "Looping lets the agent gather information before answering; the bounded limit prevents runaway cost and latency.",
          pt: "O loop permite ao agente reunir informação antes de responder; o limite definido evita custo e latência descontrolados.",
        },
        how: {
          en: "Each turn the model either emits a final answer or a tool call; on a tool call the runtime executes it, appends the observation, and calls the model again — bounded by MAX_ITERATIONS.",
          pt: "A cada turno o modelo ou emite uma resposta final ou uma chamada de ferramenta; numa chamada o runtime a executa, anexa a observação e chama o modelo de novo — limitado por MAX_ITERATIONS.",
        },
        options: {
          en: "Alternatives: Plan-and-Execute (plan all steps up front), ReWOO (decouple reasoning from tool calls), Reflexion (self-critique and retry), or Tree-of-Thoughts (explore branches).",
          pt: "Alternativas: Plan-and-Execute (planejar todos os passos antes), ReWOO (desacoplar raciocínio das chamadas), Reflexion (autocrítica e nova tentativa) ou Tree-of-Thoughts (explorar ramificações).",
        },
        links: [
          { label: "ReAct paper (Yao et al., 2022)", url: "https://arxiv.org/abs/2210.03629" },
        ],
        where: "backend/app/agent/graph.py",
      },
      {
        id: "agent-harness",
        title: { en: "Agent harness", pt: "Agent harness" },
        what: {
          en: "The runtime scaffolding wrapped around a plain LLM that turns a single stateless completion into an agent: the reasoning loop, tool calling, layered system-prompt assembly, the context window, and working + long-term memory.",
          pt: "O arcabouço de runtime em volta de um LLM cru que transforma uma única completion sem estado em um agente: o loop de raciocínio, a chamada de ferramentas, a montagem do system prompt em camadas, a janela de contexto e a memória de trabalho + de longo prazo.",
        },
        why: {
          en: "An LLM call on its own only maps text to text — it can't act, remember, or decide when to stop. The harness is what supplies all of that. Naming it matters because this whole app *is* a harness: the Agent station you drill into is the harness made visible, with each part shown as its own panel.",
          pt: "Uma chamada de LLM sozinha só mapeia texto para texto — não age, não lembra e não decide quando parar. O harness é o que fornece tudo isso. Nomeá-lo importa porque todo este app *é* um harness: a station do Agente que você abre é o harness tornado visível, com cada parte mostrada em seu próprio painel.",
        },
        how: {
          en: "Here the harness is a bounded LangGraph state machine: route → think ⇄ tools → generate → respond. `think` asks the model to either answer or emit tool calls; the runtime executes each tool, appends the observation as a message, and loops back — capped by MAX_ITERATIONS. Around that loop it assembles the system prompt in layers (guardrails + role + skills + identity), packs the context window, and reads recent turns from the database as long-term memory. The deployment tier ('Agent Tier' / Compute (private)) is just *where* this harness runs; the harness is *what* it is.",
          pt: "Aqui o harness é uma máquina de estados LangGraph limitada: route → think ⇄ tools → generate → respond. O `think` pede ao modelo para responder ou emitir chamadas de ferramenta; o runtime executa cada ferramenta, anexa a observação como mensagem e volta ao loop — limitado por MAX_ITERATIONS. Em volta do loop ele monta o system prompt em camadas (guardrails + papel + skills + identidade), empacota a janela de contexto e lê os turnos recentes do banco como memória de longo prazo. O tier de deployment ('Agent Tier' / Compute (privado)) é só *onde* esse harness roda; o harness é *o que* ele é.",
        },
        options: {
          en: "Alternatives differ in how much the harness gives you: a hand-rolled SDK loop (full control, most glue code), OpenAI's Assistants/Agents SDK or LangChain AgentExecutor (batteries-included), LangGraph (explicit, inspectable graph — used here), or higher-level frameworks like CrewAI and DeepAgents that add planning and sub-agents on top.",
          pt: "As alternativas diferem em quanto o harness entrega: um loop feito à mão com o SDK (controle total, mais código de cola), o Assistants/Agents SDK da OpenAI ou o AgentExecutor do LangChain (baterias inclusas), o LangGraph (grafo explícito e inspecionável — usado aqui), ou frameworks de nível mais alto como CrewAI e DeepAgents que adicionam planejamento e subagentes por cima.",
        },
        cloudRef: "agent",
        links: [
          { label: "LangGraph — agent runtimes", url: "https://langchain-ai.github.io/langgraph/" },
        ],
        where: "backend/app/agent/graph.py",
      },
      {
        id: "tool-calling",
        title: { en: "Tool calling & MCP", pt: "Chamada de ferramentas e MCP" },
        what: {
          en: "The model chooses a tool and arguments; tools are exposed via the Model Context Protocol (MCP).",
          pt: "O modelo escolhe uma ferramenta e seus argumentos; as ferramentas são expostas pelo Model Context Protocol (MCP).",
        },
        why: {
          en: "Tools give the model real capabilities (math, time, lookups). MCP standardizes how apps connect to tools so they're reusable and swappable.",
          pt: "Ferramentas dão ao modelo capacidades reais (matemática, hora, consultas). O MCP padroniza como apps se conectam a ferramentas para que sejam reutilizáveis e intercambiáveis.",
        },
        how: {
          en: "The model returns a structured function call (name + JSON arguments) matching a tool's schema; the runtime runs the tool and feeds the result back. Tools are exposed over MCP (stdio here).",
          pt: "O modelo retorna uma chamada de função estruturada (nome + argumentos JSON) que casa com o schema de uma ferramenta; o runtime executa a ferramenta e devolve o resultado. As ferramentas são expostas via MCP (stdio aqui).",
        },
        options: {
          en: "Alternatives: native provider function-calling without MCP, JSON-mode prompting, or raw ReAct text parsing. MCP's value is a standard, reusable transport across apps and tools.",
          pt: "Alternativas: function-calling nativo do provedor sem MCP, prompting em modo JSON, ou parsing de texto ReAct cru. O valor do MCP é um transporte padrão e reutilizável entre apps e ferramentas.",
        },
        cloudRef: "mcp",
        links: [{ label: "Model Context Protocol", url: "https://modelcontextprotocol.io" }],
        where: "backend/app/mcp/",
      },
      {
        id: "agent-memory",
        title: { en: "Agent memory (working vs long-term)", pt: "Memória do agente (trabalho vs longo prazo)" },
        what: {
          en: "Working memory is the current request's state (messages + the tool scratchpad of act→observe steps); long-term memory survives across requests — here the conversation history in the app database, plus the RAG vector store as semantic memory.",
          pt: "A memória de trabalho é o estado da requisição atual (mensagens + o rascunho de ferramentas dos passos agir→observar); a memória de longo prazo sobrevive entre requisições — aqui o histórico de conversas no banco da aplicação, mais o vector store do RAG como memória semântica.",
        },
        why: {
          en: "Telling the two apart is core to agent design: working memory is cheap and ephemeral, long-term memory must be stored and retrieved. The history is folded into the real prompt — open the Agent's full view to see both.",
          pt: "Distinguir as duas é central no design de agentes: a de trabalho é barata e efêmera, a de longo prazo precisa ser armazenada e recuperada. O histórico entra no prompt de verdade — abra a visão completa do Agente para ver as duas.",
        },
        how: {
          en: "Working memory is the in-process AgentState for this request (messages + tool scratchpad); long-term memory is the conversation history read from the DB and folded into the prompt, plus the RAG store.",
          pt: "A memória de trabalho é o AgentState em processo desta requisição (mensagens + rascunho de ferramentas); a de longo prazo é o histórico lido do banco e dobrado no prompt, mais o store do RAG.",
        },
        options: {
          en: "Alternatives: a checkpointer (LangGraph's MemorySaver) to persist state across turns, conversation summarization to save tokens, or a dedicated memory service (Mem0, Zep).",
          pt: "Alternativas: um checkpointer (MemorySaver do LangGraph) para persistir estado entre turnos, sumarização da conversa para economizar tokens, ou um serviço de memória dedicado (Mem0, Zep).",
        },
        where: "backend/app/db/store.py · run_agent(history=…) · AgentDetail.tsx",
      },
      {
        id: "context-window",
        title: { en: "Context window assembly", pt: "Montagem da janela de contexto" },
        what: {
          en: "The single input the model actually receives: system prompt + retrieved context (RAG) + tool results + conversation history, each costing tokens within a finite budget.",
          pt: "A única entrada que o modelo de fato recebe: prompt de sistema + contexto recuperado (RAG) + resultados de ferramentas + histórico de conversa, cada parte custando tokens dentro de um orçamento finito.",
        },
        why: {
          en: "The context window is finite, so what you include (and leave out) is a real engineering decision; the Agent's full view shows the breakdown and an approximate token share per part.",
          pt: "A janela de contexto é finita, então o que você inclui (e deixa de fora) é uma decisão real de engenharia; a visão completa do Agente mostra a composição e a fração aproximada de tokens de cada parte.",
        },
        how: {
          en: "Everything is concatenated into one prompt — system + retrieved chunks + tool results + history + the user message — and must fit the model's token limit; what you include is an explicit budget.",
          pt: "Tudo é concatenado em um único prompt — sistema + trechos recuperados + resultados de ferramentas + histórico + a mensagem do usuário — e precisa caber no limite de tokens do modelo; o que você inclui é um orçamento explícito.",
        },
        options: {
          en: "Alternatives when it won't fit: context compression / summarization, retrieve fewer but better chunks (reranking), or a longer-context model (trading cost and 'lost in the middle' recall).",
          pt: "Alternativas quando não cabe: compressão/sumarização de contexto, recuperar menos trechos porém melhores (reranking), ou um modelo de contexto mais longo (trocando custo e recall 'perdido no meio').",
        },
        where: "AgentDetail.tsx (context window) · llm prompt_preview",
      },
      {
        id: "prompt",
        title: { en: "Prompt / context engineering", pt: "Engenharia de prompt / contexto" },
        what: {
          en: "Assembling the system prompt + retrieved context + tool results into the final input.",
          pt: "Montar o prompt de sistema + contexto recuperado + resultados de ferramentas na entrada final.",
        },
        why: {
          en: "What you send shapes the output. Inspecting the assembled prompt is one of the most useful debugging skills in AI engineering.",
          pt: "O que você envia molda a saída. Inspecionar o prompt montado é uma das habilidades de depuração mais úteis em engenharia de IA.",
        },
        how: {
          en: "The system prompt sets role and rules; retrieved context and tool outputs are appended as grounding; the order and framing of these parts measurably change the answer.",
          pt: "O prompt de sistema define papel e regras; o contexto recuperado e as saídas de ferramentas são anexados como fundamentação; a ordem e o enquadramento dessas partes mudam a resposta de forma mensurável.",
        },
        options: {
          en: "Alternatives/techniques: few-shot examples, chain-of-thought prompting, structured/JSON output constraints, and prompt templates or DSPy to optimize prompts programmatically.",
          pt: "Alternativas/técnicas: exemplos few-shot, prompting com cadeia de raciocínio, saída estruturada/JSON com restrições, e templates de prompt ou DSPy para otimizar prompts programaticamente.",
        },
        links: [
          { label: "OpenAI prompt engineering", url: "https://platform.openai.com/docs/guides/prompt-engineering" },
        ],
        where: "backend/app/agent/prompts.py · llm providers",
      },
      {
        id: "streaming",
        title: { en: "Streaming generation", pt: "Geração com streaming" },
        what: {
          en: "The model emits the answer one token at a time, streamed to the UI as it's produced.",
          pt: "O modelo emite a resposta um token por vez, transmitida à UI conforme é produzida.",
        },
        why: {
          en: "Streaming makes responses feel instant and lets the user start reading before generation finishes.",
          pt: "O streaming faz as respostas parecerem instantâneas e deixa o usuário começar a ler antes de a geração terminar.",
        },
        how: {
          en: "The model returns tokens incrementally; the backend forwards each as a PROGRESS event over SSE, and the UI appends it — so reading can start before generation finishes.",
          pt: "O modelo retorna tokens de forma incremental; o backend repassa cada um como evento PROGRESS via SSE, e a UI o anexa — então dá para começar a ler antes de a geração terminar.",
        },
        options: {
          en: "Alternatives: wait for the full completion (simplest, slowest to first byte), WebSocket streaming (bidirectional), or gRPC server streaming for service-to-service calls.",
          pt: "Alternativas: esperar a resposta completa (mais simples, mais lento até o primeiro byte), streaming por WebSocket (bidirecional), ou server streaming gRPC para chamadas serviço-a-serviço.",
        },
        where: "stream_answer() in llm providers → SSE",
      },
      {
        id: "openai-provider",
        title: { en: "OpenAI provider", pt: "Provider OpenAI" },
        what: {
          en: "The one concrete LLMProvider today. It calls OpenAI's Chat Completions for reasoning/answers and the Embeddings API for RAG; with no OPENAI_API_KEY the app fails fast at startup.",
          pt: "O único LLMProvider concreto hoje. Chama o Chat Completions da OpenAI para raciocínio/respostas e a Embeddings API para o RAG; sem OPENAI_API_KEY o app falha rápido na inicialização.",
        },
        why: {
          en: "Using one real provider end to end keeps the demo honest — everything you see is a real model call — while the LLMProvider seam means swapping or adding a vendor never touches the agent loop.",
          pt: "Usar um provedor real de ponta a ponta mantém a demo honesta — tudo que você vê é uma chamada real ao modelo — enquanto a costura LLMProvider faz trocar ou adicionar um fornecedor nunca tocar no loop do agente.",
        },
        how: {
          en: "decide() sends the assembled messages + tool schemas and reads back a message or tool calls; stream_answer() yields tokens; get_embeddings() batches text into vectors. Model and key come from settings.",
          pt: "decide() envia as mensagens montadas + schemas de ferramentas e lê de volta uma mensagem ou chamadas de ferramenta; stream_answer() emite tokens; get_embeddings() agrupa texto em vetores. Modelo e chave vêm das settings.",
        },
        options: {
          en: "Alternatives behind the same interface: Azure OpenAI, Anthropic Claude, Amazon Bedrock, Google Vertex AI, or self-hosted models via Ollama / vLLM — each just another LLMProvider implementation.",
          pt: "Alternativas atrás da mesma interface: Azure OpenAI, Anthropic Claude, Amazon Bedrock, Google Vertex AI, ou modelos auto-hospedados via Ollama / vLLM — cada um apenas mais uma implementação de LLMProvider.",
        },
        cloudRef: "llm",
        cloud: {
          azure: {
            en: "Run the same models through Azure OpenAI for enterprise networking, regional data residency, and Provisioned Throughput for predictable latency.",
            pt: "Rode os mesmos modelos via Azure OpenAI para rede corporativa, residência regional de dados e Provisioned Throughput para latência previsível.",
          },
          aws: {
            en: "Amazon Bedrock exposes Anthropic, Meta, Mistral and Amazon models behind one API, reachable privately from your VPC — no single-vendor key to manage.",
            pt: "O Amazon Bedrock expõe modelos da Anthropic, Meta, Mistral e Amazon atrás de uma API, acessível de forma privada pela sua VPC — sem chave de um só fornecedor para gerenciar.",
          },
          gcp: {
            en: "Vertex AI serves Gemini plus partner models (including Anthropic) with IAM-based auth instead of long-lived API keys.",
            pt: "A Vertex AI serve o Gemini mais modelos parceiros (incluindo Anthropic) com auth baseada em IAM em vez de chaves de API de longa duração.",
          },
        },
        links: [
          { label: "OpenAI API reference", url: "https://platform.openai.com/docs/api-reference" },
        ],
        where: "backend/app/llm/ (OpenAIProvider) · config.py (model · OPENAI_API_KEY)",
      },
      {
        id: "token-cost",
        title: { en: "Token accounting & cost", pt: "Contagem de tokens e custo" },
        what: {
          en: "The app counts prompt and completion tokens per round and multiplies by the model's per-token price to estimate the cost of a turn, shown live in the UI.",
          pt: "O app conta os tokens de prompt e de resposta por rodada e multiplica pelo preço por token do modelo para estimar o custo de um turno, mostrado ao vivo na UI.",
        },
        why: {
          en: "Tokens are the unit of both latency and spend; surfacing them turns 'this feels slow/expensive' into a real number you can optimize, and makes the cost of RAG context and tool loops visible.",
          pt: "Tokens são a unidade de latência e de gasto; expô-los transforma 'isso parece lento/caro' em um número real que dá para otimizar, e torna visível o custo do contexto RAG e dos loops de ferramentas.",
        },
        how: {
          en: "Usage comes back on each model response (prompt/completion/total tokens); the frontend tallies rounds and applies a price table to estimate USD. Long context and extra ReAct rounds add up fast.",
          pt: "O uso volta em cada resposta do modelo (tokens de prompt/resposta/total); o frontend soma as rodadas e aplica uma tabela de preços para estimar em USD. Contexto longo e rodadas ReAct extras somam rápido.",
        },
        options: {
          en: "Ways to cut cost: a smaller/cheaper model for easy turns, prompt caching, a semantic cache for repeats, fewer retrieved chunks, or batching offline work via the Batch API.",
          pt: "Formas de cortar custo: um modelo menor/mais barato para turnos fáceis, cache de prompt, um cache semântico para repetições, menos trechos recuperados, ou batelar trabalho offline via Batch API.",
        },
        cloudRef: "llm",
        links: [{ label: "OpenAI pricing", url: "https://openai.com/api/pricing/" }],
        where: "frontend/src/lib/derive.ts (usage) · llm usage metrics (011-token-cost)",
      },
    ],
  },
  // 097-learn-harness-loop — the conceptual spine: the prompt → context → harness →
  // loop ladder, and the two disciplines this simulator makes visible. Grounded in
  // the app's own stations (the harness) and its ReAct loop (the loop).
  {
    id: "ai-engineering-disciplines",
    title: { en: "AI Engineering Disciplines", pt: "Disciplinas de Engenharia de IA" },
    icon: "🧭",
    accent: "var(--color-teal)",
    intro: {
      en: "Beyond the model, building an agent is two engineering jobs: the harness (the wiring the model is bolted to) and the loop (how it iterates). This simulator is a lab for both.",
      pt: "Além do modelo, construir um agente são dois trabalhos de engenharia: o harness (o cabeamento ao qual o modelo está preso) e o loop (como ele itera). Este simulador é um laboratório para os dois.",
    },
    topics: [
      {
        id: "engineering-ladder",
        title: { en: "The Engineering Ladder", pt: "A Escada da Engenharia" },
        what: {
          en: "Modern LLM engineering climbs a ladder of four disciplines: prompt → context → harness → loop. Each rung wraps the one below it.",
          pt: "A engenharia de LLM moderna sobe uma escada de quatro disciplinas: prompt → context → harness → loop. Cada degrau envolve o anterior.",
        },
        why: {
          en: "Naming the rungs makes it clear where an agent actually succeeds or fails. Most tutorials stop at prompting; real agents are won on the top two rungs — and those are exactly what this simulator shows.",
          pt: "Nomear os degraus deixa claro onde um agente de fato acerta ou erra. A maioria dos tutoriais para no prompt; agentes reais são ganhos nos dois degraus de cima — e é justamente isso que este simulador mostra.",
        },
        how: {
          en: "Prompt engineering crafts the instruction. Context engineering curates what enters the window — 'the smallest set of high-signal tokens'. Harness engineering builds everything around the model (tools, retrieval, memory, permissions, the runtime). Loop engineering designs the reason → act → observe cycle: when to iterate, when to stop, how to recover. This simulator makes the last two — the harness and the loop — visible side by side: the canvas is the harness (in space), the animated run is the loop (in time).",
          pt: "Prompt engineering elabora a instrução. Context engineering seleciona o que entra na janela — 'o menor conjunto de tokens de alto sinal'. Harness engineering constrói tudo em volta do modelo (ferramentas, recuperação, memória, permissões, o runtime). Loop engineering projeta o ciclo raciocina → age → observa: quando iterar, quando parar, como se recuperar. Este simulador torna os dois últimos — o harness e o loop — visíveis lado a lado: o canvas é o harness (no espaço), a execução animada é o loop (no tempo).",
        },
        options: {
          en: "Some teams collapse context into 'prompt engineering' and harness into 'agent framework'; the four-rung split is a lens, not a law. What matters is recognizing that a great model in a poor harness/loop loses to a modest model in a great one.",
          pt: "Algumas equipes juntam context em 'prompt engineering' e harness em 'framework de agente'; a divisão em quatro degraus é uma lente, não uma lei. O que importa é reconhecer que um ótimo modelo num harness/loop ruim perde para um modelo modesto num ótimo.",
        },
        links: [
          {
            label: "Anthropic — Effective context engineering",
            url: "https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents",
          },
          {
            label: "Anthropic — Building effective agents",
            url: "https://www.anthropic.com/engineering/building-effective-agents",
          },
        ],
        where: "frontend/src/lib/{harness,loop,lens}.ts · the Harness ⇄ Loop lens (header)",
      },
      {
        id: "harness-engineering",
        title: { en: "Harness Engineering", pt: "Engenharia de Harness" },
        what: {
          en: "The harness is everything that isn't the model — the scaffolding that turns a raw LLM into a working agent. 'Agent = Model + Harness. If you're not the model, you're the harness.'",
          pt: "O harness é tudo que não é o modelo — o andaime que transforma um LLM cru num agente funcional. 'Agent = Model + Harness. Se você não é o modelo, você é o harness.'",
        },
        why: {
          en: "The model is stateless and can't touch the world on its own. The harness gives it tools, knowledge, memory and guardrails — and a decent model with an excellent harness beats a superior model in a poor one.",
          pt: "O modelo não tem estado e não toca o mundo sozinho. O harness lhe dá ferramentas, conhecimento, memória e guardrails — e um modelo decente com um ótimo harness supera um modelo superior num harness ruim.",
        },
        how: {
          en: "Every station on this canvas is a piece of the harness. Tools: the MCP server exposes calculator/time/kb_lookup, plus search_knowledge_base. Knowledge: the RAG vector DB (and ingestion) the agent can retrieve from. Memory: the App Database holds long-term conversation history across turns. Context: the context-window budget assembles the smallest useful prompt. Permissions: the guardrails prompt layer and the network edge. Model: the LLM itself. The harness is the 'LLM as the new OS' — the firmware, drivers and filesystem around the reasoning core.",
          pt: "Cada estação neste canvas é uma peça do harness. Ferramentas: o servidor MCP expõe calculator/time/kb_lookup, além de search_knowledge_base. Conhecimento: o vector DB de RAG (e a ingestão) de onde o agente recupera. Memória: o App Database guarda o histórico de longo prazo da conversa entre turnos. Contexto: o orçamento da janela de contexto monta o menor prompt útil. Permissões: a camada de guardrails e a borda de rede. Modelo: o próprio LLM. O harness é o 'LLM como o novo SO' — o firmware, os drivers e o sistema de arquivos ao redor do núcleo de raciocínio.",
        },
        options: {
          en: "Harnesses range from thin (a single tool-calling loop) to thick (sandboxed code execution, a virtual filesystem, sub-agents, progress files for multi-session work). Anthropic's long-running-agent harness adds an initializer agent + a progress file so a fresh context window can resume work. More harness isn't always better — every line should trace back to a real failure it prevents.",
          pt: "Harnesses vão de finos (um único loop de tool-calling) a grossos (execução de código em sandbox, sistema de arquivos virtual, sub-agentes, arquivos de progresso para trabalho multi-sessão). O harness de agentes de longa duração da Anthropic adiciona um agente inicializador + um arquivo de progresso para que uma janela de contexto nova retome o trabalho. Mais harness nem sempre é melhor — cada linha deveria remeter a uma falha real que ela evita.",
        },
        links: [
          {
            label: "Anthropic — Effective harnesses for long-running agents",
            url: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents",
          },
          {
            label: "Addy Osmani — Agent Harness Engineering",
            url: "https://addyosmani.com/blog/agent-harness-engineering/",
          },
        ],
        where: "backend/app/agent/graph.py · agent/tools.py · mcp/ · rag/ · db/store.py",
      },
      {
        id: "loop-engineering",
        title: { en: "Loop Engineering", pt: "Engenharia de Loop" },
        what: {
          en: "The loop is how the agent iterates: reason → act → observe, repeating until a goal is met or a stop condition fires. It's the difference between answering once and making progress.",
          pt: "O loop é como o agente itera: raciocina → age → observa, repetindo até a meta ser atingida ou uma condição de parada disparar. É a diferença entre responder uma vez e fazer progresso.",
        },
        why: {
          en: "Real tasks aren't one-shot — step three depends on what step two returned. The loop is what lets a language model fix a failing test, refine a search, or recover from a tool error. Loop design separates a great agent from a mediocre one, often more than the model does.",
          pt: "Tarefas reais não são de um tiro só — o passo três depende do que o passo dois retornou. O loop é o que permite a um modelo de linguagem corrigir um teste que falha, refinar uma busca ou se recuperar de um erro de ferramenta. O projeto do loop separa um agente ótimo de um medíocre, muitas vezes mais do que o modelo.",
        },
        how: {
          en: "This app runs a bounded ReAct loop: route → think ⇄ tools → generate → respond. The agent reasons in 'think'; if it elects a tool call it loops back to 'tools' and observes the result, then thinks again. A stop condition bounds it: _should_continue loops only while there are pending calls and iterations ≤ MAX_ITERATIONS (3), so it can never spin forever. Failure handling is real too — simulate_failure injects a tool error or model timeout so you can watch the loop retry, back off, open a circuit breaker and fall back. Open the Harness ⇄ Loop lens (Loop) to see the iteration count and stop reason on the canvas.",
          pt: "Este app roda um loop ReAct limitado: route → think ⇄ tools → generate → respond. O agente raciocina no 'think'; se ele elege uma chamada de ferramenta, volta para 'tools' e observa o resultado, então pensa de novo. Uma condição de parada o limita: _should_continue faz o loop só enquanto há chamadas pendentes e iterations ≤ MAX_ITERATIONS (3), então ele nunca gira para sempre. O tratamento de falhas também é real — simulate_failure injeta um erro de ferramenta ou timeout do modelo para você ver o loop tentar de novo, esperar (backoff), abrir um disjuntor e cair no fallback. Abra a lente Harness ⇄ Loop (Loop) para ver a contagem de iterações e o motivo da parada no canvas.",
        },
        options: {
          en: "Beyond the plain agent loop there are richer loops: a reflection loop (the agent critiques its own output), a verification loop (a grader scores against a rubric), an event-driven loop (external triggers), and 'loopcraft' — stacking these so production traces feed back and improve the harness itself. Each adds reliability at the cost of latency and tokens.",
          pt: "Além do loop simples há loops mais ricos: um loop de reflexão (o agente critica a própria saída), um loop de verificação (um avaliador pontua contra uma rubrica), um loop dirigido por eventos (gatilhos externos) e o 'loopcraft' — empilhar esses loops para que traços de produção retroalimentem e melhorem o próprio harness. Cada um adiciona confiabilidade ao custo de latência e tokens.",
        },
        links: [
          {
            label: "LangChain — The Art of Loop Engineering",
            url: "https://www.langchain.com/blog/the-art-of-loop-engineering",
          },
          {
            label: "ReAct — Synergizing Reasoning and Acting (paper)",
            url: "https://arxiv.org/abs/2210.03629",
          },
        ],
        where: "backend/app/agent/graph.py (_should_continue, MAX_ITERATIONS) · agent/resilience.py (simulate_failure)",
      },
    ],
  },
  {
    id: "security",
    title: { en: "Security per Layer", pt: "Segurança por Camada" },
    icon: "🛡️",
    accent: "var(--color-ok)",
    intro: {
      en: "Security is layered: encryption in transit, private boundaries, validated input, managed secrets and safe tool execution.",
      pt: "A segurança é em camadas: criptografia em trânsito, fronteiras privadas, entrada validada, segredos gerenciados e execução segura de ferramentas.",
    },
    topics: [
      {
        id: "tls",
        title: { en: "TLS / HTTPS at the edge", pt: "TLS / HTTPS na borda" },
        what: {
          en: "The browser↔API connection is encrypted with HTTPS (TLS 1.3), terminated at the ingress.",
          pt: "A conexão navegador↔API é criptografada com HTTPS (TLS 1.3), encerrada no ingress.",
        },
        why: {
          en: "TLS protects the message and the streamed answer from eavesdropping and tampering on the public internet.",
          pt: "O TLS protege a mensagem e a resposta transmitida contra espionagem e adulteração na internet pública.",
        },
        how: {
          en: "A TLS handshake negotiates keys and authenticates the server's certificate; from then on every byte (request and streamed answer) is encrypted. The ingress terminates TLS 1.3.",
          pt: "Um handshake TLS negocia chaves e autentica o certificado do servidor; a partir daí cada byte (requisição e resposta transmitida) é criptografado. O ingress encerra o TLS 1.3.",
        },
        options: {
          en: "Alternatives/extensions: mutual TLS (both sides present certs) for internal hops, or a service mesh (Istio, Linkerd) that encrypts and authenticates all service-to-service traffic automatically.",
          pt: "Alternativas/extensões: TLS mútuo (os dois lados apresentam certificados) para saltos internos, ou um service mesh (Istio, Linkerd) que criptografa e autentica todo o tráfego entre serviços automaticamente.",
        },
        where: "Client ↔ API hop",
      },
      {
        id: "private-net",
        title: { en: "Private network (VNet / VPC) & mTLS", pt: "Rede privada (VNet / VPC) e mTLS" },
        what: {
          en: "Every tier except the Client lives inside a private network boundary (Azure VNet / AWS VPC / GCP VPC). Internal traffic (API↔Agent, Agent↔services) stays in-cluster, with mTLS and per-hop network rules (NSG / Security Group).",
          pt: "Toda camada exceto o Cliente vive dentro de uma fronteira de rede privada (Azure VNet / AWS VPC / GCP VPC). O tráfego interno (API↔Agente, Agente↔serviços) fica no cluster, com mTLS e regras de rede por hop (NSG / Security Group).",
        },
        why: {
          en: "Internal services should never be internet-exposed; the private boundary shrinks the attack surface to the single public ingress and is drawn explicitly on the canvas.",
          pt: "Serviços internos nunca devem ficar expostos à internet; a fronteira privada reduz a superfície de ataque ao único ingress público e é desenhada explicitamente no canvas.",
        },
        how: {
          en: "The API, Agent and Services run inside a virtual network with no public IPs; only the ingress is reachable from outside, and per-hop rules (NSG / Security Group) plus mTLS gate internal traffic.",
          pt: "API, Agente e Serviços rodam dentro de uma rede virtual sem IPs públicos; só o ingress é alcançável de fora, e regras por salto (NSG / Security Group) mais mTLS controlam o tráfego interno.",
        },
        options: {
          en: "Alternatives: a zero-trust model (authenticate every call regardless of network), a service mesh for identity-based policy, or PrivateLink-style private endpoints to managed services.",
          pt: "Alternativas: um modelo zero-trust (autenticar cada chamada independentemente da rede), um service mesh para política baseada em identidade, ou private endpoints estilo PrivateLink para serviços gerenciados.",
        },
        cloudRef: "vnet",
        where: "frontend/src/lib/stations.ts (BOUNDARY_SRC) · private hops",
      },
      {
        id: "cors",
        title: { en: "CORS", pt: "CORS" },
        what: {
          en: "The API only accepts browser requests from configured origins.",
          pt: "A API só aceita requisições de navegador vindas de origens configuradas.",
        },
        why: {
          en: "Cross-Origin Resource Sharing rules prevent arbitrary websites from calling your API on a user's behalf.",
          pt: "As regras de Cross-Origin Resource Sharing impedem que sites arbitrários chamem sua API em nome de um usuário.",
        },
        how: {
          en: "On a cross-origin request the browser sends a preflight (OPTIONS); the API replies with the allowed origins, methods and headers, and the browser blocks the call if the origin isn't on the list.",
          pt: "Numa requisição cross-origin o navegador envia um preflight (OPTIONS); a API responde com as origens, métodos e cabeçalhos permitidos, e o navegador bloqueia a chamada se a origem não estiver na lista.",
        },
        options: {
          en: "Alternatives: serve the frontend and API from the same origin (no CORS needed), or front both with an API gateway that handles origin policy centrally.",
          pt: "Alternativas: servir o frontend e a API da mesma origem (sem CORS), ou colocar os dois atrás de um API gateway que cuida da política de origem de forma centralizada.",
        },
        where: "CORSMiddleware in backend/app/main.py",
      },
      {
        id: "secrets",
        title: { en: "Secrets management", pt: "Gerenciamento de segredos" },
        what: {
          en: "API keys come from environment variables; .env is git-ignored and never committed.",
          pt: "As chaves de API vêm de variáveis de ambiente; o .env é ignorado pelo git e nunca comitado.",
        },
        why: {
          en: "Hardcoded secrets leak through source control. Injecting them at runtime keeps them out of the image and the repo.",
          pt: "Segredos no código vazam pelo controle de versão. Injetá-los em tempo de execução os mantém fora da imagem e do repositório.",
        },
        how: {
          en: "The app reads keys from environment variables at runtime; `.env` is git-ignored so nothing sensitive enters source control or the image. In production a secret store injects them.",
          pt: "O app lê as chaves de variáveis de ambiente em tempo de execução; o `.env` é ignorado pelo git para nada sensível entrar no controle de versão ou na imagem. Em produção um cofre de segredos as injeta.",
        },
        options: {
          en: "Alternatives: a dedicated secrets manager with rotation and audit, or workload identity / OIDC so a service authenticates with a short-lived token and holds no long-lived key at all.",
          pt: "Alternativas: um gerenciador de segredos dedicado com rotação e auditoria, ou workload identity / OIDC para um serviço se autenticar com um token de curta duração e não guardar chave de longa duração.",
        },
        cloud: {
          azure: {
            en: "Azure Key Vault stores secrets/keys/certs; Container Apps can mount them or use a Managed Identity so no key sits in config at all.",
            pt: "O Azure Key Vault guarda segredos/chaves/certificados; o Container Apps pode montá-los ou usar uma Managed Identity para não haver chave nenhuma na config.",
          },
          aws: {
            en: "AWS Secrets Manager (rotation built in) or SSM Parameter Store, fetched via an IAM role — the task assumes the role, so there's no static key.",
            pt: "AWS Secrets Manager (com rotação embutida) ou SSM Parameter Store, buscados via uma role IAM — a task assume a role, então não há chave estática.",
          },
          gcp: {
            en: "Google Secret Manager with IAM-scoped access; Cloud Run reads secrets as env vars or mounted files.",
            pt: "O Google Secret Manager com acesso por IAM; o Cloud Run lê segredos como variáveis de ambiente ou arquivos montados.",
          },
        },
        where: "backend/app/config.py · .gitignore",
      },
      {
        id: "validation",
        title: { en: "Input validation", pt: "Validação de entrada" },
        what: {
          en: "Incoming requests are validated and bounded by Pydantic models (e.g. message length).",
          pt: "As requisições recebidas são validadas e limitadas por modelos Pydantic (ex.: tamanho da mensagem).",
        },
        why: {
          en: "Validating at the boundary rejects malformed or oversized input early, before it reaches the agent.",
          pt: "Validar na fronteira rejeita entradas malformadas ou grandes demais cedo, antes de chegarem ao agente.",
        },
        how: {
          en: "Pydantic parses the request body against a typed model, enforcing bounds (e.g. message length) and rejecting anything malformed with a 422 before the handler runs.",
          pt: "O Pydantic faz o parse do corpo da requisição contra um modelo tipado, impondo limites (ex.: tamanho da mensagem) e rejeitando qualquer coisa malformada com um 422 antes de o handler rodar.",
        },
        options: {
          en: "Alternatives: JSON Schema validation, a frontend validator (Zod) for fast feedback, and WAF rules at the edge — defense in depth means validating at more than one layer.",
          pt: "Alternativas: validação por JSON Schema, um validador no frontend (Zod) para feedback rápido, e regras de WAF na borda — defesa em profundidade é validar em mais de uma camada.",
        },
        where: "ChatRequest in backend/app/schemas.py",
      },
      {
        id: "safe-tools",
        title: { en: "Safe tool execution", pt: "Execução segura de ferramentas" },
        what: {
          en: "The calculator tool parses an AST and evaluates only arithmetic — it never calls eval().",
          pt: "A ferramenta de calculadora analisa uma AST e avalia apenas aritmética — nunca chama eval().",
        },
        why: {
          en: "Running model-chosen input through eval() is a remote-code-execution risk; a whitelisted AST evaluator is safe by construction.",
          pt: "Rodar via eval() uma entrada escolhida pelo modelo é um risco de execução remota de código; um avaliador de AST com lista de permissões é seguro por construção.",
        },
        how: {
          en: "The calculator parses the expression into an Abstract Syntax Tree and walks it, allowing only arithmetic nodes; anything else (calls, attributes, names) is rejected — `eval()` is never used.",
          pt: "A calculadora faz o parse da expressão em uma Árvore de Sintaxe Abstrata e a percorre, permitindo só nós aritméticos; qualquer outra coisa (chamadas, atributos, nomes) é rejeitada — `eval()` nunca é usado.",
        },
        options: {
          en: "Alternatives for riskier tools: run them in a sandbox or microVM (gVisor, Firecracker), a restricted interpreter, or a separate least-privilege service with no network or filesystem access.",
          pt: "Alternativas para ferramentas mais arriscadas: rodá-las em um sandbox ou microVM (gVisor, Firecracker), um interpretador restrito, ou um serviço separado de menor privilégio sem acesso a rede ou sistema de arquivos.",
        },
        where: "backend/app/mcp/server.py",
      },
    ],
  },
  {
    id: "infra",
    title: { en: "Networking & Infrastructure", pt: "Rede e Infraestrutura" },
    icon: "🌐",
    accent: "var(--color-warn)",
    intro: {
      en: "How the pieces talk and run: containers, network hops, the private-network boundary, firewalls and private endpoints, long-lived connections, stateless scaling, and how the agnostic model maps onto Azure, AWS or GCP.",
      pt: "Como as peças conversam e rodam: containers, saltos de rede, a fronteira de rede privada, firewalls e private endpoints, conexões de longa duração, escalabilidade sem estado, e como o modelo agnóstico mapeia para Azure, AWS ou GCP.",
    },
    topics: [
      {
        id: "hops",
        title: { en: "Network hops", pt: "Saltos de rede" },
        what: {
          en: "Each arrow between tiers is a real network call with its own protocol (HTTPS, in-cluster HTTP, TCP, MCP/stdio).",
          pt: "Cada seta entre camadas é uma chamada de rede real com seu próprio protocolo (HTTPS, HTTP dentro do cluster, TCP, MCP/stdio).",
        },
        why: {
          en: "Seeing the hops makes the real cost and complexity of a distributed app visible — every boundary adds latency and a failure point.",
          pt: "Ver os saltos torna visível o custo e a complexidade reais de um app distribuído — cada fronteira adiciona latência e um ponto de falha.",
        },
        how: {
          en: "Every edge is a real call with its own protocol and failure mode: HTTPS at the public edge, in-cluster HTTP between tiers, MCP/stdio to tools, and a model API over the network.",
          pt: "Cada aresta é uma chamada real com seu próprio protocolo e modo de falha: HTTPS na borda pública, HTTP dentro do cluster entre camadas, MCP/stdio para ferramentas e uma API de modelo pela rede.",
        },
        options: {
          en: "In a real system you'd add retries with backoff, timeouts and circuit breakers per hop, and a service mesh to observe latency and errors on every edge without changing app code.",
          pt: "Num sistema real você adicionaria retries com backoff, timeouts e circuit breakers por salto, e um service mesh para observar latência e erros em cada aresta sem mudar o código da app.",
        },
        where: "frontend/src/lib/stations.ts (HOPS)",
      },
      {
        id: "ingress",
        title: { en: "Ingress & egress", pt: "Ingress e egress" },
        what: {
          en: "Ingress is inbound traffic to the API; egress is the agent's outbound calls (to the LLM, tools).",
          pt: "Ingress é o tráfego de entrada para a API; egress são as chamadas de saída do agente (para o LLM, ferramentas).",
        },
        why: {
          en: "Controlling ingress/egress is how you firewall a system: only the API takes ingress; only the agent makes egress to model providers.",
          pt: "Controlar ingress/egress é como você protege um sistema com firewall: só a API recebe ingress; só o agente faz egress para provedores de modelos.",
        },
        how: {
          en: "Ingress is the inbound path the load balancer routes to the API; egress is the agent reaching out to the LLM and tools. Each can be allow-listed, rate-limited and logged separately.",
          pt: "Ingress é o caminho de entrada que o balanceador roteia para a API; egress é o agente alcançando o LLM e as ferramentas. Cada um pode ser permitido por lista, limitado por taxa e logado separadamente.",
        },
        options: {
          en: "Alternatives: an egress proxy or NAT gateway to pin outbound IPs, an API gateway for ingress policy, or a service mesh that controls both directions by identity.",
          pt: "Alternativas: um proxy de egress ou NAT gateway para fixar IPs de saída, um API gateway para política de ingress, ou um service mesh que controla as duas direções por identidade.",
        },
        where: "API tier (ingress) · Agent tier (egress)",
      },
      {
        id: "sse-http",
        title: { en: "SSE over HTTP", pt: "SSE sobre HTTP" },
        what: {
          en: "Server-Sent Events stream many messages over a single long-lived HTTP response.",
          pt: "Server-Sent Events transmitem várias mensagens por uma única resposta HTTP de longa duração.",
        },
        why: {
          en: "SSE is simpler than WebSockets for one-way server→client streaming and rides over ordinary HTTP/HTTPS infrastructure.",
          pt: "SSE é mais simples que WebSockets para streaming unidirecional servidor→cliente e funciona sobre a infraestrutura HTTP/HTTPS comum.",
        },
        how: {
          en: "The server responds with `Content-Type: text/event-stream` and keeps the connection open, writing `data:` frames; the browser parses each as an event. Here a custom fetch client is used so POST works.",
          pt: "O servidor responde com `Content-Type: text/event-stream` e mantém a conexão aberta, escrevendo frames `data:`; o navegador faz o parse de cada um como evento. Aqui um cliente fetch customizado é usado para o POST funcionar.",
        },
        options: {
          en: "Alternatives: WebSockets (full duplex, needs its own protocol upgrade), HTTP long-polling (works everywhere, chatty), or gRPC streaming for service-to-service.",
          pt: "Alternativas: WebSockets (full duplex, exige upgrade de protocolo próprio), long-polling HTTP (funciona em qualquer lugar, verboso), ou streaming gRPC para serviço-a-serviço.",
        },
        where: "EventSourceResponse · frontend/src/lib/sse.ts",
      },
      {
        id: "stateless-scaling",
        title: { en: "Stateless services & scaling", pt: "Serviços sem estado e escalabilidade" },
        what: {
          en: "The API and agent hold no per-user state between requests, so you can run many replicas behind a load balancer.",
          pt: "A API e o agente não guardam estado por usuário entre requisições, então você pode rodar muitas réplicas atrás de um balanceador de carga.",
        },
        why: {
          en: "Statelessness is what makes horizontal scaling (and zero-downtime deploys) possible; state is pushed to the data tier.",
          pt: "A ausência de estado é o que torna possível a escalabilidade horizontal (e deploys sem downtime); o estado é empurrado para a camada de dados.",
        },
        how: {
          en: "Because no request leaves per-user state in the process, any replica can serve any request; a load balancer spreads traffic and you add/remove instances freely. State lives in the data tier.",
          pt: "Como nenhuma requisição deixa estado por usuário no processo, qualquer réplica pode servir qualquer requisição; um balanceador distribui o tráfego e você adiciona/remove instâncias livremente. O estado vive na camada de dados.",
        },
        options: {
          en: "When you do need affinity: sticky sessions (route a user to one replica — simpler, weaker scaling) or sharding state by key. This demo's in-memory trace store is exactly what blocks multi-replica.",
          pt: "Quando você precisa de afinidade: sticky sessions (rotear um usuário para uma réplica — mais simples, escala pior) ou shardear o estado por chave. O trace store em memória desta demo é justamente o que impede múltiplas réplicas.",
        },
        where: "API & Agent tiers",
      },
      {
        id: "reverse-proxy",
        title: { en: "Reverse proxy", pt: "Proxy reverso" },
        what: {
          en: "In production the React build is served by nginx, which also handles SPA routing.",
          pt: "Em produção, o build do React é servido pelo nginx, que também cuida do roteamento da SPA.",
        },
        why: {
          en: "A small static web server is fast, cache-friendly and the standard way to ship a front-end build.",
          pt: "Um pequeno servidor web estático é rápido, amigável a cache e a forma padrão de entregar um build de front-end.",
        },
        how: {
          en: "nginx serves the static build and rewrites unknown paths to `index.html` so client-side routing works; it can also gzip, cache and proxy `/api` to the backend.",
          pt: "O nginx serve o build estático e reescreve caminhos desconhecidos para `index.html` para o roteamento client-side funcionar; também pode fazer gzip, cache e proxy de `/api` para o backend.",
        },
        options: {
          en: "Alternatives: Caddy (automatic HTTPS), Traefik (dynamic, container-aware), or skip the proxy entirely and serve the static build straight from a CDN.",
          pt: "Alternativas: Caddy (HTTPS automático), Traefik (dinâmico, ciente de containers), ou dispensar o proxy e servir o build estático direto de uma CDN.",
        },
        where: "frontend/nginx.conf · frontend/Dockerfile",
      },
      {
        id: "cloud-mapping",
        title: { en: "Cloud mapping (Azure · AWS · GCP)", pt: "Mapeamento em nuvem (Azure · AWS · GCP)" },
        what: {
          en: "Each agnostic role maps to a managed service per provider — e.g. the API tier → Azure Container Apps / AWS App Runner / Cloud Run; the LLM → Azure OpenAI / Amazon Bedrock / Vertex AI. The header's cloud toggle swaps which names you see.",
          pt: "Cada papel agnóstico mapeia para um serviço gerenciado por provedor — ex.: a camada de API → Azure Container Apps / AWS App Runner / Cloud Run; o LLM → Azure OpenAI / Amazon Bedrock / Vertex AI. O seletor de nuvem no cabeçalho troca quais nomes você vê.",
        },
        why: {
          en: "The tier model is cloud-agnostic by design; keeping the providers as a swappable overlay (instead of forking the app per cloud) teaches portability — the same architecture runs anywhere.",
          pt: "O modelo de camadas é agnóstico por design; manter os provedores como uma camada trocável (em vez de bifurcar o app por nuvem) ensina portabilidade — a mesma arquitetura roda em qualquer lugar.",
        },
        how: {
          en: "Each tier/station/boundary carries a `generic` role plus a `clouds` map of example services; the header toggle picks which name renders. The architecture never forks — only the labels change.",
          pt: "Cada tier/estação/fronteira carrega um papel `generic` mais um mapa `clouds` de serviços de exemplo; o seletor no cabeçalho escolhe qual nome aparece. A arquitetura nunca se bifurca — só os rótulos mudam.",
        },
        options: {
          en: "The deeper choice each cloud offers is the compute model: fully-managed PaaS (Container Apps, App Runner, Cloud Run), Kubernetes (AKS/EKS/GKE), or serverless functions — same tiers, different operational trade-offs.",
          pt: "A escolha mais profunda que cada nuvem oferece é o modelo de compute: PaaS totalmente gerenciado (Container Apps, App Runner, Cloud Run), Kubernetes (AKS/EKS/GKE) ou funções serverless — mesmas camadas, trade-offs operacionais diferentes.",
        },
        where: "frontend/src/lib/cloud.ts · clouds{} fields in stations.ts",
      },
      {
        id: "vnet",
        title: { en: "Private network boundary (VNet / VPC)", pt: "Fronteira de rede privada (VNet / VPC)" },
        what: {
          en: "A virtual network that wraps the API, Agent and Services tiers; the Client sits outside it, on the public internet. Drawn as the dashed perimeter on the canvas.",
          pt: "Uma rede virtual que envolve as camadas de API, Agente e Serviços; o Cliente fica fora dela, na internet pública. Desenhada como o perímetro tracejado no canvas.",
        },
        why: {
          en: "The boundary is the backbone of network security: nothing inside is reachable from the internet except through the controlled public ingress.",
          pt: "A fronteira é a espinha dorsal da segurança de rede: nada lá dentro é acessível pela internet exceto pelo ingress público controlado.",
        },
        how: {
          en: "A virtual network is a private IP space you define; resources placed in it talk over private addresses and reach the internet only through controlled gateways. The Client stays outside it.",
          pt: "Uma rede virtual é um espaço de IPs privado que você define; recursos colocados nela conversam por endereços privados e alcançam a internet só por gateways controlados. O Cliente fica fora dela.",
        },
        options: {
          en: "Alternatives/extensions: VNet/VPC peering to connect networks, a hub-and-spoke topology for shared services, or a zero-trust overlay instead of relying on the network perimeter.",
          pt: "Alternativas/extensões: peering de VNet/VPC para conectar redes, uma topologia hub-and-spoke para serviços compartilhados, ou uma camada zero-trust em vez de confiar no perímetro de rede.",
        },
        cloudRef: "vnet",
        where: "frontend/src/lib/stations.ts (BOUNDARY_SRC)",
      },
      {
        id: "firewall-waf",
        title: { en: "Firewall · WAF · DDoS at the edge", pt: "Firewall · WAF · DDoS na borda" },
        what: {
          en: "The single public hop (Client → API) is fronted by a Web Application Firewall and DDoS protection (Front Door / AWS WAF / Cloud Armor) — shown with a shield on that edge.",
          pt: "O único hop público (Cliente → API) é protegido por um Web Application Firewall e proteção DDoS (Front Door / AWS WAF / Cloud Armor) — mostrado com um escudo nessa aresta.",
        },
        why: {
          en: "Filtering malicious traffic at the edge — before it reaches your code — blocks common web attacks and volumetric floods cheaply.",
          pt: "Filtrar tráfego malicioso na borda — antes de chegar ao seu código — bloqueia ataques web comuns e enxurradas volumétricas de forma barata.",
        },
        how: {
          en: "A Web Application Firewall inspects HTTP at the edge and blocks known attack patterns (SQLi, XSS) by rule; DDoS protection absorbs volumetric floods before they reach your origin.",
          pt: "Um Web Application Firewall inspeciona o HTTP na borda e bloqueia padrões de ataque conhecidos (SQLi, XSS) por regra; a proteção DDoS absorve enxurradas volumétricas antes de chegarem à sua origem.",
        },
        options: {
          en: "Alternatives: a CDN-integrated WAF (Cloudflare, Fastly), per-route rate limiting in the app or gateway, and bot management — usually layered together.",
          pt: "Alternativas: um WAF integrado à CDN (Cloudflare, Fastly), rate limiting por rota no app ou no gateway, e gestão de bots — em geral combinados em camadas.",
        },
        where: "public hop · frontend/src/lib/stations.ts (HOPS_SRC zone/controls)",
      },
      {
        id: "private-endpoint",
        title: { en: "Private endpoints to managed services", pt: "Private endpoints para serviços gerenciados" },
        what: {
          en: "Calls from the tiers to managed data/AI services (database, vector store, LLM) travel over private endpoints (Private Endpoint / PrivateLink / Private Service Connect) rather than the public internet.",
          pt: "Chamadas das camadas para serviços gerenciados de dados/IA (banco, vector store, LLM) trafegam por private endpoints (Private Endpoint / PrivateLink / Private Service Connect) em vez da internet pública.",
        },
        why: {
          en: "Private connectivity keeps managed-service traffic off the public internet, so credentials and data never traverse an exposed path.",
          pt: "A conectividade privada mantém o tráfego de serviços gerenciados fora da internet pública, então credenciais e dados nunca passam por um caminho exposto.",
        },
        how: {
          en: "A private endpoint gives a managed service a private IP inside your network, so traffic to the database, vector store or model never touches the public internet — even though the service is managed.",
          pt: "Um private endpoint dá a um serviço gerenciado um IP privado dentro da sua rede, então o tráfego para o banco, o vetorial ou o modelo nunca toca a internet pública — mesmo o serviço sendo gerenciado.",
        },
        options: {
          en: "Alternatives: VPC service / gateway endpoints, VPC peering to the provider, or (least secure) public endpoints locked down by IP allow-list and firewall rules.",
          pt: "Alternativas: service / gateway endpoints de VPC, peering de VPC com o provedor, ou (menos seguro) endpoints públicos travados por lista de IPs permitidos e regras de firewall.",
        },
        where: "private hops · HOPS_SRC (controls)",
      },
      {
        id: "timeline-phases",
        title: { en: "Timeline phases", pt: "Fases da linha do tempo" },
        what: {
          en: "A named phase rail above the scrubber that groups the raw stages into human phases (request, retrieve, reason, act, generate, respond) so the journey reads as a story, not a wall of events.",
          pt: "Uma trilha de fases nomeadas acima do scrubber que agrupa as etapas cruas em fases humanas (requisição, recuperação, raciocínio, ação, geração, resposta) para a jornada ler como uma história, não um paredão de eventos.",
        },
        why: {
          en: "Stages are fine-grained and many; phases give a coarse mental model a newcomer can hold, and let the UI label 'where are we now' in plain language while replaying.",
          pt: "As etapas são granulares e numerosas; as fases dão um modelo mental grosseiro que um iniciante consegue segurar, e deixam a UI rotular 'onde estamos agora' em linguagem simples durante o replay.",
        },
        how: {
          en: "A total map STAGE_TO_PHASE assigns every Stage to exactly one TimelinePhase; tsc fails if a new Stage is unmapped, and a test pins parity with the station map so the two views can't drift.",
          pt: "Um mapa total STAGE_TO_PHASE atribui cada Stage a exatamente uma TimelinePhase; o tsc falha se um novo Stage ficar sem mapeamento, e um teste fixa a paridade com o mapa de estações para as duas visões não divergirem.",
        },
        options: {
          en: "Alternatives for visualizing a request's life: a span/waterfall view (like distributed tracing), a Gantt chart, or a flame graph — each trades the storytelling rail for more timing detail.",
          pt: "Alternativas para visualizar a vida de uma requisição: uma visão de spans/waterfall (como tracing distribuído), um gráfico de Gantt, ou um flame graph — cada um troca a trilha narrativa por mais detalhe de tempo.",
        },
        where: "frontend/src/lib/phases.ts (STAGE_TO_PHASE · 004-timeline-phases)",
      },
      {
        id: "maturity-ladder",
        title: {
          en: "Maturity ladder (Simple → Advanced)",
          pt: "Escada de maturidade (Simples → Avançado)",
        },
        what: {
          en: "A global mode — Simple, Intermediate, Advanced — that picks how much of a production pipeline the diagram shows. Each tier/station/hop declares which rungs it belongs to.",
          pt: "Um modo global — Simples, Intermediário, Avançado — que escolhe quanto de um pipeline de produção o diagrama mostra. Cada tier/estação/salto declara a quais degraus pertence.",
        },
        why: {
          en: "A beginner shouldn't meet a reranker, gateway and eval runner on day one. The ladder teaches progressively: Simple is today's real app; higher rungs preview what production adds, lit up spec by spec.",
          pt: "Um iniciante não deveria encontrar um reranker, gateway e eval runner no primeiro dia. A escada ensina progressivamente: Simples é o app real de hoje; degraus acima previem o que produção adiciona, acesos spec a spec.",
        },
        how: {
          en: "You compose the architecture in the “Build” palette (lib/selection.ts); visibleStationsFor / visibleHopsFor / visibleTiersFor render exactly the selected components and computeLayout(expanded, selection) reflows the canvas. Maturity (Simple/Intermediate/Advanced) is a derived badge; preview components are non-executing comingSoon nodes.",
          pt: "Você compõe a arquitetura na paleta “Montar” (lib/selection.ts); visibleStationsFor / visibleHopsFor / visibleTiersFor renderizam exatamente os componentes selecionados e computeLayout(expanded, selection) reflui o canvas. A maturidade (Simples/Intermediário/Avançado) é um badge derivado; componentes de prévia são nós comingSoon que não executam.",
        },
        options: {
          en: "Comparable frameworks for 'how grown-up is this': capability maturity models (CMM), the cloud Well-Architected reviews, or LLMOps maturity rubrics — all stage capabilities from basic to production-hardened.",
          pt: "Frameworks comparáveis para 'quão maduro está isso': modelos de maturidade de capacidade (CMM), as revisões Well-Architected das nuvens, ou rubricas de maturidade de LLMOps — todos estagiam capacidades do básico ao endurecido para produção.",
        },
        where: "frontend/src/lib/scenario.ts · stations.ts (scenarios[] · 008-scenario-framework)",
      },
      {
        id: "health-checks",
        title: { en: "Health & readiness checks", pt: "Checagens de saúde e prontidão" },
        what: {
          en: "A /api/health endpoint reports whether the backend is up and whether the API key is configured (has_key), so the frontend can show an honest banner instead of failing silently.",
          pt: "Um endpoint /api/health informa se o backend está no ar e se a chave de API está configurada (has_key), para o frontend mostrar um aviso honesto em vez de falhar em silêncio.",
        },
        why: {
          en: "Orchestrators need a signal to know if a container is alive and ready for traffic; a health endpoint is that signal, and exposing has_key makes a misconfigured deploy diagnosable at a glance.",
          pt: "Orquestradores precisam de um sinal para saber se um container está vivo e pronto para tráfego; um endpoint de saúde é esse sinal, e expor has_key torna um deploy mal configurado diagnosticável num relance.",
        },
        how: {
          en: "A lightweight handler returns 200 with a small JSON (model, has_key); platforms poll it as a liveness probe (restart if dead) and a readiness probe (don't route traffic until ready).",
          pt: "Um handler leve retorna 200 com um JSON pequeno (modelo, has_key); plataformas o consultam como liveness probe (reinicia se morto) e readiness probe (não roteia tráfego até estar pronto).",
        },
        options: {
          en: "Alternatives/extensions: separate liveness vs. readiness endpoints, deep health checks that ping dependencies (DB, vector store), and synthetic monitoring that exercises a real turn from outside.",
          pt: "Alternativas/extensões: endpoints separados de liveness vs. readiness, health checks profundos que pingam dependências (banco, vetorial), e monitoramento sintético que exercita um turno real de fora.",
        },
        where: "backend/app/main.py (/api/health) · frontend health banner",
      },
    ],
  },
  {
    id: "data",
    title: { en: "Data & Databases", pt: "Dados e Bancos de Dados" },
    icon: "🗄️",
    accent: "var(--color-teal)",
    intro: {
      en: "Where data lives: the vector database for retrieval, persistence, and the application database the backend would connect to.",
      pt: "Onde os dados ficam: o banco vetorial para recuperação, a persistência e o banco de aplicação ao qual o backend se conectaria.",
    },
    topics: [
      {
        id: "vector-db",
        title: { en: "Vector database (Chroma)", pt: "Banco de dados vetorial (Chroma)" },
        what: {
          en: "Chroma stores chunk embeddings + text + metadata and serves nearest-neighbor search.",
          pt: "O Chroma armazena embeddings dos trechos + texto + metadados e serve a busca por vizinhos mais próximos.",
        },
        why: {
          en: "A purpose-built vector store makes semantic retrieval fast and is the storage half of the RAG pipeline.",
          pt: "Um armazenamento vetorial dedicado torna a recuperação semântica rápida e é a metade de armazenamento do pipeline de RAG.",
        },
        how: {
          en: "Each chunk is stored as { embedding vector, original text, metadata }; a query embeds the text and asks the index for the nearest vectors, returning their text and a distance.",
          pt: "Cada chunk é armazenado como { vetor de embedding, texto original, metadados }; uma consulta gera o embedding do texto e pede ao índice os vetores mais próximos, retornando seu texto e uma distância.",
        },
        options: {
          en: "Alternatives to Chroma: Pinecone or Weaviate (managed), Qdrant or Milvus (self-host, high scale), or pgvector to keep vectors in Postgres next to relational data.",
          pt: "Alternativas ao Chroma: Pinecone ou Weaviate (gerenciados), Qdrant ou Milvus (auto-hospedados, alta escala), ou pgvector para manter vetores no Postgres ao lado dos dados relacionais.",
        },
        cloudRef: "rag",
        links: [{ label: "Chroma docs", url: "https://docs.trychroma.com" }],
        where: "backend/app/rag/store.py",
      },
      {
        id: "ann-index",
        title: { en: "ANN index (HNSW)", pt: "Índice ANN (HNSW)" },
        what: {
          en: "An approximate nearest-neighbor index (HNSW) finds close vectors without scanning every record.",
          pt: "Um índice de vizinhos mais próximos aproximados (HNSW) encontra vetores próximos sem varrer cada registro.",
        },
        why: {
          en: "Brute-force comparison doesn't scale; an index keeps retrieval fast as the corpus grows to millions of chunks.",
          pt: "A comparação por força bruta não escala; um índice mantém a recuperação rápida conforme o corpus cresce para milhões de trechos.",
        },
        how: {
          en: "HNSW builds a multi-layer graph of vectors; search greedily hops toward the query through ever-finer layers, touching a tiny fraction of the data — approximate, but fast and high-recall.",
          pt: "O HNSW constrói um grafo multicamadas de vetores; a busca salta gulosamente em direção à consulta por camadas cada vez mais finas, tocando uma fração mínima dos dados — aproximado, mas rápido e com alto recall.",
        },
        options: {
          en: "Alternatives: IVF (cluster then search a few cells), ScaNN or DiskANN (billion-scale, disk-backed), or a flat brute-force index when the corpus is small enough to scan exactly.",
          pt: "Alternativas: IVF (agrupar e então buscar em algumas células), ScaNN ou DiskANN (escala de bilhões, em disco), ou um índice flat por força bruta quando o corpus é pequeno o bastante para varrer exatamente.",
        },
        links: [
          { label: "HNSW paper (Malkov & Yashunin)", url: "https://arxiv.org/abs/1603.09320" },
        ],
        where: "Chroma collection (hnsw:space = cosine)",
      },
      {
        id: "persistence",
        title: { en: "Persistence & volumes", pt: "Persistência e volumes" },
        what: {
          en: "The Chroma index is persisted to disk and mounted as a Docker volume, surviving restarts.",
          pt: "O índice do Chroma é persistido em disco e montado como volume do Docker, sobrevivendo a reinicializações.",
        },
        why: {
          en: "Re-embedding on every boot is slow and (with a real model) costly; persisting the index reuses it across restarts.",
          pt: "Recalcular os embeddings a cada inicialização é lento e (com um modelo real) caro; persistir o índice o reaproveita entre reinicializações.",
        },
        how: {
          en: "Chroma writes the collection to a directory; mounting that directory as a Docker volume keeps it on the host, so the index outlives the container and isn't re-embedded on every boot.",
          pt: "O Chroma grava a coleção em um diretório; montar esse diretório como volume do Docker o mantém no host, então o índice sobrevive ao container e não é recalculado a cada inicialização.",
        },
        options: {
          en: "Alternatives: a managed vector service (no volumes to babysit), object storage for snapshots/backups, or a network filesystem when several replicas must share one index.",
          pt: "Alternativas: um serviço vetorial gerenciado (sem volumes para cuidar), armazenamento de objetos para snapshots/backups, ou um sistema de arquivos em rede quando várias réplicas precisam compartilhar um índice.",
        },
        where: "docker-compose.yml (chroma-data volume)",
      },
      {
        id: "app-db",
        title: { en: "Application database (its own station)", pt: "Banco de dados da aplicação (estação própria)" },
        what: {
          en: "A real relational database — a SQLite store here, a managed SQL service (Azure SQL / RDS / Cloud SQL) in production. The backend reads recent history (db.read) and persists every conversation (db.write); you can watch both light up on the canvas.",
          pt: "Um banco relacional real — aqui um SQLite, em produção um serviço SQL gerenciado (Azure SQL / RDS / Cloud SQL). O backend lê o histórico recente (db.read) e persiste cada conversa (db.write); dá para ver os dois acendendo no canvas.",
        },
        why: {
          en: "Conversations, accounts and audit logs must outlive a process and be shared across replicas. It is deliberately separate from the RAG vector store — transactional state and embeddings are different jobs with different databases.",
          pt: "Conversas, contas e logs de auditoria precisam sobreviver a um processo e ser compartilhados entre réplicas. É propositalmente separado do vector store do RAG — estado transacional e embeddings são trabalhos diferentes com bancos diferentes.",
        },
        how: {
          en: "Before the agent runs, `db.read` loads recent { message, answer } pairs; after, `db.write` persists the turn. SQLite calls run via `asyncio.to_thread` so they don't block the event loop.",
          pt: "Antes de o agente rodar, `db.read` carrega pares recentes { mensagem, resposta }; depois, `db.write` persiste o turno. As chamadas SQLite rodam via `asyncio.to_thread` para não bloquear o event loop.",
        },
        options: {
          en: "Alternatives in production: managed Postgres/MySQL for transactions, a document store (Cosmos DB, DynamoDB) for flexible schemas, or a serverless DB that scales to zero.",
          pt: "Alternativas em produção: Postgres/MySQL gerenciado para transações, um document store (Cosmos DB, DynamoDB) para esquemas flexíveis, ou um banco serverless que escala a zero.",
        },
        cloudRef: "database",
        where: "backend/app/db/store.py (ConversationStore · SQLite)",
      },
      {
        id: "in-memory",
        title: { en: "In-memory state & trade-offs", pt: "Estado em memória e trade-offs" },
        what: {
          en: "Traces live in a bounded in-memory dict, so they're lost on restart and not shared between replicas.",
          pt: "Os traces vivem em um dicionário em memória limitado, então são perdidos na reinicialização e não são compartilhados entre réplicas.",
        },
        why: {
          en: "In-memory is perfect for a single-instance demo (zero setup), but it's the first thing you'd replace with a database to scale out.",
          pt: "Em memória é perfeito para uma demo de instância única (zero configuração), mas é a primeira coisa que você trocaria por um banco de dados para escalar horizontalmente.",
        },
        how: {
          en: "Finished traces are kept in a bounded dict keyed by trace id (oldest evicted); it's process-local, so it's lost on restart and not shared across replicas — the single-instance assumption made explicit.",
          pt: "Os traces concluídos ficam em um dict limitado indexado por id de trace (os mais antigos são removidos); é local ao processo, então é perdido na reinicialização e não compartilhado entre réplicas — a premissa de instância única tornada explícita.",
        },
        options: {
          en: "To scale out you'd back it with Redis (shared, fast, TTL) or a database (durable, queryable), or ship traces to an observability backend instead of holding them in app memory.",
          pt: "Para escalar você o apoiaria em Redis (compartilhado, rápido, com TTL) ou um banco (durável, consultável), ou enviaria os traces a um backend de observabilidade em vez de mantê-los na memória do app.",
        },
        where: "TraceStore in backend/app/trace.py",
      },
      {
        id: "trace-replay",
        title: { en: "Trace store & replay", pt: "Trace store e replay" },
        what: {
          en: "Every emitted event is appended to a per-trace list; the frontend can replay that list up to any cursor, redrawing the exact state at that point — live streaming is just the cursor at the end.",
          pt: "Cada evento emitido é anexado a uma lista por trace; o frontend pode reproduzir essa lista até qualquer cursor, redesenhando o estado exato naquele ponto — o streaming ao vivo é apenas o cursor no fim.",
        },
        why: {
          en: "Storing the full event log (not just the final answer) is what makes step-through debugging, pause/replay and 'what happened at step 7?' possible — the same idea behind event sourcing.",
          pt: "Guardar o log completo de eventos (não só a resposta final) é o que torna possível o debug passo a passo, pausar/reproduzir e 'o que aconteceu no passo 7?' — a mesma ideia por trás de event sourcing.",
        },
        how: {
          en: "deriveView(events, cursor) is a pure function from (log, cursor) → canvas state; advancing the cursor replays history, so live and replay share one code path. Traces are fetched by id and cached.",
          pt: "deriveView(events, cursor) é uma função pura de (log, cursor) → estado do canvas; avançar o cursor reproduz o histórico, então ao vivo e replay compartilham um único caminho de código. Traces são buscados por id e cacheados.",
        },
        options: {
          en: "Alternatives: log only the final result (smaller, but no replay), full event sourcing with a durable event store, or OpenTelemetry spans exported to a tracing backend for production-grade replay.",
          pt: "Alternativas: logar só o resultado final (menor, mas sem replay), event sourcing completo com um event store durável, ou spans OpenTelemetry exportados a um backend de tracing para replay de nível de produção.",
        },
        where: "backend/app/trace.py (TraceStore) · frontend/src/lib/derive.ts",
      },
    ],
  },
  {
    id: "production",
    title: { en: "Production & AI-Ops", pt: "Produção e AI-Ops" },
    icon: "🪜",
    accent: "var(--color-orange)",
    intro: {
      en: "What an agent needs to grow up. Climb from Simple → Intermediate → Advanced and these are the production concerns each rung adds — the AI-Ops axis that separates a teaching demo from a real pipeline. (Preview topology: declared as non-executing 'coming soon' nodes; each lands in its own spec.)",
      pt: "O que um agente precisa para amadurecer. Suba de Simples → Intermediário → Avançado e estes são os temas de produção que cada degrau adiciona — o eixo de AI-Ops que separa uma demo didática de um pipeline real. (Topologia de prévia: declarados como nós 'em breve' que não executam; cada um chega em sua própria spec.)",
    },
    topics: [
      {
        id: "deepagents",
        title: { en: "DeepAgents (Intermediate)", pt: "DeepAgents (Intermediário)" },
        what: {
          en: "An evolution of the simple ReAct loop: a planner that writes an explicit task list, sub-agents it can spawn for sub-tasks, and a virtual file system as scratch memory — so the agent can tackle longer, multi-step work without losing the thread.",
          pt: "Uma evolução do loop ReAct simples: um planejador que escreve uma lista explícita de tarefas, subagentes que ele pode criar para subtarefas e um sistema de arquivos virtual como memória de rascunho — para o agente encarar trabalhos mais longos e com vários passos sem perder o fio.",
        },
        why: {
          en: "A flat ReAct loop forgets its plan and burns context on long tasks. DeepAgents adds structure — plan, delegate, persist — so the agent stays coherent over many steps. The Intermediate rung reframes the Agent node as DeepAgents to mark this direction.",
          pt: "Um loop ReAct plano esquece o plano e gasta contexto em tarefas longas. O DeepAgents adiciona estrutura — planejar, delegar, persistir — para o agente se manter coerente ao longo de muitos passos. O degrau Intermediário renomeia o nó do Agente como DeepAgents para marcar essa direção.",
        },
        how: {
          en: "A planner LLM writes a task list; the agent works items one by one, can spawn focused sub-agents for sub-tasks, and uses a virtual file system as durable scratch memory so long plans survive context limits.",
          pt: "Um LLM planejador escreve uma lista de tarefas; o agente trabalha os itens um a um, pode criar subagentes focados para subtarefas, e usa um sistema de arquivos virtual como memória de rascunho durável para planos longos sobreviverem aos limites de contexto.",
        },
        options: {
          en: "Related patterns: Plan-and-Execute and Reflexion (single agent, explicit planning), or 'deep research' agents that browse and write reports over many steps. LangChain's deepagents package is one implementation.",
          pt: "Padrões relacionados: Plan-and-Execute e Reflexion (agente único, planejamento explícito), ou agentes de 'deep research' que navegam e escrevem relatórios ao longo de muitos passos. O pacote deepagents do LangChain é uma implementação.",
        },
        where: "stations.ts · AGENT_SCENARIO_LABEL (intermediate) — label only, not yet implemented",
      },
      {
        id: "multi-agent",
        title: { en: "Multi-agent orchestration (Advanced)", pt: "Orquestração multi-agente (Avançado)" },
        what: {
          en: "Several specialized agents that coordinate instead of one monolithic loop: an orchestrator (or supervisor) plans and delegates to workers — e.g. a researcher, a coder, a critic — each with its own prompt and tools, then merges their results.",
          pt: "Vários agentes especializados que se coordenam em vez de um único loop monolítico: um orquestrador (ou supervisor) planeja e delega a workers — ex.: um pesquisador, um programador, um crítico — cada um com seu próprio prompt e ferramentas, e então junta os resultados.",
        },
        why: {
          en: "Specialization beats one generalist on complex work: each sub-agent has a focused prompt and toolset, they can run in parallel, and a critic can review before the answer ships. The Advanced rung reframes the Agent as DeepAgents + Multi-agents.",
          pt: "Especialização supera um único generalista em trabalhos complexos: cada subagente tem prompt e ferramentas focados, podem rodar em paralelo e um crítico pode revisar antes de a resposta sair. O degrau Avançado renomeia o Agente como DeepAgents + Multiagentes.",
        },
        how: {
          en: "An orchestrator decomposes the task and routes sub-tasks to specialized workers (researcher, coder, critic), each with its own prompt and tools; results are merged, often with a critic reviewing before the final answer.",
          pt: "Um orquestrador decompõe a tarefa e roteia subtarefas para workers especializados (pesquisador, programador, crítico), cada um com seu prompt e ferramentas; os resultados são unidos, muitas vezes com um crítico revisando antes da resposta final.",
        },
        options: {
          en: "Topologies: supervisor/worker (one router), hierarchical teams, or a peer-to-peer network. Frameworks: LangGraph, CrewAI, AutoGen, OpenAI Swarm — they trade control for orchestration sugar.",
          pt: "Topologias: supervisor/worker (um roteador), times hierárquicos, ou uma rede ponto a ponto. Frameworks: LangGraph, CrewAI, AutoGen, OpenAI Swarm — trocam controle por açúcar de orquestração.",
        },
        where: "stations.ts · AGENT_SCENARIO_LABEL (advanced) — label only, not yet implemented",
      },
      {
        id: "reranker",
        title: { en: "Reranker (cross-encoder)", pt: "Reranker (cross-encoder)" },
        what: {
          en: "A second-pass model that re-scores the top-k chunks the vector search returned, reading the query and each chunk together (a cross-encoder) instead of comparing pre-computed embeddings.",
          pt: "Um modelo de segundo passo que re-pontua os top-k trechos que a busca vetorial retornou, lendo a consulta e cada trecho juntos (um cross-encoder) em vez de comparar embeddings pré-computados.",
        },
        why: {
          en: "Bi-encoder vector search is fast but coarse; a reranker is slower but far more precise, so you retrieve many candidates cheaply and rerank a few accurately — a big lift in RAG quality for little extra latency.",
          pt: "A busca vetorial por bi-encoder é rápida mas grosseira; um reranker é mais lento porém muito mais preciso, então você recupera muitos candidatos de forma barata e reordena poucos com precisão — um grande ganho de qualidade no RAG com pouca latência extra.",
        },
        how: {
          en: "After the vector search returns, say, the top 20, a cross-encoder scores each (query, chunk) pair together in one model pass and re-sorts them; you then keep the new top-k for the prompt.",
          pt: "Depois de a busca vetorial retornar, digamos, os top 20, um cross-encoder pontua cada par (consulta, trecho) junto em uma passada do modelo e os reordena; você então mantém os novos top-k para o prompt.",
        },
        options: {
          en: "Alternatives: hosted rerank APIs (Cohere Rerank, Voyage), open cross-encoders (bge-reranker, sentence-transformers), or an LLM-as-reranker prompt — accuracy and latency rise together.",
          pt: "Alternativas: APIs de rerank hospedadas (Cohere Rerank, Voyage), cross-encoders abertos (bge-reranker, sentence-transformers), ou um prompt de LLM-como-reranker — precisão e latência sobem juntas.",
        },
        // 054-rag-block-expansion folded the reranker into the `rag` station, so its
        // managed-service examples live here as inline notes (no station to borrow).
        cloud: {
          azure: {
            en: "Azure AI Search's built-in semantic ranker reorders results with a cross-encoder — no separate service to run.",
            pt: "O semantic ranker nativo do Azure AI Search reordena resultados com um cross-encoder — sem serviço separado para rodar.",
          },
          aws: {
            en: "Amazon Bedrock exposes Cohere Rerank as a managed reranking endpoint you call after the vector search.",
            pt: "O Amazon Bedrock expõe o Cohere Rerank como endpoint de reranking gerenciado que você chama após a busca vetorial.",
          },
          gcp: {
            en: "Vertex AI's Ranking API re-scores retrieved passages against the query as a managed service.",
            pt: "A Ranking API da Vertex AI re-pontua passagens recuperadas contra a consulta como serviço gerenciado.",
          },
        },
        links: [
          {
            label: "Sentence-Transformers — Cross-Encoders",
            url: "https://www.sbert.net/examples/applications/cross-encoder/README.html",
          },
        ],
        where: "backend/app/rag/reranker.py · rag.rerank sub-stage of the `rag` station (RagDetail)",
      },
      {
        id: "hybrid-search",
        title: { en: "Hybrid search (BM25 + dense + RRF)", pt: "Busca híbrida (BM25 + densa + RRF)" },
        what: {
          en: "Runs keyword search (BM25) and semantic vector search side by side, then fuses the two ranked lists — typically with Reciprocal Rank Fusion (RRF) — into one result set.",
          pt: "Roda busca por palavra-chave (BM25) e busca vetorial semântica lado a lado, depois funde as duas listas ordenadas — tipicamente com Reciprocal Rank Fusion (RRF) — em um único conjunto de resultados.",
        },
        why: {
          en: "Dense vectors capture meaning but miss exact terms (names, codes, acronyms); keyword search nails those but misses paraphrase. Fusing both recovers what either alone would drop. Enable Hybrid Search (Vector RAG) in the Build popover to run the BM25 lane and fuse it with RRF.",
          pt: "Vetores densos captam significado mas erram termos exatos (nomes, códigos, siglas); a busca por palavra-chave acerta esses mas erra paráfrases. Fundir as duas recupera o que cada uma sozinha deixaria passar. Ative a Busca Híbrida (Vector RAG) no popover Build para rodar a lane BM25 e fundir com RRF.",
        },
        how: {
          en: "BM25 ranks by exact term overlap; dense search ranks by embedding similarity; Reciprocal Rank Fusion merges the two ranked lists by summing 1/(k + rank) so a doc high in either list rises.",
          pt: "O BM25 ordena por sobreposição exata de termos; a busca densa ordena por similaridade de embeddings; o Reciprocal Rank Fusion une as duas listas somando 1/(k + posição) para um doc bem colocado em qualquer lista subir.",
        },
        options: {
          en: "Alternatives to RRF: weighted score fusion, or a learned ranker over both signals. Many vector DBs (Weaviate, Qdrant, Azure AI Search) ship hybrid search built in.",
          pt: "Alternativas ao RRF: fusão ponderada de scores, ou um ranker aprendido sobre os dois sinais. Muitos bancos vetoriais (Weaviate, Qdrant, Azure AI Search) já trazem busca híbrida embutida.",
        },
        where: "backend/app/rag/hybrid.py · retriever.py (rag.hybrid sub-stage) · Intermediate",
      },
      {
        id: "llm-gateway",
        title: { en: "LLM gateway", pt: "Gateway de LLM" },
        what: {
          en: "A proxy every model call goes through: it handles auth and routing across providers/models, retries and fallbacks, rate limits and quotas, and centralizes cost tracking and logging.",
          pt: "Um proxy por onde passa cada chamada ao modelo: cuida de autenticação e roteamento entre provedores/modelos, retries e fallbacks, limites de taxa e cotas, e centraliza o controle de custo e o logging.",
        },
        why: {
          en: "Calling provider SDKs straight from app code scatters keys, retries and cost logic everywhere. A gateway is one control point for reliability, governance and FinOps — swap a model or add a budget cap without touching the agent.",
          pt: "Chamar os SDKs dos provedores direto do código da app espalha chaves, retries e lógica de custo por toda parte. Um gateway é um único ponto de controle para confiabilidade, governança e FinOps — troque um modelo ou adicione um teto de orçamento sem tocar no agente.",
        },
        how: {
          en: "Every model call goes through one proxy that authenticates, routes to a provider/model, retries and falls back on failure, enforces rate limits and budgets, and logs tokens and cost in one place.",
          pt: "Cada chamada ao modelo passa por um proxy único que autentica, roteia para um provedor/modelo, faz retry e fallback em falha, impõe limites de taxa e orçamentos, e loga tokens e custo em um só lugar.",
        },
        options: {
          en: "Implementations: LiteLLM Proxy, Portkey, Cloudflare AI Gateway, or a cloud API gateway in front of the model — open-source self-host vs. managed are the main fork.",
          pt: "Implementações: LiteLLM Proxy, Portkey, Cloudflare AI Gateway, ou um API gateway de nuvem na frente do modelo — auto-hospedado open-source vs. gerenciado são a principal bifurcação.",
        },
        cloudRef: "gateway",
        where: "stations.ts · station 'gateway' (Advanced preview)",
      },
      {
        id: "guardrails",
        title: { en: "Guardrails (input / output)", pt: "Guardrails (entrada / saída)" },
        what: {
          en: "Checks that wrap the model: input guardrails screen the user's message (prompt-injection, PII, off-topic, jailbreaks) before it reaches the agent; output guardrails validate the answer (toxicity, leaked secrets, schema/format) before it reaches the user.",
          pt: "Verificações que envolvem o modelo: guardrails de entrada filtram a mensagem do usuário (injeção de prompt, PII, fora de tópico, jailbreaks) antes de chegar ao agente; guardrails de saída validam a resposta (toxicidade, segredos vazados, esquema/formato) antes de chegar ao usuário.",
        },
        why: {
          en: "An LLM will happily follow a malicious instruction or emit something unsafe. Guardrails are the safety boundary that makes an agent shippable in front of real users — and they fail closed, blocking rather than guessing.",
          pt: "Um LLM seguirá de bom grado uma instrução maliciosa ou emitirá algo inseguro. Guardrails são a fronteira de segurança que torna um agente publicável diante de usuários reais — e falham fechando, bloqueando em vez de adivinhar.",
        },
        how: {
          en: "A check runs before the agent (screen the input) and after it (validate the output); each can pass, block (fail closed) or rewrite. Checks range from regex/PII to a classifier or a judge LLM.",
          pt: "Uma verificação roda antes do agente (filtra a entrada) e depois dele (valida a saída); cada uma pode passar, bloquear (falha fechando) ou reescrever. As verificações vão de regex/PII a um classificador ou um LLM-juiz.",
        },
        options: {
          en: "Tools: NeMo Guardrails, Guardrails AI, Llama Guard / Prompt Guard, or cloud safety APIs (Azure AI Content Safety, Bedrock Guardrails) — usually combined for defense in depth.",
          pt: "Ferramentas: NeMo Guardrails, Guardrails AI, Llama Guard / Prompt Guard, ou APIs de segurança das nuvens (Azure AI Content Safety, Bedrock Guardrails) — em geral combinadas para defesa em profundidade.",
        },
        cloudRef: "guardrails",
        where: "stations.ts · station 'guardrails' (Advanced preview)",
      },
      {
        id: "semantic-cache",
        title: { en: "Semantic cache", pt: "Cache semântico" },
        what: {
          en: "A cache keyed by meaning, not exact text: it embeds the incoming query and, if a past query is close enough in vector space, returns the stored answer instead of calling the model.",
          pt: "Um cache indexado por significado, não por texto exato: gera o embedding da consulta que chega e, se uma consulta passada estiver próxima o suficiente no espaço vetorial, retorna a resposta armazenada em vez de chamar o modelo.",
        },
        why: {
          en: "Many users ask the same thing in different words. A semantic cache turns those into instant, near-zero-cost hits — cutting latency and spend — where an exact-match cache would miss on any rephrase.",
          pt: "Muitos usuários perguntam a mesma coisa com palavras diferentes. Um cache semântico transforma isso em acertos instantâneos e de custo quase zero — cortando latência e gasto — onde um cache de correspondência exata erraria a qualquer reformulação.",
        },
        how: {
          en: "The incoming query is embedded and compared to cached query vectors; if the nearest is within a similarity threshold, the stored answer is returned instantly — otherwise the model runs and the result is cached.",
          pt: "A consulta que chega é embeddada e comparada a vetores de consultas em cache; se a mais próxima estiver dentro de um limiar de similaridade, a resposta armazenada é retornada na hora — senão o modelo roda e o resultado é cacheado.",
        },
        options: {
          en: "Alternatives: an exact-match prompt cache (fast, but misses any rephrase), the provider's built-in prompt caching for repeated prefixes, or GPTCache / Redis-backed semantic caches.",
          pt: "Alternativas: um cache de correspondência exata de prompt (rápido, mas erra qualquer reformulação), o cache de prompt nativo do provedor para prefixos repetidos, ou caches semânticos GPTCache / apoiados em Redis.",
        },
        cloudRef: "cache",
        where: "stations.ts · station 'cache' (Advanced preview)",
      },
      {
        id: "eval-runner",
        title: { en: "Eval runner", pt: "Eval runner (avaliações)" },
        what: {
          en: "An automated way to score agent quality: a dataset of inputs with graded outputs, run offline in CI (did this change make answers better or worse?) and online on live traffic (LLM-as-judge, faithfulness, relevance).",
          pt: "Uma forma automatizada de pontuar a qualidade do agente: um conjunto de entradas com saídas avaliadas, rodado offline na CI (essa mudança deixou as respostas melhores ou piores?) e online no tráfego real (LLM como juiz, fidelidade, relevância).",
        },
        why: {
          en: "'It looks good in the demo' isn't a quality bar. Evals turn agent quality into a regression-testable number, so you ship changes with evidence instead of vibes — the same red→green discipline this project applies to code, applied to answers.",
          pt: "'Parece bom na demo' não é um critério de qualidade. As avaliações transformam a qualidade do agente em um número testável contra regressões, para você publicar mudanças com evidência em vez de achismo — a mesma disciplina red→green que este projeto aplica ao código, aplicada às respostas.",
        },
        how: {
          en: "A dataset of inputs with reference outputs is scored by metrics — exact match, similarity, or an LLM-as-judge for faithfulness/relevance — run offline in CI and sampled online on live traffic.",
          pt: "Um conjunto de entradas com saídas de referência é pontuado por métricas — correspondência exata, similaridade, ou um LLM-como-juiz para fidelidade/relevância — rodado offline na CI e amostrado online no tráfego real.",
        },
        options: {
          en: "Frameworks: RAGAS (RAG-specific), DeepEval, OpenAI Evals, Promptfoo, or LangSmith / Langfuse datasets — they turn 'feels better' into a tracked score you can gate releases on.",
          pt: "Frameworks: RAGAS (específico para RAG), DeepEval, OpenAI Evals, Promptfoo, ou datasets do LangSmith / Langfuse — transformam 'parece melhor' em um score rastreado para travar releases.",
        },
        cloudRef: "eval",
        links: [{ label: "RAGAS docs", url: "https://docs.ragas.io" }],
        where: "stations.ts · station 'eval' (Advanced preview)",
      },
      {
        id: "observability",
        title: { en: "Observability & tracing", pt: "Observabilidade e tracing" },
        what: {
          en: "LLM-native telemetry: every request emits a trace of spans (retrieval, each reasoning round, tool calls, generation) with tokens, cost, latency and the real prompts — shipped to a sink (e.g. an OpenTelemetry / LLM-observability backend) you can query and alert on.",
          pt: "Telemetria nativa de LLM: cada requisição emite um trace de spans (recuperação, cada rodada de raciocínio, chamadas de ferramentas, geração) com tokens, custo, latência e os prompts reais — enviados a um sink (ex.: um backend de OpenTelemetry / observabilidade de LLM) onde você consulta e cria alertas.",
        },
        why: {
          en: "You can't debug or improve what you can't see. In production an agent is a distributed, non-deterministic system; tracing every step is how you find the slow hop, the costly round, or the prompt that went wrong. This whole app is a teaching-grade version of exactly that.",
          pt: "Você não depura nem melhora o que não consegue ver. Em produção um agente é um sistema distribuído e não determinístico; rastrear cada passo é como você acha o salto lento, a rodada cara ou o prompt que deu errado. Este app inteiro é uma versão didática exatamente disso.",
        },
        how: {
          en: "Each request emits a trace of nested spans (retrieval, each reasoning round, tool calls, generation) carrying tokens, cost, latency and the real prompts; spans are exported to a backend you can query, dashboard and alert on.",
          pt: "Cada requisição emite um trace de spans aninhados (recuperação, cada rodada de raciocínio, chamadas de ferramentas, geração) carregando tokens, custo, latência e os prompts reais; os spans são exportados a um backend onde você consulta, faz dashboards e cria alertas.",
        },
        options: {
          en: "Stacks: OpenTelemetry + OpenLLMetry as the open standard, or LLM-native platforms (LangSmith, Langfuse, Arize Phoenix, Helicone) that understand prompts, tokens and traces out of the box.",
          pt: "Stacks: OpenTelemetry + OpenLLMetry como o padrão aberto, ou plataformas nativas de LLM (LangSmith, Langfuse, Arize Phoenix, Helicone) que entendem prompts, tokens e traces de fábrica.",
        },
        cloudRef: "observability",
        links: [{ label: "OpenTelemetry", url: "https://opentelemetry.io" }],
        where: "stations.ts · station 'observability' (Advanced preview)",
      },
    ],
  },
  {
    id: "viz",
    title: { en: "Frontend & Visualization", pt: "Frontend e Visualização" },
    icon: "🎨",
    accent: "var(--color-blue)",
    intro: {
      en: "How the canvas itself is built: the libraries and patterns that turn a stream of events into the live, inspectable diagram you're looking at.",
      pt: "Como o próprio canvas é construído: as bibliotecas e padrões que transformam um fluxo de eventos no diagrama vivo e inspecionável que você está vendo.",
    },
    topics: [
      {
        id: "react-flow",
        title: { en: "React Flow (@xyflow/react)", pt: "React Flow (@xyflow/react)" },
        what: {
          en: "The library that renders the node-and-edge canvas: pan/zoom, custom node components, typed edges and handles, all driven by React state.",
          pt: "A biblioteca que renderiza o canvas de nós e arestas: pan/zoom, componentes de nó customizados, arestas e handles tipados, tudo movido pelo estado do React.",
        },
        why: {
          en: "Building draggable, zoomable, connected nodes by hand is a lot of SVG and math; React Flow gives that for free and lets each station be an ordinary React component, so the diagram stays declarative.",
          pt: "Construir nós arrastáveis, com zoom e conectados à mão é muito SVG e matemática; o React Flow dá isso de graça e deixa cada estação ser um componente React comum, então o diagrama fica declarativo.",
        },
        how: {
          en: "You pass nodes and edges arrays; custom node types render the station cards, and Handles mark where edges attach. Here geometry comes from computeLayout, content from stations.ts.",
          pt: "Você passa arrays de nodes e edges; tipos de nó customizados renderizam os cards das estações, e Handles marcam onde as arestas se conectam. Aqui a geometria vem de computeLayout, o conteúdo de stations.ts.",
        },
        options: {
          en: "Alternatives: D3 (max control, max effort), Cytoscape.js (graph-theory heavy), vis-network, or static Mermaid diagrams when you don't need interactivity.",
          pt: "Alternativas: D3 (controle máximo, esforço máximo), Cytoscape.js (forte em teoria dos grafos), vis-network, ou diagramas Mermaid estáticos quando você não precisa de interatividade.",
        },
        links: [{ label: "React Flow docs", url: "https://reactflow.dev" }],
        where: "frontend/src/components/FlowCanvas.tsx · @xyflow/react",
      },
      {
        id: "framer-motion",
        title: { en: "Framer Motion", pt: "Framer Motion" },
        what: {
          en: "The animation library behind the moving parts: tokens travelling along edges, stations lighting up, panels expanding — declared as motion components, not manual timers.",
          pt: "A biblioteca de animação por trás das partes em movimento: tokens viajando pelas arestas, estações acendendo, painéis expandindo — declaradas como componentes de movimento, não timers manuais.",
        },
        why: {
          en: "Animation is what turns a static diagram into a story you can watch; declaring it (animate to this state) instead of scripting frames keeps the code readable and interruptible.",
          pt: "A animação é o que transforma um diagrama estático em uma história que dá para assistir; declará-la (animar para este estado) em vez de roteirizar frames mantém o código legível e interrompível.",
        },
        how: {
          en: "motion.* components tween between prop states; AnimatePresence animates mount/unmount, and layout animations reflow smoothly when a station expands. State drives the animation, so replay animates too.",
          pt: "Componentes motion.* interpolam entre estados de props; o AnimatePresence anima entrada/saída, e animações de layout refluem suavemente quando uma estação expande. O estado move a animação, então o replay também anima.",
        },
        options: {
          en: "Alternatives: plain CSS transitions/keyframes (lightest), GSAP (timeline-grade control), or react-spring (physics-based) — Framer Motion sits in the declarative-React sweet spot.",
          pt: "Alternativas: transições/keyframes CSS puros (mais leve), GSAP (controle de timeline), ou react-spring (baseado em física) — o Framer Motion fica no ponto ideal do React declarativo.",
        },
        links: [{ label: "Framer Motion docs", url: "https://www.framer.com/motion/" }],
        where: "frontend/ — motion components across the canvas",
      },
      {
        id: "tailwind",
        title: { en: "Tailwind CSS v4", pt: "Tailwind CSS v4" },
        what: {
          en: "A utility-first CSS framework: you style elements with small classes (flex, gap-2, text-sm) in the markup, and theme tokens (CSS variables) define the palette for dark/light.",
          pt: "Um framework CSS utility-first: você estiliza elementos com classes pequenas (flex, gap-2, text-sm) na marcação, e tokens de tema (variáveis CSS) definem a paleta para escuro/claro.",
        },
        why: {
          en: "Utilities keep styling next to the markup (no jumping between files), enforce a consistent scale, and the v4 Vite plugin compiles only the classes you use — small bundles, no naming bikeshedding.",
          pt: "As utilidades mantêm a estilização junto da marcação (sem pular entre arquivos), impõem uma escala consistente, e o plugin Vite do v4 compila só as classes que você usa — bundles pequenos, sem discussão de nomes.",
        },
        how: {
          en: "@tailwindcss/vite scans the source for class names at build time and emits exactly that CSS; colors are referenced as var(--color-*) tokens so a theme swap re-colors everything at once.",
          pt: "O @tailwindcss/vite varre o código por nomes de classe no build e emite exatamente esse CSS; cores são referenciadas como tokens var(--color-*) para uma troca de tema recolorir tudo de uma vez.",
        },
        options: {
          en: "Alternatives: CSS Modules (scoped, explicit), CSS-in-JS (styled-components, Emotion), vanilla-extract (typed, zero-runtime), or plain CSS with custom properties.",
          pt: "Alternativas: CSS Modules (com escopo, explícito), CSS-in-JS (styled-components, Emotion), vanilla-extract (tipado, zero-runtime), ou CSS puro com custom properties.",
        },
        links: [{ label: "Tailwind CSS docs", url: "https://tailwindcss.com/docs" }],
        where: "frontend/ (utility classes) · theme tokens in CSS",
      },
      {
        id: "state-management",
        title: { en: "State management (Zustand)", pt: "Gerência de estado (Zustand)" },
        what: {
          en: "A tiny store holds the app's client state — the event list, the playhead cursor, which stations are expanded — and components subscribe to just the slices they render.",
          pt: "Um store minúsculo guarda o estado de cliente do app — a lista de eventos, o cursor do playhead, quais estações estão expandidas — e os componentes assinam só as fatias que renderizam.",
        },
        why: {
          en: "The whole UI is a function of (events, cursor); centralizing that in one store means live view, step and replay all read the same source of truth, and selectors keep re-renders surgical.",
          pt: "Toda a UI é uma função de (eventos, cursor); centralizar isso em um store faz a visão ao vivo, o passo e o replay lerem a mesma fonte de verdade, e seletores mantêm os re-renders cirúrgicos.",
        },
        how: {
          en: "create() defines state + actions in one place; components call useStore(s => s.slice) and re-render only when that slice changes. No providers, no boilerplate, no context tree.",
          pt: "create() define estado + ações em um só lugar; componentes chamam useStore(s => s.slice) e re-renderizam só quando essa fatia muda. Sem providers, sem boilerplate, sem árvore de contexto.",
        },
        options: {
          en: "Alternatives: Redux Toolkit (structured, more ceremony), Jotai or Recoil (atom-based), React Context (built-in, re-render-prone at scale), or signals (Preact/Solid-style).",
          pt: "Alternativas: Redux Toolkit (estruturado, mais cerimônia), Jotai ou Recoil (baseados em átomos), React Context (nativo, propenso a re-renders em escala), ou signals (estilo Preact/Solid).",
        },
        links: [{ label: "Zustand docs", url: "https://zustand.docs.pmnd.rs" }],
        where: "frontend/src/store/useSimulator.ts · other Zustand stores",
      },
      {
        id: "pure-projection",
        title: { en: "Pure projection (deriveView)", pt: "Projeção pura (deriveView)" },
        what: {
          en: "All the canvas state — station statuses, the active hop, the streamed answer, the iteration count — is computed by one pure function from the event log and a cursor, not stored and mutated.",
          pt: "Todo o estado do canvas — status das estações, o salto ativo, a resposta transmitida, a contagem de iterações — é computado por uma função pura a partir do log de eventos e de um cursor, não armazenado e mutado.",
        },
        why: {
          en: "If the view is a pure function of (log, cursor), then live streaming and step/replay are the same code with a different cursor — no second rendering path to keep in sync, and the function is trivially testable.",
          pt: "Se a visão é uma função pura de (log, cursor), então o streaming ao vivo e o passo/replay são o mesmo código com um cursor diferente — sem um segundo caminho de renderização para manter sincronizado, e a função é trivialmente testável.",
        },
        how: {
          en: "deriveView(events, cursor) folds the events up to the cursor into a view object the canvas draws; advancing or rewinding the cursor just recomputes it. Side-effect-free, so unit tests pin exact outputs.",
          pt: "deriveView(events, cursor) dobra os eventos até o cursor em um objeto de visão que o canvas desenha; avançar ou voltar o cursor apenas o recalcula. Sem efeitos colaterais, então testes unitários fixam saídas exatas.",
        },
        options: {
          en: "The same idea, scaled up: event sourcing (rebuild state by replaying events), CQRS (separate write log from read views), or Redux selectors / reselect (derive view state from a normalized store).",
          pt: "A mesma ideia, ampliada: event sourcing (reconstruir estado reproduzindo eventos), CQRS (separar o log de escrita das visões de leitura), ou selectors do Redux / reselect (derivar o estado de visão de um store normalizado).",
        },
        where: "frontend/src/lib/derive.ts (deriveView)",
      },
    ],
  },
];

// --- Resolvers + per-language caches -----------------------------------------

function resolveTopic(t: TopicSrc, lang: Lang): Topic {
  const cloud = t.cloud
    ? {
        azure: t.cloud.azure === undefined ? undefined : r(t.cloud.azure, lang),
        aws: t.cloud.aws === undefined ? undefined : r(t.cloud.aws, lang),
        gcp: t.cloud.gcp === undefined ? undefined : r(t.cloud.gcp, lang),
      }
    : undefined;
  return {
    ...t,
    title: r(t.title, lang),
    what: r(t.what, lang),
    why: r(t.why, lang),
    how: r(t.how, lang),
    options: r(t.options, lang),
    cloud,
  };
}

// --- Cloud-aware content (hybrid) --------------------------------------------
// Reuse the per-cloud managed-service name the canvas already knows (via the
// element's clouds{} map in stations.ts) and layer an optional hand-authored
// note on top. "generic" shows nothing — same as the rest of the cloud overlay.

export interface CloudContent {
  service?: string; // concrete managed-service name borrowed from stations.ts
  note?: string; // hand-authored per-topic note for this cloud
}

/** Shape any station/tier/boundary satisfies — enough for `cloudValue`. */
type CloudResolvable = { generic: string; clouds: { azure: string; aws: string; gcp: string } };

export function cloudElementFor(ref: string, lang: Lang): CloudResolvable | undefined {
  const stations = stationByIdFor(lang) as unknown as Record<string, CloudResolvable | undefined>;
  const tiers = tierByIdFor(lang) as unknown as Record<string, CloudResolvable | undefined>;
  const boundary = boundaryFor(lang);
  return stations[ref] ?? tiers[ref] ?? (boundary.id === ref ? boundary : undefined);
}

/**
 * Resolve cloud-specific content for a topic under the active cloud. Returns
 * `null` for "generic" or when the topic has nothing cloud-specific to show.
 */
export function cloudContentFor(topic: Topic, cloud: CloudId, lang: Lang): CloudContent | null {
  if (cloud === "generic") return null;
  const el = topic.cloudRef ? cloudElementFor(topic.cloudRef, lang) : undefined;
  const service = el ? cloudValue(el, cloud) : undefined;
  const note = topic.cloud?.[cloud];
  if (!service && !note) return null;
  return { service, note };
}

// --- Cloud guide (024-learn-cloud-column) ------------------------------------
// A curated, ordered walk of THIS system's layers, surfaced as a "Build on
// {cloud}" column on the Learn map when a provider is selected. Each entry
// borrows the concrete managed-service name from the shared stations.ts model
// (`ref` → clouds{}) and links to the layer's existing Learn topic.

export interface CloudGuideEntry {
  label: string; // the architectural layer (resolved per language)
  service: string; // concrete managed service for the active cloud (from stations.ts)
  topicId: string; // existing Learn topic to open on click
}

type CloudGuideSrc = { label: Tr; ref: string; topicId: string };

const CLOUD_GUIDE_SRC: CloudGuideSrc[] = [
  { label: { en: "Client", pt: "Cliente" }, ref: "frontend", topicId: "client-tier" },
  { label: { en: "API", pt: "API" }, ref: "backend", topicId: "api-tier" },
  { label: { en: "Agent", pt: "Agente" }, ref: "agent", topicId: "agent-tier" },
  { label: { en: "LLM", pt: "LLM" }, ref: "llm", topicId: "openai-provider" },
  { label: { en: "Vector DB", pt: "Banco vetorial" }, ref: "rag", topicId: "vector-db" },
  { label: { en: "App database", pt: "Banco da app" }, ref: "database", topicId: "app-db" },
  { label: { en: "MCP tools", pt: "Ferramentas MCP" }, ref: "mcp", topicId: "tool-calling" },
  { label: { en: "Private network", pt: "Rede privada" }, ref: "vnet", topicId: "private-net" },
];

export { CLOUD_GUIDE_SRC };

const cloudGuideCache: Partial<Record<string, CloudGuideEntry[]>> = {};

/**
 * Resolve the "Build on {cloud}" guide for the active cloud. Returns `[]` for
 * "generic". Service names are borrowed from stations.ts (no duplication);
 * entries whose ref yields no service are dropped.
 */
export function cloudGuideFor(cloud: CloudId, lang: Lang): CloudGuideEntry[] {
  if (cloud === "generic") return [];
  const key = `${cloud}:${lang}`;
  return (cloudGuideCache[key] ??= CLOUD_GUIDE_SRC.flatMap((e) => {
    const el = cloudElementFor(e.ref, lang);
    if (!el) return [];
    const service = cloudValue(el, cloud);
    if (!service) return [];
    return [{ label: r(e.label, lang), service, topicId: e.topicId }];
  }));
}

function resolveSection(s: SectionSrc, lang: Lang): Section {
  return {
    ...s,
    title: r(s.title, lang),
    intro: r(s.intro, lang),
    topics: s.topics.map((t) => resolveTopic(t, lang)),
  };
}

const sectionsCache: Partial<Record<Lang, Section[]>> = {};
const allTopicsCache: Partial<Record<Lang, Record<string, { topic: Topic; section: Section }>>> = {};

export function sectionsFor(lang: Lang): Section[] {
  return (sectionsCache[lang] ??= SECTIONS_SRC.map((s) => resolveSection(s, lang)));
}

export function allTopicsFor(lang: Lang): Record<string, { topic: Topic; section: Section }> {
  return (allTopicsCache[lang] ??= sectionsFor(lang).reduce(
    (acc, section) => {
      for (const topic of section.topics) acc[topic.id] = { topic, section };
      return acc;
    },
    {} as Record<string, { topic: Topic; section: Section }>,
  ));
}
