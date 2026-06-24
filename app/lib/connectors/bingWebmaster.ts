/**
 * Bing Webmaster Tools connector.
 *
 * Auth style: a simple API key (different again from Google) — set
 * BING_WEBMASTER_API_KEY. Demonstrates a third auth pattern in the framework.
 *
 * Live (REST):
 *   GET https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats
 *       ?apikey=<key>&siteUrl=<siteUrl>
 *   GET .../GetQueryStats?apikey=<key>&siteUrl=<siteUrl>
 */
import "server-only";
import type { Connector, ConnectorContext, ConnectorResult, Panel } from "./types";
import { mockSeries, rng } from "./mock";

interface BingConfig {
  siteUrl: string;
}

function hasBingKey(): boolean {
  return Boolean(process.env.BING_WEBMASTER_API_KEY);
}

async function fetchLive(config: BingConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const key = process.env.BING_WEBMASTER_API_KEY!;
  const base = "https://ssl.bing.com/webmaster/api.svc/json";
  const q = `apikey=${encodeURIComponent(key)}&siteUrl=${encodeURIComponent(config.siteUrl)}`;

  const [trafficRes, queryRes] = await Promise.all([
    fetch(`${base}/GetRankAndTrafficStats?${q}`, { cache: "no-store" }),
    fetch(`${base}/GetQueryStats?${q}`, { cache: "no-store" }),
  ]);
  if (!trafficRes.ok) throw new Error(`Bing ${trafficRes.status}: ${await trafficRes.text()}`);

  const traffic = await trafficRes.json();
  const queries = queryRes.ok ? await queryRes.json() : { d: [] };

  // Bing returns ASP.NET-style { d: [...] } with /Date(ms)/ strings.
  const stats: any[] = traffic.d ?? [];
  const ts = stats
    .slice(-ctx.days)
    .map((s) => ({
      x: parseAspDate(s.Date),
      clicks: Number(s.Clicks ?? 0),
      impressions: Number(s.Impressions ?? 0),
    }));
  const clicks = ts.reduce((a, b) => a + b.clicks, 0);
  const impressions = ts.reduce((a, b) => a + b.impressions, 0);

  const queryRows = (queries.d ?? [])
    .map((r: any) => ({ label: String(r.Query ?? ""), value: Number(r.Clicks ?? 0) }))
    .sort((a: any, b: any) => b.value - a.value)
    .slice(0, 10);

  return buildPanels({ clicks, impressions }, ts, queryRows);
}

function parseAspDate(s: string): string {
  const m = /\/Date\((\d+)/.exec(s ?? "");
  const d = m ? new Date(Number(m[1])) : new Date();
  return d.toISOString().slice(0, 10);
}

function fetchMock(config: BingConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`bing:${config.siteUrl}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 30 + Math.floor(rand() * 120));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (10 + rand() * 15));
  const ts = series.points.map((pt) => ({
    x: pt.x,
    clicks: pt.y,
    impressions: Math.floor(pt.y * (10 + rand() * 15)),
  }));
  const queries = ["brand name", "widgets near me", "buy widgets", "widget deals", "widget support"]
    .map((label) => ({ label, value: Math.floor(clicks * (0.05 + rand() * 0.2)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ clicks, impressions }, ts, queries);
}

function buildPanels(
  m: { clicks: number; impressions: number },
  ts: { x: string; clicks: number; impressions: number }[],
  queries: { label: string; value: number }[],
): Panel[] {
  const ctr = m.impressions ? m.clicks / m.impressions : 0;
  return [
    { kind: "stat", label: "Clicks", value: m.clicks, format: "compact" },
    { kind: "stat", label: "Impressions", value: m.impressions, format: "compact" },
    { kind: "stat", label: "CTR", value: ctr, format: "percent" },
    {
      kind: "timeseries",
      title: "Bing search performance",
      series: [
        { name: "Clicks", points: ts.map((p) => ({ x: p.x, y: p.clicks })) },
        { name: "Impressions", points: ts.map((p) => ({ x: p.x, y: p.impressions })) },
      ],
    },
    { kind: "breakdown", title: "Top queries", display: "table", valueLabel: "Clicks", rows: queries },
  ];
}

export const bingWebmasterConnector: Connector<BingConfig> = {
  type: "bing-webmaster",
  label: "Bing Search",
  category: "Search",
  isLive: () => hasBingKey(),
  async fetch(config, ctx) {
    const base = { sourceId: "bing-webmaster", label: "Bing Search", category: "Search" };
    if (!hasBingKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[bing-webmaster] live fetch failed for ${config.siteUrl}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
