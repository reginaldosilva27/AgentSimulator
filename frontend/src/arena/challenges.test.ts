// 130-arena-challenges — the library-walking guarantees.
//
// These are the load-bearing tests of the whole spec, and they are written to run
// over EVERY challenge, so the library polices itself:
//
//  AC2  every reference solution MEETS its objectives …
//  AC15 … with at least MIN_MARGIN slack, and every starting design MISSES one by
//       at least that much — no knife-edge challenges. (Measurement caught
//       challenge 4 sitting on a 2.5 s margin: `regional-quota` reaches 19.6 s and
//       `multi-region` 14.8 s, so BOTH clear a 30 s target.)
//  AC14 cost is never a challenge's only quantitative axis — 129 measured that a
//       starved design is the CHEAPEST one, so cost alone rewards starving.
//  AC16 a latency-bearing brief explains the per-turn floor, in both languages.
//
// A future recalibration (a 127-style latency change, a 128-style tier change, a
// quota re-anchor) therefore turns an impossible or marginal challenge into a RED
// TEST rather than into a frustrated user. Re-tune the challenge — never weaken
// these walks.

import { describe, expect, it } from "vitest";

import { CHALLENGES, MIN_MARGIN, marginOf } from "./challenges";
import { allTopicsFor } from "../learn/content";
import { evaluateObjectives, measureDesign, SLO_METRIC_ORDER } from "./slo";

const LANGS = ["en", "pt"] as const;

/** Evaluate one of a challenge's designs under its own locked givens. */
function verdictOf(c: (typeof CHALLENGES)[number], which: "reference" | "start") {
  const build = which === "reference" ? c.reference : c.start;
  if (!build) return null;
  const d = build();
  // 131 AC12 — a challenge's given faults are part of the problem, so both the
  // reference and the start are judged WITH them applied.
  const design = {
    nodes: d.nodes,
    edges: d.edges,
    callShape: c.givens.callShape,
    faults: (c.givens.faults ?? []).map((f, i) => ({ ...f, id: `given-${i}` })),
  };
  return evaluateObjectives(
    measureDesign(design, c.givens.users, c.givens.thinkTimeSec),
    c.objectives,
  );
}

describe("130 AC1 — the library's shape", () => {
  it("ships at least six challenges with unique ids", () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(6);
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every challenge a difficulty, bilingual copy, givens and an objective", () => {
    for (const c of CHALLENGES) {
      expect(["easy", "medium", "hard"], c.id).toContain(c.difficulty);
      for (const lang of LANGS) {
        expect(c.title[lang]?.trim(), `${c.id} title ${lang}`).toBeTruthy();
        expect(c.brief[lang]?.trim(), `${c.id} brief ${lang}`).toBeTruthy();
      }
      expect(c.givens.users, c.id).toBeGreaterThan(0);
      expect(c.givens.thinkTimeSec, c.id).toBeGreaterThanOrEqual(1);
      expect(c.givens.callShape.inputTokens, c.id).toBeGreaterThan(0);
      expect(Object.keys(c.objectives).length, `${c.id} objectives`).toBeGreaterThan(0);
      for (const m of Object.keys(c.objectives)) {
        expect(SLO_METRIC_ORDER, `${c.id} axis ${m}`).toContain(m);
      }
    }
  });

  it("gives every challenge a reference solution", () => {
    for (const c of CHALLENGES) expect(typeof c.reference, c.id).toBe("function");
  });
});

describe("130 AC2 + AC15 — every challenge is SOLVABLE, with room to spare", () => {
  it.each(CHALLENGES.map((c) => [c.id, c] as const))(
    "%s — the reference solution meets every objective",
    (_id, c) => {
      const v = verdictOf(c, "reference")!;
      const failed = v.results.filter((r) => !r.met).map((r) => r.metric);
      expect(failed, `${c.id} reference failed: ${failed.join(", ")}`).toEqual([]);
      expect(v.met).toBe(true);
    },
  );

  it.each(CHALLENGES.map((c) => [c.id, c] as const))(
    "%s — the reference clears every objective by at least the minimum margin",
    (_id, c) => {
      const v = verdictOf(c, "reference")!;
      for (const r of v.results) {
        expect(
          marginOf(r),
          `${c.id}/${r.metric}: actual ${r.actual} vs target ${r.target}`,
        ).toBeGreaterThanOrEqual(MIN_MARGIN);
      }
    },
  );
});

