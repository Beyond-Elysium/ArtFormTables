/**
 * GitHub connector — repository stats + traffic.
 * Auth: a token (classic or fine-grained) with read access to the repo; the
 * traffic endpoints require push/admin access.
 *
 * Env: GITHUB_TOKEN.  Config: { owner, repo }.
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { rng } from "./mock";
import { num } from "./util";

interface GitHubConfig {
  owner: string;
  repo: string;
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN;
}

async function gh(path: string): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token()!}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchLive(config: GitHubConfig): Promise<Panel[]> {
  const { owner, repo } = config;
  const [meta, views, referrers] = await Promise.all([
    gh(`/repos/${owner}/${repo}`),
    gh(`/repos/${owner}/${repo}/traffic/views`).catch(() => ({ count: 0, views: [] })),
    gh(`/repos/${owner}/${repo}/traffic/popular/referrers`).catch(() => []),
  ]);

  const ts = ((views.views ?? []) as any[]).map((v) => ({
    x: String(v.timestamp).slice(0, 10),
    views: num(v.count),
    uniques: num(v.uniques),
  }));
  const refs = ((referrers ?? []) as any[])
    .map((r) => ({ label: r.referrer, value: num(r.count) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return buildPanels(
    {
      stars: num(meta.stargazers_count),
      forks: num(meta.forks_count),
      issues: num(meta.open_issues_count),
      views: num(views.count),
    },
    ts,
    refs,
  );
}

function fetchMock(config: GitHubConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`gh:${config.owner}/${config.repo}:${ctx.range}`);
  const stars = 100 + Math.floor(rand() * 40000);
  const forks = Math.floor(stars * (0.1 + rand() * 0.2));
  const issues = Math.floor(rand() * 300);
  const days = Math.min(ctx.days, 14); // GitHub traffic only covers 14 days
  let views = 0;
  const ts: { x: string; views: number; uniques: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const v = 50 + Math.floor(rand() * 500);
    views += v;
    ts.push({ x: d.toISOString().slice(0, 10), views: v, uniques: Math.floor(v * (0.4 + rand() * 0.3)) });
  }
  const refs = ["Google", "github.com", "Bing", "DuckDuckGo", "news.ycombinator.com", "reddit.com"]
    .map((label) => ({ label, value: Math.floor(views * (0.03 + rand() * 0.15)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ stars, forks, issues, views }, ts, refs);
}

function buildPanels(
  m: { stars: number; forks: number; issues: number; views: number },
  ts: { x: string; views: number; uniques: number }[],
  refs: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Stars", value: m.stars, format: "compact" },
    { kind: "stat", label: "Forks", value: m.forks, format: "compact" },
    { kind: "stat", label: "Open issues", value: m.issues, format: "number", invertDelta: true },
    { kind: "stat", label: "Views (14d)", value: m.views, format: "compact" },
    {
      kind: "timeseries",
      title: "Traffic (last 14 days)",
      series: [
        { name: "Views", points: ts.map((p) => ({ x: p.x, y: p.views })) },
        { name: "Unique visitors", points: ts.map((p) => ({ x: p.x, y: p.uniques })) },
      ],
    },
    { kind: "breakdown", title: "Top referrers", display: "table", valueLabel: "Views", rows: refs },
  ];
}

export const githubConnector: Connector<GitHubConfig> = {
  type: "github",
  label: "Repository",
  category: "Developer",
  isLive: () => Boolean(token()),
  async fetch(config, ctx) {
    const base = { sourceId: "github", label: "Repository", category: "Developer" };
    if (!token()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config), isMock: false };
    } catch (err) {
      console.error(`[github] live fetch failed for ${config.owner}/${config.repo}:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
