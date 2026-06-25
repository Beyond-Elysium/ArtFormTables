/**
 * Airtable connector — records in a table.
 * Auth: personal access token (bearer).
 *
 * Env: AIRTABLE_API_KEY.  Config: { baseId, tableName }.
 *
 * Airtable has no analytics API; this surfaces record volume and growth, which
 * is useful for ops tables (leads, submissions, inventory…).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo } from "./util";

interface AirtableConfig {
  baseId: string;
  tableName: string;
}

const MAX_PAGES = 8;

function token(): string | undefined {
  return process.env.AIRTABLE_API_KEY;
}

async function fetchLive(config: AirtableConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const records: { createdTime: string }[] = [];
  let offset: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ pageSize: "100", cellFormat: "json" });
    if (offset) qs.set("offset", offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}?${qs}`,
      { headers: { Authorization: `Bearer ${token()!}` }, cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const r of json.records ?? []) records.push({ createdTime: r.createdTime });
    offset = json.offset;
    if (!offset) break;
  }

  const start = dateNDaysAgo(ctx.days - 1);
  const byDate = new Map<string, number>();
  let created = 0;
  for (const r of records) {
    const date = (r.createdTime ?? "").slice(0, 10);
    if (date >= start) {
      created += 1;
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }
  }
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  return buildPanels({ total: records.length, created }, ts);
}

function fetchMock(config: AirtableConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`airtable:${config.baseId}:${config.tableName}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 4 + Math.floor(rand() * 20));
  const created = series.total;
  const total = created + 500 + Math.floor(rand() * 5000);
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  return buildPanels({ total, created }, ts);
}

function buildPanels(
  m: { total: number; created: number },
  ts: { x: string; y: number }[],
): Panel[] {
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

export const airtableConnector: Connector<AirtableConfig> = {
  type: "airtable",
  label: "Operations",
  category: "Operations",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "airtable", label: "Operations", category: "Operations" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[airtable] live fetch failed for ${config.baseId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
