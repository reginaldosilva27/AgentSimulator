import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";

import { useLang, useT, type Lang } from "../i18n";
import type { Strings } from "../i18n/strings";
import { CLOUDS, cloudValue, useCloud } from "../lib/cloud";
import { formatTokens, formatTps, formatUsd } from "../lib/cost";
import type { DerivedView, UsageTotals } from "../lib/derive";
import { hasUploadActivity } from "../lib/derive";
import { deriveHopData, type EdgeChainSeg } from "../lib/hopDetail";
import { useActiveModel } from "../lib/activeModel";
import { useResolvedSelection } from "../lib/selection";
import { useSettings } from "../lib/settings";
import { useHealth } from "../lib/health";
import {
  hopsFor,
  stationByIdFor,
  tierByIdFor,
  visibleStationsFor,
  type StationId,
  type StationMeta,
} from "../lib/stations";
import { executionTree } from "../lib/executionTree";
import { electedToolCalls } from "../lib/usage";
import { formatLatency } from "../lib/time";
import { useSimulator } from "../store/useSimulator";
import type {
  JsonRpcFrames,
  Phase,
  RequestBody,
  SimulatedError,
  Stage,
  TraceEvent,
} from "../types/events";
import { ExecutionTracesDetail } from "./ExecutionTraces";

type I = Strings["inspector"];

interface InspectorPanelProps {
  selected: StationId | null;
  view: DerivedView;
  onSelect: (id: StationId | null) => void;
}

