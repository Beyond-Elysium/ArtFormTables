/**
 * GA4 data layer.
 *
 * Server-only. Wraps the Google Analytics Data API (GA4) using a single agency
 * service account that is a Viewer on every client's property. If no
 * GA_SERVICE_ACCOUNT_KEY is configured, deterministic MOCK data is returned so
 * the dashboards render during development.
 *
 * NEVER import this module from a client component — it would leak credentials.
 */
import "server-only";

export type DateRangePreset = "7d" | "28d" | "90d";

export interface Overview {
  users: number;
  sessions: number;
  pageviews: number;
  engagementRate: number; // 0..1
  avgSessionDuration: number; // seconds
  /** % change vs the previous equal-length period. */
  deltas: {
    users: number;
    sessions: number;
    pageviews: number;
    engagementRate: number;
  };
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD
  users: number;
  sessions: number;
}

export interface TopPage {
  path: string;
  title: string;
  views: number;
}

export interface NamedCount {
  name: string;
  value: number;
}

export interface DashboardData {
  overview: Overview;
  timeseries: TimeseriesPoint[];
  topPages: TopPage[];
  sources: NamedCount[];
  devices: NamedCount[];
  isMock: boolean;
}

const PRESET_DAYS: Record<DateRangePreset, number> = {
  "7d": 7,
  "28d": 28,
  "90d": 90,
};

export function isLive(): boolean {
  return Boolean(process.env.GA_SERVICE_ACCOUNT_KEY);
}

/* ------------------------------------------------------------------ *
 * Live GA4 implementation
 * ------------------------------------------------------------------ */

// Lazily created so the SDK is only loaded when credentials exist.
let analyticsClient: import("@google-analytics/data").BetaAnalyticsDataClient | null =
  null;

