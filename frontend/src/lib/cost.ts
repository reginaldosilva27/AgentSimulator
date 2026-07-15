// 011-token-cost — formatting for token counts and US$ cost. These are figures,
// not translatable prose, so they live here (used by the LLM readout / inspector).

/** Compact token count: 950 → "950", 1234 → "1.2k", 12345 → "12k",
 *  1_047_576 → "1M", 1_500_000 → "1.5M" (the unary + drops a trailing ".0"). */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/** US$ cost with enough precision for sub-cent agent runs. */
export function formatUsd(n: number): string {
  if (n <= 0) return "$0";
  if (n < 0.0001) return "<$0.0001";
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

/** Generation throughput, e.g. 42.5 → "~42 tok/s" (029-ttft-throughput). */
export function formatTps(n: number): string {
  return `~${Math.round(n)} tok/s`;
}

/** A fraction as a rounded whole percent: 0.74 → "74%" (099-prompt-caching). */
export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
