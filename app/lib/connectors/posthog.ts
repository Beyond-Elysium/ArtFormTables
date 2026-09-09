/**
 * PostHog connector — Query API (HogQL).
 * Auth: personal API key (bearer).
 *
 * Env: POSTHOG_API_KEY, optional POSTHOG_HOST (default https://us.posthog.com).
 * Config: { projectId }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { isPlaceholderId } from "./placeholder";
import { mockSeries, rng } from "./mock";
import { num, rangeDates } from "./util";

interface PostHogConfig {
  projectId: string;
}

function apiKey(): string | undefined {
  return process.env.POSTHOG_API_KEY;
}

function host(): string {
  return process.env.POSTHOG_HOST || "https://us.posthog.com";
}

async function hogql(projectId: string, query: string): Promise<any[][]> {
  const res = await fetch(`${host()}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()!}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.results ?? [];
}

async function fetchLive(config: PostHogConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const { start, end } = rangeDates(ctx.days);
  const where = `timestamp >= toDateTime('${start} 00:00:00') AND timestamp <= toDateTime('${end} 23:59:59')`;

  const [daily, totalsRows, topEvents] = await Promise.all([
    hogql(
      config.projectId,
      `SELECT toDate(timestamp) AS day, countIf(event = '$pageview') AS views, count(DISTINCT person_id) AS users
       FROM events WHERE ${where} GROUP BY day ORDER BY day`,
    ),
    hogql(
      config.projectId,
      `SELECT countIf(event = '$pageview') AS views, count(DISTINCT person_id) AS users, count() AS events
       FROM events WHERE ${where}`,
    ),
    hogql(
      config.projectId,
      `SELECT event, count() AS c FROM events WHERE ${where} GROUP BY event ORDER BY c DESC LIMIT 8`,
    ),
  ]);

  const ts = daily.map((r) => ({ x: String(r[0]), views: num(r[1]), users: num(r[2]) }));
  const t = totalsRows[0] ?? [0, 0, 0];
  const events = topEvents.map((r) => ({ label: String(r[0]), value: num(r[1]) }));

  return buildPanels(
    { views: num(t[0]), users: num(t[1]), events: num(t[2]) },
    ts,
    events,
  );
}

function fetchMock(config: PostHogConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`posthog:${config.projectId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 400 + Math.floor(rand() * 1200));
  const users = series.total;
  const ts = series.points.map((pt) => ({ x: pt.x, views: Math.floor(pt.y * (2 + rand() * 2)), users: pt.y }));
  const views = ts.reduce((a, b) => a + b.views, 0);
  const events = Math.floor(views * (3 + rand() * 4));
  const names = ["$pageview", "$autocapture", "button clicked", "signup completed", "feature used", "$pageleave", "form submitted", "checkout started"];
  const top = names
    .map((label) => ({ label, value: Math.floor(events * (0.03 + rand() * 0.2)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ views, users, events }, ts, top);
}

function buildPanels(
  m: { views: number; users: number; events: number },
  ts: { x: string; views: number; users: number }[],
  events: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Unique users", value: m.users, format: "compact" },
    { kind: "stat", label: "Pageviews", value: m.views, format: "compact" },
    { kind: "stat", label: "Events", value: m.events, format: "compact" },
    {
      kind: "timeseries",
      title: "Users & pageviews",
      series: [
        { name: "Users", points: ts.map((p) => ({ x: p.x, y: p.users })) },
        { name: "Pageviews", points: ts.map((p) => ({ x: p.x, y: p.views })) },
      ],
    },
    { kind: "breakdown", title: "Top events", display: "table", valueLabel: "Count", rows: events },
  ];
}

export const posthogConnector: Connector<PostHogConfig> = {
  type: "posthog",
  label: "Product Analytics",
  category: "Product",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "posthog", label: "Product Analytics", category: "Product" };
    // A filler project id (e.g. "00000") can never resolve — serve mock
    // directly even when POSTHOG_API_KEY is set.
    if (!apiKey() || isPlaceholderId(config.projectId))
      return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[posthog] live fetch failed for ${config.projectId}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
