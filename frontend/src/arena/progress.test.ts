// 132-arena-attempts — the pure progress layer (AC1–AC4, AC7–AC9) + the clock guard.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CHALLENGES } from "./challenges";
import { DEFAULT_CALL_SHAPE } from "./components";
import {
  HISTORY_CAP,
  PROGRESS_STORAGE_KEY,
  bestAttempt,
  isDuplicateOf,
  loadProgress,
  pruneHistory,
  recordAttempt,
  sanitizeProgress,
  statusOf,
  summarise,
  type ArenaAttempt,
  type ArenaProgress,
} from "./progress";

const ids = CHALLENGES.map((c) => c.id);
const CH = ids[0];

const attempt = (over: Partial<Omit<ArenaAttempt, "seq">> = {}): Omit<ArenaAttempt, "seq"> => ({
  at: 1_000,
  passed: false,
  results: [{ metric: "latency", target: 30_000, actual: 40_000, met: false }],
  costPerHourUsd: 1_000,
  e2eLatencyMs: 40_000,
  design: { nodes: [], edges: [], callShape: DEFAULT_CALL_SHAPE },
  ...over,
});

describe("132 AC1 — recording an attempt", () => {
  it("appends the verdict, the per-objective results, the snapshot and the faults", () => {
    const p = recordAttempt({}, CH, attempt({ faults: [{ id: "f", type: "instanceDown", nodeId: "llm" }] }));
    const [a] = p[CH].attempts;
    expect(a.seq).toBe(1);
    expect(a.passed).toBe(false);
    expect(a.results).toHaveLength(1);
    expect(a.design).toBeTruthy();
    expect(a.faults).toHaveLength(1);
  });

  it("numbers attempts monotonically per challenge", () => {
    let p: ArenaProgress = {};
    p = recordAttempt(p, CH, attempt());
    p = recordAttempt(p, CH, attempt());
    p = recordAttempt(p, ids[1], attempt());
    expect(p[CH].attempts.map((a) => a.seq)).toEqual([1, 2]);
    expect(p[ids[1]].attempts.map((a) => a.seq)).toEqual([1]); // per challenge
  });
});

describe("132 AC2 — status transitions, and never regressing", () => {
  it("goes untried → attempted → solved and STAYS solved", () => {
    expect(statusOf({}, CH)).toBe("untried");

    let p = recordAttempt({}, CH, attempt({ passed: false }));
    expect(statusOf(p, CH)).toBe("attempted");

    p = recordAttempt(p, CH, attempt({ passed: true }));
    expect(statusOf(p, CH)).toBe("solved");

    // A later failure is a record of a try, not of losing the achievement.
    p = recordAttempt(p, CH, attempt({ passed: false }));
    expect(statusOf(p, CH)).toBe("solved");
  });
});

describe("132 AC3 — the best attempt rule", () => {
  it("picks the cheapest PASSING attempt, ties by latency, then earliest", () => {
    const attempts: ArenaAttempt[] = [
      { ...attempt({ passed: true, costPerHourUsd: 3_000, e2eLatencyMs: 9_000 }), seq: 1 },
      { ...attempt({ passed: true, costPerHourUsd: 2_000, e2eLatencyMs: 8_000 }), seq: 2 },
      { ...attempt({ passed: true, costPerHourUsd: 2_000, e2eLatencyMs: 7_000 }), seq: 3 },
    ];
    expect(bestAttempt(attempts)!.seq).toBe(3); // cheapest, then fastest
  });

  it("NEVER picks a cheaper FAILING attempt — the guard on cost-first", () => {
    // 129 measured that a starved design is the cheapest one. It does not pass, so
    // it must never win here.
    const attempts: ArenaAttempt[] = [
      { ...attempt({ passed: false, costPerHourUsd: 100 }), seq: 1 }, // starved + cheap
      { ...attempt({ passed: true, costPerHourUsd: 9_000 }), seq: 2 },
    ];
    expect(bestAttempt(attempts)!.seq).toBe(2);
  });

  it("has no best when nothing passes", () => {
    expect(bestAttempt([{ ...attempt({ passed: false }), seq: 1 }])).toBeUndefined();
  });
});

describe("132 AC4 — the library summary", () => {
  it("counts solved over the library total", () => {
    let p: ArenaProgress = {};
    expect(summarise(p, ids)).toEqual({ solved: 0, total: ids.length });

    p = recordAttempt(p, ids[0], attempt({ passed: true }));
    p = recordAttempt(p, ids[1], attempt({ passed: false }));
    expect(summarise(p, ids)).toEqual({ solved: 1, total: ids.length });
  });
});

