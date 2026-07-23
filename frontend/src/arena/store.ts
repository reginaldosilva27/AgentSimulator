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
  defaultHitRatioFor,
  INSTANCE_SIZES,
  isCacheLike,
  type ArenaKind,
  type ArenaRegion,
  type InstanceSize,
} from "./components";
import { EXAMPLES, defaultDesign } from "./examples";
import { equilibriumRps, type ArenaEdge, type ArenaNodeSpec } from "./model";
import { fanoutNudges } from "./nudges";

/** A placed node: the model spec plus its canvas position. */
export interface ArenaNode extends ArenaNodeSpec {
  x: number;
  y: number;
  /** 106 — optional region annotation (pool intent; the model ignores it in v1). */
  region?: ArenaRegion;
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
}

export const ARENA_STORAGE_KEY = "agentsim.arena";
const DEFAULT_THINK_SEC = 30;
const DEFAULT_USERS = 30_000; // ÷ 30s think = the pre-103 default of 1000 rps
const DEFAULT_LOAD = DEFAULT_USERS / DEFAULT_THINK_SEC;

function isSize(v: unknown): v is InstanceSize {
  return typeof v === "string" && (INSTANCE_SIZES as readonly string[]).includes(v);
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
        const nodes = Array.isArray(parsed.nodes)
          ? parsed.nodes.filter(
              (n): n is ArenaNode =>
                !!n && typeof n.id === "string" && typeof n.kind === "string" && isSize(n.size),
            )
          : [];
        const ids = new Set(nodes.map((n) => n.id));
        const edges = Array.isArray(parsed.edges)
          ? parsed.edges.filter(
              (e): e is ArenaEdge =>
                !!e && ids.has((e as ArenaEdge).source) && ids.has((e as ArenaEdge).target),
            )
          : [];
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
        // 110 — the effective rate is the closed-loop equilibrium of THIS design.
        return {
          nodes,
          edges,
          offeredLoad: Math.round(equilibriumRps({ nodes, edges }, users, thinkTimeSec)),
          users,
          thinkTimeSec,
          dismissedNudges,
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
  };
}

function persist(state: ArenaState): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(state));
  }
}

let counter = 0;
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
  /** 107 — the selected node (drives the scale panel + auto-wire). Transient. */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** 107 — palette drop: add + auto-wire from the selected node + select the
   *  new node, so "select the gateway, drop 3 LLMs" wires itself. */
  dropNode: (kind: ArenaKind, pos: { x: number; y: number }) => string;
  removeNode: (id: string) => void;
  /** Live position update during a drag — updates state only, does NOT persist. */
  dragNode: (id: string, pos: { x: number; y: number }) => void;
  /** Commit a position (drag end) — updates state AND persists. */
  moveNode: (id: string, pos: { x: number; y: number }) => void;
  connect: (source: string, target: string) => void;
  removeEdge: (id: string) => void;
  setSize: (id: string, size: InstanceSize) => void;
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
  /** 115 — wave a fan-out nudge away for this target node (persisted; pruned
   *  when the nudge stops being derivable). Never changes the node itself. */
  dismissNudge: (id: string) => void;
  /** Replace the whole canvas with a design (e.g. an example preset) + persist. */
  loadDesign: (design: Pick<ArenaState, "nodes" | "edges" | "users" | "thinkTimeSec">) => void;
  /** The preset currently shown in the canvas (drives the Examples dropdown). Transient
   *  UI state — not persisted; cleared by any structural edit. */
  exampleId: string | null;
  /** Load a named example preset and mark it active (dropdown reflects it). */
  loadExample: (id: string) => void;
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
    const { nodes, edges, users, thinkTimeSec } = merged;
    const offeredLoad = Math.round(equilibriumRps({ nodes, edges }, users, thinkTimeSec));
    const active = new Set(fanoutNudges({ nodes, edges }).map((nd) => nd.targetId));
    const dismissedNudges = merged.dismissedNudges.filter((id) => active.has(id));
    commit(set, { nodes, edges, offeredLoad, users, thinkTimeSec, dismissedNudges });
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

    select: (id) => set({ selectedId: id }),

    dropNode: (kind, pos) => {
      const from = get().selectedId;
      const id = get().addNode(kind, pos);
      if (from && get().nodes.some((n) => n.id === from)) get().connect(from, id);
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
      };
      saveStruct({ nodes: [...get().nodes, node] });
      return id;
    },

    removeNode: (id) => {
      saveStruct({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      });
      if (get().selectedId === id) set({ selectedId: null });
    },

    // Mid-drag: mutate state only (avoid a localStorage write on every frame).
    dragNode: (id, pos) =>
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...pos } : n)) }),

    moveNode: (id, pos) =>
      save({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...pos } : n)) }),

    connect: (source, target) => {
      if (source === target) return;
      const id = `${source}-${target}`;
      if (get().edges.some((e) => e.id === id)) return;
      saveStruct({ edges: [...get().edges, { id, source, target }] });
    },

    removeEdge: (id) => saveStruct({ edges: get().edges.filter((e) => e.id !== id) }),

    setSize: (id, size) =>
      saveStruct({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, size } : n)) }),

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
      const rps = Math.max(0, Math.round(offeredLoad));
      save({ users: rps * get().thinkTimeSec });
    },

    setUsers: (users) => save({ users: Math.max(0, Math.round(users)) }),

    setThinkTime: (thinkTimeSec) => save({ thinkTimeSec: Math.max(1, Math.round(thinkTimeSec)) }),

    setCallsPerRequest: (id, calls) =>
      saveStruct({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, callsPerRequest: Math.max(1, Math.round(calls)) } : n,
        ),
      }),

    dismissNudge: (id) => save({ dismissedNudges: [...get().dismissedNudges, id] }),

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
      }),

    loadExample: (id) => {
      const ex = EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      const d = ex.build();
      save({ nodes: d.nodes, edges: d.edges, users: d.users, thinkTimeSec: d.thinkTimeSec });
      set({ exampleId: id });
    },

    clear: () => saveStruct({ nodes: [], edges: [] }),
  };
});
