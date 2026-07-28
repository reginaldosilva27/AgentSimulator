// 100-arena-capacity-sandbox — the Arena's global store (design + offered load),
// persisted to localStorage (`agentsim.arena`), mirroring `useSelection`.
//
// Frontend-only: no backend, no DB. Node ids are generated from a monotonic
// counter (not Date.now/Math.random) so composition is deterministic and
// test-friendly. The UI (ArenaCanvas/ArenaNode) is a pure projection of this
// store fed through `computeMetrics` (model.ts).

import { create } from "zustand";

import {
  ARENA_REGIONS,
  CALL_SHAPE_BOUNDS,
  DEFAULT_CALL_SHAPE,
  DEFAULT_CPR,
  DEFAULT_MODEL_TIER,
  defaultHitRatioFor,
  INSTANCE_SIZES,
  isCacheLike,
  MODEL_TIERS,
  type ArenaKind,
  type ArenaRegion,
  type CallShape,
  type InstanceSize,
  type ModelTier,
} from "./components";
import { CHALLENGES, challengeById } from "./challenges";
import { type ArenaFault } from "./chaos";
import {
  loadProgress,
  recordAttempt as recordIn,
  saveProgress,
  isDuplicateOf,
  type ArenaAttempt,
  type ArenaProgress,
} from "./progress";
import { EXAMPLES, defaultDesign } from "./examples";
import { equilibriumRps, type ArenaEdge, type ArenaNodeSpec } from "./model";
import { fanoutNudges } from "./nudges";
import {
  DEFAULT_SLO_TARGETS,
  SLO_METRIC_ORDER,
  evaluateObjectives,
  measureDesign,
  type SloMetricId,
  type SloTargets,
} from "./slo";

/** A placed node: the model spec plus its canvas position. */
export interface ArenaNode extends ArenaNodeSpec {
  x: number;
  y: number;
  /** 106 — optional region annotation (pool intent; the model ignores it in v1). */
  region?: ArenaRegion;
  /** 120 — optional free-text annotation justifying this box (model-neutral). */
  note?: string;
}

/** 120 — annotations are captions, not essays. */
export const NOTE_MAX = 280;

/** 120 — normalize a note: trim, cap at NOTE_MAX; empty/non-string → undefined
 *  (so the element carries no empty-string residue and the marker disappears). */
export function sanitizeNote(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim().slice(0, NOTE_MAX);
  return trimmed.length ? trimmed : undefined;
}

/** 120 — return the element with a normalized note, or with the key removed when
 *  the note is empty/invalid (no empty-string residue). Used by the loader and
 *  by setNodeNote/setEdgeNote so persisted and live state stay consistent. */
function withSanitizedNote<T extends { note?: string }>(el: T): T {
  const note = sanitizeNote(el.note);
  if (note === undefined) {
    const { note: _drop, ...rest } = el;
    return rest as T;
  }
  return { ...el, note };
}

/** 128 — an invalid or foreign `modelTier` is dropped, so it resolves to the
 *  `mini` anchor at read time (never reaches MODEL_TIER_PROFILE as undefined). */
function withSanitizedModelTier(n: ArenaNode): ArenaNode {
  if (n.modelTier === undefined || isModelTier(n.modelTier)) return n;
  const { modelTier: _drop, ...rest } = n;
  return rest;
}

export interface ArenaState {
  nodes: ArenaNode[];
  edges: ArenaEdge[];
  /** The modeled request rate (rps). 110 — DERIVED: the closed-loop equilibrium
   *  `round(equilibriumRps(design, users, thinkTimeSec))`, never set directly. */
  offeredLoad: number;
  /** 103 — Little's Law drive: concurrent users … */
  users: number;
  /** … each sending one request every `thinkTimeSec` seconds. */
  thinkTimeSec: number;
  /** 115 — fan-out nudges the user waved away (target node ids). Pruned whenever
   *  the underlying nudge stops being derivable, so a re-wire nudges again. */
  dismissedNudges: string[];
  /** 117 — the workload's LLM call shape (tokens per call); drives the LLM
   *  tier's capacity, latency, cost and the regional quota. */
  callShape: CallShape;
  /** 129 — the tracked objectives. A metric ABSENT means that objective is OFF,
   *  which is what makes "an off objective can't move the verdict" structural.
   *  Cost is absent by default on purpose (see slo.ts: cost alone rewards
   *  under-provisioning). */
  sloTargets: SloTargets;
  /** 130 — the active challenge, or null for the free sandbox. While set, the
   *  load story is LOCKED (it belongs to the problem, not the player). */
  challengeId: string | null;
  /** 130 — the sandbox stashed while a challenge is active, restored on exit.
   *  Null outside challenge mode. */
  sandbox: SandboxStash | null;
  /** 130 — the reference solution was revealed for the active challenge. Free in
   *  v1; 132 records it on the attempt as `assisted`. */
  referenceShown: boolean;
}

