// All UI "chrome" strings (everything that isn't the curated learning content
// or the architecture data, which live localized in their own files). One
// object per language; the `Strings` interface keeps both in lockstep.

import type { TraceNode } from "../lib/executionTree";
import type { TimelinePhase } from "../lib/phases";
import type { Lang } from "./index";

export interface Strings {
  // 096-harness-loop-lens — the Harness ⇄ Loop lens (toggle + legend + loop readout).
  lens: {
    label: string; // aria/title for the lens control group
    mode: { all: string; harness: string; loop: string };
    legend: { harness: string; loop: string; learnMore: string };
    // harness-role badge labels (keys mirror HarnessRole in lib/harness.ts).
    role: {
      tools: string;
      knowledge: string;
      memory: string;
      context: string;
      permissions: string;
      model: string;
      orchestration: string;
      delivery: string;
      observability: string;
    };
    // one-line glossary hint per role (canvas-jargon-tooltips convention: every
    // canvas badge term gets a definition on hover). Same keys as `role`.
    roleHint: {
      tools: string;
      knowledge: string;
      memory: string;
      context: string;
      permissions: string;
      model: string;
      orchestration: string;
      delivery: string;
      observability: string;
    };
    // the role-legend header + the Agent-Harness disambiguation (nesting story).
    roleLegendTitle: string;
    // the Agent node is the runtime CORE of the wider harness ("Agent Harness"),
    // relabelled so it doesn't read as just another orchestration box; the Context
    // chip shows that the context window (context engineering) nests inside it.
    core: string;
    coreHint: string;
    contextChip: string;
    contextHint: string;
    // the Loop-lens readout, projected from lib/loop.ts::deriveLoopView.
    loop: {
      iteration: (n: number, max: number) => string;
      stopFinal: string;
      stopMax: string;
      recovery: string;
      inProgress: string;
    };
  };
  app: {
    tagline: string;
    learn: string;
    simulator: string;
    // 041-settings-page: header toggle label (mirrors `learn` / `simulator`).
    config: string;
    liveTitle: string;
    language: string;
    cloud: string;
    theme: string;
    themeDark: string;
    themeLight: string;
    // Health banner (B9): backend unreachable, or up but missing the API key.
    offline: string;
    noKey: string;
  };
  // 100-arena-capacity-sandbox — the separate "Arena" page (capacity sandbox).
  // Kept type-independent of arena/* to avoid an i18n ↔ arena import cycle:
  // component KIND labels live localized in arena/components.ts (KIND_META).
  arena: {
    nav: string; // header button label (beside Learn)
    title: string;
    tagline: string;
    honesty: string; // the §3 "this is a model, not a live load test" banner
    paletteTitle: string;
    paletteHint: string;
    examples: string; // 101 — the "load an example scenario" menu label
    emptyCanvas: string;
    // 103 — the Little's-Law load drive (concurrent users ÷ think time = rps).
    usersLabel: string;
    thinkTime: string;
    thinkTimeHint: string;
    usersReadout: (users: string, rps: string) => string;
    // 110 — closed-loop: when latency self-throttles the population, the header
    // shows the demanded rate → the effective equilibrium rate.
    effectiveRate: (rps: string) => string;
    closedLoopHint: string;
    // 103 — agent fan-out + honest-overload + derived readouts.
    callsPerRequest: string;
    callsHint: string;
    shedding: (n: string) => string;
    // 108 — the honest control-bar readout when any node sheds: a latency figure
    // past saturation would be fiction, so the header reports the shed rate.
    saturatedHeader: (n: string) => string;
    saturatedHint: string;
    e2eLatency: string;
    e2eLatencyHint: string;
    llmCost: string;
    llmCostHint: string;
    // 111 — the two LLM bills: provisioned capacity (billed even idle) + usage.
    llmCostProvisioned: (v: string) => string;
    llmCostUsage: (v: string) => string;
    reset: string;
    scaling: string; // the selected-node scaling panel heading
    metric: { qps: string; latency: string; util: string; capacity: string; inflight: string };
    // 113 — the held-in-flight explainer (Little's Law: thr × time held open).
    inflightInfo: string;
    status: { healthy: string; warning: string; critical: string; unreachable: string };
    size: string;
    // 104 — the ℹ️ explainer toggle + the capacity formula hint. The horizontal
    // unit label is per-kind (KIND_META.scaling.unit), no generic "replicas".
    infoLabel: string;
    capacityHint: string;
    // 105 — the client-side LLM routing tax note (pct already formatted, e.g. "38%").
    routingTax: (pct: string, n: number) => string;
    // 114 — the regional LLM quota note (a region caps provisionable capacity).
    quotaLimited: (region: string) => string;
    quotaHint: string;
    // 106 — the per-node region annotation (multi-region pools).
    region: string;
    regionHint: string;
    regionNone: string;
    // 107 — wiring gestures taught in the palette footer.
    autoWireHint: string;
    edgeHint: string;
    // 115 — builder nudges: the fan-out suggestion chip + the units-ceiling hint.
    fanoutNudge: string;
    fanoutApply: string;
    fanoutDismiss: string;
    replicasCeilingHint: string;
    sizes: { small: string; medium: string; large: string; xlarge: string };
    cacheHitRatio: string;
    bottleneck: string;
    selectHint: string;
    remove: string;
  };
  // 058-online-demo-mode: the backend-less GitHub Pages showcase build.
  demo: {
    bannerLead: string;
    bannerCta: string;
    composerHint: string;
    sampleBarLabel: string;
  };
  // 063-mobile-demo-layout: bottom tab-bar labels for the demo build's phone layout.
  mobile: {
    tab: {
      canvas: string;
      chat: string;
      inspector: string;
    };
  };
  chat: {
    title: string;
    subtitle: string;
    placeholder: string;
    running: string;
    send: string;
    answer: string;
    thinking: string;
    // 093-waf-block-visualization — the chat note when the WAF blocked the turn.
    wafBlocked: string;
    // 012-chat-flow-sync: running-status label per pipeline stage, shown in the
    // live chat bubble in step with the paced playhead (gerund form, parallel to
    // timeline.phases). `thinking` is the fallback before the first stage.
    stage: Record<TimelinePhase, string>;
    answerHint: string;
    examples: string[];
    // Conversation list ↔ thread (002-interactive-chat).
    conversations: string;
    newChat: string;
    empty: string;
    untitled: string;
    back: string;
    you: string;
    agent: string;
    sources: string;
    fromDoc: string;
    // Per-search subheader in "Sources used" when the agent searched the KB more than
    // once (the chunks are grouped by the search that retrieved them).
    searchGroup: (n: number, query: string) => string;
    emptyThread: string;
    messages: (n: number) => string;
    uploadPdf: string;
    documents: string;
    removeDoc: string;
    chunksStored: (n: number) => string;
    uploading: string;
    uploadFailed: string;
    now: string;
    attachDoc: string;
    enterToSend: string;
    // 016-cancel-stream: the in-flight cancel control + the cancelled-state note.
    cancel: string;
    cancelled: string;
    // 027-skills: the "skills applied" badge on an answer (count + hover list).
    skillsApplied: (n: number) => string;
    skillsBadge: string;
    // 040-message-attachments: inline hint above the composer's pending chips
    // + the hover/title on chips already committed to a sent user message.
    pendingAttachmentsHint: string;
    attachedToThisMessage: string;
    // 045-composer-agent-selector: the composer's mini agent picker (left of
    // 📎). Locked state engages once a turn lands (`message_count > 0`); the
    // 044 dialog catalog sidebar reuses the same `locked` string. The aria
    // labels are functions because they include the agent's name.
    agentSelector: {
      label: string;
      menuHeading: string;
      ariaLabel: (agentName: string) => string;
      locked: string;
      lockedAriaLabel: (agentName: string) => string;
      lockedInlineNote: string;
    };
  };
  // 022-message-trace-link: revisit a past turn's trace on the canvas.
  trace: {
    clickToLoad: string;
    loaded: string;
    expired: string;
  };
  // 018-cumulative-hud: the per-conversation running totals + pre-send estimate.
  hud: {
    turns: string;
    tokens: string;
    cost: string;
    toolCalls: string;
    ragHits: string;
    partial: string;
    estimate: string;
    tokenizer: string;
    // 029-ttft-throughput: the input/output (prompt/completion) token split.
    tokensIn: string;
    tokensOut: string;
  };
  inspector: {
    overviewTitle: string;
    overviewBody: string;
    overviewBack: string;
    // 028-why-this-layer — the "why this layer / what breaks" section.
    whyTitle: string;
    whyLabel: string;
    whatBreaksLabel: string;
    techInfra: string;
    tier: string;
    role: string;
    hosting: string;
    cloudExample: (cloud: string) => string;
    networkHops: string;
    networkZone: string;
    controls: string;
    zonePublic: string;
    zonePrivate: string;
    events: (n: number) => string;
    historyRead: string;
    recentMessages: string;
    totalRows: string;
    noHistory: string;
    persisted: string;
    operation: string;
    requestSent: string;
    answerReceived: string;
    routes: string;
    // 088-network-layer — the ingress appliance's real forwarded evidence (the
    // headers it injected), shown verbatim in its Inspector detail.
    forwardedEvidence: string;
    query: string;
    agentLoop: string;
    reasoningTurns: string;
    lastDecision: string;
    queryEmbedding: string;
    model: string;
    dimensions: string;
    retrievedChunks: (n: number) => string;
    // 070-hybrid-search — the BM25 + vector RRF fusion shown on the Vector DB station.
    hybridFusion: (n: number) => string;
    hybridColVector: string;
    // 054-rag-block-expansion — the reranker drill-in: per-candidate rank movement.
    rerankMovement: (n: number) => string;
    rerankModel: string;
    rerankScore: string;
    rerankCosine: string; // tooltip — the original vector-search cosine similarity
    rerankKept: string;
    rerankBelowThreshold: string; // 055 — a top-k chunk dropped by the score threshold
    // The dashed cutoff line separating chunks kept (→ Augmented) from those excluded.
    rerankCutoffScore: (threshold: number) => string;
    rerankCutoffTopK: (k: number) => string;
    // PDF ingestion (002-interactive-chat).
    ingestion: string;
    chunkStrategy: string;
    chunkSize: string;
    tokensPerChunk: string;
    chunkPreviews: string;
    vectorsStored: string;
    totalInCollection: string;
    vectorPreview: string;
    fromDocument: string;
    // 085-hop-communication-detail — clicking an arrow opens its detail here.
    onThisRun: string; // section title for the real per-run data that crossed the hop
    // 086-hop-detail-enrichment — the per-hop role/reasoning + the edge expand affordance.
    hopWhy: string; // "Why this hop" section title
    hopExpandHint: string; // title/aria for the ⊕ expand control on the edge label
    hopExpandLabel: string; // short visible label on the edge's expand pill
    noHopData: string; // honest empty-state when nothing crossed the hop this run
    hopRequest: string; // the request body row group
    hopAnswer: string; // the final answer row group
    hopForwarded: string; // forwarded headers row group (edge)
    hopQueries: string; // SQL statements row group
    hopChunks: string; // retrieved chunks row group
    hopScore: string; // top similarity score row
    hopToolCalls: string; // MCP tool calls row group
    hopPrompt: string; // assembled prompt row group
    // 084-network-edge — the Network Edge expanded chain + inspector rows.
    edgePreview: string; // marker on the non-executing chain segments (DNS/CDN/WAF/API GW)
    edgeChain: string; // the expanded chain label
    edgeClient: string; // forwarded client IP row
    edgeRequestId: string; // request id row
    edgeScheme: string; // scheme (http/https) row
    edgeDirectNote: string; // honest "no proxy in front" note
    // 056-ragless-pageindex — RAGLESS box at-a-glance rows + inspector detail.
    treeNodes: string;
    selectedSections: string;
    navReasoning: string;
    documentTree: string;
    // 033-ingestion-node — the offline-indexer concept rows (real values).
    indexerTitle: string;
    chunking: string;
    chunkingValue: string;
    trigger: string;
    triggerValue: string;
    indexRefresh: string;
    indexRefreshValue: string;
    indexerIdle: string;
    // 034-storage-ingestion-flow — the object-storage detail rows.
    storedObject: string;
    objectKey: string;
    size: string;
    contentType: string;
    whyStorage: string;
    whyStorageValue: string;
    discoveredTools: string;
    transport: string;
    toolCall: string;
    tool: string;
    args: string;
    result: string;
    // 067 — DeepAgents local tools (write_todos/write_file/…) that run in-process,
    // not over the MCP transport (so they carry no JSON-RPC frame).
    localToolCalls: string;
    localToolCallsHint: string;
    // 017-failure-injection — label for an injected (simulated) failure block.
    simulatedError: string;
    // 051-failure-treatments — labels for the resilience treatment the simulator
    // now exercises (retry / backoff / circuit breaker / graceful degradation).
    attempt: string;
    backoff: string;
    circuit: string;
    treatment: string;
    treatmentFallback: string;
    treatmentGraceful: string;
    // Raw protocol/data transparency (007-numeric-transparency).
    jsonrpc: string;
    request: string;
    response: string;
    requestBody: string;
    reconstructed: string;
    rank: string;
    distance: string;
    similarity: string;
    assembledPrompt: string;
    system: string;
    retrievedContext: string;
    tools: string;
    // The LLM assembled-prompt section also surfaces the USER message and the
    // folded-in conversation history (B3).
    userMessage: string;
    history: string;
    generatedAnswer: string;
    // 029-ttft-throughput — generation latency/rate on the LLM block.
    ttft: string;
    throughput: string;
    // Token usage + cost (011-token-cost).
    usageCost: string;
    rounds: string;
    promptTokens: string;
    completionTokens: string;
    totalTokens: string;
    cost: string;
    // 099-prompt-caching — cached-token line + saving + honest cold-call hint.
    cachedTokens: string;
    saved: string;
    cacheColdHint: string;
    status: { active: string; done: string; idle: string };
  };
  comms: {
    sync: string; // chip word (technical, same in both languages)
    async: string;
    syncDetail: string; // blocking request/response
    asyncDetail: string; // streamed response
    deliveryStreamDetail: string; // frontend↔backend, stream mode
    deliveryBatchDetail: string; // frontend↔backend, batch mode
    llmStreamDetail: string; // agent→llm, stream mode
    llmBatchDetail: string; // agent→llm, batch mode
  };
  settings: {
    open: string;
    label: string;
    title: string;
    // 041-settings-page: chrome for the dedicated Settings page.
    pageTitle: string;
    pageTagline: string;
    backToSim: string;
    delivery: string;
    deliveryHint: string;
    streaming: string;
    streamingHint: string;
    batch: string;
    batchHint: string;
    // 072-chunking-strategies — the Knowledge base section (chunking strategy + re-ingest).
    kb: {
      title: string;
      hint: string;
      strategy: string;
      reingest: string;
      reingesting: string;
      done: (n: number) => string;
      active: string;
      // Shown when the chosen strategy differs from the one the index is built with:
      // the selection is pending until a re-ingest (and only then do new uploads use it).
      applyHint: string;
      // 082-chunking-explainers — per-strategy "how it works" + live-example labels.
      explain: {
        title: string;
        fixed: string;
        recursive: string;
        semantic: string;
        agentic: string;
        example: string;
        loading: string;
      };
      // 081-chunking-config — per-strategy parameter controls.
      params: {
        title: string;
        chunkSize: string;
        chunkOverlap: string;
        threshold: string;
        maxSegments: string;
        sizeHint: string;
        overlapHint: string;
        thresholdHint: string;
        maxSegmentsHint: string;
      };
    };
    // 075-ollama-embeddings — the instance-wide embedding provider + model.
    embeddings: {
      title: string;
      hint: string;
      provider: string;
      openai: string;
      ollama: string;
      vertexai: string;
      vertexaiHint: string;
      model: string;
      modelPlaceholder: string;
      rebuildNote: string;
      unreachable: string;
      saved: string;
    };
    // Real, working controls (006-interactive-experiments) — replaced the old
    // "SOON" Tools/RAG placeholders.
    experiment: {
      title: string;
      systemPrompt: string;
      promptHint: string;
      reset: string;
      tools: string;
      toolsHint: string;
      // 031-tool-catalog-clarity — distinguishes full RAG retrieval from the
      // canned glossary and states the toggle-everything / ungrounded-if-off truth.
      toolsDisambig: string;
      topK: string;
      topKHint: string;
      rerankThreshold: string;
      rerankThresholdHint: string;
      // 098-verify-reflection-loop — the verification-loop toggle + its help.
      verify: string;
      verifyHint: string;
      // 056-ragless-pageindex — the RAGLESS (PageIndex) toggle + its help, and the
      // note shown when it's unavailable (Simple rung).
      ragless: {
        label: string;
        hint: string;
        on: string;
        off: string;
        simpleOnly: string;
      };
      // Friendly per-tool labels, keyed by MCP tool name.
      toolLabels: Record<string, string>;
      // 017-failure-injection — the "Simulate failure" selector + its options,
      // keyed by SimulateFailure value (none / tool_error / llm_timeout).
      failure: {
        label: string;
        hint: string;
        modes: Record<string, string>;
      };
    };
    // 025-clear-databases — the "Clear databases" reset control + inline confirm.
    data: {
      title: string;
      clear: string;
      clearHint: string;
      confirm: string;
      confirmHint: string;
      confirmYes: string;
      cancel: string;
      clearing: string;
      cleared: string;
    };
    // 027-skills — the global skill-catalog CRUD section (list + inline editor).
    skills: {
      title: string;
      hint: string;
      new: string;
      name: string;
      namePlaceholder: string;
      description: string;
      descPlaceholder: string;
      body: string;
      bodyPlaceholder: string;
      save: string;
      delete: string;
      cancel: string;
      empty: string;
      nameTaken: string;
      saveFailed: string;
    };
  };
  // One-line plain-language hints for the dense tech tags on each station node,
  // keyed by the tag string (e.g. "ASGI", "cosine", "MCP"). Demystifies jargon.
  glossary: Record<string, string>;
  timeline: {
    title: string;
    hint: string;
    stepBack: string;
    pause: string;
    replay: string;
    stepForward: string;
    idle: string;
    // Named phase markers on the scrubber (004-timeline-phases).
    phases: Record<TimelinePhase, string>;
    // Execution-traces span tree (038-execution-traces, supersedes 015). Node
    // names are LangGraph-faithful; `ChatOpenAI` and tool names are proper nouns
    // rendered verbatim (not here).
    execTrace: {
      title: string;
      subtitle: string;
      empty: string;
      nodes: Record<TraceNode, string>;
      child: { embed: string; search: string; select: string };
      // 062 — the plan node's row tag word ("3 {planTodos}").
      planTodos: string;
    };
  };
  // 030-event-console — the expandable, scrollable trace log next to the footer.
  console: {
    title: string;
    expand: string;
    collapse: string;
    explain: string;
    copyEvent: string;
    copyTrace: string;
    copyId: string;
    copied: string;
    size: string;
    latency: string;
    from: string;
    to: string;
  };
  // Guided tour — storytelling playback (005-guided-tour, 014-tour-scripted).
  tour: {
    start: string;
    pause: string;
    resume: string;
    stop: string;
    // 037 — manual ◀ ▶ stepping controls (pause the auto-play).
    prev: string;
    next: string;
    // Empty-state call to action — ▶ Tour loads a bundled canned trace so a
    // first-time visitor can preview the journey before sending (014 AC6).
    ctaEmpty: string;
    // Terse per-phase captions — used as the phase-chip hover hint (004).
    captions: Record<TimelinePhase, string>;
    // Longer, scripted balloon narration anchored to the active station (014).
    narration: Record<TimelinePhase, string>;
  };
  readout: {
    answerReceived: string;
    fastapiSse: string;
    decisionAnswer: string;
    call: (names: string) => string;
    routing: string;
    // 057-deepagents-runtime — shown on the agent tile during the DeepAgents preamble.
    planned: (n: number) => string;
    embedding: string;
    toolsReady: (n: number) => string;
    promptAssembled: string;
    streaming: (n: number) => string;
    tokens: (n: number) => string;
    tokensCost: (tok: string, usd: string) => string; // 011-token-cost
    // 099-prompt-caching — appended to the LLM readout when the turn had a cache
    // hit: how many tokens came from cache and the % of cost that saved.
    cachedSaving: (tok: string, pct: string) => string;
    score: string;
    // 054-rag-block-expansion — the Vector DB readout when the Intermediate rerank
    // sub-stage has run: the rerank pool → kept top-k.
    reranked: (from: number, to: number) => string;
    // 070-hybrid-search — the Vector DB readout when the BM25 + vector RRF fusion
    // sub-stage has run (and no rerank is downstream of it): the fused candidate count.
    hybridFused: (n: number) => string;
    // 056-ragless-pageindex — the RAGLESS box's compact readout, following the
    // reasoning pipeline: building tree → navigating → selected N sections.
    buildingTree: string;
    navigating: string;
    selected: (n: number) => string;
    dbQuerying: string;
    dbHistory: (n: number) => string;
    dbPersisted: string;
    // PDF ingestion (002-interactive-chat).
    ingestChunking: (n: number) => string;
    ingestEmbedding: (n: number) => string;
    ingestStored: (n: number) => string;
    // 034-storage-ingestion-flow — the object-storage node's compact readout.
    storing: string;
    storedObject: (name: string) => string;
    // 017-failure-injection — badge shown on the MCP/LLM readout when a run
    // carries an injected (simulated) failure.
    simulatedError: string;
    // 051-failure-treatments — the LLM readout while the timeout is being retried,
    // and once the circuit breaker opens and hands off to the fallback.
    retrying: (n: number, max: number) => string;
    circuitOpen: string;
    // 088-network-layer — the ingress appliances' compact readouts.
    netUnseen: string;
    wafClean: string;
    wafBlocked: (rule: string) => string;
  };
  node: {
    expand: string;
    collapse: string;
    openFull: string;
    openPipeline: string; // 054 — the rag node's button label (opens the RAG pipeline panel)
    openRagless: string; // 056 — the pageindex node's button (opens the RAGLESS pipeline panel)
    openIngestion: string; // 080 — the ingestion node's button (opens the ingestion pipeline panel)
    memory: string;
    latency: string;
    tip: string;
    comingSoon: string;
  };
  scenario: {
    label: string;
    sendDisabled: string;
  };
  // 059-scenario-tracks — the themes axis crossing the maturity ladder. `name`
  // labels the selector option; `blurb` is the hover tooltip. `all` is the
  // "show everything" default; the five themes group the preview clusters.
  track: {
    label: string;
    all: { name: string; blurb: string };
    rag: { name: string; blurb: string };
    agent: { name: string; blurb: string };
    aiops: { name: string; blurb: string };
    security: { name: string; blurb: string };
    scale: { name: string; blurb: string };
  };
  // 061-scenario-builder — the à-la-carte component palette (header popover) that
  // replaced the scenario ladder + track switcher.
  builder: {
    label: string;
    title: string;
    subtitle: string;
    maturity: string;
    runtimeHeading: string;
    retrievalHeading: string;
    runtimeSoon: string;
    zoneReal: string;
    zonePreview: string;
    requiresRag: string;
    // 088-network-layer — tooltip on the disabled "Network" toggle (chain absent).
    networkUnavailable: string;
    skeletonNote: string;
    done: string;
    groups: { retrieval: string; agent: string; infra: string; aiops: string };
    retrievalStrategies: Record<"vector" | "ragless", { name: string; blurb: string }>;
    components: Record<
      | "mcp"
      | "rerank"
      | "hybrid"
      | "network"
      | "summarization"
      | "gateway"
      | "guardrails"
      | "cache"
      | "eval"
      | "observability",
      { name: string; blurb: string }
    >;
    runtimes: Record<"react" | "deepagents" | "multiagent", { name: string; blurb: string }>;
    maturityNames: { simple: string; intermediate: string; advanced: string };
  };
  agentDetail: {
    title: string;
    subtitle: string;
    // 053-agent-harness — names the runtime (loop + tools + prompt + context +
    // memory) as an "Agent Harness"; tagged with the glossary term for a tooltip.
    harness: string;
    back: string;
    waiting: string;
    reactLoop: string;
    reason: string;
    act: string;
    observe: string;
    answer: string;
    iterations: string;
    lastDecision: string;
    workingMemory: string;
    workingMemoryHint: string;
    userMessage: string;
    scratchpad: string;
    noToolCalls: string;
    // 026-agent-tool-autonomy follow-up — compact summary the Tools card shows
    // as the "result" for a `search_knowledge_base` call (its observation is N
    // retrieved chunks, not a single string). Falls back to "no chunks" on an
    // empty retrieval (the same row also flips the abstain badge via `found`).
    retrievalResult: (count: number, topSource?: string, topScore?: number) => string;
    longTermMemory: string;
    longTermMemoryHint: string;
    conversationHistory: string;
    vectorMemory: string;
    noHistory: string;
    contextWindow: string;
    contextWindowHint: string;
    systemPrompt: string;
    retrievedContext: string;
    toolResults: string;
    history: string;
    tools: string;
    approxTokens: (n: number) => string;
    // 010-llm-as-brain — anatomy framing + real usage labels.
    brain: string;
    brainHint: string;
    senses: string;
    hands: string;
    speech: string;
    noAnswerYet: string;
    rounds: string;
    model: string;
    promptTokens: string;
    completionTokens: string;
    totalTokens: string;
    cost: string;
    approxProportion: string;
    // 036-context-window-budget — the /context-style budget grid + legend.
    windowOf: (model: string, size: string) => string;
    usedInOut: (input: string, answer: string, max: string, pct: string) => string;
    estimatedByCategory: string;
    catSystemPrompt: string;
    catToolDefs: string;
    catSkills: string;
    catMemory: string;
    catRetrieved: string;
    catMessages: string;
    catCompletion: string;
    freeSpace: string;
    windowHint: string;
    estimatedNote: string;
    // The window is one model call; Usage & Cost sums every round of the turn.
    perCallNote: string;
    // 039-memory-growth-visualization — the per-turn growth of long-term memory:
    // only the visible text carries forward; reasoning / tool calls don't.
    memoryGrowth: string;
    memoryGrowthHint: string;
    // 039 AC5 amendment (2026-05-28) — per-row label reads as
    // `cumulative / total` to make the staircase obvious; the per-turn weight
    // is one mouse-over away on the row.
    growthRowLabel: (cumulative: string, total: string) => string;
    growthRowHint: (perTurn: string) => string;
    currentlyInWindow: (total: string) => string;
    nextToFallOut: (limit: number, turn: number) => string;
    thisTurnNotStored: string;
    memoryLesson: string;
    // 057-deepagents-runtime — the DeepAgents preamble panels (Intermediate rung):
    // the explicit plan, the delegated researcher, and the virtual file system.
    plan: string;
    planHint: string;
    planEmpty: string;
    // 067-deepagents-step-trail — the chronological trail of every DeepAgents action.
    steps: string;
    stepsHint: string;
    wroteFile: string;
    readFile: string;
    noSubagent: string;
    readMore: string;
    readLess: string;
    todoStatus: { pending: string; in_progress: string; completed: string };
    delegated: string;
    delegateHint: string;
    subagentUsed: string;
    vfs: string;
    vfsHint: string;
    vfsEmpty: string;
    wrote: string;
    read: string;
    // 098-verify-reflection-loop — the verification (reflection) loop panel: each
    // critic pass, its verdict + reason, and the bounded revision count.
    verify: string;
    verifyHint: string;
    verifyEmpty: string;
    verifyPass: string;
    verifyRevise: string;
    verifyReason: string;
    verifyRevised: string; // note that a revision round followed this verdict
    verifyRounds: (n: number) => string; // "{n} revision round(s)"
  };
  // 068-llm-rounds-history — the LLM drill-in ("open full view" on the LLM node):
  // every model call of the turn, each with its full prompt, latency and tokens.
  llmDetail: {
    title: string;
    subtitle: string;
    back: string;
    noCalls: string;
    reasoningRound: (n: number) => string;
    generation: string;
    decisionCalledTools: string;
    decisionAnswered: string;
    latency: string;
    promptFor: string; // section heading for the round's assembled prompt
    // The model's OUTPUT for the round: the tool call(s) it emitted, or — when it
    // decided to answer — a note pointing at the generation call.
    response: string;
    decidedToAnswer: string;
  };
  // 076-station-full-views — focused drill-ins ("open full view") for the four
  // remaining real stations, mirroring agent/llm/rag. Section/row labels are
  // borrowed from `inspector.*`; only the overlay chrome lives here.
  mcpDetail: {
    title: string;
    subtitle: string;
    back: string;
    empty: string;
  };
  // 080-ingestion-pipeline-merge — the "Open ingestion pipeline" drill-in walks the
  // six write-path phases (object store → chunk → tokenize → embed → metadata → store).
  ingestionDetail: {
    title: string;
    subtitle: string;
    back: string;
    empty: string;
    objectStore: string;
    chunking: string;
    tokenization: string;
    embedding: string;
    metadata: string;
    store: string;
    // field labels
    filename: string;
    objectKey: string;
    size: string;
    contentType: string;
    strategy: string;
    chunks: string;
    chunkSize: string;
    overlap: string;
    totalChars: string;
    previews: string;
    // 083 — chunk table + full-text inspector
    chunkTableCaption: string;
    colNum: string;
    colChars: string;
    colTokens: string;
    colSnippet: string;
    selectChunkHint: string;
    fullChunkText: string;
    overlapLegend: string;
    encoding: string;
    totalTokens: string;
    perChunkTokens: string;
    model: string;
    dimension: string;
    vectors: string;
    vectorPreview: string;
    docType: string;
    keys: string;
    records: string;
    collection: string;
    stored: string;
    totalInCollection: string;
  };
  dbDetail: {
    title: string;
    subtitle: string;
    back: string;
    empty: string;
    rowId: string;
    session: string;
    // 079-db-query-detail
    queriesHeading: string;
    rowsAffected: (n: number) => string;
  };
  backendDetail: {
    title: string;
    subtitle: string;
    back: string;
    empty: string;
    received: string;
    assembled: string;
    message: string;
    delivery: string;
    session: string;
    answer: string;
    latency: string;
    // 077-backend-lifecycle-flow — the orchestration flowchart.
    intro: string;
    stepReceive: string;
    stepHistory: string;
    stepAgent: string;
    stepPersist: string;
    stepRespond: string;
    hopReceive: string;
    hopRead: string;
    hopInvoke: string;
    hopWrite: string;
    hopRespond: string;
    rowsLoaded: string;
    reasoningRounds: string;
    toolCalls: string;
    retrievals: string;
    agentHint: string;
    pending: string;
  };
  frontendDetail: {
    title: string;
    subtitle: string;
    back: string;
    empty: string;
  };
  // 089-network-station-detail — per-appliance "open full view" drill-ins for the
  // five ingress boxes (DNS / CDN / WAF / TLS-LB / API Gateway). Shared chrome keys
  // + a sub-bundle per appliance (title/subtitle/empty/summary/inDesc + field labels).
  networkDetail: {
    back: string;
    in: string;
    out: string;
    did: string;
    evidence: string;
    // 091 — the reconstructed-log block + the honest "not measured at this hop" caption.
    reconstructedLog: string;
    reconstructedLogHint: string;
    notMeasured: string;
    // 092 — the real inbound request shown as IN (instead of generic prose).
    requestLine: string;
    message: string;
    noRequest: string;
    dns: { title: string; subtitle: string; empty: string; summary: string; inDesc: string; host: string; address: string; ttl: string; notResolved: string };
    cdn: { title: string; subtitle: string; empty: string; summary: string; inDesc: string; cache: string; age: string; server: string; hits: string; reason: string };
    waf: { title: string; subtitle: string; empty: string; summary: string; inDesc: string; status: string; rules: string; anomaly: string; engine: string; threshold: string; paranoia: string; anomalyNote: string; http: string; blockedNote: string; blockedWhy: string };
    lb: { title: string; subtitle: string; empty: string; summary: string; role: string; inDesc: string; tls: string; scheme: string; upstream: string; server: string; poolSize: string; algorithm: string; backend: string };
    apigw: { title: string; subtitle: string; empty: string; summary: string; inDesc: string; route: string; rateLimit: string; upstreamLatency: string; gateway: string; policy: string };
  };
  // 054-rag-block-expansion — the RAG pipeline drill-in (Vector DB "open full view").
  ragDetail: {
    title: string;
    subtitle: string;
    back: string;
    empty: string;
    chunking: string;
    chunkingBlurb: string;
    embedding: string;
    embeddingBlurb: string;
    retrieval: string;
    retrievalBlurb: string;
    reranking: string;
    rerankingBlurb: string;
    rerankInactive: string;
    // 070-hybrid-search — the BM25 + vector RRF fusion card.
    hybrid: string;
    hybridBlurb: string;
    hybridInactive: string;
    hybridFusedLabel: string;
    laneVector: string;
    laneBm25: string;
    rrfFormula: string;
    fusionTable: string;
    colSource: string;
    hybridNote: string;
    augmented: string;
    augmentedBlurb: string;
    offline: string;
    toLlm: string;
    close: string;
    // Per-stage detail view (054 amendment 3) — clicking a card drills in.
    inputLabel: string;
    tokensLabel: string;
    vectorLabel: (shown: number, dim: number) => string;
    tokenizerNote: string;
    vectorSearch: string;
    cosineFormula: string;
    angleLabel: string;
    rerankPoolNote: (fetchK: number, k: number) => string;
    contextInjected: string;
    chunkConfig: string;
    showingOf: (shown: number, total: number) => string;
    clickHint: string;
    noRetrieval: string;
    zoomHint: string;
    resetView: string;
    chunkNote: string;
    vizNote: string;
    legend: string;
    queryLabel: string;
    keptNote: (candidates: number, kept: number) => string;
    thresholdLabel: string;
    thresholdOff: string;
    thresholdOffHint: string;
    // 069-rag-executions-history — navigate every retrieval cycle of a multi-search turn.
    executionOf: (k: number, n: number) => string;
    prevExecution: string;
    nextExecution: string;
    // 071-retrieval-metrics — the retrieval-quality scorecard on the Retrieval card.
    quality: string;
    qualityPrecision: string;
    qualityRecall: string;
    qualityMrr: string;
    qualityRelevant: string;
    qualityNotRelevant: string;
    qualityMissed: string;
    qualityNoGroundTruth: string;
    qualityTryBenchmark: string;
    // 072-chunking-strategies — the Chunking playground (chosen strategy beside fixed).
    chunkPlayLoading: string;
    chunkPlayWhy: string;
    chunkCompareWithFixed: string;
    chunkMidSentence: string;
    chunkStratFixed: string;
    chunkStratRecursive: string;
    chunkStratSemantic: string;
    chunkStratAgentic: string;
    // 073-metadata-first-class — the "why retrieved" metadata chips.
    metaWhyRetrieved: string;
  };
  // 056-ragless-pageindex — the RAGLESS drill-in panel (tree → navigate → select →
  // augmented). A pure projection like ragDetail, but for reasoning-based retrieval.
  pageindexDetail: {
    title: string;
    subtitle: string;
    empty: string;
    noRetrieval: string;
    clickHint: string;
    close: string;
    tree: string;
    treeBlurb: string;
    navigate: string;
    navigateBlurb: string;
    select: string;
    selectBlurb: string;
    augmented: string;
    augmentedBlurb: string;
    toLlm: string;
    reasoningLabel: string;
    selectedLabel: string;
    navigatedTo: string;
    queryLabel: string;
    nodesLabel: (nodes: number, leaves: number) => string;
  };
  // 019-inline-citations — provenance chips on the settled answer. Chrome only;
  // tool args / chunk snippets / proper nouns stay verbatim (not translated).
  citation: {
    sources: string;
    fromTool: (tool: string) => string;
    fromChunk: string;
    score: string;
    none: string;
    hint: string;
  };
  // 020-turn-diff — compare the context window with the previous turn.
  diff: {
    compareTitle: string;
    show: string;
    hide: string;
    previous: string;
    current: string;
    grew: string;
    shrank: string;
    same: string;
    needsPrior: string;
    totalDelta: string;
  };
  // 021-abstain-badge — an empty/not-found tool result → honest abstention.
  abstain: {
    badge: string;
    hint: string;
  };
  learn: {
    rootTitle: string;
    rootHint: string;
    whatItIs: string;
    whyUsed: string;
    inProject: string;
    howItWorks: string;
    otherOptions: string;
    studyLinks: string;
    onCloud: (label: string) => string;
    cloudGuideHint: (label: string) => string;
    moreIn: (title: string) => string;
    topicsCount: (n: number) => string;
    learnStackTitle: string;
    learnStackBody: string;
  };
  // 042-agent-anatomy — the "Configure agent" dialog opened from the Agent
  // station. Seven sections compose the agent's identity (name, system prompt,
  // agent prompt, model, tools, knowledge, skills). Strings here are pure UI
  // chrome — the prompt defaults themselves (server-shipped content) stay
  // English-only by design.
  agentAnatomy: {
    openButton: string;
    // Short label for the header button (the long "Configure agent" stays in
    // tooltip/aria-label; this is what fits next to the icon at wide widths).
    headerLabel: string;
    editIdentity: string;
    dialogTitle: string;
    close: string;
    reset: string;
    defaultAgentName: string;
    // 043-persisted-agent — Settings page's pointer to this dialog.
    settingsRedirect: string;
    openFromSettings: string;
    // 044-shared-agent-catalog — the catalog sidebar inside the dialog.
    catalog: {
      label: string;
      loading: string;
      empty: string;
      more: string;
      draftHint: string;
      defaultSuffix: string;
      newLabel: string;
      newTooltip: string;
      deleteLabel: string;
      deleteTooltip: string;
      confirm: string;
      confirmYes: string;
      confirmCancel: string;
      // 064-agent-catalog-focus — shown when the conversation is locked: the
      // catalog stays editable, only the conversation's running agent is fixed.
      lockedEditHint: string;
    };
    identity: {
      title: string;
      nameLabel: string;
      namePlaceholder: string;
      descLabel: string;
      descPlaceholder: string;
      hint: string;
    };
    system: {
      title: string;
      help: string;
    };
    agent: {
      title: string;
      help: string;
    };
    // 065-provider-and-model-refresh — the LLM provider picker (OpenAI active,
    // Ollama a disabled preview).
    provider: {
      title: string;
      help: string;
      comingSoon: string;
      activeNote: string;
      previewNote: string;
      // 074-ollama-provider
      ollamaNote: string;
      serverUrlLabel: string;
      serverUrlPlaceholder: string;
      serverUrlHelp: string;
      refresh: string;
      unreachable: string;
      noModels: string;
      loadingModels: string;
      modelLabel: string;
      // 078-openai-key-ui
      keyLabel: string;
      keyPlaceholder: string;
      keySavedHint: string;
      keySave: string;
      keyTesting: string;
      keyConnected: string;
      keyFailed: string;
      keyEnvNote: string;
      // 089-vertex-ai-provider
      vertexaiNote: string;
      projectLabel: string;
      projectPlaceholder: string;
      locationLabel: string;
      locationPlaceholder: string;
      credentialsLabel: string;
      credentialsPlaceholder: string;
      credentialsSavedHint: string;
      credentialsTooltip: string;
      vertexaiSave: string;
      vertexaiTesting: string;
      vertexaiConnected: string;
      vertexaiFailed: string;
    };
    model: {
      title: string;
      help: string;
      resolved: string;
      useDefault: string;
    };
    tools: {
      title: string;
      help: string;
      countAll: string;
      countSome: (enabled: number, total: number) => string;
    };
    knowledge: {
      title: string;
      help: string;
      corpus: string;
      corpusLockHint: string;
      uploads: string;
      uploadsEmpty: string;
      add: string;
      remove: string;
      loading: string;
    };
    skills: {
      title: string;
      sharedNote: string;
    };
  };
}

