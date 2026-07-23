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

describe("wiring gesture hints (107 AC5)", () => {
  it("teaches auto-wire and edge deletion in the palette footer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(UI.en.arena.nav, "i") }));
    expect(screen.getByText(UI.en.arena.autoWireHint)).toBeTruthy();
    expect(screen.getByText(UI.en.arena.edgeHint)).toBeTruthy();
  });
});
