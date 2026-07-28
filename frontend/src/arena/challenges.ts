// 130-arena-challenges — the challenge library.
//
// A challenge is DATA, in the shape `examples.ts` already proved out: a pure
// factory producing a design, plus machine-checkable claims a test walks so the
// copy can never go stale. Here the claim is upgraded from a status word to a
// full 129 verdict.
//
// TWO RULES THAT ARE TESTS, NOT CONVENTIONS (see challenges.test.ts):
//
//  1. **Targets are PINNED in the brief and policed by the reference walk.** Every
//     challenge ships a `reference()` the model verifies meets every objective with
//     at least MIN_MARGIN slack, and a `start()` that misses one by at least that
//     much. A future recalibration (127-style latency, 128-style tier, a quota
//     re-anchor) therefore breaks a TEST rather than silently making a challenge
//     impossible — the 116 gotcha, where a 3 s target and a 1.5k quota made presets
//     unsatisfiable, is exactly this failure mode. **Re-tune the challenge; never
//     weaken the walk.** Raise `users` before lowering a target: a target lowered to
//     manufacture a margin is the thing MIN_MARGIN exists to prevent.
//
//  2. **Cost is never a challenge's only quantitative axis.** 129's measurement
//     found the inversion: a starved design is the CHEAPEST one, so a lone cost cap
//     would pass the broken design and fail every good one. A cost objective must be
//     paired with latency or headroom, and AC14 enforces it across the library.
//
// The briefs also state WHY an agent turn costs seconds (fan-out × output tokens ×
// decode, 127's calibration) — the honest figure reads as a defect to anyone
// expecting 300 ms unless the brief says so first (AC16).

import type { Lang } from "../i18n";
import { DEFAULT_CALL_SHAPE, type ArenaKind, type CallShape } from "./components";
import type { ArenaFault } from "./chaos";
import { COL, ROW, edge, node } from "./designKit";
import type { ArenaEdge } from "./model";
import { SLO_METRICS, type SloResult, type SloTargets } from "./slo";
import type { ArenaNode } from "./store";

/** The problem's fixed conditions — read-only while the challenge is active, so
 *  "meet the SLO" cannot be satisfied by dragging the load down. */
export interface ChallengeGivens {
  users: number;
  thinkTimeSec: number;
  callShape: CallShape;
  /** 131 — faults that are part of the PROBLEM ("hold the SLO with one region
   *  down"). Applied on entering and NOT removable while the challenge is active,
   *  and the reference solution must satisfy the objectives WITH them applied. This
   *  is how resilience becomes a scored axis without 129 gaining one. */
  faults?: ReadonlyArray<Omit<ArenaFault, "id">>;
}

export type ChallengeDifficulty = "easy" | "medium" | "hard";

export interface ArenaChallenge {
  id: string;
  difficulty: ChallengeDifficulty;
  title: Record<Lang, string>;
  /** The ask, in an architect's words — including why the latency floor is seconds. */
  brief: Record<Lang, string>;
  givens: ChallengeGivens;
  /** The pass condition: 129 targets. Arithmetic, not opinion. */
  objectives: SloTargets;
  /** The (deliberately broken) starting point — diagnose before you build. */
  start: () => { nodes: ArenaNode[]; edges: ArenaEdge[] };
  /** A verified solution. Not the only one — see the panel's wording. */
  reference: () => { nodes: ArenaNode[]; edges: ArenaEdge[] };
  /** When set, the palette offers only these kinds. */
  allowedKinds?: readonly ArenaKind[];
  /** 121 — Learn topic ids this challenge demonstrates (validated by a test). */
  concepts?: readonly string[];
}

/**
 * The slack a challenge must have on BOTH sides: the reference clears every
 * objective by ≥20%, the starting design misses one by ≥20%. Anything tighter is
 * a knife edge a single recalibration could invert — measurement caught challenge
 * 4 at a 2.5 s margin, which is why this exists.
 */
export const MIN_MARGIN = 0.2;

/**
 * Relative slack on one objective: positive when met, negative when missed.
 *
 * A target of **0** (shed) has no relative scale — `(0 - actual) / 0` is not a
 * number — so meeting it counts as a full clear and missing it as a full miss.
 * That is honest: at zero you either drop nothing or you drop something.
 */
