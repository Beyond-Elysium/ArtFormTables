/**
 * Pinterest Ads connector — Ads API v5 analytics.
 * Auth: OAuth2 bearer token with ads:read.
 *
 * Env: PINTEREST_ACCESS_TOKEN.  Config: { adAccountId }, optional currency.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, pct, rangeDates } from "./util";

interface PinterestConfig {
  adAccountId: string;
  currency?: string;
}

function token(): string | undefined {
  return process.env.PINTEREST_ACCESS_TOKEN;
}

async function analytics(adAccountId: string, start: string, end: string): Promise<any[]> {
  const qs = new URLSearchParams({
    start_date: start,
    end_date: end,
    granularity: "DAY",
    columns: "SPEND_IN_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1",
  });
  const res = await fetch(
    `https://api.pinterest.com/v5/ad_accounts/${adAccountId}/analytics?${qs}`,
    { headers: { Authorization: `Bearer ${token()!}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Pinterest ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data ?? []);
}

async function fetchLive(config: PinterestConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);
  const [current, prev] = await Promise.all([
    analytics(config.adAccountId, start, end),
    analytics(config.adAccountId, prevStart, prevEnd),
  ]);

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  const ts = current.map((r) => {
    spend += num(r.SPEND_IN_DOLLAR);
    impressions += num(r.IMPRESSION_1);
    clicks += num(r.CLICKTHROUGH_1);
    return { x: String(r.DATE).slice(0, 10), spend: num(r.SPEND_IN_DOLLAR), clicks: num(r.CLICKTHROUGH_1) };
  });
  let pSpend = 0;
  let pClicks = 0;
  let pImpr = 0;
  for (const r of prev) {
    pSpend += num(r.SPEND_IN_DOLLAR);
    pClicks += num(r.CLICKTHROUGH_1);
    pImpr += num(r.IMPRESSION_1);
  }
  const ctr = impressions ? clicks / impressions : 0;
  const pCtr = pImpr ? pClicks / pImpr : 0;

  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: pct(spend, pSpend), impressions: pct(impressions, pImpr), clicks: pct(clicks, pClicks), ctr: pct(ctr, pCtr) },
    ts,
  );
}

function fetchMock(config: PinterestConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`pinterest:${config.adAccountId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 200 + Math.floor(rand() * 500));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (40 + rand() * 60));
  const cpc = 0.3 + rand() * 1.2;
  const spend = Math.round(clicks * cpc);
  const ctr = clicks / impressions;
  const ts = series.points.map((pt) => ({ x: pt.x, spend: Math.round(pt.y * cpc), clicks: pt.y }));
  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: mockDelta(rand), impressions: mockDelta(rand), clicks: mockDelta(rand), ctr: mockDelta(rand) },
    ts,
  );
}

function buildPanels(
  currency: string,
  m: { spend: number; impressions: number; clicks: number; ctr: number },
  d: { spend: number; impressions: number; clicks: number; ctr: number },
  ts: { x: string; spend: number; clicks: number }[],
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
  ];
}

export const pinterestAdsConnector: Connector<PinterestConfig> = {
  type: "pinterest-ads",
  label: "Pinterest Ads",
  category: "Advertising",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "pinterest-ads", label: "Pinterest Ads", category: "Advertising" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[pinterest-ads] live fetch failed for ${config.adAccountId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
