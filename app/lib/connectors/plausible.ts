/**
 * Plausible Analytics connector — Stats API v1.
 * Auth: API key (bearer). Works with plausible.io or self-hosted.
 *
 * Env: PLAUSIBLE_API_KEY, optional PLAUSIBLE_BASE_URL (default https://plausible.io).
 * Config: { siteId }  (the domain configured in Plausible, e.g. "acme.com").
 */
import "server-only";
import { z } from "zod";
import type { Connector, ConnectorContext, Panel } from "./types";
import { fetchJson } from "./http";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, rangeDates } from "./util";

interface PlausibleConfig {
  siteId: string;
}

// Response shapes are validated, so a payload change surfaces as a clean error
// (→ mock fallback) instead of a silent NaN.
const metric = z.object({ value: z.number().nullish(), change: z.number().nullish() });
const aggregateSchema = z.object({ results: z.record(z.string(), metric).default({}) });
const timeseriesSchema = z.object({
  results: z
    .array(z.object({ date: z.string() }).catchall(z.number().nullish()))
    .default([]),
});
const breakdownSchema = z.object({
  results: z
    .array(z.object({ source: z.string().nullish(), visitors: z.number().nullish() }))
    .default([]),
});

function apiKey(): string | undefined {
  return process.env.PLAUSIBLE_API_KEY;
}

function baseUrl(): string {
  return process.env.PLAUSIBLE_BASE_URL || "https://plausible.io";
}

// Resilient (ofetch retry/timeout) + zod-validated fetch.
function api<T>(schema: z.ZodType<T>, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params);
  return fetchJson(schema, `${baseUrl()}/api/v1/stats/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${apiKey()!}` },
  });
}

async function fetchLive(config: PlausibleConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const { start, end } = rangeDates(ctx.days);
  const date = `${start},${end}`;
  const common = { site_id: config.siteId, period: "custom", date };

  const [aggregate, timeseries, sources] = await Promise.all([
    api(aggregateSchema, "aggregate", {
      ...common,
      metrics: "visitors,pageviews,bounce_rate,visit_duration",
      compare: "previous_period",
    }),
    api(timeseriesSchema, "timeseries", { ...common, metrics: "visitors,pageviews" }),
    api(breakdownSchema, "breakdown", {
      ...common,
      property: "visit:source",
      metrics: "visitors",
      limit: "8",
    }),
  ]);

  const r = aggregate.results;
  const stat = (k: string) => ({ value: num(r[k]?.value), delta: num(r[k]?.change) });
  const visitors = stat("visitors");
  const pageviews = stat("pageviews");
  const bounce = stat("bounce_rate"); // integer percent
  const duration = stat("visit_duration"); // seconds

  const ts = timeseries.results.map((row) => ({
    x: row.date,
    visitors: num(row.visitors),
    pageviews: num(row.pageviews),
  }));
  const sourceRows = sources.results.map((s) => ({
    label: s.source || "Direct",
    value: num(s.visitors),
  }));

  return buildPanels(
    {
      visitors: visitors.value,
      pageviews: pageviews.value,
      bounceRate: bounce.value / 100,
      duration: duration.value,
    },
    { visitors: visitors.delta, pageviews: pageviews.delta, bounce: bounce.delta, duration: duration.delta },
    ts,
    sourceRows,
  );
}

function fetchMock(config: PlausibleConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`plausible:${config.siteId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 150 + Math.floor(rand() * 500));
  const visitors = series.total;
  const ts = series.points.map((pt) => ({
    x: pt.x,
    visitors: pt.y,
    pageviews: Math.floor(pt.y * (1.8 + rand() * 1.2)),
  }));
  const pageviews = ts.reduce((a, b) => a + b.pageviews, 0);
  const bounceRate = 0.35 + rand() * 0.3;
  const duration = 40 + Math.floor(rand() * 160);
  const sources = ["Direct", "Google", "Twitter", "GitHub", "Newsletter", "Reddit"]
    .map((label) => ({ label, value: Math.floor(visitors * (0.05 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels(
    { visitors, pageviews, bounceRate, duration },
    { visitors: mockDelta(rand), pageviews: mockDelta(rand), bounce: mockDelta(rand), duration: mockDelta(rand) },
    ts,
    sources,
  );
}

function buildPanels(
  m: { visitors: number; pageviews: number; bounceRate: number; duration: number },
  d: { visitors: number; pageviews: number; bounce: number; duration: number },
  ts: { x: string; visitors: number; pageviews: number }[],
  sources: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Visitors", value: m.visitors, format: "compact", delta: d.visitors },
    { kind: "stat", label: "Pageviews", value: m.pageviews, format: "compact", delta: d.pageviews },
    { kind: "stat", label: "Bounce rate", value: m.bounceRate, format: "percent", delta: d.bounce, invertDelta: true },
    { kind: "stat", label: "Avg. visit", value: m.duration, format: "duration", delta: d.duration },
    {
      kind: "timeseries",
      title: "Visitors & pageviews",
      series: [
        { name: "Visitors", points: ts.map((p) => ({ x: p.x, y: p.visitors })) },
        { name: "Pageviews", points: ts.map((p) => ({ x: p.x, y: p.pageviews })) },
      ],
    },
    { kind: "breakdown", title: "Top sources", display: "donut", rows: sources },
  ];
}

export const plausibleConnector: Connector<PlausibleConfig> = {
  type: "plausible",
  label: "Privacy Analytics",
  category: "Analytics",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "plausible", label: "Privacy Analytics", category: "Analytics" };
    if (!apiKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[plausible] live fetch failed for ${config.siteId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
