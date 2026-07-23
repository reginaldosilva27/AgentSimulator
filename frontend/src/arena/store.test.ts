// 100-arena-capacity-sandbox — the Arena store + localStorage persistence (AC9).

import { beforeEach, describe, expect, it } from "vitest";

import { EXAMPLES } from "./examples";
import { equilibriumRps, rpsOf } from "./model";
import { ARENA_STORAGE_KEY, loadArena, useArena } from "./store";

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

  it("dropNode auto-wires from the selected node and selects the new one (107 AC1/AC2)", () => {
    const gw = useArena.getState().addNode("aiGateway", { x: 0, y: 0 });
    useArena.getState().select(gw);

    const llm = useArena.getState().dropNode("llm", { x: 200, y: 0 });
    const s = useArena.getState();
    expect(s.edges).toContainEqual({ id: `${gw}-${llm}`, source: gw, target: llm });
    expect(s.selectedId).toBe(llm); // chaining: the next drop wires from the LLM
    expect(loadArena().edges).toHaveLength(1); // persisted like any edit

    // With nothing selected, a drop adds a free node (no edge).
    useArena.getState().select(null);
    useArena.getState().dropNode("cache", { x: 400, y: 0 });
    expect(useArena.getState().edges).toHaveLength(1);
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
    useArena.getState().loadExample("scale-llm"); // 6k users / 20s → demand 300
    const before = useArena.getState().offeredLoad;
    expect(before).toBeLessThan(rpsOf(6_000, 20)); // model latency throttles the closed loop

    const llm = useArena.getState().nodes.find((n) => n.kind === "llm")!;
    useArena.getState().setSize(llm.id, "xlarge"); // faster model → higher equilibrium
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
