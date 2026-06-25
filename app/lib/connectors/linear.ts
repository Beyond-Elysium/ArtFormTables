/**
 * Linear connector — GraphQL API.
 * Auth: personal API key (sent raw in the Authorization header, no "Bearer").
 *
 * Env: LINEAR_API_KEY.  Config: {} (workspace-level), optional teamId.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo } from "./util";

interface LinearConfig {
  teamId?: string;
}

const MAX_PAGES = 4;

function apiKey(): string | undefined {
  return process.env.LINEAR_API_KEY;
}

async function graphql(query: string, variables: Record<string, unknown>): Promise<any> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey()!, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Linear ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Linear GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function fetchLive(config: LinearConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const gte = `${dateNDaysAgo(ctx.days)}T00:00:00.000Z`;
  const filter: Record<string, unknown> = { createdAt: { gte } };
  if (config.teamId) filter.team = { id: { eq: config.teamId } };

  const query = `
    query ($filter: IssueFilter, $after: String) {
      issues(filter: $filter, first: 100, after: $after) {
        nodes { createdAt completedAt state { name type } }
        pageInfo { hasNextPage endCursor }
      }
    }`;

  const nodes: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await graphql(query, { filter, after });
    nodes.push(...(data.issues?.nodes ?? []));
    if (!data.issues?.pageInfo?.hasNextPage) break;
    after = data.issues.pageInfo.endCursor;
  }

  let completed = 0;
  let inProgress = 0;
  const byDate = new Map<string, number>();
  const byState = new Map<string, number>();
  for (const n of nodes) {
    if (n.completedAt) completed += 1;
    if (n.state?.type === "started") inProgress += 1;
    const date = (n.createdAt ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + 1);
    const state = n.state?.name ?? "Unknown";
    byState.set(state, (byState.get(state) ?? 0) + 1);
  }
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  const states = [...byState.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  return buildPanels({ created: nodes.length, completed, inProgress }, ts, states);
}

function fetchMock(config: LinearConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`linear:${config.teamId ?? "all"}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 5 + Math.floor(rand() * 20));
  const created = series.total;
  const completed = Math.floor(created * (0.6 + rand() * 0.3));
  const inProgress = Math.floor(created * (0.1 + rand() * 0.2));
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const states = ["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"]
    .map((label) => ({ label, value: Math.max(1, Math.floor(created * (0.1 + rand() * 0.25))) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ created, completed, inProgress }, ts, states);
}

function buildPanels(
  m: { created: number; completed: number; inProgress: number },
  ts: { x: string; y: number }[],
  states: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Issues created", value: m.created, format: "number" },
    { kind: "stat", label: "Completed", value: m.completed, format: "number" },
    { kind: "stat", label: "In progress", value: m.inProgress, format: "number" },
    {
      kind: "timeseries",
      title: "Issues created",
      series: [{ name: "Issues", points: ts }],
    },
    { kind: "breakdown", title: "By status", display: "donut", rows: states },
  ];
}

export const linearConnector: Connector<LinearConfig> = {
  type: "linear",
  label: "Engineering",
  category: "Project Management",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "linear", label: "Engineering", category: "Project Management" };
    if (!apiKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[linear] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