export function marginOf(r: SloResult): number {
  if (r.target === 0) return r.met ? 1 : -1;
  const { direction } = SLO_METRICS[r.metric];
  return direction === "lte"
    ? (r.target - r.actual) / r.target
    : (r.actual - r.target) / r.target;
}

/** The latency-floor explanation every latency-bearing brief carries (AC16). */
const TURN_FLOOR = {
  en: "An agent turn is not a database query: it makes several model calls, each generating hundreds of output tokens at a few milliseconds per token. Seconds is the honest floor for this workload — your target is in seconds, not milliseconds.",
  pt: "Um turno de agente não é uma consulta de banco: ele faz várias chamadas ao modelo, cada uma gerando centenas de tokens de saída a alguns milissegundos por token. Segundos é o piso honesto desta carga — sua meta está em segundos, não em milissegundos.",
};

const shape = (): CallShape => ({ ...DEFAULT_CALL_SHAPE });

// ---------------------------------------------------------------------------
// 1 — The agent's wall (easy · latency)
//
// Reframed during clarify: this was drafted as "no dropped requests", but 129's
// measurement showed the closed loop converts overload into LATENCY, not 429s —
// the starved design sheds NOTHING. The lesson is unchanged (one deployment is a
// quota block, and scaling the vector DB fixes nothing); the axis that measures it
// is latency.
// ---------------------------------------------------------------------------

const wallStart = () => ({
  nodes: [
    node("client", "client", 0, ROW),
    node("be", "backend", COL, ROW),
    node("llm", "llm", COL * 2, 0, { callsPerRequest: 2 }),
    node("vdb", "vectorDb", COL * 2, ROW * 2),
  ],
  edges: [edge("client", "be"), edge("be", "llm"), edge("be", "vdb")],
});

const wallReference = () => ({
  nodes: [
    node("client", "client", 0, ROW),
    node("be", "backend", COL, ROW),
    node("gw", "aiGateway", COL * 2, ROW, { callsPerRequest: 2 }),
    node("llm1", "llm", COL * 3, 0, { replicas: 12 }),
    node("llm2", "llm", COL * 3, ROW * 2, { replicas: 12, region: "us-west" }),
    node("vdb", "vectorDb", COL, ROW * 2.5),
  ],
  edges: [
    edge("client", "be"),
    edge("be", "gw"),
    edge("gw", "llm1"),
    edge("gw", "llm2"),
    edge("be", "vdb"),
  ],
});

// ---------------------------------------------------------------------------
// 2 — Answer faster (easy · latency at a modest load)
//
// Teaches the LATENCY knobs rather than the capacity ones: at a load one pool can
// carry, the way to go faster is a quicker model tier and fewer output tokens —
// not more deployments.
// ---------------------------------------------------------------------------

const fasterStart = () => ({
  nodes: [
    node("client", "client", 0, 0),
    node("be", "backend", COL, 0),
    node("llm", "llm", COL * 2, 0, { callsPerRequest: 3, modelTier: "large", replicas: 2 }),
  ],
  edges: [edge("client", "be"), edge("be", "llm")],
});

const fasterReference = () => ({
  nodes: [
    node("client", "client", 0, 0),
    node("be", "backend", COL, 0),
    node("llm", "llm", COL * 2, 0, { callsPerRequest: 1, modelTier: "nano", replicas: 4 }),
  ],
  edges: [edge("client", "be"), edge("be", "llm")],
});

// ---------------------------------------------------------------------------
// 3 — Halve the bill (medium · latency + cost)
//
// The pairing rule made visible: starving the pool wins on cost and loses on
// latency, over-provisioning wins on latency and loses on cost. Only right-sizing
// (plus a semantic cache taking turns off the model path) satisfies both.
// ---------------------------------------------------------------------------

const billStart = () => ({
  nodes: [
    node("client", "client", 0, ROW),
    node("be", "backend", COL, ROW),
    node("gw", "aiGateway", COL * 2, ROW, { callsPerRequest: 2 }),
    node("llm1", "llm", COL * 3, 0, { replicas: 20, modelTier: "standard" }),
    node("llm2", "llm", COL * 3, ROW * 2, { replicas: 20, modelTier: "standard", region: "us-west" }),
  ],
  edges: [edge("client", "be"), edge("be", "gw"), edge("gw", "llm1"), edge("gw", "llm2")],
});

