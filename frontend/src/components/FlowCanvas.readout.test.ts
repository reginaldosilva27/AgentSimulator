// 051-failure-treatments — the LLM station readout reflects the resilience
// treatment (retry → circuit open) the simulator now exercises, derived purely
// from the additive event `data`. (017 only ever showed the bare badge.)
import { describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import type { StationRuntime, UsageTotals } from "../lib/derive";
import type { TraceEvent } from "../types/events";
import { readoutFor } from "./FlowCanvas";

const ro = UI.en.readout;
const noUsage: UsageTotals = {
  rounds: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  cachedTokens: 0,
  costSavedUsd: 0,
};

function llmPromptEnd(data: Record<string, unknown>): TraceEvent {
  return {
    trace_id: "t",
    seq: 1,
    ts: 0,
    stage: "llm.prompt",
    phase: "end",
    label: "",
    data,
    metrics: {},
  };
}

function rt(events: TraceEvent[]): StationRuntime {
  return { status: "active", events };
}

function end(stage: TraceEvent["stage"], data: Record<string, unknown>): TraceEvent {
  return { trace_id: "t", seq: 1, ts: 0, stage, phase: "end", label: "", data, metrics: {} };
}

describe("readoutFor — rag station reranked sub-stage (054-rag-block-expansion)", () => {
  it("surfaces the rerank pool→kept on the Vector DB tile once rerank has fired (Intermediate)", () => {
    const out = readoutFor(
      "rag",
      rt([end("rag.rerank", { k: 4, fetch_k: 10, candidates: [] })]),
      ro,
      noUsage,
    );
    expect(out).toBe(ro.reranked(10, 4));
  });

  it("shows the plain top-k/score readout when no rerank fired (Simple)", () => {
    const ret: TraceEvent = {
      ...end("rag.retrieve", { k: 4, chunks: [{}, {}] }),
      metrics: { top_score: 0.47 },
    };
    const out = readoutFor("rag", rt([ret]), ro, noUsage);
    expect(out).toBe(`top-4 · ${ro.score} 0.47`);
  });
});

describe("readoutFor — llm station cache saving (099-prompt-caching)", () => {
  const genEnd = end("llm.generate", { answer: "hi" });

  it("appends the cached-tokens + saving readout when the turn had a cache hit", () => {
    const usage: UsageTotals = {
      rounds: 2,
      promptTokens: 2500,
      completionTokens: 40,
      totalTokens: 2540,
      costUsd: 0.0009,
      cachedTokens: 1200,
      costSavedUsd: 0.0003, // saved 0.0003 of a would-be 0.0012 → 25%
    };
    const out = readoutFor("llm", rt([genEnd]), ro, usage);
    expect(out).toContain(ro.tokensCost("2.5k", "$0.0009"));
    expect(out).toContain(ro.cachedSaving("1.2k", "25%"));
  });

  it("shows no cache readout when nothing was cached (Simple / cold call)", () => {
    const usage: UsageTotals = {
      rounds: 1,
      promptTokens: 300,
      completionTokens: 20,
      totalTokens: 320,
      costUsd: 0.0001,
      cachedTokens: 0,
      costSavedUsd: 0,
    };
    const out = readoutFor("llm", rt([genEnd]), ro, usage);
    expect(out).toBe(ro.tokensCost("320", "$0.0001"));
  });
});

describe("readoutFor — CDN bypass (090-waf-after-lb)", () => {
  it("shows BYPASS for the uncacheable chat API (not a coincidental MISS)", () => {
    const out = readoutFor("cdn", rt([end("cdn", { seen: true, cache: "BYPASS" })]), ro, noUsage);
    expect(out).toBe("BYPASS");
  });
});

describe("readoutFor — llm station, failure treatments (051)", () => {
  it("shows the retry attempt while the timeout is being retried", () => {
    const out = readoutFor(
      "llm",
      rt([llmPromptEnd({ simulated: true, attempt: 2, max_retries: 3 })]),
      ro,
      noUsage,
    );
    expect(out).toBe(ro.retrying(2, 3));
    expect(out).toContain("2");
    expect(out).toContain("3");
  });

  it("shows the circuit-open fallback once the last attempt fails", () => {
    const out = readoutFor(
      "llm",
      rt([llmPromptEnd({ simulated: true, attempt: 3, max_retries: 3 })]),
      ro,
      noUsage,
    );
    expect(out).toBe(ro.circuitOpen);
  });

  it("falls back to the bare simulated badge when no attempt metadata is present (017)", () => {
    const out = readoutFor("llm", rt([llmPromptEnd({ simulated: true })]), ro, noUsage);
    expect(out).toBe(ro.simulatedError);
  });
});
