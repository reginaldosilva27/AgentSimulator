// 100-arena-capacity-sandbox — end-to-end verification of the REAL ArenaCanvas
// (React Flow) wired to the store + model, which the AC8/AC10 test stubs out.
// Seeds a design in the store and asserts the live node boxes render their
// modeled metrics and that the saturated LLM lights up as the bottleneck.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UI } from "../i18n/strings";
import { ArenaCanvas, edgeIdsToRemove } from "./ArenaCanvas";
import { BENCHMARKS } from "./components";
import { useArena } from "./store";

beforeEach(() => {
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
  // A backend → llm → appDb chain under load that saturates the llm.
  useArena.setState({
    nodes: [
      { id: "backend-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0 },
      // 106 — region annotation renders as a badge on the canvas node.
      { id: "llm-2", kind: "llm", size: "medium", replicas: 1, x: 220, y: 0, region: "eu-west" },
      { id: "appDb-3", kind: "appDb", size: "medium", replicas: 1, x: 440, y: 0 },
    ],
    edges: [
      { id: "backend-1-llm-2", source: "backend-1", target: "llm-2" },
      { id: "llm-2-appDb-3", source: "llm-2", target: "appDb-3" },
    ],
    offeredLoad: BENCHMARKS.backend.baseCapacity, // saturates the llm hard
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArenaCanvas real render (integration)", () => {
  it("renders a node box per component with live QPS + a bottleneck flag on the LLM", () => {
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );

    // All three component boxes are on the canvas (labels come from KIND_META).
    expect(screen.getByText("Backend")).toBeTruthy();
    expect(screen.getByText("LLM")).toBeTruthy();
    expect(screen.getByText("App DB")).toBeTruthy();

    // The QPS metric label appears (proof the metrics grid rendered), and the
    // over-loaded LLM shows the bottleneck badge — the real model → node path.
    expect(screen.getAllByText("QPS").length).toBeGreaterThan(0);
    expect(screen.getByText(/bottleneck/i)).toBeTruthy();

    // 106 AC3 — the region annotation shows as a badge on the node box.
    expect(screen.getByText("eu-west")).toBeTruthy();
  });

  it("renders enlarged, grabbable connection handles (107 AC4)", () => {
    const { container } = render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    const handles = container.querySelectorAll(".arena-handle");
    expect(handles.length).toBeGreaterThan(0);
    expect((handles[0] as HTMLElement).style.width).toBe("14px");
  });
});

describe("fan-out nudge chip (115 AC1/AC2)", () => {
  // The seeded design wires backend-1 → llm-2 with the silent cpr default of 1 —
  // exactly the state the nudge exists for.
  it("renders the suggestion and one-click Apply sets calls per request = 2", () => {
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    expect(screen.getByText(UI.en.arena.fanoutNudge)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: UI.en.arena.fanoutApply }));
    expect(useArena.getState().nodes.find((n) => n.id === "llm-2")!.callsPerRequest).toBe(2);
    expect(screen.queryByText(UI.en.arena.fanoutNudge)).toBeNull(); // resolved
  });

  it("dismiss hides it without changing the node", () => {
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: UI.en.arena.fanoutDismiss }));
    expect(screen.queryByText(UI.en.arena.fanoutNudge)).toBeNull();
    expect(
      useArena.getState().nodes.find((n) => n.id === "llm-2")!.callsPerRequest,
    ).toBeUndefined();
  });
});

describe("edge removal change filter (107 AC3)", () => {
  it("extracts only the remove-change ids", () => {
    expect(
      edgeIdsToRemove([
        { type: "remove", id: "a-b" },
        { type: "select", id: "b-c", selected: true },
        { type: "remove", id: "c-d" },
      ]),
    ).toEqual(["a-b", "c-d"]);
    expect(edgeIdsToRemove([{ type: "select", id: "x-y", selected: false }])).toEqual([]);
  });
});
