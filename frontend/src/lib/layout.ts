// Auto-layout for the canvas. The diagram is three columns — client, the
// middle stack (API over Agent), and the data services column — each stacked
// top-down. Nodes can be collapsed (compact) or expanded (taller, showing
// inner detail); expanding one reflows the ones below it in its column. Tier
// boxes wrap their stations and the private-network boundary wraps the private
// tiers, all recomputed from the current expand state.
//
// Geometry lives here; identity/content (titles, clouds, hops) lives in
// stations.ts. Keeping the two apart is what makes expand/collapse a pure
// re-layout.

import type { ResolvedSelection } from "./selection";
import { visibleStationIdsFor } from "./stations";
import type { StationId, TierId } from "./stations";

export const NODE_WIDTH = 212;

const COLLAPSED_H = 108;
// Some stations carry a permanent affordance below the readout in their
// collapsed body (currently only "Open full view" on stations with a drill-in
// detail view — i.e. the Agent). They get a taller collapsed height so the
// button doesn't overflow. Kept as a sparse override map so a future detail
// view (e.g. LLM with token charts) can opt in without touching the default.
const COLLAPSED_H_OVERRIDE: Partial<Record<StationId, number>> = {
  agent: 140,
  // 068-llm-rounds-history — the LLM node now carries the "Open full view" button.
  llm: 140,
};
// Expanded heights are tuned per station to fit their inner content. The
// 008-scenario-framework preview nodes are collapsed-only (no expanded body),
// so they keep the collapsed height.
const EXPANDED_H: Record<StationId, number> = {
  frontend: 176,
  // 088-network-layer — the ingress appliances are collapsed-only tiles (their
  // detail lives in the Inspector), so expanded == collapsed height.
  dns: COLLAPSED_H,
  cdn: COLLAPSED_H,
  waf: COLLAPSED_H,
  lb: COLLAPSED_H,
  apigw: COLLAPSED_H,
  backend: 188,
  agent: 268,
  database: 184,
  rag: 220,
  pageindex: 212,
  ingestion: 236,
  mcp: 208,
  llm: 244,
  gateway: COLLAPSED_H,
  guardrails: COLLAPSED_H,
  cache: COLLAPSED_H,
  eval: COLLAPSED_H,
  observability: COLLAPSED_H,
  researcher: COLLAPSED_H,
  coder: COLLAPSED_H,
  critic: COLLAPSED_H,
  // 060-intermediate-preview-tiles — collapsed-only preview.
  summarization: COLLAPSED_H,
};

// Advanced-rung sub-agents render as a small row of narrower nodes under the
// orchestrator (the `agent` node), inside the Agent tier — so each agent is its
// own box. They live outside COLUMNS and are positioned by hand below.
const SUBAGENTS: StationId[] = ["researcher", "coder", "critic"];
const SUBAGENT_W = 176; // narrower than NODE_WIDTH to signal "sub" and fit the row
const SUBAGENT_GAP_X = 16; // horizontal gap between sub-agents
const SUBAGENT_GAP_Y = 60; // vertical drop below the orchestrator (room for the tree edges)
// 060-intermediate-preview-tiles — gap above the Summarization preview, which sits
// below the agent (and below the sub-agent row when that row is present).
const SUMMARIZATION_GAP_Y = 28;

/** Render width of a node — sub-agents are narrower than the standard station. */
export function widthOf(id: StationId): number {
  return SUBAGENTS.includes(id) ? SUBAGENT_W : NODE_WIDTH;
}

interface Column {
  x: number;
  gap: number; // vertical gap between stacked stations in this column
  members: StationId[];
}

// Middle column stacks the API tier above the Agent tier (a bigger gap keeps
// their two boxes visually separate). The data column is one tier; the AI-Ops
// column (advanced rung) is the rightmost. Members not in the active scenario
// are filtered out at layout time, so listing them here is harmless.
// 088-network-layer — the ingress chain stations (in transit order) and how far
// the columns to its right slide when the chain is shown. When the chain is off the
// edge column has no visible members and SHIFT is 0, so the layout is byte-for-byte
// today's (AC10).
// 090-waf-after-lb: transit order DNS → CDN → TLS/LB → WAF → API-GW (the LB
// terminates TLS, so the WAF inspects the decrypted request after it).
const NETWORK_IDS: StationId[] = ["dns", "cdn", "lb", "waf", "apigw"];
const EDGE_SHIFT = 300;

interface ColumnSrc extends Column {
  shift?: boolean; // columns right of the edge slide by SHIFT when the chain is on
}

