// 100-arena-capacity-sandbox — AC8 (Arena is a separate page; opening it does not
// mount the Simulator canvas) + AC10 (the honesty banner is always present).
//
// The Simulator + Arena canvases are real React Flow instances that jsdom can't
// measure, so we stub the leaf panels (as App.mobile.test does) and stub the
// Arena's own canvas — the units under test are the App routing decision and the
// ArenaPage chrome (palette, load control, honesty banner), not React Flow.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("shows the shed notice (not a latency) when a design actually sheds at its load", () => {
    // 108's rule stands: past capacity a real API sheds 429s and a queue-latency
    // figure would be fiction, so the header tells the shed story. 127 — a single
    // tiny deployment under a huge closed population still overwhelms even the
    // self-throttled rate, so it sheds at equilibrium.
    useArena.getState().loadDesign({
      nodes: [anode("client", "client"), anode("be", "backend", 200), anode("llm", "llm", 400)],
      edges: [
        { id: "client-be", source: "client", target: "be" },
        { id: "be-llm", source: "be", target: "llm" },
      ],
      users: 100_000,
      thinkTimeSec: 5,
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.getByText(/Saturated — shedding/)).toBeTruthy();
    // The latency readout (identified by its hint tooltip) is not rendered.
    expect(screen.queryByTitle(UI.en.arena.e2eLatencyHint)).toBeNull();
  });

  it("the first-visit sample self-throttles instead of shedding — shows its honest latency (127)", () => {
    // 127 — with realistic ~4.5s model calls a closed population self-throttles a
    // single-LLM design to ~96% util WITHOUT shedding (users wait rather than get
    // dropped), so the header shows the (large, honest) end-to-end latency, not a
    // shed notice. The near-saturation cost is legible as a big latency number.
    useArena.getState().loadExample("simple-rag");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.queryByText(/Saturated — shedding/)).toBeNull();
    expect(screen.queryByTitle(UI.en.arena.e2eLatencyHint)).not.toBeNull();
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
      thinkTimeSec: 20, // 20 req/s over one medium deployment (cap 150) — served, billed
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));

    expect(screen.getByText(/\/h provisioned/)).toBeTruthy();
    expect(screen.getByText(/\/h usage/)).toBeTruthy();
  });
});

describe("wiring gesture hints (107 AC5, connect gesture manual since 116)", () => {
  it("teaches manual connection and edge deletion in the palette footer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    expect(screen.getByText(UI.en.arena.connectHint)).toBeTruthy();
    expect(screen.getByText(UI.en.arena.edgeHint)).toBeTruthy();
  });
});

describe("think-time selector clarity (116 AC2)", () => {
  it('spells out "1 msg every Ns" instead of the cryptic 1/Ns', () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    const select = screen.getByRole("combobox", { name: UI.en.arena.thinkTime });
    const labels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
    expect(labels).toContain(UI.en.arena.thinkTimeOption(20)); // "1 msg every 20s"
    expect(labels.some((l) => /^1\/\d+s$/.test(l ?? ""))).toBe(false);
  });
});

describe("the workload payload control (117 AC6)", () => {
  it("shows the current call shape and edits it through the popover sliders", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    // The control reads the current shape (default 2000 in / 500 out).
    const toggle = screen.getByRole("button", { name: UI.en.arena.payload });
    expect(toggle.textContent).toContain("2,000");
    expect(toggle.textContent).toContain("500");
    fireEvent.click(toggle);
    // The panel explains why tokens move capacity/latency/cost together…
    expect(screen.getByText(UI.en.arena.payloadHint)).toBeTruthy();
    // …and editing the input slider updates the store.
    const input = screen.getByRole("slider", { name: UI.en.arena.payloadInput });
    fireEvent.change(input, { target: { value: "8000" } });
    expect(useArena.getState().callShape.inputTokens).toBe(8000);
  });
});

// --- 121-arena-learn-links --------------------------------------------------------

import { ConceptChips } from "./ArenaPage";
import { allTopicsFor } from "../learn/content";
import { useLearnTarget } from "../lib/learnTarget";

describe("121 — preset concept chips (AC6)", () => {
  beforeEach(() => useLearnTarget.setState({ pendingTopic: null }));

  it("renders the loaded preset's concept chips with topic titles", () => {
    // regional-quota declares concepts ["token-cost", "llm-gateway"].
    render(<ConceptChips exampleId="regional-quota" />);
    expect(screen.getByText(UI.en.arena.concepts)).toBeTruthy();
    const topics = allTopicsFor("en");
    expect(screen.getByText(topics["token-cost"].topic.title)).toBeTruthy();
    expect(screen.getByText(topics["llm-gateway"].topic.title)).toBeTruthy();
  });

  it("clicking a chip requests that Learn topic", () => {
    render(<ConceptChips exampleId="regional-quota" />);
    fireEvent.click(screen.getByText(allTopicsFor("en")["token-cost"].topic.title));
    expect(useLearnTarget.getState().pendingTopic).toBe("token-cost");
  });

  it("renders nothing when no preset is loaded or it has no concepts", () => {
    const { container } = render(<ConceptChips exampleId={null} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    // simple-rag declares no concepts
    const { container: c2 } = render(<ConceptChips exampleId="simple-rag" />);
    expect(c2.firstChild).toBeNull();
  });
});

describe("121 — requesting a topic navigates to Learn (AC4 navigate)", () => {
  beforeEach(() => useLearnTarget.setState({ pendingTopic: null }));

  it("flips the app to the Learn page when a topic is requested from the Arena", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    // on the Arena page (its stub renders) — not Learn yet
    expect(screen.queryByText("LEARN-PAGE")).toBeNull();
    act(() => {
      useLearnTarget.getState().requestTopic("tokens");
    });
    expect(screen.getByText("LEARN-PAGE")).toBeTruthy();
  });
});
