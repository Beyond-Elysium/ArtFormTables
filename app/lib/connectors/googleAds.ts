/**
 * Google Ads connector.
 *
 * Auth differs from the Google service-account APIs: the Google Ads API needs a
 * developer token plus an OAuth2 refresh token (an installed-app / web OAuth
 * client authorized by an account that can see the customer). When all
 * credentials are present this fetches live data over REST; otherwise it serves
 * deterministic mock data so the dashboard still renders.
 *
 * Required env (see .env.example):
 *   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *   GOOGLE_ADS_OAUTH_REFRESH_TOKEN, optional GOOGLE_ADS_LOGIN_CUSTOMER_ID (MCC),
 *   optional GOOGLE_ADS_API_VERSION (defaults to v18).
 */
import "server-only";
import type { Connector, ConnectorContext, ConnectorResult, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";

interface AdsConfig {
  /** Customer id, with or without dashes (e.g. "111-111-1111"). */
  customerId: string;
  currency?: string;
}

interface AdsMetrics {
  cost: number;
  clicks: number;
  conversions: number;
  ctr: number;
}
interface AdsDeltas {
  cost: number;
  clicks: number;
  conversions: number;
  ctr: number;
}

// OAuth client/secret/refresh-token fall back to the shared GOOGLE_OAUTH_*
// vars, so one Web OAuth client (with a refresh token scoped for both Analytics
// and AdWords) powers GA4, Search Console, and Google Ads. Ads still needs its
// own developer token + login-customer-id.
function adsClientId(): string | undefined {
  return process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
}
function adsClientSecret(): string | undefined {
  return process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;
}
function adsRefreshToken(): string | undefined {
  return process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
}

function hasAdsCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      adsRefreshToken() &&
      adsClientId() &&
      adsClientSecret(),
  );
}

