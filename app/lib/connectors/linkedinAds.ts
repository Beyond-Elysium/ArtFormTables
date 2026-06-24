/**
 * LinkedIn Ads connector — Marketing API adAnalytics.
 * Auth: OAuth2 bearer token with r_ads_reporting.
 *
 * Env: LINKEDIN_ACCESS_TOKEN, optional LINKEDIN_API_VERSION (YYYYMM, default 202405).
 * Config: { accountId }  (numeric sponsored-account id).
 *
 * Note: LinkedIn uses Rest.li 2.0 — the parenthesised params must NOT be
 * percent-encoded, so the query string is assembled by hand. Field/version
 * tuning may be needed against your account; the mock fallback keeps the
 * dashboard rendering meanwhile.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, pct, rangeDates } from "./util";

interface LinkedInConfig {
  accountId: string;
  currency?: string;
}

const API_VERSION = process.env.LINKEDIN_API_VERSION || "202405";

function hasToken(): boolean {
  return Boolean(process.env.LINKEDIN_ACCESS_TOKEN);
}

function ymd(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y, month: m, day: d };
}

async function analytics(
  accountId: string,
  start: string,
  end: string,
): Promise<any[]> {
  const s = ymd(start);
  const e = ymd(end);
  const dateRange = `(start:(year:${s.year},month:${s.month},day:${s.day}),end:(year:${e.year},month:${e.month},day:${e.day}))`;
  const account = `urn:li:sponsoredAccount:${accountId}`;
  const fields = "costInLocalCurrency,impressions,clicks,dateRange,pivotValues";
  const query =
    `q=analytics&timeGranularity=DAILY&pivot=CAMPAIGN` +
    `&dateRange=${dateRange}&accounts=List(${encodeURIComponent(account)})&fields=${fields}`;

  const res = await fetch(`https://api.linkedin.com/rest/adAnalytics?${query}`, {
    headers: {
      Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN!}`,
      "LinkedIn-Version": API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.elements ?? [];
}

async function fetchLive(config: LinkedInConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);
  const [current, prev] = await Promise.all([
    analytics(config.accountId, start, end),
    analytics(config.accountId, prevStart, prevEnd),
  ]);

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  const byDate = new Map<string, { spend: number; clicks: number }>();
  const byCampaign = new Map<string, number>();

  for (const el of current) {
    const c = num(el.costInLocalCurrency);
    const cl = num(el.clicks);
    spend += c;
    clicks += cl;
    impressions += num(el.impressions);
    const d = el.dateRange?.start;
    if (d) {
      const key = `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
      const e = byDate.get(key) ?? { spend: 0, clicks: 0 };
      e.spend += c;
      e.clicks += cl;
      byDate.set(key, e);
    }
    const urn = (el.pivotValues ?? [])[0] as string | undefined;
    const label = urn ? `Campaign ${urn.split(":").pop()}` : "(unknown)";
    byCampaign.set(label, (byCampaign.get(label) ?? 0) + c);
  }

  let pSpend = 0;
  let pClicks = 0;
  let pImpr = 0;
  for (const el of prev) {
    pSpend += num(el.costInLocalCurrency);
    pClicks += num(el.clicks);
    pImpr += num(el.impressions);
  }

  const ctr = impressions ? clicks / impressions : 0;
  const pCtr = pImpr ? pClicks / pImpr : 0;
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, v]) => ({ x, ...v }));
  const campaigns = [...byCampaign.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: pct(spend, pSpend), impressions: pct(impressions, pImpr), clicks: pct(clicks, pClicks), ctr: pct(ctr, pCtr) },
    ts,
    campaigns,
  );
}

function fetchMock(config: LinkedInConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`li:${config.accountId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 80 + Math.floor(rand() * 200));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (30 + rand() * 50));
  const cpc = 3 + rand() * 6;
  const spend = Math.round(clicks * cpc);
  const ctr = clicks / impressions;
  const ts = series.points.map((pt) => ({ x: pt.x, spend: Math.round(pt.y * cpc), clicks: pt.y }));
  const campaigns = ["Sponsored Content — ABM", "Lead Gen — Webinar", "Thought Leadership", "Retargeting", "Job Ads"]
    .map((label) => ({ label, value: Math.floor(spend * (0.08 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: mockDelta(rand), impressions: mockDelta(rand), clicks: mockDelta(rand), ctr: mockDelta(rand) },
    ts,
    campaigns,
  );
}

function buildPanels(
  currency: string,
  m: { spend: number; impressions: number; clicks: number; ctr: number },
  d: { spend: number; impressions: number; clicks: number; ctr: number },
  ts: { x: string; spend: number; clicks: number }[],
  campaigns: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Spend", value: m.spend, format: "currency", currency, delta: d.spend, invertDelta: true },
    { kind: "stat", label: "Impressions", value: m.impressions, format: "compact", delta: d.impressions },
    { kind: "stat", label: "Clicks", value: m.clicks, format: "compact", delta: d.clicks },
    { kind: "stat", label: "CTR", value: m.ctr, format: "percent", delta: d.ctr },
    {
      kind: "timeseries",
      title: "Spend & clicks",
      series: [
        { name: `Spend (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.spend })) },
        { name: "Clicks", points: ts.map((p) => ({ x: p.x, y: p.clicks })) },
      ],
    },
    { kind: "breakdown", title: "Top campaigns by spend", display: "bar", valueLabel: "Spend", valueFormat: "currency", rows: campaigns },
  ];
}

export const linkedinAdsConnector: Connector<LinkedInConfig> = {
  type: "linkedin-ads",
  label: "LinkedIn Ads",
  category: "Advertising",
  isLive: () => hasToken(),
  async fetch(config, ctx) {
    const base = { sourceId: "linkedin-ads", label: "LinkedIn Ads", category: "Advertising" };
    if (!hasToken()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[linkedin-ads] live fetch failed for ${config.accountId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