export function InspectorPanel({ selected, view, onSelect }: InspectorPanelProps) {
  const lang = useLang((s) => s.lang);
  const sel = useResolvedSelection();
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const openTraces = useSimulator((s) => s.openTraces);
  const tracesOpen = useSimulator((s) => s.tracesOpen);
  const closeTraces = useSimulator((s) => s.closeTraces);
  // 085-hop-communication-detail — the selected arrow (edge id), its detail shown
  // in this panel body; clearing it returns to the Overview / station.
  const selectedHop = useSimulator((s) => s.selectedHop);
  const selectHop = useSimulator((s) => s.selectHop);
  const t = useT();
  const i = t.inspector;
  // 035 — the Overview catalog matches the canvas: list the upload nodes only
  // when an upload is in scope, so a listed node is never off-canvas.
  const showUpload = hasUploadActivity(events);

  // Open every station at the top. Without this the panel keeps the previous
  // station's scroll offset when you click another node, which reads as a
  // flicker and can leave the view stuck partway down. (Hook must run before
  // the early return below — rules of hooks.)
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  // 038 — the run-level execution-trace tree shares the Inspector body with the
  // station details; it wins over the Overview / a station when open.
  if (tracesOpen) return <ExecutionTracesDetail onBack={closeTraces} />;

  // 085 — a clicked arrow fills the body with its communication detail (theory +
  // the real data that crossed it this run, cursor-bounded), like a station.
  if (selectedHop)
    return (
      <HopDetail
        hopId={selectedHop}
        events={events.slice(0, cursor + 1)}
        lang={lang}
        i={i}
        onBack={() => selectHop(null)}
      />
    );

  if (!selected)
    return (
      <Overview
        onSelect={onSelect}
        onOpenTraces={openTraces}
        stations={visibleStationsFor(lang, sel, showUpload)}
        i={i}
      />
    );

  const meta = stationByIdFor(lang)[selected];
  const rt = view.stations[selected];
  const lastEnd = pick(rt.events, undefined, "end");

  return (
    <div
      ref={scrollRef}
      className="flex h-full flex-col gap-3 overflow-y-auto p-4"
    >
      <button
        onClick={() => onSelect(null)}
        className="-mb-1 self-start rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
      >
        {i.overviewBack}
      </button>
      <div className="flex items-center gap-2.5">
        <span className="text-2xl">{meta.icon}</span>
        <div className="flex-1">
          {/* Force high-contrast ink via inline style so it wins over any
              ancestor `color` (the wrapper used to set `meta.accent`, which
              cascaded into the title and rendered it in the pale accent
              instead of ink). */}
          <div
            className="text-base font-semibold"
            style={{ color: "var(--color-ink)" }}
          >
            {meta.title}
          </div>
          <div className="text-xs text-[var(--color-muted)]">{meta.subtitle}</div>
        </div>
        <StatusBadge status={rt.status} accent={meta.accent} i={i} />
      </div>

      <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{meta.blurb}</p>

      {meta.comingSoon && (
        <p
          className="rounded-lg border border-dashed px-2.5 py-1.5 text-[12px] font-medium"
          style={{ borderColor: meta.accent, color: meta.accent }}
        >
          ⌛ {t.node.comingSoon} — {t.scenario.sendDisabled}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {lastEnd?.metrics.latency_ms !== undefined && (
          <Chip>{formatLatency(lastEnd.metrics.latency_ms)}</Chip>
        )}
        <Chip>{i.events(rt.events.length)}</Chip>
      </div>

      <WhySection meta={meta} i={i} />
      <TechSection meta={meta} lang={lang} i={i} />
      {renderDetail(selected, rt.events, i, view.usage, events)}
    </div>
  );
}

// 028-why-this-layer — the "why this layer / what breaks without it" block. Sits
// between the summary and the tech detail; renders only when the selected station
// carries the (additive, optional) `why`/`whatBreaks` fields from stations.ts.
function WhySection({ meta, i }: { meta: StationMeta; i: I }) {
  if (!meta.why || !meta.whatBreaks) return null;
  return (
    <Section title={i.whyTitle}>
      <Labeled label={i.whyLabel}>
        <p className="text-[12px] leading-relaxed text-[var(--color-text-soft)]">{meta.why}</p>
      </Labeled>
      <Labeled label={i.whatBreaksLabel}>
        <p className="text-[12px] leading-relaxed text-[var(--color-text-soft)]">
          {meta.whatBreaks}
        </p>
      </Labeled>
    </Section>
  );
}

function TechSection({ meta, lang, i }: { meta: StationMeta; lang: Lang; i: I }) {
  const cloud = useCloud((s) => s.cloud);
  const mode = useSettings((s) => s.mode);
  // The LLM block's model is read live (B2), never baked into stations.ts.
  // 074 follow-up: track the SELECTED agent's model+provider (e.g. an Ollama
  // model), not the server default — falls back to the health default.
  const { model: activeModel } = useActiveModel();
  const activeEmbeddingModel = useHealth((s) => s.embeddingModel);
  const comms = useT().comms;
  const tier = tierByIdFor(lang)[meta.tier];
  const stationById = stationByIdFor(lang);
  const hops = hopsFor(lang).filter((h) => h.source === meta.id || h.target === meta.id);
  const cloudName = CLOUDS.find((c) => c.code === cloud)?.label ?? cloud;

  return (
    <Section title={i.techInfra}>
      {meta.id === "llm" && <KeyVal k={i.model} v={activeModel ?? "—"} />}
      {meta.tech.map((row) => {
        const isEmbeddings = row.k === "embeddings";
        const val = isEmbeddings && activeEmbeddingModel ? activeEmbeddingModel : row.v;
        return <KeyVal key={row.k} k={row.k} v={val} />;
      })}
      <div className="my-2 h-px bg-[var(--color-line)]" />
      <KeyVal k={i.tier} v={`${tier.title} · ${tier.alias}`} />
      <KeyVal k={i.role} v={meta.generic} />
      {cloud !== "generic" && (
        <KeyVal k={i.cloudExample(cloudName)} v={cloudValue(meta, cloud)} />
      )}

      {hops.length > 0 && (
        <Labeled label={i.networkHops}>
          <div className="space-y-1.5">
            {hops.map((h) => {
              const outgoing = h.source === meta.id;
              const other = stationById[outgoing ? h.target : h.source];
              const zoneLabel = h.zone === "public" ? i.zonePublic : i.zonePrivate;
              const id = `${h.source}-${h.target}`;
              // The two streaming-capable hops flip async → sync under batch.
              const comm =
                id === "frontend-backend" || id === "agent-llm"
                  ? mode === "stream"
                    ? "async"
                    : "sync"
                  : h.comm;
              return (
                <div key={id} className="text-[11px] text-[var(--color-text-soft)]">
                  <span className="font-mono">
                    {outgoing ? "→" : "←"} {other.title}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    {" "}
                    · {h.secure ? "🔒 " : ""}
                    {h.protocol}
                  </span>
                  <div className="pl-3 text-[10.5px] text-[var(--color-label)]">{h.detail}</div>
                  <div className="pl-3 text-[10px] text-[var(--color-label)]">
                    {h.zone === "public" ? "🛡️" : "🔒"} {zoneLabel} · {h.controls}
                  </div>
                  <div
                    className="pl-3 text-[10px] font-mono"
                    style={{ color: comm === "async" ? "var(--color-sky-soft)" : "var(--color-sync)" }}
                  >
                    {comm === "async" ? "⇅ " : "⇄ "}
                    {comm} · {comm === "async" ? comms.asyncDetail : comms.syncDetail}
                  </div>
                </div>
              );
            })}
          </div>
        </Labeled>
      )}
    </Section>
  );
}

// `events` is the station's filtered slice; `allEvents` is the whole turn's log (some
// details — e.g. the MCP station's local DeepAgents tool calls — need cross-station data
// like `agent.think.tool_calls` that isn't in the station's own slice).
function renderDetail(
  id: StationId,
  events: TraceEvent[],
  i: I,
  usage: UsageTotals,
  allEvents: TraceEvent[],
) {
  switch (id) {
    case "frontend": {
      const sent = pick(events, "frontend", "end");
      const msg = (sent?.data.message as string | undefined) ?? undefined;
      const request = sent?.data.request as RequestBody | undefined;
      const respond = pick(events, "respond", "end");
      return (
        <>
          {msg && (
            <Section title={i.requestSent}>
              <Mono>{msg}</Mono>
            </Section>
          )}
          {request && (
            <Section title={i.requestBody}>
              <Scroll>{JSON.stringify(request, null, 2)}</Scroll>
            </Section>
          )}
          {respond?.data.answer !== undefined && (
            <Section title={i.answerReceived}>
              <Mono>{String(respond.data.answer)}</Mono>
            </Section>
          )}
        </>
      );
    }
    // 088-network-layer — each ingress appliance shows the real forwarded evidence
    // it injected (the headers the backend read back), verbatim. The theory (role,
    // controls, the full chain) renders on the hops; this is the per-run data.
    case "dns":
    case "cdn":
    case "waf":
    case "lb":
    case "apigw": {
      // The network StationIds are identical to their Stage values (dns/cdn/…).
      const ev = pick(events, id as Stage, "end");
      if (!ev) return null;
      return (
        <Section title={i.forwardedEvidence}>
          <Scroll>{JSON.stringify(ev.data, null, 2)}</Scroll>
        </Section>
      );
    }
    case "backend": {
      const routes = ["POST /api/chat", "GET /api/trace/{id}", "GET /api/health"];
      return (
        <Section title={i.routes}>
          {routes.map((r) => (
            <Mono key={r}>{r}</Mono>
          ))}
        </Section>
      );
    }
    case "database": {
      const read = pick(events, "db.read", "end");
      const write = pick(events, "db.write", "end");
      const recent = (read?.data.recent as Array<{ message: string; answer: string }> | undefined) ?? [];
      return (
        <>
          {read && (
            <Section title={i.historyRead}>
              <KeyVal k={i.totalRows} v={String(read.data.total_rows ?? 0)} />
              {recent.length > 0 ? (
                <Labeled label={i.recentMessages}>
                  <div className="space-y-1">
                    {recent.map((m, idx) => (
                      <Mono key={idx}>{m.message}</Mono>
                    ))}
                  </div>
                </Labeled>
              ) : (
                <p className="text-[11px] text-[var(--color-label)]">{i.noHistory}</p>
              )}
            </Section>
          )}
          {write && (
            <Section title={i.persisted}>
              <KeyVal k={i.operation} v={String(write.data.operation ?? "INSERT")} />
              <KeyVal k={i.totalRows} v={String(write.data.total_rows ?? "—")} />
            </Section>
          )}
        </>
      );
    }
    case "agent": {
      const route = pick(events, "agent.route");
      const thinks = events.filter((e) => e.stage === "agent.think" && e.phase === "end");
      const lastThink = thinks[thinks.length - 1];
      const calls = (lastThink?.data.tool_calls as Array<{ name: string; args: unknown }>) ?? [];
      return (
        <>
          {route?.data.query !== undefined && (
            <Section title={i.query}>
              <Mono>{String(route.data.query)}</Mono>
            </Section>
          )}
          {thinks.length > 0 && (
            <Section title={i.agentLoop}>
              <KeyVal k={i.reasoningTurns} v={String(thinks.length)} />
              <KeyVal k={i.lastDecision} v={String(lastThink?.data.decision ?? "—")} />
              {calls.length > 0 && (
                <div className="mt-1 space-y-1">
                  {calls.map((c, i) => (
                    <Mono key={i}>
                      {c.name}({JSON.stringify(c.args)})
                    </Mono>
                  ))}
                </div>
              )}
            </Section>
          )}
        </>
      );
    }
    case "ingestion": {
      // 033-ingestion-node + 080-ingestion-pipeline-merge — the offline RAG indexer,
      // now owning the whole write-path. Shows the durable object write (storage.upload,
      // its first "Object store" phase) and the chunk → embed → store detail when an
      // ingestion is in scope, plus the production concepts (chunking params, trigger,
      // refresh/staleness). The full phase walk lives in the ingestion drill-in.
      const up = pick(events, "storage.upload", "end");
      const upSize = up?.data.size_bytes as number | undefined;
      const ingChunk = pick(events, "rag.ingest.chunk", "end");
      const ingEmbed = pick(events, "rag.ingest.embed", "end");
      const ingStore = pick(events, "rag.ingest.store", "end");
      return (
        <>
          {up && (
            <Section title={i.storedObject}>
              <KeyVal k={i.objectKey} v={String(up.data.key ?? "—")} />
              <KeyVal
                k={i.size}
                v={typeof upSize === "number" ? `${upSize.toLocaleString()} B` : "—"}
              />
              <KeyVal k={i.contentType} v={String(up.data.content_type ?? "—")} />
            </Section>
          )}
          {(ingChunk || ingEmbed || ingStore) && (
            <IngestionDetail chunk={ingChunk} embed={ingEmbed} store={ingStore} i={i} />
          )}
          <Section title={i.indexerTitle}>
            <Labeled label={i.chunking}>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-soft)]">
                {i.chunkingValue}
              </p>
            </Labeled>
            <Labeled label={i.trigger}>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-soft)]">
                {i.triggerValue}
              </p>
            </Labeled>
            <Labeled label={i.indexRefresh}>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-soft)]">
                {i.indexRefreshValue}
              </p>
            </Labeled>
          </Section>
        </>
      );
    }
    case "rag": {
      const embed = pick(events, "rag.embed", "end");
      const retrieve = pick(events, "rag.retrieve", "end");
      const chunks = (retrieve?.data.chunks as Array<RagChunk>) ?? [];
      // 054-rag-block-expansion: on the Intermediate rung the query-time reranker
      // runs as a RAG sub-stage, so its before/after movement shows on this same
      // Vector DB station (and, in full, in the RAG drill-in).
      const rerank = pick(events, "rag.rerank", "end");
      const movement = (rerank?.data.candidates as RerankMove[]) ?? [];
      const rerankK = (rerank?.data.k as number | undefined) ?? movement.length;
      const rerankThreshold = (rerank?.data.threshold as number | undefined) ?? 0;
      // 070-hybrid-search: the BM25 + vector RRF fusion runs as a RAG sub-stage too, so
      // its per-candidate fusion shows on this same Vector DB station.
      const hybrid = pick(events, "rag.hybrid", "end");
      const fusion = (hybrid?.data.candidates as HybridMove[]) ?? [];
      return (
        <>
          {embed && (
            <Section title={i.queryEmbedding}>
              <KeyVal k={i.model} v={String(embed.data.model ?? "—")} />
              <KeyVal k={i.dimensions} v={String(embed.data.dim ?? "—")} />
              {Array.isArray(embed.data.preview) && (
                <Mono>
                  [{(embed.data.preview as number[]).slice(0, 8).map((n) => n.toFixed(3)).join(", ")}, …]
                </Mono>
              )}
            </Section>
          )}
          {hybrid && fusion.length > 0 && (
            <Section title={i.hybridFusion((hybrid.data.fused as number | undefined) ?? fusion.length)}>
              <HybridFusionList fusion={fusion} i={i} />
            </Section>
          )}
          {rerank && (
            <Section title={i.rerankMovement(movement.length)}>
              <KeyVal k={i.rerankModel} v={String(rerank.data.model ?? "—")} />
              <div className="mt-2">
                <RerankMovementList movement={movement} k={rerankK} i={i} threshold={rerankThreshold} />
              </div>
            </Section>
          )}
          {chunks.length > 0 && (
            <Section title={i.retrievedChunks(chunks.length)}>
              <div className="space-y-2">
                {chunks.map((c, idx) => (
                  <div key={idx} className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded bg-[var(--color-line)] px-1 font-mono text-[10px] text-[var(--color-muted)]">
                          #{c.rank ?? idx + 1}
                        </span>
                        <span className="truncate font-mono text-[var(--color-text-soft)]">{c.source}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {c.uploaded && (
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--color-ok)_22%,transparent)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--color-ok-soft)]">
                            {i.fromDocument}
                          </span>
                        )}
                        <span className="font-mono text-[var(--color-ok-soft)]">{c.score.toFixed(3)}</span>
                      </div>
                    </div>
                    <ScoreBar value={c.score} />
                    {(typeof c.similarity === "number" || c.distance !== undefined) && (
                      <div className="mt-1 flex gap-3 font-mono text-[10px] text-[var(--color-label)]">
                        {/* 070-hybrid-search: a fused BM25-only chunk has null similarity. */}
                        {typeof c.similarity === "number" && (
                          <span>
                            {i.similarity}: {c.similarity.toFixed(4)}
                          </span>
                        )}
                        {c.distance !== undefined && (
                          <span>
                            {i.distance}: {c.distance.toFixed(4)}
                          </span>
                        )}
                      </div>
                    )}
                    <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[var(--color-muted)]">{c.text}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      );
    }
    case "pageindex": {
      // 056-ragless-pageindex — the RAGLESS box's inspector detail: tree size, the
      // LLM navigation reasoning, and the sections it selected as grounding.
      const tree = pick(events, "pageindex.tree", "end");
      const nav = pick(events, "pageindex.navigate", "end");
      const select = pick(events, "pageindex.select", "end");
      const sections = (select?.data.chunks as Array<RagChunk & { title?: string }>) ?? [];
      return (
        <>
          {tree && (
            <Section title={i.documentTree}>
              <KeyVal k={i.treeNodes} v={String(tree.data.nodes ?? 0)} />
              <KeyVal k={i.selectedSections} v={String(select?.data.count ?? 0)} />
            </Section>
          )}
          {nav?.data.reasoning ? (
            <Section title={i.navReasoning}>
              <Mono>{String(nav.data.reasoning)}</Mono>
            </Section>
          ) : null}
          {sections.length > 0 && (
            <Section title={i.selectedSections}>
              <div className="space-y-2">
                {sections.map((c, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2"
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="shrink-0 rounded bg-[var(--color-line)] px-1 font-mono text-[10px] text-[var(--color-muted)]">
                        #{c.rank ?? idx + 1}
                      </span>
                      <span className="truncate font-mono text-[var(--color-text-soft)]">
                        {c.source}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-[var(--color-muted)]">
                      {c.text}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      );
    }
    case "mcp": {
      const discover = pick(events, "mcp.discover", "end");
      const tools = (discover?.data.tools as Array<{ name: string; description: string }>) ?? [];
      const calls = events.filter((e) => e.stage === "mcp.call" && e.phase === "end");
      // 067: DeepAgents local tools (write_todos / write_file / read_file / edit_file /
      // ls / task) execute via agent.* stages, not the MCP transport, so they never emit
      // mcp.call and were invisible here. Surface them too — they're elected tool calls
      // with no mcp.call result and no retrieval summary — so the tool station shows the
      // full activity in DeepAgents mode (they're animated in detail at the Agent node).
      const localCalls = electedToolCalls(allEvents).filter(
        (c) => c.result === undefined && c.retrievalSummary === undefined,
      );
      return (
        <>
          {discover && (
            <Section title={i.discoveredTools}>
              <KeyVal k={i.transport} v={String(discover.data.transport ?? "—")} />
              <div className="mt-1 space-y-1">
                {tools.map((t) => (
                  <div key={t.name}>
                    <div className="font-mono text-[12px] text-[var(--color-ink)]">{t.name}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">{t.description}</div>
                  </div>
                ))}
              </div>
              {discover.data.jsonrpc !== undefined && (
                <JsonRpc frames={discover.data.jsonrpc as JsonRpcFrames} i={i} />
              )}
            </Section>
          )}
          {calls.map((call, idx) => (
            <Section key={idx} title={i.toolCall}>
              {/* 017-failure-injection: a forced tool error, badged. */}
              {Boolean(call.data.simulated) && <SimulatedBadge label={i.simulatedError} />}
              {/* 051-failure-treatments: name the agent's reaction (graceful degradation). */}
              {Boolean(call.data.simulated) && (
                <TreatmentInfo data={call.data as unknown as SimulatedError} i={i} />
              )}
              <KeyVal k={i.tool} v={String(call.data.tool)} />
              <KeyVal k={i.args} v={JSON.stringify(call.data.args)} />
              <KeyVal k={i.result} v={String(call.data.result)} />
              {call.data.jsonrpc !== undefined && (
                <JsonRpc frames={call.data.jsonrpc as JsonRpcFrames} i={i} />
              )}
            </Section>
          ))}
          {localCalls.length > 0 && (
            <Section title={i.localToolCalls}>
              <p className="mb-1.5 text-[11px] text-[var(--color-muted)]">{i.localToolCallsHint}</p>
              <div className="space-y-1.5">
                {localCalls.map((c, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2"
                  >
                    <KeyVal k={i.tool} v={c.tool} />
                    <KeyVal k={i.args} v={JSON.stringify(c.args)} />
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      );
    }
    case "llm": {
      const prompt = pick(events, "llm.prompt", "end");
      const gen = pick(events, "llm.generate", "end");
      const preview = (prompt?.data ?? {}) as PromptPreview;
      return (
        <>
          {prompt && (
            <Section title={i.assembledPrompt}>
              {/* 017-failure-injection: a forced model timeout, badged. */}
              {Boolean(prompt.data.simulated) && <SimulatedBadge label={i.simulatedError} />}
              {/* 051-failure-treatments: the retry/backoff treatment on this attempt. */}
              {Boolean(prompt.data.simulated) && (
                <TreatmentInfo data={prompt.data as unknown as SimulatedError} i={i} />
              )}
              {preview.system && (
                <Labeled label={i.system}>
                  <Scroll>{preview.system}</Scroll>
                </Labeled>
              )}
              {Array.isArray(preview.history) && preview.history.length > 0 && (
                <Labeled label={i.history}>
                  <Scroll>
                    {preview.history
                      .map((h) => `▸ ${h.message}\n${h.answer}`)
                      .join("\n\n")}
                  </Scroll>
                </Labeled>
              )}
              {preview.context && (
                <Labeled label={i.retrievedContext}>
                  <Scroll>{preview.context}</Scroll>
                </Labeled>
              )}
              {Array.isArray(preview.tools) && preview.tools.length > 0 && (
                <Labeled label={i.tools}>
                  <div className="flex flex-wrap gap-1">
                    {preview.tools.map((tool) => (
                      <Chip key={tool}>{tool}</Chip>
                    ))}
                  </div>
                </Labeled>
              )}
              {Array.isArray(preview.messages) && preview.messages.length > 0 && (
                <Labeled label={i.userMessage}>
                  <Scroll>{preview.messages.map((m) => m.content).join("\n\n")}</Scroll>
                </Labeled>
              )}
            </Section>
          )}
          {gen?.data.answer !== undefined && (
            <Section title={i.generatedAnswer}>
              <KeyVal k={i.model} v={String(gen.data.model ?? "—")} />
              {/* 029-ttft-throughput: the two clocks of a streamed answer — the
                  wait before text appears, and the rate it then types out.
                  Rendered only when the generate END carried the real metrics. */}
              {typeof gen.metrics.ttft_ms === "number" && (
                <KeyVal k={i.ttft} v={formatLatency(gen.metrics.ttft_ms)} />
              )}
              {typeof gen.metrics.tokens_per_sec === "number" && (
                <KeyVal k={i.throughput} v={formatTps(gen.metrics.tokens_per_sec)} />
              )}
              <Mono>{String(gen.data.answer)}</Mono>
            </Section>
          )}
          {usage.rounds > 0 && (
            <Section title={i.usageCost}>
              <KeyVal k={i.rounds} v={String(usage.rounds)} />
              <KeyVal k={i.promptTokens} v={formatTokens(usage.promptTokens)} />
              <KeyVal k={i.completionTokens} v={formatTokens(usage.completionTokens)} />
              <KeyVal k={i.totalTokens} v={formatTokens(usage.totalTokens)} />
              <KeyVal k={i.cost} v={formatUsd(usage.costUsd)} />
              {/* 099-prompt-caching — cached slice + the money it saved, or an honest
                  "cold call below threshold" hint when nothing was cached. */}
              {usage.cachedTokens > 0 ? (
                <>
                  <KeyVal k={i.cachedTokens} v={formatTokens(usage.cachedTokens)} />
                  <KeyVal k={i.saved} v={formatUsd(usage.costSavedUsd)} />
                </>
              ) : (
                <p className="mt-1 text-[11px] leading-snug text-slate-400">{i.cacheColdHint}</p>
              )}
            </Section>
          )}
        </>
      );
    }
  }
}

// --- small presentational helpers ------------------------------------------

interface RagChunk {
  text: string;
  source: string;
  title: string;
  score: number;
  uploaded?: boolean;
  // 007-numeric-transparency: raw distance, its inverse similarity, and a stable
  // rank, so the inspector can render a ranked similarity table.
  distance?: number;
  // null for a fused BM25-only chunk (no cosine similarity) — 070-hybrid-search.
  similarity?: number | null;
  rank?: number;
}

// 054-rag-block-expansion — one candidate's rank movement through the reranker.
export interface RerankMove {
  prev_rank: number;
  new_rank: number;
  score: number;
  // 055/follow-up — the original vector-search cosine similarity, shown beside the
  // (differently-scaled) cross-encoder rerank `score` so the re-scoring is explicit.
  // null for a fused BM25-only chunk reranked under hybrid search (070).
  similarity?: number | null;
  source?: string;
  title?: string;
}

// The reranker before/after list: each candidate as `#prev → #new` with its
// cross-encoder score; the kept top-k are highlighted. Shared by the Inspector's
// reranker detail and the RAG drill-in (RagDetail), so both read identically.
export function RerankMovementList({
  movement,
  k,
  i,
  threshold = 0,
}: {
  movement: RerankMove[];
  k: number;
  i: I;
  // 055-rerank-score-threshold — a top-k chunk scoring below this is dropped, not kept.
  threshold?: number;
}) {
  const byNew = [...movement].sort((a, b) => a.new_rank - b.new_rank);
  // The kept set (→ Augmented) is contiguous at the top: the list is sorted by
  // new_rank, which the reranker assigns by score descending, so the top-k AND
  // ≥ threshold survivors lead. The dashed cutoff line is drawn right after them.
  const keptCount = byNew.filter((m) => m.new_rank <= k && m.score >= threshold).length;
  // The binding cut: the score threshold when it's the one excluding chunks, else top-k.
  const cutByScore = threshold > 0 && byNew.some((m) => m.new_rank <= k && m.score < threshold);
  return (
    <div className="space-y-1">
      {byNew.map((m, idx) => {
        const inTopK = m.new_rank <= k;
        const belowThreshold = inTopK && m.score < threshold;
        const kept = inTopK && !belowThreshold;
        const moved = m.new_rank - m.prev_rank;
        // The dashed cutoff line is drawn right after the last kept chunk: above it
        // goes to Augmented, below it is excluded.
        const showCutoff = idx + 1 === keptCount && keptCount < byNew.length;
        return (
          <Fragment key={idx}>
            <div
              className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[11px]"
              style={{
                borderColor: kept
                  ? "var(--color-ok)"
                  : belowThreshold
                    ? "var(--color-warn)"
                    : "var(--color-line)",
                opacity: kept ? 1 : 0.6,
              }}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)]">
                  #{m.prev_rank} → #{m.new_rank}
                </span>
                {moved !== 0 && (
                  <span
                    className="shrink-0 font-mono text-[10px]"
                    style={{ color: moved < 0 ? "var(--color-ok-soft)" : "var(--color-label)" }}
                  >
                    {moved < 0 ? `▲${-moved}` : `▼${moved}`}
                  </span>
                )}
                {m.source && (
                  <span className="truncate font-mono text-[var(--color-text-soft)]">
                    {m.source}
                  </span>
                )}
                {kept && (
                  <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-ok)_22%,transparent)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--color-ok-soft)]">
                    {i.rerankKept}
                  </span>
                )}
                {belowThreshold && (
                  <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-warn)_22%,transparent)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--color-warn)]">
                    {i.rerankBelowThreshold}
                  </span>
                )}
              </div>
              <span className="flex shrink-0 items-baseline gap-1 font-mono">
                {/* 070-hybrid-search: a fused BM25-only chunk has no cosine similarity
                    (it's null), so guard for a real number — not just `!== undefined`. */}
                {typeof m.similarity === "number" && (
                  <span className="text-[9.5px] text-[var(--color-label)]" title={i.rerankCosine}>
                    cos {m.similarity.toFixed(2)} →
                  </span>
                )}
                <span
                  style={{ color: belowThreshold ? "var(--color-warn)" : "var(--color-ok-soft)" }}
                  title={i.rerankScore}
                >
                  {m.score.toFixed(3)}
                </span>
              </span>
            </div>
            {showCutoff && (
              <div className="flex items-center gap-2 py-0.5" aria-hidden>
                <div className="h-0 flex-1 border-t border-dashed border-[var(--color-warn)]" />
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-warn)]">
                  {cutByScore ? i.rerankCutoffScore(threshold) : i.rerankCutoffTopK(k)}
                </span>
                <div className="h-0 flex-1 border-t border-dashed border-[var(--color-warn)]" />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// 070-hybrid-search — one fused candidate: its rank in each lane (null when a lane
// didn't rank it) and the combined RRF score.
export interface HybridMove {
  source?: string;
  vector_rank: number | null;
  bm25_rank: number | null;
  rrf_score: number;
  new_rank: number;
}

// The BM25 + vector fusion list: each fused chunk as `vec# / BM25#` → its RRF score,
// ordered by the fused rank. ↑ marks a chunk BM25 lifted above its dense rank. Shared
// by the Inspector's Vector DB detail (the RAG drill-in renders its own wider table).
export function HybridFusionList({ fusion, i }: { fusion: HybridMove[]; i: I }) {
  const byNew = [...fusion].sort((a, b) => a.new_rank - b.new_rank);
  return (
    <div className="space-y-1">
      {byNew.map((m, idx) => {
        const lifted =
          m.bm25_rank !== null && (m.vector_rank === null || m.new_rank < m.vector_rank);
        return (
          <div
            key={idx}
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px]"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)]">
                #{m.new_rank}
              </span>
              {lifted && <span className="shrink-0 font-mono text-[10px] text-[var(--color-ok-soft)]">↑</span>}
              {m.source && (
                <span className="truncate font-mono text-[var(--color-text-soft)]">{m.source}</span>
              )}
            </div>
            <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-[10px]">
              <span className="text-[var(--color-blue)]" title={i.hybridColVector}>
                {i.hybridColVector} {m.vector_rank ?? "—"}
              </span>
              <span className="text-[var(--color-ok-soft)]">BM25 {m.bm25_rank ?? "—"}</span>
              <span className="text-[var(--color-text-soft)]">RRF {m.rrf_score.toFixed(4)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// PDF ingestion detail (002-interactive-chat): chunking strategy, per-chunk
// tokenization, the embedding model/dimensions + a vector preview, and the
// store result — all composed from the three rag.ingest trace events.
function IngestionDetail({
  chunk,
  embed,
  store,
  i,
}: {
  chunk?: TraceEvent;
  embed?: TraceEvent;
  store?: TraceEvent;
  i: I;
}) {
  const c = (chunk?.data ?? {}) as {
    strategy?: string;
    chunk_size?: number;
    chunk_overlap?: number;
    num_chunks?: number;
    total_chars?: number;
    token_counts?: number[];
    previews?: string[];
  };
  const e = (embed?.data ?? {}) as {
    model?: string;
    dim?: number;
    num_vectors?: number;
    preview?: number[];
  };
  const s = (store?.data ?? {}) as {
    collection?: string;
    chunks_stored?: number;
    total_in_collection?: number;
  };
  return (
    <>
      {chunk && (
        <Section title={i.ingestion}>
          <KeyVal k={i.chunkStrategy} v={String(c.strategy ?? "—")} />
          <KeyVal k={i.chunkSize} v={`${c.chunk_size ?? "—"} / ${c.chunk_overlap ?? "—"}`} />
          <KeyVal k={i.retrievedChunks(c.num_chunks ?? 0).replace(/\s*\(.*\)/, "")} v={String(c.num_chunks ?? 0)} />
          {Array.isArray(c.token_counts) && c.token_counts.length > 0 && (
            <Labeled label={i.tokensPerChunk}>
              <div className="flex flex-wrap gap-1">
                {c.token_counts.map((n, idx) => (
                  <Chip key={idx}>{n}</Chip>
                ))}
              </div>
            </Labeled>
          )}
          {Array.isArray(c.previews) && c.previews.length > 0 && (
            <Labeled label={i.chunkPreviews}>
              <div className="space-y-1">
                {c.previews.map((p, idx) => (
                  <Mono key={idx}>{p}</Mono>
                ))}
              </div>
            </Labeled>
          )}
        </Section>
      )}
      {embed && (
        <Section title={i.queryEmbedding}>
          <KeyVal k={i.model} v={String(e.model ?? "—")} />
          <KeyVal k={i.dimensions} v={String(e.dim ?? "—")} />
          <KeyVal k={i.vectorsStored} v={String(e.num_vectors ?? 0)} />
          {Array.isArray(e.preview) && e.preview.length > 0 && (
            <Labeled label={i.vectorPreview}>
              <Mono>[{e.preview.map((n) => n.toFixed(3)).join(", ")}, …]</Mono>
            </Labeled>
          )}
        </Section>
      )}
      {store && (
        <Section title={i.vectorsStored}>
          <KeyVal k={i.vectorsStored} v={String(s.chunks_stored ?? 0)} />
          <KeyVal k={i.totalInCollection} v={String(s.total_in_collection ?? "—")} />
          <KeyVal k="collection" v={String(s.collection ?? "—")} />
        </Section>
      )}
    </>
  );
}
interface PromptPreview {
  system?: string;
  context?: string;
  tools?: string[];
  // The current turn's user message(s) and the folded-in long-term history —
  // both already carried in prompt_preview, surfaced in the inspector (B3).
  messages?: { role: string; content: string }[];
  history?: { message: string; answer: string }[];
}

function pick(events: TraceEvent[], stage?: Stage, phase?: Phase): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((stage === undefined || e.stage === stage) && (phase === undefined || e.phase === phase)) {
      return e;
    }
  }
  return undefined;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] p-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12px]">
      <span className="shrink-0 text-[var(--color-muted)]">{k}</span>
      <span className="break-all text-right font-mono text-[var(--color-ink)]">{v}</span>
    </div>
  );
}

// 017-failure-injection — a dashed warning strip flagging an injected (simulated)
// failure on a tool call / model reasoning block.
// 051-failure-treatments — the resilience *treatment* read from the same END
// `data` (additive keys). Renders whichever of attempt/backoff/circuit/treatment
// are present, mapping the treatment enum to its bilingual label.
function TreatmentInfo({ data, i }: { data: SimulatedError; i: I }) {
  const treatmentLabel =
    data.treatment === "fallback"
      ? i.treatmentFallback
      : data.treatment === "graceful_degradation"
        ? i.treatmentGraceful
        : undefined;
  return (
    <>
      {Boolean(data.attempt) && Boolean(data.max_retries) && (
        <KeyVal k={i.attempt} v={`${data.attempt}/${data.max_retries}`} />
      )}
      {typeof data.backoff_ms === "number" && <KeyVal k={i.backoff} v={`${data.backoff_ms} ms`} />}
      {Boolean(data.circuit) && <KeyVal k={i.circuit} v={String(data.circuit)} />}
      {treatmentLabel && <KeyVal k={i.treatment} v={treatmentLabel} />}
    </>
  );
}

function SimulatedBadge({ label }: { label: string }) {
  return (
    <p
      className="mb-1.5 rounded-lg border border-dashed px-2 py-1 text-[11px] font-medium"
      style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}
    >
      {label}
    </p>
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

// Collapsible JSON-RPC request/response frames (007-numeric-transparency). The
// frames are reconstructed for the in-process local fallback — badged so they
// never masquerade as real wire traffic.
function JsonRpc({ frames, i }: { frames: JsonRpcFrames; i: I }) {
  return (
    <details className="mt-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)]">
      <summary className="cursor-pointer select-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {i.jsonrpc}
        {frames.reconstructed && (
          <span className="ml-1.5 rounded-full border border-[var(--color-line)] px-1.5 py-px text-[9px] font-normal normal-case tracking-normal text-[var(--color-label)]">
            {i.reconstructed}
          </span>
        )}
      </summary>
      <div className="space-y-1 px-2 pb-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-label)]">
          {i.request}
        </div>
        <Scroll>{JSON.stringify(frames.request, null, 2)}</Scroll>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-label)]">
          {i.response}
        </div>
        <Scroll>{JSON.stringify(frames.response, null, 2)}</Scroll>
      </div>
    </details>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-text-soft)]">
      {children}
    </pre>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-text-soft)]">
      {children}
    </span>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
      <div
        className="h-full rounded-full bg-[var(--color-ok)]"
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

function StatusBadge({ status, accent, i }: { status: string; accent: string; i: I }) {
  const label = status === "active" ? i.status.active : status === "done" ? i.status.done : i.status.idle;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: status === "idle" ? "var(--color-label)" : accent,
        border: `1px solid ${status === "idle" ? "var(--color-line)" : accent}`,
      }}
    >
      {label}
    </span>
  );
}

function Overview({
  onSelect,
  onOpenTraces,
  stations,
  i,
}: {
  onSelect: (id: StationId) => void;
  onOpenTraces: () => void;
  stations: StationMeta[];
  i: I;
}) {
  const cloud = useCloud((s) => s.cloud);
  const events = useSimulator((s) => s.events);
  const x = useT().timeline.execTrace;
  const tree = useMemo(() => executionTree(events), [events]);
  const hasRun = tree.spans.length > 0 && tree.totalMs > 0;
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">{i.overviewTitle}</h2>
      <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{i.overviewBody}</p>
      <div className="space-y-1.5">
        {/* Whole-run execution-trace tree (038, supersedes the flat 015 waterfall).
            Listed like a station but opens as a full-width overlay (more room than
            the narrow panel); it summarizes the whole run, so it sits first. */}
        <button
          onClick={onOpenTraces}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-left transition hover:border-[color-mix(in_srgb,var(--color-sky)_50%,transparent)]"
        >
          <span className="text-lg" aria-hidden>
            🌳
          </span>
          <span className="text-[13px] text-[var(--color-ink)]">{x.title}</span>
          <span className="ml-auto truncate pl-2 font-mono text-[10px] text-[var(--color-muted)]">
            {hasRun ? formatLatency(tree.totalMs) : ""}
          </span>
        </button>
        {stations.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-left transition hover:border-[color-mix(in_srgb,var(--color-sky)_50%,transparent)]"
          >
            <span className="text-lg">{s.icon}</span>
            <span className="text-[13px] text-[var(--color-ink)]">{s.title}</span>
            <span className="ml-auto truncate pl-2 font-mono text-[10px] text-[var(--color-muted)]">
              {cloudValue(s, cloud)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 085-hop-communication-detail — a clicked arrow's detail: the communication
// theory (from the hop meta) + the REAL data that crossed it this run
// (`deriveHopData`, cursor-bounded). Lives in the Inspector body, like a station.
function HopDetail({
  hopId,
  events,
  lang,
  i,
  onBack,
}: {
  hopId: string;
  events: TraceEvent[];
  lang: Lang;
  i: I;
  onBack: () => void;
}) {
  const [source, target] = hopId.split("-") as [StationId, StationId];
  const stationById = stationByIdFor(lang);
  const hop = hopsFor(lang).find((h) => h.source === source && h.target === target);
  const data = deriveHopData(source, target, events);
  const sourceTitle = stationById[source]?.title ?? source;
  const targetTitle = stationById[target]?.title ?? target;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <button
        onClick={onBack}
        className="-mb-1 self-start rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
      >
        {i.overviewBack}
      </button>

      <div className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
        {sourceTitle} <span className="text-[var(--color-muted)]">→</span> {targetTitle}
      </div>

      {hop && (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{hop.zone === "public" ? `🛡️ ${i.zonePublic}` : `🔒 ${i.zonePrivate}`}</Chip>
            {hop.comm && <Chip>{hop.comm === "async" ? "⇅ async" : "⇄ sync"}</Chip>}
          </div>
          {hop.protocol && (
            <div className="font-mono text-[12px] font-semibold text-[var(--color-sky-soft)]">
              {hop.secure ? "🔒 " : ""}
              {hop.protocol}
            </div>
          )}
          {hop.detail && (
            <p className="text-[13px] leading-relaxed text-[var(--color-text-soft)]">{hop.detail}</p>
          )}
          {hop.controls && (
            <div className="font-mono text-[10.5px] text-[var(--color-muted)]">{hop.controls}</div>
          )}
          {hop.why && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                {i.hopWhy}
              </div>
              <p className="text-[12px] leading-relaxed text-[var(--color-text-soft)]">{hop.why}</p>
            </div>
          )}
        </>
      )}

      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {i.onThisRun}
      </div>
      <HopRunBlock data={data} i={i} />
    </div>
  );
}

function HopRunBlock({ data, i }: { data: ReturnType<typeof deriveHopData>; i: I }) {
  switch (data.kind) {
    case "edge":
      return (
        <>
          {data.chain.length > 0 && (
            <Section title={i.edgeChain}>
              <EdgeChain chain={data.chain} i={i} />
            </Section>
          )}
          {data.edge && (
            <Section title={i.hopForwarded}>
              <KeyVal k={i.edgeScheme} v={data.edge.scheme} />
              <KeyVal k={i.edgeClient} v={data.edge.client_ip ?? "—"} />
              <KeyVal k={i.edgeRequestId} v={data.edge.request_id ?? "—"} />
              {!data.edge.proxied && (
                <p className="text-[11px] text-[var(--color-label)]">{i.edgeDirectNote}</p>
              )}
            </Section>
          )}
          {data.requestBody && (
            <Section title={i.hopRequest}>
              <Scroll>{JSON.stringify(data.requestBody, null, 2)}</Scroll>
            </Section>
          )}
          {data.answer !== undefined && (
            <Section title={i.hopAnswer}>
              <Mono>{data.answer}</Mono>
            </Section>
          )}
          {!data.edge && data.chain.length === 0 && (
            <p className="text-[12px] text-[var(--color-label)]">{i.noHopData}</p>
          )}
        </>
      );
    case "request":
      return (
        <>
          {data.requestBody ? (
            <Section title={i.hopRequest}>
              <Scroll>{JSON.stringify(data.requestBody, null, 2)}</Scroll>
            </Section>
          ) : (
            <p className="text-[12px] text-[var(--color-label)]">{i.noHopData}</p>
          )}
          {data.answer !== undefined && (
            <Section title={i.hopAnswer}>
              <Mono>{data.answer}</Mono>
            </Section>
          )}
        </>
      );
    case "sql":
      return (
        <Section title={i.hopQueries}>
          {data.queries.map((q, idx) => (
            <Mono key={idx}>{`${q.operation} → ${q.rows} rows\n${q.sql}`}</Mono>
          ))}
        </Section>
      );
    case "rag":
      return (
        <Section title={i.hopChunks}>
          <KeyVal k={i.hopChunks} v={String(data.chunks)} />
          {typeof data.topScore === "number" && (
            <KeyVal k={i.hopScore} v={data.topScore.toFixed(2)} />
          )}
        </Section>
      );
    case "mcp":
      return (
        <Section title={i.hopToolCalls}>
          {data.toolCalls.map((c, idx) => (
            <KeyVal key={idx} k={c.tool} v={c.result} />
          ))}
        </Section>
      );
    case "llm":
      return (
        <>
          {data.prompt && (
            <Section title={i.hopPrompt}>
              {data.prompt.system && (
                <Labeled label={i.system}>
                  <Scroll>{data.prompt.system}</Scroll>
                </Labeled>
              )}
              {Array.isArray(data.prompt.tools) && data.prompt.tools.length > 0 && (
                <Labeled label={i.tools}>
                  <div className="flex flex-wrap gap-1">
                    {data.prompt.tools.map((tool) => (
                      <Chip key={tool}>{tool}</Chip>
                    ))}
                  </div>
                </Labeled>
              )}
            </Section>
          )}
          {data.usage.totalTokens > 0 && (
            <Section title={i.usageCost}>
              <KeyVal k={i.totalTokens} v={formatTokens(data.usage.totalTokens)} />
              <KeyVal k={i.cost} v={formatUsd(data.usage.costUsd)} />
            </Section>
          )}
          {!data.prompt && data.usage.totalTokens === 0 && (
            <p className="text-[12px] text-[var(--color-label)]">{i.noHopData}</p>
          )}
        </>
      );
    case "none":
    default:
      return <p className="text-[12px] text-[var(--color-label)]">{i.noHopData}</p>;
  }
}

function EdgeChain({ chain, i }: { chain: EdgeChainSeg[]; i: I }) {
  return (
    <div className="flex flex-col">
      {chain.map((seg, idx) => (
        <Fragment key={seg.id}>
          <div
            className={`flex items-center justify-between rounded-md border px-2 py-1 text-[12px] ${
              seg.real
                ? "border-[var(--color-sky)] bg-[color-mix(in_srgb,var(--color-sky)_10%,transparent)]"
                : "border-dashed border-[var(--color-line)]"
            }`}
          >
            <span className="font-medium text-[var(--color-ink)]">{seg.label}</span>
            <span
              className={`font-mono text-[11px] ${
                seg.real ? "text-[var(--color-sky-soft)]" : "text-[var(--color-muted)]"
              }`}
            >
              {seg.real ? (seg.value ?? "—") : i.edgePreview}
            </span>
          </div>
          {idx < chain.length - 1 && <div className="mx-auto h-2 w-px bg-[var(--color-line)]" />}
        </Fragment>
      ))}
    </div>
  );
}
