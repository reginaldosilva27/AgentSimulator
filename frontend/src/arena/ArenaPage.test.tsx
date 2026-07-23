// 100-arena-capacity-sandbox — AC8 (Arena is a separate page; opening it does not
// mount the Simulator canvas) + AC10 (the honesty banner is always present).
//
// The Simulator + Arena canvases are real React Flow instances that jsdom can't
// measure, so we stub the leaf panels (as App.mobile.test does) and stub the
// Arena's own canvas — the units under test are the App routing decision and the
// ArenaPage chrome (palette, load control, honesty banner), not React Flow.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ArenaCanvas", () => ({ ArenaCanvas: () => <div>ARENA-CANVAS</div> }));
vi.mock("../components/ChatPanel", () => ({ ChatPanel: () => <div>CHAT</div> }));
vi.mock("../components/FlowCanvas", () => ({ FlowCanvas: () => <div>SIM-CANVAS</div> }));
vi.mock("../components/InspectorPanel", () => ({ InspectorPanel: () => <div>INSPECTOR</div> }));
vi.mock("../components/Timeline", () => ({ Timeline: () => <div>TIMELINE</div> }));
vi.mock("../components/TourCaption", () => ({ TourCaption: () => <div>TOUR</div> }));
vi.mock("../components/AgentDetail", () => ({ AgentDetail: () => <div>AGENT-DETAIL</div> }));
vi.mock("../components/RagPipelinePanel", () => ({ RagPipelinePanel: () => <div>RAG</div> }));
vi.mock("../components/PageIndexPipelinePanel", () => ({
  PageIndexPipelinePanel: () => <div>PAGEINDEX</div>,
}));
vi.mock("../components/AgentAnatomyDialog", () => ({ AgentAnatomyDialog: () => <div>ANATOMY</div> }));
vi.mock("../components/AgentConfigToggle", () => ({ AgentConfigToggle: () => <div>AGENT-CFG</div> }));
vi.mock("../components/CloudToggle", () => ({ CloudToggle: () => <div>CLOUD</div> }));
vi.mock("../components/ConfigToggle", () => ({ ConfigToggle: () => <div>CONFIG</div> }));
vi.mock("../components/DemoBanner", () => ({ DemoBanner: () => <div>BANNER</div> }));
vi.mock("../components/LanguageToggle", () => ({ LanguageToggle: () => <div>LANG</div> }));
vi.mock("../components/LensToggle", () => ({ LensToggle: () => <div>LENS</div> }));
vi.mock("../components/LensOverlay", () => ({ LensOverlay: () => <div>LENS-OVERLAY</div> }));
vi.mock("../components/ScenarioBuilder", () => ({ ScenarioBuilder: () => <div>BUILDER</div> }));
vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => <div>THEME</div> }));
vi.mock("../learn/LearnPage", () => ({ LearnPage: () => <div>LEARN-PAGE</div> }));
vi.mock("../settings/SettingsPage", () => ({ SettingsPage: () => <div>SETTINGS-PAGE</div> }));
vi.mock("../lib/health", () => ({
  healthBanner: () => null,
  useHealth: (sel: (s: unknown) => unknown) =>
    sel({ status: "idle", llmModel: null, hasKey: false, load: () => {} }),
}));
vi.mock("../lib/onboarding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/onboarding")>()),
  shouldAutoOnboard: () => false,
}));

import App from "../App";
import { UI } from "../i18n/strings";
import { useArena, type ArenaNode } from "./store";

const anode = (id: string, kind: ArenaNode["kind"], x = 0, y = 0): ArenaNode => ({
  id,
  kind,
  size: "medium",
  replicas: 1,
  x,
  y,
});

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "(max-width: 767px)",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  );
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Arena is a separate page (AC8)", () => {
  it("opens the Arena from the header and does not mount the Simulator canvas", () => {
    render(<App />);
    // Simulator canvas is present on the default page.
    expect(screen.queryByText("SIM-CANVAS")).not.toBeNull();

    const arenaBtn = screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") });
    fireEvent.click(arenaBtn);

    // Now the Arena is mounted and the Simulator canvas is gone.
    expect(screen.queryByText("ARENA-CANVAS")).not.toBeNull();
    expect(screen.queryByText("SIM-CANVAS")).toBeNull();
    expect(screen.queryByText("LEARN-PAGE")).toBeNull();
  });
});

describe("Arena honesty banner (AC10)", () => {
  it("always renders the analytical-model disclaimer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    // The banner text states it's a model, not a live load test.
    expect(screen.getByText(UI.en.arena.honesty)).toBeTruthy();
  });
});

describe("saturation honesty in the control bar (108 AC1/AC2/AC4)", () => {
  it("replaces the latency readout with the shed notice on the first-visit sample (saturated)", () => {
    // The default sample (simple-rag) saturates the LLM — the header must tell
    // the shed story, never the 0.99-clamped fictional latency (e.g. "80s").
    useArena.getState().loadExample("simple-rag");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.getByText(/Saturated — shedding/)).toBeTruthy();
    // The latency readout (identified by its hint tooltip) is not rendered.
    expect(screen.queryByTitle(UI.en.arena.e2eLatencyHint)).toBeNull();
  });

  it("shows the latency readout (and no notice) for a healthy design", () => {
    useArena.getState().loadDesign({
      nodes: [anode("client", "client"), anode("be", "backend", 200)],
      edges: [{ id: "client-be", source: "client", target: "be" }],
      users: 3_000,
      thinkTimeSec: 30, // 100 req/s → backend at 2% — healthy
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.queryByText(/Saturated — shedding/)).toBeNull();
    expect(screen.queryByTitle(UI.en.arena.e2eLatencyHint)).not.toBeNull();
  });
});

describe("closed-loop dual readout (110 AC4)", () => {
  it("shows demanded → effective when the closed loop throttles by more than 5%", () => {
    // scale-llm: demand 300 req/s, but ~4s of model latency per turn self-throttles
    // the closed population well below that.
    useArena.getState().loadExample("scale-llm");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.getByText(/req\/s effective/)).toBeTruthy();
  });

  it("collapses to a single figure when demand ≈ effective", () => {
    useArena.getState().loadDesign({
      nodes: [anode("client", "client"), anode("be", "backend", 200)],
      edges: [{ id: "client-be", source: "client", target: "be" }],
      users: 3_000,
      thinkTimeSec: 30, // 100 req/s over a 20ms backend — gap ≈ 0
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.queryByText(/req\/s effective/)).toBeNull();
  });
});

describe("provisioned + usage LLM cost (111 AC3)", () => {
  it("shows both bills when a fleet is provisioned and traffic flows", () => {
    useArena.getState().loadDesign({
      nodes: [anode("client", "client"), anode("be", "backend", 200), anode("llm", "llm", 400)],
      edges: [
        { id: "client-be", source: "client", target: "be" },
        { id: "be-llm", source: "be", target: "llm" },
      ],
      users: 400,
      thinkTimeSec: 20, // 20 req/s over one medium deployment (cap 50) — served, billed
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.getByText(/\/h provisioned/)).toBeTruthy();
    expect(screen.getByText(/\/h usage/)).toBeTruthy();
  });
});

describe("wiring gesture hints (107 AC5)", () => {
  it("teaches auto-wire and edge deletion in the palette footer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    expect(screen.getByText(UI.en.arena.autoWireHint)).toBeTruthy();
    expect(screen.getByText(UI.en.arena.edgeHint)).toBeTruthy();
  });
});
