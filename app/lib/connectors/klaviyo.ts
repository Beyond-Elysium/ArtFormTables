/**
 * Klaviyo connector — Metric Aggregates API.
 * Auth: private API key, sent as "Authorization: Klaviyo-API-Key <key>".
 *
 * Env: KLAVIYO_API_KEY, optional KLAVIYO_REVISION (default 2024-10-15).
 * Config: {} (account-level).
 *
 * Resolves the built-in email metric ids by name, then aggregates daily counts.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

type KlaviyoConfig = Record<string, never>;

function apiKey(): string | undefined {
  return process.env.KLAVIYO_API_KEY;
}

function headers() {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey()!}`,
    revision: process.env.KLAVIYO_REVISION || "2024-10-15",
    accept: "application/json",
    "content-type": "application/json",
  };
}

async function metricIds(): Promise<Record<string, string>> {
  const res = await fetch("https://a.klaviyo.com/api/metrics/", { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const map: Record<string, string> = {};
  for (const m of json.data ?? []) {
    const name = m.attributes?.name;
    if (name) map[name] = m.id;
  }
  return map;
}

async function aggregate(metricId: string, days: number): Promise<number[]> {
  const start = `${dateNDaysAgo(days)}T00:00:00`;
  const end = `${dateNDaysAgo(0)}T23:59:59`;
  const res = await fetch("https://a.klaviyo.com/api/metric-aggregates/", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements: ["count"],
          interval: "day",
          timezone: "UTC",
          filter: [`greater-or-equal(datetime,${start})`, `less-than(datetime,${end})`],
        },
      },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Klaviyo ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.data?.attributes?.data?.[0]?.measurements?.count ?? []).map(num);
}

async function fetchLive(_config: KlaviyoConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const ids = await metricIds();
  const dates = (() => {
    const out: string[] = [];
    for (let i = ctx.days - 1; i >= 0; i--) out.push(dateNDaysAgo(i));
    return out;
  })();

  const get = async (name: string) => (ids[name] ? aggregate(ids[name], ctx.days) : []);
  const [received, opened, clicked] = await Promise.all([
    get("Received Email"),
    get("Opened Email"),
    get("Clicked Email"),
  ]);

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const totalReceived = sum(received);
  const totalOpened = sum(opened);
  const totalClicked = sum(clicked);
  const ts = dates.map((x, i) => ({ x, received: received[i] ?? 0, opened: opened[i] ?? 0 }));

  return buildPanels(
    {
      received: totalReceived,
      opened: totalOpened,
      openRate: totalReceived ? totalOpened / totalReceived : 0,
      clickRate: totalReceived ? totalClicked / totalReceived : 0,
    },
    ts,
  );
}

function fetchMock(_config: KlaviyoConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`klaviyo:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 1000 + Math.floor(rand() * 4000));
  const received = series.total;
  const openRate = 0.3 + rand() * 0.3;
  const clickRate = 0.02 + rand() * 0.06;
  const opened = Math.floor(received * openRate);
  const ts = series.points.map((pt) => ({ x: pt.x, received: pt.y, opened: Math.floor(pt.y * openRate) }));
  return buildPanels({ received, opened, openRate, clickRate }, ts);
}

function buildPanels(
  m: { received: number; opened: number; openRate: number; clickRate: number },
  ts: { x: string; received: number; opened: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Emails received", value: m.received, format: "compact" },
    { kind: "stat", label: "Opens", value: m.opened, format: "compact" },
    { kind: "stat", label: "Open rate", value: m.openRate, format: "percent" },
    { kind: "stat", label: "Click rate", value: m.clickRate, format: "percent" },
    {
      kind: "timeseries",
      title: "Received & opened",
      series: [
        { name: "Received", points: ts.map((p) => ({ x: p.x, y: p.received })) },
        { name: "Opened", points: ts.map((p) => ({ x: p.x, y: p.opened })) },
      ],
    },
  ];
}

export const klaviyoConnector: Connector<KlaviyoConfig> = {
  type: "klaviyo",
  label: "Email & SMS",
  category: "Email",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "klaviyo", label: "Email & SMS", category: "Email" };
    if (!apiKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[klaviyo] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
