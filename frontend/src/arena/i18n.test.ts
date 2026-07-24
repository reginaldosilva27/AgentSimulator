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

  it("has the saturation-notice builder in both languages (108 AC5)", () => {
    expect(en.saturatedHeader("115")).toContain("115");
    expect(pt.saturatedHeader("115")).toContain("115");
    expect(en.saturatedHeader("115")).toMatch(/429/);
    expect(pt.saturatedHeader("115")).toMatch(/429/);
    expect(en.saturatedHint.trim()).toBeTruthy();
    expect(pt.saturatedHint.trim()).toBeTruthy();
  });

  it("teaches think-time ranges and the fan-out nudge in both languages (115 AC3/AC6)", () => {
    expect(en.thinkTimeHint).toMatch(/30–120|30-120/);
    expect(pt.thinkTimeHint).toMatch(/30–120|30-120/);
    expect(en.fanoutNudge.trim()).toBeTruthy();
    expect(pt.fanoutNudge.trim()).toBeTruthy();
    expect(en.replicasCeilingHint.trim()).toBeTruthy();
    expect(pt.replicasCeilingHint.trim()).toBeTruthy();
  });

  it("has the load readout + shedding builders in both languages (103)", () => {
    expect(en.usersReadout("100,000", "1,667")).toContain("100,000");
    expect(pt.usersReadout("100.000", "1.667")).toContain("100.000");
    expect(en.shedding("250")).toContain("250");
    expect(pt.shedding("250")).toContain("250");
    expect(en.shedding("250")).toMatch(/429/);
    expect(pt.shedding("250")).toMatch(/429/);
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

describe("scaling vocabulary + info explainers (104 AC1/AC6)", () => {
  it("gives every kind a bilingual info paragraph", () => {
    for (const kind of PALETTE_ORDER) {
      const meta = KIND_META[kind];
      expect(meta.info.en.trim(), `${kind} info.en`).toBeTruthy();
      expect(meta.info.pt.trim(), `${kind} info.pt`).toBeTruthy();
    }
  });

  it("gives every scalable kind a bilingual unit + size meaning; the non-scalable kinds have none", () => {
    expect(KIND_META.client.scaling).toBeNull(); // the load source has no knobs
    // 123 — the agent harness runs in the backend process: also non-scalable.
    expect(KIND_META.agentHarness.scaling).toBeNull();
    // 125 — the 3rd-party API (provider's quota) and the managed object store are
    // not knobs the designer scales, like the client and the in-process harness.
    const NON_SCALABLE = new Set(["client", "agentHarness", "externalApi", "objectStore"]);
    for (const kind of PALETTE_ORDER) {
      const s = KIND_META[kind].scaling;
      if (NON_SCALABLE.has(kind)) continue;
      expect(s, `${kind} scaling`).not.toBeNull();
      expect(s!.unit.en.trim(), `${kind} unit.en`).toBeTruthy();
      expect(s!.unit.pt.trim(), `${kind} unit.pt`).toBeTruthy();
      expect(s!.sizeMeaning.en.trim(), `${kind} sizeMeaning.en`).toBeTruthy();
      expect(s!.sizeMeaning.pt.trim(), `${kind} sizeMeaning.pt`).toBeTruthy();
    }
  });

  it("labels the LLM's horizontal unit as deployments (not containers)", () => {
    expect(KIND_META.llm.scaling!.unit.en).toMatch(/deployment/i);
    expect(KIND_META.llm.scaling!.unit.pt).toMatch(/deployment/i);
  });
});

describe("123 — agent harness strings (AC3, AC5, §4)", () => {
  it("has a bilingual label, description and non-scalable info explainer", () => {
    const m = KIND_META.agentHarness;
    expect(m.label.en).toBe("Agent Harness");
    expect(m.label.pt.trim()).toBeTruthy();
    expect(m.description.en.trim()).toBeTruthy();
    expect(m.description.pt.trim()).toBeTruthy();
    // AC5 — the info states it runs in the backend and is not scaled on its own.
    expect(m.info.en).toMatch(/in-process|backend/i);
    expect(m.info.pt).toMatch(/in-process|backend/i);
  });

  it("builds the fan-out badge with the call count in both languages (AC3)", () => {
    expect(UI.en.arena.fanoutTurn(2)).toContain("2");
    expect(UI.pt.arena.fanoutTurn(2)).toContain("2");
    expect(UI.en.arena.fanoutTurn(2)).toMatch(/ReAct/);
    expect(UI.pt.arena.fanoutTurn(2)).toMatch(/ReAct/);
  });

  it("fills the cloud map for the new kind (§5)", () => {
    const c = KIND_META.agentHarness.clouds;
    expect(c.azure.trim()).toBeTruthy();
    expect(c.aws.trim()).toBeTruthy();
    expect(c.gcp.trim()).toBeTruthy();
  });
});