/** 130 — everything challenge mode borrows and must give back (AC5). */
export interface SandboxStash {
  nodes: ArenaNode[];
  edges: ArenaEdge[];
  users: number;
  thinkTimeSec: number;
  callShape: CallShape;
  sloTargets: SloTargets;
  dismissedNudges: string[];
}

export const ARENA_STORAGE_KEY = "agentsim.arena";
/** 116 — every new infrastructure node lands in East US by default. */
const DEFAULT_REGION: ArenaRegion = "us-east";
const DEFAULT_THINK_SEC = 30;
const DEFAULT_USERS = 30_000; // ÷ 30s think = the pre-103 default of 1000 rps
const DEFAULT_LOAD = DEFAULT_USERS / DEFAULT_THINK_SEC;

function isSize(v: unknown): v is InstanceSize {
  return typeof v === "string" && (INSTANCE_SIZES as readonly string[]).includes(v);
}

/** 128 — a valid model tier (setter guard + persisted-blob sanitation). */
function isModelTier(v: unknown): v is ModelTier {
  return typeof v === "string" && (MODEL_TIERS as readonly string[]).includes(v);
}

/** 117 — clamp one call-shape axis to its slider bounds. */
function clampTokens(v: number, axis: keyof typeof CALL_SHAPE_BOUNDS): number {
  const b = CALL_SHAPE_BOUNDS[axis];
  return Math.min(b.max, Math.max(b.min, Math.round(v)));
}

/**
 * 129 — the allowed range per objective axis, so a nonsense target can neither be
 * set nor restored. `headroom` is a 0..1 fraction; the rest are non-negative
 * magnitudes with a generous ceiling (the panel is a teaching tool, not a form).
 */
const SLO_TARGET_BOUNDS: Record<SloMetricId, { min: number; max: number }> = {
  latency: { min: 0, max: 3_600_000 }, // up to an hour
  headroom: { min: 0, max: 1 },
  shed: { min: 0, max: 1_000_000 },
  cost: { min: 0, max: 10_000_000 },
};

function isSloMetric(v: unknown): v is SloMetricId {
  return typeof v === "string" && (SLO_METRIC_ORDER as readonly string[]).includes(v);
}

/** 129 — a target is valid iff it is a finite number inside its axis's bounds. */
function isValidTarget(metric: SloMetricId, v: unknown): v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) return false;
  const b = SLO_TARGET_BOUNDS[metric];
  return v >= b.min && v <= b.max;
}

/**
 * 129 AC10 — validate persisted targets: unknown keys dropped, non-finite /
 * out-of-range values dropped, an absent/malformed blob falling back to the
 * measured defaults. Follows the 128 `modelTier` precedent: degrade, never throw.
 */
function sanitizeSloTargets(v: unknown): SloTargets {
  if (!v || typeof v !== "object") return { ...DEFAULT_SLO_TARGETS };
  const out: SloTargets = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (!isSloMetric(key)) continue; // unknown axis — drop
    if (!isValidTarget(key, value)) continue; // bad value — drop (objective off)
    out[key] = value;
  }
  return out;
}

/**
 * 130 — validate a persisted sandbox stash. A malformed stash is DROPPED whole
 * rather than partially applied: half a restored sandbox is worse than none, and
 * exiting a challenge without a stash simply leaves the challenge design in place.
 */
function sanitizeStash(v: unknown): SandboxStash | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<SandboxStash>;
  if (!Array.isArray(s.nodes) || !Array.isArray(s.edges)) return null;
  if (typeof s.users !== "number" || typeof s.thinkTimeSec !== "number") return null;
  return {
    nodes: s.nodes.filter(
      (n): n is ArenaNode => !!n && typeof n.id === "string" && isSize(n.size),
    ),
    edges: s.edges.filter((e): e is ArenaEdge => !!e && typeof e.source === "string"),
    users: Math.max(0, s.users),
    thinkTimeSec: Math.max(1, s.thinkTimeSec),
    callShape: sanitizeCallShape(s.callShape),
    sloTargets: sanitizeSloTargets(s.sloTargets),
    dismissedNudges: Array.isArray(s.dismissedNudges)
      ? s.dismissedNudges.filter((d): d is string => typeof d === "string")
      : [],
  };
}

