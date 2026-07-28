// 129-arena-slo-engine — the measuring stick: objectives, verdict, culprit, hint.
//
// This module sits ON TOP of the capacity model and imports from it, never the
// other way round: `model.ts` stays about physics (what the architecture does),
// `slo.ts` is about policy (whether that is good enough). Keeping them apart is
// why the model's tests never had to learn about targets.
//
// THE AXES WERE CHOSEN FROM A MEASUREMENT, not from intuition (see spec.md's
// "Measured baseline"). Two findings shaped this file and are worth knowing before
// editing it:
//
//  1. The closed loop (110) converts overload into LATENCY, not into 429s — a user
//     waiting on a response is not sending the next message. So `shed` is the LAST
//     signal to fire (it needs the queueing clamp to bind AND demand to still
//     exceed capacity), and a design can sit at shed = 0 while being unusable.
//     Latency and headroom are the discriminating pair.
//  2. Cost ALONE rewards under-provisioning: the starved design is the CHEAPEST
//     one. That is why `cost` is absent from DEFAULT_SLO_TARGETS — a challenge
//     opts into it *paired* with latency (130 enforces that pairing structurally).
//
// Pure: no clock, no randomness, no storage, no React.

import type { Lang } from "../i18n";
import type { ArenaKind } from "./components";
import {
  computeMetrics,
  endToEndLatencyMs,
  equilibriumRps,
  llmCost,
  type ArenaDesign,
} from "./model";

/** The four objective axes. */
export type SloMetricId = "latency" | "headroom" | "shed" | "cost";

/** Which way "better" runs for a metric — a property of the METRIC, so an
 *  incoherent objective ("latency ≥ 5 s") cannot be represented at all. */
export type SloDirection = "lte" | "gte";

export interface SloMetricMeta {
  direction: SloDirection;
  /** Comparison slack in the metric's own unit: a value that *displays* as the
   *  target must not read ✗ on a floating-point hair. */
  tolerance: number;
}

export const SLO_METRICS: Record<SloMetricId, SloMetricMeta> = {
  // 1 ms — finer than the display ever shows.
  latency: { direction: "lte", tolerance: 1 },
  // 0.5 pp — the readout is a whole percentage.
  headroom: { direction: "gte", tolerance: 0.005 },
  // half a request/second.
  shed: { direction: "lte", tolerance: 0.5 },
  // one cent.
  cost: { direction: "lte", tolerance: 0.01 },
};

/** Display order in the panel — latency and headroom first: they are the axes
 *  that actually discriminate a good design from a starved one. */
export const SLO_METRIC_ORDER: readonly SloMetricId[] = ["latency", "headroom", "shed", "cost"];

/** A tracked objective per metric. **A metric ABSENT means the objective is OFF** —
 *  which is what makes "an off objective cannot affect the verdict" structural
 *  rather than a rule someone has to remember. */
export type SloTargets = Partial<Record<SloMetricId, number>>;

/**
 * The shipped sandbox defaults, taken from the measured baseline:
 *  - latency ≤ 30 s — the starved design sits at ~225 s, a healthy fleet at ~15–20 s.
 *    (An agent turn is fan-out × ~500 output tokens × 8 ms/token decode since 127,
 *    so seconds is the honest floor here; 5 s would fail *every* shipped preset.)
 *  - headroom ≥ 20% — the starved design has ~4%, healthy ones 47–69%.
 *  - shed ≤ 0 — honest, and quiet until the extreme regime.
 *  - cost — DELIBERATELY ABSENT. See the header note: cost alone rewards starving.
 */
export const DEFAULT_SLO_TARGETS: SloTargets = {
  latency: 30_000,
  headroom: 0.2,
  shed: 0,
};

/** The model's queueing clamp (`model.ts::queueLatency`). Once a load-carrying
 *  node reaches it, the latency figure is a LOWER BOUND, not a measurement —
 *  108 established that we refuse to print a precise post-saturation number. */
export const QUEUE_CLAMP_UTIL = 0.99;

export interface DesignMeasurement {
  /** users ÷ think time — what the population WANTS to send. */
  demandRps: number;
  /** The closed-loop equilibrium the design actually settles at. */
  offeredLoad: number;
  /** Total calls/s refused past capacity across the design (the honest 429 rate). */
  shedRps: number;
  /** One agent turn, end to end, at `offeredLoad`. */
  e2eLatencyMs: number;
  /** Provisioned + usage LLM bill. */
  costPerHourUsd: number;
  /** 1 − the busiest load-carrying node's utilization (1 when nothing is busy). */
  headroomPct: number;
  /** The busiest load-carrying node — culprit for latency / headroom / shed. */
  busiestNodeId?: string;
  /** The priciest LLM pool — culprit for cost. */
  costliestLlmId?: string;
  /** True when the queueing clamp binds somewhere: `e2eLatencyMs` is a lower bound. */
  atLatencyCeiling: boolean;
}

