/**
 * Shopify connector — Admin REST API orders.
 * Auth: Admin API access token (custom app), sent as X-Shopify-Access-Token.
 *
 * Env: SHOPIFY_ACCESS_TOKEN, optional SHOPIFY_API_VERSION (default 2024-10).
 * Config: { shop }  ("acme" or "acme.myshopify.com"), optional currency.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { num, pct, rangeDates } from "./util";

interface ShopifyConfig {
  shop: string;
  currency?: string;
}

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const MAX_PAGES = 5;

function hasToken(): boolean {
  return Boolean(process.env.SHOPIFY_ACCESS_TOKEN);
}

function shopDomain(shop: string): string {
  return shop.includes(".") ? shop : `${shop}.myshopify.com`;
}

interface Order {
  created_at: string;
  total_price: string;
  source_name?: string;
}

async function fetchOrders(domain: string, start: string, end: string): Promise<Order[]> {
  const token = process.env.SHOPIFY_ACCESS_TOKEN!;
  const orders: Order[] = [];
  let url: string | null =
    `https://${domain}/admin/api/${API_VERSION}/orders.json?status=any&limit=250` +
    `&created_at_min=${start}T00:00:00Z&created_at_max=${end}T23:59:59Z` +
    `&fields=created_at,total_price,source_name`;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const json = await res.json();
    orders.push(...(json.orders ?? []));
    // Pagination via Link header: <...page_info=...>; rel="next"
    const link = res.headers.get("link") ?? "";
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = m ? m[1] : null;
  }
  return orders;
}

function sumOrders(orders: Order[]) {
  let revenue = 0;
  const byDate = new Map<string, { revenue: number; orders: number }>();
  const bySource = new Map<string, number>();
  for (const o of orders) {
    const v = num(o.total_price);
    revenue += v;
    const date = (o.created_at ?? "").slice(0, 10);
    const e = byDate.get(date) ?? { revenue: 0, orders: 0 };
    e.revenue += v;
    e.orders += 1;
    byDate.set(date, e);
    const src = o.source_name || "unknown";
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
  }
  return { revenue, count: orders.length, byDate, bySource };
}

async function fetchLive(config: ShopifyConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const domain = shopDomain(config.shop);
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);

  const [current, prev] = await Promise.all([
    fetchOrders(domain, start, end),
    fetchOrders(domain, prevStart, prevEnd),
  ]);
  const c = sumOrders(current);
  const p = sumOrders(prev);

  const aov = c.count ? c.revenue / c.count : 0;
  const pAov = p.count ? p.revenue / p.count : 0;

  const ts = [...c.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, v]) => ({ x, ...v }));
  const sources = [...c.bySource.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  return buildPanels(
    currency,
    { revenue: c.revenue, orders: c.count, aov },
    { revenue: pct(c.revenue, p.revenue), orders: pct(c.count, p.count), aov: pct(aov, pAov) },
    ts,
    sources,
  );
}

function fetchMock(config: ShopifyConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`shopify:${config.shop}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 20 + Math.floor(rand() * 60));
  const orders = series.total;
  const aov = 35 + rand() * 90;
  const revenue = Math.round(orders * aov);
  const ts = series.points.map((pt) => ({ x: pt.x, revenue: Math.round(pt.y * aov), orders: pt.y }));
  const sources = ["web", "pos", "shop_app", "draft_order", "google", "facebook"]
    .map((label) => ({ label, value: Math.floor(orders * (0.05 + rand() * 0.3)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels(
    currency,
    { revenue, orders, aov },
    { revenue: 0, orders: 0, aov: 0 },
    ts,
    sources,
  );
}

function buildPanels(
  currency: string,
  m: { revenue: number; orders: number; aov: number },
  d: { revenue: number; orders: number; aov: number },
  ts: { x: string; revenue: number; orders: number }[],
  sources: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Revenue", value: m.revenue, format: "currency", currency, delta: d.revenue },
    { kind: "stat", label: "Orders", value: m.orders, format: "number", delta: d.orders },
    { kind: "stat", label: "Avg. order value", value: m.aov, format: "currency", currency, delta: d.aov },
    {
      kind: "timeseries",
      title: "Revenue & orders",
      series: [
        { name: `Revenue (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.revenue })) },
        { name: "Orders", points: ts.map((p) => ({ x: p.x, y: p.orders })) },
      ],
    },
    { kind: "breakdown", title: "Orders by source", display: "donut", rows: sources },
  ];
}

export const shopifyConnector: Connector<ShopifyConfig> = {
  type: "shopify",
  label: "Online Store",
  category: "E-commerce",
  isLive: () => hasToken(),
  async fetch(config, ctx) {
    const base = { sourceId: "shopify", label: "Online Store", category: "E-commerce" };
    if (!hasToken()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[shopify] live fetch failed for ${config.shop}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