/** 117 — validate a persisted call shape; anything malformed falls back to default. */
function sanitizeCallShape(v: unknown): CallShape {
  if (
    !!v &&
    typeof v === "object" &&
    typeof (v as CallShape).inputTokens === "number" &&
    typeof (v as CallShape).outputTokens === "number" &&
    (v as CallShape).inputTokens >= CALL_SHAPE_BOUNDS.inputTokens.min &&
    (v as CallShape).inputTokens <= CALL_SHAPE_BOUNDS.inputTokens.max &&
    (v as CallShape).outputTokens >= CALL_SHAPE_BOUNDS.outputTokens.min &&
    (v as CallShape).outputTokens <= CALL_SHAPE_BOUNDS.outputTokens.max
  ) {
    return { inputTokens: (v as CallShape).inputTokens, outputTokens: (v as CallShape).outputTokens };
  }
  return DEFAULT_CALL_SHAPE;
}

/**
 * Load + validate a persisted design.
 *  - key ABSENT (first visit) → the default sample, so the Arena explains itself (101 AC1);
 *  - key PRESENT (even an emptied canvas) → that design is respected (101 AC2);
 *  - parse error / no localStorage → an empty canvas.
 */
export function loadArena(): ArenaState {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(ARENA_STORAGE_KEY);
    if (raw === null) return defaultDesign(); // first visit — seed the sample
    try {
      {
        const parsed = JSON.parse(raw) as Partial<ArenaState>;
        const nodes = (
          Array.isArray(parsed.nodes)
            ? parsed.nodes.filter(
                (n): n is ArenaNode =>
                  !!n && typeof n.id === "string" && typeof n.kind === "string" && isSize(n.size),
              )
            : []
        )
          .map(withSanitizedNote) // 120 — drop bad notes, cap over-long ones
          .map(withSanitizedModelTier); // 128 — drop an invalid/foreign modelTier
        const ids = new Set(nodes.map((n) => n.id));
        const edges = (
          Array.isArray(parsed.edges)
            ? parsed.edges.filter(
                (e): e is ArenaEdge =>
                  !!e && ids.has((e as ArenaEdge).source) && ids.has((e as ArenaEdge).target),
              )
            : []
        ).map(withSanitizedNote); // 120
        const offeredLoad =
          typeof parsed.offeredLoad === "number" && parsed.offeredLoad >= 0
            ? parsed.offeredLoad
            : DEFAULT_LOAD;
        const thinkTimeSec =
          typeof parsed.thinkTimeSec === "number" && parsed.thinkTimeSec >= 1
            ? parsed.thinkTimeSec
            : DEFAULT_THINK_SEC;
        // 103 migration — a pre-103 blob has no `users`: derive it from the stored
        // rps so the modeled load is preserved exactly.
        const users =
          typeof parsed.users === "number" && parsed.users >= 0
            ? parsed.users
            : offeredLoad * thinkTimeSec;
        // 115 — pre-115 blobs have no dismissedNudges: default to [].
        const dismissedNudges = Array.isArray(parsed.dismissedNudges)
          ? parsed.dismissedNudges.filter((d): d is string => typeof d === "string")
          : [];
        // 117 — pre-117 blobs have no callShape: the default reproduces them exactly.
        const callShape = sanitizeCallShape(parsed.callShape);
        // 129 — pre-129 blobs have no sloTargets: the measured defaults apply. A
        // PRESENT-but-empty object is respected as "every objective off" (the same
        // present-blob-wins rule 101 established for an emptied canvas).
        const sloTargets = sanitizeSloTargets(parsed.sloTargets);
        // 130 — an UNKNOWN challenge id falls back to the sandbox rather than
        // stranding the user in a mode with no problem behind it; the stash only
        // survives alongside a valid id (it is meaningless without one).
        const challengeId =
          typeof parsed.challengeId === "string" && challengeById(parsed.challengeId)
            ? parsed.challengeId
            : null;
        const sandbox = challengeId ? sanitizeStash(parsed.sandbox) : null;
        // 110 — the effective rate is the closed-loop equilibrium of THIS design.
        return {
          nodes,
          edges,
          offeredLoad: Math.round(equilibriumRps({ nodes, edges, callShape }, users, thinkTimeSec)),
          users,
          thinkTimeSec,
          dismissedNudges,
          callShape,
          sloTargets,
          challengeId,
          sandbox,
          referenceShown: parsed.referenceShown === true,
        };
      }
    } catch {
      // fall through
    }
  }
  return {
    nodes: [],
    edges: [],
    offeredLoad: DEFAULT_LOAD,
    users: DEFAULT_USERS,
    thinkTimeSec: DEFAULT_THINK_SEC,
    dismissedNudges: [],
    callShape: DEFAULT_CALL_SHAPE,
    sloTargets: { ...DEFAULT_SLO_TARGETS },
    challengeId: null,
    sandbox: null,
    referenceShown: false,
  };
}

