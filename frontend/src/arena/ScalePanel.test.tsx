// 104-arena-scaling-vocabulary — the scale panel speaks each component's real
// scaling language (AC2), explains itself via the info toggle (AC3), hides the
// knobs on the non-scalable client (AC4) and hints the capacity formula (AC5).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { ScalePanel } from "./ArenaCanvas";
import { KIND_META } from "./components";
import { useArena } from "./store";

beforeEach(() => {
  localStorage.clear();
  useArena.setState({
    nodes: [
      { id: "llm-1", kind: "llm", size: "medium", replicas: 1, x: 0, y: 0 },
      { id: "client-1", kind: "client", size: "medium", replicas: 1, x: 0, y: 100 },
      // 105 — a backend holding 20 LLM deployment endpoints directly (taxed).
      { id: "be-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 200 },
      { id: "llm-2", kind: "llm", size: "medium", replicas: 20, x: 100, y: 200 },
    ],
    edges: [{ id: "be-1-llm-2", source: "be-1", target: "llm-2" }],
    offeredLoad: 1000,
    users: 30_000,
    thinkTimeSec: 30,
    exampleId: null,
  });
});

afterEach(cleanup);

describe("per-kind scaling vocabulary (104)", () => {
  it("labels the LLM's horizontal control as Deployments, not Replicas (AC2)", () => {
    render(<ScalePanel id="llm-1" />);
    expect(screen.getByText(/Deployments/)).toBeTruthy();
    expect(screen.queryByText(/^Replicas:/)).toBeNull();
  });

  it("reveals the kind explainer via the info toggle (AC3)", () => {
    render(<ScalePanel id="llm-1" />);
    const info = KIND_META.llm.info.en;
    expect(screen.queryByText(info)).toBeNull(); // hidden until toggled
    fireEvent.click(screen.getByRole("button", { name: UI.en.arena.infoLabel }));
    expect(screen.getByText(info)).toBeTruthy();
  });

  it("shows no scaling knobs for the client (AC4)", () => {
    render(<ScalePanel id="client-1" />);
    expect(screen.queryByText(UI.en.arena.size)).toBeNull(); // no size selector
    expect(screen.queryAllByRole("slider")).toHaveLength(0); // no sliders at all
    // but the explainer is still reachable
    fireEvent.click(screen.getByRole("button", { name: UI.en.arena.infoLabel }));
    expect(screen.getByText(KIND_META.client.info.en)).toBeTruthy();
  });

  it("hints the capacity formula on the capacity readout (AC5)", () => {
    render(<ScalePanel id="llm-1" />);
    expect(screen.getByTitle(UI.en.arena.capacityHint)).toBeTruthy();
  });

  it("shows the routing-tax note on a backend managing LLM endpoints directly (105 AC4)", () => {
    render(<ScalePanel id="be-1" />);
    // 20 deployments → tax min(0.4, 0.02×19) = 38%
    expect(screen.getByText(UI.en.arena.routingTax("38%", 20))).toBeTruthy();
  });

  it("shows no routing-tax note on an unwired LLM node (105 AC4)", () => {
    render(<ScalePanel id="llm-1" />);
    expect(screen.queryByText(/routing/i)).toBeNull();
  });

  it("offers the region select on infrastructure nodes and updates it (106 AC2)", () => {
    render(<ScalePanel id="llm-1" />);
    const select = screen.getByRole("combobox", { name: UI.en.arena.region });
    fireEvent.change(select, { target: { value: "eu-west" } });
    expect(useArena.getState().nodes.find((n) => n.id === "llm-1")!.region).toBe("eu-west");
  });

  it("hides the region select on the client (106 AC2)", () => {
    render(<ScalePanel id="client-1" />);
    expect(screen.queryByRole("combobox", { name: UI.en.arena.region })).toBeNull();
  });
});
