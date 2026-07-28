// 130-arena-challenges — the shared design-authoring helpers.
//
// Extracted from `examples.ts` (behaviour-preserving) so the preset library and
// the challenge library build designs the same way instead of each growing its
// own factory. Nothing here models anything: it is placement + terseness.

import { DEFAULT_CPR } from "./components";
import type { ArenaEdge } from "./model";
import type { ArenaNode } from "./store";

/** Horizontal spacing between tiers. */
export const COL = 210;
/** Vertical spacing between branches. */
export const ROW = 150;

/**
 * Terse node factory: kind + position + optional scaling overrides.
 * 116 — every infrastructure node defaults to East US (the client is the users,
 * so it carries no region).
 */
export function node(
  id: string,
  kind: ArenaNode["kind"],
  x: number,
  y: number,
  extra: Partial<ArenaNode> = {},
): ArenaNode {
  const region = kind === "client" ? {} : { region: "us-east" as const };
  return { id, kind, size: "medium", replicas: 1, x, y, ...region, ...extra };
}

/**
 * 125 — a node created the way the STORE creates it, i.e. with its kind's default
 * fan-out seeded (guardrails / memory store are hit twice a turn). Challenge
 * designs use this so a hand-authored reference matches what a user dragging the
 * same box would actually get.
 */
export function realNode(
  id: string,
  kind: ArenaNode["kind"],
  x: number,
  y: number,
  extra: Partial<ArenaNode> = {},
): ArenaNode {
  const cpr = DEFAULT_CPR[kind];
  return node(id, kind, x, y, { ...(cpr ? { callsPerRequest: cpr } : {}), ...extra });
}

export const edge = (source: string, target: string): ArenaEdge => ({
  id: `${source}-${target}`,
  source,
  target,
});