const COLUMNS: ColumnSrc[] = [
  { x: 40, gap: 44, members: ["frontend"] },
  // The ingress chain — a public-zone column between the client and the API, shown
  // only when the `network` component is on (its members are otherwise not visible).
  { x: 312, gap: 24, members: NETWORK_IDS },
  // Big gap between the API and Agent tiers: the vertical Backend→Agent edge
  // label needs to clear the Agent tier's header, which sits above the node.
  { x: 372, gap: 168, members: ["backend", "agent"], shift: true },
  // 034 + 080: ingestion → rag are stacked in write-path order so the upload edges
  // flow downward (ingestion→rag, source-bottom → target-top). Object storage is now
  // a phase inside the ingestion node, not a separate stacked station.
  {
    x: 1016,
    gap: 36,
    members: ["database", "ingestion", "rag", "pageindex", "mcp", "llm"],
    shift: true,
  },
  {
    x: 1320,
    gap: 24,
    members: ["gateway", "guardrails", "cache", "eval", "observability"],
    shift: true,
  },
];

const TOP = 120;

const TIER_OF: Record<StationId, TierId> = {
  frontend: "client",
  // 088-network-layer — the ingress appliances live in the public-zone `edge` tier.
  dns: "edge",
  cdn: "edge",
  waf: "edge",
  lb: "edge",
  apigw: "edge",
  backend: "api",
  agent: "agent",
  database: "services",
  rag: "services",
  pageindex: "services",
  ingestion: "services",
  mcp: "services",
  llm: "services",
  gateway: "aiops",
  guardrails: "aiops",
  cache: "aiops",
  eval: "aiops",
  observability: "aiops",
  researcher: "agent",
  coder: "agent",
  critic: "agent",
  // 060-intermediate-preview-tiles
  summarization: "agent",
};

const PAD = 16; // padding between a tier box and its stations
const LABEL_TOP = 54; // extra room above the top station for the tier label (title + service line)
const BOUND_PAD = 22;
const BOUND_LABEL = 34;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  positions: Record<StationId, { x: number; y: number }>;
  heights: Record<StationId, number>;
  widths: Record<StationId, number>;
  tierBoxes: Record<TierId, Box>;
  boundary: Box;
  // 032-network-boundary — the public-internet / egress frontier: a vertical line
  // at `x` spanning `y..y+h`, in the gap between the client tier and the private
  // boundary (rendered as a dashed line + label, behind the stations).
  publicFrontier: { x: number; y: number; h: number };
}

export function heightOf(id: StationId, expanded: ReadonlySet<StationId>): number {
  return expanded.has(id) ? EXPANDED_H[id] : (COLLAPSED_H_OVERRIDE[id] ?? COLLAPSED_H);
}

// 095-harness-loop-lens — under the Harness lens the collapsed Agent card carries
// two extra harness badges (the "core" marker + the nested Context-window chip),
// which wrap to a second row. Give it a little more height so the subtitle/readout
// don't overlap. Only the Agent, only when collapsed + Harness lens.
const AGENT_HARNESS_EXTRA_H = 28;