const en: Strings = {
  lens: {
    label: "Lens",
    mode: { all: "All", harness: "Harness", loop: "Loop" },
    legend: {
      harness: "The wiring (space): every part around the model, colored by role. The Agent's own runtime is the “Agent Harness” at the core — here you see the whole harness it lives in.",
      loop: "The cycle (time): reason → act → observe, iterating until a stop condition. It runs on the Agent Harness at the center.",
      learnMore: "Learn Harness & Loop Engineering →",
    },
    role: {
      tools: "Tools",
      knowledge: "Knowledge",
      memory: "Memory",
      context: "Context",
      permissions: "Permissions",
      model: "Model",
      orchestration: "Orchestration",
      delivery: "Delivery",
      observability: "Observability",
    },
    roleHint: {
      tools: "Callable functions (via MCP) the agent invokes to act on the world.",
      knowledge: "The corpus the agent can retrieve from (RAG / ingestion).",
      memory: "Durable state that survives across turns (the relational DB, caches).",
      context: "What gets assembled into the model's window — context engineering.",
      permissions: "What is allowed in or blocked (edge security, guardrails).",
      model: "The reasoning engine itself (the LLM).",
      orchestration: "Routing, delegation and the control plane that runs the loop.",
      delivery: "Getting bytes to and from the user (front door, ingress routing).",
      observability: "Evals and telemetry that watch the harness.",
    },
    roleLegendTitle: "Parts of the harness",
    core: "Core",
    coreHint:
      "The agent's own runtime — the “Agent Harness” (see the subtitle). It's the engine at the center of the wider harness, and it's what runs the Loop.",
    contextChip: "Context window",
    contextHint:
      "What the agent assembles into the model's context window each turn — this is context engineering, nested inside the Agent Harness.",
    loop: {
      iteration: (n, max) => `${n} turns · cap ${max}`,
      stopFinal: "✓ Answered — stopped on its own",
      stopMax: "⚠ Hit the iteration cap",
      recovery: "Failure injected — recovery path",
      inProgress: "Loop in progress…",
    },
  },
  app: {
    tagline:
      "A chat message's journey through RAG, MCP tools and an LLM — visualized live.",
    learn: "Learn",
    simulator: "Simulator",
    config: "Config",
    liveTitle: "Live OpenAI calls",
    language: "Language",
    cloud: "Cloud provider",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    offline:
      "Backend offline — start it with `docker compose up backend` (it needs OPENAI_API_KEY in backend/.env).",
    noKey:
      "No OPENAI_API_KEY set — the backend is up but can't run a turn. Add it to backend/.env and restart.",
  },
  arena: {
    nav: "Arena",
    title: "Arena",
    tagline: "Model your architecture under load",
    honesty:
      "Estimated model — not a live load test. The numbers are analytical, derived from stated per-component benchmarks; no real traffic is sent.",
    paletteTitle: "Components",
    paletteHint: "Drag onto the canvas to add",
    examples: "Examples",
    emptyCanvas: "Drag a component here to start building",
    usersLabel: "Concurrent users",
    thinkTime: "Think time",
    thinkTimeHint:
      "Seconds between requests per user — req/s = users ÷ think time (Little's Law). The single most decisive knob: chat users typically pause 30–120s between messages, and halving it doubles the load.",
    usersReadout: (users, rps) => `${users} users ≈ ${rps} req/s`,
    effectiveRate: (rps) => `→ ${rps} req/s effective`,
    closedLoopHint:
      "A user waiting on a slow answer isn't sending the next message: the load self-throttles to users ÷ (think time + response time). The gap between demanded and effective IS the latency cost.",
    callsPerRequest: "Calls per request",
    callsHint:
      "An agent turn makes 2–5 model calls (ReAct loop). Set it on the AI Gateway OR the LLM behind it — not both.",
    shedding: (n) => `dropping ~${n} req/s (429)`,
    saturatedHeader: (n) => `Saturated — shedding ~${n} req/s (429)`,
    saturatedHint:
      "Past capacity a real API sheds with 429s; a latency figure would be fiction. Scale the bottleneck to get a latency again.",
    e2eLatency: "End-to-end latency",
    e2eLatencyHint:
      "Modeled latency of one agent turn: serialized stages sum, and k calls per request cost k × the model's latency. Worst-case path (cache misses included).",
    llmCost: "LLM cost",
    llmCostHint:
      "Teaching estimates: ~$100/h per medium deployment (provisioned, billed even idle — think PTUs) plus ~$0.0016 per agent-shaped call (~2k in / 500 out at gpt-4.1-mini prices). Break-even ≈ 35% utilization.",
    llmCostProvisioned: (v) => `~$${v}/h provisioned`,
    llmCostUsage: (v) => `~$${v}/h usage`,
    reset: "Reset canvas",
    scaling: "Scaling",
    metric: {
      qps: "QPS",
      latency: "Latency",
      util: "Utilization",
      capacity: "Capacity",
      inflight: "In flight",
    },
    inflightInfo:
      "Requests this component is holding open right now (Little's Law: throughput × time waiting, including everything downstream it waits on). A synchronous agent backend holds its connection/SSE stream for the WHOLE turn — connection pools and memory run out long before CPU does.",
    status: {
      healthy: "Healthy",
      warning: "Warning",
      critical: "Critical",
      unreachable: "Unreachable",
    },
    size: "Instance size",
    infoLabel: "About this component",
    capacityHint: "capacity = component base × instance size × units",
    routingTax: (pct, n) =>
      `Client-side LLM routing: −${pct} capacity (managing ${n} deployments — an AI Gateway removes this)`,
    quotaLimited: (region) => `Quota-limited — ${region} is at its regional LLM quota`,
    quotaHint:
      "A region caps how much model capacity you can provision (subscription quota / PTU availability). Past the cap, more deployments in the same region add nothing — add another region or a higher quota tier.",
    region: "Region",
    regionHint:
      "Pools in different regions survive a region outage, cut latency near users and meet data residency. An annotation for now — challenges will score it.",
    regionNone: "No region",
    autoWireHint: "Tip: with a node selected, a dropped component is wired from it automatically",
    edgeHint: "Click a link and press Backspace to remove it",
    fanoutNudge: "An agent turn makes 2–5 model calls — set calls per request = 2?",
    fanoutApply: "Set to 2",
    fanoutDismiss: "Keep 1",
    replicasCeilingHint:
      "At the per-pool max — real fleets escape by adding another pool/region or a higher quota tier.",
    sizes: { small: "Small", medium: "Medium", large: "Large", xlarge: "XLarge" },
    cacheHitRatio: "Cache hit ratio",
    bottleneck: "Bottleneck",
    selectHint: "Select a component to scale it",
    remove: "Remove",
  },
  demo: {
    bannerLead: "Demo mode — sample questions only, replaying real captured runs.",
    bannerCta: "Run the full live version with your own OpenAI key",
    composerHint: "Pick a sample question below",
    sampleBarLabel: "Sample questions",
  },
  mobile: {
    tab: { canvas: "Diagram", chat: "Chat", inspector: "Inspector" },
  },
  chat: {
    title: "Ask the agent",
    subtitle: "Send a message and watch it travel through the pipeline on the right.",
    placeholder: "e.g. What is RAG?",
    running: "Running…",
    send: "Send message",
    answer: "Answer",
    thinking: "Thinking…",
    wafBlocked:
      "Blocked by the WAF (403) — the payload matched an OWASP Core Rule Set signature (a likely web attack), so ModSecurity rejected it at the edge. It never reached the agent. Open the WAF box to see why.",
    stage: {
      request: "Sending…",
      memory: "Recalling memory…",
      route: "Routing…",
      retrieve: "Retrieving…",
      reason: "Reasoning…",
      tools: "Calling tools…",
      generate: "Generating…",
      respond: "Responding…",
      persist: "Saving…",
    },
    answerHint: "The agent's answer will stream here.",
    examples: [
      "What is RAG and how does retrieval work?",
      "What is 12 * (3 + 1)?",
      "How do MCP tools work?",
      "What time is it right now?",
    ],
    conversations: "Conversations",
    newChat: "New chat",
    empty: "No conversations yet",
    untitled: "New conversation",
    back: "Conversations",
    you: "You",
    agent: "Agent",
    sources: "Sources used",
    fromDoc: "your PDF",
    searchGroup: (n, query) => `Search ${n}: “${query}”`,
    emptyThread: "Send a message to start this conversation.",
    messages: (n) => `${n} message${n === 1 ? "" : "s"}`,
    uploadPdf: "Upload PDF",
    documents: "Documents",
    removeDoc: "Remove",
    chunksStored: (n) => `${n} chunk${n === 1 ? "" : "s"}`,
    uploading: "Ingesting…",
    uploadFailed: "Upload failed",
    now: "now",
    attachDoc: "Attach a PDF",
    enterToSend: "Enter to send",
    cancel: "Cancel",
    cancelled: "Run cancelled",
    skillsApplied: (n) => `${n} ${n === 1 ? "skill" : "skills"} applied in this response`,
    skillsBadge: "Skills applied",
    pendingAttachmentsHint: "Pending attachments — will travel with your next message.",
    attachedToThisMessage: "Attached to this message",
    agentSelector: {
      label: "Agent",
      menuHeading: "Choose an agent",
      ariaLabel: (name) => `Active agent: ${name}. Click to change.`,
      locked:
        "Agent locked after the conversation's first message. Start a new chat to use a different agent.",
      lockedAriaLabel: (name) => `Active agent: ${name}. Locked after the first message.`,
      lockedInlineNote:
        "The agent is locked because this conversation already has messages.",
    },
  },
  trace: {
    clickToLoad: "Click a message to load its trace",
    loaded: "Showing this turn's trace",
    expired: "Trace expired — no longer available",
  },
  hud: {
    turns: "turns",
    tokens: "tokens",
    cost: "cost",
    toolCalls: "tool calls",
    ragHits: "RAG hits",
    partial: "partial · some traces expired",
    estimate: "≈ estimate · not billed",
    tokenizer: "tiktoken · o200k_base",
    tokensIn: "in",
    tokensOut: "out",
  },
  inspector: {
    overviewTitle: "Inspector",
    overviewBody:
      "The pipeline is split into deployable tiers (containers) that talk over the network. Send a message, then click any station to inspect the real data — protocols and routes, retrieved chunks and scores, tool calls, the assembled prompt, and latency.",
    overviewBack: "← Overview",
    whyTitle: "Why this layer · What breaks without it",
    whyLabel: "Why this exists",
    whatBreaksLabel: "What breaks without it",
    techInfra: "Technical & infrastructure",
    tier: "tier",
    role: "role (cloud-agnostic)",
    hosting: "hosting (e.g.)",
    cloudExample: (cloud) => `example · ${cloud}`,
    networkHops: "network hops",
    networkZone: "network zone",
    controls: "controls",
    zonePublic: "public internet",
    zonePrivate: "private network",
    events: (n) => `${n} event${n === 1 ? "" : "s"}`,
    historyRead: "Recent history (read)",
    recentMessages: "recent messages",
    totalRows: "rows stored",
    noHistory: "no prior conversations yet",
    persisted: "Conversation persisted (write)",
    operation: "operation",
    requestSent: "Request sent",
    answerReceived: "Answer received",
    routes: "Routes",
    query: "Query",
    agentLoop: "Agent loop",
    reasoningTurns: "reasoning turns",
    lastDecision: "last decision",
    queryEmbedding: "Query embedding",
    model: "model",
    dimensions: "dimensions",
    retrievedChunks: (n) => `Retrieved chunks (top-${n})`,
    hybridFusion: (n) => `Hybrid fusion · BM25 + vector (${n} fused)`,
    hybridColVector: "vector",
    rerankMovement: (n) => `Rerank movement (${n} candidates)`,
    rerankModel: "reranker model",
    rerankScore: "rerank score (cross-encoder)",
    rerankCosine: "original cosine similarity (vector search)",
    rerankKept: "kept",
    rerankBelowThreshold: "below threshold",
    rerankCutoffScore: (t) => `min score ${t.toFixed(2)} — below excluded from the prompt`,
    rerankCutoffTopK: (k) => `top-${k} cutoff — below excluded from the prompt`,
    ingestion: "PDF ingestion",
    chunkStrategy: "chunking strategy",
    chunkSize: "size / overlap",
    tokensPerChunk: "tokens per chunk",
    chunkPreviews: "chunk previews",
    vectorsStored: "vectors stored",
    totalInCollection: "total in collection",
    vectorPreview: "vector preview",
    fromDocument: "from your PDF",
    onThisRun: "On this run",
    hopWhy: "Why this hop",
    hopExpandHint: "Network details",
    hopExpandLabel: "details",
    noHopData: "Nothing crossed this hop on this run.",
    hopRequest: "Request",
    hopAnswer: "Answer",
    hopForwarded: "Forwarded headers",
    hopQueries: "SQL statements",
    hopChunks: "Retrieved chunks",
    hopScore: "top score",
    hopToolCalls: "Tool calls",
    hopPrompt: "Assembled prompt",
    edgePreview: "preview",
    edgeChain: "edge chain",
    edgeClient: "client IP",
    edgeRequestId: "request id",
    edgeScheme: "scheme",
    edgeDirectNote: "no proxy in front (direct access)",
    treeNodes: "tree nodes",
    selectedSections: "selected sections",
    navReasoning: "Navigation reasoning",
    documentTree: "Document tree",
    indexerTitle: "Offline indexer",
    chunking: "chunking",
    chunkingValue: "900-char windows · 150 overlap · paragraph-packing",
    trigger: "trigger / timing",
    triggerValue: "startup build-if-missing · on PDF upload · rebuild on dimension drift",
    indexRefresh: "index refresh",
    indexRefreshValue:
      "A stale or badly-chunked index quietly degrades answer quality — re-embed when the model or corpus changes.",
    indexerIdle: "Idle — builds on startup, on PDF upload, or on embedding-dimension drift.",
    storedObject: "Stored object",
    objectKey: "key",
    size: "size",
    contentType: "content type",
    whyStorage: "Why object storage",
    whyStorageValue:
      "Persisting the original decouples upload from indexing: the file is safely stored before (and independently of) being chunked, can be re-indexed if the model changes, and never touches the public internet.",
    discoveredTools: "Discovered tools",
    transport: "transport",
    toolCall: "Tool call",
    tool: "tool",
    args: "args",
    result: "result",
    localToolCalls: "Local tool calls (DeepAgents)",
    localToolCallsHint:
      "In-process agent tools (todo list, scratchpad, sub-agents) — not over the MCP transport, so no JSON-RPC frame. Animated in detail at the Agent node.",
    simulatedError: "⚠️ Simulated failure (injected)",
    attempt: "Attempt",
    backoff: "Backoff",
    circuit: "Circuit breaker",
    treatment: "Treatment",
    treatmentFallback: "Fallback — graceful degradation",
    treatmentGraceful: "Graceful degradation (abstained)",
    jsonrpc: "JSON-RPC frames",
    request: "Request",
    response: "Response",
    requestBody: "Request body",
    forwardedEvidence: "Forwarded evidence",
    reconstructed: "reconstructed (local fallback)",
    rank: "rank",
    distance: "distance",
    similarity: "similarity",
    assembledPrompt: "Assembled prompt",
    system: "system",
    retrievedContext: "retrieved context",
    tools: "tools",
    userMessage: "user message",
    history: "conversation history",
    generatedAnswer: "Generated answer",
    ttft: "time to first token",
    throughput: "throughput",
    usageCost: "Usage & cost",
    rounds: "LLM rounds",
    promptTokens: "prompt tokens",
    completionTokens: "completion tokens",
    totalTokens: "total tokens",
    cost: "cost",
    cachedTokens: "cached tokens",
    saved: "saved vs. all-fresh",
    cacheColdHint: "Below cache threshold (first / small call) — the prefix caches once it passes ~1024 tokens.",
    status: { active: "active", done: "done", idle: "idle" },
  },
  comms: {
    sync: "sync",
    async: "async",
    syncDetail:
      "Synchronous request/response — the caller blocks until the result comes back.",
    asyncDetail:
      "Asynchronous streaming — the response flows back incrementally over a kept-open connection.",
    deliveryStreamDetail:
      "Streaming (SSE): trace events and the answer flow back live, token by token, over one kept-open connection.",
    deliveryBatchDetail:
      "Batch (JSON): one response after the backend finishes the whole run; the client then replays the trace.",
    llmStreamDetail: "stream=true — tokens are streamed back as the model generates them.",
    llmBatchDetail: "Non-streaming — the full answer returns in a single response.",
  },
  settings: {
    open: "Architecture options",
    label: "Config",
    title: "Architecture options",
    pageTitle: "Settings",
    pageTagline: "Pipeline options, experiment knobs, and data controls.",
    backToSim: "Back to Simulator",
    delivery: "Response delivery",
    deliveryHint: "How the backend returns the result to the browser.",
    streaming: "Streaming (SSE)",
    streamingHint: "Watch each stage light up live; the answer types itself out.",
    batch: "Batch (JSON)",
    batchHint: "Wait for one JSON response, then replay the trace; the answer appears at once.",
    kb: {
      title: "Knowledge base",
      hint: "Pick how the corpus is chunked, then re-ingest to rebuild the index — the canvas animates chunk → embed → store.",
      strategy: "Chunking strategy",
      reingest: "Re-ingest corpus",
      reingesting: "Re-ingesting…",
      done: (n) => `Re-indexed ${n} chunks`,
      active: "active",
      applyHint:
        "Selected, not applied yet. Re-ingest the corpus to rebuild it with this strategy — only then do newly uploaded files use it too.",
      explain: {
        title: "How it works",
        fixed:
          "Cuts the text into fixed-length character windows (with overlap), ignoring sentence and paragraph boundaries — fast, but it happily splits a sentence in half.",
        recursive:
          "Packs whole paragraphs into overlapping windows, never starting a chunk mid-word — keeps each thought intact. The default.",
        semantic:
          "Embeds each sentence and opens a new chunk where adjacent-sentence similarity drops (a topic shift) — boundaries follow meaning, not length. Uses OpenAI embeddings.",
        agentic:
          "Asks the LLM to read the document and segment it into coherent topical units — the model decides the boundaries. Uses OpenAI; falls back to Recursive on a bad response.",
        example: "Live example — real chunks on a sample",
        loading: "Chunking the sample…",
      },
      params: {
        title: "Parameters",
        chunkSize: "Chunk size (chars)",
        chunkOverlap: "Overlap (chars)",
        threshold: "Similarity threshold",
        maxSegments: "Max segments",
        sizeHint: "Larger chunks keep more context; smaller chunks retrieve more precisely.",
        overlapHint: "Overlap carries ideas across chunk boundaries.",
        thresholdHint: "Higher = split on smaller topic shifts (more, smaller chunks).",
        maxSegmentsHint: "Caps how many topical segments the model may return.",
      },
    },
    embeddings: {
      title: "Embeddings (RAG)",
      hint: "Which model turns text into vectors for retrieval. Instance-wide — one index, one model.",
      provider: "Provider",
      openai: "OpenAI — cloud, needs an OpenAI key.",
      ollama: "Ollama (local) — deploy your own embedding model (e.g. nomic-embed-text).",
      vertexai: "Vertex AI — Google Cloud native embeddings (e.g. gemini-embedding-2).",
      vertexaiHint: "Google Service Account credentials are not configured. Go to the Agent Anatomy dialog on any Agent node to save them first.",
      model: "Embedding model",
      modelPlaceholder: "nomic-embed-text",
      rebuildNote: "Changing the embedding model rebuilds the whole index (next startup or re-ingest).",
      unreachable: "Couldn't reach the Ollama server. Is it running?",
      saved: "Saved.",
    },
    experiment: {
      title: "Experiment",
      systemPrompt: "System prompt",
      promptHint:
        "Edits the guardrails layer (platform-wide rules). The agent's role / instructions live in the Agent node's Configure agent dialog.",
      reset: "Reset to default",
      tools: "Tools (MCP)",
      toolsHint: "Turn tools off and watch the agent re-plan without them.",
      toolsDisambig:
        "Knowledge base search is full vector retrieval over the corpus and your PDFs; Glossary lookup is a tiny canned term list. Any tool can be turned off — disabling Knowledge base search makes the run ungrounded (LLM-only).",
      topK: "Retrieved chunks (top-k)",
      topKHint: "How many chunks RAG pulls per query.",
      rerankThreshold: "Rerank score threshold",
      rerankThresholdHint:
        "Intermediate only: drop chunks the reranker scored below this — fewer but cleaner grounding (0 = off).",
      verify: "Verification loop",
      verifyHint:
        "After drafting, a critic pass checks the answer and can send it back for a bounded revision before it is committed (loop engineering).",
      ragless: {
        label: "RAGLESS (PageIndex)",
        hint: "Run reasoning-based retrieval alongside Vector RAG to compare. The LLM navigates a document tree instead of vector search — PageIndex grounds the answer.",
        on: "On",
        off: "Off",
        simpleOnly: "Intermediate rung only — switch the scenario to Intermediate to enable.",
      },
      toolLabels: {
        search_knowledge_base: "Knowledge base search",
        calculator: "Calculator",
        current_time: "Current time",
        kb_lookup: "Glossary lookup",
        load_skill: "Load skill",
        web_search: "Web search",
      },
      failure: {
        label: "Simulate failure",
        hint: "Force a failure on the next run and watch the agent degrade.",
        modes: {
          none: "Off",
          tool_error: "Tool error",
          llm_timeout: "LLM timeout",
        },
      },
    },
    data: {
      title: "Data",
      clear: "Clear databases",
      clearHint:
        "Wipe all saved conversations and imported document chunks. The built-in knowledge base is kept.",
      confirm: "Clear all data?",
      confirmHint: "Deletes every conversation and every uploaded chunk. This can't be undone.",
      confirmYes: "Yes, clear",
      cancel: "Cancel",
      clearing: "Clearing…",
      cleared: "Cleared {sessions} conversations · {chunks} chunks",
    },
    skills: {
      title: "Skills",
      hint: "Named instruction bundles the agent loads on demand via the load_skill tool.",
      new: "New skill",
      name: "Name",
      namePlaceholder: "e.g. summarize-in-bullets",
      description: "Description",
      descPlaceholder: "When should the agent use this skill?",
      body: "Body",
      bodyPlaceholder: "The full instructions loaded when the skill is used…",
      save: "Save",
      delete: "Delete",
      cancel: "Cancel",
      empty: "No skills yet.",
      nameTaken: "A skill with this name already exists.",
      saveFailed: "Could not save the skill.",
    },
  },
  glossary: {
    "TLS 1.3": "TLS 1.3 — the encryption that secures HTTPS between the browser and the server.",
    ASGI: "ASGI — the asynchronous Python web-server interface FastAPI runs on.",
    ReAct: "ReAct — the reason → act → observe loop the agent repeats until it can answer.",
    "Agent Harness":
      "Agent Harness — the runtime scaffolding around an LLM that makes it an agent: the reasoning loop, tool calling, layered prompt assembly, the context window and memory.",
    DeepAgents:
      "DeepAgents — a LangGraph agent pattern adding planning, sub-agents, and a virtual file system for longer-horizon tasks. Live on the Intermediate rung.",
    "Multi-agent":
      "Multi-agent — several specialized agents that coordinate (e.g. an orchestrator delegating to sub-agents) instead of one monolithic loop. (Planned — not yet implemented.)",
    SQL: "SQL — the query language of the relational database that stores the conversation.",
    RAG: "RAG (Retrieval-Augmented Generation) — embed the query, pull the closest chunks from the vector DB, and ground the answer in them.",
    "VECTOR DB": "Vector database — stores chunk embeddings and runs the nearest-neighbour (cosine) search the RAG pipeline relies on.",
    RAGLESS:
      "RAGLESS — reasoning-based retrieval (PageIndex): the LLM navigates a document tree to pick the relevant section instead of vector similarity. No embeddings, no vector DB.",
    cosine: "Cosine similarity — how the vector store ranks chunks by closeness of meaning.",
    MCP: "MCP (Model Context Protocol) — the open standard the agent uses to discover and call tools.",
    stream: "Streaming — tokens are sent to the browser as they're generated, over SSE.",
    retry: "Retry — re-attempt a failed call a bounded number of times before giving up.",
    backoff:
      "Backoff — wait longer between each retry (here, exponential) to relieve a struggling dependency.",
    "circuit breaker":
      "Circuit breaker — after repeated failures, stop calling and fail fast instead of hanging.",
    "graceful degradation":
      "Graceful degradation — return a reduced, honest result (abstain / fallback) instead of crashing.",
    ALB: "ALB (Application Load Balancer) — AWS's load balancer that terminates TLS and spreads requests across backend containers.",
    BLOB: "Blob storage — an object store for raw files (PDFs, images) the app keeps outside the databases.",
    INDEX: "Vector index (HNSW) — the graph structure that makes nearest-neighbour search over embeddings fast.",
    HNSW: "HNSW — the graph-based approximate-nearest-neighbour index the vector store uses to find similar chunks fast.",
    RERANK: "Reranker — a second-pass model that reorders retrieved chunks by true relevance before they reach the LLM.",
    Chunking: "Chunking — splitting documents into retrievable pieces before embedding; the strategy (fixed/recursive/semantic/agentic) sets the boundaries.",
    Metadata: "Metadata — structured facts attached to each chunk (source, section, type, position) used to debug retrieval and, with self-querying, to filter it.",
    "Precision@k": "Precision@k — of the top-k retrieved chunks, the fraction that are relevant.",
    "Recall@k": "Recall@k — of all relevant chunks, the fraction that made the top-k.",
    MRR: "MRR (Mean Reciprocal Rank) — 1/(rank of the first relevant chunk); higher is better.",
    GATEWAY: "LLM gateway — a proxy in front of model providers for routing, retries, rate limits and cost control.",
    SAFETY: "Guardrails — input/output checks that block unsafe or off-policy prompts and responses.",
    CACHE: "Semantic cache — reuses a past answer when a new question is close enough in meaning, skipping the LLM.",
    EVALS: "Eval runner — automated scoring of answers against test cases to catch quality regressions.",
    OTEL: "OpenTelemetry — the open standard for traces, metrics and logs that makes the pipeline observable.",
    HYBRID:
      "Hybrid search — combines keyword (BM25) and vector retrieval and fuses the results (RRF) to catch exact-term matches embeddings miss.",
    BM25:
      "BM25 — a classic keyword (sparse) ranking function (TF-IDF family) that scores documents by exact term overlap; great at rare literal tokens an embedding blurs over.",
    RRF: "Reciprocal Rank Fusion — merges two ranked lists by summing 1/(k + rank) per item, so a chunk ranked high in either list rises without reconciling their score scales.",
    MEMORY:
      "Summarization — compacts a long conversation by summarizing old turns, so the agent keeps context within the token budget. (Planned — not yet implemented.)",
    research:
      "Researcher — a sub-agent that gathers and synthesises information for the orchestrator. (Planned — not yet implemented.)",
    execute:
      "Coder — a sub-agent that writes and runs code to carry out a task. (Planned — not yet implemented.)",
    review:
      "Critic — a sub-agent that reviews another agent's output and flags problems. (Planned — not yet implemented.)",
    tiktoken: "tiktoken · o200k_base — OpenAI's tokenizer/encoding; token counts are model-specific, not chars ÷ 4.",
    load_skill: "load_skill — an MCP tool the agent calls to pull in a named instruction bundle (a skill) on demand.",
    "RAG hits": "RAG hits — the number of corpus chunks retrieved and fed to the LLM this turn (0 = ungrounded).",
    decision: "decision: answer — the agent chose to reply directly; the alternative is call: a tool to gather more first.",
    "top-k": "top-k · score — the k most similar chunks retrieved; score (0–1) is how close the best match is.",
    iterations: "×N — this phase ran N times because the ReAct loop repeated (reason → act → observe).",
    // 088-network-layer — the real ingress appliance images (station tags).
    CoreDNS: "CoreDNS — the DNS server that resolves the chain's internal service names to addresses (with a TTL).",
    Varnish: "Varnish — an HTTP edge cache; serves cached responses (HIT) or forwards misses (MISS) to the origin.",
    ModSecurity: "ModSecurity — the WAF rule engine (with the OWASP Core Rule Set) that inspects requests and blocks known attacks with a 403.",
    HAProxy: "HAProxy — terminates TLS and load-balances requests onto a backend upstream, adding X-Forwarded-* headers.",
    Kong: "Kong — an API gateway: routing, rate-limiting and API-key auth at the edge (run here DB-less).",
  },
  timeline: {
    title: "Replay & step",
    hint: "Click a phase or step ◀ ▶ through every stage of the request.",
    stepBack: "Step back",
    pause: "Pause",
    replay: "Replay",
    stepForward: "Step forward",
    idle: "idle",
    phases: {
      request: "Request",
      memory: "Memory",
      route: "Route",
      retrieve: "Retrieve",
      reason: "Reason",
      tools: "Tools",
      generate: "Generate",
      respond: "Respond",
      persist: "Persist",
    },
    execTrace: {
      title: "Execution traces",
      subtitle: "Hierarchical span tree of the run — duration, tokens and cost per node.",
      empty: "Run a turn to see the execution trace.",
      nodes: {
        route: "route",
        think: "think",
        tools: "tools",
        generate: "generate",
        respond: "respond",
        retrieve: "retrieve",
        memory: "memory",
        persist: "persist",
        // 062 — DeepAgents steps (kept English in both langs, like the others).
        plan: "plan",
        delegate: "delegate",
        "fs-write": "file write",
        "fs-read": "file read",
      },
      child: { embed: "embed", search: "search", select: "select" },
      planTodos: "todos",
    },
  },
  console: {
    title: "Event log",
    expand: "Show log",
    collapse: "Hide log",
    explain: "Explain this event",
    copyEvent: "Copy JSON",
    copyTrace: "Copy full trace",
    copyId: "Copy request id",
    copied: "Copied",
    size: "payload",
    latency: "latency",
    from: "from",
    to: "to",
  },
  tour: {
    start: "▶ Tour",
    pause: "Pause tour",
    resume: "Resume tour",
    stop: "Stop tour",
    prev: "Previous phase",
    next: "Next phase",
    ctaEmpty: "▶ Preview the journey",
    captions: {
      request: "The browser sends your message to the API over HTTPS.",
      memory: "The backend loads recent conversation history — long-term memory.",
      route: "Route: the agent receives the query and plans its path — no LLM call yet.",
      retrieve: "RAG embeds the query and pulls the most relevant chunks.",
      reason:
        "Reason ≠ Generate: Reason decides what to do (which tool, if any) — the ReAct decision step. Generate writes the answer. Both call the LLM.",
      tools: "A tool runs over MCP and returns an observation.",
      generate:
        "Generate ≠ Reason: Generate writes the final answer, token by token. Reason only decides what to do. Both call the LLM.",
      respond: "The finished answer is streamed back to the client.",
      persist: "The conversation is saved to the database for next time.",
    },
    narration: {
      request:
        "👉 Your message leaves the browser and travels to the API over HTTPS — the request begins here.",
      memory:
        "👉 The backend reads recent turns from the database — the agent's long-term memory.",
      route: "👉 The agent reads the request and plans its route before doing any work.",
      retrieve:
        "👉 RAG turns your question into a vector and pulls the most relevant chunks from the index.",
      reason:
        "👉 The model reasons over the assembled context and decides whether it needs a tool.",
      tools: "👉 A tool runs over MCP and hands an observation back to the agent to reason on.",
      generate: "👉 With everything in hand, the model writes the answer one token at a time.",
      respond: "👉 The finished answer streams back across the network to your browser.",
      persist: "👉 The turn is written to the database so the next message remembers this one.",
    },
  },
  readout: {
    answerReceived: "answer received ✓",
    fastapiSse: "FastAPI · SSE stream",
    decisionAnswer: "decision: answer",
    call: (names) => `call → ${names}`,
    routing: "routing…",
    planned: (n) => `planned ${n} step${n === 1 ? "" : "s"}`,
    embedding: "embedding query…",
    toolsReady: (n) => `${n} tools ready`,
    promptAssembled: "prompt assembled",
    streaming: (n) => `streaming · ${n} tok`,
    tokens: (n) => `${n} tokens`,
    tokensCost: (tok, usd) => `${tok} tok · ${usd}`,
    cachedSaving: (tok, pct) => `${tok} cached · −${pct}`,
    score: "score",
    reranked: (from, to) => `reranked ${from}→${to}`,
    hybridFused: (n) => `BM25+vector · fused ${n}`,
    buildingTree: "building tree…",
    navigating: "navigating…",
    selected: (n) => `selected ${n} section${n === 1 ? "" : "s"}`,
    dbQuerying: "querying…",
    dbHistory: (n) => `history: ${n} rows`,
    dbPersisted: "persisted ✓",
    ingestChunking: (n) => `chunking · ${n}`,
    ingestEmbedding: (n) => `embedding ${n} vec`,
    ingestStored: (n) => `stored ${n} ✓`,
    storing: "storing…",
    storedObject: (name) => `stored ${name} ✓`,
    simulatedError: "⚠️ simulated failure",
    retrying: (n, max) => `⚠️ retry ${n}/${max}`,
    circuitOpen: "⚠️ circuit open → fallback",
    netUnseen: "not detected",
    wafClean: "clean ✓",
    wafBlocked: (rule) => `⛔ blocked · ${rule}`,
  },
  node: {
    expand: "Expand",
    collapse: "Collapse",
    openFull: "Open full view",
    openPipeline: "Open RAG pipeline",
    openRagless: "Open RAGLESS pipeline",
    openIngestion: "Open ingestion pipeline",
    memory: "memory",
    latency: "latency",
    tip: "Click a station to inspect · ⊕ to expand",
    comingSoon: "Coming soon",
  },
  scenario: {
    label: "Scenario",
    sendDisabled: "This scenario is a preview — switch to Simple to send a message.",
  },
  track: {
    label: "Track",
    all: { name: "All", blurb: "Show every node this rung declares." },
    rag: {
      name: "RAG Quality",
      blurb: "Retrieval data-plane: chunking, metadata, rerank, hybrid, MMR, self-query…",
    },
    agent: {
      name: "Agent Design",
      blurb: "Agent sophistication: DeepAgents → multi-agent orchestration.",
    },
    aiops: {
      name: "AI-Ops",
      blurb: "Run it in production: gateway, semantic cache, evals, observability.",
    },
    security: {
      name: "Security & Trust",
      blurb: "Guardrails, secrets, supply chain, tool sandbox, identity, jailbreak.",
    },
    scale: {
      name: "Scale & Infra",
      blurb: "Multi-replica, shared state, workload identity.",
    },
  },
  builder: {
    label: "Build",
    title: "Build your scenario",
    subtitle: "Toggle components on/off — maturity is derived from what you pick.",
    maturity: "Maturity",
    runtimeHeading: "Agent runtime",
    retrievalHeading: "Retrieval strategy",
    runtimeSoon: "soon",
    zoneReal: "Executes",
    zonePreview: "Preview · won't run",
    requiresRag: "requires Vector RAG",
    skeletonNote: "Frontend · Backend · Agent · LLM · Database are always on.",
    done: "Done",
    networkUnavailable:
      "Available only when running the full Docker stack (the network containers must be up).",
    groups: { retrieval: "Retrieval & Data", agent: "Agent", infra: "Infrastructure", aiops: "AI-Ops" },
    retrievalStrategies: {
      vector: {
        name: "Vector RAG",
        blurb: "Embed the query and search the vector index for the most similar chunks.",
      },
      ragless: {
        name: "RAGLESS",
        blurb:
          "Reasoning-based retrieval (PageIndex tree search) — no embeddings, no vector DB.",
      },
    },
    components: {
      mcp: { name: "MCP Tools", blurb: "Tool service (calculator, time, web search…)." },
      rerank: { name: "Reranker", blurb: "Re-scores RAG candidates with a cross-encoder." },
      hybrid: { name: "Hybrid Search", blurb: "BM25 + vector fusion (RRF)." },
      network: {
        name: "Network",
        blurb: "Real ingress chain: DNS · CDN · WAF · TLS/LB · API-Gateway (Docker only).",
      },
      summarization: { name: "Summarization", blurb: "Compacts the agent's context (preview)." },
      gateway: { name: "LLM Gateway", blurb: "Routing, fallback, budgets (preview)." },
      guardrails: { name: "Guardrails", blurb: "Input/output safety (preview)." },
      cache: { name: "Semantic Cache", blurb: "Prompt/embedding cache (preview)." },
      eval: { name: "Eval Runner", blurb: "Scores answers against a golden set (preview)." },
      observability: { name: "Observability", blurb: "Traces, tokens, cost (preview)." },
    },
    runtimes: {
      react: { name: "ReAct", blurb: "The canonical bounded ReAct loop (default)." },
      deepagents: { name: "DeepAgents", blurb: "Planner + sub-agent + virtual file system." },
      multiagent: { name: "Multi-agent", blurb: "Orchestrator + specialized sub-agents (preview)." },
    },
    maturityNames: { simple: "Simple", intermediate: "Intermediate", advanced: "Advanced" },
  },
  agentDetail: {
    title: "Agent Context Window",
    subtitle: "The anatomy of an AI agent: a brain (the LLM), memory, and tools",
    harness: "Agent Harness — the loop, tools, prompt layers, context window and memory wrapped around the LLM.",
    back: "Back to canvas",
    waiting: "Send a message to watch the agent reason, remember and act.",
    reactLoop: "ReAct loop",
    reason: "reason",
    act: "act · tool",
    observe: "observe",
    answer: "answer",
    iterations: "iterations",
    lastDecision: "last decision",
    workingMemory: "Working memory",
    workingMemoryHint: "this request's state — lost when it ends",
    userMessage: "user message",
    scratchpad: "tool scratchpad (act → observe)",
    noToolCalls: "no tools called this run",
    retrievalResult: (count, topSource, topScore) => {
      if (count === 0) return "no chunks retrieved";
      const unit = count === 1 ? "chunk" : "chunks";
      if (!topSource) return `${count} ${unit}`;
      const score = typeof topScore === "number" ? ` · ${topScore.toFixed(2)}` : "";
      return `${count} ${unit} (top: ${topSource}${score})`;
    },
    longTermMemory: "Long-term memory",
    longTermMemoryHint: "survives across requests",
    conversationHistory: "conversation history · app DB",
    vectorMemory: "vector memory · RAG knowledge base",
    noHistory: "no earlier conversations",
    contextWindow: "Context window",
    contextWindowHint: "what is actually assembled and sent to the LLM",
    systemPrompt: "system prompt",
    retrievedContext: "retrieved context · RAG",
    toolResults: "tool results",
    history: "history",
    tools: "available tools",
    approxTokens: (n) => `~${n} tokens`,
    brain: "Brain · the LLM",
    brainHint: "every reasoning round is a call to the model",
    senses: "Input · the message",
    hands: "Tools · the agent's hands",
    speech: "Answer · what it says",
    noAnswerYet: "no answer yet",
    rounds: "LLM rounds",
    model: "model",
    promptTokens: "prompt tokens",
    completionTokens: "completion tokens",
    totalTokens: "total tokens",
    cost: "cost (USD)",
    approxProportion: "approx. proportion of the context",
    windowOf: (model, size) => `${model} · ${size} window`,
    usedInOut: (input, answer, max, pct) =>
      `input ${input} + answer ${answer} / ${max} (${pct})`,
    estimatedByCategory: "Estimated usage by category",
    catSystemPrompt: "System prompt",
    catToolDefs: "Tool definitions",
    catSkills: "Skills",
    catMemory: "Memory (long-term)",
    catRetrieved: "Retrieved context",
    catMessages: "Messages",
    catCompletion: "Completion (answer)",
    freeSpace: "Free space",
    windowHint: "The model's finite context window — used vs. free this turn.",
    estimatedNote: "Per-category split is an estimate; used/max is the real billed total.",
    perCallNote: "Used sums every LLM round in this turn (decide + answer) — matches Usage & Cost.",
    memoryGrowth: "Memory growth",
    memoryGrowthHint: "What carries forward from each prior turn — only the visible text.",
    growthRowLabel: (cumulative, total) => `${cumulative} / ${total}`,
    growthRowHint: (perTurn) => `This turn added ${perTurn} tokens`,
    currentlyInWindow: (total) => `Currently in window: ${total} tokens`,
    nextToFallOut: (limit, turn) => `Next to fall out (limit ${limit}): T${turn}`,
    thisTurnNotStored: "(this turn — not yet stored)",
    memoryLesson:
      "Only your message + the assistant's final answer carries forward; reasoning, tool calls and observations don't.",
    plan: "Plan",
    planHint: "On the Intermediate rung the agent maintains a todo list (write_todos), marking items as it works.",
    planEmpty: "No plan this run — the Simple rung runs the bounded ReAct loop directly.",
    steps: "Steps",
    stepsHint: "every DeepAgents action this run, in order",
    wroteFile: "wrote file",
    readFile: "read file",
    noSubagent: "no sub-agent delegated this run",
    readMore: "Read more",
    readLess: "Show less",
    todoStatus: { pending: "pending", in_progress: "in progress", completed: "completed" },
    delegated: "Delegated to sub-agent",
    delegateHint: "A self-contained sub-task handed to a sub-agent that runs with its own isolated context and tools, returning only its result.",
    subagentUsed: "sub-agent used",
    vfs: "Virtual file system",
    vfsHint: "An in-memory scratchpad the agent wrote to and read back across steps, so work survives beyond the context window.",
    vfsEmpty: "No files written this run.",
    wrote: "wrote",
    read: "read",
    verify: "Verification",
    verifyHint: "With the verification loop on, a critic pass judges the drafted answer and can send it back for a bounded revision before it is committed.",
    verifyEmpty: "Verification was off for this run.",
    verifyPass: "passed",
    verifyRevise: "needs revision",
    verifyReason: "Reason",
    verifyRevised: "→ revised and re-generated",
    verifyRounds: (n) => `${n} revision round${n === 1 ? "" : "s"}`,
  },
  citation: {
    sources: "sources",
    fromTool: (tool) => `from ${tool}`,
    fromChunk: "from retrieved chunk",
    score: "score",
    none: "(no traceable source)",
    hint: "grounded in a source — hover the marker",
  },
  diff: {
    compareTitle: "Compare with previous turn",
    show: "compare with previous turn",
    hide: "hide comparison",
    previous: "previous turn",
    current: "this turn",
    grew: "grew",
    shrank: "shrank",
    same: "unchanged",
    needsPrior: "Needs a previous turn to compare (this is the first, or its trace expired).",
    totalDelta: "total change",
  },
  abstain: {
    badge: "Tool returned empty — agent abstained",
    hint: "No result found for this sub-query.",
  },
  learn: {
    rootTitle: "How this app works",
    rootHint: "A learning map — click any topic",
    whatItIs: "What it is",
    whyUsed: "Why it's used here",
    inProject: "In the project",
    howItWorks: "How it works",
    otherOptions: "Other options",
    studyLinks: "Study links",
    onCloud: (label) => `On ${label}`,
    cloudGuideHint: (label) => `Managed services to build this on ${label}`,
    moreIn: (title) => `More in ${title}`,
    topicsCount: (n) => `${n} topics`,
    learnStackTitle: "Learn the stack",
    learnStackBody:
      "This map explains how the simulator is built — its architecture and layers, the software and Gen-AI concepts it uses (and why), the security at each layer, the networking and infrastructure, and where data lives. Click any node to read about it.",
  },
  agentAnatomy: {
    openButton: "Configure agent",
    headerLabel: "Agent",
    editIdentity: "Edit agent identity",
    dialogTitle: "Agent anatomy",
    close: "Close",
    reset: "Reset to default",
    defaultAgentName: "Agent",
    settingsRedirect:
      "The agent's name, prompts, model and tools live in the Agent Anatomy dialog now — edits persist per conversation.",
    openFromSettings: "Open Agent Anatomy",
    catalog: {
      label: "Agents",
      loading: "Loading…",
      empty: "No agents yet.",
      more: "more",
      draftHint: "Send a message first to switch this conversation's agent.",
      defaultSuffix: "default",
      newLabel: "New",
      newTooltip: "Clone the current agent into a new one",
      deleteLabel: "Delete",
      deleteTooltip: "Delete this agent",
      confirm: "Delete this agent? Conversations using it will fall back to the default.",
      confirmYes: "Yes, delete",
      confirmCancel: "Cancel",
      lockedEditHint:
        "This conversation's agent is locked, but you can still edit, create or delete agents here — changes apply to the shared catalog.",
    },
    identity: {
      title: "Identity",
      nameLabel: "Name",
      namePlaceholder: "Agent",
      descLabel: "Short description",
      descPlaceholder: "What is this agent specialized in?",
      hint: "Start with the name and a short description — you can change them later.",
    },
    system: {
      title: "System prompt",
      help:
        "Platform-wide rules every agent inherits: safety, honesty, format. Applies before the agent's role.",
    },
    agent: {
      title: "Agent prompt",
      help:
        "Who this agent is and what it should do. The role and tool-usage instructions specific to this agent.",
    },
    provider: {
      title: "Provider",
      help: "The LLM provider this agent runs on.",
      comingSoon: "Coming soon",
      activeNote: "Default — cloud provider, needs an OpenAI key.",
      previewNote: "Run models locally on your own machine.",
      ollamaNote: "Runs against your local Ollama server. No OpenAI key needed.",
      serverUrlLabel: "Ollama server URL",
      serverUrlPlaceholder: "http://localhost:11434",
      serverUrlHelp:
        "The backend connects to this address. In Docker use host.docker.internal.",
      refresh: "Refresh models",
      unreachable: "Couldn't reach the Ollama server. Is it running?",
      noModels: "No models installed. Run `ollama pull <model>` first.",
      loadingModels: "Listing installed models…",
      modelLabel: "Model",
      keyLabel: "OpenAI API key",
      keyPlaceholder: "sk-…",
      keySavedHint: "A key is saved. Enter a new one to replace it.",
      keySave: "Save & test",
      keyTesting: "Testing the connection…",
      keyConnected: "Connected — models loaded.",
      keyFailed: "Couldn't authenticate. Check the key.",
      keyEnvNote: "Falls back to the OPENAI_API_KEY env when empty.",
      vertexaiNote: "Runs against Google Cloud Vertex AI.",
      projectLabel: "GCP Project ID",
      projectPlaceholder: "e.g. my-gcp-project",
      locationLabel: "GCP Location",
      locationPlaceholder: "e.g. us-central1",
      credentialsLabel: "Google Service Account Key JSON",
      credentialsPlaceholder: '{ "type": "service_account", ... }',
      credentialsSavedHint: "Credentials are saved. Enter new JSON to replace.",
      credentialsTooltip: "Access console.cloud.google.com\n\nSelect your project from the dropdown menu at the top of the page.\n\nIn the main menu (three lines in the top left corner), go to 'IAM & Admin' and then click 'Service Accounts'.\n\nSelect or create the account:\nIf you already have a service account configured for this agent, click on its email.\nIf not, click on '+ Create Service Account' at the top, give it a name, and in the permissions step, add the 'aiplatform.user' role.\n\nWith the service account open, click on the 'Keys' tab.\nClick 'Add Key' and choose 'Create new key'.\nSelect the JSON key type and click 'Create'.",
      vertexaiSave: "Save & test",
      vertexaiTesting: "Testing connection...",
      vertexaiConnected: "Connected — settings saved.",
      vertexaiFailed: "Connection test failed. Check settings and credentials.",
    },
    model: {
      title: "Model",
      help: "The language model this conversation uses.",
      resolved: "This conversation will use:",
      useDefault: "Use default",
    },
    tools: {
      title: "Tools",
      help: "Which tools this agent can choose to call.",
      countAll: "All enabled",
      countSome: (enabled, total) => `${enabled} of ${total} enabled`,
    },
    knowledge: {
      title: "Knowledge base",
      help: "What this agent can retrieve from at runtime.",
      corpus: "Corpus (shipped)",
      corpusLockHint: "Read-only — bundled with the simulator.",
      uploads: "Your uploads",
      uploadsEmpty: "No documents uploaded yet.",
      add: "Add document",
      remove: "Remove",
      loading: "Loading…",
    },
    skills: {
      title: "Skills",
      sharedNote: "Skills are shared across all conversations.",
    },
  },
  llmDetail: {
    title: "LLM · calls this turn",
    subtitle: "Every model call of this turn — prompt, latency and tokens.",
    back: "Overview",
    noCalls: "No LLM calls yet — step forward to watch the rounds appear.",
    reasoningRound: (n) => `Reasoning round ${n}`,
    generation: "Answer generation",
    decisionCalledTools: "called tools",
    decisionAnswered: "answered",
    latency: "latency",
    promptFor: "Assembled prompt",
    response: "LLM response",
    decidedToAnswer: "Decided to answer → see the Answer generation call below.",
  },
  mcpDetail: {
    title: "MCP Tools — calls this turn",
    subtitle: "JSON-RPC over the MCP transport",
    back: "Canvas",
    empty: "No tool activity in this turn yet.",
  },
  ingestionDetail: {
    title: "Ingestion pipeline — this upload",
    subtitle: "Object store → chunk → tokenize → embed → metadata → vector DB",
    back: "Canvas",
    empty: "No ingestion activity yet — upload a document to see the pipeline.",
    objectStore: "Object store",
    chunking: "Chunking",
    tokenization: "Tokenization",
    embedding: "Embedding",
    metadata: "Metadata extraction",
    store: "Save to vector DB",
    filename: "file",
    objectKey: "object key",
    size: "size",
    contentType: "content type",
    strategy: "strategy",
    chunks: "chunks",
    chunkSize: "chunk size",
    overlap: "overlap",
    totalChars: "total chars",
    previews: "chunk previews",
    chunkTableCaption: "chunks",
    colNum: "#",
    colChars: "chars",
    colTokens: "tokens",
    colSnippet: "preview",
    selectChunkHint: "Select a chunk above to read its full text.",
    fullChunkText: "full chunk text",
    overlapLegend: "overlap with previous chunk",
    encoding: "encoding",
    totalTokens: "total tokens",
    perChunkTokens: "tokens per chunk",
    model: "model",
    dimension: "dimension",
    vectors: "vectors",
    vectorPreview: "vector preview",
    docType: "doc type",
    keys: "metadata keys",
    records: "records",
    collection: "collection",
    stored: "chunks stored",
    totalInCollection: "total in collection",
  },
  dbDetail: {
    title: "App Database — operations this turn",
    subtitle: "Read history · persist conversation",
    back: "Canvas",
    empty: "No database activity in this turn yet.",
    rowId: "Row id",
    session: "Session",
    queriesHeading: "Statements executed",
    rowsAffected: (n) => `→ ${n} rows`,
  },
  backendDetail: {
    title: "Backend — request lifecycle",
    subtitle: "FastAPI edge · request → response",
    back: "Canvas",
    empty: "Nothing received in this turn yet.",
    received: "Request received",
    assembled: "Response assembled",
    message: "Message",
    delivery: "Delivery",
    session: "Session",
    answer: "Answer",
    latency: "Latency",
    intro: "The backend orchestrates the turn — it coordinates each step below.",
    stepReceive: "Payload received",
    stepHistory: "Load history",
    stepAgent: "AI agent invoked",
    stepPersist: "Persist conversation",
    stepRespond: "Response streamed back",
    hopReceive: "HTTPS · POST",
    hopRead: "SQL · read",
    hopInvoke: "in-process",
    hopWrite: "SQL · write",
    hopRespond: "HTTPS · SSE",
    rowsLoaded: "Rows loaded",
    reasoningRounds: "Reasoning rounds",
    toolCalls: "Tool calls",
    retrievals: "Retrievals",
    agentHint: "Open the Agent · LLM · MCP full views for the inner detail.",
    pending: "waiting…",
  },
  frontendDetail: {
    title: "Frontend — browser exchange",
    subtitle: "POST request · streamed answer",
    back: "Canvas",
    empty: "Nothing sent in this turn yet.",
  },
  networkDetail: {
    back: "Canvas",
    in: "In",
    out: "Out",
    did: "What it did",
    evidence: "Forwarded headers (verbatim)",
    reconstructedLog: "Access log (reconstructed)",
    reconstructedLogHint: "Reconstructed from the forwarded evidence — not a live container tail.",
    notMeasured: "not measured at this hop",
    requestLine: "Request",
    message: "Message",
    noRequest: "No request captured at this point yet.",
    dns: {
      title: "DNS — name resolution",
      subtitle: "host → address · TTL",
      empty: "No DNS resolution in front of this request.",
      summary: "Resolved the origin service name to an address (a real query to CoreDNS) before any connection was made.",
      inDesc: "A service name to resolve.",
      host: "Host queried",
      address: "Resolved address",
      ttl: "TTL (s)",
      notResolved: "CoreDNS returned no address for this name (chain absent or lookup failed).",
    },
    cdn: {
      title: "CDN / Cache — edge cache",
      subtitle: "request → HIT / MISS / BYPASS",
      empty: "No edge cache in front of this request.",
      summary: "Checked the edge cache — a HIT is served from the edge; the uncacheable chat API is a BYPASS, passed straight to the origin.",
      inDesc: "The incoming request for the app.",
      cache: "Cache",
      age: "Age (s)",
      server: "Edge server",
      hits: "Cache hits",
      reason: "Reason",
    },
    waf: {
      title: "WAF — web application firewall",
      subtitle: "request → verdict",
      empty: "No WAF in front of this request.",
      summary: "Inspected the request against the OWASP rule set, then let it pass (or blocked it with a 403).",
      inDesc: "The raw request to inspect.",
      status: "Verdict",
      rules: "Rules matched",
      anomaly: "Anomaly score",
      engine: "Engine",
      threshold: "Anomaly threshold",
      paranoia: "Paranoia level",
      anomalyNote: "The per-request anomaly score isn't forwarded upstream by ModSecurity v3 — only the verdict and config reach the app.",
      http: "HTTP status",
      blockedNote: "Stopped here by the WAF — the request was rejected with 403 and never reached the backend.",
      blockedWhy: "The payload matched an OWASP Core Rule Set signature (a likely SQLi / XSS / traversal pattern). The exact rule id lives in the WAF's audit log and isn't returned in the 403.",
    },
    lb: {
      title: "TLS / Load Balancer — reverse proxy",
      subtitle: "HTTPS → upstream",
      empty: "No TLS terminator / load balancer in front of this request.",
      summary: "Terminated TLS (the single decryption point) and load-balanced the request onto a backend, adding X-Forwarded-* headers.",
      role: "Reverse proxy · terminate TLS · forward to upstream",
      inDesc: "Encrypted HTTPS from the client.",
      tls: "TLS version",
      scheme: "Scheme",
      upstream: "Upstream",
      server: "Balancer",
      poolSize: "Backends in pool",
      algorithm: "Algorithm",
      backend: "Chose backend",
    },
    apigw: {
      title: "API Gateway — routing & quotas",
      subtitle: "route → backend",
      empty: "No API gateway in front of this request.",
      summary: "Matched the route, enforced rate limits, then forwarded the call to the backend.",
      inDesc: "The routed API call.",
      route: "Route matched",
      rateLimit: "Rate-limit remaining",
      upstreamLatency: "Upstream latency (ms)",
      gateway: "Gateway",
      policy: "Policy enforced",
    },
  },
  ragDetail: {
    title: "RAG Pipeline",
    subtitle: "Chunking → Embedding → Retrieval → Reranking",
    back: "← Canvas",
    empty: "Send a message to watch the RAG pipeline run.",
    chunking: "Chunking",
    chunkingBlurb:
      "Documents are split into overlapping chunks offline, at ingestion — so retrieval is fast at query time.",
    embedding: "Embedding",
    embeddingBlurb:
      "The query is embedded into a vector with the same model used to index the corpus.",
    retrieval: "Retrieval",
    retrievalBlurb:
      "A nearest-neighbour search returns the closest candidate chunks by cosine similarity.",
    reranking: "Reranking",
    rerankingBlurb:
      "A local cross-encoder re-scores the candidate pool so the most relevant chunks lead, then trims to top-k.",
    rerankInactive: "Reranking runs on the Intermediate rung only — switch scenarios to see it.",
    hybrid: "Hybrid",
    hybridBlurb:
      "A keyword (BM25) search runs alongside the vector search and the two ranked lists are fused with Reciprocal Rank Fusion (RRF) — catching exact, rare-term matches that dense embeddings blur over.",
    hybridInactive: "Enable Hybrid Search (Vector RAG) in the Build popover to fuse a BM25 lane.",
    hybridFusedLabel: "fused",
    laneVector: "vector",
    laneBm25: "BM25",
    rrfFormula: "RRF score = Σ 1 / (k + rank) over the lanes that ranked the chunk",
    fusionTable: "Fusion (Vector | BM25 | → RRF)",
    colSource: "source",
    hybridNote:
      "Rank-based fusion needs no shared score scale: a chunk ranked high in either lane floats up; ↑ marks one BM25 lifted above its vector rank.",
    augmented: "Augmented",
    augmentedBlurb:
      'The retrieved chunks are assembled into the prompt context sent to the LLM — the "A" in RAG.',
    offline: "offline · ingestion",
    toLlm: "→ LLM",
    close: "Close",
    inputLabel: "Input text",
    tokensLabel: "Tokens",
    vectorLabel: (shown, dim) => `Embedding vector (first ${shown} of ${dim} dims)`,
    tokenizerNote: "tiktoken · o200k_base",
    vectorSearch: "Vector search · cosine similarity",
    cosineFormula: "cos(θ) = (q·d)/(|q||d|) = similarity = 1 − distance",
    angleLabel: "angle",
    rerankPoolNote: (fetchK, k) => `cross-encoder re-scored ${fetchK} candidates → kept top ${k}`,
    contextInjected: "This text is injected into the prompt's context sent to the LLM.",
    chunkConfig: "≈900 chars · 150 overlap",
    showingOf: (shown, total) => `showing ${shown} of ${total}`,
    clickHint: "Click a stage to inspect it",
    noRetrieval: "This turn didn't use the knowledge base — the agent answered without retrieval.",
    zoomHint: "scroll to zoom · drag to pan",
    resetView: "reset",
    chunkNote:
      "Each point is one chunk (≈900 chars) embedded as a single vector — the label is its source file, so several chunks can share one file.",
    vizNote:
      "Vectors are unit-length (cosine ignores magnitude); only the angle to q matters — the wider the angle, the less similar. A 2-D illustration of a 1536-D space.",
    legend: "q = your query embedding · colored vectors = candidate chunks (green = closest)",
    queryLabel: "q · query",
    keptNote: (candidates, kept) =>
      `${candidates} candidates found — the reranker trims to the top ${kept} for the prompt.`,
    thresholdLabel: "score threshold",
    thresholdOff: "0.00 · off",
    thresholdOffHint:
      "No score filter — the top-k are kept regardless of relevance. Raise the Rerank score threshold (Settings → Experiment) to drop low-score chunks like this one.",
    executionOf: (k, n) => `retrieval ${k} / ${n}`,
    prevExecution: "Previous retrieval",
    nextExecution: "Next retrieval",
    quality: "Retrieval quality",
    qualityPrecision: "Precision@k",
    qualityRecall: "Recall@k",
    qualityMrr: "MRR",
    qualityRelevant: "relevant",
    qualityNotRelevant: "not relevant",
    qualityMissed: "Relevant chunks missed",
    qualityNoGroundTruth:
      "No ground truth for this query — metrics need a labelled benchmark query.",
    qualityTryBenchmark: "Try a benchmark query to score retrieval.",
    chunkPlayLoading: "Chunking the sample…",
    chunkPlayWhy:
      "Better boundaries = better retrieval — chunking is upstream of every metric.",
    chunkCompareWithFixed: "Fixed-size",
    chunkMidSentence: "cuts mid-sentence",
    chunkStratFixed: "Fixed-size — splits by length; can cut a sentence in half.",
    chunkStratRecursive: "Recursive — splits on paragraphs/sentences, with overlap.",
    chunkStratSemantic: "Semantic — starts a new chunk when the topic shifts.",
    chunkStratAgentic: "Agentic — an LLM segments the document into coherent units.",
    metaWhyRetrieved: "Why retrieved",
  },
  pageindexDetail: {
    title: "RAGLESS Pipeline",
    subtitle: "Document tree → Navigate → Select → Augmented",
    empty: "Send a message to watch the RAGLESS (PageIndex) pipeline run.",
    noRetrieval: "This turn didn't use the knowledge base, so PageIndex didn't navigate.",
    clickHint: "Click a stage to drill in.",
    close: "Close",
    tree: "Document tree",
    treeBlurb:
      "A hierarchical table of contents is built from the documents' headings — the index PageIndex navigates (no embeddings).",
    navigate: "Navigate",
    navigateBlurb:
      "The LLM reasons over the tree and picks the relevant section(s) — an explainable path, not a cosine score.",
    select: "Select",
    selectBlurb: "The chosen sections' text becomes the grounding context.",
    augmented: "Augmented",
    augmentedBlurb:
      'The selected sections are assembled into the prompt context sent to the LLM — the "A" in RAG.',
    toLlm: "→ LLM",
    reasoningLabel: "Reasoning",
    selectedLabel: "Selected sections",
    navigatedTo: "Navigated to",
    queryLabel: "Query",
    nodesLabel: (nodes, leaves) => `${nodes} nodes · ${leaves} sections`,
  },
};

