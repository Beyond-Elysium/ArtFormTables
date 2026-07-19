/**
 * Connector registry + orchestrator.
 *
 * Register a new provider by adding it to `connectors`. A client opts into any
 * provider by listing a source of that `type` in the client registry.
 */
import "server-only";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const connectors: Record<string, Connector<any>> = {
  [ga4Connector.type]: ga4Connector,
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
};

export function connectorFor(type: string): Connector | undefined {
  return connectors[type];
}

// Cap how many provider APIs we hit at once. A client with many sources
// (doubled when comparing) shouldn't fire dozens of simultaneous requests.
const MAX_CONCURRENT_SOURCES = 6;

/** Fetch every configured source for a client over one window, in parallel. */
async function fetchWindow(client: Client, w: Window): Promise<ConnectorResult[]> {
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
            sourceId: `${source.type}-${i}`,
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
          sourceId: `${result.sourceId}-${i}`,
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
 * Fetch a client's dashboard data for a resolved range. When a comparison
 * window is requested, fetches it too and merges it in generically (no
 * connector changes needed): stats gain a `compareValue` + recomputed delta,
 * and time series gain a dashed "previous" overlay aligned on the same axis.
 * Merging is key-based (see ./merge) because panel lists are conditional.
 */
export async function fetchClientData(
  client: Client,
  resolved: ResolvedRange,
): Promise<ConnectorResult[]> {
  const primary = await fetchWindow(client, resolved.window);
  if (!resolved.compare) return primary;

  const comparison = await fetchWindow(client, resolved.compare);
  return mergeResults(primary, comparison, windowDates(resolved.window));
}

export * from "./types";
