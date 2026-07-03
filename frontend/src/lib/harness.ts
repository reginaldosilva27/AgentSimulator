// 095-harness-loop-lens — the harness axis. "Agent = Model + Harness": every
// station in the visual model contributes some part of the scaffolding around the
// model. This maps each station to exactly one harness role, from a fixed
// vocabulary. Rendered as a role badge under the Harness lens.
//
// The map is TOTAL over `StationId` — `Record<StationId, HarnessRole>` makes `tsc`
// fail if a station is left unclassified (like `STAGE_TO_STATION`); `harness.test.ts`
// double-checks. Role *labels* are i18n (strings.ts `lens.role.*`), so this file
// carries only the structural classification, never user-facing prose.

import type { StationId } from "./stations";

export type HarnessRole =
  | "tools" // callable tools the agent can invoke (MCP)
  | "knowledge" // the knowledge the agent can retrieve (RAG / ingestion)
  | "memory" // durable state across turns (relational DB, cache)
  | "context" // what gets assembled into the window (compression)
  | "permissions" // what is allowed in / blocked (edge security, guardrails)
  | "model" // the reasoning engine itself
  | "orchestration" // routing, delegation, the control plane
  | "delivery" // getting bytes to/from the user (front door, ingress routing)
  | "observability"; // evals + telemetry that watch the harness

/** The role vocabulary, in a stable order (drives the Harness-lens legend). */
export const HARNESS_ROLES: HarnessRole[] = [
  "tools",
  "knowledge",
  "memory",
  "context",
  "permissions",
  "model",
  "orchestration",
  "delivery",
  "observability",
];

/**
 * A distinct accent per harness role, so the Harness lens reads as a *color-coded
 * parts map* (anatomy in space) rather than a flow. CSS vars only (theme-aware).
 * Total over `HarnessRole`.
 */
export const HARNESS_ROLE_COLOR: Record<HarnessRole, string> = {
  tools: "var(--color-orange)",
  knowledge: "var(--color-teal)",
  memory: "var(--color-blue)",
  context: "var(--color-violet)",
  permissions: "var(--color-ok)",
  model: "var(--color-pink)",
  orchestration: "var(--color-sky)",
  delivery: "var(--color-warn)",
  observability: "var(--color-muted)",
};

/**
 * Every station's contribution to the harness. Total over `StationId` (enforced
 * by the `Record` type + `harness.test.ts`). Preview/coming-soon stations are
 * classified too — the badge describes the *role the box stands for*, honestly,
 * even before that box executes.
 */
export const HARNESS_ROLE: Record<StationId, HarnessRole> = {
  // Client + ingress: getting the request in and the answer out.
  frontend: "delivery",
  dns: "delivery",
  cdn: "delivery",
  lb: "delivery",
  waf: "permissions",
  apigw: "permissions",
  // Application control plane.
  backend: "orchestration",
  agent: "orchestration",
  gateway: "orchestration",
  // Knowledge.
  rag: "knowledge",
  pageindex: "knowledge",
  ingestion: "knowledge",
  // Tools + model.
  mcp: "tools",
  llm: "model",
  // Memory + context.
  database: "memory",
  cache: "memory",
  summarization: "context",
  // Permissions / policy.
  guardrails: "permissions",
  // AI-Ops: watching the harness.
  eval: "observability",
  observability: "observability",
  // Multi-agent workers: delegated units of the orchestration.
  researcher: "orchestration",
  coder: "orchestration",
  critic: "orchestration",
};
