/**
 * Connector registry + orchestrator.
 *
 * Register a new provider by adding it to `connectors`. A client opts into any
 * provider by listing a source of that `type` in the client registry.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import pLimit from "p-limit";
import type { Client } from "@/config/clients";
import {
  type Connector,
  type ConnectorContext,
  type ConnectorResult,
} from "./types";
import { mergeResults } from "./merge";
import { windowDates, type ResolvedRange, type Window } from "@/lib/range";
import { ga4Connector } from "./ga4";
import { gsheetsConnector } from "./gsheets";
import { searchConsoleConnector } from "./searchConsole";
import { googleAdsConnector } from "./googleAds";
import { bingWebmasterConnector } from "./bingWebmaster";
import { metaAdsConnector } from "./metaAds";
import { linkedinAdsConnector } from "./linkedinAds";
import { mailchimpConnector } from "./mailchimp";
import { shopifyConnector } from "./shopify";
import { stripeConnector } from "./stripe";
import { plausibleConnector } from "./plausible";
import { youtubeConnector } from "./youtube";
import { tiktokAdsConnector } from "./tiktokAds";
import { hubspotConnector } from "./hubspot";
import { sendgridConnector } from "./sendgrid";
import { posthogConnector } from "./posthog";
import { matomoConnector } from "./matomo";
import { pinterestAdsConnector } from "./pinterestAds";
import { snapchatAdsConnector } from "./snapchatAds";
import { twilioConnector } from "./twilio";
import { zendeskConnector } from "./zendesk";
import { githubConnector } from "./github";
import { calendlyConnector } from "./calendly";
import { intercomConnector } from "./intercom";
import { typeformConnector } from "./typeform";
import { squareConnector } from "./square";
import { paypalConnector } from "./paypal";
import { cloudflareConnector } from "./cloudflare";
import { klaviyoConnector } from "./klaviyo";
import { sentryConnector } from "./sentry";
import { linearConnector } from "./linear";
import { zoomConnector } from "./zoom";
import { amplitudeConnector } from "./amplitude";
import { activeCampaignConnector } from "./activecampaign";
import { airtableConnector } from "./airtable";
import { microsoftAdsConnector } from "./microsoftAds";
import { nocodbConnector } from "./nocodb";
import { pagespeedConnector } from "./pagespeed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const connectors: Record<string, Connector<any>> = {
  [ga4Connector.type]: ga4Connector,
  [gsheetsConnector.type]: gsheetsConnector,
  [searchConsoleConnector.type]: searchConsoleConnector,
  [googleAdsConnector.type]: googleAdsConnector,
  [bingWebmasterConnector.type]: bingWebmasterConnector,
  [metaAdsConnector.type]: metaAdsConnector,
  [linkedinAdsConnector.type]: linkedinAdsConnector,
  [mailchimpConnector.type]: mailchimpConnector,
  [shopifyConnector.type]: shopifyConnector,
  [stripeConnector.type]: stripeConnector,
  [plausibleConnector.type]: plausibleConnector,
  [youtubeConnector.type]: youtubeConnector,
  [tiktokAdsConnector.type]: tiktokAdsConnector,
  [hubspotConnector.type]: hubspotConnector,
  [sendgridConnector.type]: sendgridConnector,
  [posthogConnector.type]: posthogConnector,
  [matomoConnector.type]: matomoConnector,
  [pinterestAdsConnector.type]: pinterestAdsConnector,
  [snapchatAdsConnector.type]: snapchatAdsConnector,
  [twilioConnector.type]: twilioConnector,
  [zendeskConnector.type]: zendeskConnector,
  [githubConnector.type]: githubConnector,
  [calendlyConnector.type]: calendlyConnector,
  [intercomConnector.type]: intercomConnector,
  [typeformConnector.type]: typeformConnector,
  [squareConnector.type]: squareConnector,
  [paypalConnector.type]: paypalConnector,
  [cloudflareConnector.type]: cloudflareConnector,
  [klaviyoConnector.type]: klaviyoConnector,
  [sentryConnector.type]: sentryConnector,
  [linearConnector.type]: linearConnector,
  [zoomConnector.type]: zoomConnector,
  [amplitudeConnector.type]: amplitudeConnector,
  [activeCampaignConnector.type]: activeCampaignConnector,
  [airtableConnector.type]: airtableConnector,
  [microsoftAdsConnector.type]: microsoftAdsConnector,
  [nocodbConnector.type]: nocodbConnector,
  [pagespeedConnector.type]: pagespeedConnector,
};

export function connectorFor(type: string): Connector | undefined {
  return connectors[type];
}

// Cap how many provider APIs we hit at once. A client with many sources
// (doubled when comparing) shouldn't fire dozens of simultaneous requests.
const MAX_CONCURRENT_SOURCES = 6;

/** Fetch every configured source for a client over one window, in parallel. */
async function fetchWindowUncached(client: Client, w: Window): Promise<ConnectorResult[]> {
  // Fires only on cache misses (or via the uncached debug path) — repeated
  // page loads of the same window should NOT repeat this line.
  console.log(`[connectors] fetching window ${w.key} for ${client.slug}`);
  const ctx: ConnectorContext = {
    range: w.key,
    days: w.days,
    start: w.start,
    end: w.end,
  };
  const limit = pLimit(MAX_CONCURRENT_SOURCES);
  const results = await Promise.all(
    client.sources.map((source, i): Promise<ConnectorResult> =>
      limit(async () => {
        const connector = connectors[source.type];
        if (!connector) {
          return {
            sourceId: source.id ?? `${source.type}-${i}`,
            type: source.type,
            label: source.label ?? source.type,
            category: "Unknown",
            panels: [],
            isMock: true,
            error: `No connector registered for type "${source.type}"`,
          };
        }
        const result = await connector.fetch(source.config, ctx);
        return {
          ...result,
          // An explicit registry `id` is the durable identity (custom views
          // reference it); otherwise fall back to the positional suffix.
          sourceId: source.id ?? `${result.sourceId}-${i}`,
          type: source.type,
          label: source.label ?? result.label,
        };
      }),
    ),
  );
  // Relabel mock timeseries onto the real window dates so custom/past ranges
  // show correct axes. Live data already carries its own dates, so leave it.
  const dates = windowDates(w);
  for (const r of results) {
    if (!r.isMock) continue;
    for (const p of r.panels) {
      if (p.kind !== "timeseries") continue;
      for (const s of p.series) {
        s.points = s.points.map((pt, i) => ({ x: dates[i] ?? pt.x, y: pt.y }));
      }
    }
  }
  return results;
}