describe("132 AC9 — the history is bounded", () => {
  it("drops the oldest NON-BEST entry and never evicts the best", () => {
    // The best is the very first (cheapest passing); the cap must spare it.
    const attempts: ArenaAttempt[] = Array.from({ length: HISTORY_CAP + 3 }, (_, i) => ({
      ...attempt({ passed: i === 0, costPerHourUsd: i === 0 ? 10 : 5_000 }),
      seq: i + 1,
    }));

    const kept = pruneHistory(attempts);
    expect(kept).toHaveLength(HISTORY_CAP);
    expect(kept.some((a) => a.seq === 1)).toBe(true); // the best survived
    expect(kept.some((a) => a.seq === 2)).toBe(false); // the oldest non-best went
  });

  it("keeps everything below the cap", () => {
    const attempts = [{ ...attempt(), seq: 1 }];
    expect(pruneHistory(attempts)).toEqual(attempts);
  });

  it("applies the cap through recordAttempt", () => {
    let p: ArenaProgress = {};
    for (let i = 0; i < HISTORY_CAP + 5; i++) p = recordAttempt(p, CH, attempt());
    expect(p[CH].attempts).toHaveLength(HISTORY_CAP);
  });
});

describe("132 AC7 — a malformed blob degrades safely", () => {
  it("drops unknown challenge ids", () => {
    const p = sanitizeProgress(
      { challenges: { [CH]: { status: "solved", attempts: [] }, "gone-away": { status: "solved", attempts: [] } } },
      ids,
    );
    expect(Object.keys(p)).toEqual([CH]);
  });

  it("drops malformed attempts but keeps the record", () => {
    const p = sanitizeProgress(
      { challenges: { [CH]: { status: "attempted", attempts: [{ nope: true }, null, 7] } } },
      ids,
    );
    expect(p[CH].attempts).toEqual([]);
    expect(p[CH].status).toBe("attempted");
  });

  it("returns empty progress for junk, without throwing", () => {
    expect(sanitizeProgress(null, ids)).toEqual({});
    expect(sanitizeProgress("nope", ids)).toEqual({});
    expect(sanitizeProgress(42, ids)).toEqual({});
    expect(sanitizeProgress({ challenges: "bad" }, ids)).toEqual({});
  });

  it("loadProgress survives an unparseable blob", () => {
    localStorage.setItem(PROGRESS_STORAGE_KEY, "{not json");
    expect(loadProgress(ids)).toEqual({});
    localStorage.removeItem(PROGRESS_STORAGE_KEY);
  });

  it("an absent key means no progress (never a crash)", () => {
    localStorage.removeItem(PROGRESS_STORAGE_KEY);
    expect(loadProgress(ids)).toEqual({});
  });
});

describe("132 — the duplicate guard", () => {
  it("recognises an identical design + verdict as a near-duplicate", () => {
    const a = attempt();
    const attempts = [{ ...a, seq: 1 }];
    expect(isDuplicateOf(attempts, a)).toBe(true);
    expect(isDuplicateOf(attempts, { ...a, passed: true })).toBe(false);
    expect(isDuplicateOf([], a)).toBe(false);
  });
});

describe("132 AC8 — no wall-clock time in the pure layer", () => {
  it("keeps Date.now / Math.random out of every pure Arena module", () => {
    // The clock enters ONLY at the store boundary (an injectable `clock`). One
    // convenience Date.now() in a pure module would break determinism silently, so
    // this guard belongs in the suite rather than in a review checklist.
    // Match the CALL form only: these modules discuss the rule in their header
    // comments, and a mention is not a use.
    for (const file of ["model.ts", "slo.ts", "challenges.ts", "chaos.ts", "progress.ts"]) {
      // Vitest rewrites import.meta.url, so resolve from the project root
      // (the suite is always run from `frontend/` — the 101 gotcha).
      const src = readFileSync(resolve(process.cwd(), "src/arena", file), "utf8");
      expect(src, `${file} calls Date.now()`).not.toMatch(/Date\.now\s*\(/);
      expect(src, `${file} calls Math.random()`).not.toMatch(/Math\.random\s*\(/);
      expect(src, `${file} calls new Date()`).not.toMatch(/new Date\s*\(/);
    }
  });
});
