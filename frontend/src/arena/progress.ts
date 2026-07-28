// 132-arena-attempts — attempt history, per-challenge progress, best solution.
//
// TWO DECISIONS WORTH KNOWING BEFORE EDITING:
//
//  1. **A SECOND localStorage key, deliberately.** Progress lives under
//     `agentsim.arena.progress`, separate from `agentsim.arena` (the design). That
//     separation IS the point: wiping a canvas is an everyday act, wiping a record
//     of learning is not, and coupling them would make `clear()` destructive in a
//     way the user cannot anticipate. Two keys, two lifecycles.
//
//  2. **Figures are DENORMALISED onto the attempt** (cost + latency copied, not
//     recomputed from the snapshot). This makes the best-attempt rule a pure sort
//     over stored numbers, and — more importantly — keeps a historical attempt's
//     figures AS THEY WERE MEASURED. A later model recalibration (127/128-style)
//     must not silently rewrite history, so the UI labels stored figures as being
//     from that attempt.
//
// This module is PURE: no clock, no storage side effects in the derivations. The
// timestamp arrives as data (`at`), supplied by the store's injectable clock — the
// only place wall-clock time enters the Arena. `model.ts`, `slo.ts`, `challenges.ts`
// and `chaos.ts` stay free of `Date.now`, and a test pins that.

import type { ArenaFault } from "./chaos";
import type { SloMetricId } from "./slo";
import type { ArenaNode } from "./store";
import type { ArenaEdge } from "./model";
import type { CallShape } from "./components";

/** One objective's outcome, frozen at the time of the attempt. */
export interface AttemptResult {
  metric: SloMetricId;
  target: number;
  actual: number;
  met: boolean;
}

export interface ArenaAttempt {
  /** Monotonic per challenge — deterministic ordering independent of the clock. */
  seq: number;
  /** Epoch ms, from the store's injectable clock. */
  at: number;
  passed: boolean;
  results: AttemptResult[];
  /** Denormalised for the best-attempt rule — see the header note. */
  costPerHourUsd: number;
  e2eLatencyMs: number;
  /** 130's reference solution was revealed before this attempt. */
  assisted?: boolean;
  design: { nodes: ArenaNode[]; edges: ArenaEdge[]; callShape: CallShape };
  /** 131 — what was broken at the time (a challenge's given faults included). */
  faults?: ArenaFault[];
}

/** `untried` is the ABSENCE of a record, never a stored value — so "never regresses"
 *  is enforced in one place and an unknown challenge id simply drops on load. */
export type ChallengeStatus = "untried" | "attempted" | "solved";

export interface ChallengeProgress {
  status: Exclude<ChallengeStatus, "untried">;
  attempts: ArenaAttempt[];
}

export type ArenaProgress = Record<string, ChallengeProgress>;

export const PROGRESS_STORAGE_KEY = "agentsim.arena.progress";
/** Blob shape version, so a future change can migrate rather than discard. */
export const PROGRESS_VERSION = 1;

/**
 * Attempts kept per challenge. A design snapshot per attempt is the only real
 * footprint concern here; 10 × the library is a modest blob and still covers the
 * "could I have done it cheaper?" comparison the cost axis exists for.
 */
export const HISTORY_CAP = 10;

/** The best attempt: cheapest PASSING design, ties by lowest latency, then earliest.
 *
 *  Only passing attempts are candidates, and that is what makes cost-first safe:
 *  129 measured that a starved design is the cheapest one, but a starved design does
 *  not pass, so it can never win here. Among designs that all work, cost is the
 *  tie-break that means something. */
export function bestAttempt(attempts: readonly ArenaAttempt[]): ArenaAttempt | undefined {
  const passing = attempts.filter((a) => a.passed);
  if (passing.length === 0) return undefined;
  return [...passing].sort(
    (a, b) =>
      a.costPerHourUsd - b.costPerHourUsd ||
      a.e2eLatencyMs - b.e2eLatencyMs ||
      a.seq - b.seq,
  )[0];
}

/** Drop the oldest NON-BEST entry once the cap is exceeded; the best passing attempt
 *  is never evicted (losing your best solution to a bookkeeping rule would be absurd). */
