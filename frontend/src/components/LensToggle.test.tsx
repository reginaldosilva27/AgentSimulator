// 096-harness-loop-lens — the lens toggle renders the three modes and drives the
// lens store (AC1 default `all`; clicking a mode selects it).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LensToggle } from "./LensToggle";
import { useLens } from "../lib/lens";

beforeEach(() => {
  useLens.getState().setMode("all");
});

afterEach(() => {
  cleanup();
  useLens.getState().setMode("all");
});

describe("LensToggle", () => {
  it("renders All · Harness · Loop, with All pressed by default (AC1)", () => {
    render(<LensToggle />);
    const all = screen.getByRole("button", { name: "All" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Harness" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Loop" })).toBeTruthy();
  });

  it("clicking Harness / Loop selects that lens", () => {
    render(<LensToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Harness" }));
    expect(useLens.getState().mode).toBe("harness");
    fireEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(useLens.getState().mode).toBe("loop");
  });
});
