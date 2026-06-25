/**
 * TikTok Ads connector — Marketing API integrated report.
 * Auth: access token in the Access-Token header.
 *
 * Env: TIKTOK_ACCESS_TOKEN, optional TIKTOK_API_VERSION (default v1.3).
 * Config: { advertiserId }, optional currency.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, pct, rangeDates } from "./util";

interface TikTokConfig {
  advertiserId: string;
  currency?: string;
}

const API_VERSION = process.env.TIKTOK_API_VERSION || "v1.3";

function hasToken(): boolean {
  return Boolean(process.env.TIKTOK_ACCESS_TOKEN);
}

async function report(params: Record<string, string>): Promise<any[]> {
  const qs = new URLSearchParams(params);
  const res = await fetch(
    `https://business-api.tiktok.com/open_api/${API_VERSION}/report/integrated/get/?${qs}`,
    { headers: { "Access-Token": process.env.TIKTOK_ACCESS_TOKEN! }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`TikTok ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.code && json.code !== 0) throw new Error(`TikTok API ${json.code}: ${json.message}`);
  return json.data?.list ?? [];
}

async function fetchLive(config: TikTokConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);
  const metrics = JSON.stringify(["spend", "impressions", "clicks"]);

  const base = {
    advertiser_id: config.advertiserId,
    report_type: "BASIC",
    data_level: "AUCTION_ADVERTISER",
    metrics,
  };

  const [daily, campaigns, prev] = await Promise.all([
    report({ ...base, dimensions: JSON.stringify(["stat_time_day"]), start_date: start, end_date: end }),
    report({
      advertiser_id: config.advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      metrics: JSON.stringify(["spend", "campaign_name"]),
      dimensions: JSON.stringify(["campaign_id"]),
      start_date: start,
      end_date: end,
    }),
    report({ ...base, dimensions: JSON.stringify(["stat_time_day"]), start_date: prevStart, end_date: prevEnd }),
  ]);

  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  const ts = daily.map((r) => {
    const m = r.metrics ?? {};
    spend += num(m.spend);
    impressions += num(m.impressions);
    clicks += num(m.clicks);
    return { x: (r.dimensions?.stat_time_day ?? "").slice(0, 10), spend: num(m.spend), clicks: num(m.clicks) };
  });

  let pSpend = 0;
  let pClicks = 0;
  let pImpr = 0;
  for (const r of prev) {
    const m = r.metrics ?? {};
    pSpend += num(m.spend);
    pClicks += num(m.clicks);
    pImpr += num(m.impressions);
  }

  const ctr = impressions ? clicks / impressions : 0;
  const pCtr = pImpr ? pClicks / pImpr : 0;
  const campaignRows = campaigns
    .map((r) => ({ label: r.metrics?.campaign_name ?? r.dimensions?.campaign_id ?? "(unknown)", value: num(r.metrics?.spend) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return buildPanels(
    currency,
    { spend, impressions, clicks, ctr },
    { spend: pct(spend, pSpend), impressions: pct(impressions, pImpr), clicks: pct(clicks, pClicks), ctr: pct(ctr, pCtr) },
    ts,
    campaignRows,
  );
}

function fetchMock(config: TikTokConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`tiktok:${config.advertiserId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 400 + Math.floor(rand() * 900));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (25 + rand() * 60));
  const cpc = 0.2 + rand() * 1.2;
  const spend = Math.round(clicks * cpc);
  const ctr = clicks / impressions;
  const ts = series.points.map((pt) => ({ x: pt.x, spend: Math.round(pt.y * cpc), clicks: pt.y }));
  const campaigns = ["Spark Ads — UGC", "TopView Launch", "Hashtag Challenge", "Retargeting", "Lead Gen"]
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

export const tiktokAdsConnector: Connector<TikTokConfig> = {
  type: "tiktok-ads",
  label: "TikTok Ads",
  category: "Advertising",
  isLive: () => hasToken(),
  async fetch(config, ctx) {
    const base = { sourceId: "tiktok-ads", label: "TikTok Ads", category: "Advertising" };
    if (!hasToken()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[tiktok-ads] live fetch failed for ${config.advertiserId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
