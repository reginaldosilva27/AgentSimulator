// 131-arena-chaos — the chaos panel (AC10 the UI is honest about state, AC14 i18n).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { ChaosPanel } from "./ChaosPanel";
import { FAULT_META } from "./chaos";
import { faultMarkerFor } from "./ArenaNode";
import { useArena } from "./store";

const t = UI.en.arena;

beforeEach(() => {
  localStorage.clear();
  useArena.setState({
    nodes: [],
    edges: [],
    faults: [],
    selectedId: null,
    challengeId: null,
    sandbox: null,
  });
});

afterEach(cleanup);

function withSelectedLlm() {
  const id = useArena.getState().addNode("llm", { x: 0, y: 0 });
  useArena.getState().select(id);
  return id;
}

describe("131 AC10 — the panel is honest about state", () => {
  it("renders the framing and the transience note", () => {
    render(<ChaosPanel />);
    expect(screen.getByText(t.chaos.hint)).toBeTruthy();
    expect(screen.getByText(t.chaos.transient)).toBeTruthy();
    expect(screen.getByText(t.chaos.none)).toBeTruthy();
  });

  it("applies a component fault to the SELECTED box and lists it by name", () => {
    const id = withSelectedLlm();
    render(<ChaosPanel />);

    fireEvent.click(screen.getByLabelText(FAULT_META.instanceDown.label.en));

    const faults = useArena.getState().faults;
    expect(faults).toHaveLength(1);
    expect(faults[0]).toMatchObject({ type: "instanceDown", nodeId: id });
    // The active list names the TARGET, not the raw node id (the catalog entry
    // carries the same label, so scope the query to the active-faults list item).
    expect(screen.getByLabelText(`${t.chaos.remove} ${faults[0].id}`)).toBeTruthy();
    const entry = screen.getByLabelText(`${t.chaos.remove} ${faults[0].id}`).closest("li")!;
    expect(entry.textContent).toContain(FAULT_META.instanceDown.label.en);
    expect(entry.textContent).toContain("LLM"); // the KIND label, not "llm-1"
  });

  it("disables component faults with nothing selected", () => {
    render(<ChaosPanel />);
    const btn = screen.getByLabelText(FAULT_META.instanceDown.label.en) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe(t.chaos.selectFirst);
  });

  it("only offers a cache flush on a cache-like box", () => {
    withSelectedLlm();
    render(<ChaosPanel />);
    expect((screen.getByLabelText(FAULT_META.cacheFlush.label.en) as HTMLButtonElement).disabled).toBe(
      true,
    );
    cleanup();

    const cache = useArena.getState().addNode("cache", { x: 200, y: 0 });
    useArena.getState().select(cache);
    render(<ChaosPanel />);
    expect((screen.getByLabelText(FAULT_META.cacheFlush.label.en) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("removes one fault and clears them all", () => {
    const id = withSelectedLlm();
    useArena.getState().applyFault({ type: "instanceDown", nodeId: id });
    useArena.getState().applyFault({ type: "latencySpike", nodeId: id, magnitude: 5 });
    render(<ChaosPanel />);

    const first = useArena.getState().faults[0];
    fireEvent.click(screen.getByLabelText(`${t.chaos.remove} ${first.id}`));
    expect(useArena.getState().faults).toHaveLength(1);

    fireEvent.click(screen.getByText(t.chaos.clearAll));
    expect(useArena.getState().faults).toEqual([]);
    expect(screen.getByText(t.chaos.none)).toBeTruthy();
  });

  it("applies a REGIONAL fault without needing a selection", () => {
    render(<ChaosPanel />);
    fireEvent.click(screen.getByLabelText(FAULT_META.regionOutage.label.en));
    expect(useArena.getState().faults[0]).toMatchObject({ type: "regionOutage" });
    expect(useArena.getState().faults[0].region).toBeTruthy();
  });

  it("locks a challenge's given faults instead of offering a remove button", () => {
    useArena.getState().enterChallenge("survive-the-outage");
    render(<ChaosPanel />);

    const given = useArena.getState().faults[0];
    expect(given.id.startsWith("given-")).toBe(true);
    expect(screen.queryByLabelText(`${t.chaos.remove} ${given.id}`)).toBeNull();
    expect(screen.getByTitle(t.chaos.locked)).toBeTruthy();
  });
});

describe("131 — the node marker (pure, jsdom-safe)", () => {
  it("shows ⚡ for a faulted box, ⛔ for a starved one, nothing otherwise", () => {
    expect(faultMarkerFor({ faulted: true })).toBe("⚡");
    expect(faultMarkerFor({ starvedBy: "Backend" })).toBe("⛔");
    expect(faultMarkerFor({})).toBeNull();
    // A faulted box takes precedence: it is the actual failure.
    expect(faultMarkerFor({ faulted: true, starvedBy: "Backend" })).toBe("⚡");
  });
});
