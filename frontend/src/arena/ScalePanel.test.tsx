// 104-arena-scaling-vocabulary — the scale panel speaks each component's real
// scaling language (AC2), explains itself via the info toggle (AC3), hides the
// knobs on the non-scalable client (AC4) and hints the capacity formula (AC5).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { EdgePanel, ScalePanel } from "./ArenaCanvas";
import { KIND_META } from "./components";
import { NOTE_MAX, useArena } from "./store";

beforeEach(() => {
  localStorage.clear();
  useArena.setState({
    nodes: [
      { id: "llm-1", kind: "llm", size: "medium", replicas: 1, x: 0, y: 0 },
      { id: "client-1", kind: "client", size: "medium", replicas: 1, x: 0, y: 100 },
      // 105 — a backend holding 20 LLM deployment endpoints directly (taxed).
      // 116 — llm-2 gets its own region so its pool (medium ×20 = 3,000 = the
      // quota, exactly) is not squeezed by sharing the implicit pool with llm-1.
      { id: "be-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 200 },
      { id: "llm-2", kind: "llm", size: "medium", replicas: 20, region: "us-west", x: 100, y: 200 },
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

  it("shows the held in-flight figure with its explainer (113 AC3, 118 budget hint)", () => {
    render(<ScalePanel id="be-1" />);
    // 118 — budgeted kinds append the stream-budget explainer to the title.
    const row = screen.getByTitle(UI.en.arena.inflightInfo, { exact: false });
    expect(row.title).toContain(UI.en.arena.inflightBudgetHint);
    expect(row.textContent).toMatch(/\d/); // healthy path → a real number
    expect(row.textContent).toContain("/"); // held / budget (118 AC4)
  });

  it("shows — for in-flight when the awaited path is saturated (113 AC2)", () => {
    // 1000 rps straight into a single medium deployment (cap 150) — it sheds.
    useArena.setState({
      nodes: [
        { id: "client-1", kind: "client", size: "medium", replicas: 1, x: 0, y: 0 },
        { id: "llm-1", kind: "llm", size: "medium", replicas: 1, x: 100, y: 0 },
      ],
      edges: [{ id: "client-1-llm-1", source: "client-1", target: "llm-1" }],
      offeredLoad: 1000,
    });
    render(<ScalePanel id="llm-1" />);
    const row = screen.getByTitle(UI.en.arena.inflightInfo);
    expect(row.textContent).toContain("—");
  });

  it("shows the quota-limited note on an over-quota regional pool (114 AC4)", () => {
    // Two large ×20 pools (raw 12,000 calls/s) stacked in us-east — over the quota.
    useArena.setState({
      nodes: [
        { id: "gw", kind: "aiGateway", size: "medium", replicas: 1, x: 0, y: 0 },
        { id: "llm-a", kind: "llm", size: "large", replicas: 20, region: "us-east", x: 100, y: 0 },
        { id: "llm-b", kind: "llm", size: "large", replicas: 20, region: "us-east", x: 100, y: 100 },
      ],
      edges: [
        { id: "gw-llm-a", source: "gw", target: "llm-a" },
        { id: "gw-llm-b", source: "gw", target: "llm-b" },
      ],
    });
    render(<ScalePanel id="llm-a" />);
    expect(screen.getByText(UI.en.arena.quotaLimited("us-east"))).toBeTruthy();
  });

  it("shows no quota note on a pool under its regional quota (114 AC4)", () => {
    render(<ScalePanel id="llm-2" />); // medium ×20 = 3,000 — at, not over, the quota
    expect(screen.queryByTitle(UI.en.arena.quotaHint)).toBeNull();
  });

  it("hints the escape hatch when the units slider sits at its ceiling (115 AC4)", () => {
    render(<ScalePanel id="llm-2" />); // ×20 — the slider max
    expect(screen.getByText(UI.en.arena.replicasCeilingHint)).toBeTruthy();
  });

  it("shows no ceiling hint below the max (115 AC4)", () => {
    render(<ScalePanel id="llm-1" />); // ×1
    expect(screen.queryByText(UI.en.arena.replicasCeilingHint)).toBeNull();
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

// --- 120-arena-annotations ---------------------------------------------------------

describe("node/edge note fields (120)", () => {
  it("renders a note field on a selected node and commits typed text on blur (AC1)", () => {
    render(<ScalePanel id="llm-1" />);
    const ta = screen.getByLabelText(UI.en.arena.noteLabel);
    fireEvent.change(ta, { target: { value: "2 calls/turn vs 150 quota — the wall" } });
    fireEvent.blur(ta);
    expect(useArena.getState().nodes.find((n) => n.id === "llm-1")!.note).toBe(
      "2 calls/turn vs 150 quota — the wall",
    );
  });

  it("seeds the field from an existing note and shows the character counter", () => {
    useArena.getState().setNodeNote("llm-1", "hi");
    render(<ScalePanel id="llm-1" />);
    expect((screen.getByLabelText(UI.en.arena.noteLabel) as HTMLTextAreaElement).value).toBe("hi");
    expect(screen.getByText(UI.en.arena.noteCounter(2))).toBeTruthy();
  });

  it("caps the textarea at NOTE_MAX characters (AC6)", () => {
    render(<ScalePanel id="llm-1" />);
    expect((screen.getByLabelText(UI.en.arena.noteLabel) as HTMLTextAreaElement).maxLength).toBe(
      NOTE_MAX,
    );
  });

  it("offers the note field even on the client — any node is annotatable", () => {
    render(<ScalePanel id="client-1" />);
    expect(screen.getByLabelText(UI.en.arena.noteLabel)).toBeTruthy();
  });

  it("renders the connection panel with a note field for a selected edge (AC2)", () => {
    render(<EdgePanel id="be-1-llm-2" />);
    expect(screen.getByText(UI.en.arena.edgePanelTitle)).toBeTruthy();
    const ta = screen.getByLabelText(UI.en.arena.noteLabel);
    fireEvent.change(ta, { target: { value: "fallback pool in us-west" } });
    fireEvent.blur(ta);
    expect(useArena.getState().edges.find((e) => e.id === "be-1-llm-2")!.note).toBe(
      "fallback pool in us-west",
    );
  });
});

// --- 121-arena-learn-links --------------------------------------------------------

import { allTopicsFor } from "../learn/content";
import { learnTopicsFor } from "./learnLinks";
import { useLearnTarget } from "../lib/learnTarget";

describe("121 — the ℹ️ explainer's Learn-more links", () => {
  it("renders titled Learn links for a mapped kind, after opening the explainer (AC2)", () => {
    render(<ScalePanel id="llm-1" />);
    // hidden until the ℹ️ toggle is opened
    expect(screen.queryByText(UI.en.arena.learnMore)).toBeNull();
    fireEvent.click(screen.getByLabelText(UI.en.arena.infoLabel));
    expect(screen.getByText(UI.en.arena.learnMore)).toBeTruthy();
    // each mapped topic's TITLE renders as a link
    const topics = allTopicsFor("en");
    for (const id of learnTopicsFor("llm")) {
      expect(screen.getByText(topics[id].topic.title), `link "${id}"`).toBeTruthy();
    }
  });

  it("clicking a Learn link requests that topic (AC4 half — the intent)", () => {
    useLearnTarget.setState({ pendingTopic: null });
    render(<ScalePanel id="llm-1" />);
    fireEvent.click(screen.getByLabelText(UI.en.arena.infoLabel));
    const first = learnTopicsFor("llm")[0];
    const title = allTopicsFor("en")[first].topic.title;
    fireEvent.click(screen.getByText(title));
    expect(useLearnTarget.getState().pendingTopic).toBe(first);
  });

  it("renders NO Learn-more row for an unmapped kind (CDN) — no empty shell (AC3)", () => {
    useArena.setState({
      nodes: [{ id: "cdn-1", kind: "cdn", size: "medium", replicas: 1, x: 0, y: 0 }],
      edges: [],
    });
    render(<ScalePanel id="cdn-1" />);
    fireEvent.click(screen.getByLabelText(UI.en.arena.infoLabel));
    expect(screen.queryByText(UI.en.arena.learnMore)).toBeNull();
    expect(learnTopicsFor("cdn")).toEqual([]);
  });
});
