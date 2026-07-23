// 100-arena-capacity-sandbox — pure display formatters for the node metrics.
// Split out from ArenaNode so they're unit-testable (a shared `fmt` previously
// mislabeled latency as "80kms" — QPS and latency need different units).

/** Compact request-rate: 200 → "200", 12000 → "12k". */
export function formatQps(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 100) return String(Math.round(n));
  return n.toFixed(n < 10 ? 1 : 0);
}

/** Latency with the RIGHT unit: <1s stays in ms, ≥1s rolls up to seconds. */
export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    const s = ms / 1000;
    return `${s >= 10 ? Math.round(s) : s.toFixed(1)}s`;
  }
  return `${Math.round(ms)}ms`;
}
