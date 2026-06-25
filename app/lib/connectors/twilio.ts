/**
 * Twilio connector — Messages resource.
 * Auth: HTTP Basic with Account SID + Auth Token.
 *
 * Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN.  Config: {} (account-level).
 */
import "server-only";
import type { Connector, ConnectorContext, Panel } from "./types";
import { mockSeries, rng } from "./mock";
import { dateNDaysAgo, num } from "./util";

type TwilioConfig = Record<string, never>;

const MAX_PAGES = 5;

function creds(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? { sid, token } : null;
}

interface Message {
  status: string;
  date_sent: string | null;
  price: string | null;
}

async function fetchMessages(ctx: ConnectorContext): Promise<Message[]> {
  const { sid, token } = creds()!;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const messages: Message[] = [];
  let path: string | null =
    `/2010-04-01/Accounts/${sid}/Messages.json?DateSent>=${dateNDaysAgo(ctx.days)}&PageSize=1000`;

  for (let page = 0; page < MAX_PAGES && path; page++) {
    const res: Response = await fetch(`https://api.twilio.com${path}`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    const json = await res.json();
    messages.push(...(json.messages ?? []));
    path = json.next_page_uri ?? null;
  }
  return messages;
}

async function fetchLive(_config: TwilioConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const messages = await fetchMessages(ctx);
  let cost = 0;
  let delivered = 0;
  let failed = 0;
  const byDate = new Map<string, number>();
  const byStatus = new Map<string, number>();
  for (const m of messages) {
    cost += Math.abs(num(m.price));
    if (m.status === "delivered") delivered += 1;
    if (m.status === "failed" || m.status === "undelivered") failed += 1;
    const date = (m.date_sent ?? "").length >= 10 ? new Date(m.date_sent as string).toISOString().slice(0, 10) : "";
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + 1);
    byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);
  }
  const ts = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y }));
  const statuses = [...byStatus.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  return buildPanels({ total: messages.length, delivered, failed, cost }, ts, statuses);
}

function fetchMock(_config: TwilioConfig, ctx: ConnectorContext): Panel[] {
  const rand = rng(`twilio:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 200 + Math.floor(rand() * 800));
  const total = series.total;
  const delivered = Math.floor(total * (0.9 + rand() * 0.08));
  const failed = Math.floor(total * (0.005 + rand() * 0.02));
  const cost = Math.round(total * (0.0075 + rand() * 0.01) * 100) / 100;
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const statuses = [
    { label: "delivered", value: delivered },
    { label: "sent", value: Math.max(0, total - delivered - failed) },
    { label: "failed", value: failed },
  ].sort((a, b) => b.value - a.value);
  return buildPanels({ total, delivered, failed, cost }, ts, statuses);
}

function buildPanels(
  m: { total: number; delivered: number; failed: number; cost: number },
  ts: { x: string; y: number }[],
  statuses: { label: string; value: number }[],
): Panel[] {
  return [
    { kind: "stat", label: "Messages", value: m.total, format: "compact" },
    { kind: "stat", label: "Delivered", value: m.delivered, format: "compact" },
    { kind: "stat", label: "Failed", value: m.failed, format: "number", invertDelta: true },
    { kind: "stat", label: "Cost", value: m.cost, format: "currency", invertDelta: true },
    {
      kind: "timeseries",
      title: "Messages sent",
      series: [{ name: "Messages", points: ts }],
    },
    { kind: "breakdown", title: "By status", display: "donut", rows: statuses },
  ];
}

export const twilioConnector: Connector<TwilioConfig> = {
  type: "twilio",
  label: "SMS & Messaging",
  category: "Messaging",
  isLive: () => Boolean(creds()),
  async fetch(config, ctx) {
    const base = { sourceId: "twilio", label: "SMS & Messaging", category: "Messaging" };
    if (!creds()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[twilio] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