const billReference = () => ({
  nodes: [
    node("client", "client", 0, ROW),
    node("be", "backend", COL, ROW),
    node("sc", "semanticCache", COL * 2, ROW, { hitRatio: 0.4 }),
    node("gw", "aiGateway", COL * 3, ROW, { callsPerRequest: 2 }),
    node("llm1", "llm", COL * 4, ROW, { replicas: 4, modelTier: "nano" }),
  ],
  edges: [edge("client", "be"), edge("be", "sc"), edge("sc", "gw"), edge("gw", "llm1")],
});

// ---------------------------------------------------------------------------
// 4 — One region is not enough (medium · latency + headroom)
//
// The demand is deliberately tuned ABOVE what a single region's quota can serve —
// clarify found that at the shipped presets' load a single-region design still
// clears a 30 s target, so the margin had to be built by raising `users`, not by
// tightening the target.
// ---------------------------------------------------------------------------

const regionStart = () => ({
  nodes: [
    node("client", "client", 0, 0),
    node("be", "backend", COL, 0, { replicas: 4 }),
    node("gw", "aiGateway", COL * 2, 0, { callsPerRequest: 2 }),
    node("llm", "llm", COL * 3, 0, { replicas: 40 }),
  ],
  edges: [edge("client", "be"), edge("be", "gw"), edge("gw", "llm")],
});

// Four regions × 20 deployments. 20 is the sweet spot per region, not a guess:
// 20 × 150 calls/s exactly fills a region's quota, so a 21st deployment in the
// same region buys nothing — the way out is another region, which is the lesson.
const regionReference = () => ({
  nodes: [
    node("client", "client", 0, ROW * 1.5),
    node("be", "backend", COL, ROW * 1.5, { replicas: 4 }),
    node("gw", "aiGateway", COL * 2, ROW * 1.5, { callsPerRequest: 2 }),
    node("llm1", "llm", COL * 3, 0, { replicas: 20 }),
    node("llm2", "llm", COL * 3, ROW, { replicas: 20, region: "us-west" }),
    node("llm3", "llm", COL * 3, ROW * 2, { replicas: 20, region: "eu-west" }),
    node("llm4", "llm", COL * 3, ROW * 3, { replicas: 20, region: "sa-east" }),
  ],
  edges: [
    edge("client", "be"),
    edge("be", "gw"),
    edge("gw", "llm1"),
    edge("gw", "llm2"),
    edge("gw", "llm3"),
    edge("gw", "llm4"),
  ],
});

// ---------------------------------------------------------------------------
// 5 — The invisible tax (medium · latency)
//
// Drafted as a headroom challenge; CALIBRATION moved it to latency, and the reason
// is the more interesting lesson. Two things happen when the backend talks to N
// deployments directly, and neither is about buying more units:
//
//  - 105's routing tax: the backend manages those endpoints in app code (keys,
//    health checks, per-deployment rate-limit bookkeeping, retries) and pays a
//    slice of its own capacity for it.
//  - 109's combine rule: a `backend` SUMS its branches (it orchestrates the turn),
//    so four directly-wired pools put four pool traversals in SEQUENCE — ~4× the
//    turn latency. A router fans ONE call to one pool, so its branches take the
//    max instead.
//
// Measured: the same 4 pools and the same 64 deployments go from ~51 s to ~11 s
// purely by inserting a router. Headroom barely moves (72% → 84%), which is why
// latency is the axis that actually teaches this.
// ---------------------------------------------------------------------------

const TAX_REGIONS = ["us-east", "us-west", "eu-west", "sa-east"] as const;

const taxStart = () => ({
  nodes: [
    node("client", "client", 0, ROW * 1.5),
    node("be", "backend", COL, ROW * 1.5),
    ...TAX_REGIONS.map((region, i) =>
      node(`llm${i + 1}`, "llm", COL * 2, ROW * i, { replicas: 16, callsPerRequest: 2, region }),
    ),
  ],
  edges: [
    edge("client", "be"),
    ...TAX_REGIONS.map((_, i) => edge("be", `llm${i + 1}`)),
  ],
});

