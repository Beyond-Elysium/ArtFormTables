/**
 * HubSpot connector — CRM Search API.
 * Auth: private-app access token (bearer).
 *
 * A HubSpot private-app token is scoped to ONE portal, so multi-client setups
 * need one token per client's HubSpot account. A source names its own env var
 * via `config.tokenEnv` (e.g. "HUBSPOT_TOKEN_ARTFORM"); it falls back to the
 * shared HUBSPOT_ACCESS_TOKEN when unset. The token value itself lives only in
 * env, never in the committed config.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { previousWindow, resolveWindow } from "./dates";
import { num, pct } from "./util";

interface HubSpotConfig {
  /** Name of the env var holding this client's HubSpot private-app token. */
  tokenEnv?: string;
  /** Optional pipeline id to scope deals. */
  pipeline?: string;
}

const MAX_PAGES = 5;

function token(config: HubSpotConfig): string | undefined {
  return (config.tokenEnv ? process.env[config.tokenEnv] : undefined) || process.env.HUBSPOT_ACCESS_TOKEN;
}

function epochMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

async function search(tok: string, object: string, body: unknown): Promise<any> {
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/${object}/search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Total count for an object created within [start, end]. */
async function countCreated(tok: string, object: string, start: string, end: string): Promise<number> {
  const json = await search(tok, object, {
    filterGroups: [
      {
        filters: [
          { propertyName: "createdate", operator: "GTE", value: epochMs(start) },
          { propertyName: "createdate", operator: "LTE", value: epochMs(end) },
        ],
      },
    ],
    limit: 1,
  });
  return num(json.total);
}

/** Page through deals created in the window to sum amount + bucket by day/stage. */
async function fetchDeals(tok: string, start: string, end: string, pipeline?: string) {
  const filters: any[] = [
    { propertyName: "createdate", operator: "GTE", value: epochMs(start) },
    { propertyName: "createdate", operator: "LTE", value: epochMs(end) },
  ];
  if (pipeline) filters.push({ propertyName: "pipeline", operator: "EQ", value: pipeline });

  let after: string | undefined;
  let amount = 0;
  let count = 0;
  const byDate = new Map<string, number>();
  const byStage = new Map<string, number>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const json: any = await search(tok, "deals", {
      filterGroups: [{ filters }],
      properties: ["amount", "dealstage", "createdate"],
      limit: 100,
      ...(after ? { after } : {}),
    });
    for (const d of json.results ?? []) {
      const p = d.properties ?? {};
      const a = num(p.amount);
      amount += a;
      count += 1;
      const date = (p.createdate ?? "").slice(0, 10);
      if (date) byDate.set(date, (byDate.get(date) ?? 0) + a);
      const stage = p.dealstage || "unknown";
      byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
    }
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return { amount, count, byDate, byStage };
}

async function fetchLive(config: HubSpotConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const tok = token(config)!;
  const w = resolveWindow(ctx);
  const p = previousWindow(w);
  const [contacts, prevContacts, deals, prevDealCount] = await Promise.all([
    countCreated(tok, "contacts", w.start, w.end),
    countCreated(tok, "contacts", p.start, p.end),
    fetchDeals(tok, w.start, w.end, config.pipeline),
    countCreated(tok, "deals", p.start, p.end),
  ]);

  const aov = deals.count ? deals.amount / deals.count : 0;
  const ts = [...deals.byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  const stages = [...deals.byStage.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  return buildPanels(
    { contacts, deals: deals.count, value: deals.amount, aov },
    { contacts: pct(contacts, prevContacts), deals: pct(deals.count, prevDealCount) },
    ts,
    stages,
  );
}

function fetchMock(config: HubSpotConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`hubspot:${config.pipeline ?? "all"}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 3 + Math.floor(rand() * 12));
  const deals = series.total;
  const avg = 1500 + rand() * 8000;
  const value = Math.round(deals * avg);
  const contacts = Math.floor(deals * (8 + rand() * 20));
  const ts = series.points.map((pt) => ({ x: pt.x, y: Math.round(pt.y * avg) }));
  const stages = ["Appointment scheduled", "Qualified to buy", "Presentation scheduled", "Decision maker bought-in", "Contract sent", "Closed won"]
    .map((label) => ({ label, value: Math.max(1, Math.floor(deals * (0.05 + rand() * 0.25))) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels(
    { contacts, deals, value, aov: avg },
    { contacts: Math.round((rand() * 40 - 10) * 10) / 10, deals: Math.round((rand() * 40 - 10) * 10) / 10 },
    ts,
    stages,
  );
}

function buildPanels(
  m: { contacts: number; deals: number; value: number; aov: number },
  d: { contacts: number; deals: number },
  ts: { x: string; y: number }[],
  stages: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "New contacts", value: m.contacts, format: "number", delta: d.contacts },
    { kind: "stat", label: "Deals created", value: m.deals, format: "number", delta: d.deals },
    { kind: "stat", label: "Pipeline value", value: m.value, format: "currency", delta: undefined },
    { kind: "stat", label: "Avg. deal size", value: m.aov, format: "currency" },
    {
      kind: "timeseries",
      title: "Deal value created",
      series: [{ name: "Deal value", points: ts }],
    },
    { kind: "breakdown", title: "Deals by stage", display: "donut", rows: stages },
  ];
}

export const hubspotConnector: Connector<HubSpotConfig> = {
  type: "hubspot",
  label: "CRM",
  category: "CRM",
  isLive: (config) => Boolean(token(config)),
  async fetch(config, ctx) {
    const base = { sourceId: "hubspot", label: "CRM", category: "CRM" };
    if (!token(config)) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[hubspot] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
