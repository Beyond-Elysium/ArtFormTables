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
import { clampWindowEnd, dateNDaysAgo, resolveWindow } from "./dates";
import { mockDelta, mockSeries, rng } from "./mock";

interface ScConfig {
  /** e.g. "https://acme.com/" or "sc-domain:acme.com" */
  siteUrl: string;
}

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** GSC search-analytics data is typically final only ~2 days back. */
const GSC_LATENCY_DAYS = 2;

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

interface SitemapEntry {
  path?: string;
  errors?: string | number;
  warnings?: string | number;
  isPending?: boolean;
  contents?: { submitted?: string | number; indexed?: string | number }[];
}

/** Sitemaps API: submitted/indexed counts + crawl errors/warnings per sitemap. */
async function fetchSitemaps(siteUrl: string): Promise<SitemapEntry[]> {
  const token = await googleAccessToken([SCOPE]);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Search Console sitemaps ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { sitemap?: SitemapEntry[] };
  return data.sitemap ?? [];
}

/**
 * Roll sitemap entries up into index/crawl-health panels.
 *
 * These stats carry no delta of their own (the sitemaps API is point-in-time),
 * but they participate in comparison merging: merge.ts matches stats by label
 * and attaches compareValue + delta when compare mode is on. That's why
 * "Not indexed" / "Crawl errors" keep `invertDelta` — when a delta does arrive
 * via merging, a rise must render as bad.
 *
 * Exported for tests.
 */
export function indexHealthPanels(sitemaps: SitemapEntry[]): Panel[] {
  // Site verified but no sitemaps submitted: say so instead of silently
  // rendering a misleading 0% coverage (or nothing at all).
  if (sitemaps.length === 0) {
    return [
      {
        kind: "stat",
        label: "Sitemaps",
        value: 0,
        format: "number",
        caption: "No sitemaps submitted in Search Console",
      },
    ];
  }
  let submitted = 0;
  let indexed = 0;
  let errors = 0;
  let warnings = 0;
  const problem: { label: string; value: number; sublabel?: string }[] = [];
  for (const s of sitemaps) {
    const e = Number(s.errors ?? 0);
    const w = Number(s.warnings ?? 0);
    errors += e;
    warnings += w;
    for (const c of s.contents ?? []) {
      submitted += Number(c.submitted ?? 0);
      indexed += Number(c.indexed ?? 0);
    }
    if (e > 0 || w > 0) {
      problem.push({
        label: s.path ?? "(sitemap)",
        value: e,
        sublabel: `${e} error${e === 1 ? "" : "s"} · ${w} warning${w === 1 ? "" : "s"}`,
      });
    }
  }
  const coverage = submitted > 0 ? indexed / submitted : 0;
  const notIndexed = Math.max(0, submitted - indexed);

  const panels: Panel[] = [
    { kind: "stat", label: "Index coverage", value: coverage, format: "percent", caption: `${indexed.toLocaleString()} of ${submitted.toLocaleString()} URLs indexed` },
    { kind: "stat", label: "Not indexed", value: notIndexed, format: "compact", invertDelta: true, caption: "Submitted but not indexed" },
    { kind: "stat", label: "Crawl errors", value: errors, format: "number", invertDelta: true, caption: `${warnings.toLocaleString()} warning${warnings === 1 ? "" : "s"}` },
  ];
  if (problem.length > 0) {
    panels.push({
      kind: "breakdown",
      title: "Sitemaps needing attention",
      subtitle: "Sitemaps reporting crawl errors or warnings",
      display: "table",
      valueLabel: "Errors",
      rows: problem.sort((a, b) => b.value - a.value).slice(0, 10),
    });
  }
  return panels;
}

async function fetchLive(config: ScConfig, ctx: ConnectorContext): Promise<Panel[]> {
  // Honor the explicit window; clamp the end to today-2 so the not-yet-final
  // trailing GSC buckets don't read as zeros and drag totals down.
  const w = clampWindowEnd(resolveWindow(ctx), dateNDaysAgo(GSC_LATENCY_DAYS));
  const startDate = w.start;
  const endDate = w.end;

  const [totals, byDate, queries, pages, queryPages] = await Promise.all([
    query(config.siteUrl, { startDate, endDate, dimensions: [] }),
    query(config.siteUrl, { startDate, endDate, dimensions: ["date"] }),
    query(config.siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: 20 }),
    query(config.siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: 10 }),
    // Query→page pairing is additive and isolated: a failure here must never
    // drop the core search panels.
    query(config.siteUrl, { startDate, endDate, dimensions: ["query", "page"], rowLimit: 250 }).catch(
      (err) => {
        console.error(`[search-console] query→page pairs unavailable for ${config.siteUrl}:`, err);
        return { rows: [] as any[] };
      },
    ),
  ]);

  const t = totals.rows?.[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const ts = (byDate.rows ?? []).map((r) => ({
    x: r.keys?.[0] as string,
    clicks: r.clicks as number,
    impressions: r.impressions as number,
  }));

  const core = buildPanels(
    { clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: t.position },
    ts,
    (queries.rows ?? []).map((r) => keywordRow(r.keys?.[0], r.clicks, r.impressions, r.ctr, r.position)),
    (pages.rows ?? []).map((r) => ({ label: r.keys?.[0], value: r.clicks })),
    queryPageRows(queryPages.rows ?? []),
  );

  // Index/crawl health is isolated: a sitemaps failure never drops the core
  // search panels.
  let health: Panel[] = [];
  try {
    health = indexHealthPanels(await fetchSitemaps(config.siteUrl));
  } catch (err) {
    console.error(`[search-console] sitemaps unavailable for ${config.siteUrl}:`, err);
  }
  return [...core, ...health];
}

