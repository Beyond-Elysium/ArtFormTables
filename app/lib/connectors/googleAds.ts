/**
 * Google Ads connector.
 *
 * Auth differs from the Google service-account APIs: the Google Ads API needs a
 * developer token plus an OAuth2 refresh token (or a service account with
 * domain-wide delegation through a Workspace). Live wiring is scaffolded below
 * but gated behind credentials; until they're set, the connector serves mock
 * data so the dashboard renders.
 *
 * To go live (REST, no client library required):
 *   POST https://googleads.googleapis.com/v17/customers/{customerId}/googleAds:search
 *   headers: Authorization: Bearer <oauth access token>,
 *            developer-token: <GOOGLE_ADS_DEVELOPER_TOKEN>,
 *            login-customer-id: <manager id, optional>
 *   body: { query: "<GAQL>" }  e.g.
 *     SELECT metrics.cost_micros, metrics.clicks, metrics.impressions,
 *            metrics.conversions, segments.date
 *     FROM campaign WHERE segments.date DURING LAST_30_DAYS
 */
import "server-only";
import type { Connector, ConnectorContext, ConnectorResult, Panel } from "./types";
import { mockDelta, mockSeries, rng } from "./mock";

interface AdsConfig {
  customerId: string;
  currency?: string;
}

function hasAdsCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET,
  );
}

async function fetchLive(_config: AdsConfig, _ctx: ConnectorContext): Promise<Panel[]> {
  // Intentionally not implemented until credentials are provisioned. Throwing
  // here makes `fetch` fall back to mock data with a visible notice.
  throw new Error(
    "Google Ads live fetch not yet wired — provision developer token + OAuth refresh token.",
  );
}

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

  const costSeries = series.points.map((pt) => ({ x: pt.x, y: Math.round(pt.y * cpc) }));
  const clickSeries = series.points.map((pt) => ({ x: pt.x, y: pt.y }));

  const campaigns = ["Brand — Search", "Generic — Search", "Retargeting", "Shopping", "Display Prospecting"]
    .map((label) => ({ label, value: Math.floor(cost * (0.08 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);

  const panels: Panel[] = [
    { kind: "stat", label: "Spend", value: cost, format: "currency", currency, delta: mockDelta(rand), invertDelta: true },
    { kind: "stat", label: "Clicks", value: clicks, format: "compact", delta: mockDelta(rand) },
    { kind: "stat", label: "Conversions", value: conversions, format: "number", delta: mockDelta(rand) },
    { kind: "stat", label: "CTR", value: ctr, format: "percent", delta: mockDelta(rand) },
    {
      kind: "timeseries",
      title: "Spend & clicks",
      series: [
        { name: `Spend (${currency})`, points: costSeries },
        { name: "Clicks", points: clickSeries },
      ],
    },
    { kind: "breakdown", title: "Top campaigns by spend", display: "bar", valueLabel: "Spend", valueFormat: "currency", rows: campaigns },
  ];
  return panels;
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
