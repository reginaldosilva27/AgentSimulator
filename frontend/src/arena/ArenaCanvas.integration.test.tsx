// 100-arena-capacity-sandbox — end-to-end verification of the REAL ArenaCanvas
// (React Flow) wired to the store + model, which the AC8/AC10 test stubs out.
// Seeds a design in the store and asserts the live node boxes render their
// modeled metrics and that the saturated LLM lights up as the bottleneck.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UI } from "../i18n/strings";
import { ArenaCanvas, edgeIdsToRemove, edgeLabelFor } from "./ArenaCanvas";
import { BENCHMARKS, MODEL_TIER_SKU } from "./components";
import { EXAMPLES } from "./examples";
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

// --- 118-arena-backend-concurrency ------------------------------------------------

describe("backend connection wall (118 AC4)", () => {
  // The review shape: QPS-healthy single backend holding a multi-second turn
  // open for every request — held streams blow past the container budget.
  const wallDesign = () => ({
    nodes: [
      { id: "client-1", kind: "client" as const, size: "medium" as const, replicas: 1, x: 0, y: 0 },
      { id: "backend-1", kind: "backend" as const, size: "medium" as const, replicas: 1, x: 200, y: 0 },
      {
        id: "llm-2",
        kind: "llm" as const,
        size: "xlarge" as const,
        replicas: 10,
        callsPerRequest: 2,
        region: "us-east" as const,
        x: 400,
        y: 0,
      },
    ],
    edges: [
      { id: "client-1-backend-1", source: "client-1", target: "backend-1" },
      { id: "backend-1-llm-2", source: "backend-1", target: "llm-2" },
    ],
    offeredLoad: 1500,
  });

  it("shows the in-flight row vs budget and the connection-wall banner", () => {
    useArena.setState(wallDesign());
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    // The wall banner names the failure mode (not a generic "bottleneck").
    expect(screen.getByText(UI.en.arena.connectionWall)).toBeTruthy();
    // The backend box carries an in-flight readout (held / budget).
    expect(screen.getAllByText(UI.en.arena.metric.inflight).length).toBeGreaterThan(0);
  });

  it("stays silent when the backend is comfortably under its stream budget", () => {
    const light = wallDesign();
    useArena.setState({ ...light, offeredLoad: 100 }); // ~0.2s turn, ~40 held
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    expect(screen.queryByText(UI.en.arena.connectionWall)).toBeNull();
  });
});

// --- 119/122-arena-example-callouts (side-panel list) -------------------------------

describe("example callouts render as a side-panel list (122 AC1–AC4)", () => {
  const sample = () => EXAMPLES.find((e) => e.id === "simple-rag")!;
  const firstCallout = () => sample().callouts[0];

  it("AC1 — lists every callout in one panel, labelled by component, no node bubbles", () => {
    useArena.getState().loadExample("simple-rag");
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    const panel = screen.getByRole("complementary", { name: UI.en.arena.calloutsTitle });
    // Every callout of the preset is listed, each entry naming its component.
    for (const c of sample().callouts) {
      const entry = within(panel).getByText(c.text.en);
      expect(entry).toBeTruthy();
    }
    expect(within(panel).getByText("Client")).toBeTruthy();
    expect(within(panel).getByText("LLM")).toBeTruthy();
    // The texts live ONLY in the panel — no node-anchored bubble remains.
    expect(screen.getAllByText(firstCallout().text.en)).toHaveLength(1);
  });

  it("AC2 — ✕ hides the panel; re-loading a sample shows it again", () => {
    useArena.getState().loadExample("simple-rag");
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByTitle(UI.en.arena.calloutHide));
    expect(screen.queryByText(firstCallout().text.en)).toBeNull();
    act(() => useArena.getState().loadExample("simple-rag"));
    expect(screen.getByText(firstCallout().text.en)).toBeTruthy();
  });

  it("AC3 — a structural edit removes the panel", () => {
    useArena.getState().loadExample("simple-rag");
    useArena.getState().addNode("cache", { x: 900, y: 0 }); // structural edit
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    expect(screen.queryByText(firstCallout().text.en)).toBeNull();
  });

  it("AC4 — hovering an entry highlights the matching canvas node", () => {
    useArena.getState().loadExample("simple-rag");
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    const panel = screen.getByRole("complementary", { name: UI.en.arena.calloutsTitle });
    const entry = within(panel).getByText(firstCallout().text.en).closest("li")!;
    fireEvent.mouseEnter(entry);
    const lit = document.querySelector(`[data-highlighted="${firstCallout().nodeId}"]`);
    expect(lit).toBeTruthy();
    fireEvent.mouseLeave(entry);
    expect(document.querySelector("[data-highlighted]")).toBeNull();
  });
});

// --- 124-arena-auto-arrange ----------------------------------------------------------

