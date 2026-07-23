// 100-arena-capacity-sandbox — the Arena store + localStorage persistence (AC9).

import { beforeEach, describe, expect, it } from "vitest";

import { CALL_SHAPE_BOUNDS, DEFAULT_CALL_SHAPE } from "./components";
import { EXAMPLES } from "./examples";
import { equilibriumRps, rpsOf } from "./model";
import { ARENA_STORAGE_KEY, loadArena, NOTE_MAX, useArena } from "./store";

beforeEach(() => {
  localStorage.clear();
  // Reset the singleton store to a clean slate between tests.
  useArena.setState({
    nodes: [],
    edges: [],
    offeredLoad: 1000,
    users: 30_000,
    thinkTimeSec: 30,
    exampleId: null,
    selectedId: null,
    selectedEdgeId: null,
  });
});

describe("arena store — Little's Law drive (103 AC1)", () => {
  it("derives offeredLoad = users / thinkTime from either control", () => {
    useArena.getState().setUsers(60_000);
    expect(useArena.getState().offeredLoad).toBe(2000); // 60k / 30s
    useArena.getState().setThinkTime(60);
    expect(useArena.getState().offeredLoad).toBe(1000); // 60k / 60s
    expect(useArena.getState().users).toBe(60_000);
  });

  it("migrates a pre-103 blob (no users) by deriving users from the stored rps", () => {
    localStorage.setItem(
      ARENA_STORAGE_KEY,
      JSON.stringify({ nodes: [], edges: [], offeredLoad: 500 }),
    );
    const restored = loadArena();
    expect(restored.offeredLoad).toBe(500); // the modeled rps is preserved
    expect(restored.users / restored.thinkTimeSec).toBeCloseTo(500, 0);
  });

  it("setCallsPerRequest updates a node (min 1) and clears the example selection", () => {
    const id = useArena.getState().addNode("llm", { x: 0, y: 0 });
    useArena.getState().loadExample("simple-rag");
    const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
    useArena.getState().setCallsPerRequest(llm.id, 3);
    expect(useArena.getState().nodes.find((n) => n.id === llm.id)!.callsPerRequest).toBe(3);
    expect(useArena.getState().exampleId).toBeNull(); // structural edit
    void id;
  });
});