export function computeLayout(
  expanded: ReadonlySet<StationId>,
  // 061-scenario-builder — the resolved à-la-carte selection (which stations are on +
  // the agent runtime). Subsumes the prior scenario/ragless/track inputs.
  sel: ResolvedSelection,
  // 035-conditional-upload-nodes — when false (default), the upload write-path
  // nodes (storage, ingestion) are excluded so the data column reflows shorter.
  showUpload = false,
  // 095-harness-loop-lens — true only when the Harness lens is active, so the
  // Agent card gets room for its extra harness badges (see AGENT_HARNESS_EXTRA_H).
  harnessLens = false,
): LayoutResult {
  const positions = {} as Record<StationId, { x: number; y: number }>;
  const heights = {} as Record<StationId, number>;
  const visible = new Set(visibleStationIdsFor(sel, showUpload));

  // 088-network-layer — when the ingress chain is shown, the columns to its right
  // slide over to make room for the edge column; otherwise SHIFT is 0 (today's layout).
  const networkOn = NETWORK_IDS.some((id) => visible.has(id));
  const shiftX = networkOn ? EDGE_SHIFT : 0;

  for (const col of COLUMNS) {
    const colX = col.x + (col.shift ? shiftX : 0);
    let y = TOP;
    for (const id of col.members) {
      if (!visible.has(id)) continue; // not part of this rung — skip
      let h = heightOf(id, expanded);
      // 095 — the collapsed Agent grows a touch under the Harness lens to fit its
      // core + Context-window badges (expanded already has ample room).
      if (harnessLens && id === "agent" && !expanded.has(id)) h += AGENT_HARNESS_EXTRA_H;
      positions[id] = { x: colX, y };
      heights[id] = h;
      y += h + col.gap;
    }
  }

  // Multi-agent preview (advanced): lay the sub-agents in a row directly under
  // the orchestrator (`agent`), left-aligned with it. They sit in the Agent tier,
  // so the tier box below auto-grows to wrap the whole team.
  if (positions.agent) {
    let x = positions.agent.x;
    const rowY = positions.agent.y + heights.agent + SUBAGENT_GAP_Y;
    for (const id of SUBAGENTS) {
      if (!visible.has(id)) continue;
      positions[id] = { x, y: rowY };
      heights[id] = COLLAPSED_H;
      x += SUBAGENT_W + SUBAGENT_GAP_X;
    }
  }

  // 060-intermediate-preview-tiles — the Agent-Design preview (Summarization) is a
  // single full-width node below the agent. It drops below the sub-agent row when
  // that row is present (advanced), so it never overlaps the multi-agent team.
  if (visible.has("summarization") && positions.agent) {
    const agentBottom = positions.agent.y + heights.agent;
    const subagentsShown = SUBAGENTS.some((id) => visible.has(id));
    const top = subagentsShown ? agentBottom + SUBAGENT_GAP_Y + COLLAPSED_H : agentBottom;
    positions.summarization = { x: positions.agent.x, y: top + SUMMARIZATION_GAP_Y };
    heights.summarization = COLLAPSED_H;
  }

  const widths = {} as Record<StationId, number>;
  for (const id of Object.keys(positions) as StationId[]) widths[id] = widthOf(id);

  const tierMembers: Record<TierId, StationId[]> = {
    client: [],
    edge: [],
    api: [],
    agent: [],
    services: [],
    aiops: [],
  };
  for (const id of Object.keys(positions) as StationId[]) tierMembers[TIER_OF[id]].push(id);

  const tierBoxes = {} as Record<TierId, Box>;
  for (const tid of Object.keys(tierMembers) as TierId[]) {
    const ids = tierMembers[tid];
    if (ids.length === 0) continue; // tier absent from this rung (e.g. aiops in simple)
    const minX = Math.min(...ids.map((i) => positions[i].x));
    const minY = Math.min(...ids.map((i) => positions[i].y));
    const maxX = Math.max(...ids.map((i) => positions[i].x + widths[i]));
    const maxY = Math.max(...ids.map((i) => positions[i].y + heights[i]));
    tierBoxes[tid] = {
      x: minX - PAD,
      y: minY - LABEL_TOP,
      w: maxX - minX + 2 * PAD,
      h: maxY - (minY - LABEL_TOP) + PAD,
    };
  }

  // The private network wraps every private tier present in this rung (not the
  // public client).
  const priv = (["api", "agent", "services", "aiops"] as TierId[]).filter((t) => tierBoxes[t]);
  const bx = Math.min(...priv.map((t) => tierBoxes[t].x));
  const by = Math.min(...priv.map((t) => tierBoxes[t].y));
  const bMaxX = Math.max(...priv.map((t) => tierBoxes[t].x + tierBoxes[t].w));
  const bMaxY = Math.max(...priv.map((t) => tierBoxes[t].y + tierBoxes[t].h));
  const boundary: Box = {
    x: bx - BOUND_PAD,
    y: by - BOUND_LABEL,
    w: bMaxX - bx + 2 * BOUND_PAD,
    h: bMaxY - by + BOUND_LABEL + BOUND_PAD,
  };

  // The public-internet / egress frontier: a vertical line midway through the gap
  // between the public side's right edge and the private boundary's left edge,
  // spanning the boundary's height. The public side is the client tier, or — when
  // the ingress chain is shown (088) — the `edge` tier (DNS·CDN·LB·WAF·GW are all
  // public appliances, so the frontier sits after them, just before the private API).
  const publicTier = tierBoxes.edge ?? tierBoxes.client;
  const publicRight = publicTier ? publicTier.x + publicTier.w : boundary.x - 18;
  const frontierX = (publicRight + boundary.x) / 2;
  const publicFrontier = { x: frontierX, y: boundary.y, h: boundary.h };

  return { positions, heights, widths, tierBoxes, boundary, publicFrontier };
}
