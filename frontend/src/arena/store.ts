// 100-arena-capacity-sandbox — the Arena's global store (design + offered load),
// persisted to localStorage (`agentsim.arena`), mirroring `useSelection`.
//
// Frontend-only: no backend, no DB. Node ids are generated from a monotonic
// counter (not Date.now/Math.random) so composition is deterministic and
// test-friendly. The UI (ArenaCanvas/ArenaNode) is a pure projection of this
// store fed through `computeMetrics` (model.ts).

import { create } from "zustand";

import { DEFAULT_HIT_RATIO, INSTANCE_SIZES, type ArenaKind, type InstanceSize } from "./components";
import { EXAMPLES, defaultDesign } from "./examples";
import type { ArenaEdge, ArenaNodeSpec } from "./model";

/** A placed node: the model spec plus its canvas position. */
export interface ArenaNode extends ArenaNodeSpec {
  x: number;
  y: number;
}

export interface ArenaState {
  nodes: ArenaNode[];
  edges: ArenaEdge[];
  offeredLoad: number;
}

export const ARENA_STORAGE_KEY = "agentsim.arena";
const DEFAULT_LOAD = 1000;

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
        return { nodes, edges, offeredLoad };
      }
    } catch {
      // fall through
    }
  }
  return { nodes: [], edges: [], offeredLoad: DEFAULT_LOAD };
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
  /** Replace the whole canvas with a design (e.g. an example preset) + persist. */
  loadDesign: (design: ArenaState) => void;
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
  const save = (patch: Partial<ArenaState>) => {
    const { nodes, edges, offeredLoad } = { ...get(), ...patch };
    commit(set, { nodes, edges, offeredLoad });
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

    addNode: (kind, pos) => {
      const id = nextId(kind, get().nodes);
      const node: ArenaNode = {
        id,
        kind,
        size: "medium",
        replicas: 1,
        x: pos.x,
        y: pos.y,
        ...(kind === "cache" ? { hitRatio: DEFAULT_HIT_RATIO } : {}),
      };
      saveStruct({ nodes: [...get().nodes, node] });
      return id;
    },

    removeNode: (id) =>
      saveStruct({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      }),

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

    setOfferedLoad: (offeredLoad) => save({ offeredLoad: Math.max(0, Math.round(offeredLoad)) }),

    loadDesign: (design) =>
      save({ nodes: design.nodes, edges: design.edges, offeredLoad: design.offeredLoad }),

    loadExample: (id) => {
      const ex = EXAMPLES.find((e) => e.id === id);
      if (!ex) return;
      const d = ex.build();
      commit(set, { nodes: d.nodes, edges: d.edges, offeredLoad: d.offeredLoad });
      set({ exampleId: id });
    },

    clear: () => saveStruct({ nodes: [], edges: [] }),
  };
});
