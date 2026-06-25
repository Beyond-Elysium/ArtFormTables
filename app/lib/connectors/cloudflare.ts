/**
 * Cloudflare connector — GraphQL Analytics API.
 * Auth: API token (bearer) with Analytics:Read on the zone.
 *
 * Env: CLOUDFLARE_API_TOKEN.  Config: { zoneTag }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

interface CloudflareConfig {
  zoneTag: string;
}

function token(): string | undefined {
  return process.env.CLOUDFLARE_API_TOKEN;
}

async function fetchLive(config: CloudflareConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const start = dateNDaysAgo(ctx.days - 1);
  const end = dateNDaysAgo(0);
  const query = `
    query ($zoneTag: String!, $start: Date!, $end: Date!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 100
            filter: { date_geq: $start, date_leq: $end }
            orderBy: [date_ASC]
          ) {
            dimensions { date }
            sum { requests bytes threats pageViews }
            uniq { uniques }
          }
        }
      }
    }`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token()!}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { zoneTag: config.zoneTag, start, end } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Cloudflare ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Cloudflare GraphQL: ${JSON.stringify(json.errors)}`);

  const groups: any[] = json.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
  let requests = 0;
  let bytes = 0;
  let threats = 0;
  let pageViews = 0;
  const ts: { x: string; requests: number; pageViews: number }[] = [];
  for (const g of groups) {
    const s = g.sum ?? {};
    requests += num(s.requests);
    bytes += num(s.bytes);
    threats += num(s.threats);
    pageViews += num(s.pageViews);
    ts.push({ x: g.dimensions?.date, requests: num(s.requests), pageViews: num(s.pageViews) });
  }
  return buildPanels({ requests, bandwidthGb: bytes / 1e9, threats, pageViews }, ts);
}

function fetchMock(config: CloudflareConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`cloudflare:${config.zoneTag}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 50_000 + Math.floor(rand() * 400_000));
  const requests = series.total;
  const ts = series.points.map((pt) => ({ x: pt.x, requests: pt.y, pageViews: Math.floor(pt.y * (0.2 + rand() * 0.2)) }));
  const pageViews = ts.reduce((a, b) => a + b.pageViews, 0);
  const bandwidthGb = requests * (0.00002 + rand() * 0.00003) * 1000;
  const threats = Math.floor(requests * (0.001 + rand() * 0.004));
  return buildPanels({ requests, bandwidthGb, threats, pageViews }, ts);
}

function buildPanels(
  m: { requests: number; bandwidthGb: number; threats: number; pageViews: number },
  ts: { x: string; requests: number; pageViews: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Requests", value: m.requests, format: "compact" },
    { kind: "stat", label: "Page views", value: m.pageViews, format: "compact" },
    { kind: "stat", label: "Bandwidth (GB)", value: m.bandwidthGb, format: "decimal" },
    { kind: "stat", label: "Threats stopped", value: m.threats, format: "compact" },
    {
      kind: "timeseries",
      title: "Requests & page views",
      series: [
        { name: "Requests", points: ts.map((p) => ({ x: p.x, y: p.requests })) },
        { name: "Page views", points: ts.map((p) => ({ x: p.x, y: p.pageViews })) },
      ],
    },
  ];
}

export const cloudflareConnector: Connector<CloudflareConfig> = {
  type: "cloudflare",
  label: "CDN & Security",
  category: "Infrastructure",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "cloudflare", label: "CDN & Security", category: "Infrastructure" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[cloudflare] live fetch failed for ${config.zoneTag}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