async function getClient() {
  if (analyticsClient) return analyticsClient;
  const raw = process.env.GA_SERVICE_ACCOUNT_KEY!;
  const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
  analyticsClient = new BetaAnalyticsDataClient({
    credentials: {
      client_email: json.client_email,
      private_key: json.private_key,
    },
    projectId: json.project_id,
  });
  return analyticsClient;
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

async function fetchLive(
  propertyId: string,
  preset: DateRangePreset,
): Promise<DashboardData> {
  const client = await getClient();
  const property = `properties/${propertyId}`;
  const days = PRESET_DAYS[preset];

  const curr = { startDate: `${days}daysAgo`, endDate: "today" };
  const prev = {
    startDate: `${days * 2}daysAgo`,
    endDate: `${days + 1}daysAgo`,
  };

  // Overview: current + previous period for deltas.
  const [overviewRes] = await client.runReport({
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
  const rows = overviewRes.rows ?? [];
  const valuesFor = (rangeIndex: number) => {
    const r = rows.find(
      (row) => row.dimensionValues?.[0]?.value === `date_range_${rangeIndex}`,
    );
    const m = r?.metricValues ?? [];
    return {
      users: Number(m[0]?.value ?? 0),
      sessions: Number(m[1]?.value ?? 0),
      pageviews: Number(m[2]?.value ?? 0),
      engagementRate: Number(m[3]?.value ?? 0),
      avgSessionDuration: Number(m[4]?.value ?? 0),
    };
  };
  const c = valuesFor(0);
  const p = valuesFor(1);

  // Timeseries (current period, by date).
  const [tsRes] = await client.runReport({
    property,
    dateRanges: [curr],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "totalUsers" }, { name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  const timeseries: TimeseriesPoint[] = (tsRes.rows ?? []).map((row) => {
    const d = row.dimensionValues?.[0]?.value ?? "";
    return {
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
      users: Number(row.metricValues?.[0]?.value ?? 0),
      sessions: Number(row.metricValues?.[1]?.value ?? 0),
    };
  });

  const topPages = await runDimReport(
    client,
    property,
    curr,
    "pagePath",
    "screenPageViews",
    10,
    "pageTitle",
  );
  const sources = await runDimReport(
    client,
    property,
    curr,
    "sessionDefaultChannelGroup",
    "sessions",
    6,
  );
  const devices = await runDimReport(
    client,
    property,
    curr,
    "deviceCategory",
    "totalUsers",
    4,
  );

  return {
    overview: {
      ...c,
      deltas: {
        users: pct(c.users, p.users),
        sessions: pct(c.sessions, p.sessions),
        pageviews: pct(c.pageviews, p.pageviews),
        engagementRate: pct(c.engagementRate, p.engagementRate),
      },
    },
    timeseries,
    topPages: topPages.map((r) => ({
      path: r.name,
      title: r.extra || r.name,
      views: r.value,
    })),
    sources: sources.map((r) => ({ name: r.name, value: r.value })),
    devices: devices.map((r) => ({ name: r.name, value: r.value })),
    isMock: false,
  };
}

async function runDimReport(
  client: Awaited<ReturnType<typeof getClient>>,
  property: string,
  range: { startDate: string; endDate: string },
  dimension: string,
  metric: string,
  limit: number,
  extraDimension?: string,
): Promise<{ name: string; value: number; extra?: string }[]> {
  const dimensions = [{ name: dimension }];
  if (extraDimension) dimensions.push({ name: extraDimension });
  const [res] = await client.runReport({
    property,
    dateRanges: [range],
    dimensions,
    metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }],
    limit,
  });
  return (res.rows ?? []).map((row) => ({
    name: row.dimensionValues?.[0]?.value ?? "(not set)",
    extra: extraDimension
      ? (row.dimensionValues?.[1]?.value ?? undefined)
      : undefined,
    value: Number(row.metricValues?.[0]?.value ?? 0),
  }));
}

/* ------------------------------------------------------------------ *
 * Deterministic mock implementation
 * ------------------------------------------------------------------ */

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMock(propertyId: string, preset: DateRangePreset): DashboardData {
  const days = PRESET_DAYS[preset];
  const rand = mulberry32(seedFrom(propertyId + preset));
  const base = 200 + Math.floor(rand() * 800);

  const timeseries: TimeseriesPoint[] = [];
  let totalUsers = 0;
  let totalSessions = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const users = Math.floor(base * (weekend ? 0.6 : 1) * (0.7 + rand() * 0.6));
    const sessions = Math.floor(users * (1.1 + rand() * 0.5));
    totalUsers += users;
    totalSessions += sessions;
    timeseries.push({ date: d.toISOString().slice(0, 10), users, sessions });
  }

  const pageviews = Math.floor(totalSessions * (2 + rand() * 1.5));
  const engagementRate = 0.45 + rand() * 0.35;

  const delta = () => Math.round((rand() * 40 - 12) * 10) / 10;

  const pagePaths = [
    ["/", "Home"],
    ["/pricing", "Pricing"],
    ["/blog", "Blog"],
    ["/about", "About us"],
    ["/contact", "Contact"],
    ["/features", "Features"],
    ["/docs", "Documentation"],
    ["/signup", "Sign up"],
  ];
  const topPages: TopPage[] = pagePaths
    .map(([path, title]) => ({
      path,
      title,
      views: Math.floor(pageviews * (0.02 + rand() * 0.18)),
    }))
    .sort((a, b) => b.views - a.views);

  const channels = ["Organic Search", "Direct", "Referral", "Social", "Email", "Paid Search"];
  const sources: NamedCount[] = channels
    .map((name) => ({ name, value: Math.floor(totalSessions * (0.05 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);

  const deviceSplit = [0.58, 0.36, 0.06];
  const devices: NamedCount[] = ["Desktop", "Mobile", "Tablet"].map((name, i) => ({
    name,
    value: Math.floor(totalUsers * deviceSplit[i]),
  }));

  return {
    overview: {
      users: totalUsers,
      sessions: totalSessions,
      pageviews,
      engagementRate,
      avgSessionDuration: 60 + Math.floor(rand() * 180),
      deltas: {
        users: delta(),
        sessions: delta(),
        pageviews: delta(),
        engagementRate: delta(),
      },
    },
    timeseries,
    topPages,
    sources,
    devices,
    isMock: true,
  };
}

/* ------------------------------------------------------------------ *
 * Public entrypoint
 * ------------------------------------------------------------------ */

export async function getDashboardData(
  propertyId: string,
  preset: DateRangePreset = "28d",
): Promise<DashboardData> {
  if (!isLive()) return buildMock(propertyId, preset);
  try {
    return await fetchLive(propertyId, preset);
  } catch (err) {
    // Surface the failure in logs but keep the dashboard usable with mock data.
    console.error(`[ga] live fetch failed for property ${propertyId}:`, err);
    return { ...buildMock(propertyId, preset), isMock: true };
  }
}