describe("arena store — composition + persistence (AC9)", () => {
  it("adds nodes, wires an edge, scales, and round-trips through localStorage", () => {
    const s = useArena.getState();
    const be = s.addNode("backend", { x: 0, y: 0 });
    const db = s.addNode("appDb", { x: 200, y: 0 });
    useArena.getState().connect(be, db);
    useArena.getState().setReplicas(db, 3);
    useArena.getState().setSize(db, "large");
    useArena.getState().setOfferedLoad(5000);

    const live = useArena.getState();
    expect(live.nodes).toHaveLength(2);
    expect(live.edges).toHaveLength(1);
    expect(live.edges[0]).toMatchObject({ source: be, target: db });
    const dbNode = live.nodes.find((n) => n.id === db)!;
    expect(dbNode.replicas).toBe(3);
    expect(dbNode.size).toBe("large");

    // Persisted blob rehydrates to the same design.
    // 110 — offeredLoad is DERIVED (closed-loop equilibrium); setOfferedLoad is a
    // demand shim (back-solves users), so the stored rate is the equilibrium.
    const restored = loadArena();
    expect(localStorage.getItem(ARENA_STORAGE_KEY)).toBeTruthy();
    expect(useArena.getState().users).toBe(5000 * 30); // demand back-solved
    expect(restored.offeredLoad).toBe(useArena.getState().offeredLoad);
    expect(restored.nodes).toHaveLength(2);
    expect(restored.edges).toHaveLength(1);
    expect(restored.nodes.find((n) => n.id === db)?.replicas).toBe(3);
    expect(restored.nodes.find((n) => n.id === db)?.size).toBe("large");
  });

  it("seeds the default sample on a first visit but respects a returning canvas (AC1, AC2)", () => {
    localStorage.removeItem(ARENA_STORAGE_KEY); // truly fresh — key absent
    const fresh = loadArena();
    expect(fresh.nodes.length).toBeGreaterThanOrEqual(3); // default sample, not empty

    // A returning user who cleared the canvas has a PRESENT (empty) blob — respect it.
    localStorage.setItem(
      ARENA_STORAGE_KEY,
      JSON.stringify({ nodes: [], edges: [], offeredLoad: 750 }),
    );
    const returning = loadArena();
    expect(returning.nodes).toHaveLength(0);
    expect(returning.offeredLoad).toBe(750);
  });

  it("loadDesign replaces the canvas with a preset and persists it (AC4)", () => {
    const preset = EXAMPLES.find((e) => e.id === "scale-llm")!.build();
    useArena.getState().loadDesign(preset);

    const live = useArena.getState();
    expect(live.nodes).toHaveLength(preset.nodes.length);
    expect(live.users).toBe(preset.users);
    // 110 — the effective rate is the closed-loop equilibrium of THIS design.
    expect(live.offeredLoad).toBe(
      Math.round(
        equilibriumRps(
          { nodes: preset.nodes, edges: preset.edges },
          preset.users,
          preset.thinkTimeSec,
        ),
      ),
    );
    // survives a reload
    const restored = loadArena();
    expect(restored.nodes).toHaveLength(preset.nodes.length);
    expect(restored.edges).toHaveLength(preset.edges.length);
  });

  it("loadExample marks the active preset; a structural edit clears it (AC4)", () => {
    useArena.getState().loadExample("scale-llm");
    expect(useArena.getState().exampleId).toBe("scale-llm");
    expect(useArena.getState().nodes.length).toBeGreaterThan(0);

    // A structural edit means the canvas no longer matches the preset → deselect.
    const anyNode = useArena.getState().nodes[0].id;
    useArena.getState().setReplicas(anyNode, 7);
    expect(useArena.getState().exampleId).toBeNull();

    // Adding a node also clears it.
    useArena.getState().loadExample("simple-rag");
    expect(useArena.getState().exampleId).toBe("simple-rag");
    useArena.getState().addNode("cache", { x: 0, y: 0 });
    expect(useArena.getState().exampleId).toBeNull();
  });

  it("moving the load slider or dragging a node keeps the preset selected (AC4)", () => {
    useArena.getState().loadExample("simple-rag");
    useArena.getState().setOfferedLoad(9999);
    expect(useArena.getState().exampleId).toBe("simple-rag"); // load exploration is fine
    const id = useArena.getState().nodes[0].id;
    useArena.getState().dragNode(id, { x: 5, y: 5 });
    expect(useArena.getState().exampleId).toBe("simple-rag");
  });

  it("setRegion annotates a node, persists, and clears the example selection (106 AC1)", () => {
    useArena.getState().loadExample("prod");
    const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
    useArena.getState().setRegion(llm.id, "sa-east");
    expect(useArena.getState().nodes.find((n) => n.id === llm.id)!.region).toBe("sa-east");
    expect(useArena.getState().exampleId).toBeNull(); // structural edit
    expect(loadArena().nodes.find((n) => n.id === llm.id)!.region).toBe("sa-east"); // persisted

    useArena.getState().setRegion(llm.id, null); // clearable
    expect(useArena.getState().nodes.find((n) => n.id === llm.id)!.region).toBeUndefined();

    useArena.getState().setRegion(llm.id, "not-a-region"); // invalid → ignored
    expect(useArena.getState().nodes.find((n) => n.id === llm.id)!.region).toBeUndefined();
  });

  it("dropNode adds a FREE node — wiring is the user's gesture (116 revisits 107 AC1)", () => {
    const gw = useArena.getState().addNode("aiGateway", { x: 0, y: 0 });
    useArena.getState().select(gw);

    // Even with a node selected, a drop never wires automatically.
    const llm = useArena.getState().dropNode("llm", { x: 200, y: 0 });
    const s = useArena.getState();
    expect(s.edges).toHaveLength(0);
    expect(s.selectedId).toBe(llm); // still selected, so the scale panel opens
    expect(loadArena().edges).toHaveLength(0); // persisted like any edit

    // The user connects explicitly.
    useArena.getState().connect(gw, llm);
    expect(useArena.getState().edges).toContainEqual({
      id: `${gw}-${llm}`,
      source: gw,
      target: llm,
    });
  });

  it("removing the selected node clears the selection (107 AC2)", () => {
    const id = useArena.getState().addNode("backend", { x: 0, y: 0 });
    useArena.getState().select(id);
    useArena.getState().removeNode(id);
    expect(useArena.getState().selectedId).toBeNull();
  });

  it("dragNode updates state without persisting; moveNode commits on drop", () => {
    const id = useArena.getState().addNode("backend", { x: 0, y: 0 });
    localStorage.removeItem(ARENA_STORAGE_KEY); // clear the add's persisted blob

    useArena.getState().dragNode(id, { x: 50, y: 60 });
    expect(useArena.getState().nodes[0]).toMatchObject({ x: 50, y: 60 }); // live state moved
    expect(localStorage.getItem(ARENA_STORAGE_KEY)).toBeNull(); // but NOT persisted mid-drag

    useArena.getState().moveNode(id, { x: 90, y: 90 }); // drop commits
    expect(loadArena().nodes[0]).toMatchObject({ x: 90, y: 90 });
  });

  it("derives offeredLoad from the design too — scaling the bottleneck raises the rate (110 AC7)", () => {
    useArena.getState().loadExample("scale-llm"); // 16k users / 20s → demand 800
    const before = useArena.getState().offeredLoad;
    expect(before).toBeLessThan(rpsOf(16_000, 20)); // model latency throttles the closed loop

    const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
    useArena.getState().setReplicas(llm.id, 8); // more deployments → higher equilibrium
    const after = useArena.getState().offeredLoad;
    expect(after).toBeGreaterThan(before);

    // Hydration recomputes the same equilibrium from users/think/design (110 AC7).
    expect(loadArena().offeredLoad).toBe(after);
  });

  it("dismissing a fan-out nudge persists; removing the edge clears it (115 AC1)", () => {
    const be = useArena.getState().addNode("backend", { x: 0, y: 0 });
    useArena.getState().select(null);
    const llm = useArena.getState().addNode("llm", { x: 200, y: 0 });
    useArena.getState().connect(be, llm);

    useArena.getState().dismissNudge(llm);
    expect(useArena.getState().dismissedNudges).toContain(llm);
    expect(loadArena().dismissedNudges).toContain(llm); // persisted

    // Removing the wiring removes the nudge — the dismissal is pruned so a
    // future re-wire nudges again.
    useArena.getState().removeEdge(`${be}-${llm}`);
    expect(useArena.getState().dismissedNudges).toEqual([]);
  });

  it("hydrates pre-115 blobs without dismissedNudges to [] (115)", () => {
    localStorage.setItem(
      ARENA_STORAGE_KEY,
      JSON.stringify({ nodes: [], edges: [], offeredLoad: 500 }),
    );
    expect(loadArena().dismissedNudges).toEqual([]);
  });

  it("generates unique node ids and removing a node drops its edges", () => {
    const s = useArena.getState();
    const a = s.addNode("backend", { x: 0, y: 0 });
    const b = s.addNode("backend", { x: 0, y: 0 });
    expect(a).not.toBe(b);
    useArena.getState().connect(a, b);
    expect(useArena.getState().edges).toHaveLength(1);
    useArena.getState().removeNode(b);
    expect(useArena.getState().nodes).toHaveLength(1);
    expect(useArena.getState().edges).toHaveLength(0); // dangling edge pruned
  });
});

