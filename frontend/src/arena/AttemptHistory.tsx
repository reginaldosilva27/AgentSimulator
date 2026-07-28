// 132-arena-attempts — the attempt-history view (the "Attempts" tab).
//
// Shows the active challenge's recorded attempts newest-first, with the best one
// marked, and lets any of them be loaded back onto the canvas.
//
// One honesty duty: stored figures are labelled as being FROM THAT ATTEMPT. They
// are denormalised on purpose (see progress.ts) so a later model recalibration
// cannot rewrite history — which means a stored $1,800/h can sit next to a live
// $2,100/h for the same design. Deliberate, and it must be said, or it reads as a bug.

import { useT } from "../i18n";
import { formatLatency } from "./format";
import { bestAttempt } from "./progress";
import { useArena } from "./store";

export function AttemptHistory() {
  const t = useT();
  const challengeId = useArena((s) => s.challengeId);
  const progress = useArena((s) => s.progress);

  if (!challengeId) return null;
  const attempts = progress[challengeId]?.attempts ?? [];
  const best = bestAttempt(attempts);

  if (attempts.length === 0) {
    return (
      <div className="text-[9.5px] leading-snug text-[var(--color-muted)]">
        <p>{t.arena.progress.noAttempts}</p>
        <p className="mt-1 text-[8.5px]">{t.arena.progress.localOnly}</p>
      </div>
    );
  }

  return (
    <div className="text-[9.5px] leading-snug text-[var(--color-text-soft)]">
      <ul className="flex flex-col gap-1.5">
        {[...attempts].reverse().map((a) => {
          const met = a.results.filter((r) => r.met).length;
          const isBest = best?.seq === a.seq;
          return (
            <li
              key={a.seq}
              className={`rounded-lg border p-1.5 ${
                isBest
                  ? "border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,transparent)]"
                  : "border-transparent bg-[var(--color-panel-2)]"
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="font-semibold">
                  {t.arena.progressAttemptLabel(a.seq)}
                  {isBest && (
                    <span className="ml-1 text-[8px] font-semibold uppercase tracking-wide text-[var(--color-ok)]">
                      {t.arena.progress.best}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-[9px] ${
                    a.passed ? "text-[var(--color-ok)]" : "text-[var(--color-warn)]"
                  }`}
                >
                  {a.passed
                    ? t.arena.progress.passed
                    : t.arena.progressFailed(met, a.results.length)}
                </span>
              </div>

              <div className="mt-0.5 tabular-nums text-[8.5px] text-[var(--color-muted)]">
                {formatLatency(a.e2eLatencyMs)} · ${Math.round(a.costPerHourUsd).toLocaleString("en-US")}/h
              </div>

              {a.assisted && (
                <div className="text-[8px] text-[var(--color-muted)]">
                  {t.arena.progress.assisted}
                </div>
              )}
              {a.passed && a.faults && a.faults.length > 0 && (
                <div className="text-[8px] text-[var(--color-muted)]">
                  ⚡ {t.arena.progress.withFaults}
                </div>
              )}

              <button
                onClick={() => useArena.getState().restoreAttempt(challengeId, a.seq)}
                title={t.arena.progress.restored}
                className="mt-1 rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[8.5px] text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
              >
                {t.arena.progress.restore}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 text-[8px] text-[var(--color-muted)]">
        {t.arena.progress.figuresFromThen} {t.arena.progress.localOnly}
      </p>
    </div>
  );
}
