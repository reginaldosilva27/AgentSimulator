// 126-arena-palette-groups — the palette renders titled groups (AC2) and a search
// field narrows the list, with a bilingual empty state and restore-on-clear (AC3).

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { useLang } from "../i18n";
import { PALETTE_GROUPS } from "./components";
import { ARENA_DND_MIME, Palette } from "./Palette";

afterEach(() => {
  cleanup();
  useLang.setState({ lang: "en" });
});

describe("126 — grouped palette rendering (AC2)", () => {
  it("renders each group's title (active language), in catalog order", () => {
    render(<Palette />);
    // Group titles are <h3> headings — query by role so the "Client" group title
    // doesn't collide with the "Client" kind label (both read "Client").
    const rendered = PALETTE_GROUPS.map((g) =>
      screen.getByRole("heading", { name: g.title.en }),
    );
    for (let i = 1; i < rendered.length; i++) {
      expect(
        rendered[i - 1].compareDocumentPosition(rendered[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("renders group titles in Portuguese when the language flips", () => {
    useLang.setState({ lang: "pt" });
    render(<Palette />);
    for (const g of PALETTE_GROUPS) {
      expect(screen.getByRole("heading", { name: g.title.pt })).toBeTruthy();
    }
  });
});

describe("126 — palette search (AC3)", () => {
  it("narrows to matching kinds and hides non-matching groups", () => {
    render(<Palette />);
    const box = screen.getByPlaceholderText(UI.en.arena.searchPlaceholder);
    fireEvent.change(box, { target: { value: "cache" } });
    // the cache kinds survive
    expect(screen.getByText(UI.en.arena.paletteTitle)).toBeTruthy(); // header stays
    expect(screen.queryByText("Cache")).toBeTruthy();
    expect(screen.queryByText("Semantic Cache")).toBeTruthy();
    // an unrelated kind is gone
    expect(screen.queryByText("Client")).toBeNull();
  });

  it("shows a bilingual empty state when nothing matches, and restores on clear", () => {
    render(<Palette />);
    const box = screen.getByPlaceholderText(UI.en.arena.searchPlaceholder);
    fireEvent.change(box, { target: { value: "zzzznotathing" } });
    expect(screen.getByText(UI.en.arena.searchEmpty)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Client" })).toBeNull();
    // clearing restores the full palette
    fireEvent.change(box, { target: { value: "" } });
    expect(screen.getByRole("heading", { name: "Client" })).toBeTruthy();
    expect(screen.queryByText(UI.en.arena.searchEmpty)).toBeNull();
  });

  it("a filtered item still carries its kind on drag (add-to-canvas contract, AC4)", () => {
    render(<Palette />);
    const box = screen.getByPlaceholderText(UI.en.arena.searchPlaceholder);
    fireEvent.change(box, { target: { value: "cache" } });
    const item = screen.getByText("Semantic Cache").closest("[draggable]")!;
    // The canvas adds the node from the kind travelling in dataTransfer, so the
    // palette's contract is: dragging a (filtered) item sets that kind.
    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: (type: string, val: string) => {
        store[type] = val;
      },
      effectAllowed: "",
    };
    fireEvent.dragStart(item, { dataTransfer });
    expect(store[ARENA_DND_MIME]).toBe("semanticCache");
  });
});