function persist(state: ArenaState): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(state));
  }
}

/**
 * 132 — THE ONLY PLACE wall-clock time enters the Arena. The pure modules
 * (`model.ts`, `slo.ts`, `challenges.ts`, `chaos.ts`, `progress.ts`) never call
 * `Date.now`; a timestamp reaches `progress.ts` as data. A test greps those files
 * to keep the boundary from eroding.
 */
let clock: () => number = () => Date.now();
/** Test-only clock injection — deterministic ordering in the suite. */
export function __setArenaClock(fn: () => number): void {
  clock = fn;
}

let counter = 0;
/** 131 — deterministic fault ids (the model forbids Math.random / Date.now, and a
 *  fault id shows up in test assertions). */
let faultCounter = 0;
function nextId(kind: ArenaKind, existing: ArenaNode[]): string {
  // Seed the counter past any restored id so a fresh session never collides.
  for (const n of existing) {
    const m = /-(\d+)$/.exec(n.id);
    if (m) counter = Math.max(counter, Number(m[1]));
  }
  counter += 1;
  return `${kind}-${counter}`;
}

interface ArenaStore extends ArenaState {
  addNode: (kind: ArenaKind, pos: { x: number; y: number }) => string;
  /** 107 — the selected node (drives the scale panel). Transient. */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** 120 — the selected edge (drives the connection note panel). Transient and
   *  mutually exclusive with `selectedId`: selecting one clears the other. */
  selectedEdgeId: string | null;
  selectEdge: (id: string | null) => void;
  /** 120 — annotate a node / an edge (trim + cap NOTE_MAX; empty removes the
   *  note). Non-structural: keeps the loaded example selected. */
  setNodeNote: (id: string, note: string) => void;
  setEdgeNote: (id: string, note: string) => void;
  /** 107/116 — palette drop: add + select the new node (so the scale panel
   *  opens). Wiring is ALWAYS the user's explicit gesture — the 107 auto-wire
   *  was removed by user request (surprise edges outweighed the convenience). */
  dropNode: (kind: ArenaKind, pos: { x: number; y: number }) => string;
  removeNode: (id: string) => void;
  /** Live position update during a drag — updates state only, does NOT persist. */
  dragNode: (id: string, pos: { x: number; y: number }) => void;
  /** Commit a position (drag end) — updates state AND persists. */
  moveNode: (id: string, pos: { x: number; y: number }) => void;
  /** 124 — batch move (the auto-arrange button): one commit for all positions.
   *  Non-structural, like moveNode — the loaded example stays selected. */
  applyPositions: (pos: Record<string, { x: number; y: number }>) => void;
  connect: (source: string, target: string) => void;
  removeEdge: (id: string) => void;
  setSize: (id: string, size: InstanceSize) => void;
  /** 128 — LLM only: which model SKU runs here (latency + cost; invalid ignored). */
  setModelTier: (id: string, tier: ModelTier) => void;
  setReplicas: (id: string, replicas: number) => void;
  setHitRatio: (id: string, hitRatio: number) => void;
  setOfferedLoad: (offeredLoad: number) => void;
  /** 103 — the Little's Law drive: either control recomputes offeredLoad. */
  setUsers: (users: number) => void;
  setThinkTime: (thinkTimeSec: number) => void;
  /** 103 — calls this node receives per user request (ReAct fan-out; min 1). */
  setCallsPerRequest: (id: string, calls: number) => void;
  /** 106 — annotate a node's region (null clears; invalid codes ignored). */
  setRegion: (id: string, region: string | null) => void;
  /** 117 — the workload call shape (clamped to CALL_SHAPE_BOUNDS; structural:
   *  the canvas no longer behaves like the loaded preset). */
  setCallShape: (inputTokens: number, outputTokens: number) => void;
  /** 115 — wave a fan-out nudge away for this target node (persisted; pruned
   *  when the nudge stops being derivable). Never changes the node itself. */
  dismissNudge: (id: string) => void;
  /** 130 — enter a challenge: stash the sandbox, apply the problem's givens +
   *  objectives + starting design, and un-dismiss 115's nudges (a nudge waved away
   *  in the sandbox is often the challenge's whole lesson). Unknown id = no-op. */
  enterChallenge: (id: string) => void;
  /** 130 — leave the challenge and restore the stashed sandbox exactly. */
  exitChallenge: () => void;
  /** 130 — load the active challenge's reference solution onto the canvas. The
   *  challenge stays active and its givens stay locked. */
  loadReference: () => void;
  /** 129 — set (or, with `null`, switch OFF) one objective. An out-of-range value
   *  is ignored rather than clamped: the panel's inputs are bounded, so a bad
   *  value means a bad caller, and silently clamping would hide it. Not a
   *  structural edit — tracking a goal doesn't change the design, so the loaded
   *  example stays selected. */
  setSloTarget: (metric: SloMetricId, value: number | null) => void;
  /** Replace the whole canvas with a design (e.g. an example preset) + persist. */
  loadDesign: (design: Pick<ArenaState, "nodes" | "edges" | "users" | "thinkTimeSec">) => void;
  /** The preset currently shown in the canvas (drives the Examples dropdown). Transient
   *  UI state — not persisted; cleared by any structural edit. */
  exampleId: string | null;
  /** Load a named example preset and mark it active (dropdown reflects it). */
  loadExample: (id: string) => void;
  /** 132 — the last verdict seen, so a not-met→met TRANSITION can be detected and
   *  recorded once (rather than on every edit while it stays solved). Transient. */
  lastVerdictMet: boolean;
  /** 132 — per-challenge attempt history + status. Stored under its OWN key
   *  (`agentsim.arena.progress`), so clearing a canvas never erases a record of
   *  learning — and vice versa. */
  progress: ArenaProgress;
  /** 132 — record the current design as an attempt at the active challenge. Called
   *  automatically on each not-met→met transition and on leaving; the duplicate
   *  guard keeps a no-op enter/exit from filling the history. */
  recordAttempt: () => void;
  resetProgress: () => void;
  /** 132 — put a recorded attempt's design (and its faults) back on the canvas. */
  restoreAttempt: (challengeId: string, seq: number) => void;
  /** 131 — injected faults. TRANSIENT, like `exampleId`: a fault is an experiment,
   *  not part of the design, so it is deliberately absent from `ArenaState` and
   *  therefore from the persisted blob (AC8). A reload returns the intact design. */
  faults: ArenaFault[];
  applyFault: (fault: Omit<ArenaFault, "id">) => void;
  removeFault: (id: string) => void;
  clearFaults: () => void;
  /** 119 — the ✕ on a callout hides them all for the loaded sample (transient;
   *  loadExample resets it). Visibility itself derives from `exampleId`. */
  calloutsHidden: boolean;
  hideCallouts: () => void;
  clear: () => void;
}

