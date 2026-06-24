export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatDelta(pct: number): { label: string; positive: boolean } {
  const positive = pct >= 0;
  return { label: `${positive ? "+" : ""}${pct.toFixed(1)}%`, positive };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

import type { StatFormat } from "@/lib/connectors/types";

/** Format a raw numeric value according to a connector's StatFormat. */
export function formatValue(
  value: number,
  format: StatFormat,
  currency = "USD",
): string {
  switch (format) {
    case "compact":
      return formatCompact(value);
    case "percent":
      return formatPercent(value);
    case "decimal":
      return value.toFixed(1);
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    case "duration":
      return formatDuration(value);
    default:
      return formatNumber(value);
  }
}
