/**
 * CONNECTOR TEMPLATE — copy this file to add a new data source.
 *
 * Steps:
 *   1. Copy to `myProvider.ts`, rename the symbols, fill in `fetchLive`.
 *   2. Register it in `index.ts` (add to the `connectors` map).
 *   3. Reference its `type` in a client's `sources` in `config/clients.ts`.
 *   4. Add any env vars to `.env.example`.
 *
 * Rules of the road:
 *   - This module is server-only — never import a connector from a client
 *     component (it would leak credentials).
 *   - Always provide a mock fallback so the dashboard renders with no creds.
 *   - Never throw out of `fetch`: catch, log, and fall back to mock.
 *
 * This file is NOT registered, so it's inert — it just compiles as a reference.
 */
import "server-only";
import { z } from "zod";
import type { Connector, ConnectorContext, Panel } from "./types";
import { fetchJson } from "./http";
import { mockSeries, mockDelta, rng } from "./mock";
import { num, rangeDates } from "./util";

// 1) The per-client config stored in config/clients.ts (`source.config`).
interface ExampleConfig {
  accountId: string;
  currency?: string;
}

// 2) Is this source configured? Usually an env-var check (the secret) — and
//    sometimes a per-client config check too.
function isConfigured(): boolean {
  return Boolean(process.env.EXAMPLE_API_TOKEN);
}

/* ----------------------------- live path ----------------------------- */
// Validate the response shape with zod so a payload change fails cleanly
// (→ mock fallback) rather than producing NaN downstream.
const responseSchema = z.object({
  daily: z.array(z.object({ date: z.string(), value: z.number().nullish() })).default([]),
  by_category: z
    .array(z.object({ name: z.string(), value: z.number().nullish() }))
    .default([]),
});

// Talk to the real API and map the response to Panels. `fetchJson` (lib/http)
// adds retry + timeout via ofetch and validates with the schema. See
// googleAuth.ts for the service-account/token helper, googleAds.ts for OAuth
// refresh-token, paypal.ts for OAuth client-credentials, zendesk.ts for Basic.
async function fetchLive(config: ExampleConfig, ctx: ConnectorContext): Promise<Panel[]> {
  const currency = config.currency ?? "USD";
  const { start, end } = rangeDates(ctx.days);

  const json = await fetchJson(
    responseSchema,
    `https://api.example.com/v1/accounts/${config.accountId}/stats?start=${start}&end=${end}`,
    { headers: { Authorization: `Bearer ${process.env.EXAMPLE_API_TOKEN!}` } },
  );

  // Map the API's daily rows into totals + a timeseries.
  let total = 0;
  const ts = json.daily.map((r) => {
    total += num(r.value);
    return { x: r.date.slice(0, 10), y: num(r.value) };
  });

  const breakdown = json.by_category.map((r) => ({ label: r.name, value: num(r.value) }));

  return buildPanels(currency, { total, delta: 0 }, ts, breakdown);
}

/* ----------------------------- mock path ----------------------------- */
// Deterministic so a given client always sees the same demo numbers.
function fetchMock(config: ExampleConfig, ctx: ConnectorContext): Panel[] {
  const currency = config.currency ?? "USD";
  const rand = rng(`example:${config.accountId}:${ctx.range}`);
  const series = mockSeries(rand, ctx.days, 200 + Math.floor(rand() * 800));
  const ts = series.points.map((pt) => ({ x: pt.x, y: pt.y }));
  const breakdown = ["Alpha", "Beta", "Gamma"].map((label) => ({
    label,
    value: Math.floor(series.total * (0.1 + rand() * 0.3)),
  }));
  return buildPanels(currency, { total: series.total, delta: mockDelta(rand) }, ts, breakdown);
}

/* --------------------- shared panel shaping -------------------------- */
// Keep this shared between live and mock so both render identically.
function buildPanels(
  currency: string,
  m: { total: number; delta: number },
  ts: { x: string; y: number }[],
  breakdown: { label: string; value: number }[],
): Panel[] {
  void currency; // use for `format: "currency"` stats if relevant
  return [
    // KPI cards. format: number | compact | percent | decimal | currency | duration
    { kind: "stat", label: "Total", value: m.total, format: "compact", delta: m.delta },
    // A line chart with one or more series.
    { kind: "timeseries", title: "Over time", series: [{ name: "Total", points: ts }] },
    // A ranked breakdown. display: donut | bar | table
    { kind: "breakdown", title: "By category", display: "donut", rows: breakdown },
  ];
}

/* ----------------------------- export -------------------------------- */
export const exampleConnector: Connector<ExampleConfig> = {
  type: "example", // the string used in config/clients.ts sources[].type
  label: "Example Source", // section heading on the dashboard
  category: "Analytics", // grouping badge
  isLive: () => isConfigured(),
  async fetch(config, ctx) {
    const base = { sourceId: "example", label: "Example Source", category: "Analytics" };
    if (!isConfigured()) return { ...base, panels: fetchMock(config, ctx), isMock: true };
    try {
      return { ...base, panels: await fetchLive(config, ctx), isMock: false };
    } catch (err) {
      console.error(`[example] live fetch failed:`, err);
      return { ...base, panels: fetchMock(config, ctx), isMock: true, error: String(err) };
    }
  },
};
