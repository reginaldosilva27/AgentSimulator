// 115-arena-builder-nudges — pure derivation of the fan-out suggestion.
//
// The audited hand-built design ran the whole LLM path at the silent default of
// 1 call per request — a real ReAct turn makes 2–5 model calls (103), so the
// design "almost passed" while an honest version sat at 200–300% utilization.
// The presets set the fan-out explicitly; a hand-wired backend→LLM (or AI
// Gateway→LLM) gets this nudge instead: SUGGESTED, one-click, never silent
// (103's cpr-defaults-to-1 decision stands).

import type { ArenaDesign } from "./model";

export interface FanoutNudge {
  /** The node that should carry `callsPerRequest` — the gateway when one fronts
   *  the pool, else the LLM itself (never both: 103's no-double-count rule). */
  targetId: string;
}

export function fanoutNudges(design: ArenaDesign): FanoutNudge[] {
  const byId = new Map(design.nodes.map((sp) => [sp.id, sp]));
  const cprOf = (id: string) => Math.max(1, byId.get(id)?.callsPerRequest ?? 1);
  const targets = new Set<string>();
  for (const edge of design.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || target.kind !== "llm") continue;
    // Fan-out already declared on either side → nothing to teach here.
    if (cprOf(source.id) > 1 || cprOf(target.id) > 1) continue;
    if (source.kind === "aiGateway") targets.add(source.id);
    else if (source.kind === "backend") targets.add(target.id);
  }
  return [...targets].map((targetId) => ({ targetId }));
}
