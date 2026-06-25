/**
 * ActiveCampaign connector — Campaigns API.
 * Auth: Api-Token header against the account-specific API URL.
 *
 * Env: ACTIVECAMPAIGN_API_URL (https://{account}.api-us1.com), ACTIVECAMPAIGN_API_TOKEN.
 * Config: {} (account-level).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

type ActiveCampaignConfig = Record<string, never>;

function apiUrl(): string | undefined {
  return process.env.ACTIVECAMPAIGN_API_URL;
}
function apiToken(): string | undefined {
  return process.env.ACTIVECAMPAIGN_API_TOKEN;
}
function configured(): boolean {
  return Boolean(apiUrl() && apiToken());
}

async function fetchLive(_config: ActiveCampaignConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const since = dateNDaysAgo(ctx.days);
  const qs = new URLSearchParams({ limit: "100", orders: "sdate", "filters[sdate_after]": since });
  const res = await fetch(`${apiUrl()!.replace(/\/$/, "")}/api/3/campaigns?${qs}`, {
    headers: { "Api-Token": apiToken()! },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ActiveCampaign ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const campaigns: any[] = json.campaigns ?? [];

  let sends = 0;
  let opens = 0;
  let clicks = 0;
  const byDate = new Map<string, number>();
  const rows: { label: string; value: number }[] = [];
  for (const c of campaigns) {
    const sent = num(c.send_amt);
    sends += sent;
    opens += num(c.uniqueopens);
    clicks += num(c.uniquelinkclicks ?? c.linkclicks);
    const date = (c.sdate ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + sent);
    rows.push({ label: c.name || "(untitled)", value: num(c.uniqueopens) });
  }
  const openRate = sends ? opens / sends : 0;
  const clickRate = sends ? clicks / sends : 0;
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  return buildPanels(
    { sends, openRate, clickRate, campaigns: campaigns.length },
    ts,
    rows.sort((a, b) => b.value - a.value).slice(0, 8),
  );
}

function fetchMock(_config: ActiveCampaignConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`activecampaign:${ctx.range}`);
  const n = 3 + Math.floor(rand() * 6);
  const series = mockSeries(rand, ctx.days, 1500 + Math.floor(rand() * 4000));
  const sends = series.total;
  const openRate = 0.25 + rand() * 0.3;
  const clickRate = 0.02 + rand() * 0.05;
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const titles = ["Newsletter", "Promo Blast", "Drip 1", "Re-engagement", "Webinar Invite", "Product Update", "Survey", "Win-back"];
  const rows = titles.slice(0, n)
    .map((label) => ({ label, value: Math.floor(sends * openRate * (0.1 + rand() * 0.25)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ sends, openRate, clickRate, campaigns: n }, ts, rows);
}

function buildPanels(
  m: { sends: number; openRate: number; clickRate: number; campaigns: number },
  ts: { x: string; y: number }[],
  rows: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Emails sent", value: m.sends, format: "compact" },
    { kind: "stat", label: "Open rate", value: m.openRate, format: "percent" },
    { kind: "stat", label: "Click rate", value: m.clickRate, format: "percent" },
    { kind: "stat", label: "Campaigns", value: m.campaigns, format: "number" },
    {
      kind: "timeseries",
      title: "Emails sent",
      series: [{ name: "Sent", points: ts }],
    },
    { kind: "breakdown", title: "Top campaigns by opens", display: "table", valueLabel: "Opens", rows },
  ];
}

export const activeCampaignConnector: Connector<ActiveCampaignConfig> = {
  type: "activecampaign",
  label: "Marketing Automation",
  category: "Email",
  isLive: () => configured(),
  async fetch(config, ctx) {
    const base = { sourceId: "activecampaign", label: "Marketing Automation", category: "Email" };
    if (!configured()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[activecampaign] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
