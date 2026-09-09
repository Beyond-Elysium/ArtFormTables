/**
 * AI Score trend (Chunk 25 / finding D8) — turns the point-in-time AI Score
 * into a weekly trendline.
 *
 * The semantic lake stores a daily `ai` model per client (ai_sessions,
 * total_sessions, ai_engaged, distinct_ai_sources, distinct_ai_pages). This
 * module queries it server-side through the client-scoped semantic client
 * (runSemanticQuery force-injects `client = slug`), buckets the daily rows
 * into ISO weeks, and scores each week with the EXACT same composite as the
 * live AI Score card (computeAiScore + AI_SCORE_WEIGHTS/TARGETS from
 * lib/connectors/aiSources.ts — imported, not duplicated).
 *
 * Degrades to null — no panel — when the service, the `ai` model, or rows for
 * the window are absent. The aggregation + scoring are pure and unit-tested.
 */
import "server-only";
import { computeAiScore } from "@/lib/connectors/aiSources";
import type { TimeseriesPanel } from "@/lib/connectors/types";
import { runSemanticQuery, semanticConfigured } from "@/lib/semantic";

/** Model + measure names — the contract with semantic/specs/ai.yaml. */
export const AI_MODEL = "ai";
const MEASURES = [
  "ai_sessions",
  "total_sessions",
  "ai_engaged",
  "distinct_ai_sources",
  "distinct_ai_pages",
] as const;

/** One daily row from the `ai` model (values arrive as unknown JSON). */
export interface AiDailyRow {
  date: string;
  ai_sessions?: unknown;
  total_sessions?: unknown;
  ai_engaged?: unknown;
  distinct_ai_sources?: unknown;
  distinct_ai_pages?: unknown;
}

export interface AiWeek {
  /** Monday of the ISO week (YYYY-MM-DD). */
  weekStart: string;
  aiSessions: number;
  totalSessions: number;
  aiEngaged: number;
  /** Peak daily distinct counts — a lower bound on the weekly distincts
   * (daily distincts can't be merged exactly without raw rows). */
  distinctSources: number;
  distinctPages: number;
}

/**
 * The `ai` model stores no site-wide engaged count, so the engagement-quality
 * component compares AI engagement against this typical site engagement rate.
 * Replace with a real measure if the model grows one (sync: computeAiScore's
 * siteEngagementRate input).
 */
export const SITE_ENGAGEMENT_BASELINE = 0.55;

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Monday (UTC) of the ISO week containing a YYYY-MM-DD date. */
export function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Bucket daily `ai` rows into ISO weeks, ascending by week. */
export function aggregateAiWeeks(rows: AiDailyRow[]): AiWeek[] {
  const byWeek = new Map<string, AiWeek>();
  for (const row of rows) {
    if (!row?.date) continue;
    const weekStart = isoWeekStart(String(row.date));
    let w = byWeek.get(weekStart);
    if (!w) {
      w = {
        weekStart,
        aiSessions: 0,
        totalSessions: 0,
        aiEngaged: 0,
        distinctSources: 0,
        distinctPages: 0,
      };
      byWeek.set(weekStart, w);
    }
    w.aiSessions += n(row.ai_sessions);
    w.totalSessions += n(row.total_sessions);
    w.aiEngaged += n(row.ai_engaged);
    w.distinctSources = Math.max(w.distinctSources, n(row.distinct_ai_sources));
    w.distinctPages = Math.max(w.distinctPages, n(row.distinct_ai_pages));
  }
  return [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/**
 * Score each week with the shared composite. Momentum compares against the
 * previous week; the first week is scored flat (no earlier data ≠ growth).
 */
export function scoreAiWeeks(weeks: AiWeek[]): { weekStart: string; score: number }[] {
  return weeks.map((w, i) => {
    const prev = i > 0 ? weeks[i - 1].aiSessions : w.aiSessions;
    const { score } = computeAiScore({
      aiSessions: w.aiSessions,
      totalSessions: w.totalSessions,
      prevAiSessions: prev,
      aiEngagedSessions: w.aiEngaged,
      siteEngagementRate: SITE_ENGAGEMENT_BASELINE,
      distinctSources: w.distinctSources,
      distinctPages: w.distinctPages,
    });
    return { weekStart: w.weekStart, score };
  });
}

/** Build the panel from daily rows; null when there's no meaningful trend. */
export function aiTrendPanelFromRows(rows: AiDailyRow[]): TimeseriesPanel | null {
  const weeks = aggregateAiWeeks(rows);
  if (weeks.length < 2) return null; // one point isn't a trend
  const scored = scoreAiWeeks(weeks);
  return {
    kind: "timeseries",
    title: "AI Score trend",
    subtitle: "Weekly composite of AI visibility signals (0–100)",
    series: [
      {
        name: "AI Score",
        points: scored.map((w) => ({ x: w.weekStart, y: w.score })),
      },
    ],
  };
}

/**
 * Fetch + score the AI trend for one client. Null (skip the panel) when the
 * semantic service is unconfigured, the `ai` model doesn't exist yet, the
 * query fails, or the window holds fewer than two weeks of rows.
 */
export async function fetchAiTrendPanel(
  clientSlug: string,
  window: { start: string; end: string },
): Promise<TimeseriesPanel | null> {
  if (!semanticConfigured()) return null;
  const outcome = await runSemanticQuery(
    {
      model: AI_MODEL,
      dimensions: ["date"],
      measures: [...MEASURES],
      timeRange: { start: window.start, end: window.end },
      orderBy: [["date", "asc"]],
      limit: 500,
    },
    clientSlug,
  );
  if (!outcome.ok || !outcome.result) return null; // absent model/service → skip quietly
  return aiTrendPanelFromRows(outcome.result.rows as unknown as AiDailyRow[]);
}
