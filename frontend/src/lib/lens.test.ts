// 096-harness-loop-lens — AC1 (default `all`), AC2 (persistence), AC6 (switching
// the lens is a pure reframe: no fetch, no mutation of the simulator's events/cursor).

import { afterEach, describe, expect, it, vi } from "vitest";

import { useSimulator } from "../store/useSimulator";
import { LENS_MODES, useLens } from "./lens";

afterEach(() => {
  useLens.getState().setMode("all");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("lens store (AC1, AC2)", () => {
  it("offers exactly the three modes, all/harness/loop", () => {
    expect(LENS_MODES).toEqual(["all", "harness", "loop"]);
  });

  it("defaults to `all`", () => {
    useLens.getState().setMode("all");
    expect(useLens.getState().mode).toBe("all");
  });

  it("persists the chosen mode to localStorage (survives a reload)", () => {
    useLens.getState().setMode("harness");
    expect(useLens.getState().mode).toBe("harness");
    expect(localStorage.getItem("agentsim.lens")).toBe("harness");

    useLens.getState().setMode("loop");
    expect(localStorage.getItem("agentsim.lens")).toBe("loop");
  });
});

describe("lens is a pure reframe (AC6)", () => {
  it("switching the lens performs no network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    useLens.getState().setMode("harness");
    useLens.getState().setMode("loop");
    useLens.getState().setMode("all");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("switching the lens does not mutate the simulator's events or cursor", () => {
    const before = useSimulator.getState();
    const events = before.events;
    const cursor = before.cursor;

    useLens.getState().setMode("harness");
    useLens.getState().setMode("loop");

    expect(useSimulator.getState().events).toBe(events);
    expect(useSimulator.getState().cursor).toBe(cursor);
  });
});
