// 100-arena-capacity-sandbox — the Arena store + localStorage persistence (AC9).

import { beforeEach, describe, expect, it } from "vitest";

import { EXAMPLES } from "./examples";
import { ARENA_STORAGE_KEY, loadArena, useArena } from "./store";

beforeEach(() => {
  localStorage.clear();
  // Reset the singleton store to a clean slate between tests.
  useArena.setState({ nodes: [], edges: [], offeredLoad: 1000, exampleId: null });
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
    const restored = loadArena();
    expect(localStorage.getItem(ARENA_STORAGE_KEY)).toBeTruthy();
    expect(restored.offeredLoad).toBe(5000);
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
    expect(live.offeredLoad).toBe(preset.offeredLoad);
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

  it("dragNode updates state without persisting; moveNode commits on drop", () => {
    const id = useArena.getState().addNode("backend", { x: 0, y: 0 });
    localStorage.removeItem(ARENA_STORAGE_KEY); // clear the add's persisted blob

    useArena.getState().dragNode(id, { x: 50, y: 60 });
    expect(useArena.getState().nodes[0]).toMatchObject({ x: 50, y: 60 }); // live state moved
    expect(localStorage.getItem(ARENA_STORAGE_KEY)).toBeNull(); // but NOT persisted mid-drag

    useArena.getState().moveNode(id, { x: 90, y: 90 }); // drop commits
    expect(loadArena().nodes[0]).toMatchObject({ x: 90, y: 90 });
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
