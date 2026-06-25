/**
 * Zoom connector — Daily usage report.
 * Auth: Server-to-Server OAuth (account credentials → access token).
 *
 * Env: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.  Config: {}.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

type ZoomConfig = Record<string, never>;

function configured(): boolean {
  return Boolean(
    process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET,
  );
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const auth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const qs = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: process.env.ZOOM_ACCOUNT_ID!,
  });
  const res = await fetch(`https://zoom.us/oauth/token?${qs}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zoom OAuth ${res.status}: ${await res.text()}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + num(json.expires_in) * 1000 };
  return cachedToken.value;
}

async function dailyReport(token: string, year: number, month: number): Promise<any[]> {
  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  const res = await fetch(`https://api.zoom.us/v2/report/daily?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Zoom ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.dates ?? [];
}

async function fetchLive(_config: ZoomConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const token = await accessToken();
  const start = dateNDaysAgo(ctx.days - 1);
  const end = dateNDaysAgo(0);

  // The daily report is scoped to one month; fetch each month the window spans.
  const months = new Set<string>();
  for (let i = 0; i < ctx.days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    months.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
  }
  const all: any[] = [];
  for (const ym of months) {
    const [y, m] = ym.split("-").map(Number);
    all.push(...(await dailyReport(token, y, m)));
  }

  const inRange = all.filter((d) => d.date >= start && d.date <= end);
  let meetings = 0;
  let participants = 0;
  let minutes = 0;
  const ts = inRange
    .map((d) => {
      meetings += num(d.meetings);
      participants += num(d.participants);
      minutes += num(d.meeting_minutes);
      return { x: d.date as string, meetings: num(d.meetings), participants: num(d.participants) };
    })
    .sort((a, b) => a.x.localeCompare(b.x));

  return buildPanels({ meetings, participants, minutes }, ts);
}

function fetchMock(_config: ZoomConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`zoom:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 8 + Math.floor(rand() * 30));
  const meetings = series.total;
  const ts = series.points.map((pt) => ({ x: pt.x, meetings: pt.y, participants: Math.floor(pt.y * (3 + rand() * 5)) }));
  const participants = ts.reduce((a, b) => a + b.participants, 0);
  const minutes = Math.floor(meetings * (25 + rand() * 40));
  return buildPanels({ meetings, participants, minutes }, ts);
}

function buildPanels(
  m: { meetings: number; participants: number; minutes: number },
  ts: { x: string; meetings: number; participants: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Meetings", value: m.meetings, format: "compact" },
    { kind: "stat", label: "Participants", value: m.participants, format: "compact" },
    { kind: "stat", label: "Meeting minutes", value: m.minutes, format: "compact" },
    {
      kind: "timeseries",
      title: "Meetings & participants",
      series: [
        { name: "Meetings", points: ts.map((p) => ({ x: p.x, y: p.meetings })) },
        { name: "Participants", points: ts.map((p) => ({ x: p.x, y: p.participants })) },
      ],
    },
  ];
}

export const zoomConnector: Connector<ZoomConfig> = {
  type: "zoom",
  label: "Meetings",
  category: "Meetings",
  isLive: () => configured(),
  async fetch(config, ctx) {
    const base = { sourceId: "zoom", label: "Meetings", category: "Meetings" };
    if (!configured()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[zoom] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