/* ------------------------------------------------------------------ *
 * Live: OAuth refresh-token exchange + GAQL searchStream
 * ------------------------------------------------------------------ */

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v18";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const body = new URLSearchParams({
    client_id: adsClientId()!,
    client_secret: adsClientSecret()!,
    refresh_token: adsRefreshToken()!,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google Ads OAuth ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pct(curr: number, prev: number): number {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

interface AdsRow {
  campaign?: { name?: string };
  metrics?: {
    costMicros?: string | number;
    clicks?: string | number;
    impressions?: string | number;
    conversions?: string | number;
  };
  segments?: { date?: string };
}

async function searchStream(
  customerId: string,
  token: string,
  query: string,
): Promise<AdsRow[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    "Content-Type": "application/json",
  };
  const login = digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "");
  if (login) headers["login-customer-id"] = login;

  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Google Ads ${res.status}: ${await res.text()}`);
  }
  // searchStream returns an array of batches: [{ results: [...] }, ...]
  const data = (await res.json()) as { results?: AdsRow[] }[] | { results?: AdsRow[] };
  const batches = Array.isArray(data) ? data : [data];
  return batches.flatMap((b) => b.results ?? []);
}

function num(v: string | number | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

async function fetchLive(config: AdsConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const customerId = digits(config.customerId);
  const token = await getAccessToken();

  const start = dateNDaysAgo(ctx.days - 1);
  const end = dateNDaysAgo(0);
  const prevStart = dateNDaysAgo(ctx.days * 2 - 1);
  const prevEnd = dateNDaysAgo(ctx.days);

  // Current period: per-campaign, per-day (drives totals, timeseries, breakdown).
  const currentRows = await searchStream(
    customerId,
    token,
    `SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions,
            metrics.conversions, segments.date
     FROM campaign
     WHERE segments.date BETWEEN '${start}' AND '${end}'`,
  );
  // Previous period: account-level totals for deltas.
  const prevRows = await searchStream(
    customerId,
    token,
    `SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
     FROM customer
     WHERE segments.date BETWEEN '${prevStart}' AND '${prevEnd}'`,
  );

  let cost = 0;
  let clicks = 0;
  let impressions = 0;
  let conversions = 0;
  const byDate = new Map<string, { cost: number; clicks: number }>();
  const byCampaign = new Map<string, number>();

  for (const r of currentRows) {
    const m = r.metrics ?? {};
    const c = num(m.costMicros) / 1_000_000;
    const cl = num(m.clicks);
    cost += c;
    clicks += cl;
    impressions += num(m.impressions);
    conversions += num(m.conversions);

    const date = r.segments?.date;
    if (date) {
      const e = byDate.get(date) ?? { cost: 0, clicks: 0 };
      e.cost += c;
      e.clicks += cl;
      byDate.set(date, e);
    }
    const name = r.campaign?.name ?? "(unknown campaign)";
    byCampaign.set(name, (byCampaign.get(name) ?? 0) + c);
  }

  let pCost = 0;
  let pClicks = 0;
  let pImpr = 0;
  let pConv = 0;
  for (const r of prevRows) {
    const m = r.metrics ?? {};
    pCost += num(m.costMicros) / 1_000_000;
    pClicks += num(m.clicks);
    pImpr += num(m.impressions);
    pConv += num(m.conversions);
  }

  const ctr = impressions ? clicks / impressions : 0;
  const pCtr = pImpr ? pClicks / pImpr : 0;

  const ts = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([x, v]) => ({ x, cost: v.cost, clicks: v.clicks }));
  const campaigns = [...byCampaign.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return buildPanels(
    currency,
    { cost, clicks, conversions, ctr },
    {
      cost: pct(cost, pCost),
      clicks: pct(clicks, pClicks),
      conversions: pct(conversions, pConv),
      ctr: pct(ctr, pCtr),
    },
    ts,
    campaigns,
  );
}

/* ------------------------------------------------------------------ *
 * Mock
 * ------------------------------------------------------------------ */

function fetchMock(config: AdsConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`ads:${config.customerId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 300 + Math.floor(rand() * 700));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (15 + rand() * 25));
  const cpc = 0.6 + rand() * 2.4;
  const cost = Math.round(clicks * cpc);
  const conversions = Math.floor(clicks * (0.02 + rand() * 0.06));
  const ctr = clicks / impressions;

  const ts = series.points.map((pt) => ({
    x: pt.x,
    cost: Math.round(pt.y * cpc),
    clicks: pt.y,
  }));
  const campaigns = ["Brand — Search", "Generic — Search", "Retargeting", "Shopping", "Display Prospecting"]
    .map((label) => ({ label, value: Math.floor(cost * (0.08 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);

  return buildPanels(
    currency,
    { cost, clicks, conversions, ctr },
    { cost: mockDelta(rand), clicks: mockDelta(rand), conversions: mockDelta(rand), ctr: mockDelta(rand) },
    ts,
    campaigns,
  );
}

/* ------------------------------------------------------------------ *
 * Shared panel shaping
 * ------------------------------------------------------------------ */

function buildPanels(
  currency: string,
  m: AdsMetrics,
  d: AdsDeltas,
  ts: { x: string; cost: number; clicks: number }[],
  campaigns: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Spend", value: m.cost, format: "currency", currency, delta: d.cost, invertDelta: true },
    { kind: "stat", label: "Clicks", value: m.clicks, format: "compact", delta: d.clicks },
    { kind: "stat", label: "Conversions", value: m.conversions, format: "number", delta: d.conversions },
    { kind: "stat", label: "CTR", value: m.ctr, format: "percent", delta: d.ctr },
    {
      kind: "timeseries",
      title: "Spend & clicks",
      series: [
        { name: `Spend (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.cost })) },
        { name: "Clicks", points: ts.map((p) => ({ x: p.x, y: p.clicks })) },
      ],
    },
    { kind: "breakdown", title: "Top campaigns by spend", display: "bar", valueLabel: "Spend", valueFormat: "currency", rows: campaigns },
  ];
}

export const googleAdsConnector: Connector<AdsConfig> = {
  type: "google-ads",
  label: "Google Ads",
  category: "Advertising",
  isLive: () => hasAdsCredentials(),
  async fetch(config, ctx) {
    const base = { sourceId: "google-ads", label: "Google Ads", category: "Advertising" };
    if (!hasAdsCredentials()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[google-ads] live fetch failed for ${config.customerId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
