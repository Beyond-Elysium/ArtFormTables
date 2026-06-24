/**
 * Meta Ads (Facebook/Instagram) connector — Graph API Insights.
 * Auth: a long-lived access token with ads_read on the ad account.
 *
 * Env: META_ACCESS_TOKEN, optional META_API_VERSION (defaults to v21.0).
 * Config: { adAccountId }  (numeric id, with or without the "act_" prefix).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, pct, rangeDates } from "./util";

interface MetaConfig {
  adAccountId: string;
  currency?: string;
}

const API_VERSION = process.env.META_API_VERSION || "v21.0";

function hasToken(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN);
}

function accountPath(id: string): string {
  const clean = id.replace(/^act_/, "");
  return `act_${clean}`;
}

async function graph(path: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({
    access_token: process.env.META_ACCESS_TOKEN!,
    ...params,
  });
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${path}?${qs.toString()}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchLive(config: MetaConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const acct = accountPath(config.adAccountId);
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);

  const [daily, campaigns, prev] = await Promise.all([
    graph(`${acct}/insights`, {
      fields: "spend,impressions,clicks",
      time_range: JSON.stringify({ since: start, until: end }),
      time_increment: "1",
    }),
    graph(`${acct}/insights`, {
      level: "campaign",
      fields: "campaign_name,spend",
      time_range: JSON.stringify({ since: start, until: end }),
    }),
    graph(`${acct}/insights`, {
      fields: "spend,impressions,clicks",
      time_range: JSON.stringify({ since: prevStart, until: prevEnd }),
    }),
  ]);

  const rows: any[] = daily.data ?? [];
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  const ts = rows.map((r) => {
    spend += num(r.spend);
    impressions += num(r.impressions);
    clicks += num(r.clicks);
    return { x: r.date_start as string, spend: num(r.spend), clicks: num(r.clicks) };
  });

  const p = (prev.data ?? [])[0] ?? {};
  const pSpend = num(p.spend);
  const pClicks = num(p.clicks);
  const pImpr = num(p.impressions);

  const ctr = impressions ? clicks / impressions : 0;
  const pCtr = pImpr ? pClicks / pImpr : 0;

  const campaignRows = ((campaigns.data ?? []) as any[])
    .map((r) => ({ label: r.campaign_name ?? "(unknown)", value: num(r.spend) }))
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

function fetchMock(config: MetaConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`meta:${config.adAccountId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 250 + Math.floor(rand() * 600));
  const clicks = series.total;
  const impressions = Math.floor(clicks * (20 + rand() * 40));
  const cpc = 0.4 + rand() * 1.8;
  const spend = Math.round(clicks * cpc);
  const ctr = clicks / impressions;

  const ts = series.points.map((pt) => ({ x: pt.x, spend: Math.round(pt.y * cpc), clicks: pt.y }));
  const campaigns = ["Prospecting — Feed", "Retargeting — Stories", "Lookalike 1%", "Catalog Sales", "Brand Awareness"]
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

export const metaAdsConnector: Connector<MetaConfig> = {
  type: "meta-ads",
  label: "Meta Ads",
  category: "Advertising",
  isLive: () => hasToken(),
  async fetch(config, ctx) {
    const base = { sourceId: "meta-ads", label: "Meta Ads", category: "Advertising" };
    if (!hasToken()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[meta-ads] live fetch failed for ${config.adAccountId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
