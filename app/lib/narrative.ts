/**
 * Smart Narratives — a deterministic, rule-based summary of a client's metrics.
 *
 * Pure and dependency-free: it reads the normalized panels (KPI values +
 * period-over-period deltas) that connectors already produce, so it works with
 * no external service and is fully unit-testable. A later pass can hand the same
 * inputs to Claude for richer prose; the structure here is the fallback and the
 * ground truth.
 */
import type { ConnectorResult } from "@/lib/connectors/types";

export interface NarrativeItem {
  source: string;
  label: string;
  delta: number;
  /** True when the movement is good for the client (respects invertDelta). */
  positive: boolean;
  text: string;
}

export interface Narrative {
  headline: string;
  items: NarrativeItem[];
}

/** A change smaller than this (in %) is treated as "steady", not a mover. */
const SIGNIFICANT = 1;

/**
 * @param results  the client's connector results (live or demo)
 * @param comparison  trailing phrase for deltas, e.g. "vs prior 28d"
 * @param limit  max highlighted movers
 */
export function buildNarrative(
  results: ConnectorResult[],
  comparison: string,
  limit = 4,
): Narrative {
  const movers: NarrativeItem[] = [];
  for (const r of results) {
    for (const p of r.panels) {
      if (p.kind !== "stat" || typeof p.delta !== "number") continue;
      const positive = p.invertDelta ? p.delta < 0 : p.delta > 0;
      const dir = p.delta >= 0 ? "up" : "down";
      movers.push({
        source: r.label,
        label: p.label,
        delta: p.delta,
        positive,
        text: `${r.label}: ${p.label} ${dir} ${Math.abs(p.delta).toFixed(1)}%`,
      });
    }
  }

  // Rank by magnitude of change.
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const strong = movers.filter((m) => Math.abs(m.delta) >= SIGNIFICANT);
  const items = (strong.length ? strong : movers).slice(0, limit);

  return { headline: headlineFor(strong, comparison), items };
}

function headlineFor(strong: NarrativeItem[], comparison: string): string {
  if (strong.length === 0) return `Metrics held roughly steady ${comparison}.`;

  const lead = strong[0];
  const dir = lead.delta >= 0 ? "up" : "down";
  const leadPhrase = `${lead.label} ${dir} ${Math.abs(lead.delta).toFixed(1)}% ${comparison}`;

  const up = strong.filter((m) => m.positive).length;
  const down = strong.length - up;
  if (up && down) {
    return `${leadPhrase} — ${up} metric${up === 1 ? "" : "s"} improving, ${down} declining.`;
  }
  return `${leadPhrase} — ${up ? "broad gains" : "broad declines"} across ${strong.length} metrics.`;
}
