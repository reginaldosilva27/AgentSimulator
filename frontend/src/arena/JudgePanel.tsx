// 133-arena-ai-judge — the critique panel (the "Review" tab).
//
// Three labelled parts, and one non-negotiable piece of framing: the arithmetic
// verdict stays the authority on whether the objectives are met, and this panel is
// a language model's OPINION about quality. The two are kept visually and verbally
// distinct, because conflating them is exactly the confusion the project's honesty
// rule exists to prevent.
//
// Unavailability is always explained, never silent: no provider configured, the
// backend-less demo build, or the rate limit each get their own sentence.

import { useCallback, useMemo, useRef, useState } from "react";

import { useLang, useT } from "../i18n";
import { isDemo } from "../lib/demo";
import { JudgeError, requestJudgement, type JudgeCritique } from "./judge";
import { evaluateObjectives, measureDesign } from "./slo";
import { useArena } from "./store";

export function JudgePanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const callShape = useArena((s) => s.callShape);
  const faults = useArena((s) => s.faults);
  const users = useArena((s) => s.users);
  const thinkTimeSec = useArena((s) => s.thinkTimeSec);
  const sloTargets = useArena((s) => s.sloTargets);
  const challengeId = useArena((s) => s.challengeId);

  const [critique, setCritique] = useState<JudgeCritique | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { measurement, verdict } = useMemo(() => {
    const m = measureDesign({ nodes, edges, callShape, faults }, users, thinkTimeSec);
    return { measurement: m, verdict: evaluateObjectives(m, sloTargets) };
  }, [nodes, edges, callShape, faults, users, thinkTimeSec, sloTargets]);

  const messageFor = (reason: string): string => {
    switch (reason) {
      case "demo":
        return t.arena.judge.demoUnavailable;
      case "no_provider":
        return t.arena.judge.unavailable;
      case "rate_limited":
        return t.arena.judge.rateLimited;
      default:
        return t.arena.judge.failed;
    }
  };

  const ask = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setCritique(null);
    try {
      const result = await requestJudgement(
        {
          nodes,
          edges,
          faults,
          measurement,
          verdict,
          users,
          thinkTimeSec,
          challenge: challengeId,
          lang,
        },
        controller.signal,
      );
      setCritique(result);
    } catch (err) {
      // An aborted request is a user decision, not a failure: leave no partial
      // critique and no error message behind.
      if (controller.signal.aborted) return;
      setError(messageFor(err instanceof JudgeError ? err.reason : "failed"));
    } finally {
      if (!controller.signal.aborted) setRunning(false);
      abortRef.current = null;
    }
  }, [nodes, edges, faults, measurement, verdict, users, thinkTimeSec, challengeId, lang]);

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setCritique(null);
  };

  // In the demo build there is no backend at all — say so up front rather than
  // offering an action that cannot work.
  if (isDemo()) {
    return (
      <p className="text-[9.5px] leading-snug text-[var(--color-muted)]">
        {t.arena.judge.demoUnavailable}
      </p>
    );
  }

  return (
    <div className="text-[9.5px] leading-snug text-[var(--color-text-soft)]">
      <p className="text-[8.5px] text-[var(--color-muted)]">{t.arena.judge.framing}</p>

      <div className="mt-1.5 flex items-center gap-1.5">
        {running ? (
          <>
            <span className="text-[9px] text-[var(--color-sky-soft)]">{t.arena.judge.running}</span>
            <button
              onClick={cancel}
              className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)] transition hover:border-[var(--color-text-soft)]"
            >
              {t.arena.judge.cancel}
            </button>
          </>
        ) : (
          <button
            onClick={ask}
            disabled={nodes.length === 0}
            className="rounded border border-[var(--color-sky)] px-1.5 py-0.5 text-[9px] text-[var(--color-sky-soft)] transition enabled:hover:bg-[color-mix(in_srgb,var(--color-sky)_12%,transparent)] disabled:opacity-40"
          >
            {critique || error ? t.arena.judge.retry : t.arena.judge.ask}
          </button>
        )}
      </div>

      {error && <p className="mt-1.5 text-[9px] text-[var(--color-warn)]">{error}</p>}

      {critique && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {(
            [
              ["rigorous", t.arena.judge.rigorous],
              ["pragmatic", t.arena.judge.pragmatic],
              ["agreed", t.arena.judge.agreed],
            ] as const
          ).map(([key, title]) => (
            <section key={key} className="rounded-lg bg-[var(--color-panel-2)] p-1.5">
              <h4 className="text-[8px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                {title}
              </h4>
              <p className="mt-0.5">{critique[key]}</p>
            </section>
          ))}
          <p className="text-[8px] text-[var(--color-muted)]">
            {critique.model} · {t.arena.judge.framing}
          </p>
        </div>
      )}
    </div>
  );
}