const taxReference = () => ({
  nodes: [
    node("client", "client", 0, ROW * 1.5),
    node("be", "backend", COL, ROW * 1.5),
    node("gw", "aiGateway", COL * 2, ROW * 1.5, { callsPerRequest: 2 }),
    ...TAX_REGIONS.map((region, i) =>
      node(`llm${i + 1}`, "llm", COL * 3, ROW * i, { replicas: 16, region }),
    ),
  ],
  edges: [
    edge("client", "be"),
    edge("be", "gw"),
    ...TAX_REGIONS.map((_, i) => edge("gw", `llm${i + 1}`)),
  ],
});

// ---------------------------------------------------------------------------
// 6 — 100k users on a budget (hard · latency + headroom + cost)
// ---------------------------------------------------------------------------

const fleetStart = () => ({
  nodes: [
    node("client", "client", 0, ROW),
    node("be", "backend", COL, ROW),
    node("llm", "llm", COL * 2, ROW, { replicas: 10, callsPerRequest: 2 }),
  ],
  edges: [edge("client", "be"), edge("be", "llm")],
});

const fleetReference = () => ({
  nodes: [
    node("client", "client", 0, ROW * 1.5),
    node("be", "backend", COL, ROW * 1.5, { replicas: 6 }),
    node("sc", "semanticCache", COL * 2, ROW * 1.5, { hitRatio: 0.5 }),
    node("gw", "aiGateway", COL * 3, ROW * 1.5, { callsPerRequest: 2 }),
    node("llm1", "llm", COL * 4, 0, { replicas: 10, modelTier: "nano" }),
    node("llm2", "llm", COL * 4, ROW, { replicas: 10, modelTier: "nano", region: "us-west" }),
    node("llm3", "llm", COL * 4, ROW * 2, { replicas: 10, modelTier: "nano", region: "eu-west" }),
  ],
  edges: [
    edge("client", "be"),
    edge("be", "sc"),
    edge("sc", "gw"),
    edge("gw", "llm1"),
    edge("gw", "llm2"),
    edge("gw", "llm3"),
  ],
});

// ---------------------------------------------------------------------------
// 7 — Survive the outage (hard · latency + headroom, WITH a fault in the givens)
//
// 131's payoff: resilience is scored with the axes 129 already has, by putting a
// region outage into the problem itself. The starting design is a healthy
// single-region fleet — it passes with the region up and collapses without it,
// which is exactly the lesson headroom alone never teaches.
// ---------------------------------------------------------------------------

const outageStart = () => ({
  nodes: [
    node("client", "client", 0, ROW),
    node("be", "backend", COL, ROW, { replicas: 4 }),
    node("gw", "aiGateway", COL * 2, ROW, { callsPerRequest: 2, region: undefined }),
    node("llm1", "llm", COL * 3, ROW, { replicas: 20 }),
  ],
  edges: [edge("client", "be"), edge("be", "gw"), edge("gw", "llm1")],
});

// Capacity rebuilt in the regions that are still up. Note what the reference does
// NOT do: leave a pool wired into the failed region. The Arena's router splits load
// statically (1/N — it models no health-aware failover), so a share routed at a dead
// pool is simply lost. That is an honest limitation of the model, and it makes the
// exercise the real one: restore service where service is possible.
const outageReference = () => ({
  nodes: [
    node("client", "client", 0, ROW * 1.5),
    // The backend moves too: if the region is gone, your containers in it are gone.
    node("be", "backend", COL, ROW * 1.5, { replicas: 4, region: "us-west" }),
    node("gw", "aiGateway", COL * 2, ROW * 1.5, { callsPerRequest: 2, region: undefined }),
    node("llm2", "llm", COL * 3, 0, { replicas: 20, region: "us-west" }),
    node("llm3", "llm", COL * 3, ROW, { replicas: 20, region: "eu-west" }),
    node("llm4", "llm", COL * 3, ROW * 2, { replicas: 20, region: "sa-east" }),
  ],
  edges: [
    edge("client", "be"),
    edge("be", "gw"),
    edge("gw", "llm2"),
    edge("gw", "llm3"),
    edge("gw", "llm4"),
  ],
});

