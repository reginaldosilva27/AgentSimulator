import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useT } from "../i18n";
import {
  citations,
  sourcesFromEvents,
  type AnswerSegment,
  type CitationSource,
} from "../lib/citations";
import { CELL_COUNT, deriveBudget, gridCells, type GridSlice } from "../lib/contextBudget";
import { formatTokens, formatUsd } from "../lib/cost";
import type { DerivedView } from "../lib/derive";
import { abstained } from "../lib/abstain";
import { deriveMemoryGrowth } from "../lib/memoryGrowth";
import { loadTrace, type TraceLoad } from "../lib/traceCache";
import {
  contextSections,
  diffTurns,
  SECTIONS,
  type Section,
} from "../lib/turnDiff";
import { electedToolCalls } from "../lib/usage";
import {
  deriveDeepAgentsSteps,
  deriveVfs,
  hasDeepAgents,
  type DeepAgentsStep,
} from "../lib/deepagents";
import { deriveVerifyRounds, type VerifyRound } from "../lib/verifyRounds";
import type { TodoItem } from "../types/events";
import { useChat } from "../store/useChat";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";

// Focused drill-in for the Agent: the **anatomy** of an AI agent — its brain (the
// LLM, called on every reasoning round), its senses (the message), its memory
// (working + long-term + vector recall), its hands (tools) and its speech (the
// answer). Everything is composed from the captured trace + the projection's real
// token/cost totals (no extra requests), so it stays in sync with the cursor.
//
// 019 attaches honest provenance chips to grounded answer sentences; 020 diffs
// this turn's context window against the previous one (loaded via 022); 021
// badges a tool call that returned empty/not-found (the agent abstained).

const BRAIN = "var(--color-orange)";

interface AgentDetailProps {
  view: DerivedView;
  onClose: () => void;
}

function lastEnd(events: TraceEvent[], stage: string): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].stage === stage && events[i].phase === "end") return events[i];
  }
  return undefined;
}

// Category → its budget color (shared by the grid, the legend and the diff rows).
const SECTION_COLOR: Record<Section, string> = {
  system: "var(--color-violet)",
  tool_defs: "var(--color-pink)",
  skills: "var(--color-sky)",
  memory: "var(--color-blue)",
  retrieved: "var(--color-ok)",
  messages: "var(--color-warn)",
};

// The generated answer's slice color (distinct from the six input categories).
const COMPLETION_COLOR = "var(--color-orange)";
// The faint outline color for an empty (free) grid cell / the Free-space row.
const FREE_COLOR = "var(--color-line)";

// Color for any grid/legend slice: the six input categories, the answer, or free.
function sliceColor(key: GridSlice | "free"): string {
  if (key === "free") return FREE_COLOR;
  if (key === "completion") return COMPLETION_COLOR;
  return SECTION_COLOR[key];
}

// Category → its bilingual legend label (one source, used by legend + diff).
function categoryLabel(a: ReturnType<typeof useT>["agentDetail"], key: Section): string {
  return {
    system: a.catSystemPrompt,
    tool_defs: a.catToolDefs,
    skills: a.catSkills,
    memory: a.catMemory,
    retrieved: a.catRetrieved,
    messages: a.catMessages,
  }[key];
}

