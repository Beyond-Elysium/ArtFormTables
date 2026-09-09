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
 *   GET .../GetCrawlStats?apikey=<key>&siteUrl=<siteUrl>   (crawl errors)
 *   GET .../GetLinkCounts?apikey=<key>&siteUrl=<siteUrl>   (backlinks)
 *
 * Bing is the token-free home for two things Google's APIs don't expose:
 * aggregate crawl errors and backlinks (the GSC "Links" report has no API).
 */
import "server-only";
import type { Connector, ConnectorContext, ConnectorResult, Panel } from "./types";
import { isPlaceholderSiteUrl } from "./placeholder";
import { filterByWindow, resolveWindow, type DateWindow } from "./dates";
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

  // Bing's stats endpoints return a fixed history — slice it to the requested
  // window by date rather than taking the last N entries.
  const w = resolveWindow(ctx);

  const [trafficRes, queryRes, crawl, links] = await Promise.all([
    fetch(`${base}/GetRankAndTrafficStats?${q}`, { cache: "no-store" }),
    fetch(`${base}/GetQueryStats?${q}`, { cache: "no-store" }),
    fetchCrawl(base, q, w),
    fetchLinks(base, q),
  ]);
  if (!trafficRes.ok) throw new Error(`Bing ${trafficRes.status}: ${await trafficRes.text()}`);

  const traffic = await trafficRes.json();
  const queries = queryRes.ok ? await queryRes.json() : { d: [] };

  // Bing returns ASP.NET-style { d: [...] } with /Date(ms)/ strings.
  const stats: any[] = traffic.d ?? [];
  const ts = filterByWindow(
    stats.map((s) => ({
      x: parseAspDate(s.Date),
      clicks: Number(s.Clicks ?? 0),
      impressions: Number(s.Impressions ?? 0),
    })),
    w,
  );
  const clicks = ts.reduce((a, b) => a + b.clicks, 0);
  const impressions = ts.reduce((a, b) => a + b.impressions, 0);

  const queryRows = (queries.d ?? [])
    .map((r: any) => ({ label: String(r.Query ?? ""), value: Number(r.Clicks ?? 0) }))
    .sort((a: any, b: any) => b.value - a.value)
    .slice(0, 10);

  return [...buildPanels({ clicks, impressions }, ts, queryRows), ...seoPanels(crawl, links)];
}

interface CrawlSummary {
  crawlErrors: number;
  blocked: number;
  inIndex: number;
}
interface LinksSummary {
  total: number;
  topPages: { label: string; value: number }[];
}

/** GetCrawlStats → aggregate crawl errors, robots-blocked, pages in index. */
async function fetchCrawl(base: string, q: string, w: DateWindow): Promise<CrawlSummary | null> {
  try {
    const res = await fetch(`${base}/GetCrawlStats?${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const all: any[] = json.d ?? [];
    // Prefer slicing the history by the window's dates; fall back to the last
    // N entries only when rows carry no usable Date field at all.
    const hasDates = all.some((r) => r.Date != null);
    const rows: any[] = hasDates
      ? all.filter((r) => {
          const d = parseAspDate(r.Date ?? "");
          return d >= w.start && d <= w.end;
        })
      : all.slice(-w.days);
    let crawlErrors = 0;
    let blocked = 0;
    let inIndex = 0;
    for (const r of rows) {
      // Prefer an explicit CrawlErrors field; else derive from 4xx/5xx codes.
      const errs = r.CrawlErrors ?? Number(r.Code4xx ?? 0) + Number(r.Code5xx ?? 0);
      crawlErrors += Number(errs ?? 0);
      blocked += Number(r.BlockedByRobotsTxt ?? 0);
      if (r.InIndex != null) inIndex = Number(r.InIndex); // last value wins
    }
    return { crawlErrors, blocked, inIndex };
  } catch {
    return null;
  }
}

/** GetLinkCounts → total backlinks + most-linked pages (schema-tolerant). */
async function fetchLinks(base: string, q: string): Promise<LinksSummary | null> {
  try {
    const res = await fetch(`${base}/GetLinkCounts?${q}&page=0&count=100`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    const d = json.d;
    const list: any[] = Array.isArray(d) ? d : (d?.Links ?? d?.Details ?? []);
    const rows = list
      .map((x) => ({ label: String(x.Url ?? x.Page ?? ""), value: Number(x.Count ?? x.Links ?? 0) }))
      .filter((r) => r.label)
      .sort((a, b) => b.value - a.value);
    const total = rows.reduce((a, b) => a + b.value, 0);
    return { total, topPages: rows.slice(0, 10) };
  } catch {
    return null;
  }
}

/**
 * Crawl-health + backlink panels (shared by live and mock).
 *
 * Ok-but-empty responses are ambiguous: zero backlinks alongside a missing
 * crawl report almost always means the site isn't verified in Bing Webmaster
 * yet, so the Backlinks stat says so instead of presenting a confident 0.
 * A real zero (crawl data present) renders as-is.
 *
 * Exported for tests.
 */
export function seoPanels(crawl: CrawlSummary | null, links: LinksSummary | null): Panel[] {
  const panels: Panel[] = [];
  if (links) {
    const likelyUnverified = links.total === 0 && crawl === null;
    panels.push({
      kind: "stat",
      label: "Backlinks",
      value: links.total,
      format: "compact",
      caption: likelyUnverified ? "Site not yet verified in Bing Webmaster?" : "Inbound links (Bing)",
    });
  }
  if (crawl) {
    panels.push({
      kind: "stat",
      label: "Crawl errors",
      value: crawl.crawlErrors,
      format: "number",
      invertDelta: true,
      caption: `${crawl.blocked.toLocaleString()} blocked by robots.txt`,
    });
    if (crawl.inIndex > 0) {
      panels.push({ kind: "stat", label: "Pages in index", value: crawl.inIndex, format: "compact" });
    }
  }
  if (links && links.topPages.length > 0) {
    panels.push({
      kind: "breakdown",
      title: "Top linked pages",
      subtitle: "Most-linked pages by inbound links (Bing)",
      display: "table",
      valueLabel: "Links",
      rows: links.topPages,
    });
  }
  return panels;
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

  // Synthesize crawl health + backlinks for the demo.
  const backlinks = 200 + Math.floor(rand() * 20000);
  const topPages = ["/", "/blog/guide", "/pricing", "/product", "/press"]
    .map((label, i) => ({ label, value: Math.max(1, Math.floor(backlinks * (0.3 - i * 0.05))) }))
    .filter((r) => r.value > 0);
  const crawl: CrawlSummary = { crawlErrors: Math.floor(rand() * 15), blocked: Math.floor(rand() * 40), inIndex: 100 + Math.floor(rand() * 5000) };
  const links: LinksSummary = { total: backlinks, topPages };

  return [...buildPanels({ clicks, impressions }, ts, queries), ...seoPanels(crawl, links)];
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
    if (!hasBingKey() || isPlaceholderSiteUrl(config.siteUrl))
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[bing-webmaster] live fetch failed for ${config.siteUrl}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
