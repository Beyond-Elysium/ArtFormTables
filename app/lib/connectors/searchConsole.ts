/**
 * Google Search Console connector (Search Analytics API).
 * Auth: agency service account (added as a user on the SC property).
 *
 * Demonstrates wiring up an arbitrary Google REST API with just an access
 * token + fetch — no provider-specific client library needed.
 */
import "server-only";
import type { Connector, ConnectorContext, ConnectorResult, Panel } from "./types";
import { googleAccessToken, hasGoogleAuth } from "./googleAuth";
import { isPlaceholderSiteUrl } from "./placeholder";
import { mockDelta, mockSeries, rng } from "./mock";

interface ScConfig {
  /** e.g. "https://acme.com/" or "sc-domain:acme.com" */
  siteUrl: string;
}

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function query(siteUrl: string, body: unknown): Promise<{ rows?: any[] }> {
  const token = await googleAccessToken([SCOPE]);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // GA-equivalent ISR caching is handled at the page level.
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Search Console ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchLive(config: ScConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const startDate = dateNDaysAgo(ctx.days);
  const endDate = dateNDaysAgo(1);

  const [totals, byDate, queries, pages] = await Promise.all([
    query(config.siteUrl, { startDate, endDate, dimensions: [] }),
    query(config.siteUrl, { startDate, endDate, dimensions: ["date"] }),
    query(config.siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 10 }),
    query(config.siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: 10 }),
  ]);

  const t = totals.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const ts = (byDate.rows ?? []).map((r) => ({
    x: r.keys?.[0] as string,
    clicks: r.clicks as number,
    impressions: r.impressions as number,
  }));

  return buildPanels(
    { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
    ts,
    (queries.rows ?? []).map((r) => ({ label: r.keys?.[0], value: r.clicks })),
    (pages.rows ?? []).map((r) => ({ label: r.keys?.[0], value: r.clicks })),
  );
}

function fetchMock(config: ScConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`sc:${config.siteUrl}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 120 + Math.floor(rand() * 400));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (12 + rand() * 18));
  const ctr = clicks / impressions;
  const position = 4 + rand() * 20;

  const ts = series.points.map((pt) => ({
    x: pt.x,
    clicks: pt.y,
    impressions: Math.floor(pt.y * (12 + rand() * 18)),
  }));

  const terms = ["brand name", "buy widgets online", "best widgets", "widget pricing", "widget reviews", "cheap widgets", "widget alternatives", "how to use widgets"];
  const queries = terms
    .map((label) => ({ label, value: Math.floor(clicks * (0.02 + rand() * 0.12)) }))
    .sort((a, b) => b.value - a.value);
  const pages = ["/", "/products", "/blog/guide", "/pricing", "/reviews"]
    .map((label) => ({ label, value: Math.floor(clicks * (0.04 + rand() * 0.2)) }))
    .sort((a, b) => b.value - a.value);

  return buildPanels({ clicks, impressions, ctr, position }, ts, queries, pages);
}

function buildPanels(
  m: { clicks: number; impressions: number; ctr: number; position: number },
  ts: { x: string; clicks: number; impressions: number }[],
  queries: { label: string; value: number }[],
  pages: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Clicks", value: m.clicks, format: "compact" },
    { kind: "stat", label: "Impressions", value: m.impressions, format: "compact" },
    { kind: "stat", label: "CTR", value: m.ctr, format: "percent" },
    { kind: "stat", label: "Avg. position", value: m.position, format: "decimal", invertDelta: true },
    {
      kind: "timeseries",
      title: "Search performance",
      series: [
        { name: "Clicks", points: ts.map((p) => ({ x: p.x, y: p.clicks })) },
        { name: "Impressions", points: ts.map((p) => ({ x: p.x, y: p.impressions })) },
      ],
    },
    { kind: "breakdown", title: "Top queries", display: "table", valueLabel: "Clicks", rows: queries },
    { kind: "breakdown", title: "Top landing pages", display: "table", valueLabel: "Clicks", rows: pages },
  ];
}

export const searchConsoleConnector: Connector<ScConfig> = {
  type: "search-console",
  label: "Google Search",
  category: "Search",
  isLive: () => hasGoogleAuth(),
  async fetch(config, ctx) {
    const base = { sourceId: "search-console", label: "Google Search", category: "Search" };
    // Placeholder site URLs (e.g. *.example) can never resolve — skip the
    // doomed live call and serve mock directly.
    if (!hasGoogleAuth() || isPlaceholderSiteUrl(config.siteUrl))
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[search-console] live fetch failed for ${config.siteUrl}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
