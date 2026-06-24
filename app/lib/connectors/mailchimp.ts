/**
 * Mailchimp connector — Marketing API campaign reports.
 * Auth: API key (format "xxxx-usNN"); the datacenter is the suffix after "-".
 * HTTP Basic auth with any username and the key as the password.
 *
 * Env: MAILCHIMP_API_KEY.  Config: {} (account-level across recent campaigns).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

interface MailchimpConfig {
  /** Optional: restrict to a single audience/list id. */
  listId?: string;
}

function apiKey(): string | undefined {
  return process.env.MAILCHIMP_API_KEY;
}

function datacenter(key: string): string {
  return key.split("-")[1] ?? "us1";
}

async function fetchLive(config: MailchimpConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const key = apiKey()!;
  const dc = datacenter(key);
  const since = `${dateNDaysAgo(ctx.days)}T00:00:00+00:00`;
  const params = new URLSearchParams({ count: "200", since_send_time: since });
  if (config.listId) params.set("list_id", config.listId);

  const res = await fetch(`https://${dc}.api.mailchimp.com/3.0/reports?${params}`, {
    headers: { Authorization: `Basic ${Buffer.from(`any:${key}`).toString("base64")}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Mailchimp ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const reports: any[] = json.reports ?? [];

  let sent = 0;
  let uniqueOpens = 0;
  let uniqueClicks = 0;
  const byDate = new Map<string, number>();
  const campaigns: { label: string; value: number }[] = [];

  for (const r of reports) {
    const emails = num(r.emails_sent);
    sent += emails;
    uniqueOpens += num(r.opens?.unique_opens);
    uniqueClicks += num(r.clicks?.unique_clicks);
    const date = (r.send_time ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + emails);
    campaigns.push({ label: r.campaign_title || "(untitled)", value: num(r.opens?.unique_opens) });
  }

  const openRate = sent ? uniqueOpens / sent : 0;
  const clickRate = sent ? uniqueClicks / sent : 0;
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));

  return buildPanels(
    { sent, openRate, clickRate, campaigns: reports.length },
    ts,
    campaigns.sort((a, b) => b.value - a.value).slice(0, 8),
  );
}

function fetchMock(config: MailchimpConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`mc:${config.listId ?? "all"}:${ctx.range}`);
  const numCampaigns = 3 + Math.floor(rand() * 6);
  const series = mockSeries(rand, ctx.days, 2000 + Math.floor(rand() * 6000));
  const sent = series.total;
  const openRate = 0.25 + rand() * 0.3;
  const clickRate = 0.02 + rand() * 0.06;
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const titles = ["Weekly Newsletter", "Product Launch", "Black Friday", "Welcome Series", "Re-engagement", "Event Invite", "Survey", "Holiday Sale"];
  const campaigns = titles
    .slice(0, numCampaigns)
    .map((label) => ({ label, value: Math.floor(sent * openRate * (0.1 + rand() * 0.25)) }))
    .sort((a, b) => b.value - a.value);
  return buildPanels({ sent, openRate, clickRate, campaigns: numCampaigns }, ts, campaigns);
}

function buildPanels(
  m: { sent: number; openRate: number; clickRate: number; campaigns: number },
  ts: { x: string; y: number }[],
  campaigns: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Emails sent", value: m.sent, format: "compact" },
    { kind: "stat", label: "Open rate", value: m.openRate, format: "percent" },
    { kind: "stat", label: "Click rate", value: m.clickRate, format: "percent" },
    { kind: "stat", label: "Campaigns", value: m.campaigns, format: "number" },
    {
      kind: "timeseries",
      title: "Emails sent",
      series: [{ name: "Emails sent", points: ts }],
    },
    { kind: "breakdown", title: "Top campaigns by opens", display: "table", valueLabel: "Opens", rows: campaigns },
  ];
}

export const mailchimpConnector: Connector<MailchimpConfig> = {
  type: "mailchimp",
  label: "Email Marketing",
  category: "Email",
  isLive: () => Boolean(apiKey()),
  async fetch(config, ctx) {
    const base = { sourceId: "mailchimp", label: "Email Marketing", category: "Email" };
    if (!apiKey()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[mailchimp] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
