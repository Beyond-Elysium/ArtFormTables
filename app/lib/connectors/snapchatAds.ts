/**
 * Snapchat Ads connector — Marketing API ad-account stats.
 * Auth: OAuth2 bearer token.
 *
 * Env: SNAPCHAT_ACCESS_TOKEN.  Config: { adAccountId }, optional currency.
 * Spend is returned in micro-currency (1e6 = one unit).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";
import { num, rangeDates } from "./util";

interface SnapchatConfig {
  adAccountId: string;
  currency?: string;
}

function token(): string | undefined {
  return process.env.SNAPCHAT_ACCESS_TOKEN;
}

async function fetchLive(config: SnapchatConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const { start, end } = rangeDates(ctx.days);
  const qs = new URLSearchParams({
    granularity: "DAY",
    fields: "spend,impressions,swipes",
    start_time: `${start}T00:00:00.000-00:00`,
    end_time: `${end}T00:00:00.000-00:00`,
  });
  const res = await fetch(
    `https://adsapi.snapchat.com/v1/adaccounts/${config.adAccountId}/stats?${qs}`,
    { headers: { Authorization: `Bearer ${token()!}` }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Snapchat ${res.status}: ${await res.text()}`);
  const json = await res.json();

  // Response nests daily points under timeseries_stats[].timeseries_stat.timeseries[].
  const series: any[] = json.timeseries_stats?.[0]?.timeseries_stat?.timeseries ?? [];
  let spend = 0;
  let impressions = 0;
  let swipes = 0;
  const ts = series.map((pt) => {
    const s = pt.stats ?? {};
    const sp = num(s.spend) / 1_000_000;
    spend += sp;
    impressions += num(s.impressions);
    swipes += num(s.swipes);
    return { x: String(pt.start_time).slice(0, 10), spend: sp, swipes: num(s.swipes) };
  });
  const ctr = impressions ? swipes / impressions : 0;

  return buildPanels(currency, { spend, impressions, swipes, ctr }, undefined, ts);
}

function fetchMock(config: SnapchatConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`snap:${config.adAccountId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 300 + Math.floor(rand() * 700));
  const swipes = series.total;
  const impressions = Math.floor(swipes * (30 + rand() * 70));
  const cpc = 0.2 + rand() * 1.0;
  const spend = Math.round(swipes * cpc);
  const ctr = swipes / impressions;
  const ts = series.points.map((pt) => ({ x: pt.x, spend: Math.round(pt.y * cpc), swipes: pt.y }));
  return buildPanels(
    currency,
    { spend, impressions, swipes, ctr },
    { spend: mockDelta(rand), impressions: mockDelta(rand), swipes: mockDelta(rand), ctr: mockDelta(rand) },
    ts,
  );
}

function buildPanels(
  currency: string,
  m: { spend: number; impressions: number; swipes: number; ctr: number },
  d: { spend: number; impressions: number; swipes: number; ctr: number } | undefined,
  ts: { x: string; spend: number; swipes: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Spend", value: m.spend, format: "currency", currency, delta: d?.spend, invertDelta: true },
    { kind: "stat", label: "Impressions", value: m.impressions, format: "compact", delta: d?.impressions },
    { kind: "stat", label: "Swipes", value: m.swipes, format: "compact", delta: d?.swipes },
    { kind: "stat", label: "Swipe rate", value: m.ctr, format: "percent", delta: d?.ctr },
    {
      kind: "timeseries",
      title: "Spend & swipes",
      series: [
        { name: `Spend (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.spend })) },
        { name: "Swipes", points: ts.map((p) => ({ x: p.x, y: p.swipes })) },
      ],
    },
  ];
}

export const snapchatAdsConnector: Connector<SnapchatConfig> = {
  type: "snapchat-ads",
  label: "Snapchat Ads",
  category: "Advertising",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "snapchat-ads", label: "Snapchat Ads", category: "Advertising" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[snapchat-ads] live fetch failed for ${config.adAccountId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