/**
 * Cached per-window provider fetch.
 *
 * Why the page's `export const revalidate = 3600` doesn't cover this: reading
 * `searchParams` makes the dashboard route dynamic (no full-route cache), GA4's
 * gRPC client bypasses Next's fetch cache entirely, and the REST connectors use
 * `cache: "no-store"`. So without this wrapper every page view re-hits every
 * provider API. `unstable_cache` memoizes the normalized ConnectorResult[] in
 * the data cache instead, keyed by:
 *   - client slug + window key (start_end) — one entry per client per window;
 *   - a JSON digest of `client.sources` — editing a source's config in the
 *     registry changes the key and invalidates immediately.
 * Tagged `client:<slug>` so a future revalidateTag can purge one client.
 *
 * The mock timeseries date-relabeling above is deterministic given the window,
 * so it's safe to run inside the cached function: a cache hit returns points
 * already relabeled onto that exact window's dates.
 */
function fetchWindowCached(client: Client, w: Window): Promise<ConnectorResult[]> {
  const sourcesDigest = JSON.stringify(client.sources);
  return unstable_cache(
    () => fetchWindowUncached(client, w),
    ["connector-window", client.slug, w.key, sourcesDigest],
    { revalidate: 3600, tags: [`client:${client.slug}`] },
  )();
}

type FetchWindow = (client: Client, w: Window) => Promise<ConnectorResult[]>;

async function fetchClientDataWith(
  fetchWindow: FetchWindow,
  client: Client,
  resolved: ResolvedRange,
): Promise<ConnectorResult[]> {
  const primary = await fetchWindow(client, resolved.window);
  if (!resolved.compare) return primary;

  const comparison = await fetchWindow(client, resolved.compare);
  return mergeResults(primary, comparison, windowDates(resolved.window));
}

/**
 * Fetch a client's dashboard data for a resolved range (provider calls served
 * from a 1-hour cache — see fetchWindowCached). When a comparison window is
 * requested, fetches it too and merges it in generically (no connector changes
 * needed): stats gain a `compareValue` + recomputed delta, and time series
 * gain a dashed "previous" overlay aligned on the same axis. Merging is
 * key-based (see ./merge) because panel lists are conditional.
 */
export async function fetchClientData(
  client: Client,
  resolved: ResolvedRange,
): Promise<ConnectorResult[]> {
  return fetchClientDataWith(fetchWindowCached, client, resolved);
}

/**
 * Uncached variant for diagnostics (/api/debug/[client]): always hits the
 * providers so it reports the real live/demo state and current errors.
 */
export async function fetchClientDataUncached(
  client: Client,
  resolved: ResolvedRange,
): Promise<ConnectorResult[]> {
  return fetchClientDataWith(fetchWindowUncached, client, resolved);
}

export * from "./types";
