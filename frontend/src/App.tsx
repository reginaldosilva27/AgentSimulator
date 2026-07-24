import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AgentAnatomyDialog } from "./components/AgentAnatomyDialog";
import { AgentConfigToggle } from "./components/AgentConfigToggle";
import { AgentDetail } from "./components/AgentDetail";
import { BackendDetail } from "./components/BackendDetail";
import { ChatPanel } from "./components/ChatPanel";
import { DatabaseDetail } from "./components/DatabaseDetail";
import { CloudToggle } from "./components/CloudToggle";
import { ConfigToggle } from "./components/ConfigToggle";
import { DemoBanner } from "./components/DemoBanner";
import { FlowCanvas } from "./components/FlowCanvas";
import { FrontendDetail } from "./components/FrontendDetail";
import { IngestionPipelinePanel } from "./components/IngestionPipelinePanel";
import { McpDetail } from "./components/McpDetail";
import { NetworkApplianceDetail } from "./components/NetworkApplianceDetail";
import { PageIndexPipelinePanel } from "./components/PageIndexPipelinePanel";
import { RagPipelinePanel } from "./components/RagPipelinePanel";
import {
  BackIcon,
  BookIcon,
  ChatIcon,
  InspectorIcon,
  Logo,
  WarnIcon,
} from "./components/icons";
import { InspectorPanel } from "./components/InspectorPanel";
import { LanguageToggle } from "./components/LanguageToggle";
import { LensOverlay } from "./components/LensOverlay";
import { LensToggle } from "./components/LensToggle";
import { LLMDetail } from "./components/LLMDetail";
import { MobileShell } from "./components/MobileShell";
import { ScenarioBuilder } from "./components/ScenarioBuilder";
import { ThemeToggle } from "./components/ThemeToggle";
import { Timeline } from "./components/Timeline";
import { TourCaption } from "./components/TourCaption";
import { ArenaPage } from "./arena/ArenaPage";
import { useT } from "./i18n";
import { LearnPage } from "./learn/LearnPage";
import { pendingBubble } from "./lib/chatStatus";
import { deriveView } from "./lib/derive";
import { isDemo } from "./lib/demo";
import { healthBanner, useHealth } from "./lib/health";
import { useActiveModel } from "./lib/activeModel";
import { useIsMobile } from "./lib/useIsMobile";
import { markOnboarded, shouldAutoOnboard } from "./lib/onboarding";
import type { Page } from "./lib/page";
import { useLearnTarget } from "./lib/learnTarget";
import { activePhase } from "./lib/phases";
import { currentStep, isTouring } from "./lib/tour";
import { SettingsPage } from "./settings/SettingsPage";
import { useSimulator } from "./store/useSimulator";

// Thin vertical rule that separates the header into zones (brand · view ·
// preferences · nav) so the controls read as distinct groups, not one long row.
function Divider() {
  return <span className="h-5 w-px shrink-0 bg-[var(--color-line)]" aria-hidden />;
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.47c.52.1.71-.23.71-.5v-1.76c-2.92.64-3.54-1.4-3.54-1.4-.48-1.22-1.16-1.54-1.16-1.54-.95-.65.07-.64.07-.64 1.05.07 1.6 1.08 1.6 1.08.94 1.6 2.45 1.14 3.05.87.1-.68.37-1.14.66-1.4-2.33-.27-4.78-1.17-4.78-5.18 0-1.15.41-2.08 1.08-2.81-.11-.27-.47-1.34.1-2.79 0 0 .88-.28 2.88 1.07a9.96 9.96 0 0 1 5.24 0c2-1.35 2.88-1.07 2.88-1.07.57 1.45.21 2.52.1 2.79.67.73 1.08 1.66 1.08 2.81 0 4.02-2.45 4.9-4.79 5.16.38.33.71.97.71 1.96v2.9c0 .28.19.61.72.5A10.5 10.5 0 0 0 12 1.5z" />
    </svg>
  );
}

// 100-arena-capacity-sandbox — the Arena nav glyph (stacked architecture blocks).
function ArenaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
      <path d="M6.5 10v2.5h11V10M12 12.5V14" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ left, className }: { left: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transform: left ? undefined : "rotate(180deg)" }}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// A side panel that collapses to a ~44px rail (013-canvas-space-disclosure). The