/** Percent-of-window for the legend, e.g. 0.062 → "6%", 0.004 → "<1%". */
function formatPct(p: number): string {
  if (p <= 0) return "0%";
  if (p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export function AgentDetail({ view, onClose }: AgentDetailProps) {
  const t = useT();
  const a = t.agentDetail;

  // The raw event log up to the cursor — the same `visible` slice `deriveView`
  // projects, so the pure libs (citations / contextSections) see exactly what the
  // canvas does. Live streaming and step/replay therefore stay consistent.
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );

  const agentEv = view.stations.agent.events;
  const llmEv = view.stations.llm.events;
  const dbEv = view.stations.database.events;
  const ragEv = view.stations.rag.events;
  const usage = view.usage;

  const thinks = agentEv.filter((e) => e.stage === "agent.think" && e.phase === "end");
  const route = lastEnd(agentEv, "agent.route");
  const prompt = lastEnd(llmEv, "llm.prompt");
  const generate = lastEnd(llmEv, "llm.generate");
  const query = (route?.data.query as string | undefined) ?? "";
  const model =
    (generate?.data.model as string | undefined) ??
    (thinks.length ? (thinks[thinks.length - 1].data.model as string | undefined) : undefined) ??
    "";

  // 026-agent-tool-autonomy follow-up: tool calls live on `agent.think.tool_calls`
  // (the canonical, station-agnostic source). The shared `electedToolCalls` helper
  // pairs each elected call with its observation — `mcp.call` END for native MCP
  // tools, `rag.retrieve` END (summarized) for `search_knowledge_base`. Before
  // this fix the card only filtered `mcp.call` ENDs, so retrieval was invisible
  // and "no tools called this run" lied any time the agent used the KB.
  // 021-abstain-badge: each call carries the structured `found` signal so an
  // empty/not-found result (zero MCP rows, zero retrieved chunks) is badged.
  const toolCalls = useMemo(() => electedToolCalls(visible), [visible]);

  const read = lastEnd(dbEv, "db.read");
  const historyPairs = (read?.data.recent as { message: string; answer: string }[] | undefined) ?? [];

  const retrieve = lastEnd(ragEv, "rag.retrieve");
  const chunks = (retrieve?.data.chunks as { source: string; score: number }[] | undefined) ?? [];

  const tools = (prompt?.data.tools as string[] | undefined) ?? [];
  const lastDecision = thinks.length ? String(thinks[thinks.length - 1].data.decision ?? "—") : "—";

  const started = agentEv.length > 0;
  const rounds = usage.rounds || thinks.length;
  const hasRealUsage = usage.totalTokens > 0;

  // 036-context-window-budget: the real context-window budget as of the cursor —
  // input (real prompt_tokens) + answer (real completion_tokens) vs. the model
  // window, plus the per-category input split (one source, also feeds the "compare
  // with previous turn" diff). 020's diff reads the same numbers, so grid and diff
  // can't disagree. The generated answer is its own slice (input vs. answer tokens).
  const budget = useMemo(() => deriveBudget(events, cursor), [events, cursor]);
  const slices = useMemo(
    () => [
      ...budget.categories.map((c) => ({ key: c.key as GridSlice, tokens: c.tokens })),
      { key: "completion" as GridSlice, tokens: budget.completion },
    ],
    [budget],
  );
  const cells = useMemo(
    () => gridCells(slices, budget.used, budget.window, CELL_COUNT),
    [slices, budget.used, budget.window],
  );
  const sections = useMemo(() => contextSections(visible), [visible]);
  const legend = budget.categories.filter((c) => c.tokens > 0);

  // 039-memory-growth-visualization: per-turn weights of the long-term memory
  // currently in the model's window. Pure projection of `db.read` END data.
  const growth = useMemo(() => deriveMemoryGrowth(events, cursor), [events, cursor]);

  // 019-inline-citations: honest, sentence-level provenance over the settled
  // answer, composed from this turn's tool results + retrieved chunks.
  const sources = useMemo(() => sourcesFromEvents(visible), [visible]);
  const cited = useMemo(() => citations(view.answer, sources), [view.answer, sources]);

  // 057-deepagents-runtime: the Intermediate-rung preamble (plan + delegated
  // researcher + virtual file system), projected from the trace events. Empty on
  // the Simple rung, so the DeepAgents panel only shows when the preamble ran.
  const showDeepAgents = useMemo(() => hasDeepAgents(visible), [visible]);
  // 067-deepagents-step-trail: the full chronological trail of DeepAgents actions
  // (plan / file write / file read / delegate), not just the final plan snapshot.
  const steps = useMemo(() => deriveDeepAgentsSteps(visible), [visible]);
  const vfs = useMemo(() => deriveVfs(visible), [visible]);
  // 098-verify-reflection-loop: the critic passes of this turn (empty when the
  // verify toggle was off), so the panel only shows when verification actually ran.
  const verifyRounds = useMemo(() => deriveVerifyRounds(visible), [visible]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[color-mix(in_srgb,var(--color-base)_94%,transparent)] backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-3">
        <button
          onClick={onClose}
          className="rounded-full border px-3 py-1 text-[12px] font-medium transition hover:bg-[var(--color-panel-2)]"
          style={{ borderColor: BRAIN, color: BRAIN }}
        >
          ← {a.back}
        </button>
        <span className="text-2xl">🧠</span>
        <div>
          <div className="text-[15px] font-semibold text-[var(--color-ink)]">{a.title}</div>
          <div className="text-[11px] text-[var(--color-muted)]">{a.subtitle}</div>
          {/* 053-agent-harness — name the runtime (loop+tools+prompt+context+memory)
              as an "Agent Harness"; glossary tooltip on hover (canvas convention). */}
          <div
            title={t.glossary["Agent Harness"]}
            className="mt-1 inline-block cursor-help rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[10px] text-[var(--color-faint)]"
          >
            {a.harness}
          </div>
        </div>
      </div>

      {!started ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-[var(--color-muted)]">
          {a.waiting}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 lg:grid-cols-2">
          {/* Brain — the LLM, used on every reasoning round (the centerpiece). */}
          <Panel title={a.brain} accent={BRAIN} hint={a.brainHint}>
            <div className="mb-3 flex items-center gap-1.5 text-[11px]">
              <Step label={a.reason} color="var(--color-pink)" />
              <Arrow />
              <Step label={a.act} color="var(--color-warn)" />
              <Arrow />
              <Step label={a.observe} color="var(--color-ok)" />
              <span className="ml-1 text-[var(--color-muted)]">↺</span>
            </div>
            {model && <KV k={a.model} v={model} />}
            <KV k={a.rounds} v={String(rounds)} />
            <KV k={a.lastDecision} v={lastDecision} />
            {hasRealUsage && (
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 border-t border-[var(--color-line)] pt-1.5">
                <KV k={a.promptTokens} v={formatTokens(usage.promptTokens)} />
                <KV k={a.completionTokens} v={formatTokens(usage.completionTokens)} />
                <KV k={a.totalTokens} v={formatTokens(usage.totalTokens)} />
                <KV k={a.cost} v={formatUsd(usage.costUsd)} />
              </div>
            )}
            <div className="mt-2 space-y-1">
              {thinks.map((th, idx) => {
                const calls = (th.data.tool_calls as { name: string }[] | undefined) ?? [];
                return (
                  <div key={idx} className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px]">
                    <span className="font-mono text-[var(--color-muted)]">#{idx + 1}</span>{" "}
                    <span style={{ color: BRAIN }}>{String(th.data.decision)}</span>
                    {calls.length > 0 && (
                      <span className="text-[var(--color-muted)]"> → {calls.map((c) => c.name).join(", ")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* 057-deepagents-runtime: the DeepAgents preamble (Intermediate rung) — the
              explicit plan, the delegated researcher, and the virtual file system. Only
              shown when the preamble actually ran (the Simple rung has none). */}
          {showDeepAgents && (
            <Panel title={a.plan} accent="var(--color-violet)" hint={a.planHint}>
              {/* 067 — the full step trail, in run order, instead of only the final
                  plan snapshot: each plan revision, file op and delegation as its
                  own row, so the panel shows what DeepAgents actually did. */}
              <Labeled label={a.steps}>
                {steps.length === 0 ? (
                  <p className="text-[11px] italic text-[var(--color-label)]" title={a.stepsHint}>
                    {a.planEmpty}
                  </p>
                ) : (
                  <>
                    <ol className="space-y-1" title={a.stepsHint}>
                      {steps.map((step, idx) => (
                        <StepRow key={idx} step={step} a={a} />
                      ))}
                    </ol>
                    {/* 067 (AC6) — make the absence of a sub-agent legible, not just
                        an inferred missing row. */}
                    {!steps.some((s) => s.kind === "delegate") && (
                      <p className="mt-1 text-[10px] italic text-[var(--color-muted)]">
                        ℹ {a.noSubagent}
                      </p>
                    )}
                  </>
                )}
              </Labeled>

              <Labeled label={a.vfs}>
                {vfs.length === 0 ? (
                  <p className="text-[11px] italic text-[var(--color-label)]" title={a.vfsHint}>
                    {a.vfsEmpty}
                  </p>
                ) : (
                  <div className="space-y-1" title={a.vfsHint}>
                    {vfs.map((f) => (
                      <div
                        key={f.path}
                        className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-mono text-[var(--color-ink)]">📄 {f.path}</span>
                          <span className="flex gap-1 text-[10px] text-[var(--color-label)]">
                            {f.wrote && <span>{a.wrote}</span>}
                            {f.read && <span>· {a.read}</span>}
                            <span>· {a.approxTokens(Math.max(1, Math.round(f.bytes / 4)))}</span>
                          </span>
                        </div>
                        {f.content && <VfsContent content={f.content} a={a} />}
                      </div>
                    ))}
                  </div>
                )}
              </Labeled>
            </Panel>
          )}

          {/* 098-verify-reflection-loop: the verification (reflection) loop — each
              critic pass with its verdict + reason + bounded revision count. Always
              present in the drill-in (loop-engineering is a core concept): it lists the
              passes when verification ran, else shows the bilingual empty state (AC9). */}
          <Panel title={a.verify} accent="var(--color-pink)" hint={a.verifyHint}>
            {verifyRounds.length === 0 ? (
              <p className="text-[11px] italic text-[var(--color-label)]">{a.verifyEmpty}</p>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-[var(--color-muted)]">
                  {a.verifyRounds(verifyRounds.filter((r) => r.willRevise).length)}
                </p>
                <ol className="space-y-1.5">
                  {verifyRounds.map((r) => (
                    <VerifyRow key={r.round} r={r} a={a} />
                  ))}
                </ol>
              </>
            )}
          </Panel>

          {/* Senses + hands — what it perceives this turn, and the tools it used. */}
          <Panel title={a.senses} accent="var(--color-warn)" hint={a.workingMemoryHint}>
            {query && (
              <Labeled label={a.userMessage}>
                <Mono>{query}</Mono>
              </Labeled>
            )}
            <Labeled label={a.hands}>
              {toolCalls.length === 0 ? (
                <p className="text-[11px] italic text-[var(--color-label)]">{a.noToolCalls}</p>
              ) : (
                <div className="space-y-1">
                  {toolCalls.map((c, idx) => {
                    const isAbstain = abstained({ found: c.found });
                    // search_knowledge_base has no `result` string — its observation
                    // is the retrieved chunks. Render the compact summary instead.
                    const display = c.retrievalSummary
                      ? a.retrievalResult(
                          c.retrievalSummary.count,
                          c.retrievalSummary.topSource,
                          c.retrievalSummary.topScore,
                        )
                      : (c.result ?? "");
                    return (
                      <div key={idx} className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1">
                        <ToolCallArgs tool={c.tool} args={c.args} a={a} />
                        <div className="font-mono text-[11px] text-[var(--color-ok-soft)]">→ {display}</div>
                        {isAbstain && (
                          <div
                            title={t.abstain.hint}
                            className="mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                            style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}
                          >
                            ⚠️ {t.abstain.badge}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Labeled>
          </Panel>

          {/* Long-term memory — survives across requests. */}
          <Panel title={a.longTermMemory} accent="var(--color-blue)" hint={a.longTermMemoryHint}>
            <Labeled label={a.conversationHistory}>
              {historyPairs.length === 0 ? (
                <p className="text-[11px] italic text-[var(--color-label)]">{a.noHistory}</p>
              ) : (
                <div className="space-y-1">
                  {historyPairs.map((h, idx) => (
                    <div key={idx} className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px]">
                      <div className="text-[var(--color-text-soft)]">🧑 {h.message}</div>
                      <div className="text-[var(--color-muted)]">🤖 {truncate(h.answer, 80)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Labeled>
            <Labeled label={a.vectorMemory}>
              <div className="flex flex-wrap gap-1">
                {chunks.map((c, idx) => (
                  <span key={idx} className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-soft)]">
                    {c.source} · {c.score.toFixed(2)}
                  </span>
                ))}
              </div>
            </Labeled>
            {/* 039-memory-growth-visualization: per-turn weights of what the
                model actually re-reads from prior conversation. Hidden on
                pre-039 traces (graceful fallback). */}
            {growth.available && growth.rows.length > 0 && (
              <Labeled label={a.memoryGrowth}>
                <div className="space-y-1" title={a.memoryGrowthHint}>
                  {growth.rows.map((r) => (
                    <div
                      key={r.turn}
                      className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px]"
                      title={a.growthRowHint(formatTokens(r.tokens))}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[10px] text-[var(--color-muted)]">
                          T{r.turn}
                        </span>
                        {/* 039 AC5 amendment — cumulative / total, so the row
                            number reads as 'after this turn, X of total are
                            in the window'. The per-turn weight (r.tokens) is
                            preserved in the row's hover tooltip. */}
                        <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-soft)]">
                          {a.growthRowLabel(
                            formatTokens(r.cumulativeTokens),
                            formatTokens(growth.totalTokens),
                          )}
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1.5 rounded-full"
                        style={{
                          width: `${Math.max(r.barWidth * 100, 2)}%`,
                          background: "var(--color-blue)",
                        }}
                      />
                      <div className="mt-1 truncate text-[10px] text-[var(--color-muted)]">
                        🧑 {truncate(r.message, 60)}
                      </div>
                    </div>
                  ))}
                  {/* Placeholder row for the in-progress turn (not yet stored). */}
                  <div className="rounded-md border border-dashed border-[var(--color-line)] px-2 py-1 text-[10px] italic text-[var(--color-label)]">
                    T{growth.rows.length + 1} {a.thisTurnNotStored}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[10px] text-[var(--color-muted)]">
                  <span className="font-mono tabular-nums">
                    {a.currentlyInWindow(formatTokens(growth.totalTokens))}
                  </span>
                  {growth.nextToFallOut !== null && (
                    <span className="font-mono tabular-nums text-[var(--color-warn)]">
                      {a.nextToFallOut(growth.limit, growth.nextToFallOut)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] italic text-[var(--color-muted)]">
                  ℓ {a.memoryLesson}
                </p>
              </Labeled>
            )}
          </Panel>

          {/* Context window — a /context-style budget against the model's real
              maximum: input (prompt) + answer (completion) vs. free, split by
              category. Sums every LLM round in this turn (think + generate) so
              `used` always equals the BRAIN/LLM card's totalTokens. */}
          <Panel title={a.contextWindow} accent="var(--color-ok)" hint={a.windowHint}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <span className="font-mono text-[12px] text-[var(--color-ink)]">
                {a.usedInOut(
                  formatTokens(budget.input),
                  formatTokens(budget.completion),
                  formatTokens(budget.window),
                  formatPct(budget.pct),
                )}
              </span>
              {model && (
                <span className="text-[10px] text-[var(--color-muted)]" title={a.windowHint}>
                  {a.windowOf(model, formatTokens(budget.window))}
                </span>
              )}
            </div>
            <div
              className="mb-2 grid gap-[2px]"
              style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}
            >
              {cells.map((c, i) => (
                <span
                  key={i}
                  className="aspect-square rounded-[2px]"
                  style={
                    c === "free"
                      ? { background: "transparent", border: `1px solid ${FREE_COLOR}` }
                      : { background: sliceColor(c) }
                  }
                />
              ))}
            </div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-label)]">
              {a.estimatedByCategory}
            </div>
            <div className="space-y-1">
              {legend.map((c) => (
                <LegendRow
                  key={c.key}
                  color={SECTION_COLOR[c.key]}
                  label={categoryLabel(a, c.key)}
                  tokens={c.tokens}
                  pct={c.pctOfWindow}
                />
              ))}
              {budget.completion > 0 && (
                <LegendRow
                  color={COMPLETION_COLOR}
                  label={a.catCompletion}
                  tokens={budget.completion}
                  pct={budget.window > 0 ? budget.completion / budget.window : 0}
                />
              )}
              <LegendRow
                color={FREE_COLOR}
                label={a.freeSpace}
                tokens={budget.free}
                pct={budget.window > 0 ? budget.free / budget.window : 0}
                hollow
              />
            </div>
            <p className="mt-1.5 text-[10px] italic text-[var(--color-muted)]">{a.perCallNote}</p>
            {budget.estimated && (
              <p className="mt-1 text-[10px] italic text-[var(--color-muted)]">{a.estimatedNote}</p>
            )}
            {tools.length > 0 && (
              <Labeled label={a.tools}>
                <div className="flex flex-wrap gap-1">
                  {tools.map((tl) => (
                    <span key={tl} className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-soft)]">
                      {tl}
                    </span>
                  ))}
                </div>
              </Labeled>
            )}
            <TurnCompare current={sections} />
          </Panel>

          {/* Speech — what the agent says back, with honest provenance chips. */}
          <div className="lg:col-span-2">
            <Panel title={a.speech} accent="var(--color-sky)">
              {view.answer ? (
                <CitedAnswerView segments={cited.segments} />
              ) : (
                <p className="text-[11px] italic text-[var(--color-label)]">{a.noAnswerYet}</p>
              )}
              {cited.citations.length > 0 && (
                <div className="mt-2 border-t border-[var(--color-line)] pt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-label)]">
                    {t.citation.sources}
                  </div>
                  <div className="space-y-0.5">
                    {cited.citations.map((c) => (
                      <div key={c.index} className="flex items-baseline gap-1.5 text-[11px]">
                        <span className="font-mono text-[var(--color-sky)]">[{c.index}]</span>
                        <span className="text-[var(--color-muted)]">{sourceLabel(c.source, t)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 019: cited answer rendering ---------------------------------------------

type Translated = ReturnType<typeof useT>;

/** Hover/legend detail for a source — chrome bilingual, args/snippet verbatim. */
function sourceLabel(source: CitationSource, t: Translated): string {
  const snippet = truncate(source.text, 120);
  if (source.kind === "tool") {
    return `${t.citation.fromTool(source.tool)} · ${JSON.stringify(source.args)} · "${snippet}"`;
  }
  return `${t.citation.fromChunk} · ${source.source} · ${t.citation.score} ${source.score.toFixed(2)} · "${snippet}"`;
}

function CitedAnswerView({ segments }: { segments: AnswerSegment[] }) {
  const t = useT();
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[var(--color-ink)]">
      {segments.map((seg, idx) => (
        <span key={idx}>
          {seg.sentence}
          {seg.citation && (
            <sup
              title={`${t.citation.hint}\n${sourceLabel(seg.citation.source, t)}`}
              className="ml-0.5 cursor-help font-sans text-[10px] font-semibold text-[var(--color-sky)]"
            >
              [{seg.citation.index}]
            </sup>
          )}
          {idx < segments.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

// --- 020: compare with the previous turn -------------------------------------

function TurnCompare({ current }: { current: Record<Section, number> }) {
  const t = useT();
  const a = t.agentDetail;
  const messages = useChat((s) => s.messages);
  const loadedTraceId = useChat((s) => s.loadedTraceId);

  // The immediately-previous persisted turn (n-1), or null if this is the first
  // turn / no turn is loaded. message.id === trace_id (022).
  const priorId = useMemo(() => {
    if (!loadedTraceId) return null;
    const idx = messages.findIndex((m) => m.id === loadedTraceId);
    return idx > 0 ? messages[idx - 1].id : null;
  }, [messages, loadedTraceId]);

  const [comparing, setComparing] = useState(false);
  const [prior, setPrior] = useState<TraceLoad | null>(null);

  useEffect(() => {
    if (!comparing || !priorId) {
      setPrior(null);
      return;
    }
    let alive = true;
    void loadTrace(priorId).then((r) => {
      if (alive) setPrior(r);
    });
    return () => {
      alive = false;
    };
  }, [comparing, priorId]);

  const prevSections = prior?.ok ? contextSections(prior.events) : null;
  const diff = prevSections ? diffTurns(prevSections, current) : null;

  return (
    <div className="mt-3 border-t border-[var(--color-line)] pt-2">
      <button
        onClick={() => setComparing((v) => !v)}
        className="rounded-full border border-[var(--color-line)] px-2.5 py-0.5 text-[11px] text-[var(--color-text-soft)] transition hover:bg-[var(--color-panel-2)]"
      >
        {comparing ? t.diff.hide : t.diff.show}
      </button>

      {comparing && (
        <div className="mt-2">
          {!priorId || prior?.ok === false ? (
            <p className="text-[11px] italic text-[var(--color-label)]">{t.diff.needsPrior}</p>
          ) : !diff || !prevSections ? (
            <p className="text-[11px] italic text-[var(--color-muted)]">…</p>
          ) : (
            <>
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-[var(--color-label)]">
                <span>{t.diff.previous}</span>
                <span>{t.diff.current}</span>
              </div>
              <div className="space-y-1">
                {SECTIONS.map((s) => {
                  const d = diff.perSection[s];
                  const tone =
                    d > 0 ? "var(--color-warn)" : d < 0 ? "var(--color-blue)" : "var(--color-muted)";
                  const verb = d > 0 ? t.diff.grew : d < 0 ? t.diff.shrank : t.diff.same;
                  return (
                    <div key={s} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: SECTION_COLOR[s] }} />
                        <span className="text-[var(--color-text-soft)]">{categoryLabel(a, s)}</span>
                      </span>
                      <span className="flex items-center gap-2 font-mono text-[var(--color-muted)]">
                        <span>
                          {prevSections[s]} → {current[s]}
                        </span>
                        <span style={{ color: tone }}>
                          {verb}
                          {d !== 0 ? ` ${d > 0 ? "+" : ""}${d}` : ""}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between border-t border-[var(--color-line)] pt-1.5 text-[11px]">
                <span className="text-[var(--color-text-soft)]">{t.diff.totalDelta}</span>
                <span
                  className="font-mono"
                  style={{
                    color:
                      diff.total > 0
                        ? "var(--color-warn)"
                        : diff.total < 0
                          ? "var(--color-blue)"
                          : "var(--color-muted)",
                  }}
                >
                  {diff.total > 0 ? "+" : ""}
                  {diff.total}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- small presentational helpers -------------------------------------------

function Panel({
  title,
  accent,
  hint,
  children,
}: {
  title: string;
  accent: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_75%,transparent)] p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
          {title}
        </span>
        {hint && <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// One legend row in the context-window budget: a color swatch, the category
// label, and its token count + percentage of the whole window (036).
function LegendRow({
  color,
  label,
  tokens,
  pct,
  hollow = false,
}: {
  color: string;
  label: string;
  tokens: number;
  pct: number;
  hollow?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full"
          style={hollow ? { border: `1px solid ${color}` } : { background: color }}
        />
        <span className="text-[var(--color-text-soft)]">{label}</span>
      </span>
      <span className="flex items-center gap-2 font-mono text-[var(--color-muted)]">
        <span>{formatTokens(tokens)}</span>
        <span className="w-9 text-right text-[var(--color-label)]">{formatPct(pct)}</span>
      </span>
    </div>
  );
}

function Step({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 font-mono text-[10px]"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  );
}

function Arrow() {
  return <span className="text-[var(--color-muted)]">→</span>;
}

// 057-deepagents-runtime — a todo's status chip (planning pillar). The icon + colour
// make the pending → in_progress → completed progression scannable at a glance.
const TODO_STATUS_STYLE: Record<TodoItem["status"], { icon: string; color: string }> = {
  pending: { icon: "○", color: "var(--color-label)" },
  in_progress: { icon: "◐", color: "var(--color-warn)" },
  completed: { icon: "●", color: "var(--color-ok)" },
};

function TodoStatus({ status, label }: { status: TodoItem["status"]; label: string }) {
  const s = TODO_STATUS_STYLE[status];
  return (
    <span title={label} className="font-mono text-[11px]" style={{ color: s.color }}>
      {s.icon}
    </span>
  );
}

// 098-verify-reflection-loop — one critic pass: its verdict, reason, and (when it
// looped back) a note that a revision round followed. Pure projection of an
// `agent.verify` event; green for pass, amber for revise.
function VerifyRow({ r, a }: { r: VerifyRound; a: ReturnType<typeof useT>["agentDetail"] }) {
  const revise = r.decision === "revise";
  const color = revise ? "var(--color-warn)" : "var(--color-ok)";
  return (
    <li className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span style={{ color }}>{revise ? "↻" : "✓"}</span>
        <span className="font-mono text-[var(--color-muted)]">#{r.round}</span>
        <span className="font-medium" style={{ color }}>
          {revise ? a.verifyRevise : a.verifyPass}
        </span>
      </div>
      {r.reason && (
        <div className="mt-1 text-[11px] text-[var(--color-ink)]">
          <span className="text-[var(--color-label)]">{a.verifyReason}: </span>
          {r.reason}
        </div>
      )}
      {r.willRevise && (
        <div className="mt-0.5 text-[10px] italic text-[var(--color-muted)]">{a.verifyRevised}</div>
      )}
    </li>
  );
}

// 067-deepagents-step-trail — one row in the chronological DeepAgents trail. A plan
// step expands its own todo snapshot; a file step shows the path; a delegation shows
// the sub-agent hand-off, its result and its tool trail.
function StepRow({ step, a }: { step: DeepAgentsStep; a: ReturnType<typeof useT>["agentDetail"] }) {
  if (step.kind === "plan") {
    const todos = step.todos ?? [];
    return (
      <li className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-[var(--color-violet)]">◐</span>
          <span className="font-medium text-[var(--color-ink)]">{a.plan}</span>
          <span className="text-[var(--color-muted)]">· {todos.length} todos</span>
        </div>
        {todos.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {todos.map((todo, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px]">
                <TodoStatus status={todo.status} label={a.todoStatus[todo.status]} />
                <span
                  className={
                    todo.status === "completed"
                      ? "text-[var(--color-label)] line-through"
                      : "text-[var(--color-ink)]"
                  }
                >
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  if (step.kind === "delegate") {
    return (
      <li
        title={a.delegateHint}
        className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1"
      >
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>🤝</span>
          <span className="font-medium text-[var(--color-ink)]">{a.delegated}</span>
          <span className="font-mono text-[var(--color-muted)]">· {step.subagent}</span>
        </div>
        {step.subtask && (
          <div className="mt-0.5 text-[11px] text-[var(--color-text-soft)]">{step.subtask}</div>
        )}
        {step.steps && step.steps.length > 0 && (
          <div className="mt-0.5 font-mono text-[10px] text-[var(--color-sky)]">
            {a.subagentUsed}: {step.steps.join(" → ")}
          </div>
        )}
        {step.result && (
          <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{step.result}</div>
        )}
      </li>
    );
  }

  // fs-write / fs-read — a virtual file operation.
  return (
    <li className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[11px]">
      <span>📄</span>
      <span className="text-[var(--color-text-soft)]">
        {step.kind === "fs-write" ? a.wroteFile : a.readFile}
      </span>
      <span className="font-mono text-[var(--color-ink)]">{step.path}</span>
    </li>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5 text-[12px]">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className="font-mono text-[var(--color-ink)]">{v}</span>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-label)]">{label}</div>
      {children}
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-[var(--color-ink)]">
      {children}
    </p>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// 067-deepagents-step-trail (AC7) — render a tool call's `tool(args)` line, truncating
// long serialized args (e.g. a write_file with a big `content`) behind a Read more /
// Show less toggle so one long call no longer scrolls the panel for screens.
const ARGS_LIMIT = 140;

function ToolCallArgs({
  tool,
  args,
  a,
}: {
  tool: string;
  args: unknown;
  a: ReturnType<typeof useT>["agentDetail"];
}) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(args);
  const long = json.length > ARGS_LIMIT;
  const shown = !long || open ? json : `${json.slice(0, ARGS_LIMIT)}…`;
  return (
    <div className="break-words font-mono text-[11px] text-[var(--color-ink)]">
      {tool}({shown})
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-1 font-sans text-[10px] font-medium text-[var(--color-sky)] hover:underline"
        >
          {open ? a.readLess : a.readMore}
        </button>
      )}
    </div>
  );
}

// 067 — a virtual-FS file's content, collapsed to a short preview by default with a
// Read more / Show less toggle that reveals the full content (in a scroll box). Keeps
// the VFS section compact when a file holds screens of synthesized notes.
const VFS_PREVIEW_LIMIT = 200;

function VfsContent({
  content,
  a,
}: {
  content: string;
  a: ReturnType<typeof useT>["agentDetail"];
}) {
  const [open, setOpen] = useState(false);
  const long = content.length > VFS_PREVIEW_LIMIT;
  return (
    <>
      <pre
        className={`mt-0.5 whitespace-pre-wrap font-mono text-[10px] text-[var(--color-muted)] ${
          open ? "max-h-48 overflow-y-auto" : ""
        }`}
      >
        {!long || open ? content : `${content.slice(0, VFS_PREVIEW_LIMIT)}…`}
      </pre>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-sans text-[10px] font-medium text-[var(--color-sky)] hover:underline"
        >
          {open ? a.readLess : a.readMore}
        </button>
      )}
    </>
  );
}
