/**
 * Intercom connector — Search API.
 * Auth: access token (bearer).
 *
 * Env: INTERCOM_ACCESS_TOKEN, optional INTERCOM_VERSION (default 2.11).
 * Config: {} (workspace-level).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { num } from "./util";

type IntercomConfig = Record<string, never>;

const MAX_PAGES = 4;

function token(): string | undefined {
  return process.env.INTERCOM_ACCESS_TOKEN;
}

function unixDaysAgo(n: number): number {
  return Math.floor(Date.now() / 1000) - n * 86400;
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(`https://api.intercom.io${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()!}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Intercom-Version": process.env.INTERCOM_VERSION || "2.11",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Intercom ${res.status}: ${await res.text()}`);
  return res.json();
}

async function searchConversations(sinceUnix: number) {
  let starting_after: string | undefined;
  let total = 0;
  const byDate = new Map<string, number>();
  const byState = new Map<string, number>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const json: any = await post("/conversations/search", {
      query: { field: "created_at", operator: ">", value: sinceUnix },
      pagination: { per_page: 150, ...(starting_after ? { starting_after } : {}) },
    });
    total = num(json.total_count);
    for (const c of json.conversations ?? []) {
      const date = new Date(num(c.created_at) * 1000).toISOString().slice(0, 10);
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
      byState.set(c.state || "unknown", (byState.get(c.state || "unknown") ?? 0) + 1);
    }
    starting_after = json.pages?.next?.starting_after;
    if (!starting_after) break;
  }
  return { total, byDate, byState };
}

async function fetchLive(_config: IntercomConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const since = unixDaysAgo(ctx.days);
  const [conv, contacts, open] = await Promise.all([
    searchConversations(since),
    post("/contacts/search", { query: { field: "created_at", operator: ">", value: since } }),
    post("/conversations/search", { query: { field: "state", operator: "=", value: "open" } }),
  ]);
  const ts = [...conv.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  const states = [...conv.byState.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return buildPanels(
    { conversations: conv.total, contacts: num(contacts.total_count), open: num(open.total_count) },
    ts,
    states,
  );
}

function fetchMock(_config: IntercomConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`intercom:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 10 + Math.floor(rand() * 40));
  const conversations = series.total;
  const contacts = Math.floor(conversations * (1.5 + rand() * 2));
  const open = Math.floor(conversations * (0.1 + rand() * 0.2));
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const states = [
    { label: "closed", value: Math.floor(conversations * (0.6 + rand() * 0.2)) },
    { label: "open", value: open },
    { label: "snoozed", value: Math.floor(conversations * (0.05 + rand() * 0.1)) },
  ].sort((a, b) => b.value - a.value);
  return buildPanels({ conversations, contacts, open }, ts, states);
}

function buildPanels(
  m: { conversations: number; contacts: number; open: number },
  ts: { x: string; y: number }[],
  states: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "New conversations", value: m.conversations, format: "number" },
    { kind: "stat", label: "New contacts", value: m.contacts, format: "number" },
    { kind: "stat", label: "Open now", value: m.open, format: "number", invertDelta: true },
    {
      kind: "timeseries",
      title: "Conversations started",
      series: [{ name: "Conversations", points: ts }],
    },
    { kind: "breakdown", title: "By state", display: "donut", rows: states },
  ];
}

export const intercomConnector: Connector<IntercomConfig> = {
  type: "intercom",
  label: "Live Chat",
  category: "Support",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "intercom", label: "Live Chat", category: "Support" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[intercom] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
