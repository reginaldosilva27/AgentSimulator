// 131-arena-chaos — failure injection as a PURE DESIGN TRANSFORM.
//
// The one architectural decision here: a fault is an optional field on
// `ArenaDesign`, applied by a pre-pass inside `computeMetrics`. That mirrors
// exactly how 117 added `callShape` — absent ⇒ pre-existing behaviour
// byte-for-byte (AC9) — and it means EVERY derived readout inherits chaos for
// free: per-node metrics, `endToEndLatencyMs`, `heldInFlight`, `llmCost`,
// `equilibriumRps`, and 129's verdict all take a `design`.
//
// The alternative (a separate `computeMetricsWithFaults`) was rejected: it would
// leave every other readout blind to chaos unless each grew a `faults` parameter —
// seven signature changes and a permanent risk that one path forgets. AC4 (a
// latency spike moving the closed-loop EQUILIBRIUM, because users waiting are not
// sending) falls out of the additive approach rather than being engineered.
//
// HONESTY (§3): this is not a simulated crash. It is the same analytical model
// re-evaluated with a component removed or degraded, and the UI says exactly that.
// Deliberately NOT spec 017's failure injection, which is a real error path on a
// real request and does emit trace events. Same vocabulary, different layer.
//
// Determinism is structural: no `Math.random`, no `Date.now` — a fault moves the
// design to a different deterministic operating point, nothing more.

import type { Lang } from "../i18n";
import type { ArenaKind } from "./components";
import type { ArenaDesign, ArenaNodeSpec } from "./model";

export type ArenaFaultType =
  | "instanceDown"
  | "unitLoss"
  | "latencySpike"
  | "cacheFlush"
  | "quotaCut"
  | "regionOutage"
  | "dependencyDegraded";

export interface ArenaFault {
  id: string;
  type: ArenaFaultType;
  /** Component-targeted faults. */
  nodeId?: string;
  /** Region-targeted faults (`quotaCut`, `regionOutage`). */
  region?: string;
  /** Units lost · latency multiplier · cut fraction, per the type's meaning. */
  magnitude?: number;
}

interface FaultMeta {
  label: Record<Lang, string>;
  /** What it does to the MODEL — a mechanism, never a pinned figure (119's rule). */
  mechanism: Record<Lang, string>;
  /** Whether it targets a node or a region. */
  target: "node" | "region";
  /** Offered magnitudes (empty = the fault takes none). */
  magnitudes: readonly number[];
  /** Node kinds it applies to; absent = any node. */
  kinds?: readonly ArenaKind[];
}

/**
 * The catalog: seven faults, each expressible by the existing model.
 *
 * A client "traffic surge ×k" is deliberately ABSENT — it perturbs the *load*, not
 * a component, and the users slider already does exactly that. Adding it as a
 * "fault" would blur what a fault is for the sake of a catalog entry.
 */
export const FAULT_META: Record<ArenaFaultType, FaultMeta> = {
  instanceDown: {
    label: { en: "Instance down", pt: "Instância fora" },
    mechanism: {
      en: "This box serves nothing: its capacity goes to zero, everything arriving is refused, and whatever sits only behind it becomes unreachable.",
      pt: "Esta caixa não atende nada: a capacidade vai a zero, tudo que chega é recusado, e o que estiver apenas atrás dela fica inalcançável.",
    },
    target: "node",
    magnitudes: [],
  },
  unitLoss: {
    label: { en: "Lose units", pt: "Perder unidades" },
    mechanism: {
      en: "Capacity drops by the units removed. Losing every unit is the same as the box being down.",
      pt: "A capacidade cai pelas unidades removidas. Perder todas as unidades é o mesmo que a caixa estar fora.",
    },
    target: "node",
    magnitudes: [1, 2, 5],
  },
  latencySpike: {
    label: { en: "Latency spike", pt: "Pico de latência" },
    mechanism: {
      en: "This box answers several times slower. Watch the second effect: users waiting on a slow answer send fewer messages, so the arriving rate falls too.",
      pt: "Esta caixa responde várias vezes mais devagar. Observe o segundo efeito: usuários esperando uma resposta lenta mandam menos mensagens, então a taxa de chegada também cai.",
    },
    target: "node",
    magnitudes: [2, 5, 10],
  },
  cacheFlush: {
    label: { en: "Cache flushed", pt: "Cache limpo" },
    mechanism: {
      en: "Nothing is served locally any more, so every request reaches the tier behind it — the stampede.",
      pt: "Nada mais é atendido localmente, então toda requisição chega no tier atrás dele — a estampida.",
    },
    target: "node",
    magnitudes: [],
    kinds: ["cache", "semanticCache"],
  },
  quotaCut: {
    label: { en: "Quota cut", pt: "Corte de cota" },
    mechanism: {
      en: "The region allows less model throughput than it did, and every pool in that region is squeezed by the same proportion.",
      pt: "A região permite menos throughput de modelo do que antes, e todo pool naquela região é comprimido na mesma proporção.",
    },
    target: "region",
    magnitudes: [0.25, 0.5, 0.75],
  },
  regionOutage: {
    label: { en: "Region out", pt: "Região fora" },
    mechanism: {
      en: "Every box in that region stops serving at once. A design with equivalent capacity elsewhere keeps going; a single-region one does not.",
      pt: "Toda caixa naquela região deixa de atender de uma vez. Um desenho com capacidade equivalente em outro lugar continua; um de região única, não.",
    },
    target: "region",
    magnitudes: [],
  },
  dependencyDegraded: {
    label: { en: "Dependency degraded", pt: "Dependência degradada" },
    mechanism: {
      en: "The third party you cannot scale gets both slower and thinner — its rate limit is the provider's, not yours.",
      pt: "O terceiro que você não escala fica mais lento e mais estreito — o rate limit é do provedor, não seu.",
    },
    target: "node",
    magnitudes: [0.25, 0.5, 0.75],
    kinds: ["externalApi"],
  },
};