// --- 116-arena-openai-calibration ----------------------------------------------

describe("region defaults (116 AC3)", () => {
  it("a new infrastructure node lands in us-east (East US) by default", () => {
    for (const kind of ["backend", "llm", "vectorDb", "aiGateway"] as const) {
      const id = useArena.getState().addNode(kind, { x: 0, y: 0 });
      expect(useArena.getState().nodes.find((n) => n.id === id)!.region).toBe("us-east");
    }
  });

  it("the client (load source) gets no region — it is the users, not infrastructure", () => {
    const id = useArena.getState().addNode("client", { x: 0, y: 0 });
    expect(useArena.getState().nodes.find((n) => n.id === id)!.region).toBeUndefined();
  });

  it("dropNode inherits the same default", () => {
    useArena.getState().select(null);
    const id = useArena.getState().dropNode("mcp", { x: 0, y: 0 });
    expect(useArena.getState().nodes.find((n) => n.id === id)!.region).toBe("us-east");
  });
});

// --- 117-arena-llm-call-shape ----------------------------------------------------

describe("arena store — the workload call shape (117 AC5)", () => {
  it("defaults to the stated agent call and round-trips through localStorage", () => {
    expect(loadArena().callShape).toEqual(DEFAULT_CALL_SHAPE);
    useArena.getState().setCallShape(8000, 2000);
    expect(useArena.getState().callShape).toEqual({ inputTokens: 8000, outputTokens: 2000 });
    const restored = loadArena();
    expect(restored.callShape).toEqual({ inputTokens: 8000, outputTokens: 2000 });
  });

  it("validates a persisted blob: garbage or out-of-range shapes fall back to default", () => {
    localStorage.setItem(
      ARENA_STORAGE_KEY,
      JSON.stringify({ nodes: [], edges: [], callShape: { inputTokens: "big", outputTokens: -3 } }),
    );
    expect(loadArena().callShape).toEqual(DEFAULT_CALL_SHAPE);
  });

  it("clamps to the slider bounds and clears the example selection (a structural change)", () => {
    useArena.getState().loadExample("simple-rag");
    useArena.getState().setCallShape(1, 10_000_000);
    const shape = useArena.getState().callShape;
    expect(shape.inputTokens).toBe(CALL_SHAPE_BOUNDS.inputTokens.min);
    expect(shape.outputTokens).toBe(CALL_SHAPE_BOUNDS.outputTokens.max);
    expect(useArena.getState().exampleId).toBeNull();
  });

  it("recomputes the closed-loop equilibrium: a heavier payload throttles the rate", () => {
    useArena.getState().loadExample("scale-llm");
    const before = useArena.getState().offeredLoad;
    useArena.getState().setCallShape(8000, 2000);
    expect(useArena.getState().offeredLoad).toBeLessThan(before);
  });

  it("loadExample resets the shape so preset claims stay true", () => {
    useArena.getState().setCallShape(8000, 2000);
    useArena.getState().loadExample("simple-rag");
    expect(useArena.getState().callShape).toEqual(DEFAULT_CALL_SHAPE);
  });
});

