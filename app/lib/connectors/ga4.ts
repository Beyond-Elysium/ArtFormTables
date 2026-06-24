/**
 * Google Analytics 4 connector (GA4 Data API).
 * Auth: agency service account (Viewer on each property).
 */
import "server-only";
import type {
  Connector,
  ConnectorContext,
  ConnectorResult,
  Panel,
} from "./types";
import { hasServiceAccount, serviceAccountJson } from "./googleAuth";
import { mockDelta, mockSeries, rng } from "./mock";

interface Ga4Config {
  propertyId: string;
}

let client: import("@google-analytics/data").BetaAnalyticsDataClient | null =
  null;

async function getClient() {
  if (client) return client;
  const json = serviceAccountJson();
  const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
  client = new BetaAnalyticsDataClient({
    credentials: { client_email: json.client_email, private_key: json.private_key },
    projectId: json.project_id,
  });
  return client;
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

async function fetchLive(
  config: Ga4Config,
  ctx: ConnectorContext,
): Promise<Panel[]> {
  const ga = await getClient();
  const property = `properties/${config.propertyId}`;
  const days = ctx.days;
  const curr = { startDate: `${days}daysAgo`, endDate: "today" };
  const prev = { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` };

  const [overview] = await ga.runReport({
    property,
    dateRanges: [curr, prev],
    metrics: [
      { name: "totalUsers" },
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
  });
  const rows = overview.rows ?? [];
  const valsFor = (i: number) => {
    const r = rows.find((row) => row.dimensionValues?.[0]?.value === `date_range_${i}`);
    const m = r?.metricValues ?? [];
    return [0, 1, 2, 3, 4].map((k) => Number(m[k]?.value ?? 0));
  };
  const c = valsFor(0);
  const p = valsFor(1);

  const [ts] = await ga.runReport({
    property,
    dateRanges: [curr],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "totalUsers" }, { name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  const tsPoints = (ts.rows ?? []).map((row) => {
    const d = row.dimensionValues?.[0]?.value ?? "";
    return {
      x: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      users: Number(row.metricValues?.[0]?.value ?? 0),
      sessions: Number(row.metricValues?.[1]?.value ?? 0),
    };
  });

  const dim = async (
    dimension: string,
    metric: string,
    limit: number,
    extra?: string,
  ) => {
    const dimensions = [{ name: dimension }];
    if (extra) dimensions.push({ name: extra });
    const [res] = await ga.runReport({
      property,
      dateRanges: [curr],
      dimensions,
      metrics: [{ name: metric }],
      orderBys: [{ metric: { metricName: metric }, desc: true }],
      limit,
    });
    return (res.rows ?? []).map((row) => ({
      label: row.dimensionValues?.[0]?.value ?? "(not set)",
      sublabel: extra ? (row.dimensionValues?.[1]?.value ?? undefined) : undefined,
      value: Number(row.metricValues?.[0]?.value ?? 0),
    }));
  };

  const sources = await dim("sessionDefaultChannelGroup", "sessions", 6);
  const devices = await dim("deviceCategory", "totalUsers", 4);
  const pages = await dim("pagePath", "screenPageViews", 10, "pageTitle");

  return buildPanels(
    { users: c[0], sessions: c[1], pageviews: c[2], engagement: c[3], avgDur: c[4] },
    {
      users: pct(c[0], p[0]),
      sessions: pct(c[1], p[1]),
      pageviews: pct(c[2], p[2]),
      engagement: pct(c[3], p[3]),
    },
    tsPoints,
    sources,
    devices,
    pages.map((r) => ({ label: r.sublabel || r.label, value: r.value, sublabel: r.label })),
  );
}

function fetchMock(config: Ga4Config, ctx: ConnectorContext): Panel[] {
  const rand = rng(`ga4:${config.propertyId}:${ctx.range}`);
  const base = 200 + Math.floor(rand() * 800);
  const series = mockSeries(rand, ctx.days, base);
  const users = series.total;
  const sessions = Math.floor(users * (1.2 + rand() * 0.4));
  const pageviews = Math.floor(sessions * (2 + rand() * 1.5));
  const engagement = 0.45 + rand() * 0.35;
  const avgDur = 60 + Math.floor(rand() * 180);

  const tsPoints = series.points.map((pt) => ({
    x: pt.x,
    users: pt.y,
    sessions: Math.floor(pt.y * (1.2 + rand() * 0.3)),
  }));

  const sources = ["Organic Search", "Direct", "Referral", "Social", "Email", "Paid Search"]
    .map((label) => ({ label, value: Math.floor(sessions * (0.05 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);
  const devices = ["Desktop", "Mobile", "Tablet"].map((label, i) => ({
    label,
    value: Math.floor(users * [0.58, 0.36, 0.06][i]),
  }));
  const pages = [
    ["/", "Home"], ["/pricing", "Pricing"], ["/blog", "Blog"],
    ["/about", "About us"], ["/features", "Features"], ["/contact", "Contact"],
  ]
    .map(([path, title]) => ({ label: title, sublabel: path, value: Math.floor(pageviews * (0.03 + rand() * 0.18)) }))
    .sort((a, b) => b.value - a.value);

  return buildPanels(
    { users, sessions, pageviews, engagement, avgDur },
    { users: mockDelta(rand), sessions: mockDelta(rand), pageviews: mockDelta(rand), engagement: mockDelta(rand) },
    tsPoints,
    sources,
    devices,
    pages,
  );
}

function buildPanels(
  m: { users: number; sessions: number; pageviews: number; engagement: number; avgDur: number },
  d: { users: number; sessions: number; pageviews: number; engagement: number },
  ts: { x: string; users: number; sessions: number }[],
  sources: { label: string; value: number }[],
  devices: { label: string; value: number }[],
  pages: { label: string; value: number; sublabel?: string }[],
): Panel[] {
  return [
    { kind: "stat", label: "Users", value: m.users, format: "compact", delta: d.users },
    { kind: "stat", label: "Sessions", value: m.sessions, format: "compact", delta: d.sessions },
    { kind: "stat", label: "Pageviews", value: m.pageviews, format: "compact", delta: d.pageviews },
    { kind: "stat", label: "Engagement rate", value: m.engagement, format: "percent", delta: d.engagement },
    {
      kind: "timeseries",
      title: "Traffic over time",
      series: [
        { name: "Users", points: ts.map((p) => ({ x: p.x, y: p.users })) },
        { name: "Sessions", points: ts.map((p) => ({ x: p.x, y: p.sessions })) },
      ],
    },
    { kind: "breakdown", title: "Traffic sources", display: "donut", rows: sources },
    { kind: "breakdown", title: "Devices", display: "donut", rows: devices },
    { kind: "breakdown", title: "Top pages", display: "table", valueLabel: "Views", rows: pages },
  ];
}

export const ga4Connector: Connector<Ga4Config> = {
  type: "ga4",
  label: "Website Analytics",
  category: "Analytics",
  isLive: () => hasServiceAccount(),
  async fetch(config, ctx) {
    const base: Omit<ConnectorResult, "panels" | "isMock" | "error"> = {
      sourceId: "ga4",
      label: "Website Analytics",
      category: "Analytics",
    };
    if (!hasServiceAccount()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[ga4] live fetch failed for ${config.propertyId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