export function pruneHistory(attempts: readonly ArenaAttempt[], cap = HISTORY_CAP): ArenaAttempt[] {
  if (attempts.length <= cap) return [...attempts];
  const keepId = bestAttempt(attempts)?.seq;
  const out = [...attempts];
  while (out.length > cap) {
    const victim = out.findIndex((a) => a.seq !== keepId);
    if (victim === -1) break; // everything left is the best — nothing safe to drop
    out.splice(victim, 1);
  }
  return out;
}

/** Append an attempt, advancing the status. Solved NEVER regresses: it records
 *  having done it, not the last try. */
export function recordAttempt(
  progress: ArenaProgress,
  challengeId: string,
  attempt: Omit<ArenaAttempt, "seq">,
  cap = HISTORY_CAP,
): ArenaProgress {
  const prev = progress[challengeId];
  const seq = (prev?.attempts.at(-1)?.seq ?? 0) + 1;
  const attempts = pruneHistory([...(prev?.attempts ?? []), { ...attempt, seq }], cap);
  const status = prev?.status === "solved" || attempt.passed ? "solved" : "attempted";
  return { ...progress, [challengeId]: { status, attempts } };
}

export function statusOf(progress: ArenaProgress, challengeId: string): ChallengeStatus {
  return progress[challengeId]?.status ?? "untried";
}

/** "N of M solved" — the library-level summary. */
export function summarise(
  progress: ArenaProgress,
  challengeIds: readonly string[],
): { solved: number; total: number } {
  return {
    solved: challengeIds.filter((id) => statusOf(progress, id) === "solved").length,
    total: challengeIds.length,
  };
}

/** True when this attempt would be a near-duplicate of the last recorded one —
 *  the guard that keeps enter→exit-with-no-changes from filling the history. */
export function isDuplicateOf(
  attempts: readonly ArenaAttempt[],
  candidate: Omit<ArenaAttempt, "seq">,
): boolean {
  const last = attempts.at(-1);
  if (!last) return false;
  return (
    last.passed === candidate.passed &&
    JSON.stringify(last.design) === JSON.stringify(candidate.design) &&
    JSON.stringify(last.faults ?? []) === JSON.stringify(candidate.faults ?? [])
  );
}

// ---------------------------------------------------------------------------
// Persistence — its own key, degrading rather than throwing.
// ---------------------------------------------------------------------------

function isAttempt(v: unknown): v is ArenaAttempt {
  if (!v || typeof v !== "object") return false;
  const a = v as Partial<ArenaAttempt>;
  return (
    typeof a.seq === "number" &&
    typeof a.at === "number" &&
    typeof a.passed === "boolean" &&
    Array.isArray(a.results) &&
    typeof a.costPerHourUsd === "number" &&
    typeof a.e2eLatencyMs === "number" &&
    !!a.design &&
    Array.isArray((a.design as ArenaAttempt["design"]).nodes)
  );
}

/** Validate a persisted blob: unknown challenge ids dropped, malformed attempts
 *  dropped, anything unparseable ⇒ empty progress. Never throws (AC7). */
export function sanitizeProgress(v: unknown, knownIds: readonly string[]): ArenaProgress {
  if (!v || typeof v !== "object") return {};
  const known = new Set(knownIds);
  const raw = (v as { challenges?: unknown }).challenges ?? v;
  if (!raw || typeof raw !== "object") return {};
  const out: ArenaProgress = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id)) continue; // a challenge that no longer exists
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Partial<ChallengeProgress>;
    const attempts = Array.isArray(e.attempts) ? e.attempts.filter(isAttempt) : [];
    const status = e.status === "solved" ? "solved" : "attempted";
    // A record with no surviving attempts still means "tried" — unless the status
    // itself was junk, in which case there is nothing to say.
    if (attempts.length === 0 && e.status !== "solved" && e.status !== "attempted") continue;
    out[id] = { status, attempts };
  }
  return out;
}

export function loadProgress(knownIds: readonly string[]): ArenaProgress {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw === null) return {};
    return sanitizeProgress(JSON.parse(raw), knownIds);
  } catch {
    return {}; // corrupt blob — start clean rather than crash the page
  }
}

export function saveProgress(progress: ArenaProgress): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    PROGRESS_STORAGE_KEY,
    JSON.stringify({ v: PROGRESS_VERSION, challenges: progress }),
  );
}
