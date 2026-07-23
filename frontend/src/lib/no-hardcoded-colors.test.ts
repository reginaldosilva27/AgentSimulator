// AC7 — no hardcoded color values remain on themed surfaces: every color must
// resolve from a theme token (var(--color-*)), so switching theme leaves no
// surface stuck in the other theme's colors. This guard greps the themed
// surface set for hex literals and fails if any remain.
//
// Allowlist: the token *definitions* live in src/index.css — that is the one
// place raw hex is expected, so it is excluded from the scan.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Files/dirs that are pure projection of the visual model and must be themed.
const SCAN_ROOTS = ["src/components", "src/learn", "src/arena", "src/App.tsx", "src/lib/stations.ts"];

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function filesUnder(path: string): string[] {
  let st;
  try {
    st = statSync(path);
  } catch {
    return [];
  }
  if (st.isFile()) return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  return readdirSync(path).flatMap((entry: string) => filesUnder(join(path, entry)));
}

describe("no hardcoded colors on themed surfaces (AC7)", () => {
  it("every color resolves from a var(--color-*) token", () => {
    const root = process.cwd();
    const offenders: string[] = [];

    for (const r of SCAN_ROOTS) {
      for (const file of filesUnder(resolve(root, r))) {
        if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line: string, i: number) => {
          const matches = line.match(HEX);
          if (matches) {
            offenders.push(`${file.replace(root + "/", "")}:${i + 1}  ${matches.join(" ")}`);
          }
        });
      }
    }

    expect(offenders, `hardcoded hex colors found:\n${offenders.join("\n")}`).toEqual([]);
  });
});
