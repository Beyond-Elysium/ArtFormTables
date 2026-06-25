/**
 * Matomo connector — Reporting API.
 * Auth: token_auth (sent in the POST body, not the URL, to keep it out of logs).
 *
 * Env: MATOMO_BASE_URL (e.g. https://analytics.example.com), MATOMO_TOKEN.
 * Config: { siteId }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, rangeDates } from "./util";

interface MatomoConfig {
  siteId: string | number;
}

function token(): string | undefined {
  return process.env.MATOMO_TOKEN;
}
function baseUrl(): string | undefined {
  return process.env.MATOMO_BASE_URL;
}

function isConfigured(): boolean {
  return Boolean(token() && baseUrl());
}

async function api(method: string, extra: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({
    module: "API",
    method,
    format: "json",
    token_auth: token()!,
    ...extra,
  });
  const res = await fetch(`${baseUrl()!.replace(/\/$/, "")}/index.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Matomo ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json?.result === "error") throw new Error(`Matomo API: ${json.message}`);
  return json;
}

async function fetchLive(config: MatomoConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const { start, end } = rangeDates(ctx.days);
  const dateRange = `${start},${end}`;
  const idSite = String(config.siteId);

  const [summary, daily, referrers] = await Promise.all([
    api("VisitsSummary.get", { idSite, period: "range", date: dateRange }),
    api("VisitsSummary.get", { idSite, period: "day", date: dateRange }),
    api("Referrers.getReferrerType", { idSite, period: "range", date: dateRange }),
  ]);

  const visits = num(summary.nb_visits);
  const actions = num(summary.nb_actions);
  const uniq = num(summary.nb_uniq_visitors);
  const bounceRate = visits ? num(summary.bounce_count) / visits : 0;
  const avgTime = num(summary.avg_time_on_site);

  // `daily` is an object keyed by YYYY-MM-DD → { nb_visits, nb_actions }.
  const ts = Object.entries(daily as Record<string, any>)
    .map(([x, v]) => ({ x, visits: num(v?.nb_visits), actions: num(v?.nb_actions) }))
    .sort((a, b) => a.x.localeCompare(b.x));

  const sources = ((referrers as any[]) ?? [])
    .map((r) => ({ label: r.label ?? "Unknown", value: num(r.nb_visits) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return buildPanels({ visits, uniq, actions, bounceRate, avgTime }, ts, sources);
}

function fetchMock(config: MatomoConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`matomo:${config.siteId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 120 + Math.floor(rand() * 400));
  const visits = series.total;
  const uniq = Math.floor(visits * (0.7 + rand() * 0.2));
  const ts = series.points.map((pt) => ({ x: pt.x, visits: pt.y, actions: Math.floor(pt.y * (2 + rand() * 2)) }));
  const actions = ts.reduce((a, b) => a + b.actions, 0);
  const bounceRate = 0.3 + rand() * 0.3;
  const avgTime = 50 + Math.floor(rand() * 150);
  const sources = ["Direct Entry", "Search Engines", "Websites", "Social Networks", "Campaigns"]
    .map((label) => ({ label, value: Math.floor(visits * (0.05 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ visits, uniq, actions, bounceRate, avgTime }, ts, sources, rand);
}

function buildPanels(
  m: { visits: number; uniq: number; actions: number; bounceRate: number; avgTime: number },
  ts: { x: string; visits: number; actions: number }[],
  sources: { label: string; value: number }[],
  rand?: () => number,
): Panel[] {
  const delta = () => (rand ? mockDelta(rand) : undefined);
  return [
    { kind: "stat", label: "Visits", value: m.visits, format: "compact", delta: delta() },
    { kind: "stat", label: "Unique visitors", value: m.uniq, format: "compact", delta: delta() },
    { kind: "stat", label: "Bounce rate", value: m.bounceRate, format: "percent", invertDelta: true, delta: delta() },
    { kind: "stat", label: "Avg. time on site", value: m.avgTime, format: "duration" },
    {
      kind: "timeseries",
      title: "Visits & actions",
      series: [
        { name: "Visits", points: ts.map((p) => ({ x: p.x, y: p.visits })) },
        { name: "Actions", points: ts.map((p) => ({ x: p.x, y: p.actions })) },
      ],
    },
    { kind: "breakdown", title: "Referrer types", display: "donut", rows: sources },
  ];
}

export const matomoConnector: Connector<MatomoConfig> = {
  type: "matomo",
  label: "Matomo Analytics",
  category: "Analytics",
  isLive: () => isConfigured(),
  async fetch(config, ctx) {
    const base = { sourceId: "matomo", label: "Matomo Analytics", category: "Analytics" };
    if (!isConfigured()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[matomo] live fetch failed for ${config.siteId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
