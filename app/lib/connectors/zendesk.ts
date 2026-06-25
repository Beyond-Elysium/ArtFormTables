/**
 * Zendesk connector — Support API.
 * Auth: API token via HTTP Basic ("{email}/token:{apiToken}").
 *
 * Env: ZENDESK_API_TOKEN.  Config: { subdomain, email }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

interface ZendeskConfig {
  subdomain: string;
  email: string;
}

const MAX_PAGES = 5;

function apiToken(): string | undefined {
  return process.env.ZENDESK_API_TOKEN;
}

async function search(config: ZendeskConfig, query: string): Promise<{ count: number; results: any[] }> {
  const auth = Buffer.from(`${config.email}/token:${apiToken()!}`).toString("base64");
  const results: any[] = [];
  let url: string | null =
    `https://${config.subdomain}.zendesk.com/api/v2/search.json?query=${encodeURIComponent(query)}&per_page=100`;
  let count = 0;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Zendesk ${res.status}: ${await res.text()}`);
    const json = await res.json();
    count = num(json.count);
    results.push(...(json.results ?? []));
    url = json.next_page ?? null;
  }
  return { count, results };
}

async function fetchLive(config: ZendeskConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const start = dateNDaysAgo(ctx.days);
  const [created, solved, open] = await Promise.all([
    search(config, `type:ticket created>=${start}`),
    search(config, `type:ticket solved>=${start}`),
    search(config, `type:ticket status:open`),
  ]);

  const byDate = new Map<string, number>();
  const byPriority = new Map<string, number>();
  for (const t of created.results) {
    const date = (t.created_at ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + 1);
    byPriority.set(t.priority || "none", (byPriority.get(t.priority || "none") ?? 0) + 1);
  }
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  const priorities = [...byPriority.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return buildPanels(
    { created: created.count, solved: solved.count, open: open.count },
    ts,
    priorities,
  );
}

function fetchMock(config: ZendeskConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`zendesk:${config.subdomain}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 8 + Math.floor(rand() * 30));
  const created = series.total;
  const solved = Math.floor(created * (0.8 + rand() * 0.15));
  const open = Math.floor(created * (0.1 + rand() * 0.2));
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const priorities = ["low", "normal", "high", "urgent"]
    .map((label) => ({ label, value: Math.max(1, Math.floor(created * (0.1 + rand() * 0.3))) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ created, solved, open }, ts, priorities);
}

function buildPanels(
  m: { created: number; solved: number; open: number },
  ts: { x: string; y: number }[],
  priorities: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "New tickets", value: m.created, format: "number" },
    { kind: "stat", label: "Solved", value: m.solved, format: "number" },
    { kind: "stat", label: "Currently open", value: m.open, format: "number", invertDelta: true },
    {
      kind: "timeseries",
      title: "Tickets created",
      series: [{ name: "Tickets", points: ts }],
    },
    { kind: "breakdown", title: "By priority", display: "donut", rows: priorities },
  ];
}

export const zendeskConnector: Connector<ZendeskConfig> = {
  type: "zendesk",
  label: "Customer Support",
  category: "Support",
  isLive: () => Boolean(apiToken()),
  async fetch(config, ctx) {
    const base = { sourceId: "zendesk", label: "Customer Support", category: "Support" };
    if (!apiToken()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[zendesk] live fetch failed for ${config.subdomain}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