export interface SloResult {
  metric: SloMetricId;
  target: number;
  actual: number;
  met: boolean;
  /** Set only when the objective FAILED — the box to go and fix. */
  culpritNodeId?: string;
  /** Latency only: `actual` is a lower bound (render `≥`, never a precise value). */
  atCeiling?: boolean;
}

export interface SloVerdict {
  met: boolean;
  results: SloResult[];
  metCount: number;
  total: number;
}

/**
 * Derive the four aggregate figures, each from the model's own exported helpers so
 * there is no second implementation to drift. This is the ONLY place they are
 * defined — `ArenaPage`'s header reads them from here too, so the header and the
 * objectives panel can never disagree.
 */
export function measureDesign(
  design: ArenaDesign,
  users: number,
  thinkTimeSec: number,
): DesignMeasurement {
  const demandRps = Math.max(0, users) / Math.max(1, thinkTimeSec);
  if (design.nodes.length === 0) {
    return {
      demandRps,
      offeredLoad: 0,
      shedRps: 0,
      e2eLatencyMs: 0,
      costPerHourUsd: 0,
      headroomPct: 1,
      atLatencyCeiling: false,
    };
  }

  const offeredLoad = Math.round(equilibriumRps(design, users, thinkTimeSec));
  const metrics = computeMetrics(design, offeredLoad);

  let shedRps = 0;
  let maxUtil = 0;
  let busiestNodeId: string | undefined;
  let atLatencyCeiling = false;
  for (const sp of design.nodes) {
    const m = metrics.get(sp.id)!;
    shedRps += m.shedRps;
    // Only load-carrying nodes can be "busiest": an unwired stray idling at 0 is
    // not headroom, and an unreachable node has no honest utilization.
    if (m.arriving > 0) {
      if (m.utilization > maxUtil) {
        maxUtil = m.utilization;
        busiestNodeId = sp.id;
      }
      if (m.utilization >= QUEUE_CLAMP_UTIL) atLatencyCeiling = true;
    }
  }

  const cost = llmCost(design, offeredLoad);
  let costliestLlmId: string | undefined;
  let worstLlmCost = -1;
  for (const sp of design.nodes) {
    if (sp.kind !== "llm") continue;
    // Rank pools by their own provisioned + usage share.
    const one = llmCost({ ...design, nodes: [sp] }, offeredLoad);
    const total = one.provisionedPerHour + one.usagePerHour;
    if (total > worstLlmCost) {
      worstLlmCost = total;
      costliestLlmId = sp.id;
    }
  }

  return {
    demandRps,
    offeredLoad,
    shedRps,
    e2eLatencyMs: endToEndLatencyMs(design, offeredLoad),
    costPerHourUsd: cost.provisionedPerHour + cost.usagePerHour,
    headroomPct: Math.max(0, 1 - maxUtil),
    busiestNodeId,
    costliestLlmId,
    atLatencyCeiling,
  };
}

/** Read a metric's actual value off a measurement. */
function actualFor(m: DesignMeasurement, metric: SloMetricId): number {
  switch (metric) {
    case "latency":
      return m.e2eLatencyMs;
    case "headroom":
      return m.headroomPct;
    case "shed":
      return m.shedRps;
    case "cost":
      return m.costPerHourUsd;
  }
}

/** Who to blame when this axis fails. */
function culpritFor(m: DesignMeasurement, metric: SloMetricId): string | undefined {
  return metric === "cost" ? m.costliestLlmId : m.busiestNodeId;
}

/** Compare with the metric's direction and its display tolerance. */
function isMet(metric: SloMetricId, actual: number, target: number): boolean {
  const { direction, tolerance } = SLO_METRICS[metric];
  return direction === "lte" ? actual <= target + tolerance : actual >= target - tolerance;
}

/**
 * Turn a measurement + the tracked targets into the verdict. An absent target is
 * an OFF objective: it produces no result and therefore cannot move the verdict.
 */
export function evaluateObjectives(m: DesignMeasurement, targets: SloTargets): SloVerdict {
  const results: SloResult[] = [];
  for (const metric of SLO_METRIC_ORDER) {
    const target = targets[metric];
    if (target === undefined) continue;
    const actual = actualFor(m, metric);
    const met = isMet(metric, actual, target);
    results.push({
      metric,
      target,
      actual,
      met,
      ...(met ? {} : { culpritNodeId: culpritFor(m, metric) }),
      ...(metric === "latency" && m.atLatencyCeiling ? { atCeiling: true } : {}),
    });
  }
  const metCount = results.filter((r) => r.met).length;
  return { met: metCount === results.length, results, metCount, total: results.length };
}

// ---------------------------------------------------------------------------
// Remediation hints
//
// Keyed by (metric, culprit kind) with a per-metric bilingual fallback, so the
// AC7 matrix walk can never find a hole: any kind without a specific hint resolves
// its metric's fallback. Hints state MECHANISMS, never pinned figures (the 119
// rule) — a recalibration like 127/128 must not be able to stale them.
// ---------------------------------------------------------------------------

