/**
 * Calendly connector — Scheduled Events API.
 * Auth: OAuth2 / personal access token (bearer).
 *
 * Env: CALENDLY_ACCESS_TOKEN.  Config: { organization }  (organization URI).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

interface CalendlyConfig {
  /** Organization URI, e.g. https://api.calendly.com/organizations/XXXX */
  organization: string;
}

const MAX_PAGES = 5;

function token(): string | undefined {
  return process.env.CALENDLY_ACCESS_TOKEN;
}

async function fetchEvents(config: CalendlyConfig, ctx: ConnectorContext): Promise<any[]> {
  const events: any[] = [];
  const min = `${dateNDaysAgo(ctx.days)}T00:00:00.000000Z`;
  const max = `${dateNDaysAgo(0)}T23:59:59.000000Z`;
  let url: string | null =
    `https://api.calendly.com/scheduled_events?organization=${encodeURIComponent(config.organization)}` +
    `&min_start_time=${min}&max_start_time=${max}&count=100`;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token()!}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Calendly ${res.status}: ${await res.text()}`);
    const json = await res.json();
    events.push(...(json.collection ?? []));
    const next = json.pagination?.next_page;
    url = next ?? null;
  }
  return events;
}

async function fetchLive(config: CalendlyConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const events = await fetchEvents(config, ctx);
  let active = 0;
  let canceled = 0;
  const byDate = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const e of events) {
    if (e.status === "canceled") canceled += 1;
    else active += 1;
    const date = (e.start_time ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + 1);
    const name = e.name || "Meeting";
    byType.set(name, (byType.get(name) ?? 0) + 1);
  }
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  const types = [...byType.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const total = events.length;
  const cancelRate = total ? canceled / total : 0;
  return buildPanels({ total, active, canceled, cancelRate }, ts, types);
}

function fetchMock(config: CalendlyConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`calendly:${config.organization}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 4 + Math.floor(rand() * 16));
  const total = series.total;
  const canceled = Math.floor(total * (0.05 + rand() * 0.15));
  const active = total - canceled;
  const cancelRate = total ? canceled / total : 0;
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const types = ["Intro call (30 min)", "Demo (45 min)", "Onboarding (60 min)", "Quick chat (15 min)", "Strategy session"]
    .map((label) => ({ label, value: Math.max(1, Math.floor(total * (0.1 + rand() * 0.3))) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ total, active, canceled, cancelRate }, ts, types);
}

function buildPanels(
  m: { total: number; active: number; canceled: number; cancelRate: number },
  ts: { x: string; y: number }[],
  types: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Meetings booked", value: m.total, format: "number" },
    { kind: "stat", label: "Active", value: m.active, format: "number" },
    { kind: "stat", label: "Canceled", value: m.canceled, format: "number", invertDelta: true },
    { kind: "stat", label: "Cancel rate", value: m.cancelRate, format: "percent", invertDelta: true },
    {
      kind: "timeseries",
      title: "Meetings booked",
      series: [{ name: "Meetings", points: ts }],
    },
    { kind: "breakdown", title: "By event type", display: "donut", rows: types },
  ];
}

export const calendlyConnector: Connector<CalendlyConfig> = {
  type: "calendly",
  label: "Scheduling",
  category: "Scheduling",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "calendly", label: "Scheduling", category: "Scheduling" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[calendly] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
