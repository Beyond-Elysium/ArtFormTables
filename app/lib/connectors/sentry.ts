/**
 * Sentry connector — Organization stats (events).
 * Auth: auth token (bearer).
 *
 * Env: SENTRY_AUTH_TOKEN, optional SENTRY_BASE_URL (default https://sentry.io).
 * Config: { organization }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

interface SentryConfig {
  organization: string;
}

function token(): string | undefined {
  return process.env.SENTRY_AUTH_TOKEN;
}
function baseUrl(): string {
  return process.env.SENTRY_BASE_URL || "https://sentry.io";
}

async function fetchLive(config: SentryConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const qs = new URLSearchParams({
    field: "sum(quantity)",
    groupBy: "outcome",
    category: "error",
    interval: "1d",
    start: `${dateNDaysAgo(ctx.days - 1)}T00:00:00`,
    end: `${dateNDaysAgo(0)}T23:59:59`,
  });
  const res = await fetch(
    `${baseUrl()}/api/0/organizations/${config.organization}/stats_v2/?${qs}`,
    { headers: { Authorization: `Bearer ${token()!}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Sentry ${res.status}: ${await res.text()}`);
  const json = await res.json();

  const intervals: string[] = json.intervals ?? [];
  const groups: any[] = json.groups ?? [];
  const perDay = new Array(intervals.length).fill(0);
  const byOutcome = new Map<string, number>();
  let total = 0;
  let accepted = 0;
  for (const g of groups) {
    const series: number[] = (g.series?.["sum(quantity)"] ?? []).map(num);
    const sum = series.reduce((a, b) => a + b, 0);
    const outcome = g.by?.outcome ?? "unknown";
    byOutcome.set(outcome, (byOutcome.get(outcome) ?? 0) + sum);
    total += sum;
    if (outcome === "accepted") accepted += sum;
    series.forEach((v, i) => (perDay[i] += v));
  }
  const ts = intervals.map((x, i) => ({ x: x.slice(0, 10), y: perDay[i] }));
  const outcomes = [...byOutcome.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return buildPanels({ total, accepted, dropped: total - accepted }, ts, outcomes);
}

function fetchMock(config: SentryConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`sentry:${config.organization}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 200 + Math.floor(rand() * 1500));
  const total = series.total;
  const accepted = Math.floor(total * (0.8 + rand() * 0.15));
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const outcomes = [
    { label: "accepted", value: accepted },
    { label: "rate_limited", value: Math.floor(total * (0.03 + rand() * 0.08)) },
    { label: "filtered", value: Math.floor(total * (0.02 + rand() * 0.06)) },
  ].sort((a, b) => b.value - a.value);
  return buildPanels({ total, accepted, dropped: total - accepted }, ts, outcomes);
}

function buildPanels(
  m: { total: number; accepted: number; dropped: number },
  ts: { x: string; y: number }[],
  outcomes: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Error events", value: m.total, format: "compact", invertDelta: true },
    { kind: "stat", label: "Accepted", value: m.accepted, format: "compact" },
    { kind: "stat", label: "Dropped", value: m.dropped, format: "compact", invertDelta: true },
    {
      kind: "timeseries",
      title: "Error events",
      series: [{ name: "Events", points: ts }],
    },
    { kind: "breakdown", title: "By outcome", display: "donut", rows: outcomes },
  ];
}

export const sentryConnector: Connector<SentryConfig> = {
  type: "sentry",
  label: "Error Monitoring",
  category: "Errors",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "sentry", label: "Error Monitoring", category: "Errors" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[sentry] live fetch failed for ${config.organization}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