function commit(set: (s: Partial<ArenaState>) => void, next: ArenaState): void {
  persist(next);
  set(next);
}

export const useArena = create<ArenaStore>((set, get) => {
  const init = loadArena();
  // 110 — offeredLoad is DERIVED on every commit: any edit that changes the
  // design, the population or the think time shifts the closed-loop equilibrium.
  // 115 — dismissals are pruned to nudges still derivable from the design, so
  // removing the wiring (and re-adding it later) makes the nudge fire again.
  const save = (patch: Partial<ArenaState>) => {
    const merged = { ...get(), ...patch };
    const { nodes, edges, users, thinkTimeSec, callShape, sloTargets } = merged;
    // 131 — faults belong in the design the equilibrium is solved for: a latency
    // spike genuinely slows the population down (AC4).
    const offeredLoad = Math.round(
      equilibriumRps({ nodes, edges, callShape, faults: get().faults }, users, thinkTimeSec),
    );
    const active = new Set(fanoutNudges({ nodes, edges }).map((nd) => nd.targetId));
    const dismissedNudges = merged.dismissedNudges.filter((id) => active.has(id));
    commit(set, {
      nodes,
      edges,
      offeredLoad,
      users,
      thinkTimeSec,
      dismissedNudges,
      callShape,
      sloTargets,
      challengeId: merged.challengeId,
      sandbox: merged.sandbox,
      referenceShown: merged.referenceShown,
    });
    // 132 AC1b — record on each not-met→met TRANSITION (once, not on every edit
    // that keeps it solved). The other trigger is `exitChallenge`.
    if (merged.challengeId) {
      const met = evaluateObjectives(
        measureDesign({ nodes, edges, callShape, faults: get().faults }, users, thinkTimeSec),
        sloTargets,
      ).met;
      const was = get().lastVerdictMet;
      set({ lastVerdictMet: met });
      if (met && !was) get().recordAttempt();
    } else {
      set({ lastVerdictMet: false });
    }
  };
  /** 131 — re-derive the load from the CURRENT faults (a fault is not a design
   *  edit, so it must not clear the example selection or persist anything new). */
  const reload = () => {
    const { nodes, edges, callShape, users, thinkTimeSec, faults } = get();
    set({
      offeredLoad: Math.round(
        equilibriumRps({ nodes, edges, callShape, faults }, users, thinkTimeSec),
      ),
    });
  };
  // Structural edits (nodes/edges/scaling) mean the canvas no longer equals a preset,
  // so they deselect the Examples dropdown. Load-slider + drag keep the selection.
  const saveStruct = (patch: Partial<ArenaState>) => {
    save(patch);
    set({ exampleId: null });
  };
  return {
    ...init,
    exampleId: null,
    selectedId: null,
    selectedEdgeId: null,
    calloutsHidden: false,
    faults: [],
    progress: loadProgress(CHALLENGES.map((c) => c.id)),
    lastVerdictMet: false,

    select: (id) => set({ selectedId: id, selectedEdgeId: null }),

    selectEdge: (id) => set({ selectedEdgeId: id, selectedId: null }),

    setNodeNote: (id, note) =>
      save({
        nodes: get().nodes.map((n) => (n.id === id ? withSanitizedNote({ ...n, note }) : n)),
      }),

    setEdgeNote: (id, note) =>
      save({
        edges: get().edges.map((e) => (e.id === id ? withSanitizedNote({ ...e, note }) : e)),
      }),

    hideCallouts: () => set({ calloutsHidden: true }),

    recordAttempt: () => {
      const s = get();
      const challenge = challengeById(s.challengeId);
      if (!challenge) return;
      const design = { nodes: s.nodes, edges: s.edges, callShape: s.callShape, faults: s.faults };
      const measurement = measureDesign(design, s.users, s.thinkTimeSec);
      const verdict = evaluateObjectives(measurement, s.sloTargets);
      const candidate: Omit<ArenaAttempt, "seq"> = {
        at: clock(),
        passed: verdict.met,
        results: verdict.results.map((r) => ({
          metric: r.metric,
          target: r.target,
          actual: r.actual,
          met: r.met,
        })),
        // Denormalised on purpose: history must not be rewritten by a later
        // recalibration (see progress.ts's header).
        costPerHourUsd: measurement.costPerHourUsd,
        e2eLatencyMs: measurement.e2eLatencyMs,
        ...(s.referenceShown ? { assisted: true } : {}),
        design: { nodes: s.nodes, edges: s.edges, callShape: s.callShape },
        ...(s.faults.length ? { faults: s.faults } : {}),
      };
      const existing = s.progress[s.challengeId!]?.attempts ?? [];
      if (isDuplicateOf(existing, candidate)) return; // nothing changed since last time
      const progress = recordIn(s.progress, s.challengeId!, candidate);
      saveProgress(progress);
      set({ progress });
    },

    resetProgress: () => {
      saveProgress({});
      set({ progress: {} });
    },

    restoreAttempt: (challengeId, seq) => {
      const entry = get().progress[challengeId];
      const found = entry?.attempts.find((a) => a.seq === seq);
      if (!found) return;
      set({ faults: found.faults ?? [] });
      // Restoring is an edit to the canvas, not a mode change: the challenge stays
      // active and its givens stay locked.
      save({ nodes: found.design.nodes, edges: found.design.edges });
    },

    applyFault: (fault) => {
      faultCounter += 1;
      set({ faults: [...get().faults, { ...fault, id: `fault-${faultCounter}` }] });
      reload(); // AC4 — re-derive the closed-loop equilibrium under the new fault
    },

    removeFault: (id) => {
      // 131 AC12 — a challenge's own faults are the problem, not the user's
      // experiment: they cannot be removed while the challenge is active.
      if (id.startsWith("given-") && get().challengeId) return;
      set({ faults: get().faults.filter((f) => f.id !== id) });
      reload();
    },

    clearFaults: () =>
      set({
        // AC12 — clear-all keeps the challenge's given faults in place.
        faults: get().challengeId ? get().faults.filter((f) => f.id.startsWith("given-")) : [],
      }) ?? reload(),

    enterChallenge: (id) => {
      const challenge = challengeById(id);
      if (!challenge) return; // unknown id — stay in the sandbox rather than throw
      const s = get();
      // Don't overwrite an existing stash if already inside a challenge.
      const sandbox: SandboxStash = s.sandbox ?? {
        nodes: s.nodes,
        edges: s.edges,
        users: s.users,
        thinkTimeSec: s.thinkTimeSec,
        callShape: s.callShape,
        sloTargets: s.sloTargets,
        dismissedNudges: s.dismissedNudges,
      };
      const start = challenge.start();
      set({
        challengeId: id,
        sandbox,
        referenceShown: false,
        exampleId: null,
        // 131 AC13 — sandbox faults do NOT cross the boundary: the challenge's own
        // take over. They were transient anyway, so exit does not restore them.
        // AC12 — a challenge's faults are part of the PROBLEM and are locked.
        faults: (challenge.givens.faults ?? []).map((f, i) => ({ ...f, id: `given-${i}` })),
      });
      save({
        nodes: start.nodes,
        edges: start.edges,
        users: challenge.givens.users,
        thinkTimeSec: challenge.givens.thinkTimeSec,
        callShape: challenge.givens.callShape,
        sloTargets: { ...challenge.objectives },
        dismissedNudges: [], // AC17 — the lesson re-fires inside a challenge
      });
    },

    exitChallenge: () => {
      // 132 AC1b — record unconditionally on the way out: this is what captures a
      // post-solve refinement (solve at $24k, tune to $18k, leave ⇒ both recorded).
      get().recordAttempt();
      const stash = get().sandbox;
      set({ challengeId: null, sandbox: null, referenceShown: false, faults: [] });
      if (stash) save({ ...stash });
    },

    loadReference: () => {
      const challenge = challengeById(get().challengeId);
      if (!challenge) return;
      const ref = challenge.reference();
      set({ referenceShown: true });
      save({ nodes: ref.nodes, edges: ref.edges });
    },

    setSloTarget: (metric, value) => {
      const next = { ...get().sloTargets };
      if (value === null) delete next[metric];
      else if (isValidTarget(metric, value)) next[metric] = value;
      else return; // out of range — leave the tracked target untouched
      save({ sloTargets: next });
    },

    dropNode: (kind, pos) => {
      const id = get().addNode(kind, pos);
      set({ selectedId: id });
      return id;
    },

    addNode: (kind, pos) => {
      const id = nextId(kind, get().nodes);
      const node: ArenaNode = {
        id,
        kind,
        size: "medium",
        replicas: 1,
        x: pos.x,
        y: pos.y,
        ...(isCacheLike(kind) ? { hitRatio: defaultHitRatioFor(kind) } : {}),
        // 125 — kinds hit more than once per turn (guardrails: in+out moderation;
        // memory store: read+write) seed their fan-out; others default to 1.
        ...(DEFAULT_CPR[kind] ? { callsPerRequest: DEFAULT_CPR[kind] } : {}),
        // 116 — infrastructure defaults to East US; the client is the users,
        // not a deployable box, so it carries no region.
        ...(kind === "client" ? {} : { region: DEFAULT_REGION }),
        // 128 — an LLM deployment defaults to the `mini` model tier (the anchor).
        ...(kind === "llm" ? { modelTier: DEFAULT_MODEL_TIER } : {}),
      };
      saveStruct({ nodes: [...get().nodes, node] });
      return id;
    },

    removeNode: (id) => {
      const droppedEdges = get()
        .edges.filter((e) => e.source === id || e.target === id)
        .map((e) => e.id);
      saveStruct({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      });
      if (get().selectedId === id) set({ selectedId: null });
      // 120 — a selected edge that touched this node is now gone.
      if (get().selectedEdgeId && droppedEdges.includes(get().selectedEdgeId!)) {
        set({ selectedEdgeId: null });
      }
    },

    // Mid-drag: mutate state only (avoid a localStorage write on every frame).
    dragNode: (id, pos) =>
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...pos } : n)) }),

    moveNode: (id, pos) =>
      save({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...pos } : n)) }),

    applyPositions: (pos) =>
      save({ nodes: get().nodes.map((n) => (pos[n.id] ? { ...n, ...pos[n.id] } : n)) }),

    connect: (source, target) => {
      if (source === target) return;
      const id = `${source}-${target}`;
      if (get().edges.some((e) => e.id === id)) return;
      saveStruct({ edges: [...get().edges, { id, source, target }] });
    },

    removeEdge: (id) => {
      saveStruct({ edges: get().edges.filter((e) => e.id !== id) });
      if (get().selectedEdgeId === id) set({ selectedEdgeId: null }); // 120
    },

    setSize: (id, size) =>
      saveStruct({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, size } : n)) }),

    setModelTier: (id, tier) => {
      if (!isModelTier(tier)) return;
      saveStruct({
        nodes: get().nodes.map((n) => (n.id === id && n.kind === "llm" ? { ...n, modelTier: tier } : n)),
      });
    },

    setReplicas: (id, replicas) =>
      saveStruct({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, replicas: Math.max(1, Math.round(replicas)) } : n,
        ),
      }),

    setHitRatio: (id, hitRatio) =>
      saveStruct({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, hitRatio: Math.min(1, Math.max(0, hitRatio)) } : n,
        ),
      }),

    // Compat shim (110): a raw rps is a DEMAND — back-solve the population; the
    // effective rate is still the derived equilibrium.
    setOfferedLoad: (offeredLoad) => {
      if (get().challengeId) return; // 130 AC6 — the load belongs to the problem
      const rps = Math.max(0, Math.round(offeredLoad));
      save({ users: rps * get().thinkTimeSec });
    },

    setUsers: (users) => {
      if (get().challengeId) return; // 130 AC6
      save({ users: Math.max(0, Math.round(users)) });
    },

    setThinkTime: (thinkTimeSec) => {
      if (get().challengeId) return; // 130 AC6
      save({ thinkTimeSec: Math.max(1, Math.round(thinkTimeSec)) });
    },

    setCallsPerRequest: (id, calls) =>
      saveStruct({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, callsPerRequest: Math.max(1, Math.round(calls)) } : n,
        ),
      }),

    dismissNudge: (id) => save({ dismissedNudges: [...get().dismissedNudges, id] }),

    setCallShape: (inputTokens, outputTokens) => {
      if (get().challengeId) return; // 130 AC6 — the payload belongs to the problem
      saveStruct({
        callShape: {
          inputTokens: clampTokens(inputTokens, "inputTokens"),
          outputTokens: clampTokens(outputTokens, "outputTokens"),
        },
      });
    },

    setRegion: (id, region) => {
      if (region !== null && !(ARENA_REGIONS as readonly string[]).includes(region)) return;
      saveStruct({
        nodes: get().nodes.map((n) => {
          if (n.id !== id) return n;
          if (region === null) {
            const { region: _drop, ...rest } = n;
            return rest;
          }
          return { ...n, region: region as ArenaRegion };
        }),
      });
    },

    loadDesign: (design) =>
      save({
        nodes: design.nodes,
        edges: design.edges,
        users: design.users,
        thinkTimeSec: design.thinkTimeSec,
        // 117 — a loaded design speaks the stated default call shape.
        callShape: DEFAULT_CALL_SHAPE,
      }),

    loadExample: (id) => {
      const ex = EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      const d = ex.build();
      save({
        nodes: d.nodes,
        edges: d.edges,
        users: d.users,
        thinkTimeSec: d.thinkTimeSec,
        // 117 — presets' claims are pinned at the default shape.
        callShape: DEFAULT_CALL_SHAPE,
      });
      // 119 — a freshly loaded sample always shows its callouts again.
      set({ exampleId: id, calloutsHidden: false });
    },

    clear: () => saveStruct({ nodes: [], edges: [] }),
  };
});