// children stay MOUNTED when collapsed (hidden via CSS) — unmounting ChatPanel
// would re-run its init() → openSession() → useSimulator.reset(), wiping the live
// canvas trace. The rail shows the panel icon + an inward chevron to re-open;
// when expanded, an edge handle (overhanging the inner border) collapses it.
function SidePanel({
  side,
  collapsed,
  onToggle,
  icon,
  collapseLabel,
  expandLabel,
  width,
  children,
}: {
  side: "left" | "right";
  collapsed: boolean;
  onToggle: () => void;
  icon: ReactNode;
  collapseLabel: string;
  expandLabel: string;
  width: number;
  children: ReactNode;
}) {
  const borderClass = side === "left" ? "border-r" : "border-l";
  return (
    <aside
      className={`relative shrink-0 ${borderClass} border-[var(--color-line)] bg-[var(--color-panel)]`}
      style={{ width: collapsed ? 44 : width }}
    >
      <div className={collapsed ? "hidden" : "h-full"}>{children}</div>

      {collapsed ? (
        <div className="flex h-full flex-col items-center gap-1.5 py-3">
          <button
            onClick={onToggle}
            title={expandLabel}
            aria-label={expandLabel}
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
          >
            {icon}
          </button>
          <button
            onClick={onToggle}
            aria-label={expandLabel}
            className="grid h-7 w-7 place-items-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-sky-soft)]"
          >
            <Chevron left={side === "right"} className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onToggle}
          title={collapseLabel}
          aria-label={collapseLabel}
          className={`absolute top-1/2 z-10 grid h-12 w-5 -translate-y-1/2 place-items-center rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-muted)] shadow-sm transition hover:text-[var(--color-sky-soft)] ${
            side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"
          }`}
        >
          <Chevron left={side === "left"} className="h-4 w-4" />
        </button>
      )}
    </aside>
  );
}

