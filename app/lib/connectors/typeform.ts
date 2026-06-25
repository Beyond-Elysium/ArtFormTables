/**
 * Typeform connector — Responses API.
 * Auth: personal access token (bearer).
 *
 * Env: TYPEFORM_ACCESS_TOKEN.  Config: { formId }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

interface TypeformConfig {
  formId: string;
}

function token(): string | undefined {
  return process.env.TYPEFORM_ACCESS_TOKEN;
}

async function fetchLive(config: TypeformConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const since = `${dateNDaysAgo(ctx.days)}T00:00:00Z`;
  const until = `${dateNDaysAgo(0)}T23:59:59Z`;
  const qs = new URLSearchParams({ since, until, page_size: "1000" });
  const res = await fetch(`https://api.typeform.com/forms/${config.formId}/responses?${qs}`, {
    headers: { Authorization: `Bearer ${token()!}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Typeform ${res.status}: ${await res.text()}`);
  const json = await res.json();

  const items: any[] = json.items ?? [];
  const total = num(json.total_items) || items.length;
  let completed = 0;
  const byDate = new Map<string, number>();
  for (const r of items) {
    if (r.submitted_at) completed += 1;
    const date = (r.landed_at ?? r.submitted_at ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  const completionRate = total ? completed / total : 0;
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  return buildPanels({ total, completed, completionRate }, ts);
}

function fetchMock(config: TypeformConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`typeform:${config.formId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 15 + Math.floor(rand() * 60));
  const total = series.total;
  const completionRate = 0.55 + rand() * 0.35;
  const completed = Math.floor(total * completionRate);
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  return buildPanels({ total, completed, completionRate }, ts);
}

function buildPanels(
  m: { total: number; completed: number; completionRate: number },
  ts: { x: string; y: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Responses", value: m.total, format: "number" },
    { kind: "stat", label: "Completed", value: m.completed, format: "number" },
    { kind: "stat", label: "Completion rate", value: m.completionRate, format: "percent" },
    {
      kind: "timeseries",
      title: "Responses over time",
      series: [{ name: "Responses", points: ts }],
    },
  ];
}

export const typeformConnector: Connector<TypeformConfig> = {
  type: "typeform",
  label: "Forms",
  category: "Forms",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "typeform", label: "Forms", category: "Forms" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[typeform] live fetch failed for ${config.formId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
