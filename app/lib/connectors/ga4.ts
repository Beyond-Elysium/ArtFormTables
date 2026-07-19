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
import {
  googleOAuthClient,
  hasGoogleAuth,
  hasOAuth,
  serviceAccountJson,
} from "./googleAuth";
import { isPlaceholderId } from "./placeholder";
import { previousWindow, resolveWindow } from "./dates";
import { AI_SOURCE_TOKENS, computeAiScore, matchAiSource, type AiScore, type AiSignals } from "./aiSources";
import { mockDelta, mockSeries, rng } from "./mock";

interface Ga4Config {
  propertyId: string;
  /**
   * Include the AI-insights block (AI Score, AI-referred sessions/pages/
   * assistants). Defaults to true; set false on secondary properties (e.g.
   * BBBNP CISR/IRI) whose section should not repeat the full AI block.
   */
  aiInsights?: boolean;
}

let client: import("@google-analytics/data").BetaAnalyticsDataClient | null =
  null;

async function getClient() {
  if (client) return client;
  const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
  if (hasOAuth()) {
    // OAuth Web client: drive the Data API with the agency's OAuth2 client.
    // The Data API accepts an OAuth2Client at runtime; its types only list
    // service-account JSON clients, so suppress the narrow type here.
    // @ts-expect-error -- OAuth2Client is a valid authClient at runtime
    client = new BetaAnalyticsDataClient({ authClient: googleOAuthClient() });
  } else {
    const json = serviceAccountJson();
    client = new BetaAnalyticsDataClient({
      credentials: { client_email: json.client_email, private_key: json.private_key },
      projectId: json.project_id,
    });
  }
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
  // Honor the explicit window (custom ranges, comparison windows). The
  // connector's own previous period — used for the per-stat deltas — is the
  // immediately-preceding window of equal length.
  const w = resolveWindow(ctx);
  const p0 = previousWindow(w);
  const curr = { startDate: w.start, endDate: w.end };
  const prev = { startDate: p0.start, endDate: p0.end };

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

  const corePanels = buildPanels(
    { users: c[0], sessions: c[1], pageviews: c[2], engagement: c[3], avgDur: c[4] },
    {
      users: pct(c[0], p[0]),
      sessions: pct(c[1], p[1]),
      pageviews: pct(c[2], p[2]),
      engagement: pct(c[3], p[3]),
      avgDur: pct(c[4], p[4]),
    },
    tsPoints,
    sources,
    devices,
    pages.map((r) => ({ label: r.sublabel || r.label, value: r.value, sublabel: r.label })),
  );

  // AI insights are additive and isolated: if these extra reports fail (e.g. a
  // property that rejects a dimension) the core dashboard still renders live.
  // Secondary properties can opt out via `aiInsights: false` in the registry.
  const ai =
    config.aiInsights === false
      ? []
      : await fetchAiInsights(ga, property, curr, prev, c[1], c[3]);
  return [...corePanels, ...ai];
}

/* ------------------------------------------------------------------ *
 * AI insights (AI-referred pages, AI assistants, AI Score)
 * ------------------------------------------------------------------ */

type Ga = Awaited<ReturnType<typeof getClient>>;
type Range = { startDate: string; endDate: string };

async function fetchAiInsights(
  ga: Ga,
  property: string,
  curr: Range,
  prev: Range,
  totalSessions: number,
  siteEngagementRate: number,
): Promise<Panel[]> {
  // Server-side filter: only rows whose sessionSource contains an AI host
  // token. Keeps the (typically low-volume) AI rows from being dropped by a
  // row cap, and shrinks the payload to just what we need.
  const aiSourceFilter = {
    orGroup: {
      expressions: AI_SOURCE_TOKENS.map((value) => ({
        filter: {
          fieldName: "sessionSource",
          stringFilter: { matchType: "CONTAINS" as const, value, caseSensitive: false },
        },
      })),
    },
  };

  try {
    // Current-period sessions + engaged sessions per AI source.
    const [srcRes] = await ga.runReport({
      property,
      dateRanges: [curr],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }, { name: "engagedSessions" }],
      dimensionFilter: aiSourceFilter,
      limit: 250,
    });
    let aiSessions = 0;
    let aiEngaged = 0;
    const byAssistant = new Map<string, number>();
    for (const row of srcRes.rows ?? []) {
      const hit = matchAiSource(row.dimensionValues?.[0]?.value ?? "");
      if (!hit) continue;
      const sessions = Number(row.metricValues?.[0]?.value ?? 0);
      aiSessions += sessions;
      aiEngaged += Number(row.metricValues?.[1]?.value ?? 0);
      byAssistant.set(hit.label, (byAssistant.get(hit.label) ?? 0) + sessions);
    }

    // Previous-period AI sessions (for momentum).
    const [srcPrev] = await ga.runReport({
      property,
      dateRanges: [prev],
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: aiSourceFilter,
      limit: 250,
    });
    let prevAiSessions = 0;
    for (const row of srcPrev.rows ?? []) {
      if (matchAiSource(row.dimensionValues?.[0]?.value ?? "")) {
        prevAiSessions += Number(row.metricValues?.[0]?.value ?? 0);
      }
    }

    // Landing page × source → which pages AI surfaces, and via which assistant.
    // Same server-side AI filter, higher cap: coverage counts every AI page.
    const [pageRes] = await ga.runReport({
      property,
      dateRanges: [curr],
      dimensions: [{ name: "landingPagePlusQueryString" }, { name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: aiSourceFilter,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 1000,
    });
    const byPage = new Map<string, { sessions: number; top: string; topN: number }>();
    for (const row of pageRes.rows ?? []) {
      const hit = matchAiSource(row.dimensionValues?.[1]?.value ?? "");
      if (!hit) continue;
      const page = row.dimensionValues?.[0]?.value ?? "(not set)";
      const sessions = Number(row.metricValues?.[0]?.value ?? 0);
      const e = byPage.get(page) ?? { sessions: 0, top: hit.label, topN: 0 };
      e.sessions += sessions;
      if (sessions > e.topN) {
        e.top = hit.label;
        e.topN = sessions;
      }
      byPage.set(page, e);
    }

    const signals: AiSignals = {
      aiSessions,
      totalSessions,
      prevAiSessions,
      aiEngagedSessions: aiEngaged,
      siteEngagementRate,
      distinctSources: byAssistant.size,
      distinctPages: byPage.size,
    };
    const score = computeAiScore(signals);

    const pageRows = [...byPage.entries()]
      .sort((a, b) => b[1].sessions - a[1].sessions)
      .slice(0, 10)
      .map(([label, v]) => ({ label, value: v.sessions, sublabel: `via ${v.top}` }));
    const assistantRows = [...byAssistant.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);

    return aiPanels(score, aiSessions, pageRows, assistantRows);
  } catch (err) {
    console.error("[ga4] AI insights unavailable:", err);
    return [];
  }
}

