// 100-arena-capacity-sandbox — bilingual coverage (AC11).
//
// Every user-facing string the Arena introduces must resolve in both en and pt
// (constitution §4): the page chrome (UI.*.arena) AND the component KIND labels
// (KIND_META, which live localized in arena/components.ts).

import { describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { KIND_META, PALETTE_ORDER } from "./components";

function leafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj)
    .filter(([, v]) => typeof v !== "function")
    .flatMap(([k, v]) =>
      v && typeof v === "object"
        ? leafKeys(v as Record<string, unknown>, `${prefix}${k}.`)
        : [`${prefix}${k}`],
    );
}

describe("arena chrome i18n (AC11)", () => {
  const en = UI.en.arena;
  const pt = UI.pt.arena;

  it("has the same leaf keys in en and pt", () => {
    expect(leafKeys(en).sort()).toEqual(leafKeys(pt).sort());
  });

  it("has a non-empty value for every static key in both languages", () => {
    for (const k of leafKeys(en)) {
      const enVal = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], en);
      const ptVal = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], pt);
      expect(String(enVal).trim(), `en ${k}`).toBeTruthy();
      expect(String(ptVal).trim(), `pt ${k}`).toBeTruthy();
    }
  });

  it("has the offered-load readout builder in both languages", () => {
    expect(en.users(100000)).toContain("100");
    expect(pt.users(100000)).toContain("100");
  });
});

describe("arena component labels i18n (AC11)", () => {
  it("has a non-empty en + pt label and description for every palette kind", () => {
    for (const kind of PALETTE_ORDER) {
      const meta = KIND_META[kind];
      expect(meta.label.en.trim(), `${kind} label.en`).toBeTruthy();
      expect(meta.label.pt.trim(), `${kind} label.pt`).toBeTruthy();
      expect(meta.description.en.trim(), `${kind} description.en`).toBeTruthy();
      expect(meta.description.pt.trim(), `${kind} description.pt`).toBeTruthy();
    }
  });
});
