// 121-arena-learn-links — the single source of truth binding Arena components to
// the Learn library's theory topics. The ℹ️ explainer of a mapped component links
// to these topics; example presets name the concepts they demonstrate as chips
// that deep-link the same way. A test (learnLinks.test.ts) walks every id here
// through `allTopicsFor("en")`, so a dead link cannot ship (AC1).
//
// This is DATA, not behavior: the future challenges module will reuse the same
// mapping to name the topics a challenge exercises.

import type { ArenaKind } from "./components";

/** Per-kind Learn topic ids (1–3 each). Ids are validated against the real Learn
 *  content by the AC1 test. A kind with no matching topic is simply absent (its
 *  ℹ️ explainer shows no "Learn more" row — AC3). CDN has no Learn topic yet. */
export const KIND_TO_TOPICS: Partial<Record<ArenaKind, readonly string[]>> = {
  client: ["client-tier"],
  backend: ["api-tier", "stateless-scaling"],
  agentHarness: ["agent-harness", "agents-react"],
  llm: ["openai-provider", "tokens", "token-cost"],
  vectorDb: ["vector-db", "vector-search", "embeddings"],
  mcp: ["tool-calling"],
  appDb: ["app-db", "persistence"],
  readReplica: ["app-db", "stateless-scaling"],
  apiGateway: ["ingress"],
  aiGateway: ["llm-gateway"],
  loadBalancer: ["ingress", "stateless-scaling"],
  cache: ["in-memory"],
  semanticCache: ["semantic-cache"],
  queue: ["event-driven"],
  // 125 — the new components teach their own theory too.
  worker: ["event-driven"],
  guardrails: ["guardrails"],
  externalApi: ["contract"],
  objectStore: ["persistence"],
  memoryStore: ["agent-memory", "persistence"],
  // cdn — no Learn topic yet (AC3: renders no "Learn more" row).
};

/** The Learn topic ids a component links to (empty for an unmapped kind). */
export function learnTopicsFor(kind: ArenaKind): readonly string[] {
  return KIND_TO_TOPICS[kind] ?? [];
}
