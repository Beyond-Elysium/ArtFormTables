/**
 * Stripe connector — Charges API.
 * Auth: a restricted/secret key (read-only recommended), as a bearer token.
 *
 * Env: STRIPE_SECRET_KEY.  Config: {} (account-level), optional currency.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { num, pct } from "./util";

interface StripeConfig {
  currency?: string;
}

const MAX_PAGES = 10;

function hasKey(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

interface Charge {
  amount: number;
  created: number;
  status: string;
  refunded: boolean;
  payment_method_details?: { card?: { brand?: string } };
}

async function fetchCharges(gte: number, lte: number): Promise<Charge[]> {
  const key = process.env.STRIPE_SECRET_KEY!;
  const charges: Charge[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: "100" });
    params.set("created[gte]", String(gte));
    params.set("created[lte]", String(lte));
    if (startingAfter) params.set("starting_after", startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/charges?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const data: any[] = json.data ?? [];
    charges.push(...data);
    if (!json.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return charges;
}

function summarize(charges: Charge[], currency: string) {
  let gross = 0;
  let payments = 0;
  let refunds = 0;
  const byDate = new Map<string, { volume: number; payments: number }>();
  const byBrand = new Map<string, number>();
  for (const ch of charges) {
    if (ch.status !== "succeeded") continue;
    const amount = num(ch.amount) / 100; // minor units → major (USD/EUR/GBP)
    gross += amount;
    payments += 1;
    if (ch.refunded) refunds += 1;
    const date = new Date(ch.created * 1000).toISOString().slice(0, 10);
    const e = byDate.get(date) ?? { volume: 0, payments: 0 };
    e.volume += amount;
    e.payments += 1;
    byDate.set(date, e);
    const brand = ch.payment_method_details?.card?.brand ?? "other";
    byBrand.set(brand, (byBrand.get(brand) ?? 0) + 1);
  }
  return { gross, payments, refunds, byDate, byBrand };
}

async function fetchLive(config: StripeConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const now = Math.floor(Date.now() / 1000);
  const windowSecs = ctx.days * 86400;
  const [current, prev] = await Promise.all([
    fetchCharges(now - windowSecs, now),
    fetchCharges(now - windowSecs * 2, now - windowSecs),
  ]);
  const c = summarize(current, currency);
  const p = summarize(prev, currency);

  const aov = c.payments ? c.gross / c.payments : 0;
  const pAov = p.payments ? p.gross / p.payments : 0;
  const ts = [...c.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, v]) => ({ x, ...v }));
  const brands = [...c.byBrand.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  return buildPanels(
    currency,
    { gross: c.gross, payments: c.payments, refunds: c.refunds, aov },
    { gross: pct(c.gross, p.gross), payments: pct(c.payments, p.payments), aov: pct(aov, pAov) },
    ts,
    brands,
  );
}

function fetchMock(config: StripeConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`stripe:${currency}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 25 + Math.floor(rand() * 70));
  const payments = series.total;
  const aov = 40 + rand() * 120;
  const gross = Math.round(payments * aov);
  const refunds = Math.floor(payments * (0.01 + rand() * 0.03));
  const ts = series.points.map((pt) => ({ x: pt.x, volume: Math.round(pt.y * aov), payments: pt.y }));
  const brands = ["visa", "mastercard", "amex", "discover", "other"]
    .map((label) => ({ label, value: Math.floor(payments * (0.05 + rand() * 0.4)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels(
    currency,
    { gross, payments, refunds, aov },
    { gross: 0, payments: 0, aov: 0 },
    ts,
    brands,
  );
}

function buildPanels(
  currency: string,
  m: { gross: number; payments: number; refunds: number; aov: number },
  d: { gross: number; payments: number; aov: number },
  ts: { x: string; volume: number; payments: number }[],
  brands: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Gross volume", value: m.gross, format: "currency", currency, delta: d.gross },
    { kind: "stat", label: "Payments", value: m.payments, format: "number", delta: d.payments },
    { kind: "stat", label: "Avg. payment", value: m.aov, format: "currency", currency, delta: d.aov },
    { kind: "stat", label: "Refunds", value: m.refunds, format: "number", invertDelta: true },
    {
      kind: "timeseries",
      title: "Volume & payments",
      series: [
        { name: `Volume (${currency})`, points: ts.map((p) => ({ x: p.x, y: p.volume })) },
        { name: "Payments", points: ts.map((p) => ({ x: p.x, y: p.payments })) },
      ],
    },
    { kind: "breakdown", title: "Payments by card brand", display: "donut", rows: brands },
  ];
}

export const stripeConnector: Connector<StripeConfig> = {
  type: "stripe",
  label: "Payments",
  category: "Payments",
  isLive: () => hasKey(),
  async fetch(config, ctx) {
    const base = { sourceId: "stripe", label: "Payments", category: "Payments" };
    if (!hasKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[stripe] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
