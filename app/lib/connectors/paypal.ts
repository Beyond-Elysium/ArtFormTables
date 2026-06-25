/**
 * PayPal connector — Transaction Search API.
 * Auth: OAuth2 client-credentials (client id + secret → access token).
 *
 * Env: PAYPAL_CLIENT_ID, PAYPAL_SECRET, optional PAYPAL_BASE_URL
 *      (default https://api-m.paypal.com; sandbox https://api-m.sandbox.paypal.com).
 * Config: {} optional currency.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num, pct } from "./util";

interface PayPalConfig {
  currency?: string;
}

function configured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

function baseUrl(): string {
  return process.env.PAYPAL_BASE_URL || "https://api-m.paypal.com";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal OAuth ${res.status}: ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + num(json.expires_in) * 1000 };
  return cachedToken.value;
}

async function transactions(start: string, end: string): Promise<any[]> {
  const token = await accessToken();
  const qs = new URLSearchParams({
    start_date: `${start}T00:00:00-0000`,
    end_date: `${end}T23:59:59-0000`,
    fields: "transaction_info",
    page_size: "500",
  });
  const res = await fetch(`${baseUrl()}/v1/reporting/transactions?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PayPal ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.transaction_details ?? [];
}

function summarize(details: any[]) {
  let volume = 0;
  let count = 0;
  const byDate = new Map<string, number>();
  for (const d of details) {
    const info = d.transaction_info ?? {};
    const v = num(info.transaction_amount?.value);
    if (v <= 0) continue; // skip refunds/fees
    volume += v;
    count += 1;
    const date = (info.transaction_initiation_date ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + v);
  }
  return { volume, count, byDate };
}

async function fetchLive(config: PayPalConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const [cur, prev] = await Promise.all([
    transactions(dateNDaysAgo(ctx.days - 1), dateNDaysAgo(0)).then(summarize),
    transactions(dateNDaysAgo(ctx.days * 2 - 1), dateNDaysAgo(ctx.days)).then(summarize),
  ]);
  const aov = cur.count ? cur.volume / cur.count : 0;
  const ts = [...cur.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  return buildPanels(
    currency,
    { volume: cur.volume, count: cur.count, aov },
    { volume: pct(cur.volume, prev.volume), count: pct(cur.count, prev.count) },
    ts,
  );
}

function fetchMock(config: PayPalConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`paypal:${currency}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 20 + Math.floor(rand() * 60));
  const count = series.total;
  const aov = 25 + rand() * 80;
  const volume = Math.round(count * aov);
  const ts = series.points.map((pt) => ({ x: pt.x, y: Math.round(pt.y * aov) }));
  return buildPanels(currency, { volume, count, aov }, { volume: 0, count: 0 }, ts);
}

function buildPanels(
  currency: string,
  m: { volume: number; count: number; aov: number },
  d: { volume: number; count: number },
  ts: { x: string; y: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Volume", value: m.volume, format: "currency", currency, delta: d.volume },
    { kind: "stat", label: "Transactions", value: m.count, format: "number", delta: d.count },
    { kind: "stat", label: "Avg. transaction", value: m.aov, format: "currency", currency },
    {
      kind: "timeseries",
      title: "Transaction volume",
      series: [{ name: `Volume (${currency})`, points: ts }],
    },
  ];
}

export const paypalConnector: Connector<PayPalConfig> = {
  type: "paypal",
  label: "PayPal",
  category: "Payments",
  isLive: () => configured(),
  async fetch(config, ctx) {
    const base = { sourceId: "paypal", label: "PayPal", category: "Payments" };
    if (!configured()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[paypal] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