function aiPanels(
  score: AiScore,
  aiSessions: number,
  pages: { label: string; value: number; sublabel?: string }[],
  assistants: { label: string; value: number }[],
): Panel[] {
  const panels: Panel[] = [
    {
      kind: "stat",
      label: "AI Score",
      value: score.score,
      format: "number",
      caption: `Grade ${score.grade} · ${(score.share * 100).toFixed(1)}% of sessions from AI`,
    },
    {
      kind: "stat",
      label: "AI-referred sessions",
      value: aiSessions,
      format: "compact",
      delta: score.trendPct,
    },
  ];
  if (pages.length > 0) {
    panels.push({
      kind: "breakdown",
      title: "AI-referred pages",
      subtitle: "Landing pages surfaced by AI assistants",
      display: "table",
      valueLabel: "Sessions",
      rows: pages,
    });
  }
  if (assistants.length > 0) {
    panels.push({
      kind: "breakdown",
      title: "AI assistants",
      subtitle: "Which answer engines send traffic",
      display: "donut",
      rows: assistants,
    });
  }
  return panels;
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

  const corePanels = buildPanels(
    { users, sessions, pageviews, engagement, avgDur },
    { users: mockDelta(rand), sessions: mockDelta(rand), pageviews: mockDelta(rand), engagement: mockDelta(rand), avgDur: mockDelta(rand) },
    tsPoints,
    sources,
    devices,
    pages,
  );

  // Secondary properties can opt out of the AI block (see Ga4Config).
  if (config.aiInsights === false) return corePanels;

  // Synthesize plausible AI-referral data so demo dashboards show the feature.
  const aiShare = 0.008 + rand() * 0.03; // ~0.8%–3.8% of sessions
  const aiSessions = Math.max(1, Math.floor(sessions * aiShare));
  const prevAiSessions = Math.max(1, Math.floor(aiSessions * (0.6 + rand() * 0.8)));
  const aiEngaged = Math.floor(aiSessions * (0.5 + rand() * 0.4));
  const assistantMix: [string, number][] = [
    ["ChatGPT", 0.5], ["Perplexity", 0.2], ["Gemini", 0.15], ["Copilot", 0.1], ["Claude", 0.05],
  ];
  const nAssistants = 2 + Math.floor(rand() * 4);
  const assistantRows = assistantMix
    .slice(0, nAssistants)
    .map(([label, wt]) => ({ label, value: Math.max(1, Math.floor(aiSessions * wt)) }))
    .sort((a, b) => b.value - a.value);
  const distinctPages = 3 + Math.floor(rand() * 22);
  const pageRows = [["/", "Home"], ["/pricing", "Pricing"], ["/blog/guide", "Guide"], ["/product", "Product"], ["/faq", "FAQ"], ["/about", "About"]]
    .slice(0, Math.min(6, distinctPages))
    .map(([path], i) => ({
      label: path,
      value: Math.max(1, Math.floor(aiSessions * (0.32 - i * 0.045))),
      sublabel: `via ${assistantRows[i % assistantRows.length].label}`,
    }))
    .filter((r) => r.value > 0);
  const score = computeAiScore({
    aiSessions,
    totalSessions: sessions,
    prevAiSessions,
    aiEngagedSessions: aiEngaged,
    siteEngagementRate: engagement,
    distinctSources: assistantRows.length,
    distinctPages,
  });

  return [...corePanels, ...aiPanels(score, aiSessions, pageRows, assistantRows)];
}

function buildPanels(
  m: { users: number; sessions: number; pageviews: number; engagement: number; avgDur: number },
  d: { users: number; sessions: number; pageviews: number; engagement: number; avgDur: number },
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
    { kind: "stat", label: "Avg. session duration", value: m.avgDur, format: "duration", delta: d.avgDur },
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
  isLive: () => hasGoogleAuth(),
  async fetch(config, ctx) {
    const base: Omit<ConnectorResult, "panels" | "isMock" | "error"> = {
      sourceId: "ga4",
      label: "Website Analytics",
      category: "Analytics",
    };
    // A placeholder property id (all zeros) can't resolve — serve mock directly.
    if (!hasGoogleAuth() || isPlaceholderId(config.propertyId))
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[ga4] live fetch failed for ${config.propertyId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
