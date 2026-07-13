// 041-settings-page · 🧪 Experiment section.
// 043-persisted-agent: the system-prompt textarea + tools toggle + Reset
// button all moved into the Agent Anatomy dialog (where they edit the
// persisted agent row directly). What stays here are the **per-run**
// experiment knobs that aren't part of the agent's identity: RAG top-k and
// the 017 simulate-failure selector. A small redirect block explains where
// the other controls live now.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useAgentAnatomy } from "../lib/agentAnatomy";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { useChat } from "../store/useChat";

export function SettingsExperiment() {
  const t = useT();
  const ex = t.settings.experiment;
  const aa = t.agentAnatomy;

  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);
  const exp_ = useExperiment.getState();
  const openAnatomy = useAgentAnatomy((s) => s.openDialog);

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    if (config) return;
    getConfig().then(setConfig).catch(() => {});
  }, [config]);

  const topK = exp.topK ?? config?.default_top_k ?? 4;
  const rerankThreshold = exp.rerankThreshold ?? config?.default_rerank_threshold ?? 0;
  const dirty = exp.topK !== null || (exp.rerankThreshold ?? 0) > 0 || exp.verify;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
          <span aria-hidden>🧪</span>
          {ex.title}
        </div>
        {dirty && (
          <button
            onClick={() => exp_.reset(conv)}
            className="rounded-full border border-[var(--color-line)] px-2 py-px text-[10px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          >
            {ex.reset}
          </button>
        )}
      </div>

      {/* 043-persisted-agent: pointer to the dialog where prompts/model/tools
          now live. The Settings page keeps only the per-run knobs below. */}
      <div className="mb-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2">
        <p className="mb-1.5 text-[11px] leading-snug text-[var(--color-muted)]">
          {aa.settingsRedirect}
        </p>
        <button
          onClick={() => openAnatomy()}
          data-testid="settings-open-agent-anatomy"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-panel)]"
        >
          ⚙️ {aa.openFromSettings}
        </button>
      </div>

      {/* top-k */}
      <div className="mt-3 mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--color-ink)]">
        <span>{ex.topK}</span>
        <span className="font-mono text-[var(--color-indigo-soft)]">{topK}</span>
      </div>
      <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">{ex.topKHint}</p>
      <input
        type="range"
        aria-label={ex.topK}
        min={config?.top_k_min ?? 1}
        max={config?.top_k_max ?? 8}
        value={topK}
        disabled={!config}
        onChange={(e) => exp_.setTopK(conv, Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />

      {/* 055-rerank-score-threshold — min rerank score (Intermediate rung). */}
      <div className="mt-3 mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--color-ink)]">
        <span>{ex.rerankThreshold}</span>
        <span className="font-mono text-[var(--color-indigo-soft)]">{rerankThreshold.toFixed(2)}</span>
      </div>
      <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">
        {ex.rerankThresholdHint}
      </p>
      <input
        type="range"
        aria-label={ex.rerankThreshold}
        min={0}
        max={1}
        step={config?.rerank_threshold_step ?? 0.05}
        value={rerankThreshold}
        disabled={!config}
        onChange={(e) => exp_.setRerankThreshold(conv, Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />

      {/* 098-verify-reflection-loop — the verification (reflection) loop toggle, a
          per-run knob (loop engineering). Off by default ⇒ today's run byte-for-byte. */}
      <label className="mt-3 flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={exp.verify}
          onChange={(e) => exp_.setVerify(conv, e.target.checked)}
          className="mt-0.5 accent-[var(--color-accent)]"
        />
        <span>
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{ex.verify}</span>
          <span className="mt-0.5 block text-[10.5px] leading-snug text-[var(--color-muted)]">
            {ex.verifyHint}
          </span>
        </span>
      </label>

      {/* 061-scenario-builder — RAGLESS moved to the header "Build" palette (it's an
          architecture component now, not a per-run knob). */}

      {/* The "Simulate failure" selector (017) was removed from the UI — the
          failure-injection machinery (state, backend, treatments) stays in
          place, just no longer exposed as a per-run knob here. */}
    </section>
  );
}