describe("130 AC3 + AC15 — every challenge STARTS unsolved, unambiguously", () => {
  it.each(CHALLENGES.map((c) => [c.id, c] as const))(
    "%s — the starting design misses at least one objective",
    (_id, c) => {
      const v = verdictOf(c, "start");
      expect(v, `${c.id} has no starting design`).not.toBeNull();
      expect(v!.met, `${c.id} is solved on arrival`).toBe(false);
    },
  );

  it.each(CHALLENGES.map((c) => [c.id, c] as const))(
    "%s — it misses by at least the minimum margin (no knife edge)",
    (_id, c) => {
      const v = verdictOf(c, "start")!;
      const worst = Math.min(...v.results.filter((r) => !r.met).map((r) => marginOf(r)));
      // A failed result's margin is negative; -MIN_MARGIN or lower is a clear miss.
      expect(worst, `${c.id} only just fails`).toBeLessThanOrEqual(-MIN_MARGIN);
    },
  );
});

describe("130 AC14 — cost is never a lone axis", () => {
  it("pairs any cost objective with latency or headroom", () => {
    for (const c of CHALLENGES) {
      if (c.objectives.cost === undefined) continue;
      const paired =
        c.objectives.latency !== undefined || c.objectives.headroom !== undefined;
      expect(paired, `${c.id} tracks cost alone — a starved design would win`).toBe(true);
    }
  });
});

describe("130 AC16 — a latency brief explains the per-turn floor", () => {
  it("mentions the mechanism (calls / tokens / decode) in both languages", () => {
    // An agent turn costs seconds because of fan-out × output tokens × decode
    // (127's calibration). A brief that just demands "under 30 s" without saying
    // why reads as a broken model to anyone expecting 300 ms.
    const EN = /(call|token|decode|turn)/i;
    const PT = /(chamada|token|decode|turno)/i;
    for (const c of CHALLENGES) {
      if (c.objectives.latency === undefined) continue;
      expect(c.brief.en, `${c.id} en brief`).toMatch(EN);
      expect(c.brief.pt, `${c.id} pt brief`).toMatch(PT);
    }
  });
});

describe("130 AC8 — a restricted palette still admits the reference", () => {
  it("never forbids a kind the reference solution needs", () => {
    for (const c of CHALLENGES) {
      if (!c.allowedKinds) continue;
      const allowed = new Set(c.allowedKinds);
      for (const n of c.reference().nodes) {
        expect(allowed.has(n.kind), `${c.id} reference uses forbidden ${n.kind}`).toBe(true);
      }
      for (const n of c.start?.().nodes ?? []) {
        expect(allowed.has(n.kind), `${c.id} start uses forbidden ${n.kind}`).toBe(true);
      }
    }
  });
});

describe("130 AC10 — concept chips point at real Learn topics", () => {
  it("resolves every referenced topic id", () => {
    const ids = new Set(Object.keys(allTopicsFor("en")));
    for (const c of CHALLENGES) {
      for (const concept of c.concepts ?? []) {
        expect(ids.has(concept), `${c.id} → unknown topic "${concept}"`).toBe(true);
      }
    }
  });
});

describe("130 — designs are well-formed", () => {
  it("wires only existing nodes, with unique ids, in both designs", () => {
    for (const c of CHALLENGES) {
      for (const which of ["reference", "start"] as const) {
        const build = which === "reference" ? c.reference : c.start;
        if (!build) continue;
        const d = build();
        const ids = new Set(d.nodes.map((n) => n.id));
        expect(ids.size, `${c.id}/${which} duplicate node id`).toBe(d.nodes.length);
        for (const e of d.edges) {
          expect(ids.has(e.source), `${c.id}/${which} edge from missing ${e.source}`).toBe(true);
          expect(ids.has(e.target), `${c.id}/${which} edge to missing ${e.target}`).toBe(true);
        }
      }
    }
  });
});