export const CHALLENGES: readonly ArenaChallenge[] = [
  {
    id: "agent-wall",
    difficulty: "easy",
    title: { en: "The agent's wall", pt: "A parede do agente" },
    brief: {
      en: `16,000 people are using your agent, each sending a message about every 20 seconds. Right now they wait minutes for an answer. Get an answer back in under 30 seconds. ${TURN_FLOOR.en} One more thing: the vector database is not your problem — look at what a single model deployment can actually serve.`,
      pt: `16 mil pessoas usam seu agente, cada uma mandando uma mensagem a cada ~20 segundos. Hoje elas esperam minutos por uma resposta. Faça a resposta voltar em menos de 30 segundos. ${TURN_FLOOR.pt} Mais uma coisa: o vector database não é o seu problema — olhe o que um único deployment de modelo consegue atender.`,
    },
    givens: { users: 16_000, thinkTimeSec: 20, callShape: shape() },
    objectives: { latency: 30_000 },
    start: wallStart,
    reference: wallReference,
    concepts: ["token-cost", "stateless-scaling", "llm-gateway"],
  },
  {
    id: "answer-faster",
    difficulty: "easy",
    title: { en: "Answer faster", pt: "Responda mais rápido" },
    brief: {
      en: `A modest load — but every answer crawls. Nobody needs more capacity here: the tier has room. Make a turn come back in under 12 seconds by changing HOW the model is called, not how much of it you buy. ${TURN_FLOOR.en}`,
      pt: `Uma carga modesta — mas cada resposta se arrasta. Ninguém precisa de mais capacidade aqui: o tier tem espaço. Faça um turno voltar em menos de 12 segundos mudando COMO o modelo é chamado, não quanto dele você compra. ${TURN_FLOOR.pt}`,
    },
    givens: { users: 1_200, thinkTimeSec: 30, callShape: shape() },
    objectives: { latency: 12_000 },
    start: fasterStart,
    reference: fasterReference,
    // The palette is deliberately narrowed to the three boxes already on the
    // canvas: this challenge is about HOW the model is called, so offering caches
    // and gateways would let the user route around the lesson instead of finding it.
    allowedKinds: ["client", "backend", "llm"],
    concepts: ["tokens", "streaming", "token-cost"],
  },
  {
    id: "halve-the-bill",
    difficulty: "medium",
    title: { en: "Halve the bill", pt: "Corte a conta pela metade" },
    brief: {
      en: `This design works and finance has noticed. Keep answers under 30 seconds AND get the hourly model bill under $8,000. Provisioned capacity bills even while idle, so headroom you never use is money you never get back — and every turn you can serve without calling the model at all is a turn you do not pay for. ${TURN_FLOOR.en}`,
      pt: `Este desenho funciona e o financeiro notou. Mantenha as respostas abaixo de 30 segundos E deixe a conta horária do modelo abaixo de $8.000. Capacidade provisionada é cobrada mesmo ociosa, então folga que você nunca usa é dinheiro que não volta — e todo turno que você atende sem chamar o modelo é um turno que você não paga. ${TURN_FLOOR.pt}`,
    },
    givens: { users: 6_000, thinkTimeSec: 30, callShape: shape() },
    objectives: { latency: 30_000, cost: 8_000 },
    start: billStart,
    reference: billReference,
    concepts: ["token-cost", "semantic-cache", "llm-gateway"],
  },
  {
    id: "one-region",
    difficulty: "medium",
    title: { en: "One region is not enough", pt: "Uma região não basta" },
    brief: {
      en: `Demand has outgrown what a single region will sell you. Adding deployments in the same place stops helping at some point — a region has a quota, and every pool in it shares that ceiling. Keep answers under 30 seconds with at least 20% headroom. Crossing regions is not free: expect to pay for the extra hop. ${TURN_FLOOR.en}`,
      pt: `A demanda passou do que uma única região te vende. Adicionar deployments no mesmo lugar para de ajudar em algum ponto — uma região tem cota, e todo pool nela divide esse teto. Mantenha as respostas abaixo de 30 segundos com pelo menos 20% de folga. Cruzar regiões não é grátis: espere pagar pelo salto extra. ${TURN_FLOOR.pt}`,
    },
    givens: { users: 120_000, thinkTimeSec: 20, callShape: shape() },
    objectives: { latency: 30_000, headroom: 0.2 },
    start: regionStart,
    reference: regionReference,
    concepts: ["llm-gateway", "stateless-scaling", "cloud-mapping"],
  },
  {
    id: "invisible-tax",
    difficulty: "medium",
    title: { en: "The invisible tax", pt: "O imposto invisível" },
    brief: {
      en: `Four model pools with plenty of spare capacity — and answers still take the best part of a minute. Nothing here is short of units. Look instead at WHO is doing the routing: when the backend holds every deployment endpoint itself, it pays for that bookkeeping out of its own capacity, and it works through the pools one after another instead of picking one. Get a turn under 30 seconds WITHOUT buying a single extra unit. ${TURN_FLOOR.en}`,
      pt: `Quatro pools de modelo com capacidade sobrando — e as respostas ainda levam quase um minuto. Não falta unidade aqui. Olhe em vez disso QUEM está roteando: quando o backend segura todos os endpoints de deployment, ele paga essa contabilidade com a própria capacidade, e percorre os pools um após o outro em vez de escolher um. Faça um turno ficar abaixo de 30 segundos SEM comprar nenhuma unidade extra. ${TURN_FLOOR.pt}`,
    },
    givens: { users: 24_000, thinkTimeSec: 20, callShape: shape() },
    objectives: { latency: 30_000 },
    start: taxStart,
    reference: taxReference,
    concepts: ["llm-gateway", "hops", "stateless-scaling"],
  },
  {
    id: "hundred-k",
    difficulty: "hard",
    title: { en: "100k users on a budget", pt: "100 mil usuários com orçamento" },
    brief: {
      en: `100,000 people, a message a minute each, and a finance team. Answers under 25 seconds, at least 20% headroom, under $15,000/hour of model spend. Every lever you have met so far is on the table: how the model is called, which tier serves it, how many turns reach the model at all, and where the pools live. ${TURN_FLOOR.en}`,
      pt: `100 mil pessoas, uma mensagem por minuto cada, e um time financeiro. Respostas abaixo de 25 segundos, pelo menos 20% de folga, menos de $15.000/hora de gasto com modelo. Todas as alavancas que você já conheceu valem: como o modelo é chamado, qual tier atende, quantos turnos chegam ao modelo e onde os pools ficam. ${TURN_FLOOR.pt}`,
    },
    givens: { users: 100_000, thinkTimeSec: 60, callShape: shape() },
    objectives: { latency: 25_000, headroom: 0.2, cost: 15_000 },
    start: fleetStart,
    reference: fleetReference,
    concepts: ["token-cost", "semantic-cache", "llm-gateway", "maturity-ladder"],
  },
  {
    id: "survive-the-outage",
    difficulty: "hard",
    title: { en: "Survive the outage", pt: "Sobreviva à queda" },
    brief: {
      en: `East US is gone. Not slow — gone. This fleet was comfortably healthy five minutes ago with everything in one place, which is precisely the problem: headroom is not resilience. Keep answers under 30 seconds with at least 20% headroom WHILE the region stays down. The outage is part of this problem — you cannot clear it. ${TURN_FLOOR.en}`,
      pt: `East US caiu. Não está lenta — caiu. Esta frota estava confortavelmente saudável cinco minutos atrás com tudo num só lugar, e é exatamente esse o problema: folga não é resiliência. Mantenha as respostas abaixo de 30 segundos com pelo menos 20% de folga ENQUANTO a região estiver fora. A queda faz parte do desafio — você não pode removê-la. ${TURN_FLOOR.pt}`,
    },
    givens: {
      users: 60_000,
      thinkTimeSec: 20,
      callShape: shape(),
      faults: [{ type: "regionOutage", region: "us-east" }],
    },
    objectives: { latency: 30_000, headroom: 0.2 },
    start: outageStart,
    reference: outageReference,
    concepts: ["llm-gateway", "health-checks", "cloud-mapping"],
  },
];

/** Look a challenge up by id (undefined when unknown — the caller falls back to
 *  the sandbox rather than throwing). */
export function challengeById(id: string | null): ArenaChallenge | undefined {
  return id === null ? undefined : CHALLENGES.find((c) => c.id === id);
}
