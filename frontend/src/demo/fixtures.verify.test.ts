// 098-verify-reflection-loop — the GitHub Pages demo must replay a REAL verify run
// (constitution §3): the captured fixtures exist and carry the agent.verify pass, so a
// demo visitor who enables the Verification loop sees the critic pass + the drill-in
// Verification panel, not a non-verify fallback.
import { describe, expect, it } from "vitest";

import { DEMO_TRACES } from "./fixtures";

describe("demo verify fixtures (098)", () => {
  it("registers the verify scenario for every curated question, both languages", () => {
    const verify = DEMO_TRACES.filter((t) => t.scenario === "verify");
    const qids = new Set(verify.map((t) => t.qid));
    expect(qids).toEqual(new Set(["rag", "math", "mcp", "time"]));
    const langs = new Set(verify.map((t) => t.lang));
    expect(langs).toEqual(new Set(["en", "pt"]));
  });

  it("each verify fixture carries a real agent.verify END with a verdict", () => {
    const verify = DEMO_TRACES.filter((t) => t.scenario === "verify");
    expect(verify.length).toBeGreaterThan(0);
    for (const t of verify) {
      const ends = t.fixture.events.filter(
        (e) => e.stage === "agent.verify" && e.phase === "end",
      );
      expect(ends.length).toBeGreaterThan(0);
      expect(["pass", "revise"]).toContain(ends[0].data.decision);
      expect(typeof ends[0].data.reason).toBe("string");
    }
  });
});
