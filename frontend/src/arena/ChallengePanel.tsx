// 130-arena-challenges — the brief panel (the "Brief" tab of the shared
// bottom-right surface).
//
// It shows the ask, the difficulty, the LOCKED givens (spelled out, because a
// lock the user cannot see reads as a bug), the verdict derived from 129, the
// reference reveal and the exit. The objectives checklist itself is 129's
// `SloPanel` on its own tab — this panel never duplicates it.

import { useMemo } from "react";

import { useLang, useT } from "../i18n";
import { useLearnTarget } from "../lib/learnTarget";
import { allTopicsFor } from "../learn/content";
import { challengeById } from "./challenges";
import { evaluateObjectives, measureDesign } from "./slo";
import { useArena } from "./store";

export function ChallengePanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const challengeId = useArena((s) => s.challengeId);
  const referenceShown = useArena((s) => s.referenceShown);
  const nodes = useArena((s) => s.nodes);
  const edges = useArena((s) => s.edges);
  const callShape = useArena((s) => s.callShape);
  const users = useArena((s) => s.users);
  const thinkTimeSec = useArena((s) => s.thinkTimeSec);
  const sloTargets = useArena((s) => s.sloTargets);
  const faults = useArena((s) => s.faults);
  const requestTopic = useLearnTarget((s) => s.requestTopic);

  const challenge = challengeById(challengeId);

  const verdict = useMemo(
    () =>
      evaluateObjectives(
        measureDesign({ nodes, edges, callShape, faults }, users, thinkTimeSec),
        sloTargets,
      ),
    [nodes, edges, callShape, faults, users, thinkTimeSec, sloTargets],
  );

  if (!challenge) return null;
  const topics = allTopicsFor(lang);

  return (
    <div className="text-[9.5px] leading-snug text-[var(--color-text-soft)]">
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="font-semibold text-[var(--color-sky-soft)]">
          {challenge.title[lang]}
        </span>
        <span className="shrink-0 rounded border border-[var(--color-line)] px-1 py-px text-[8px] uppercase tracking-wide text-[var(--color-muted)]">
          {t.arena.challenge.difficulty[challenge.difficulty]}
        </span>
      </div>

      <p
        className={`mt-1 text-[10px] font-semibold ${
          verdict.met ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]"
        }`}
      >
        {verdict.met
          ? t.arena.challenge.solved
          : t.arena.challengeNotYet(verdict.metCount, verdict.total)}
      </p>

      <p className="mt-1.5">{challenge.brief[lang]}</p>

      {/* The locked givens, spelled out — an enforced lock the user cannot see
          reads as a broken control rather than as part of the problem. */}
      <div className="mt-1.5 rounded-lg border border-dashed border-[var(--color-line)] p-1.5">
        <div className="text-[8px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          🔒 {t.arena.challenge.given}
        </div>
        <div className="mt-0.5 tabular-nums">
          {t.arena.usersReadout(
            challenge.givens.users.toLocaleString(lang === "pt" ? "pt-BR" : "en-US"),
            String(Math.round(challenge.givens.users / challenge.givens.thinkTimeSec)),
          )}
        </div>
        <div className="tabular-nums">
          {t.arena.payloadReadout(
            String(challenge.givens.callShape.inputTokens),
            String(challenge.givens.callShape.outputTokens),
          )}
        </div>
        <p className="mt-0.5 text-[8.5px] text-[var(--color-muted)]">
          {t.arena.challenge.lockedHint}
        </p>
      </div>

      {challenge.allowedKinds && (
        <p className="mt-1.5 text-[8.5px] text-[var(--color-muted)]">
          {t.arena.challenge.paletteLimited}
        </p>
      )}

      {/* 121 — concept chips deep-link into Learn. */}
      {challenge.concepts && challenge.concepts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {challenge.concepts.map((id) => {
            const entry = topics[id];
            if (!entry) return null;
            return (
              <button
                key={id}
                onClick={() => requestTopic(id)}
                className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[8.5px] text-[var(--color-sky-soft)] transition hover:border-[var(--color-sky)]"
              >
                {entry.topic.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => useArena.getState().loadReference()}
          title={t.arena.challenge.referenceHint}
          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
        >
          {t.arena.challenge.showReference}
        </button>
        <button
          onClick={() => useArena.getState().exitChallenge()}
          title={t.arena.challenge.exitHint}
          className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9px] text-[var(--color-muted)] transition hover:border-[var(--color-text-soft)]"
        >
          {t.arena.challenge.exit}
        </button>
      </div>

      {referenceShown && (
        <p className="mt-1 text-[8.5px] text-[var(--color-muted)]">
          {t.arena.challenge.referenceShown} — {t.arena.challenge.referenceHint}
        </p>
      )}
    </div>
  );
}