type Hint = Record<Lang, string>;

interface MetricRemediation {
  byKind: Partial<Record<ArenaKind, Hint>>;
  fallback: Hint;
}

export const REMEDIATION: Record<SloMetricId, MetricRemediation> = {
  latency: {
    byKind: {
      llm: {
        en: "Decode time dominates an agent turn: a faster model tier, fewer output tokens, or fewer calls per turn all pay off directly.",
        pt: "O tempo de decode domina o turno do agente: um tier de modelo mais rápido, menos tokens de saída ou menos chamadas por turno compensam direto.",
      },
      backend: {
        en: "The backend is queueing: each container holds a bounded number of open streams, so add containers before blaming the model tier.",
        pt: "O backend está enfileirando: cada contêiner sustenta um número limitado de streams abertos — adicione contêineres antes de culpar o tier do modelo.",
      },
      externalApi: {
        en: "A third party you cannot scale sets this pace — cache its answers or drop it off the turn's critical path.",
        pt: "Um terceiro que você não escala dita esse ritmo — faça cache das respostas dele ou tire-o do caminho crítico do turno.",
      },
      guardrails: {
        en: "Moderation is a per-call toll on the model path; it adds latency to every turn, so scale it out or narrow what it screens.",
        pt: "A moderação é um pedágio por chamada no caminho do modelo; ela soma latência em todo turno — escale-a ou reduza o que ela inspeciona.",
      },
      vectorDb: {
        en: "Retrieval is on the turn's critical path: scale it out, or cut how many retrievals a turn performs.",
        pt: "A recuperação está no caminho crítico do turno: escale-a ou reduza quantas recuperações um turno faz.",
      },
    },
    fallback: {
      en: "This box is the slowest step on the turn's path — scale it out, or take work off that path.",
      pt: "Esta caixa é o passo mais lento no caminho do turno — escale-a ou tire trabalho desse caminho.",
    },
  },
  headroom: {
    byKind: {
      llm: {
        en: "Running the model tier this close to its quota leaves nothing for a burst — add deployments, or spread them across regions.",
        pt: "Rodar o tier do modelo tão perto da cota não deixa nada para um pico — adicione deployments ou espalhe-os por regiões.",
      },
      externalApi: {
        en: "You cannot add headroom to someone else's rate limit — put a cache in front of it, or call it less often.",
        pt: "Não se adiciona folga ao rate limit de outro — ponha um cache na frente ou chame-o menos vezes.",
      },
    },
    fallback: {
      en: "Running this close to capacity leaves nothing for a burst — add one horizontal unit.",
      pt: "Rodar tão perto da capacidade não deixa nada para um pico — adicione uma unidade horizontal.",
    },
  },
  shed: {
    byKind: {
      llm: {
        en: "The model tier is refusing calls: one deployment is a rate-limit quota block, so add deployments, spread regions, or cut calls per turn.",
        pt: "O tier do modelo está recusando chamadas: um deployment é um bloco de cota de rate limit — adicione deployments, espalhe regiões ou reduza chamadas por turno.",
      },
      backend: {
        en: "The backend is the wall, not the model tier — add containers, each of which holds a bounded number of open streams.",
        pt: "O backend é a parede, não o tier do modelo — adicione contêineres, cada um sustentando um número limitado de streams abertos.",
      },
      externalApi: {
        en: "The third party is refusing calls at its own rate limit — cache, batch, or move to a higher provider tier.",
        pt: "O terceiro está recusando chamadas no rate limit dele — faça cache, agrupe ou suba de tier no provedor.",
      },
    },
    fallback: {
      en: "This box is refusing work past its capacity — scale it out, or send it less.",
      pt: "Esta caixa está recusando trabalho além da capacidade — escale-a ou mande menos para ela.",
    },
  },
  cost: {
    byKind: {
      llm: {
        en: "Provisioned capacity bills even while idle — right-size the pool, drop to a cheaper tier, or put a semantic cache in front of it.",
        pt: "Capacidade provisionada é cobrada mesmo ociosa — dimensione o pool, use um tier mais barato ou ponha um cache semântico na frente.",
      },
    },
    fallback: {
      en: "The model tier is what costs money here — reduce provisioned pools, cheapen the tier, or serve more turns from cache.",
      pt: "O que custa dinheiro aqui é o tier do modelo — reduza pools provisionados, use tier mais barato ou atenda mais turnos pelo cache.",
    },
  },
};

/** Resolve a hint for a failed objective. Never returns empty: an unlisted kind
 *  falls back to the metric's generic mechanism sentence. */
export function remediationFor(metric: SloMetricId, kind: ArenaKind, lang: Lang): string {
  const entry = REMEDIATION[metric];
  return (entry.byKind[kind] ?? entry.fallback)[lang];
}
