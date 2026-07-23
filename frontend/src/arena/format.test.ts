// 100-arena — regression: latency must never render as "80kms" (a saturated LLM
// at ~80s was formatted with the QPS "k" helper). Latency rolls up to seconds.

import { describe, expect, it } from "vitest";

import { formatLatency, formatQps } from "./format";

describe("arena metric formatting", () => {
  it("formats QPS compactly", () => {
    expect(formatQps(200)).toBe("200");
    expect(formatQps(12_000)).toBe("12k");
  });

  it("keeps sub-second latency in ms", () => {
    expect(formatLatency(25)).toBe("25ms");
    expect(formatLatency(800)).toBe("800ms");
  });

  it("rolls latency up to seconds (never 'kms') once ≥ 1s", () => {
    expect(formatLatency(80_000)).toBe("80s"); // the reported bug: was "80kms"
    expect(formatLatency(1500)).toBe("1.5s");
    expect(formatLatency(80_000)).not.toContain("kms");
  });
});