const pt: Strings = {
  lens: {
    label: "Lente",
    mode: { all: "Tudo", harness: "Harness", loop: "Loop" },
    legend: {
      harness: "O cabeamento (espaço): tudo em volta do modelo, colorido por papel. O runtime do próprio agente é o “Agent Harness” no centro — aqui você vê o harness inteiro que o cerca.",
      loop: "O ciclo (tempo): raciocina → age → observa, iterando até uma condição de parada. Ele roda sobre o Agent Harness no centro.",
      learnMore: "Aprenda Harness & Loop Engineering →",
    },
    role: {
      tools: "Ferramentas",
      knowledge: "Conhecimento",
      memory: "Memória",
      context: "Contexto",
      permissions: "Permissões",
      model: "Modelo",
      orchestration: "Orquestração",
      delivery: "Entrega",
      observability: "Observabilidade",
    },
    roleHint: {
      tools: "Funções chamáveis (via MCP) que o agente invoca para agir no mundo.",
      knowledge: "O corpus de onde o agente recupera (RAG / ingestão).",
      memory: "Estado durável que sobrevive entre turnos (o banco relacional, caches).",
      context: "O que é montado na janela do modelo — context engineering.",
      permissions: "O que é permitido entrar ou é bloqueado (segurança de borda, guardrails).",
      model: "O motor de raciocínio em si (o LLM).",
      orchestration: "Roteamento, delegação e o plano de controle que roda o loop.",
      delivery: "Levar bytes de e para o usuário (porta da frente, roteamento de entrada).",
      observability: "Avaliações e telemetria que observam o harness.",
    },
    roleLegendTitle: "Peças do harness",
    core: "Núcleo",
    coreHint:
      "O runtime do próprio agente — o “Agent Harness” (veja o subtítulo). É o motor no centro do harness amplo, e é o que roda o Loop.",
    contextChip: "Janela de contexto",
    contextHint:
      "O que o agente monta na janela de contexto do modelo a cada turno — isto é context engineering, aninhado dentro do Agent Harness.",
    loop: {
      iteration: (n, max) => `${n} rodadas · teto ${max}`,
      stopFinal: "✓ Respondeu — parou sozinho",
      stopMax: "⚠ Bateu no teto de iterações",
      recovery: "Falha injetada — caminho de recuperação",
      inProgress: "Loop em andamento…",
    },
  },
  app: {
    tagline:
      "A jornada de uma mensagem de chat por RAG, ferramentas MCP e um LLM — visualizada ao vivo.",
    learn: "Aprender",
    simulator: "Simulador",
    config: "Config",
    liveTitle: "Chamadas reais à OpenAI",
    language: "Idioma",
    cloud: "Provedor de nuvem",
    theme: "Tema",
    themeDark: "Escuro",
    themeLight: "Claro",
    offline:
      "Backend offline — suba com `docker compose up backend` (precisa de OPENAI_API_KEY em backend/.env).",
    noKey:
      "Sem OPENAI_API_KEY — o backend está no ar mas não roda um turno. Adicione em backend/.env e reinicie.",
  },
  arena: {
    nav: "Arena",
    title: "Arena",
    tagline: "Modele sua arquitetura sob carga",
    honesty:
      "Modelo estimado — não é teste de carga real. Os números são analíticos, a partir de benchmarks declarados por componente; nenhum tráfego real é enviado.",
    paletteTitle: "Componentes",
    paletteHint: "Arraste para o canvas para adicionar",
    examples: "Exemplos",
    emptyCanvas: "Arraste um componente aqui para começar a montar",
    usersLabel: "Usuários simultâneos",
    thinkTime: "Tempo entre mensagens",
    thinkTimeHint:
      "Segundos entre requests por usuário — req/s = usuários ÷ tempo entre mensagens (Lei de Little). O knob mais decisivo de todos: usuários de chat tipicamente pausam 30–120s entre mensagens, e reduzir pela metade dobra a carga.",
    usersReadout: (users, rps) => `${users} usuários ≈ ${rps} req/s`,
    effectiveRate: (rps) => `→ ${rps} req/s efetivos`,
    closedLoopHint:
      "Um usuário esperando uma resposta lenta não envia a próxima mensagem: a carga se auto-regula para usuários ÷ (tempo entre mensagens + tempo de resposta). A diferença entre demandado e efetivo É o custo da latência.",
    callsPerRequest: "Chamadas por request",
    callsHint:
      "Um turno de agente faz 2–5 chamadas de modelo (loop ReAct). Configure no AI Gateway OU no LLM atrás dele — nunca nos dois.",
    shedding: (n) => `derrubando ~${n} req/s (429)`,
    saturatedHeader: (n) => `Saturado — descartando ~${n} req/s (429)`,
    saturatedHint:
      "Acima da capacidade uma API real descarta com 429; um número de latência seria ficção. Escale o gargalo para voltar a ter latência.",
    e2eLatency: "Latência fim-a-fim",
    e2eLatencyHint:
      "Latência modelada de um turno do agente: etapas em sequência somam, e k chamadas por request custam k × a latência do modelo. Caminho de pior caso (incluindo cache miss).",
    llmCost: "Custo do LLM",
    llmCostHint:
      "Estimativas didáticas: ~US$ 100/h por deployment médio (provisionado, cobrado mesmo ocioso — pense em PTUs) mais ~US$ 0,0016 por chamada de agente (~2k entrada / 500 saída a preços do gpt-4.1-mini). Ponto de equilíbrio ≈ 35% de utilização.",
    llmCostProvisioned: (v) => `~$${v}/h provisionado`,
    llmCostUsage: (v) => `~$${v}/h de uso`,
    reset: "Limpar canvas",
    scaling: "Escala",
    metric: {
      qps: "QPS",
      latency: "Latência",
      util: "Utilização",
      capacity: "Capacidade",
      inflight: "Em voo",
    },
    inflightInfo:
      "Requests que este componente mantém abertos agora (Lei de Little: vazão × tempo de espera, incluindo tudo que ele aguarda a jusante). Um backend de agente síncrono segura a conexão/stream SSE o turno INTEIRO — pools de conexão e memória acabam muito antes da CPU.",
    status: {
      healthy: "Saudável",
      warning: "Alerta",
      critical: "Crítico",
      unreachable: "Inalcançável",
    },
    size: "Tamanho da instância",
    infoLabel: "Sobre este componente",
    capacityHint: "capacidade = base do componente × tamanho da instância × unidades",
    routingTax: (pct, n) =>
      `Roteamento de LLM no app: −${pct} de capacidade (gerenciando ${n} deployments — um AI Gateway remove isso)`,
    quotaLimited: (region) => `Limitado por cota — ${region} atingiu a cota regional de LLM`,
    quotaHint:
      "Uma região limita quanta capacidade de modelo você consegue provisionar (cota da assinatura / disponibilidade de PTU). Acima do teto, mais deployments na mesma região não adicionam nada — adicione outra região ou um tier de cota maior.",
    region: "Região",
    regionHint:
      "Pools em regiões diferentes sobrevivem à queda de uma região, reduzem a latência perto dos usuários e atendem residência de dados. Por ora é uma anotação — os desafios vão pontuar isso.",
    regionNone: "Sem região",
    autoWireHint:
      "Dica: com um nó selecionado, um componente solto no canvas já é ligado a partir dele",
    edgeHint: "Clique numa ligação e pressione Backspace para removê-la",
    fanoutNudge: "Um turno de agente faz de 2 a 5 chamadas de modelo — definir chamadas por request = 2?",
    fanoutApply: "Definir como 2",
    fanoutDismiss: "Manter 1",
    replicasCeilingHint:
      "No máximo por pool — frotas reais escapam adicionando outro pool/região ou um tier de cota maior.",
    sizes: { small: "Pequeno", medium: "Médio", large: "Grande", xlarge: "Extra grande" },
    cacheHitRatio: "Taxa de acerto do cache",
    bottleneck: "Gargalo",
    selectHint: "Selecione um componente para escalá-lo",
    remove: "Remover",
  },
  demo: {
    bannerLead: "Modo demo — apenas perguntas de exemplo, reproduzindo execuções reais capturadas.",
    bannerCta: "Rode a versão completa com sua própria chave OpenAI",
    composerHint: "Escolha uma pergunta de exemplo abaixo",
    sampleBarLabel: "Perguntas de exemplo",
  },
  mobile: {
    tab: { canvas: "Diagrama", chat: "Chat", inspector: "Inspetor" },
  },
  chat: {
    title: "Pergunte ao agente",
    subtitle: "Envie uma mensagem e acompanhe-a percorrendo o pipeline à direita.",
    placeholder: "ex.: O que é RAG?",
    running: "Executando…",
    send: "Enviar mensagem",
    answer: "Resposta",
    thinking: "Pensando…",
    wafBlocked:
      "Bloqueado pelo WAF (403) — o payload casou com uma assinatura do OWASP Core Rule Set (provável ataque web), então o ModSecurity o rejeitou na borda. Não chegou ao agente. Abra a caixa do WAF para ver o porquê.",
    stage: {
      request: "Enviando…",
      memory: "Lendo memória…",
      route: "Roteando…",
      retrieve: "Recuperando…",
      reason: "Raciocinando…",
      tools: "Chamando ferramentas…",
      generate: "Gerando…",
      respond: "Respondendo…",
      persist: "Salvando…",
    },
    answerHint: "A resposta do agente aparecerá aqui.",
    examples: [
      "O que é RAG e como funciona a recuperação?",
      "Quanto é 12 * (3 + 1)?",
      "Como funcionam as ferramentas MCP?",
      "Que horas são agora?",
    ],
    conversations: "Conversas",
    newChat: "Nova conversa",
    empty: "Ainda sem conversas",
    untitled: "Nova conversa",
    back: "Conversas",
    you: "Você",
    agent: "Agente",
    sources: "Fontes usadas",
    fromDoc: "seu PDF",
    searchGroup: (n, query) => `Busca ${n}: “${query}”`,
    emptyThread: "Envie uma mensagem para começar esta conversa.",
    messages: (n) => `${n} mensage${n === 1 ? "m" : "ns"}`,
    uploadPdf: "Enviar PDF",
    documents: "Documentos",
    removeDoc: "Remover",
    chunksStored: (n) => `${n} trecho${n === 1 ? "" : "s"}`,
    uploading: "Processando…",
    uploadFailed: "Falha no envio",
    now: "agora",
    attachDoc: "Anexar um PDF",
    enterToSend: "Enter para enviar",
    cancel: "Cancelar",
    cancelled: "Execução cancelada",
    skillsApplied: (n) => `${n} ${n === 1 ? "skill aplicada" : "skills aplicadas"} nesta resposta`,
    skillsBadge: "Skills aplicadas",
    pendingAttachmentsHint: "Anexos pendentes — vão junto com sua próxima mensagem.",
    attachedToThisMessage: "Anexado a esta mensagem",
    agentSelector: {
      label: "Agente",
      menuHeading: "Escolher um agente",
      ariaLabel: (name) => `Agente ativo: ${name}. Clique para trocar.`,
      locked:
        "Agente travado após a primeira mensagem da conversa. Inicie um novo chat para usar outro agente.",
      lockedAriaLabel: (name) =>
        `Agente ativo: ${name}. Travado após a primeira mensagem.`,
      lockedInlineNote:
        "O agente está travado porque esta conversa já tem mensagens.",
    },
  },
  trace: {
    clickToLoad: "Clique numa mensagem para carregar seu trace",
    loaded: "Mostrando o trace deste turno",
    expired: "Trace expirado — não está mais disponível",
  },
  hud: {
    turns: "turnos",
    tokens: "tokens",
    cost: "custo",
    toolCalls: "chamadas de ferramenta",
    ragHits: "acertos de RAG",
    partial: "parcial · alguns traces expiraram",
    estimate: "≈ estimativa · não cobrado",
    tokenizer: "tiktoken · o200k_base",
    tokensIn: "entrada",
    tokensOut: "saída",
  },
  inspector: {
    overviewTitle: "Inspetor",
    overviewBody:
      "O pipeline é dividido em camadas implantáveis (containers) que se comunicam pela rede. Envie uma mensagem e clique em qualquer estação para inspecionar os dados reais — protocolos e rotas, trechos recuperados e seus scores, chamadas de ferramentas, o prompt montado e a latência.",
    overviewBack: "← Visão geral",
    whyTitle: "Por que esta camada · O que quebra sem ela",
    whyLabel: "Por que existe",
    whatBreaksLabel: "O que quebra sem ela",
    techInfra: "Técnico e infraestrutura",
    tier: "camada",
    role: "papel (agnóstico de nuvem)",
    hosting: "hospedagem (ex.)",
    cloudExample: (cloud) => `exemplo · ${cloud}`,
    networkHops: "saltos de rede",
    networkZone: "zona de rede",
    controls: "controles",
    zonePublic: "internet pública",
    zonePrivate: "rede privada",
    events: (n) => `${n} evento${n === 1 ? "" : "s"}`,
    historyRead: "Histórico recente (leitura)",
    recentMessages: "mensagens recentes",
    totalRows: "linhas armazenadas",
    noHistory: "ainda sem conversas anteriores",
    persisted: "Conversa persistida (escrita)",
    operation: "operação",
    requestSent: "Requisição enviada",
    answerReceived: "Resposta recebida",
    routes: "Rotas",
    query: "Consulta",
    agentLoop: "Loop do agente",
    reasoningTurns: "ciclos de raciocínio",
    lastDecision: "última decisão",
    queryEmbedding: "Embedding da consulta",
    model: "modelo",
    dimensions: "dimensões",
    retrievedChunks: (n) => `Trechos recuperados (top-${n})`,
    hybridFusion: (n) => `Fusão híbrida · BM25 + vetorial (${n} fundidos)`,
    hybridColVector: "vetorial",
    rerankMovement: (n) => `Movimento do rerank (${n} candidatos)`,
    rerankModel: "modelo do reranker",
    rerankScore: "score do rerank (cross-encoder)",
    rerankCosine: "similaridade de cosseno original (busca vetorial)",
    rerankKept: "mantido",
    rerankBelowThreshold: "abaixo do limiar",
    rerankCutoffScore: (t) => `score mín ${t.toFixed(2)} — abaixo fica fora do prompt`,
    rerankCutoffTopK: (k) => `corte top-${k} — abaixo fica fora do prompt`,
    ingestion: "Ingestão de PDF",
    chunkStrategy: "estratégia de chunking",
    chunkSize: "tamanho / sobreposição",
    tokensPerChunk: "tokens por trecho",
    chunkPreviews: "prévias dos trechos",
    vectorsStored: "vetores armazenados",
    totalInCollection: "total na coleção",
    vectorPreview: "prévia do vetor",
    fromDocument: "do seu PDF",
    onThisRun: "Nesta execução",
    hopWhy: "Por que este hop",
    hopExpandHint: "Detalhes de rede",
    hopExpandLabel: "detalhes",
    noHopData: "Nada cruzou este hop nesta execução.",
    hopRequest: "Requisição",
    hopAnswer: "Resposta",
    hopForwarded: "Headers de encaminhamento",
    hopQueries: "Comandos SQL",
    hopChunks: "Trechos recuperados",
    hopScore: "escore do topo",
    hopToolCalls: "Chamadas de ferramenta",
    hopPrompt: "Prompt montado",
    edgePreview: "prévia",
    edgeChain: "cadeia da borda",
    edgeClient: "IP do cliente",
    edgeRequestId: "id da requisição",
    edgeScheme: "esquema",
    edgeDirectNote: "sem proxy à frente (acesso direto)",
    treeNodes: "nós da árvore",
    selectedSections: "seções selecionadas",
    navReasoning: "Raciocínio da navegação",
    documentTree: "Árvore do documento",
    indexerTitle: "Indexador offline",
    chunking: "chunking",
    chunkingValue: "janelas de 900 chars · 150 de sobreposição · empacotamento por parágrafo",
    trigger: "gatilho / timing",
    triggerValue: "build na inicialização se ausente · no upload de PDF · rebuild ao mudar a dimensão",
    indexRefresh: "atualização do índice",
    indexRefreshValue:
      "Um índice desatualizado ou mal chunkado degrada silenciosamente a qualidade — re-embedde quando o modelo ou o corpus muda.",
    indexerIdle: "Ocioso — constrói na inicialização, no upload de PDF, ou ao mudar a dimensão do embedding.",
    storedObject: "Objeto armazenado",
    objectKey: "chave",
    size: "tamanho",
    contentType: "tipo de conteúdo",
    whyStorage: "Por que armazenamento de objetos",
    whyStorageValue:
      "Persistir o original desacopla o upload da indexação: o arquivo é guardado com segurança antes de (e independentemente de) ser chunkado, pode ser reindexado se o modelo mudar, e nunca passa pela internet pública.",
    discoveredTools: "Ferramentas descobertas",
    transport: "transporte",
    toolCall: "Chamada de ferramenta",
    tool: "ferramenta",
    args: "args",
    result: "resultado",
    localToolCalls: "Chamadas de ferramentas locais (DeepAgents)",
    localToolCallsHint:
      "Ferramentas do agente em processo (lista de tarefas, rascunho, subagentes) — não passam pelo transporte MCP, então não têm frame JSON-RPC. Detalhadas no nó do Agente.",
    simulatedError: "⚠️ Falha simulada (injetada)",
    attempt: "Tentativa",
    backoff: "Espera (backoff)",
    circuit: "Disjuntor (circuit breaker)",
    treatment: "Tratamento",
    treatmentFallback: "Fallback — degradação graciosa",
    treatmentGraceful: "Degradação graciosa (abstenção)",
    jsonrpc: "Frames JSON-RPC",
    request: "Requisição",
    response: "Resposta",
    requestBody: "Corpo da requisição",
    forwardedEvidence: "Evidência encaminhada",
    reconstructed: "reconstruído (fallback local)",
    rank: "posição",
    distance: "distância",
    similarity: "similaridade",
    assembledPrompt: "Prompt montado",
    system: "sistema",
    retrievedContext: "contexto recuperado",
    tools: "ferramentas",
    userMessage: "mensagem do usuário",
    history: "histórico de conversas",
    generatedAnswer: "Resposta gerada",
    ttft: "tempo até o 1º token",
    throughput: "vazão",
    usageCost: "Uso e custo",
    rounds: "Rodadas da LLM",
    promptTokens: "tokens de prompt",
    completionTokens: "tokens de resposta",
    totalTokens: "tokens totais",
    cost: "custo",
    cachedTokens: "tokens em cache",
    saved: "economia vs. tudo novo",
    cacheColdHint: "Abaixo do limiar de cache (1ª chamada / pequena) — o prefixo entra em cache ao passar de ~1024 tokens.",
    status: { active: "ativo", done: "concluído", idle: "ocioso" },
  },
  comms: {
    sync: "sync",
    async: "async",
    syncDetail:
      "Requisição/resposta síncrona — o chamador bloqueia até o resultado voltar.",
    asyncDetail:
      "Streaming assíncrono — a resposta volta de forma incremental por uma conexão mantida aberta.",
    deliveryStreamDetail:
      "Streaming (SSE): os eventos de trace e a resposta voltam ao vivo, token a token, por uma única conexão mantida aberta.",
    deliveryBatchDetail:
      "Batch (JSON): uma resposta após o backend concluir toda a execução; o cliente então repete o trace.",
    llmStreamDetail: "stream=true — os tokens são transmitidos conforme o modelo os gera.",
    llmBatchDetail: "Sem streaming — a resposta completa volta em uma única resposta.",
  },
  settings: {
    open: "Opções de arquitetura",
    label: "Config",
    title: "Opções de arquitetura",
    pageTitle: "Configurações",
    pageTagline: "Opções do pipeline, controles de experimento e dados.",
    backToSim: "Voltar ao Simulador",
    delivery: "Entrega da resposta",
    deliveryHint: "Como o backend devolve o resultado ao navegador.",
    streaming: "Streaming (SSE)",
    streamingHint: "Veja cada etapa acender ao vivo; a resposta vai sendo digitada.",
    batch: "Batch (JSON)",
    batchHint: "Aguarde uma resposta JSON única e então repita o trace; a resposta aparece de uma vez.",
    kb: {
      title: "Base de conhecimento",
      hint: "Escolha como o corpus é dividido em chunks e reindexe para reconstruir o índice — o canvas anima chunk → embed → store.",
      strategy: "Estratégia de chunking",
      reingest: "Reindexar corpus",
      reingesting: "Reindexando…",
      done: (n) => `${n} trechos reindexados`,
      active: "ativa",
      applyHint:
        "Selecionada, ainda não aplicada. Reindexe o corpus para reconstruí-lo com esta estratégia — só então os arquivos enviados depois passam a usá-la.",
      explain: {
        title: "Como funciona",
        fixed:
          "Corta o texto em janelas de tamanho fixo (com sobreposição), ignorando limites de frase e parágrafo — rápido, mas corta frases ao meio.",
        recursive:
          "Empacota parágrafos inteiros em janelas com sobreposição, sem começar um chunk no meio de uma palavra — mantém cada ideia inteira. O padrão.",
        semantic:
          "Gera o embedding de cada frase e abre um novo chunk onde a similaridade entre frases vizinhas cai (mudança de tópico) — os limites seguem o significado, não o tamanho. Usa embeddings da OpenAI.",
        agentic:
          "Pede à LLM para ler o documento e segmentá-lo em unidades temáticas coerentes — o modelo decide os limites. Usa OpenAI; recai em Recursive se a resposta falhar.",
        example: "Exemplo ao vivo — chunks reais numa amostra",
        loading: "Dividindo a amostra…",
      },
      params: {
        title: "Parâmetros",
        chunkSize: "Tamanho do bloco (caracteres)",
        chunkOverlap: "Sobreposição (caracteres)",
        threshold: "Limiar de similaridade",
        maxSegments: "Máx. de segmentos",
        sizeHint:
          "Blocos maiores preservam mais contexto; blocos menores recuperam com mais precisão.",
        overlapHint: "A sobreposição mantém ideias entre os limites dos blocos.",
        thresholdHint: "Maior = divide em mudanças de tópico menores (mais blocos, menores).",
        maxSegmentsHint: "Limita quantos segmentos temáticos o modelo pode retornar.",
      },
    },
    embeddings: {
      title: "Embeddings (RAG)",
      hint: "Qual modelo transforma texto em vetores para a busca. Vale para toda a instância — um índice, um modelo.",
      provider: "Provedor",
      openai: "OpenAI — nuvem, requer uma chave OpenAI.",
      ollama: "Ollama (local) — implante seu próprio modelo de embedding (ex.: nomic-embed-text).",
      vertexai: "Vertex AI — embeddings nativos do Google Cloud (ex.: gemini-embedding-2).",
      vertexaiHint: "As credenciais do Google Service Account não estão configuradas. Acesse o diálogo Configurar agente em qualquer nó Agent para salvá-las primeiro.",
      model: "Modelo de embedding",
      modelPlaceholder: "nomic-embed-text",
      rebuildNote: "Trocar o modelo de embedding reconstrói todo o índice (no próximo start ou reindexação).",
      unreachable: "Não foi possível acessar o servidor Ollama. Ele está rodando?",
      saved: "Salvo.",
    },
    experiment: {
      title: "Experimentar",
      systemPrompt: "Prompt de sistema",
      promptHint:
        "Edita a camada de guardrails (regras do ambiente). O papel / instruções do agente ficam no diálogo Configurar agente, no nó Agent.",
      reset: "Restaurar padrão",
      tools: "Ferramentas (MCP)",
      toolsHint: "Desligue ferramentas e veja o agente replanejar sem elas.",
      toolsDisambig:
        "A Busca na base de conhecimento é recuperação vetorial completa sobre o corpus e seus PDFs; a Consulta ao glossário é uma lista enlatada de termos. Qualquer tool pode ser desligada — desligar a Busca na base de conhecimento deixa a execução sem fundamentação (só o LLM).",
      topK: "Trechos recuperados (top-k)",
      topKHint: "Quantos trechos o RAG busca por consulta.",
      rerankThreshold: "Limiar de score do rerank",
      rerankThresholdHint:
        "Só no Intermediário: descarta chunks com score abaixo disso — fundamentação menor, porém mais limpa (0 = desligado).",
      verify: "Loop de verificação",
      verifyHint:
        "Após rascunhar, uma etapa crítica revisa a resposta e pode devolvê-la para uma revisão limitada antes de confirmá-la (engenharia de loop).",
      ragless: {
        label: "RAGLESS (PageIndex)",
        hint: "Roda recuperação por raciocínio junto do RAG vetorial para comparar. A LLM navega uma árvore do documento em vez de busca vetorial — o PageIndex fundamenta a resposta.",
        on: "Ligado",
        off: "Desligado",
        simpleOnly: "Só no nível Intermediário — troque o cenário para Intermediário para habilitar.",
      },
      toolLabels: {
        search_knowledge_base: "Busca na base de conhecimento",
        calculator: "Calculadora",
        current_time: "Hora atual",
        kb_lookup: "Consulta ao glossário",
        load_skill: "Carregar skill",
        web_search: "Busca na web",
      },
      failure: {
        label: "Simular falha",
        hint: "Force uma falha na próxima execução e veja o agente degradar.",
        modes: {
          none: "Desligado",
          tool_error: "Erro de ferramenta",
          llm_timeout: "Timeout do modelo",
        },
      },
    },
    data: {
      title: "Dados",
      clear: "Limpar bancos de dados",
      clearHint:
        "Apaga todas as conversas salvas e os chunks de documentos importados. A base de conhecimento embutida é mantida.",
      confirm: "Limpar todos os dados?",
      confirmHint: "Apaga todas as conversas e todos os chunks enviados. Isto não pode ser desfeito.",
      confirmYes: "Sim, limpar",
      cancel: "Cancelar",
      clearing: "Limpando…",
      cleared: "Limpou {sessions} conversas · {chunks} chunks",
    },
    skills: {
      title: "Skills",
      hint: "Pacotes de instruções nomeados que o agente carrega sob demanda via a tool load_skill.",
      new: "Nova skill",
      name: "Nome",
      namePlaceholder: "ex.: resumo-em-bullets",
      description: "Descrição",
      descPlaceholder: "Quando o agente deve usar esta skill?",
      body: "Conteúdo",
      bodyPlaceholder: "As instruções completas carregadas quando a skill é usada…",
      save: "Salvar",
      delete: "Excluir",
      cancel: "Cancelar",
      empty: "Nenhuma skill ainda.",
      nameTaken: "Já existe uma skill com esse nome.",
      saveFailed: "Não foi possível salvar a skill.",
    },
  },
  glossary: {
    "TLS 1.3": "TLS 1.3 — a criptografia que protege o HTTPS entre o navegador e o servidor.",
    ASGI: "ASGI — a interface assíncrona de servidor web Python sobre a qual o FastAPI roda.",
    ReAct: "ReAct — o loop raciocinar → agir → observar que o agente repete até poder responder.",
    "Agent Harness":
      "Agent Harness — o arcabouço de runtime em volta de um LLM que o torna um agente: o loop de raciocínio, a chamada de ferramentas, a montagem do prompt em camadas, a janela de contexto e a memória.",
    DeepAgents:
      "DeepAgents — um padrão de agente LangGraph que adiciona planejamento, subagentes e um sistema de arquivos virtual para tarefas de horizonte mais longo. Ativo no degrau Intermediário.",
    "Multi-agent":
      "Multi-agente — vários agentes especializados que se coordenam (ex.: um orquestrador delegando a subagentes) em vez de um único loop monolítico. (Planejado — ainda não implementado.)",
    SQL: "SQL — a linguagem de consulta do banco relacional que guarda a conversa.",
    RAG: "RAG (Retrieval-Augmented Generation) — embeda a pergunta, busca os trechos mais próximos no vector DB e fundamenta a resposta neles.",
    "VECTOR DB": "Banco de dados vetorial — armazena os embeddings dos chunks e roda a busca por vizinhos mais próximos (cosseno) que o pipeline RAG usa.",
    RAGLESS:
      "RAGLESS — recuperação por raciocínio (PageIndex): a LLM navega uma árvore do documento para escolher a seção relevante, em vez de similaridade vetorial. Sem embeddings, sem banco vetorial.",
    cosine: "Similaridade de cosseno — como o banco vetorial ordena os trechos pela proximidade de significado.",
    MCP: "MCP (Model Context Protocol) — o padrão aberto que o agente usa para descobrir e chamar ferramentas.",
    stream: "Streaming — os tokens são enviados ao navegador conforme são gerados, via SSE.",
    retry: "Retentativa — refaz uma chamada que falhou um número limitado de vezes antes de desistir.",
    backoff:
      "Backoff — espera crescente entre tentativas (aqui, exponencial) para aliviar uma dependência em apuros.",
    "circuit breaker":
      "Disjuntor (circuit breaker) — após falhas repetidas, para de chamar e falha rápido em vez de travar.",
    "graceful degradation":
      "Degradação graciosa — devolve um resultado reduzido e honesto (abstenção / fallback) em vez de quebrar.",
    ALB: "ALB (Application Load Balancer) — o balanceador de carga da AWS que encerra o TLS e distribui as requisições entre os containers.",
    BLOB: "Armazenamento de blobs — um object store para arquivos brutos (PDFs, imagens) que o app guarda fora dos bancos.",
    INDEX: "Índice vetorial (HNSW) — a estrutura em grafo que torna rápida a busca por vizinhos mais próximos sobre embeddings.",
    HNSW: "HNSW — o índice de vizinhos mais próximos aproximados (baseado em grafo) que o banco vetorial usa para achar trechos similares rápido.",
    RERANK: "Reranker — um modelo de segunda passada que reordena os trechos recuperados por relevância real antes do LLM.",
    Chunking: "Chunking — dividir documentos em pedaços recuperáveis antes do embedding; a estratégia (fixo/recursivo/semântico/agêntico) define os limites.",
    Metadata: "Metadados — fatos estruturados anexados a cada trecho (fonte, seção, tipo, posição) usados para depurar a recuperação e, com self-querying, para filtrá-la.",
    "Precision@k": "Precisão@k — dos k trechos recuperados no topo, a fração que é relevante.",
    "Recall@k": "Revocação@k — de todos os trechos relevantes, a fração que entrou no top-k.",
    MRR: "MRR (Mean Reciprocal Rank) — 1/(posição do primeiro trecho relevante); maior é melhor.",
    GATEWAY: "Gateway de LLM — um proxy na frente dos provedores de modelo para roteamento, retries, limites de taxa e controle de custo.",
    SAFETY: "Guardrails — verificações de entrada/saída que bloqueiam prompts e respostas inseguros ou fora de política.",
    CACHE: "Cache semântico — reutiliza uma resposta anterior quando a nova pergunta é próxima o bastante em significado, pulando o LLM.",
    EVALS: "Eval runner — pontuação automática de respostas contra casos de teste para flagrar regressões de qualidade.",
    OTEL: "OpenTelemetry — o padrão aberto de traces, métricas e logs que torna o pipeline observável.",
    HYBRID:
      "Busca híbrida — combina recuperação por palavra-chave (BM25) e vetorial e funde os resultados (RRF) para pegar correspondências exatas que o embedding perde.",
    BM25:
      "BM25 — uma função clássica de ranqueamento por palavra-chave (esparsa, família TF-IDF) que pontua documentos pela sobreposição exata de termos; ótima em tokens literais raros que o embedding borra.",
    RRF: "Reciprocal Rank Fusion — funde duas listas ranqueadas somando 1/(k + posição) por item, fazendo um trecho bem colocado em qualquer lista subir sem reconciliar as escalas de escore.",
    MEMORY:
      "Sumarização — compacta uma conversa longa resumindo turnos antigos, para o agente manter contexto dentro do orçamento de tokens. (Planejado — ainda não implementado.)",
    research:
      "Pesquisador — um subagente que reúne e sintetiza informação para o orquestrador. (Planejado — ainda não implementado.)",
    execute:
      "Coder — um subagente que escreve e executa código para realizar uma tarefa. (Planejado — ainda não implementado.)",
    review:
      "Crítico — um subagente que revisa a saída de outro agente e aponta problemas. (Planejado — ainda não implementado.)",
    tiktoken: "tiktoken · o200k_base — o tokenizador/encoding da OpenAI; a contagem de tokens é específica do modelo, não caracteres ÷ 4.",
    load_skill: "load_skill — uma tool MCP que o agente chama para carregar sob demanda um pacote de instruções (uma skill).",
    "RAG hits": "RAG hits — quantos trechos do corpus foram recuperados e enviados ao LLM neste turno (0 = sem fundamentação).",
    decision: "decision: answer — o agente decidiu responder direto; a alternativa é call: chamar uma tool para buscar mais antes.",
    "top-k": "top-k · score — os k trechos mais similares recuperados; o score (0–1) indica o quão próximo é o melhor.",
    iterations: "×N — esta fase rodou N vezes porque o loop ReAct se repetiu (raciocinar → agir → observar).",
    // 088-network-layer — as imagens reais das appliances de entrada (tags das estações).
    CoreDNS: "CoreDNS — o servidor DNS que resolve os nomes internos dos serviços da cadeia para endereços (com um TTL).",
    Varnish: "Varnish — um cache HTTP de borda; serve respostas em cache (HIT) ou encaminha as ausentes (MISS) para a origem.",
    ModSecurity: "ModSecurity — o motor de regras do WAF (com o OWASP Core Rule Set) que inspeciona requisições e bloqueia ataques conhecidos com 403.",
    HAProxy: "HAProxy — termina o TLS e balanceia as requisições para um upstream do backend, adicionando headers X-Forwarded-*.",
    Kong: "Kong — um API gateway: roteamento, rate-limit e autenticação por chave de API na borda (aqui rodando sem banco).",
  },
  timeline: {
    title: "Replay e passo a passo",
    hint: "Clique numa fase ou avance ◀ ▶ etapa por etapa por toda a requisição.",
    stepBack: "Voltar um passo",
    pause: "Pausar",
    replay: "Repetir",
    stepForward: "Avançar um passo",
    idle: "ocioso",
    phases: {
      request: "Requisição",
      memory: "Memória",
      route: "Roteamento",
      retrieve: "Recuperação",
      reason: "Raciocínio",
      tools: "Ferramentas",
      generate: "Geração",
      respond: "Resposta",
      persist: "Persistência",
    },
    execTrace: {
      title: "Traces de execução",
      subtitle: "Árvore hierárquica de spans do run — duração, tokens e custo por nó.",
      empty: "Rode um turno para ver o trace de execução.",
      nodes: {
        route: "route",
        think: "think",
        tools: "tools",
        generate: "generate",
        respond: "respond",
        retrieve: "retrieve",
        memory: "memory",
        persist: "persist",
        // 062 — DeepAgents steps (kept English in both langs, like the others).
        plan: "plan",
        delegate: "delegate",
        "fs-write": "file write",
        "fs-read": "file read",
      },
      child: { embed: "embed", search: "search", select: "select" },
      planTodos: "tarefas",
    },
  },
  console: {
    title: "Log de eventos",
    expand: "Mostrar log",
    collapse: "Ocultar log",
    explain: "Explicar este evento",
    copyEvent: "Copiar JSON",
    copyTrace: "Copiar trace completo",
    copyId: "Copiar id da requisição",
    copied: "Copiado",
    size: "payload",
    latency: "latência",
    from: "de",
    to: "para",
  },
  tour: {
    start: "▶ Tour",
    pause: "Pausar tour",
    resume: "Retomar tour",
    stop: "Encerrar tour",
    prev: "Fase anterior",
    next: "Próxima fase",
    ctaEmpty: "▶ Pré-visualizar a jornada",
    captions: {
      request: "O navegador envia sua mensagem à API por HTTPS.",
      memory: "O backend carrega o histórico recente da conversa — memória de longo prazo.",
      route: "Route: o agente recebe a consulta e planeja o caminho — ainda sem chamar o LLM.",
      retrieve: "O RAG vetoriza a pergunta e busca os trechos mais relevantes.",
      reason:
        "Reason ≠ Generate: Reason decide o que fazer (qual ferramenta, se houver) — o passo de decisão do ReAct. Generate escreve a resposta. Ambos chamam o LLM.",
      tools: "Uma ferramenta roda via MCP e retorna uma observação.",
      generate:
        "Generate ≠ Reason: Generate escreve a resposta final, token a token. Reason apenas decide o que fazer. Ambos chamam o LLM.",
      respond: "A resposta pronta é transmitida de volta ao cliente.",
      persist: "A conversa é salva no banco para a próxima vez.",
    },
    narration: {
      request:
        "👉 Sua mensagem sai do navegador e viaja até a API por HTTPS — a requisição começa aqui.",
      memory:
        "👉 O backend lê os turnos recentes do banco — a memória de longo prazo do agente.",
      route: "👉 O agente lê a requisição e planeja sua rota antes de qualquer trabalho.",
      retrieve:
        "👉 O RAG transforma sua pergunta em vetor e busca os trechos mais relevantes no índice.",
      reason:
        "👉 O modelo raciocina sobre o contexto montado e decide se precisa de uma ferramenta.",
      tools: "👉 Uma ferramenta roda via MCP e devolve uma observação para o agente raciocinar.",
      generate: "👉 Com tudo em mãos, o modelo escreve a resposta um token por vez.",
      respond: "👉 A resposta pronta volta pela rede, em streaming, até o seu navegador.",
      persist: "👉 O turno é salvo no banco para que a próxima mensagem lembre desta.",
    },
  },
  readout: {
    answerReceived: "resposta recebida ✓",
    fastapiSse: "FastAPI · stream SSE",
    decisionAnswer: "decisão: responder",
    call: (names) => `chamar → ${names}`,
    routing: "roteando…",
    planned: (n) => `planejou ${n} passo${n === 1 ? "" : "s"}`,
    embedding: "incorporando consulta…",
    toolsReady: (n) => `${n} ferramentas prontas`,
    promptAssembled: "prompt montado",
    streaming: (n) => `transmitindo · ${n} tok`,
    tokens: (n) => `${n} tokens`,
    tokensCost: (tok, usd) => `${tok} tok · ${usd}`,
    cachedSaving: (tok, pct) => `${tok} em cache · −${pct}`,
    score: "score",
    reranked: (from, to) => `reordenado ${from}→${to}`,
    hybridFused: (n) => `BM25+vetorial · fundido ${n}`,
    buildingTree: "montando árvore…",
    navigating: "navegando…",
    selected: (n) => `${n} seç${n === 1 ? "ão" : "ões"} selecionada${n === 1 ? "" : "s"}`,
    dbQuerying: "consultando…",
    dbHistory: (n) => `histórico: ${n} linhas`,
    dbPersisted: "persistido ✓",
    ingestChunking: (n) => `dividindo · ${n}`,
    ingestEmbedding: (n) => `incorporando ${n} vec`,
    ingestStored: (n) => `${n} armazenados ✓`,
    storing: "armazenando…",
    storedObject: (name) => `${name} armazenado ✓`,
    simulatedError: "⚠️ falha simulada",
    retrying: (n, max) => `⚠️ retentativa ${n}/${max}`,
    circuitOpen: "⚠️ circuito aberto → fallback",
    netUnseen: "não detectado",
    wafClean: "limpo ✓",
    wafBlocked: (rule) => `⛔ bloqueado · ${rule}`,
  },
  node: {
    expand: "Expandir",
    collapse: "Recolher",
    openFull: "Abrir visão completa",
    openPipeline: "Abrir pipeline RAG",
    openRagless: "Abrir pipeline RAGLESS",
    openIngestion: "Abrir pipeline de ingestão",
    memory: "memória",
    latency: "latência",
    tip: "Clique numa estação para inspecionar · ⊕ para expandir",
    comingSoon: "Em breve",
  },
  scenario: {
    label: "Cenário",
    sendDisabled: "Este cenário é um preview — troque para Simples para enviar uma mensagem.",
  },
  track: {
    label: "Track",
    all: { name: "Tudo", blurb: "Mostra todos os nós que este degrau declara." },
    rag: {
      name: "Qualidade de RAG",
      blurb: "Data-plane de recuperação: chunking, metadados, rerank, híbrida, MMR, self-query…",
    },
    agent: {
      name: "Design do Agente",
      blurb: "Sofisticação do agente: DeepAgents → orquestração multi-agente.",
    },
    aiops: {
      name: "AI-Ops",
      blurb: "Rodar em produção: gateway, cache semântico, evals, observabilidade.",
    },
    security: {
      name: "Segurança & Confiança",
      blurb: "Guardrails, segredos, cadeia de suprimentos, sandbox de tools, identidade, jailbreak.",
    },
    scale: {
      name: "Escala & Infra",
      blurb: "Multi-réplica, estado compartilhado, workload identity.",
    },
  },
  builder: {
    label: "Montar",
    title: "Monte seu cenário",
    subtitle: "Ligue/desligue componentes — a maturidade é derivada do que você escolhe.",
    maturity: "Maturidade",
    runtimeHeading: "Runtime do agente",
    retrievalHeading: "Estratégia de recuperação",
    runtimeSoon: "em breve",
    zoneReal: "Executa",
    zonePreview: "Prévia · não roda",
    requiresRag: "requer Vector RAG",
    skeletonNote: "Frontend · Backend · Agente · LLM · Banco estão sempre ligados.",
    done: "Concluir",
    networkUnavailable:
      "Disponível apenas rodando o stack Docker completo (os containers de rede precisam estar no ar).",
    groups: { retrieval: "Recuperação & Dados", agent: "Agente", infra: "Infraestrutura", aiops: "AI-Ops" },
    retrievalStrategies: {
      vector: {
        name: "Vector RAG",
        blurb: "Gera embedding da consulta e busca no índice vetorial os chunks mais similares.",
      },
      ragless: {
        name: "RAGLESS",
        blurb:
          "Recuperação baseada em raciocínio (busca na árvore PageIndex) — sem embeddings, sem banco vetorial.",
      },
    },
    components: {
      mcp: { name: "MCP Tools", blurb: "Serviço de ferramentas (calculadora, hora, busca web…)." },
      rerank: { name: "Reranker", blurb: "Reordena os candidatos do RAG com um cross-encoder." },
      hybrid: { name: "Busca Híbrida", blurb: "Fusão BM25 + vetorial (RRF)." },
      network: {
        name: "Redes",
        blurb: "Cadeia de entrada real: DNS · CDN · WAF · TLS/LB · API-Gateway (só no Docker).",
      },
      summarization: { name: "Sumarização", blurb: "Compacta o contexto do agente (prévia)." },
      gateway: { name: "Gateway LLM", blurb: "Roteamento, fallback, orçamentos (prévia)." },
      guardrails: { name: "Guardrails", blurb: "Segurança de entrada/saída (prévia)." },
      cache: { name: "Cache Semântico", blurb: "Cache de prompt/embedding (prévia)." },
      eval: { name: "Eval Runner", blurb: "Pontua respostas contra um golden set (prévia)." },
      observability: { name: "Observabilidade", blurb: "Traces, tokens, custo (prévia)." },
    },
    runtimes: {
      react: { name: "ReAct", blurb: "O loop ReAct canônico e limitado (padrão)." },
      deepagents: { name: "DeepAgents", blurb: "Planner + sub-agente + sistema de arquivos virtual." },
      multiagent: {
        name: "Multiagente",
        blurb: "Orquestrador + sub-agentes especializados (prévia).",
      },
    },
    maturityNames: { simple: "Simples", intermediate: "Intermediário", advanced: "Avançado" },
  },
  agentDetail: {
    title: "Agent Context Window",
    subtitle: "A anatomia de um agente de IA: um cérebro (a LLM), memória e ferramentas",
    harness: "Agent Harness — o loop, as ferramentas, as camadas de prompt, a janela de contexto e a memória em volta da LLM.",
    back: "Voltar ao canvas",
    waiting: "Envie uma mensagem para ver o agente raciocinar, lembrar e agir.",
    reactLoop: "Loop ReAct",
    reason: "raciocinar",
    act: "agir · ferramenta",
    observe: "observar",
    answer: "responder",
    iterations: "iterações",
    lastDecision: "última decisão",
    workingMemory: "Memória de trabalho",
    workingMemoryHint: "o estado desta requisição — perdido ao terminar",
    userMessage: "mensagem do usuário",
    scratchpad: "rascunho de ferramentas (agir → observar)",
    noToolCalls: "nenhuma ferramenta chamada nesta execução",
    retrievalResult: (count, topSource, topScore) => {
      if (count === 0) return "nenhum trecho recuperado";
      const unit = count === 1 ? "trecho" : "trechos";
      if (!topSource) return `${count} ${unit}`;
      const score = typeof topScore === "number" ? ` · ${topScore.toFixed(2)}` : "";
      return `${count} ${unit} (topo: ${topSource}${score})`;
    },
    longTermMemory: "Memória de longo prazo",
    longTermMemoryHint: "sobrevive entre requisições",
    conversationHistory: "histórico de conversas · banco da app",
    vectorMemory: "memória vetorial · base de conhecimento RAG",
    noHistory: "sem conversas anteriores",
    contextWindow: "Janela de contexto",
    contextWindowHint: "o que de fato é montado e enviado ao LLM",
    systemPrompt: "prompt de sistema",
    retrievedContext: "contexto recuperado · RAG",
    toolResults: "resultados de ferramentas",
    history: "histórico",
    tools: "ferramentas disponíveis",
    approxTokens: (n) => `~${n} tokens`,
    brain: "Cérebro · a LLM",
    brainHint: "cada rodada de raciocínio é uma chamada ao modelo",
    senses: "Entrada · a mensagem",
    hands: "Ferramentas · as mãos do agente",
    speech: "Resposta · o que ele diz",
    noAnswerYet: "ainda sem resposta",
    rounds: "Rodadas da LLM",
    model: "modelo",
    promptTokens: "tokens de prompt",
    completionTokens: "tokens de resposta",
    totalTokens: "tokens totais",
    cost: "custo (US$)",
    approxProportion: "proporção aprox. do contexto",
    windowOf: (model, size) => `${model} · janela de ${size}`,
    usedInOut: (input, answer, max, pct) =>
      `entrada ${input} + resposta ${answer} / ${max} (${pct})`,
    estimatedByCategory: "Uso estimado por categoria",
    catSystemPrompt: "Prompt de sistema",
    catToolDefs: "Definições de ferramentas",
    catSkills: "Skills",
    catMemory: "Memória (longo prazo)",
    catRetrieved: "Contexto recuperado",
    catMessages: "Mensagens",
    catCompletion: "Resposta gerada",
    freeSpace: "Espaço livre",
    windowHint: "A janela de contexto finita do modelo — usado × livre neste turno.",
    estimatedNote: "A divisão por categoria é uma estimativa; usado/máx é o total real cobrado.",
    perCallNote: "Usado soma todas as rodadas de LLM neste turno (decidir + responder) — confere com Usage & Cost.",
    memoryGrowth: "Crescimento da memória",
    memoryGrowthHint: "O que carrega de cada turno anterior — só o texto visível.",
    growthRowLabel: (cumulative, total) => `${cumulative} / ${total}`,
    growthRowHint: (perTurn) => `Este turno acrescentou ${perTurn} tokens`,
    currentlyInWindow: (total) => `Atualmente na janela: ${total} tokens`,
    nextToFallOut: (limit, turn) => `Próxima a cair (limite ${limit}): T${turn}`,
    thisTurnNotStored: "(este turno — ainda não salvo)",
    memoryLesson:
      "Só sua mensagem + a resposta final do assistente carrega; raciocínio, tool calls e observações não.",
    plan: "Plano",
    planHint: "No degrau Intermediário o agente mantém uma lista de todos (write_todos), marcando os itens conforme avança.",
    planEmpty: "Sem plano nesta execução — o degrau Simples roda o loop ReAct limitado direto.",
    steps: "Etapas",
    stepsHint: "cada ação do DeepAgents nesta execução, em ordem",
    wroteFile: "escreveu arquivo",
    readFile: "leu arquivo",
    noSubagent: "nenhum subagente nesta execução",
    readMore: "Leia mais",
    readLess: "Mostrar menos",
    todoStatus: { pending: "pendente", in_progress: "em andamento", completed: "concluído" },
    delegated: "Delegado a subagente",
    delegateHint: "Uma subtarefa autocontida entregue a um subagente que roda com contexto e ferramentas próprios isolados, devolvendo só o resultado.",
    subagentUsed: "subagente usou",
    vfs: "Sistema de arquivos virtual",
    vfsHint: "Um rascunho em memória que o agente escreveu e releu entre passos, para o trabalho sobreviver além da janela de contexto.",
    vfsEmpty: "Nenhum arquivo escrito nesta execução.",
    wrote: "escreveu",
    read: "leu",
    verify: "Verificação",
    verifyHint: "Com o loop de verificação ligado, uma etapa crítica avalia a resposta rascunhada e pode devolvê-la para uma revisão limitada antes de confirmá-la.",
    verifyEmpty: "A verificação estava desligada nesta execução.",
    verifyPass: "aprovada",
    verifyRevise: "precisa de revisão",
    verifyReason: "Motivo",
    verifyRevised: "→ revisada e gerada de novo",
    verifyRounds: (n) => `${n} rodada${n === 1 ? "" : "s"} de revisão`,
  },
  citation: {
    sources: "fontes",
    fromTool: (tool) => `de ${tool}`,
    fromChunk: "de trecho recuperado",
    score: "score",
    none: "(sem fonte rastreável)",
    hint: "fundamentado numa fonte — passe o mouse no marcador",
  },
  diff: {
    compareTitle: "Comparar com o turno anterior",
    show: "comparar com o turno anterior",
    hide: "ocultar comparação",
    previous: "turno anterior",
    current: "este turno",
    grew: "cresceu",
    shrank: "encolheu",
    same: "inalterado",
    needsPrior: "Precisa de um turno anterior para comparar (este é o primeiro, ou o trace expirou).",
    totalDelta: "variação total",
  },
  abstain: {
    badge: "Ferramenta vazia — o agente absteve-se",
    hint: "Nenhum resultado para esta sub-consulta.",
  },
  learn: {
    rootTitle: "Como este app funciona",
    rootHint: "Um mapa de aprendizado — clique em qualquer tópico",
    whatItIs: "O que é",
    whyUsed: "Por que é usado aqui",
    inProject: "No projeto",
    howItWorks: "Como funciona",
    otherOptions: "Outras opções",
    studyLinks: "Para estudar",
    onCloud: (label) => `Em ${label}`,
    cloudGuideHint: (label) => `Serviços gerenciados para construir isto em ${label}`,
    moreIn: (title) => `Mais em ${title}`,
    topicsCount: (n) => `${n} tópicos`,
    learnStackTitle: "Aprenda a stack",
    learnStackBody:
      "Este mapa explica como o simulador é construído — sua arquitetura e camadas, os conceitos de software e Gen AI que utiliza (e por quê), a segurança em cada camada, a rede e a infraestrutura, e onde os dados ficam. Clique em qualquer nó para ler sobre ele.",
  },
  agentAnatomy: {
    openButton: "Configurar agente",
    headerLabel: "Agente",
    editIdentity: "Editar identidade do agente",
    dialogTitle: "Anatomia do agente",
    close: "Fechar",
    reset: "Restaurar padrão",
    defaultAgentName: "Agente",
    settingsRedirect:
      "O nome do agente, prompts, modelo e ferramentas agora ficam no diálogo Anatomia do agente — edições persistem por conversa.",
    openFromSettings: "Abrir Anatomia do agente",
    catalog: {
      label: "Agentes",
      loading: "Carregando…",
      empty: "Nenhum agente ainda.",
      more: "mais",
      draftHint: "Envie uma mensagem primeiro para trocar o agente desta conversa.",
      defaultSuffix: "padrão",
      newLabel: "Novo",
      newTooltip: "Clonar o agente atual em um novo",
      deleteLabel: "Apagar",
      deleteTooltip: "Apagar este agente",
      confirm:
        "Apagar este agente? Conversas que o usam voltarão para o agente padrão.",
      confirmYes: "Sim, apagar",
      confirmCancel: "Cancelar",
      lockedEditHint:
        "O agente desta conversa está travado, mas você ainda pode editar, criar ou apagar agentes aqui — as mudanças valem para o catálogo compartilhado.",
    },
    identity: {
      title: "Identidade",
      nameLabel: "Nome",
      namePlaceholder: "Agente",
      descLabel: "Descrição curta",
      descPlaceholder: "Em que este agente é especialista?",
      hint: "Comece pelo nome e por uma descrição curta — você pode mudar depois.",
    },
    system: {
      title: "Prompt de sistema",
      help:
        "Regras do ambiente que todo agente herda: segurança, honestidade, formato. Aplica-se antes do papel do agente.",
    },
    agent: {
      title: "Prompt do agente",
      help:
        "Quem é este agente e o que ele deve fazer. O papel e as instruções de uso de ferramentas específicas deste agente.",
    },
    provider: {
      title: "Provedor",
      help: "O provedor de LLM que este agente utiliza.",
      comingSoon: "Em breve",
      activeNote: "Padrão — provedor na nuvem, requer uma chave OpenAI.",
      previewNote: "Rode modelos localmente na sua própria máquina.",
      ollamaNote: "Roda no seu servidor Ollama local. Não precisa de chave da OpenAI.",
      serverUrlLabel: "URL do servidor Ollama",
      serverUrlPlaceholder: "http://localhost:11434",
      serverUrlHelp:
        "O backend conecta neste endereço. No Docker use host.docker.internal.",
      refresh: "Atualizar modelos",
      unreachable: "Não foi possível acessar o servidor Ollama. Ele está rodando?",
      noModels: "Nenhum modelo instalado. Rode `ollama pull <modelo>` primeiro.",
      loadingModels: "Listando modelos instalados…",
      modelLabel: "Modelo",
      keyLabel: "Chave de API da OpenAI",
      keyPlaceholder: "sk-…",
      keySavedHint: "Uma chave está salva. Informe outra para substituir.",
      keySave: "Salvar e testar",
      keyTesting: "Testando a conexão…",
      keyConnected: "Conectado — modelos carregados.",
      keyFailed: "Não foi possível autenticar. Verifique a chave.",
      keyEnvNote: "Usa a env OPENAI_API_KEY quando vazio.",
      vertexaiNote: "Roda no Google Cloud Vertex AI.",
      projectLabel: "ID do Projeto no GCP",
      projectPlaceholder: "ex: meu-projeto-gcp",
      locationLabel: "GCP Região/Localização",
      locationPlaceholder: "ex: us-central1",
      credentialsLabel: "Chave JSON de Conta de Serviço do Google",
      credentialsPlaceholder: '{ "type": "service_account", ... }',
      credentialsSavedHint: "As credenciais estão salvas. Informe um novo JSON para substituir.",
      credentialsTooltip: "Acesse console.cloud.google.com\n\nSelecione o seu projeto. Selecione-o no menu suspenso no topo da página.\n\nNo menu principal (as três linhas no canto superior esquerdo), vá em 'IAM e Administrador' e depois clique em 'Contas de serviço'.\n\nSelecione ou crie a conta:\nSe você já tem uma conta de serviço configurada para esse agente, clique no e-mail dela.\nSe não tem, clique em '+ Criar Conta de Serviço' no topo, dê um nome a ela e, no passo de permissões, adicione o papel 'aiplatform.user'\n\nCom a conta de serviço aberta, clique na aba 'Chaves'.\nClique em 'Adicionar Chave' e escolha 'Criar nova chave'.\nSelecione o tipo de chave JSON e clique em 'Criar'.",
      vertexaiSave: "Salvar e testar",
      vertexaiTesting: "Testando conexão...",
      vertexaiConnected: "Conectado — configurações salvas.",
      vertexaiFailed: "Falha no teste de conexão. Verifique as configurações e credenciais.",
    },
    model: {
      title: "Modelo",
      help: "O modelo de linguagem que esta conversa utilizará.",
      resolved: "Esta conversa usará:",
      useDefault: "Usar padrão",
    },
    tools: {
      title: "Ferramentas",
      help: "Quais ferramentas este agente pode escolher chamar.",
      countAll: "Todas habilitadas",
      countSome: (enabled, total) => `${enabled} de ${total} habilitadas`,
    },
    knowledge: {
      title: "Base de conhecimento",
      help: "Do que este agente pode recuperar informações em tempo de execução.",
      corpus: "Corpus (do sistema)",
      corpusLockHint: "Somente leitura — embutido no simulador.",
      uploads: "Seus uploads",
      uploadsEmpty: "Nenhum documento enviado ainda.",
      add: "Adicionar documento",
      remove: "Remover",
      loading: "Carregando…",
    },
    skills: {
      title: "Skills",
      sharedNote: "Skills são compartilhadas entre todas as conversas.",
    },
  },
  llmDetail: {
    title: "LLM · chamadas deste turno",
    subtitle: "Cada chamada ao modelo neste turno — prompt, latência e tokens.",
    back: "Visão geral",
    noCalls: "Nenhuma chamada ao LLM ainda — avance para ver as rodadas surgirem.",
    reasoningRound: (n) => `Rodada de raciocínio ${n}`,
    generation: "Geração da resposta",
    decisionCalledTools: "chamou ferramentas",
    decisionAnswered: "respondeu",
    latency: "latência",
    promptFor: "Prompt montado",
    response: "Resposta do LLM",
    decidedToAnswer: "Decidiu responder → veja a chamada de Geração da resposta abaixo.",
  },
  mcpDetail: {
    title: "MCP Tools — chamadas deste turno",
    subtitle: "JSON-RPC sobre o transporte MCP",
    back: "Diagrama",
    empty: "Nenhuma atividade de ferramenta neste turno ainda.",
  },
  ingestionDetail: {
    title: "Pipeline de ingestão — este upload",
    subtitle: "Armazenamento → dividir → tokenizar → embeddar → metadados → banco vetorial",
    back: "Diagrama",
    empty: "Nenhuma ingestão ainda — envie um documento para ver o pipeline.",
    objectStore: "Armazenamento de objetos",
    chunking: "Divisão em chunks",
    tokenization: "Tokenização",
    embedding: "Embedding",
    metadata: "Extração de metadados",
    store: "Salvar no banco vetorial",
    filename: "arquivo",
    objectKey: "chave do objeto",
    size: "tamanho",
    contentType: "tipo de conteúdo",
    strategy: "estratégia",
    chunks: "chunks",
    chunkSize: "tamanho do chunk",
    overlap: "sobreposição",
    totalChars: "total de caracteres",
    previews: "prévias dos chunks",
    chunkTableCaption: "chunks",
    colNum: "#",
    colChars: "caracteres",
    colTokens: "tokens",
    colSnippet: "prévia",
    selectChunkHint: "Selecione um chunk acima para ler seu texto completo.",
    fullChunkText: "texto completo do chunk",
    overlapLegend: "sobreposição com o chunk anterior",
    encoding: "encoding",
    totalTokens: "total de tokens",
    perChunkTokens: "tokens por chunk",
    model: "modelo",
    dimension: "dimensão",
    vectors: "vetores",
    vectorPreview: "prévia do vetor",
    docType: "tipo de doc",
    keys: "chaves de metadados",
    records: "registros",
    collection: "coleção",
    stored: "chunks salvos",
    totalInCollection: "total na coleção",
  },
  dbDetail: {
    title: "Banco da Aplicação — operações deste turno",
    subtitle: "Lê histórico · persiste conversa",
    back: "Diagrama",
    empty: "Nenhuma atividade de banco neste turno ainda.",
    rowId: "Id da linha",
    session: "Sessão",
    queriesHeading: "Comandos executados",
    rowsAffected: (n) => `→ ${n} linhas`,
  },
  backendDetail: {
    title: "Backend — ciclo da requisição",
    subtitle: "Borda FastAPI · requisição → resposta",
    back: "Diagrama",
    empty: "Nada recebido neste turno ainda.",
    received: "Requisição recebida",
    assembled: "Resposta montada",
    message: "Mensagem",
    delivery: "Entrega",
    session: "Sessão",
    answer: "Resposta",
    latency: "Latência",
    intro: "O backend orquestra o turno — coordena cada etapa abaixo.",
    stepReceive: "Payload recebido",
    stepHistory: "Carrega histórico",
    stepAgent: "Agente de IA invocado",
    stepPersist: "Persiste a conversa",
    stepRespond: "Resposta devolvida",
    hopReceive: "HTTPS · POST",
    hopRead: "SQL · leitura",
    hopInvoke: "em processo",
    hopWrite: "SQL · escrita",
    hopRespond: "HTTPS · SSE",
    rowsLoaded: "Linhas carregadas",
    reasoningRounds: "Rodadas de raciocínio",
    toolCalls: "Chamadas de ferramenta",
    retrievals: "Recuperações",
    agentHint: "Abra as visões completas do Agente · LLM · MCP para o detalhe interno.",
    pending: "aguardando…",
  },
  frontendDetail: {
    title: "Frontend — troca do navegador",
    subtitle: "Requisição POST · resposta transmitida",
    back: "Diagrama",
    empty: "Nada enviado neste turno ainda.",
  },
  networkDetail: {
    back: "Diagrama",
    in: "Entrada",
    out: "Saída",
    did: "O que fez",
    evidence: "Cabeçalhos encaminhados (verbatim)",
    reconstructedLog: "Log de acesso (reconstruído)",
    reconstructedLogHint: "Reconstruído a partir da evidência encaminhada — não é um tail real do container.",
    notMeasured: "não medido neste hop",
    requestLine: "Requisição",
    message: "Mensagem",
    noRequest: "Nenhuma requisição capturada até aqui ainda.",
    dns: {
      title: "DNS — resolução de nomes",
      subtitle: "host → endereço · TTL",
      empty: "Sem resolução DNS na frente desta requisição.",
      summary: "Resolveu o nome do serviço de origem para um endereço (uma consulta real ao CoreDNS) antes de qualquer conexão.",
      inDesc: "Um nome de serviço a resolver.",
      host: "Host consultado",
      address: "Endereço resolvido",
      ttl: "TTL (s)",
      notResolved: "O CoreDNS não retornou endereço para este nome (cadeia ausente ou consulta falhou).",
    },
    cdn: {
      title: "CDN / Cache — cache de borda",
      subtitle: "requisição → HIT / MISS / BYPASS",
      empty: "Sem cache de borda na frente desta requisição.",
      summary: "Consultou o cache de borda — um HIT é servido da borda; a API de chat não-cacheável é um BYPASS, passada direto à origem.",
      inDesc: "A requisição que chega para a app.",
      cache: "Cache",
      age: "Idade (s)",
      server: "Servidor de borda",
      hits: "Hits de cache",
      reason: "Motivo",
    },
    waf: {
      title: "WAF — firewall de aplicação web",
      subtitle: "requisição → veredito",
      empty: "Sem WAF na frente desta requisição.",
      summary: "Inspecionou a requisição contra o conjunto de regras OWASP e a deixou passar (ou a bloqueou com 403).",
      inDesc: "A requisição bruta a inspecionar.",
      status: "Veredito",
      rules: "Regras casadas",
      anomaly: "Pontuação de anomalia",
      engine: "Motor",
      threshold: "Limite de anomalia",
      paranoia: "Nível de paranoia",
      anomalyNote: "A pontuação de anomalia por requisição não é encaminhada pelo ModSecurity v3 — só o veredito e a configuração chegam à app.",
      http: "Status HTTP",
      blockedNote: "Barrado aqui pelo WAF — a requisição foi rejeitada com 403 e não chegou ao backend.",
      blockedWhy: "O payload casou com uma assinatura do OWASP Core Rule Set (provável padrão de SQLi / XSS / traversal). O id exato da regra fica no log de auditoria do WAF e não volta no 403.",
    },
    lb: {
      title: "TLS / Balanceador — proxy reverso",
      subtitle: "HTTPS → upstream",
      empty: "Sem terminador TLS / balanceador na frente desta requisição.",
      summary: "Terminou o TLS (o único ponto de decriptação) e balanceou a requisição para um backend, adicionando headers X-Forwarded-*.",
      role: "Proxy reverso · termina TLS · encaminha ao upstream",
      inDesc: "HTTPS criptografado do cliente.",
      tls: "Versão TLS",
      scheme: "Esquema",
      upstream: "Upstream",
      server: "Balanceador",
      poolSize: "Backends no pool",
      algorithm: "Algoritmo",
      backend: "Backend escolhido",
    },
    apigw: {
      title: "API Gateway — roteamento e cotas",
      subtitle: "rota → backend",
      empty: "Sem API gateway na frente desta requisição.",
      summary: "Casou a rota, aplicou os rate limits e encaminhou a chamada ao backend.",
      inDesc: "A chamada de API roteada.",
      route: "Rota casada",
      rateLimit: "Rate-limit restante",
      upstreamLatency: "Latência do upstream (ms)",
      gateway: "Gateway",
      policy: "Política aplicada",
    },
  },
  ragDetail: {
    title: "Pipeline RAG",
    subtitle: "Chunking → Embedding → Recuperação → Reranking",
    back: "← Canvas",
    empty: "Envie uma mensagem para ver o pipeline RAG rodar.",
    chunking: "Chunking",
    chunkingBlurb:
      "Os documentos são divididos em chunks sobrepostos offline, na ingestão — para a recuperação ser rápida na consulta.",
    embedding: "Embedding",
    embeddingBlurb:
      "A consulta é incorporada em um vetor com o mesmo modelo usado para indexar o corpus.",
    retrieval: "Recuperação",
    retrievalBlurb:
      "Uma busca por vizinhos mais próximos retorna os chunks candidatos mais próximos por similaridade de cosseno.",
    reranking: "Reranking",
    rerankingBlurb:
      "Um cross-encoder local reordena o pool de candidatos para os trechos mais relevantes liderarem, depois corta para o top-k.",
    rerankInactive: "O reranking roda apenas no nível Intermediário — troque de cenário para vê-lo.",
    hybrid: "Híbrida",
    hybridBlurb:
      "Uma busca por palavra-chave (BM25) roda ao lado da busca vetorial e as duas listas ranqueadas são fundidas com Reciprocal Rank Fusion (RRF) — pegando correspondências exatas de termos raros que os embeddings densos borram.",
    hybridInactive:
      "Ative a Busca Híbrida (Vector RAG) no popover Build para fundir uma lane BM25.",
    hybridFusedLabel: "fundido",
    laneVector: "vetorial",
    laneBm25: "BM25",
    rrfFormula: "escore RRF = Σ 1 / (k + posição) sobre as lanes que ranquearam o trecho",
    fusionTable: "Fusão (Vetorial | BM25 | → RRF)",
    colSource: "fonte",
    hybridNote:
      "A fusão por posição dispensa escala de escore comum: um trecho bem ranqueado em qualquer lane sobe; ↑ marca quem o BM25 elevou acima da posição vetorial.",
    augmented: "Augmented",
    augmentedBlurb:
      'Os trechos recuperados são montados no contexto do prompt enviado à LLM — o "A" de RAG.',
    offline: "offline · ingestão",
    toLlm: "→ LLM",
    close: "Fechar",
    inputLabel: "Texto de entrada",
    tokensLabel: "Tokens",
    vectorLabel: (shown, dim) => `Vetor de embedding (primeiras ${shown} de ${dim} dims)`,
    tokenizerNote: "tiktoken · o200k_base",
    vectorSearch: "Busca vetorial · similaridade de cosseno",
    cosineFormula: "cos(θ) = (q·d)/(|q||d|) = similaridade = 1 − distância",
    angleLabel: "ângulo",
    rerankPoolNote: (fetchK, k) => `cross-encoder repontuou ${fetchK} candidatos → manteve top ${k}`,
    contextInjected: "Este texto é injetado no contexto do prompt enviado à LLM.",
    chunkConfig: "≈900 chars · 150 de sobreposição",
    showingOf: (shown, total) => `mostrando ${shown} de ${total}`,
    clickHint: "Clique numa etapa para inspecioná-la",
    noRetrieval: "Este turno não usou a base de conhecimento — o agente respondeu sem recuperação.",
    zoomHint: "role para dar zoom · arraste para mover",
    resetView: "resetar",
    chunkNote:
      "Cada ponto é um chunk (≈900 chars) embeddado como um único vetor — o rótulo é o arquivo de origem, então vários chunks podem compartilhar o mesmo arquivo.",
    vizNote:
      "Os vetores têm comprimento unitário (o cosseno ignora a magnitude); só o ângulo até q importa — quanto maior o ângulo, menos similar. Uma ilustração 2-D de um espaço de 1536-D.",
    legend: "q = o embedding da sua pergunta · vetores coloridos = chunks candidatos (verde = mais próximo)",
    queryLabel: "q · query",
    keptNote: (candidates, kept) =>
      `${candidates} candidatos encontrados — o reranker corta para os top ${kept} no prompt.`,
    thresholdLabel: "limiar de score",
    thresholdOff: "0.00 · desligado",
    thresholdOffHint:
      "Sem filtro de score — o top-k é mantido independente da relevância. Suba o limiar de score do rerank (Settings → Experiment) para descartar chunks de score baixo como este.",
    executionOf: (k, n) => `recuperação ${k} / ${n}`,
    prevExecution: "Recuperação anterior",
    nextExecution: "Próxima recuperação",
    quality: "Qualidade da recuperação",
    qualityPrecision: "Precisão@k",
    qualityRecall: "Revocação@k",
    qualityMrr: "MRR",
    qualityRelevant: "relevante",
    qualityNotRelevant: "não relevante",
    qualityMissed: "Trechos relevantes não recuperados",
    qualityNoGroundTruth:
      "Sem gabarito para esta pergunta — as métricas precisam de uma pergunta de benchmark rotulada.",
    qualityTryBenchmark: "Experimente uma pergunta de benchmark para medir a recuperação.",
    chunkPlayLoading: "Chunkando a amostra…",
    chunkPlayWhy:
      "Melhores limites = melhor recuperação — o chunking está a montante de toda métrica.",
    chunkCompareWithFixed: "Tamanho fixo",
    chunkMidSentence: "corta no meio da frase",
    chunkStratFixed: "Tamanho fixo — divide por comprimento; pode cortar uma frase ao meio.",
    chunkStratRecursive: "Recursivo — divide por parágrafos/frases, com sobreposição.",
    chunkStratSemantic: "Semântico — inicia um novo trecho quando o tópico muda.",
    chunkStratAgentic: "Agêntico — um LLM segmenta o documento em unidades coerentes.",
    metaWhyRetrieved: "Por que foi recuperado",
  },
  pageindexDetail: {
    title: "Pipeline RAGLESS",
    subtitle: "Árvore do documento → Navegar → Selecionar → Aumentado",
    empty: "Envie uma mensagem para ver o pipeline RAGLESS (PageIndex) rodar.",
    noRetrieval: "Este turno não usou a base de conhecimento, então o PageIndex não navegou.",
    clickHint: "Clique em uma etapa para detalhar.",
    close: "Fechar",
    tree: "Árvore do documento",
    treeBlurb:
      "Um sumário hierárquico é montado a partir dos headings dos documentos — o índice que o PageIndex navega (sem embeddings).",
    navigate: "Navegar",
    navigateBlurb:
      "A LLM raciocina sobre a árvore e escolhe a(s) seção(ões) relevante(s) — um caminho explicável, não um escore de cosseno.",
    select: "Selecionar",
    selectBlurb: "O texto das seções escolhidas vira o contexto de fundamentação.",
    augmented: "Aumentado",
    augmentedBlurb:
      'As seções selecionadas são montadas no contexto do prompt enviado à LLM — o "A" de RAG.',
    toLlm: "→ LLM",
    reasoningLabel: "Raciocínio",
    selectedLabel: "Seções selecionadas",
    navigatedTo: "Navegou até",
    queryLabel: "Consulta",
    nodesLabel: (nodes, leaves) => `${nodes} nós · ${leaves} seções`,
  },
};

export const UI: Record<Lang, Strings> = { en, pt };
