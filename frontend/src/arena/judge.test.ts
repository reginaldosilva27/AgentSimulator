// 133-arena-ai-judge — the client (AC2 echo, AC8 abort, AC11 demo, AC15 sandbox).
// The provider is never called from the frontend suite: `fetch` is stubbed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CALL_SHAPE } from "./components";
import { JudgeError, buildJudgeRequest, requestJudgement } from "./judge";
import { DEFAULT_SLO_TARGETS, evaluateObjectives, measureDesign } from "./slo";
import type { ArenaNode } from "./store";

const node = (id: string, kind: ArenaNode["kind"], extra: Partial<ArenaNode> = {}): ArenaNode => ({
  id,
  kind,
  size: "medium",
  replicas: 1,
  region: "us-east",
  x: 0,
  y: 0,
  ...extra,
});

function input(over: Record<string, unknown> = {}) {
  const nodes = [
    node("client", "client", { region: undefined }),
    node("be", "backend"),
    node("llm", "llm", { replicas: 20, callsPerRequest: 2, note: "One pool keeps ops simple." }),
  ];
  const edges = [
    { id: "client-be", source: "client", target: "be" },
    { id: "be-llm", source: "be", target: "llm" },
  ];
  const measurement = measureDesign({ nodes, edges, callShape: DEFAULT_CALL_SHAPE }, 16_000, 20);
  return {
    nodes,
    edges,
    faults: [],
    measurement,
    verdict: evaluateObjectives(measurement, DEFAULT_SLO_TARGETS),
    users: 16_000,
    thinkTimeSec: 20,
    challenge: null,
    lang: "en" as const,
    ...over,
  };
}

const CRITIQUE = {
  rigorous: "One region is a single point of failure.",
  pragmatic: "The pool is bigger than this load needs.",
  agreed: "Spread regions, then right-size.",
  verdict_met: true,
  model: "gpt-4.1-mini",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("133 — the request body", () => {
  it("AC3/AC15 — carries the design, the computed metrics and the declared objectives", () => {
    const body = buildJudgeRequest(input());

    expect(body.design.length).toBe(3);
    expect(body.design.join(" ")).toContain("20 unit(s)");
    expect(body.connections).toEqual(["client → be", "be → llm"]);
    expect(body.load).toContain("16,000");
    expect(body.metrics.join(" ")).toMatch(/end-to-end latency/);
    expect(body.metrics.join(" ")).toMatch(/headroom/);
    // Even in the sandbox the judge gets DECLARED goals (the user's 129 targets),
    // so it never critiques in a vacuum.
    expect(body.objectives.length).toBe(Object.keys(DEFAULT_SLO_TARGETS).length);
    expect(typeof body.verdict_met).toBe("boolean");
  });

  it("AC4 — forwards the architect's notes for the backend to quote as untrusted", () => {
    const body = buildJudgeRequest(input());
    expect(body.notes).toContain("llm: One pool keeps ops simple.");
  });

  it("tells the judge when the figures were measured under a fault", () => {
    const body = buildJudgeRequest(
      input({ faults: [{ id: "f", type: "instanceDown", nodeId: "llm" }] }),
    );
    expect(body.metrics.join(" ")).toContain("fault(s) applied");
    expect(body.metrics.join(" ")).toContain("instanceDown");
  });

  it("passes the requested language through", () => {
    expect(buildJudgeRequest(input({ lang: "pt" })).lang).toBe("pt");
  });
});

describe("133 AC2 — the arithmetic stays authoritative", () => {
  it("returns the critique with the verdict the SERVER echoed, and no decision field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(CRITIQUE), { status: 200 })),
    );

    const result = await requestJudgement(input());
    expect(result.rigorous).toBeTruthy();
    expect(result.verdict_met).toBe(true);
    // Nothing in the critique type can express a pass/fail of its own.
    expect(Object.keys(result).sort()).toEqual([
      "agreed",
      "model",
      "pragmatic",
      "rigorous",
      "verdict_met",
    ]);
  });
});

describe("133 AC5 — unavailability is specific, never a fabricated critique", () => {
  it("maps 503 to `no_provider`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    await expect(requestJudgement(input())).rejects.toBeInstanceOf(JudgeError);
    await expect(requestJudgement(input())).rejects.toMatchObject({ reason: "no_provider" });
  });

  it("maps 429 to `rate_limited`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(requestJudgement(input())).rejects.toMatchObject({ reason: "rate_limited" });
  });

  it("maps anything else to `failed`", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(requestJudgement(input())).rejects.toMatchObject({ reason: "failed" });
  });
});

describe("133 AC8 — cancellation", () => {
  it("propagates an abort instead of resolving with a partial critique", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );

    const controller = new AbortController();
    const pending = requestJudgement(input(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe("133 AC11 — the demo build attempts no request", () => {
  it("throws `demo` without touching fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const demo = await import("../lib/demo");
    vi.spyOn(demo, "isDemo").mockReturnValue(true);

    await expect(requestJudgement(input())).rejects.toMatchObject({ reason: "demo" });
    expect(spy).not.toHaveBeenCalled();
  });
});
