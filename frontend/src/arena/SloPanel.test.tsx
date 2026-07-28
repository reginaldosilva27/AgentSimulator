// 129-arena-slo-engine — the objectives panel (AC9 live update, AC13 ceiling,
// AC15 culprit highlight). Rendered directly: the panel is a pure projection of
// the store, so it needs no React Flow context.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { SloPanel } from "./SloPanel";
import { DEFAULT_SLO_TARGETS } from "./slo";
import { useArena } from "./store";

/** 16k users @ 1 msg/20s onto ONE deployment — the shipped "broken" shape. */
function loadBroken() {
  useArena.setState({
    nodes: [
      { id: "client", kind: "client", size: "medium", replicas: 1, x: 0, y: 0 },
      { id: "be", kind: "backend", size: "medium", replicas: 1, region: "us-east", x: 200, y: 0 },
      {
        id: "llm",
        kind: "llm",
        size: "medium",
        replicas: 1,
        callsPerRequest: 2,
        region: "us-east",
        x: 400,
        y: 0,
      },
    ],
    edges: [
      { id: "client-be", source: "client", target: "be" },
      { id: "be-llm", source: "be", target: "llm" },
    ],
    users: 16_000,
    thinkTimeSec: 20,
    sloTargets: { ...DEFAULT_SLO_TARGETS },
  });
}

const t = UI.en.arena;
const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  useArena.setState({ nodes: [], edges: [], sloTargets: { ...DEFAULT_SLO_TARGETS } });
});

afterEach(cleanup);

describe("129 AC9 — the panel renders the checklist and updates live", () => {
  it("shows a row per tracked objective with its ✓/✗", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);

    // Latency + headroom fail on the starved design; shed honestly passes.
    const latency = screen.getByText(t.slo.metric.latency).closest("li")!;
    const headroom = screen.getByText(t.slo.metric.headroom).closest("li")!;
    const shed = screen.getByText(t.slo.metric.shed).closest("li")!;
    expect(latency.textContent).toContain("✗");
    expect(headroom.textContent).toContain("✗");
    expect(shed.textContent).toContain("✓");

    expect(screen.getByText(t.sloVerdictPartial(1, 3))).toBeTruthy();
  });

  it("re-renders as met after a scaling change, with no reload", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);
    expect(screen.getByText(t.sloVerdictPartial(1, 3))).toBeTruthy();

    // Scale the LLM tier out — the same gesture the ScalePanel performs.
    act(() => {
      const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
      useArena.getState().setReplicas(llm.id, 20);
    });

    expect(screen.getByText(t.slo.verdictAllMet)).toBeTruthy();
    expect(screen.queryByText(t.sloVerdictPartial(1, 3))).toBeNull();
  });

  it("renders the honesty hint (these are model targets, not measurements)", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);
    expect(screen.getByText(t.slo.hint)).toBeTruthy();
  });

  it("shows an empty-state instead of fake numbers on a bare canvas", () => {
    render(<SloPanel onHighlight={noop} />);
    expect(screen.getByText(t.slo.empty)).toBeTruthy();
    expect(screen.queryByText(t.slo.metric.latency)).toBeNull();
  });
});

describe("129 AC15 — a failed row highlights its culprit", () => {
  it("lights the culprit on hover and clears it on mouse-out", () => {
    loadBroken();
    const seen: Array<string | null> = [];
    render(<SloPanel onHighlight={(id) => seen.push(id)} />);

    const latency = screen.getByText(t.slo.metric.latency).closest("li")!;
    fireEvent.mouseEnter(latency);
    expect(seen.at(-1)).toBe("llm"); // the busiest box, by name
    fireEvent.mouseLeave(latency);
    expect(seen.at(-1)).toBeNull();
  });

  it("names the culprit and its remediation hint on the failed row", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);
    const latency = screen.getByText(t.slo.metric.latency).closest("li")!;
    // "Limited by: LLM" — the label comes from KIND_META, not the raw node id.
    expect(within(latency).getByText(/Limited by:/)).toBeTruthy();
    expect(latency.textContent).toMatch(/decode/i); // the llm latency mechanism
  });

  it("a MET row carries no culprit line", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);
    const shed = screen.getByText(t.slo.metric.shed).closest("li")!;
    expect(shed.textContent).toContain("✓");
    expect(within(shed).queryByText(/Limited by:/)).toBeNull();
  });
});

describe("129 AC13 — the latency ceiling renders as a lower bound", () => {
  it("prefixes ≥ and shows the ceiling note past the clamp", () => {
    loadBroken();
    act(() => useArena.getState().setUsers(16_000 * 5)); // into the extreme regime
    render(<SloPanel onHighlight={noop} />);

    const latency = screen.getByText(t.slo.metric.latency).closest("li")!;
    expect(latency.textContent).toContain("≥");
    expect(within(latency).getByText(t.slo.ceilingNote)).toBeTruthy();
  });

  it("does not prefix ≥ below the clamp", () => {
    loadBroken();
    act(() => {
      const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
      useArena.getState().setReplicas(llm.id, 20);
    });
    render(<SloPanel onHighlight={noop} />);
    const latency = screen.getByText(t.slo.metric.latency).closest("li")!;
    expect(latency.textContent).not.toContain("≥");
  });
});

describe("129 AC8/AC10 — tracking objectives from the panel", () => {
  it("switching an objective off removes its row and re-offers it as a chip", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);

    fireEvent.click(
      screen.getByLabelText(`${t.slo.metric.latency} — ${t.slo.untrack}`),
    );

    expect(screen.queryByText(t.slo.metric.latency)).toBeNull(); // row gone
    expect(screen.getByText(`+ ${t.slo.metric.latency}`)).toBeTruthy(); // offered back
    expect(useArena.getState().sloTargets.latency).toBeUndefined();
  });

  it("cost starts UNTRACKED and can be switched on from the panel", () => {
    // 129's measured inversion: the starved design is the CHEAPEST, so cost is
    // off by default and is an explicit opt-in.
    loadBroken();
    render(<SloPanel onHighlight={noop} />);
    expect(screen.queryByText(t.slo.metric.cost)).toBeNull();

    fireEvent.click(screen.getByText(`+ ${t.slo.metric.cost}`));
    expect(useArena.getState().sloTargets.cost).toBeDefined();
    expect(screen.getByText(t.slo.metric.cost)).toBeTruthy();
  });

  it("edits a target through its input (seconds in, ms stored)", () => {
    loadBroken();
    render(<SloPanel onHighlight={noop} />);

    const input = screen.getByLabelText(`${t.slo.metric.latency} — ${t.slo.target}`);
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    expect(useArena.getState().sloTargets.latency).toBe(12_000);
  });
});
