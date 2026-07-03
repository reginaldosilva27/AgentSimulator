// 096-harness-loop-lens — AC3: the harness-role map is TOTAL over every StationId
// (no station unclassified, no stale key), and every role has a badge label in both
// languages (AC4/AC7 support: the Harness lens can label every station it shows).

import { describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { HARNESS_ROLE, HARNESS_ROLE_COLOR, HARNESS_ROLES, type HarnessRole } from "./harness";
import { STATION_IDS } from "./stations";

describe("harness roles — total classification (AC3)", () => {
  it("every station has exactly one harness role", () => {
    for (const id of STATION_IDS) {
      expect(HARNESS_ROLE[id], `station "${id}" has no harness role`).toBeTruthy();
    }
  });

  it("has no role key that isn't a real station", () => {
    const stationSet = new Set<string>(STATION_IDS);
    for (const key of Object.keys(HARNESS_ROLE)) {
      expect(stationSet.has(key), `stale HARNESS_ROLE key "${key}"`).toBe(true);
    }
    expect(Object.keys(HARNESS_ROLE).length).toBe(STATION_IDS.length);
  });
});

describe("harness roles — every role has a bilingual badge label + hint (AC4/AC7)", () => {
  it("t.lens.role[role] and roleHint[role] are non-empty in en and pt for every role used", () => {
    const usedRoles = new Set<HarnessRole>(Object.values(HARNESS_ROLE));
    for (const role of usedRoles) {
      for (const lang of ["en", "pt"] as const) {
        const label = UI[lang].lens.role[role];
        const hint = UI[lang].lens.roleHint[role];
        expect(typeof label, `missing lens.role.${role} in ${lang}`).toBe("string");
        expect(label.trim()).toBeTruthy();
        expect(hint?.trim(), `missing lens.roleHint.${role} in ${lang}`).toBeTruthy();
      }
    }
  });
});

describe("harness role colors — the parts-map palette (v2)", () => {
  it("gives every role a distinct-ish color, total over HarnessRole", () => {
    for (const role of HARNESS_ROLES) {
      expect(HARNESS_ROLE_COLOR[role], `no color for role ${role}`).toMatch(/^var\(--color-/);
    }
    expect(HARNESS_ROLES.length).toBe(9);
    // colors are reasonably distinct (no more than a couple share a var)
    expect(new Set(Object.values(HARNESS_ROLE_COLOR)).size).toBeGreaterThanOrEqual(8);
  });
});