/**
 * Trim a page URL to its path (+ query string) for display. Non-URL strings
 * (already-relative paths, "(unknown)") pass through unchanged.
 *
 * Exported for tests.
 */
export function pagePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

interface QueryPageApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  position?: number;
}

/**
 * Top query→page pairs by clicks: label = the query, sublabel =
 * "page-path · Pos X.X · N impr", value = clicks. Rows arrive from the
 * Search Analytics API already unique per (query, page); we sort by clicks
 * and keep the top 10.
 *
 * Exported for tests.
 */
export function queryPageRows(
  rows: QueryPageApiRow[],
): { label: string; value: number; sublabel: string }[] {
  return rows
    .map((r) => ({
      query: r.keys?.[0] ?? "(unknown)",
      page: pagePath(r.keys?.[1] ?? ""),
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      position: Number(r.position ?? 0),
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10)
    .map((r) => ({
      label: r.query,
      value: r.clicks,
      sublabel: `${r.page} · Pos ${r.position.toFixed(1)} · ${Math.round(r.impressions).toLocaleString()} impr`,
    }));
}

/** A keyword row: clicks as the value, with position/CTR/impressions beneath. */
function keywordRow(
  keyword: string | undefined,
  clicks: number,
  impressions: number,
  ctr: number,
  position: number,
): { label: string; value: number; sublabel: string } {
  return {
    label: keyword ?? "(unknown)",
    value: clicks,
    sublabel: `Pos ${position.toFixed(1)} · ${(ctr * 100).toFixed(1)}% CTR · ${Math.round(impressions).toLocaleString()} impr`,
  };
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
    .map((label) => {
      const c = Math.floor(clicks * (0.02 + rand() * 0.12));
      const impr = Math.max(c, Math.floor(c * (8 + rand() * 30)));
      const pos = 1 + rand() * 25;
      return keywordRow(label, c, impr, impr ? c / impr : 0, pos);
    })
    .sort((a, b) => b.value - a.value);
  const pages = ["/", "/products", "/blog/guide", "/pricing", "/reviews"]
    .map((label) => ({ label, value: Math.floor(clicks * (0.04 + rand() * 0.2)) }))
    .sort((a, b) => b.value - a.value);

  // Pair queries with plausible pages so demo dashboards show the
  // query→page breakdown; same builder as live for parity.
  const pairPaths = ["/", "/products", "/blog/guide", "/pricing", "/reviews"];
  const pairs = queryPageRows(
    terms.map((term, i) => {
      const c = 1 + Math.floor(clicks * (0.015 + rand() * 0.1));
      return {
        keys: [term, `https://demo-site.example${pairPaths[i % pairPaths.length]}`],
        clicks: c,
        impressions: Math.max(c, Math.floor(c * (8 + rand() * 25))),
        position: 1 + rand() * 20,
      };
    }),
  );

  // Synthesize a sitemap so demo dashboards show index/crawl health too.
  const submitted = 200 + Math.floor(rand() * 4000);
  const indexed = Math.floor(submitted * (0.75 + rand() * 0.24));
  const errors = Math.floor(rand() * 6);
  const warnings = Math.floor(rand() * 12);
  const mockSitemaps: SitemapEntry[] = [
    { path: `${config.siteUrl}sitemap.xml`, errors, warnings, contents: [{ submitted, indexed }] },
  ];

  return [...buildPanels({ clicks, impressions, ctr, position }, ts, queries, pages, pairs), ...indexHealthPanels(mockSitemaps)];
}

function buildPanels(
  m: { clicks: number; impressions: number; ctr: number; position: number },
  ts: { x: string; clicks: number; impressions: number }[],
  queries: { label: string; value: number; sublabel?: string }[],
  pages: { label: string; value: number }[],
  queryPages: { label: string; value: number; sublabel?: string }[] = [],
): Panel[] {
  const panels: Panel[] = [
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
    { kind: "breakdown", title: "Keyword breakdown", subtitle: "Top search queries — clicks, position & CTR", display: "table", valueLabel: "Clicks", rows: queries },
    { kind: "breakdown", title: "Top landing pages", display: "table", valueLabel: "Clicks", rows: pages },
  ];
  if (queryPages.length > 0) {
    panels.push({
      kind: "breakdown",
      title: "Keywords by page",
      subtitle: "Which page ranks for which query — top pairs by clicks",
      display: "table",
      valueLabel: "Clicks",
      rows: queryPages,
    });
  }
  return panels;
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
