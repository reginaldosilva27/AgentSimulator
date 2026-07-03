// 096-harness-loop-lens — AC7: every lens string ships in both en and pt (no
// language missing). Covers the mode labels, legend, role vocabulary and the
// Loop-lens readout (including the iteration function).

import { describe, expect, it } from "vitest";

import { UI } from "./strings";

const LANGS = ["en", "pt"] as const;
const ROLES = [
  "tools",
  "knowledge",
  "memory",
  "context",
  "permissions",
  "model",
  "orchestration",
  "delivery",
  "observability",
] as const;

describe("lens strings — bilingual parity (AC7)", () => {
  it("has non-empty mode labels in both languages", () => {
    for (const lang of LANGS) {
      for (const m of ["all", "harness", "loop"] as const) {
        expect(UI[lang].lens.mode[m].trim(), `lens.mode.${m} in ${lang}`).toBeTruthy();
      }
    }
  });

  it("has non-empty legend + learn-more in both languages", () => {
    for (const lang of LANGS) {
      expect(UI[lang].lens.legend.harness.trim()).toBeTruthy();
      expect(UI[lang].lens.legend.loop.trim()).toBeTruthy();
      expect(UI[lang].lens.legend.learnMore.trim()).toBeTruthy();
    }
  });

  it("has a non-empty label AND glossary hint for every role in both languages", () => {
    for (const lang of LANGS) {
      for (const role of ROLES) {
        expect(UI[lang].lens.role[role].trim(), `lens.role.${role} in ${lang}`).toBeTruthy();
        expect(UI[lang].lens.roleHint[role].trim(), `lens.roleHint.${role} in ${lang}`).toBeTruthy();
      }
    }
  });

  it("has the nesting strings (core + context chip + legend title) in both languages", () => {
    for (const lang of LANGS) {
      const l = UI[lang].lens;
      for (const s of [l.core, l.coreHint, l.contextChip, l.contextHint, l.roleLegendTitle]) {
        expect(s.trim()).toBeTruthy();
      }
    }
  });

  it("has a non-empty Loop readout (incl. the iteration function) in both languages", () => {
    for (const lang of LANGS) {
      const loop = UI[lang].lens.loop;
      expect(loop.iteration(2, 3)).toContain("2");
      expect(loop.iteration(2, 3)).toContain("3");
      expect(loop.stopFinal.trim()).toBeTruthy();
      expect(loop.stopMax.trim()).toBeTruthy();
      expect(loop.recovery.trim()).toBeTruthy();
      expect(loop.inProgress.trim()).toBeTruthy();
    }
  });
});