export const FAULT_ORDER: readonly ArenaFaultType[] = [
  "instanceDown",
  "unitLoss",
  "latencySpike",
  "cacheFlush",
  "quotaCut",
  "regionOutage",
  "dependencyDegraded",
];

/** The faults applying to one node (component-targeted, or regional ones hitting
 *  its region). Exported so the UI can mark the box and explain why. */
export function faultsOn(design: ArenaDesign, nodeId: string): ArenaFault[] {
  const spec = design.nodes.find((sp) => sp.id === nodeId);
  return (design.faults ?? []).filter(
    (f) =>
      f.nodeId === nodeId ||
      (f.type === "regionOutage" && !!spec?.region && f.region === spec.region),
  );
}

/** 131 — the multiplier a `quotaCut` applies to a region's LLM ceiling (1 = none). */
export function quotaCutFactorFor(design: ArenaDesign, region: string): number {
  let factor = 1;
  for (const f of design.faults ?? []) {
    if (f.type !== "quotaCut" || f.region !== region) continue;
    factor *= Math.max(0, 1 - Math.min(1, f.magnitude ?? 0.5));
  }
  return factor;
}

/** True when this node is fully down (its own fault, or its region's outage). */
function isDown(design: ArenaDesign, spec: ArenaNodeSpec): boolean {
  for (const f of faultsOn(design, spec.id)) {
    if (f.type === "instanceDown" || f.type === "regionOutage") return true;
    if (f.type === "unitLoss" && (f.magnitude ?? 1) >= Math.max(1, spec.replicas)) return true;
  }
  return false;
}

/**
 * Apply every design-expressible fault, returning a DERIVED design.
 *
 * Returns the input **identically** when there is nothing to apply (AC9), so the
 * no-fault path allocates nothing and cannot drift from pre-131 behaviour.
 * `quotaCut` is NOT a node transform — it is consumed by `quotaFactorsFor`.
 */
export function applyFaults(design: ArenaDesign): ArenaDesign {
  const faults = design.faults;
  if (!faults || faults.length === 0) return design;

  const nodes = design.nodes.map((spec) => {
    const own = faultsOn(design, spec.id);
    if (own.length === 0) return spec;
    if (isDown(design, spec)) return { ...spec, replicas: 0 };

    let next: ArenaNodeSpec = spec;
    for (const f of own) {
      switch (f.type) {
        case "unitLoss":
          next = { ...next, replicas: Math.max(0, next.replicas - (f.magnitude ?? 1)) };
          break;
        case "latencySpike":
          next = { ...next, latencyMultiplier: (next.latencyMultiplier ?? 1) * (f.magnitude ?? 2) };
          break;
        case "cacheFlush":
          next = { ...next, hitRatio: 0 };
          break;
        case "dependencyDegraded": {
          const cut = Math.max(0, 1 - Math.min(1, f.magnitude ?? 0.5));
          next = {
            ...next,
            capacityMultiplier: (next.capacityMultiplier ?? 1) * cut,
            latencyMultiplier: (next.latencyMultiplier ?? 1) / Math.max(0.05, cut),
          };
          break;
        }
        default:
          break; // instanceDown / regionOutage handled above; quotaCut is regional
      }
    }
    return next;
  });

  return { ...design, nodes };
}
