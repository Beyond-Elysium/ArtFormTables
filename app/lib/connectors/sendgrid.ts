/**
 * SendGrid connector — Stats API (global, aggregated by day).
 * Auth: API key (bearer).
 *
 * Env: SENDGRID_API_KEY.  Config: {} (account-level).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { num, pct, rangeDates } from "./util";

type SendGridConfig = Record<string, never>;

function apiKey(): string | undefined {
  return process.env.SENDGRID_API_KEY;
}

interface DayTotals {
  delivered: number;
  opens: number;
  clicks: number;
  requests: number;
}

async function stats(start: string, end: string): Promise<{ date: string; m: DayTotals }[]> {
  const qs = new URLSearchParams({ start_date: start, end_date: end, aggregated_by: "day" });
  const res = await fetch(`https://api.sendgrid.com/v3/stats?${qs}`, {
    headers: { Authorization: `Bearer ${apiKey()!}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return ((json as any[]) ?? []).map((day) => {
    const metrics = day.stats?.[0]?.metrics ?? {};
    return {
      date: day.date as string,
      m: {
        delivered: num(metrics.delivered),
        opens: num(metrics.unique_opens ?? metrics.opens),
        clicks: num(metrics.unique_clicks ?? metrics.clicks),
        requests: num(metrics.requests),
      },
    };
  });
}

function totals(rows: { m: DayTotals }[]): DayTotals {
  return rows.reduce(
    (a, r) => ({
      delivered: a.delivered + r.m.delivered,
      opens: a.opens + r.m.opens,
      clicks: a.clicks + r.m.clicks,
      requests: a.requests + r.m.requests,
    }),
    { delivered: 0, opens: 0, clicks: 0, requests: 0 },
  );
}

async function fetchLive(_config: SendGridConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const { start, end, prevStart, prevEnd } = rangeDates(ctx.days);
  const [current, prev] = await Promise.all([stats(start, end), stats(prevStart, prevEnd)]);
  const c = totals(current);
  const p = totals(prev);

  const openRate = c.delivered ? c.opens / c.delivered : 0;
  const clickRate = c.delivered ? c.clicks / c.delivered : 0;
  const pOpenRate = p.delivered ? p.opens / p.delivered : 0;

  const ts = current.map((r) => ({ x: r.date, delivered: r.m.delivered, opens: r.m.opens }));

  return buildPanels(
    { delivered: c.delivered, opens: c.opens, openRate, clickRate },
    { delivered: pct(c.delivered, p.delivered), opens: pct(c.opens, p.opens), openRate: pct(openRate, pOpenRate) },
    ts,
  );
}

function fetchMock(_config: SendGridConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`sendgrid:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 1500 + Math.floor(rand() * 5000));
  const delivered = series.total;
  const openRate = 0.2 + rand() * 0.3;
  const clickRate = 0.02 + rand() * 0.05;
  const opens = Math.floor(delivered * openRate);
  const ts = series.points.map((pt) => ({ x: pt.x, delivered: pt.y, opens: Math.floor(pt.y * openRate) }));
  return buildPanels(
    { delivered, opens, openRate, clickRate },
    { delivered: 0, opens: 0, openRate: 0 },
    ts,
  );
}

function buildPanels(
  m: { delivered: number; opens: number; openRate: number; clickRate: number },
  d: { delivered: number; opens: number; openRate: number },
  ts: { x: string; delivered: number; opens: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Delivered", value: m.delivered, format: "compact", delta: d.delivered },
    { kind: "stat", label: "Unique opens", value: m.opens, format: "compact", delta: d.opens },
    { kind: "stat", label: "Open rate", value: m.openRate, format: "percent", delta: d.openRate },
    { kind: "stat", label: "Click rate", value: m.clickRate, format: "percent" },
    {
      kind: "timeseries",
      title: "Delivered & opens",
      series: [
        { name: "Delivered", points: ts.map((p) => ({ x: p.x, y: p.delivered })) },
        { name: "Opens", points: ts.map((p) => ({ x: p.x, y: p.opens })) },
      ],
    },
  ];
}

export const sendgridConnector: Connector<SendGridConfig> = {
  type: "sendgrid",
  label: "Transactional Email",
  category: "Email",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "sendgrid", label: "Transactional Email", category: "Email" };
    if (!apiKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[sendgrid] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
