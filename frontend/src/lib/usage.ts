// 018-cumulative-hud: pure usage accounting, independent of any data source.
//
// `tallyUsage(events)` folds ONE turn's trace into its real usage — the token /
// cost / rounds logic is the *exact* logic `deriveView` runs (summed over every
// LLM call: each reasoning round's decide on `agent.think` + the final
// `llm.generate`, 011-token-cost), extracted here so the HUD and the canvas can
// never drift (a parity test pins them). It also applies the HUD counting rules:
// a **tool call** is each item the agent elected on `agent.think.tool_calls`
// (the canonical source — see `electedToolCalls` below); a **RAG hit** is each
// retrieved chunk (no relevance threshold — count what actually happened).
//
// `cumulativeUsage(records)` folds a list of per-turn tallies into the running
// conversation totals (AC1). An evicted turn (its trace gone from the bounded
// store) is passed as `null`: it still counts as a turn, but its tokens can't be
// summed, so the result is flagged `partial` (no crash, no faked numbers).

import type { TraceEvent } from "../types/events";

/** A single tool call the agent decided to make (visible on `agent.think.tool_calls`). */
export interface ElectedToolCall {
  tool: string; // the tool name, exactly as elected
  args: unknown; // the args object the agent passed
  result?: string; // the observation back from the tool (mcp.call END `result`)
  found?: boolean; // 021-abstain-badge — false ⇒ empty/not-found
  // For `search_knowledge_base` only — a compact summary of the rag.retrieve END
  // chunks (count + top hit). The UI renders this as the human-readable result
  // (no separate `result` string), keeping retrieval honestly inspectable.
  retrievalSummary?: {
    count: number;
    topSource?: string;
    topScore?: number;
  };
}

export interface TurnUsage {
  rounds: number; // LLM calls in the turn (decide rounds + the generation)
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  // 099-prompt-caching: of `promptTokens`, how many the provider served from its
  // automatic prompt cache, and the US$ that saved vs. billing them all fresh.
  // Summed across the turn's LLM calls; 0 when nothing was cached (honest cold call).
  cachedTokens: number;
  costSavedUsd: number;
  toolCalls: number; // each item the agent elected on `agent.think.tool_calls`
  ragHits: number; // retrieved chunks
}

export interface CumulativeUsage {
  turns: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  cachedTokens: number; // 099-prompt-caching
  costSavedUsd: number; // 099-prompt-caching
  toolCalls: number;
  ragHits: number;
  // True when at least one turn's trace was evicted → the totals under-count.
  partial: boolean;
}

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

// 026-agent-tool-autonomy follow-up: retrieval is now an agent-elected tool
// (`search_knowledge_base`) whose observation animates the RAG station instead
// of `mcp.call`. So counting `mcp.call` ENDs under-counts by one every retrieval
// turn (and the "Tools" card missed `search_knowledge_base` entirely). The fix:
// read the canonical source — `agent.think.tool_calls` — and pair each elected
// call with its observation END (rag.retrieve for retrieval, mcp.call for the
// rest). Pairing follows event order, which the backend guarantees by emitting
// observation ENDs in the order it walks pending tool_calls (`graph.py:340`).
const RETRIEVAL_TOOL = "search_knowledge_base";

interface Chunk {
  source?: string;
  score?: number;
}

