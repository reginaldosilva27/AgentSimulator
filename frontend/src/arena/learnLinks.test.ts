// 121-arena-learn-links — the mapping is the single source of truth; a dead link
// must never ship (AC1), the minimum kind set is covered (AC2), and unmapped
// kinds stay clean (AC3).

import { describe, expect, it } from "vitest";

import { allTopicsFor } from "../learn/content";
import { KIND_TO_TOPICS, learnTopicsFor } from "./learnLinks";
import { EXAMPLES } from "./examples";
import type { ArenaKind } from "./components";

describe("121 — Arena↔Learn mapping is total over existing topics (AC1)", () => {
  const topics = allTopicsFor("en");

  it("every component→topic id resolves to a real Learn topic", () => {
    for (const [kind, ids] of Object.entries(KIND_TO_TOPICS)) {
      for (const id of ids!) {
        expect(topics[id], `${kind} → "${id}" must be a real Learn topic`).toBeDefined();
      }
    }
  });

  it("every preset concept-chip id resolves to a real Learn topic", () => {
    for (const ex of EXAMPLES) {
      for (const id of ex.concepts ?? []) {
        expect(topics[id], `${ex.id} concept "${id}"`).toBeDefined();
      }
    }
  });
});

describe("121 — coverage (AC2) and clean unmapped kinds (AC3)", () => {
  it("maps at least the minimum agent-architecture kind set", () => {
    const required: ArenaKind[] = [
      "llm",
      "vectorDb",
      "mcp",
      "appDb",
      "backend",
      "queue",
      "loadBalancer",
      "apiGateway",
      "aiGateway",
      "cache",
      "semanticCache",
    ];
    for (const kind of required) {
      expect(learnTopicsFor(kind).length, `${kind} mapped`).toBeGreaterThan(0);
    }
  });

  it("maps the new 125 components", () => {
    for (const kind of ["worker", "guardrails", "externalApi", "objectStore", "memoryStore"] as ArenaKind[]) {
      expect(learnTopicsFor(kind).length, `${kind} mapped`).toBeGreaterThan(0);
    }
  });

  it("leaves CDN unmapped (no Learn topic yet)", () => {
    expect(learnTopicsFor("cdn")).toEqual([]);
  });

  it("declares at least two presets with concept chips (AC6)", () => {
    const withConcepts = EXAMPLES.filter((e) => (e.concepts ?? []).length > 0);
    expect(withConcepts.length).toBeGreaterThanOrEqual(2);
  });
});