// --- 119-arena-example-callouts ----------------------------------------------------

describe("arena store — example callouts visibility (119 AC3/AC4)", () => {
  it("loadExample shows callouts again after a dismissal (transient flag)", () => {
    useArena.getState().loadExample("simple-rag");
    expect(useArena.getState().calloutsHidden).toBe(false);
    useArena.getState().hideCallouts();
    expect(useArena.getState().calloutsHidden).toBe(true);
    useArena.getState().loadExample("scale-llm");
    expect(useArena.getState().calloutsHidden).toBe(false);
  });

  it("a structural edit clears the exampleId — the callouts' visibility source", () => {
    useArena.getState().loadExample("simple-rag");
    expect(useArena.getState().exampleId).toBe("simple-rag");
    useArena.getState().addNode("cache", { x: 0, y: 0 });
    expect(useArena.getState().exampleId).toBeNull();
  });
});

// --- 120-arena-annotations ---------------------------------------------------------

describe("arena store — node/edge annotations (120)", () => {
  it("stores a note on a node, persists it, and survives a reload (AC1)", () => {
    const id = useArena.getState().addNode("llm", { x: 0, y: 0 });
    useArena.getState().setNodeNote(id, "4 XLarge — one region caps at 3k calls/s");
    expect(useArena.getState().nodes.find((n) => n.id === id)!.note).toBe(
      "4 XLarge — one region caps at 3k calls/s",
    );
    expect(loadArena().nodes.find((n) => n.id === id)!.note).toBe(
      "4 XLarge — one region caps at 3k calls/s",
    );
  });

  it("stores a note on an edge and persists it (AC2)", () => {
    const be = useArena.getState().addNode("backend", { x: 0, y: 0 });
    const llm = useArena.getState().addNode("llm", { x: 200, y: 0 });
    useArena.getState().connect(be, llm);
    const edgeId = `${be}-${llm}`;
    useArena.getState().setEdgeNote(edgeId, "fallback pool in us-west");
    expect(useArena.getState().edges.find((e) => e.id === edgeId)!.note).toBe(
      "fallback pool in us-west",
    );
    expect(loadArena().edges.find((e) => e.id === edgeId)!.note).toBe("fallback pool in us-west");
  });

  it("selectEdge and select are mutually exclusive (AC2)", () => {
    const be = useArena.getState().addNode("backend", { x: 0, y: 0 });
    const llm = useArena.getState().addNode("llm", { x: 200, y: 0 });
    useArena.getState().connect(be, llm);
    const edgeId = `${be}-${llm}`;

    useArena.getState().select(be);
    expect(useArena.getState().selectedId).toBe(be);
    useArena.getState().selectEdge(edgeId);
    expect(useArena.getState().selectedEdgeId).toBe(edgeId);
    expect(useArena.getState().selectedId).toBeNull(); // selecting an edge drops the node

    useArena.getState().select(llm);
    expect(useArena.getState().selectedId).toBe(llm);
    expect(useArena.getState().selectedEdgeId).toBeNull(); // selecting a node drops the edge
  });

  it("edits update the note; clearing (or whitespace) removes the key entirely (AC4)", () => {
    const id = useArena.getState().addNode("backend", { x: 0, y: 0 });
    useArena.getState().setNodeNote(id, "first");
    useArena.getState().setNodeNote(id, "second");
    expect(useArena.getState().nodes.find((n) => n.id === id)!.note).toBe("second");

    useArena.getState().setNodeNote(id, "   ");
    const node = useArena.getState().nodes.find((n) => n.id === id)!;
    expect(node.note).toBeUndefined();
    expect("note" in node).toBe(false); // no empty-string residue
  });

  it("caps a note at NOTE_MAX characters (AC6)", () => {
    const id = useArena.getState().addNode("backend", { x: 0, y: 0 });
    useArena.getState().setNodeNote(id, "x".repeat(NOTE_MAX + 50));
    expect(useArena.getState().nodes.find((n) => n.id === id)!.note!.length).toBe(NOTE_MAX);
  });

  it("annotating is not a structural edit — it keeps the loaded example selected", () => {
    useArena.getState().loadExample("simple-rag");
    const id = useArena.getState().nodes[0].id;
    useArena.getState().setNodeNote(id, "why this box");
    expect(useArena.getState().exampleId).toBe("simple-rag");
  });

  it("a note's lifetime follows its element: remove/clear leave no notes behind (AC5)", () => {
    const be = useArena.getState().addNode("backend", { x: 0, y: 0 });
    const llm = useArena.getState().addNode("llm", { x: 200, y: 0 });
    useArena.getState().connect(be, llm);
    const edgeId = `${be}-${llm}`;
    useArena.getState().setNodeNote(be, "node note");
    useArena.getState().setEdgeNote(edgeId, "edge note");

    // Removing the edge drops its note.
    useArena.getState().removeEdge(edgeId);
    expect(useArena.getState().edges).toHaveLength(0);

    // Removing the node drops its note; clear wipes everything.
    useArena.getState().removeNode(be);
    expect(useArena.getState().nodes.find((n) => n.id === be)).toBeUndefined();
    useArena.getState().clear();
    expect(loadArena().nodes.every((n) => n.note === undefined)).toBe(true);
  });

  it("hydrates a pre-120 blob (no notes) cleanly and sanitizes bad notes (AC5)", () => {
    // A pre-120 design has no `note` fields at all.
    localStorage.setItem(
      ARENA_STORAGE_KEY,
      JSON.stringify({
        nodes: [{ id: "backend-1", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0 }],
        edges: [],
        offeredLoad: 500,
      }),
    );
    expect(loadArena().nodes[0].note).toBeUndefined();

    // A corrupted blob: a non-string note and an over-long note are dropped/capped.
    localStorage.setItem(
      ARENA_STORAGE_KEY,
      JSON.stringify({
        nodes: [
          { id: "a", kind: "backend", size: "medium", replicas: 1, x: 0, y: 0, note: 42 },
          { id: "b", kind: "llm", size: "medium", replicas: 1, x: 0, y: 0, note: "y".repeat(500) },
        ],
        edges: [],
        offeredLoad: 500,
      }),
    );
    const restored = loadArena();
    expect(restored.nodes.find((n) => n.id === "a")!.note).toBeUndefined(); // non-string dropped
    expect(restored.nodes.find((n) => n.id === "b")!.note!.length).toBe(NOTE_MAX); // capped
  });
});

