/**
 * Smart Narratives — a deterministic, rule-based summary of a client's metrics.
 *
 * Pure and dependency-free: it reads the normalized panels (KPI values +
 * period-over-period deltas) that connectors already produce, so it works with
 * no external service and is fully unit-testable. A later pass can hand the same
 * inputs to Claude for richer prose; the structure here is the fallback and the
 * ground truth.
 */
import type { ConnectorResult, StatPanel } from "@/lib/connectors/types";

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
 * @param limit  max highlighted items
 */
export function buildNarrative(
  results: ConnectorResult[],
  comparison: string,
  limit = 4,
): Narrative {
  // Rule-based AI/SEO facts get first claim on the item slots; the labels
  // they consume are excluded from the generic movers so nothing repeats.
  const { specials, consumed } = aiSeoItems(results);

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

  // Rank by magnitude of change. The headline still reflects every mover.
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const strong = movers.filter((m) => Math.abs(m.delta) >= SIGNIFICANT);

  const fillers = (strong.length ? strong : movers).filter(
    (m) => !consumed.has(`${m.source}:${m.label}`),
  );
  const items = [...specials, ...fillers].slice(0, limit);

  return { headline: headlineFor(strong, comparison), items };
}

/**
 * Rule-based AI/SEO highlights (the newest KPIs would otherwise never make
 * the summary card):
 * - AI Score grade + AI-referred-sessions trend, when that trend is
 *   significant;
 * - crawl errors > 0 as a caution;
 * - the backlinks total, first mention only.
 * Returns the items plus the "source:label" keys they consumed.
 */
function aiSeoItems(results: ConnectorResult[]): {
  specials: NarrativeItem[];
  consumed: Set<string>;
} {
  const specials: NarrativeItem[] = [];
  const consumed = new Set<string>();
  let backlinksMentioned = false;

  for (const r of results) {
    const stats = r.panels.filter((p): p is StatPanel => p.kind === "stat");
    const find = (re: RegExp) => stats.find((p) => re.test(p.label));

    // AI-referred sessions trend (+ AI Score grade when present).
    const aiSessions = find(/^ai[- ]referred sessions$/i);
    const aiScore = find(/^ai score$/i);
    if (
      aiSessions &&
      typeof aiSessions.delta === "number" &&
      Math.abs(aiSessions.delta) >= SIGNIFICANT
    ) {
      const dir = aiSessions.delta >= 0 ? "up" : "down";
      const grade = aiScore ? aiScore.caption ?? String(aiScore.value) : null;
      specials.push({
        source: r.label,
        label: aiSessions.label,
        delta: aiSessions.delta,
        positive: aiSessions.delta > 0,
        text:
          `${r.label}: AI-referred sessions ${dir} ` +
          `${Math.abs(aiSessions.delta).toFixed(1)}%` +
          (grade ? ` — AI Score ${grade}` : ""),
      });
      consumed.add(`${r.label}:${aiSessions.label}`);
      if (aiScore) consumed.add(`${r.label}:${aiScore.label}`);
    }

    // Crawl errors are always worth a caution when present.
    const crawl = find(/^crawl errors$/i);
    if (crawl && crawl.value > 0) {
      specials.push({
        source: r.label,
        label: crawl.label,
        delta: typeof crawl.delta === "number" ? crawl.delta : 0,
        positive: false,
        text: `${r.label}: ${crawl.value} crawl error${crawl.value === 1 ? "" : "s"} need attention`,
      });
      consumed.add(`${r.label}:${crawl.label}`);
    }

    // Backlinks total — first mention only.
    const backlinks = find(/^backlinks$/i);
    if (backlinks && !backlinksMentioned) {
      backlinksMentioned = true;
      const delta = typeof backlinks.delta === "number" ? backlinks.delta : 0;
      specials.push({
        source: r.label,
        label: backlinks.label,
        delta,
        positive: delta >= 0,
        text: `${r.label}: ${backlinks.value.toLocaleString("en-US")} backlinks`,
      });
      consumed.add(`${r.label}:${backlinks.label}`);
    }
  }

  return { specials, consumed };
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