describe("auto-arrange button (124 AC4)", () => {
  it("tidies overlapping same-column boxes apart on click", () => {
    // Two LLM pools dropped on top of each other, both fed by one backend.
    useArena.setState({
      nodes: [
        { id: "backend-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0 },
        { id: "llm-2", kind: "llm", size: "medium", replicas: 1, x: 220, y: 10 },
        { id: "llm-3", kind: "llm", size: "medium", replicas: 1, x: 225, y: 20 },
      ],
      edges: [
        { id: "backend-1-llm-2", source: "backend-1", target: "llm-2" },
        { id: "backend-1-llm-3", source: "backend-1", target: "llm-3" },
      ],
      offeredLoad: 100,
      selectedId: null,
      selectedEdgeId: null,
    });
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByTitle(UI.en.arena.autoArrange));

    const nodes = useArena.getState().nodes;
    const [backend, llmA, llmB] = ["backend-1", "llm-2", "llm-3"].map(
      (id) => nodes.find((n) => n.id === id)!,
    );
    // Column by depth: the backend sits left of both pools…
    expect(backend.x).toBeLessThan(llmA.x);
    expect(llmA.x).toBe(llmB.x);
    // …and the pools no longer overlap vertically (default box height ≥ 120).
    expect(Math.abs(llmA.y - llmB.y)).toBeGreaterThanOrEqual(120);
  });

  it("is a no-op on an empty canvas (no crash)", () => {
    useArena.setState({ nodes: [], edges: [], offeredLoad: 100 });
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    fireEvent.click(screen.getByTitle(UI.en.arena.autoArrange));
    expect(useArena.getState().nodes).toEqual([]);
  });
});

// --- 120-arena-annotations ----------------------------------------------------------

describe("annotation markers on the canvas (120 AC3)", () => {
  it("shows a 📝 marker on the annotated node and none on a plain one", () => {
    useArena.setState({
      nodes: [
        { id: "backend-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0, note: "why" },
        { id: "llm-2", kind: "llm", size: "medium", replicas: 1, x: 220, y: 0 },
      ],
      edges: [{ id: "backend-1-llm-2", source: "backend-1", target: "llm-2" }],
      offeredLoad: 100,
      selectedId: null,
      selectedEdgeId: null,
    });
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    // Exactly one node is annotated → exactly one node marker in the DOM.
    expect(screen.getAllByText("📝")).toHaveLength(1);
  });

  it("shows no node marker when nothing is annotated", () => {
    useArena.setState({
      nodes: [{ id: "backend-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0 }],
      edges: [],
      offeredLoad: 100,
      selectedId: null,
      selectedEdgeId: null,
    });
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    expect(screen.queryByText("📝")).toBeNull();
  });

  // React Flow doesn't render edge labels in jsdom (no layout measurement), so
  // the edge marker is verified through its pure projection.
  it("projects a 📝 label onto an annotated edge only (AC3)", () => {
    expect(edgeLabelFor({ note: "fallback pool in us-west" })).toBe("📝");
    expect(edgeLabelFor({})).toBeUndefined();
  });
});

// --- 128-arena-model-tier ------------------------------------------------------------

describe("LLM model-tier control (128 AC6, AC7)", () => {
  const seedHealthy = () =>
    useArena.setState({
      // Low load so the LLM is NOT the bottleneck and shows a real Latency readout.
      nodes: [
        { id: "backend-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0 },
        { id: "llm-2", kind: "llm", size: "medium", replicas: 1, x: 220, y: 0, modelTier: "mini" },
      ],
      edges: [{ id: "backend-1-llm-2", source: "backend-1", target: "llm-2" }],
      offeredLoad: 10,
      selectedId: "llm-2",
      selectedEdgeId: null,
    });

  it("AC6 — renders the Model tier control on an LLM node with all four real SKUs", () => {
    seedHealthy();
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    expect(screen.getByText(UI.en.arena.modelTier)).toBeTruthy();
    for (const sku of Object.values(MODEL_TIER_SKU)) {
      expect(screen.getByTitle(sku)).toBeTruthy();
    }
    // The hint (with the "NOT answer quality" honesty note) is wired as the label title.
    expect(screen.getByTitle(UI.en.arena.modelTierHint)).toBeTruthy();
  });

  it("AC6 — a non-LLM node's panel has no Model tier control", () => {
    seedHealthy();
    useArena.setState({ selectedId: "backend-1" });
    render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    expect(screen.queryByText(UI.en.arena.modelTier)).toBeNull();
  });

  it("AC7 — picking a bigger tier updates the store and the node's live latency readout", () => {
    seedHealthy();
    const { container } = render(
      <ReactFlowProvider>
        <ArenaCanvas />
      </ReactFlowProvider>,
    );
    const box = () => container.querySelector('[data-id="llm-2"]')!.textContent ?? "";
    const before = box();
    fireEvent.click(screen.getByTitle(MODEL_TIER_SKU.large));
    // The wire: store carries the new tier...
    expect(useArena.getState().nodes.find((n) => n.id === "llm-2")!.modelTier).toBe("large");
    // ...and the projection re-renders — a bigger model is slower, so the readout moved.
    expect(box()).not.toBe(before);
  });
});
