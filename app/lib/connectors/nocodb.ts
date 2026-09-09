/**
 * NocoDB connector — records in a table on a self-hosted NocoDB instance.
 * Auth: personal API token (`xc-token` header).
 *
 * Env: NOCODB_API_TOKEN, and a shared NOCODB_BASE_URL (the instance's origin,
 * e.g. "https://nocodb.artformagency.com") unless each source overrides it.
 * Config: { tableId, baseUrl?, dateField? }.
 *
 * Open-source, self-hosted alternative to the Airtable connector
 * (airtable.ts) — same shape and same limitation: NocoDB has no analytics
 * API, so this surfaces record volume and growth, which is what a
 * hand-maintained ops table (conferences, contacts, BD activities, persona
 * mappings…) actually needs on a dashboard.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo } from "./util";

interface NocodbConfig {
  /** The table's id (from the table's API docs page in NocoDB). */
  tableId: string;
  /** Instance origin; falls back to NOCODB_BASE_URL. */
  baseUrl?: string;
  /** Field holding each record's creation date; defaults to "CreatedAt". */
  dateField?: string;
  /** Optional label override (also settable via the source's `label`). */
  label?: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

function token(): string | undefined {
  return process.env.NOCODB_API_TOKEN;
}

function baseUrl(config: NocodbConfig): string | undefined {
  return config.baseUrl ?? process.env.NOCODB_BASE_URL;
}

async function fetchLive(config: NocodbConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const origin = baseUrl(config);
  if (!origin) throw new Error("nocodb: no baseUrl configured (set NOCODB_BASE_URL or config.baseUrl)");
  const dateField = config.dateField ?? "CreatedAt";

  const records: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    const res = await fetch(`${origin.replace(/\/$/, "")}/api/v2/tables/${config.tableId}/records?${qs}`, {
      headers: { "xc-token": token()! },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`NocoDB ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { list?: Record<string, unknown>[]; pageInfo?: { isLastPage?: boolean } };
    records.push(...(json.list ?? []));
    if (json.pageInfo?.isLastPage !== false) break;
  }

  const start = dateNDaysAgo(ctx.days - 1);
  const byDate = new Map<string, number>();
  let created = 0;
  for (const r of records) {
    const raw = r[dateField];
    const date = typeof raw === "string" ? raw.slice(0, 10) : "";
    if (date && date >= start) {
      created += 1;
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }
  }
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  return buildPanels({ total: records.length, created }, ts);
}

function fetchMock(config: NocodbConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`nocodb:${config.tableId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 2 + Math.floor(rand() * 12));
  const created = series.total;
  const total = created + 40 + Math.floor(rand() * 400);
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  return buildPanels({ total, created }, ts);
}

function buildPanels(m: { total: number; created: number }, ts: { x: string; y: number }[]): Panel[] {
  return [
    { kind: "stat", label: "Total records", value: m.total, format: "compact" },
    { kind: "stat", label: "New this period", value: m.created, format: "number" },
    {
      kind: "timeseries",
      title: "New records",
      series: [{ name: "Records", points: ts }],
    },
  ];
}

export const nocodbConnector: Connector<NocodbConfig> = {
  type: "nocodb",
  label: "Operations",
  category: "Operations",
  isLive: (config) => Boolean(token() && baseUrl(config)),
  async fetch(config, ctx) {
    const base = { sourceId: "nocodb", label: config.label ?? "Operations", category: "Operations" };
    if (!token() || !baseUrl(config)) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[nocodb] live fetch failed for table ${config.tableId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
