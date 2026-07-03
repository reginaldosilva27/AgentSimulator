// 097-learn-harness-loop — the three discipline topics exist (AC1), are grounded in
// this app's real harness (AC3) and real loop (AC4), the ladder is in order (AC5),
// and each carries a curated link (AC6). Bilingual parity + link hygiene are already
// enforced globally by content.test.ts, so these pin the 096-specific substance.

import { describe, expect, it } from "vitest";

import { allTopicsFor } from "./content";

const IDS = ["engineering-ladder", "harness-engineering", "loop-engineering"] as const;

describe("discipline topics exist (AC1) with links (AC6)", () => {
  it("all three topics resolve in en and pt", () => {
    for (const lang of ["en", "pt"] as const) {
      const topics = allTopicsFor(lang);
      for (const id of IDS) {
        expect(topics[id], `missing ${id} in ${lang}`).toBeTruthy();
        expect((topics[id].topic.links ?? []).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("harness topic is grounded in the real app (AC3)", () => {
  it("names the app's real harness pieces", () => {
    const how = allTopicsFor("en")["harness-engineering"].topic.how;
    for (const anchor of ["MCP", "RAG", "App Database", "context-window", "guardrails", "LLM"]) {
      expect(how, `harness how should mention "${anchor}"`).toContain(anchor);
    }
  });
});

describe("loop topic is grounded in the real loop (AC4)", () => {
  it("names the real ReAct loop, its stop condition and the failure path", () => {
    const how = allTopicsFor("en")["loop-engineering"].topic.how;
    expect(how).toContain("think ⇄ tools");
    expect(how).toContain("MAX_ITERATIONS");
    expect(how).toContain("simulate_failure");
  });
});

describe("the ladder is presented in order (AC5)", () => {
  it("lists prompt → context → harness → loop in order and names the two the sim shows", () => {
    const how = allTopicsFor("en")["engineering-ladder"].topic.how.toLowerCase();
    const iPrompt = how.indexOf("prompt");
    const iContext = how.indexOf("context");
    const iHarness = how.indexOf("harness");
    const iLoop = how.indexOf("loop");
    expect(iPrompt).toBeGreaterThanOrEqual(0);
    expect(iContext).toBeGreaterThan(iPrompt);
    expect(iHarness).toBeGreaterThan(iContext);
    expect(iLoop).toBeGreaterThan(iHarness);
    // the two the simulator makes visible
    expect(how).toContain("harness and the loop");
  });
});
