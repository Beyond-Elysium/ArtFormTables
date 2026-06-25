/**
 * Amplitude connector — Dashboard REST (event segmentation).
 * Auth: HTTP Basic with API key + secret key.
 *
 * Env: AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY, optional AMPLITUDE_BASE_URL
 *      (default https://amplitude.com; EU: https://analytics.eu.amplitude.com).
 * Config: {} (project-level).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

type AmplitudeConfig = Record<string, never>;

function configured(): boolean {
  return Boolean(process.env.AMPLITUDE_API_KEY && process.env.AMPLITUDE_SECRET_KEY);
}
function baseUrl(): string {
  return process.env.AMPLITUDE_BASE_URL || "https://amplitude.com";
}

function ymd(date: string): string {
  return date.replace(/-/g, "");
}

async function segmentation(eventType: string, metric: string, ctx: ConnectorContext): Promise<{ dates: string[]; values: number[] }> {
  const auth = Buffer.from(`${process.env.AMPLITUDE_API_KEY}:${process.env.AMPLITUDE_SECRET_KEY}`).toString("base64");
  const qs = new URLSearchParams({
    e: JSON.stringify({ event_type: eventType }),
    start: ymd(dateNDaysAgo(ctx.days - 1)),
    end: ymd(dateNDaysAgo(0)),
    m: metric,
    i: "1",
  });
  const res = await fetch(`${baseUrl()}/api/2/events/segmentation?${qs}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Amplitude ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const series = json.data?.series?.[0] ?? [];
  const xValues = json.data?.xValues ?? [];
  return { dates: xValues, values: series.map(num) };
}

async function fetchLive(_config: AmplitudeConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const [active, newUsers, events] = await Promise.all([
    segmentation("_active", "uniques", ctx),
    segmentation("_new", "uniques", ctx),
    segmentation("_active", "totals", ctx),
  ]);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const ts = active.dates.map((x, i) => ({
    x: x.slice(0, 10),
    active: active.values[i] ?? 0,
    events: events.values[i] ?? 0,
  }));
  return buildPanels(
    { activeUsers: sum(active.values), newUsers: sum(newUsers.values), events: sum(events.values) },
    ts,
  );
}

function fetchMock(_config: AmplitudeConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`amplitude:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 500 + Math.floor(rand() * 1500));
  const ts = series.points.map((pt) => ({ x: pt.x, active: pt.y, events: Math.floor(pt.y * (4 + rand() * 5)) }));
  const activeUsers = series.total;
  const events = ts.reduce((a, b) => a + b.events, 0);
  const newUsers = Math.floor(activeUsers * (0.1 + rand() * 0.2));
  return buildPanels({ activeUsers, newUsers, events }, ts);
}

function buildPanels(
  m: { activeUsers: number; newUsers: number; events: number },
  ts: { x: string; active: number; events: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Active users", value: m.activeUsers, format: "compact" },
    { kind: "stat", label: "New users", value: m.newUsers, format: "compact" },
    { kind: "stat", label: "Events", value: m.events, format: "compact" },
    {
      kind: "timeseries",
      title: "Active users & events",
      series: [
        { name: "Active users", points: ts.map((p) => ({ x: p.x, y: p.active })) },
        { name: "Events", points: ts.map((p) => ({ x: p.x, y: p.events })) },
      ],
    },
  ];
}

export const amplitudeConnector: Connector<AmplitudeConfig> = {
  type: "amplitude",
  label: "Product Insights",
  category: "Product",
  isLive: () => configured(),
  async fetch(config, ctx) {
    const base = { sourceId: "amplitude", label: "Product Insights", category: "Product" };
    if (!configured()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[amplitude] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