export default function App() {
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const selected = useSimulator((s) => s.selected);
  const select = useSimulator((s) => s.select);
  const detail = useSimulator((s) => s.detail);
  const closeDetail = useSimulator((s) => s.closeDetail);
  const chatCollapsed = useSimulator((s) => s.chatCollapsed);
  const inspectorCollapsed = useSimulator((s) => s.inspectorCollapsed);
  const toggleChat = useSimulator((s) => s.toggleChat);
  const toggleInspector = useSimulator((s) => s.toggleInspector);
  const tour = useSimulator((s) => s.tour);
  const startTour = useSimulator((s) => s.startTour);

  // 014-tour-scripted: the guided tour emphasizes the station it narrates. Feed
  // its current station into the projection so the canvas leads the eye to it;
  // null when no tour is running (deriveView then emphasizes nothing).
  const tourStation = isTouring(tour) ? (currentStep(tour)?.station ?? null) : null;
  // 093-waf-block-visualization — a WAF block has no trace, so its outcome is held
  // in the store and threaded into the projection (lights the path up to the WAF).
  const blocked = useSimulator((s) => s.blocked);
  const view = useMemo(
    () => deriveView(events, cursor, tourStation, blocked),
    [events, cursor, tourStation, blocked],
  );
  // What the live chat bubble shows, projected from the same paced cursor as the
  // canvas: a stage status until the answer exists, then the answer itself (012).
  const bubble = useMemo(() => pendingBubble(view, activePhase(events, cursor)), [view, events, cursor]);
  const t = useT();

  // 063-mobile-demo-layout — the phone-only single-pane layout is gated on the
  // DEMO build AND a phone-width viewport, together. The live build (isDemo()
  // false) and the demo at desktop width keep the three-column layout, unchanged.
  const isMobile = useIsMobile();
  const mobileDemo = isDemo() && isMobile;

  // 041-settings-page: the page state grew from 2 to 3. The ⚙️ Config control
  // now navigates to a dedicated page (`<SettingsPage />`) instead of opening a
  // popover; only one of {sim, learn, settings} is mounted at a time.
  const [page, setPage] = useState<Page>("sim");
  const healthStatus = useHealth((s) => s.status);
  const hasKey = useHealth((s) => s.hasKey);
  const loadHealth = useHealth((s) => s.load);
  // 074 follow-up: the header badge shows the SELECTED agent's model (e.g. an
  // Ollama model), not the server default — falls back to the health default.
  const { model: activeModel } = useActiveModel();
  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // 037-first-visit-onboarding — on the very first visit, auto-start the guided
  // tour (it loads the bundled canned trace, so it works with no backend) so a
  // newcomer sees the journey unprompted. Mark onboarded immediately, so a refresh
  // or a new conversation never re-triggers it; the first-visit Inspector collapse
  // is seeded in the store from the same flag.
  useEffect(() => {
    if (shouldAutoOnboard()) {
      markOnboarded();
      startTour();
    }
  }, [startTour]);

  // 121-arena-learn-links — a "Learn more" link / concept chip in the Arena sets a
  // pending topic; flip to the Learn page so LearnPage can consume + open it.
  const pendingTopic = useLearnTarget((s) => s.pendingTopic);
  useEffect(() => {
    if (pendingTopic) setPage("learn");
  }, [pendingTopic]);

  const banner = healthBanner(healthStatus, hasKey);

  // The canvas + its overlays, shared by the desktop (<main>) and the mobile
  // (Diagram pane) layouts so they never diverge. The ReactFlowProvider gives the
  // tour balloon + RAG/PageIndex panels the live viewport transform (014/054/056);
  // AgentDetail (the Agent drill-in) is a sibling overlay composed from trace events.
  const canvasContent = (
    <>
      <ReactFlowProvider>
        <FlowCanvas view={view} selected={selected} onSelect={select} />
        <TourCaption />
        {detail === "rag" && <RagPipelinePanel />}
        {detail === "pageindex" && <PageIndexPipelinePanel />}
      </ReactFlowProvider>
      {/* 096-harness-loop-lens — the lens legend + Loop readout, over the canvas. */}
      <LensOverlay onLearnMore={() => setPage("learn")} />
      {detail === "agent" && <AgentDetail view={view} onClose={closeDetail} />}
      {detail === "llm" && <LLMDetail onClose={closeDetail} />}
      {/* 076-station-full-views — drill-ins for the four remaining real stations. */}
      {detail === "mcp" && <McpDetail onClose={closeDetail} />}
      {detail === "database" && <DatabaseDetail onClose={closeDetail} />}
      {detail === "backend" && <BackendDetail onClose={closeDetail} />}
      {detail === "frontend" && <FrontendDetail onClose={closeDetail} />}
      {/* 080-ingestion-pipeline-merge — the merged ingestion node's phase walk. */}
      {detail === "ingestion" && <IngestionPipelinePanel onClose={closeDetail} />}
      {/* 089-network-station-detail — In → Out drill-in per ingress appliance. */}
      {detail === "dns" && <NetworkApplianceDetail kind="dns" onClose={closeDetail} />}
      {detail === "cdn" && <NetworkApplianceDetail kind="cdn" onClose={closeDetail} />}
      {detail === "waf" && <NetworkApplianceDetail kind="waf" onClose={closeDetail} />}
      {detail === "lb" && <NetworkApplianceDetail kind="lb" onClose={closeDetail} />}
      {detail === "apigw" && <NetworkApplianceDetail kind="apigw" onClose={closeDetail} />}
    </>
  );

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      {/* 058-online-demo-mode: only renders in the backend-less showcase build. */}
      <DemoBanner />
      <header
        className={`flex items-center gap-2.5 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_55%,transparent)] px-4 py-2.5 backdrop-blur-sm ${
          mobileDemo ? "flex-wrap" : ""
        }`}
      >
        {/* Brand — the group shrinks tagline-first (it truncates) so a longer PT
            string never pushes the right-hand controls off-screen; the title
            itself never truncates (whitespace-nowrap defines the min width).
            The logomark sits in a soft halo so it reads as the masthead's
            "centerpiece" without competing with the wordmark's weight. */}
        <a
          href={import.meta.env.BASE_URL}
          className="group flex min-w-0 shrink items-center gap-2.5 text-[var(--color-ink)] no-underline transition"
        >
          <span
            className="relative grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-sky-soft)] transition group-hover:border-[var(--color-sky)] group-hover:text-[var(--color-sky)]"
            aria-hidden
          >
            <Logo className="h-[22px] w-[22px]" />
          </span>
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-1.5 truncate text-[13.5px] font-semibold leading-tight tracking-tight text-[var(--color-ink)]">
              <span>AI Agent</span>
              <span className="text-[var(--color-sky-soft)]">Simulator</span>
            </h1>
            <p className="hidden truncate text-[10.5px] leading-tight tracking-wide text-[var(--color-muted)] xl:block">
              {t.app.tagline}
            </p>
          </div>
        </a>

        <Divider />

        {/* 061-scenario-builder — the à-la-carte component palette (popover) replaces
            the maturity-ladder segmented control + the track switcher. */}
        <ScenarioBuilder />
        {/* 096-harness-loop-lens — the Harness ⇄ Loop lens, next to Build. */}
        <LensToggle />
        <div className="hidden shrink-0 xl:flex">
          <CloudToggle />
        </div>

        {/* Push preferences + nav to the right; collapses to nothing when tight. */}
        <div className="min-w-1 flex-1" />

        {/* Preferences + architecture options. The "Configure agent" toggle
            opens the agent-anatomy dialog directly — it lives next to ⚙ Config
            because both shape "what this run does", but stays a distinct
            affordance (different icon, different scope) so it doesn't read as
            a sub-option of platform settings. */}
        <ThemeToggle />
        <LanguageToggle />
        {/* 058-online-demo-mode: the agent is read-only in the demo build (no
            backend to persist edits), so hide its configure affordance. */}
        {!isDemo() && <AgentConfigToggle />}
        <ConfigToggle page={page} setPage={setPage} />

        <Divider />

        {/* Navigation + status. */}
        {/* 100-arena-capacity-sandbox — the Arena toggle sits beside Learn (same
            mutual-exclusion pattern: from any page it opens Arena, and from
            Arena it returns to the Simulator). */}
        <button
          onClick={() => setPage(page === "arena" ? "sim" : "arena")}
          aria-pressed={page === "arena"}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
          style={{
            borderColor: page === "arena" ? "var(--color-sky)" : "var(--color-line)",
            color: page === "arena" ? "var(--color-sky-soft)" : "var(--color-text-soft)",
          }}
        >
          {page === "arena" ? (
            <BackIcon className="h-3.5 w-3.5" />
          ) : (
            <ArenaIcon className="h-3.5 w-3.5" />
          )}
          <span className="hidden lg:inline">{page === "arena" ? t.app.simulator : t.arena.nav}</span>
        </button>
        {/* Learn ↔ Sim toggle. 041-settings-page tightens this: clicking from
            `settings` jumps straight to `learn` (mutual exclusion), not back
            to sim. Symmetric for ConfigToggle. */}
        <button
          onClick={() => setPage(page === "learn" ? "sim" : "learn")}
          aria-pressed={page === "learn"}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
          style={{
            borderColor: page === "learn" ? "var(--color-sky)" : "var(--color-line)",
            color: page === "learn" ? "var(--color-sky-soft)" : "var(--color-text-soft)",
          }}
        >
          {page === "learn" ? (
            <BackIcon className="h-3.5 w-3.5" />
          ) : (
            <BookIcon className="h-3.5 w-3.5" />
          )}
          <span className="hidden lg:inline">
            {page === "learn" ? t.app.simulator : t.app.learn}
          </span>
        </button>
        {healthStatus === "ok" && activeModel && (
          <span
            className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-[3px] text-[10.5px] text-[var(--color-muted)] xl:inline-flex"
            title={t.app.liveTitle}
          >
            <span
              className="relative grid h-2 w-2 shrink-0 place-items-center"
              aria-hidden
            >
              <span className="absolute h-2 w-2 animate-ping rounded-full bg-[var(--color-ok)] opacity-60" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--color-ok)]" />
            </span>
            <span className="font-mono tracking-tight text-[var(--color-text-soft)]">{activeModel}</span>
          </span>
        )}
        <a
          href="https://github.com/reginaldosilva27/AgentSimulator"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
          title="GitHub"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
        >
          <GitHubIcon className="h-3.5 w-3.5" />
        </a>
      </header>

      {banner && (
        <div
          role="alert"
          className="flex items-center justify-center gap-2 border-b border-[color-mix(in_srgb,var(--color-rose)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-rose)_12%,transparent)] px-4 py-2 text-center text-[12px] text-[var(--color-rose-soft)]"
        >
          <WarnIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{banner === "offline" ? t.app.offline : t.app.noKey}</span>
        </div>
      )}

      {/* The "Configure agent" dialog now lives at the App root (not under
          <main>) so the header button can open it from Sim / Learn / Settings
          alike. The dialog is `position: fixed` and renders null when closed,
          so the mount point is purely about availability, not layout. */}
      <AgentAnatomyDialog />

      {page === "settings" ? (
        <SettingsPage />
      ) : page === "arena" ? (
        <ArenaPage />
      ) : page === "learn" ? (
        <LearnPage />
      ) : mobileDemo ? (
        // 063-mobile-demo-layout — same panes, single-pane tabbed shell. The
        // ReactFlow-anchored canvas content is shared with the desktop branch
        // below (see `canvasContent`) so the two layouts never diverge.
        <MobileShell
          chat={<ChatPanel bubble={bubble} />}
          canvas={canvasContent}
          inspector={<InspectorPanel selected={selected} view={view} onSelect={select} />}
          timeline={<Timeline />}
        />
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
            <SidePanel
              side="left"
              collapsed={chatCollapsed}
              onToggle={toggleChat}
              icon={<ChatIcon className="h-4 w-4" />}
              collapseLabel={t.node.collapse}
              expandLabel={t.node.expand}
              width={340}
            >
              <ChatPanel bubble={bubble} />
            </SidePanel>

            <main className="relative min-w-0 flex-1">{canvasContent}</main>

            <SidePanel
              side="right"
              collapsed={inspectorCollapsed}
              onToggle={toggleInspector}
              icon={<InspectorIcon className="h-4 w-4" />}
              collapseLabel={t.node.collapse}
              expandLabel={t.node.expand}
              width={372}
            >
              <InspectorPanel selected={selected} view={view} onSelect={select} />
            </SidePanel>
          </div>

          <Timeline />
        </>
      )}
    </div>
  );
}
