// 006-interactive-experiments — per-conversation experiment knobs.
//
// 043-persisted-agent moved the four "agent identity" fields (system prompt,
// agent prompt, model, enabled tools) into the SQLite `agents` table — they
// now persist across reloads and are edited via `PATCH /api/agents/{id}` from
// the Agent Anatomy dialog. What stays here are the **per-run** experiment
// levers that aren't part of the agent's identity:
//
//   - `topK`: RAG top-k for this conversation (a retrieval knob, not the agent)
//   - `simulateFailure` (017): forces a failure on the next run
//
// Both are still in memory (single-instance, §8). A `null` field means "no
// override": the request omits it and the backend uses its default, so an
// untouched panel reproduces today's behavior.

import { create } from "zustand";

import { currentRequestInputs, useSelection } from "./selection";

export interface ConvExperiment {
  topK: number | null; // null = backend default top-k
  // 017-failure-injection — force a failure on the next run; "none" = unchanged.
  simulateFailure: string; // "none" | "tool_error" | "llm_timeout"
  // 055-rerank-score-threshold — minimum rerank score (Intermediate); null/0 = no
  // filter. The reranker drops kept chunks scoring below this before the prompt.
  rerankThreshold: number | null;
  // 056-ragless-pageindex — run the reasoning-based PageIndex path alongside Vector
  // RAG (Intermediate rung only). false = today's behavior, byte-for-byte.
  ragless: boolean;
  // 098-verify-reflection-loop — run a critic pass after drafting that can loop back
  // for a bounded revision. false = today's behavior, byte-for-byte (no agent.verify).
  verify: boolean;
}

export const DEFAULT_EXPERIMENT: ConvExperiment = {
  topK: null,
  simulateFailure: "none",
  rerankThreshold: null,
  ragless: false,
  verify: false,
};

// Draft conversations (not yet persisted) park their settings here until
// `adopt` migrates them onto the real conversation id.
export const DRAFT_KEY = "__draft__";

function keyOf(conv: string | null): string {
  return conv ?? DRAFT_KEY;
}

interface ExperimentState {
  byConv: Record<string, ConvExperiment>;
  getFor: (conv: string | null) => ConvExperiment;
  setTopK: (conv: string | null, value: number | null) => void;
  setSimulateFailure: (conv: string | null, value: string) => void;
  setRerankThreshold: (conv: string | null, value: number | null) => void;
  setRagless: (conv: string | null, value: boolean) => void;
  setVerify: (conv: string | null, value: boolean) => void;
  reset: (conv: string | null) => void;
  adopt: (from: string | null, to: string) => void;
}

export const useExperiment = create<ExperimentState>((set, get) => ({
  byConv: {},

  getFor: (conv) => get().byConv[keyOf(conv)] ?? DEFAULT_EXPERIMENT,

  setTopK: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, topK: value } } };
    }),

  setSimulateFailure: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, simulateFailure: value } } };
    }),

  setRerankThreshold: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, rerankThreshold: value } } };
    }),

  setRagless: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, ragless: value } } };
    }),

  setVerify: (conv, value) =>
    set((s) => {
      const key = keyOf(conv);
      const cur = s.byConv[key] ?? DEFAULT_EXPERIMENT;
      return { byConv: { ...s.byConv, [key]: { ...cur, verify: value } } };
    }),

  reset: (conv) =>
    set((s) => {
      const next = { ...s.byConv };
      delete next[keyOf(conv)];
      return { byConv: next };
    }),

  adopt: (from, to) =>
    set((s) => {
      const fromKey = keyOf(from);
      const settings = s.byConv[fromKey];
      if (!settings || fromKey === to) return {};
      const next = { ...s.byConv, [to]: settings };
      delete next[fromKey];
      return { byConv: next };
    }),
}));

// The request overrides for a conversation. Undefined fields are dropped by
// JSON.stringify, so a default (untouched) conversation sends nothing.
//
// 043-persisted-agent: the four agent fields no longer travel as request-level
// overrides from the FE — the backend now reads them from `sessions.agent_id →
// agents.*`. The protocol still accepts the legacy 006 overrides so programmatic
// callers (and the backend's own tests) keep working; the FE just doesn't send
// them anymore.
export interface ChatOverrides {
  top_k?: number;
  simulate_failure?: string;
  // 055-rerank-score-threshold — sent only when raised above 0 (an untouched run
  // sends nothing extra; 0 = no filter = today's behavior).
  rerank_threshold?: number;
  // 061-scenario-builder — per-feature inputs derived from the global component
  // selection (replaced the 008 `scenario` rung). `rerank` turns on the reranker;
  // `hybrid` turns on BM25 + vector RRF fusion (070); `runtime` picks the agent loop;
  // `ragless` runs PageIndex. Each is sent only when away from its default so an
  // untouched (Simple-equivalent) run sends nothing extra.
  rerank?: boolean;
  hybrid?: boolean;
  runtime?: string;
  ragless?: boolean;
  // 098-verify-reflection-loop — opt-in critic pass; sent only when on so an
  // untouched run sends nothing extra (byte-for-byte baseline).
  verify?: boolean;
  // 088-network-layer — visualize + emit the real ingress chain. Sent only when the
  // `network` component is enabled (which the Build popover allows only when the chain
  // is present), so an ordinary run sends nothing extra.
  network?: boolean;
}

export function overridesFor(conv: string | null): ChatOverrides {
  const e = useExperiment.getState().getFor(conv);
  const out: ChatOverrides = {};
  if (e.topK !== null) out.top_k = e.topK;
  if (e.simulateFailure && e.simulateFailure !== "none") out.simulate_failure = e.simulateFailure;
  if (e.rerankThreshold && e.rerankThreshold > 0) out.rerank_threshold = e.rerankThreshold;
  if (e.verify) out.verify = true;
  const { rerank, hybrid, runtime, ragless } = currentRequestInputs();
  if (rerank) out.rerank = true;
  if (hybrid) out.hybrid = true;
  if (runtime !== "react") out.runtime = runtime;
  if (ragless) out.ragless = true;
  // 088-network-layer — read straight from the global selection (it's not one of the
  // four `requestInputs`, whose shape existing tests pin exactly).
  if (useSelection.getState().enabled.has("network")) out.network = true;
  return out;
}
