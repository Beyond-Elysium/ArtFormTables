/**
 * Square connector — Payments API.
 * Auth: access token (bearer).
 *
 * Env: SQUARE_ACCESS_TOKEN, optional SQUARE_VERSION (default 2024-10-17).
 * Config: {} (account-level), optional currency.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num, pct } from "./util";

interface SquareConfig {
  currency?: string;
}

const MAX_PAGES = 10;

function token(): string | undefined {
  return process.env.SQUARE_ACCESS_TOKEN;
}

interface Payment {
  amount_money?: { amount?: number; currency?: string };
  status?: string;
  created_at?: string;
  card_details?: { card?: { card_brand?: string } };
}

async function fetchPayments(begin: string, end: string): Promise<Payment[]> {
  const payments: Payment[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ begin_time: begin, end_time: end, limit: "100" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`https://connect.squareup.com/v2/payments?${qs}`, {
      headers: {
        Authorization: `Bearer ${token()!}`,
        "Square-Version": process.env.SQUARE_VERSION || "2024-10-17",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Square ${res.status}: ${await res.text()}`);
    const json = await res.json();
    payments.push(...(json.payments ?? []));
    cursor = json.cursor;
    if (!cursor) break;
  }
  return payments;
}

function summarize(payments: Payment[]) {
  let gross = 0;
  let count = 0;
  const byDate = new Map<string, { volume: number; count: number }>();
  const byBrand = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "COMPLETED") continue;
    const amount = num(p.amount_money?.amount) / 100;
    gross += amount;
    count += 1;
    const date = (p.created_at ?? "").slice(0, 10);
    const e = byDate.get(date) ?? { volume: 0, count: 0 };
    e.volume += amount;
    e.count += 1;
    byDate.set(date, e);
    const brand = p.card_details?.card?.card_brand ?? "OTHER";
    byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
  }
  return { gross, count, byDate, byBrand };
}

async function fetchLive(config: SquareConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const begin = `${dateNDaysAgo(ctx.days)}T00:00:00Z`;
  const end = `${dateNDaysAgo(0)}T23:59:59Z`;
  const prevBegin = `${dateNDaysAgo(ctx.days * 2)}T00:00:00Z`;
  const prevEnd = `${dateNDaysAgo(ctx.days)}T00:00:00Z`;
  const [cur, prev] = await Promise.all([
    fetchPayments(begin, end).then(summarize),
    fetchPayments(prevBegin, prevEnd).then(summarize),
  ]);
  const aov = cur.count ? cur.gross / cur.count : 0;
  const ts = [...cur.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, v]) => ({ x, ...v }));
  const brands = [...cur.byBrand.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  return buildPanels(
    currency,
    { gross: cur.gross, count: cur.count, aov },
    { gross: pct(cur.gross, prev.gross), count: pct(cur.count, prev.count) },
    ts,
    brands,
  );
}

function fetchMock(config: SquareConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`square:${currency}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 30 + Math.floor(rand() * 80));
  const count = series.total;
  const aov = 18 + rand() * 60;
  const gross = Math.round(count * aov);
  const ts = series.points.map((pt) => ({ x: pt.x, volume: Math.round(pt.y * aov), count: pt.y }));
  const brands = ["VISA", "MASTERCARD", "AMERICAN_EXPRESS", "DISCOVER", "OTHER"]
    .map((label) => ({ label, value: Math.floor(count * (0.05 + rand() * 0.4)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels(currency, { gross, count, aov }, { gross: 0, count: 0 }, ts, brands);
}

function buildPanels(
  currency: string,
  m: { gross: number; count: number; aov: number },
  d: { gross: number; count: number },
  ts: { x: string; volume: number; count: number }[],
  brands: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Gross sales", value: m.gross, format: "currency", currency, delta: d.gross },
    { kind: "stat", label: "Payments", value: m.count, format: "number", delta: d.count },
    { kind: "stat", label: "Avg. sale", value: m.aov, format: "currency", currency },
    {
      kind: "timeseries",
      title: "Sales & payments",
      series: [
        { name: `Sales (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.volume })) },
        { name: "Payments", points: ts.map((p) => ({ x: p.x, y: p.count })) },
      ],
    },
    { kind: "breakdown", title: "Payments by card brand", display: "donut", rows: brands },
  ];
}

export const squareConnector: Connector<SquareConfig> = {
  type: "square",
  label: "Square Payments",
  category: "Payments",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "square", label: "Square Payments", category: "Payments" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[square] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