// --- 124-arena-auto-arrange ---------------------------------------------------------

describe("arena store — applyPositions (124 AC3)", () => {
  it("moves every listed node, keeps the loaded example selected, and persists", () => {
    useArena.getState().loadExample("simple-rag");
    const before = useArena.getState().nodes;
    const pos = Object.fromEntries(before.map((n, i) => [n.id, { x: i * 300, y: i * 10 }]));

    useArena.getState().applyPositions(pos);

    const after = useArena.getState().nodes;
    for (const [i, n] of after.entries()) {
      expect({ x: n.x, y: n.y }).toEqual({ x: i * 300, y: i * 10 });
    }
    // Non-structural: the preset (and thus its notes panel) survives the tidy.
    expect(useArena.getState().exampleId).toBe("simple-rag");
    // Persisted in one commit.
    const blob = JSON.parse(localStorage.getItem(ARENA_STORAGE_KEY)!);
    expect(blob.nodes.find((n: { id: string }) => n.id === after[1].id).x).toBe(300);
  });

  it("ignores unknown ids and leaves unlisted nodes untouched", () => {
    const id = useArena.getState().addNode("backend", { x: 7, y: 8 });
    useArena.getState().applyPositions({ ghost: { x: 1, y: 1 } });
    const n = useArena.getState().nodes.find((x) => x.id === id)!;
    expect({ x: n.x, y: n.y }).toEqual({ x: 7, y: 8 });
  });
});
