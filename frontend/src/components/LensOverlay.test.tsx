// 096-harness-loop-lens — the canvas overlay: nothing under the `all` lens
// (AC1 baseline), the legend under Harness, the Loop readout under Loop (AC5),
// and the "learn more" link jumps to Learn (AC8).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LensOverlay } from "./LensOverlay";
import { useLens } from "../lib/lens";
import { useSimulator } from "../store/useSimulator";
import type { Phase, Stage, TraceEvent } from "../types/events";

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function loadRun(events: TraceEvent[]) {
  useSimulator.setState({ events, cursor: events.length - 1 });
}

beforeEach(() => {
  useLens.getState().setMode("all");
  useSimulator.setState({ events: [], cursor: -1 });
});

afterEach(() => {
  cleanup();
  useLens.getState().setMode("all");
});

describe("LensOverlay", () => {
  it("renders nothing under the `all` lens (AC1)", () => {
    render(<LensOverlay onLearnMore={() => {}} />);
    expect(screen.queryByTestId("lens-overlay")).toBeNull();
  });

  it("shows the role legend (no loop readout) under the Harness lens", () => {
    useLens.getState().setMode("harness");
    render(<LensOverlay onLearnMore={() => {}} />);
    expect(screen.getByTestId("lens-overlay").getAttribute("data-lens-mode")).toBe("harness");
    expect(screen.getByTestId("lens-role-legend")).toBeTruthy(); // the color key (parts map)
    expect(screen.queryByTestId("lens-loop-readout")).toBeNull();
  });

  it("shows the loop readout with a failure marker under the Loop lens (AC5)", () => {
    seq = 0;
    loadRun([
      ev("frontend", "end", { simulate_failure: "llm_timeout" }),
      ev("backend", "start"),
      ev("agent.think", "start"),
      ev("agent.think", "end", { decision: "answer" }),
      ev("respond", "end", { answer: "ok" }),
      ev("backend", "end"),
    ]);
    useLens.getState().setMode("loop");
    render(<LensOverlay onLearnMore={() => {}} />);
    const readout = screen.getByTestId("lens-loop-readout");
    expect(readout.textContent).toContain("1"); // iteration 1/3
    expect(readout.textContent).toContain("3");
  });

  it("calls onLearnMore when the learn link is clicked (AC8)", () => {
    const onLearnMore = vi.fn();
    useLens.getState().setMode("harness");
    render(<LensOverlay onLearnMore={onLearnMore} />);
    fireEvent.click(screen.getByText(/Harness & Loop Engineering/i));
    expect(onLearnMore).toHaveBeenCalledOnce();
  });
});