/** All tool calls the agent elected, in order — pairs each with its observation. */
export function electedToolCalls(events: TraceEvent[]): ElectedToolCall[] {
  const mcpEnds = events.filter((e) => e.stage === "mcp.call" && e.phase === "end");
  const ragEnds = events.filter((e) => e.stage === "rag.retrieve" && e.phase === "end");
  // Pair non-retrieval calls with the next *unconsumed* mcp.call of the SAME tool name.
  // Order alone is wrong in DeepAgents mode: write_todos / write_file / read_file / task
  // execute via agent.* stages and emit no mcp.call, so blind order would hand them the
  // next genuine MCP call's result. A DeepAgents tool simply finds no match (its
  // observation is the agent.* stage, surfaced at the Agent station).
  const mcpUsed = new Array<boolean>(mcpEnds.length).fill(false);
  let ragI = 0;
  const out: ElectedToolCall[] = [];
  for (const ev of events) {
    if (ev.stage !== "agent.think" || ev.phase !== "end") continue;
    const tc =
      (ev.data.tool_calls as Array<{ name: string; args: unknown }> | undefined) ?? [];
    for (const c of tc) {
      const call: ElectedToolCall = { tool: c.name, args: c.args };
      if (c.name === RETRIEVAL_TOOL) {
        const r = ragEnds[ragI++];
        if (r) {
          const chunks = (Array.isArray(r.data.chunks) ? r.data.chunks : []) as Chunk[];
          const top = chunks[0];
          call.retrievalSummary = {
            count: chunks.length,
            topSource: top?.source,
            topScore: typeof top?.score === "number" ? top.score : undefined,
          };
          // Empty retrieval = honest abstain (021), same convention as mcp.call.
          call.found = chunks.length > 0;
        }
      } else {
        const idx = mcpEnds.findIndex((m, i) => !mcpUsed[i] && m.data.tool === c.name);
        if (idx >= 0) {
          mcpUsed[idx] = true;
          const m = mcpEnds[idx];
          if (typeof m.data.result === "string") call.result = m.data.result;
          if (typeof m.data.found === "boolean") call.found = m.data.found;
        }
      }
      out.push(call);
    }
  }
  return out;
}

/** Fold one turn's trace events into its real token/cost usage + HUD counts. */
export function tallyUsage(events: TraceEvent[]): TurnUsage {
  const u: TurnUsage = {
    rounds: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    cachedTokens: 0,
    costSavedUsd: 0,
    toolCalls: 0,
    ragHits: 0,
  };
  for (const ev of events) {
    if (ev.phase !== "end") continue;
    // Every decide round (agent.think) and the generation (llm.generate) is a
    // real LLM call — total rounds, tokens and cost across them (mirrors derive).
    if (ev.stage === "agent.think" || ev.stage === "llm.generate") {
      u.rounds += 1;
      u.promptTokens += num(ev.metrics.prompt_tokens);
      u.completionTokens += num(ev.metrics.completion_tokens);
      u.totalTokens += num(ev.metrics.total_tokens);
      u.costUsd += num(ev.metrics.cost_usd);
      // 099-prompt-caching — additive metrics; absent on legacy traces ⇒ 0.
      u.cachedTokens += num(ev.metrics.cached_tokens);
      u.costSavedUsd += num(ev.metrics.cost_saved_usd);
    }
    // A RAG hit = each chunk actually retrieved for the turn (orthogonal to
    // tool calls — a single search_knowledge_base call can return many chunks).
    if (ev.stage === "rag.retrieve" && Array.isArray(ev.data.chunks)) {
      u.ragHits += (ev.data.chunks as unknown[]).length;
    }
  }
  // A tool call = each item the agent elected on `agent.think.tool_calls` (the
  // canonical, station-agnostic source — see `electedToolCalls`).
  u.toolCalls = electedToolCalls(events).length;
  return u;
}

/** Fold per-turn tallies into the running conversation totals; `null` = evicted. */
export function cumulativeUsage(records: (TurnUsage | null)[]): CumulativeUsage {
  const c: CumulativeUsage = {
    turns: records.length,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    cachedTokens: 0,
    costSavedUsd: 0,
    toolCalls: 0,
    ragHits: 0,
    partial: false,
  };
  for (const r of records) {
    if (!r) {
      c.partial = true; // the turn happened, but its trace is gone
      continue;
    }
    c.promptTokens += r.promptTokens;
    c.completionTokens += r.completionTokens;
    c.totalTokens += r.totalTokens;
    c.costUsd += r.costUsd;
    c.cachedTokens += r.cachedTokens;
    c.costSavedUsd += r.costSavedUsd;
    c.toolCalls += r.toolCalls;
    c.ragHits += r.ragHits;
  }
  return c;
}
