// 133-arena-ai-judge — the critique panel (AC8 cancel, AC12 framing, AC5 reasons).

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UI } from "../i18n/strings";
import { JudgePanel } from "./JudgePanel";
import { DEFAULT_SLO_TARGETS } from "./slo";
import { useArena } from "./store";

const t = UI.en.arena;

const CRITIQUE = {
  rigorous: "Everything sits in one region.",
  pragmatic: "The pool is larger than this load needs.",
  agreed: "Spread regions first, then right-size.",
  verdict_met: true,
  model: "gpt-4.1-mini",
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  useArena.setState({
    nodes: [
      { id: "be", kind: "backend", size: "medium", replicas: 1, region: "us-east", x: 0, y: 0 },
      { id: "llm", kind: "llm", size: "medium", replicas: 20, region: "us-east", x: 200, y: 0 },
    ],
    edges: [{ id: "be-llm", source: "be", target: "llm" }],
    faults: [],
    users: 16_000,
    thinkTimeSec: 20,
    sloTargets: { ...DEFAULT_SLO_TARGETS },
    challengeId: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("133 — the review panel", () => {
  it("AC12 — always states that this is an opinion, not the verdict", () => {
    render(<JudgePanel />);
    // The framing is load-bearing copy, not decoration: the capacity model owns
    // whether the objectives are met.
    expect(screen.getAllByText(t.judge.framing).length).toBeGreaterThan(0);
    expect(screen.getByText(t.judge.ask)).toBeTruthy();
  });

  it("renders the three labelled parts after a successful review", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(CRITIQUE), { status: 200 })),
    );
    render(<JudgePanel />);

    fireEvent.click(screen.getByText(t.judge.ask));

    await waitFor(() => expect(screen.getByText(CRITIQUE.rigorous)).toBeTruthy());
    expect(screen.getByText(t.judge.rigorous)).toBeTruthy();
    expect(screen.getByText(t.judge.pragmatic)).toBeTruthy();
    expect(screen.getByText(t.judge.agreed)).toBeTruthy();
    expect(screen.getByText(CRITIQUE.agreed)).toBeTruthy();
  });

  it("AC8 — cancelling leaves NO partial critique behind", async () => {
    let abortSeen = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              abortSeen = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      ),
    );
    render(<JudgePanel />);

    fireEvent.click(screen.getByText(t.judge.ask));
    await waitFor(() => expect(screen.getByText(t.judge.running)).toBeTruthy());

    fireEvent.click(screen.getByText(t.judge.cancel));

    expect(abortSeen).toBe(true);
    expect(screen.queryByText(t.judge.rigorous)).toBeNull();
    expect(screen.queryByText(t.judge.failed)).toBeNull(); // an abort is not a failure
    expect(screen.getByText(t.judge.ask)).toBeTruthy();
  });

  it("AC5 — explains an unconfigured provider instead of failing vaguely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    render(<JudgePanel />);

    fireEvent.click(screen.getByText(t.judge.ask));

    await waitFor(() => expect(screen.getByText(t.judge.unavailable)).toBeTruthy());
    expect(screen.queryByText(t.judge.rigorous)).toBeNull(); // no fabricated critique
    expect(screen.getByText(t.judge.retry)).toBeTruthy();
  });

  it("explains a rate limit distinctly from a plain failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    render(<JudgePanel />);
    fireEvent.click(screen.getByText(t.judge.ask));
    await waitFor(() => expect(screen.getByText(t.judge.rateLimited)).toBeTruthy());
  });

  it("cannot be asked on an empty canvas", () => {
    useArena.setState({ nodes: [], edges: [] });
    render(<JudgePanel />);
    expect((screen.getByText(t.judge.ask) as HTMLButtonElement).disabled).toBe(true);
  });
});
