/**
 * Connector registry + orchestrator.
 *
 * Register a new provider by adding it to `connectors`. A client opts into any
 * provider by listing a source of that `type` in the client registry.
 */
import "server-only";
import type { Client } from "@/config/clients";
import {
  PRESET_DAYS,
  type Connector,
  type ConnectorResult,
  type DateRangePreset,
} from "./types";
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
};

export function connectorFor(type: string): Connector | undefined {
  return connectors[type];
}

/** Fetch every configured source for a client, in parallel. */
export async function fetchClientData(
  client: Client,
  range: DateRangePreset,
): Promise<ConnectorResult[]> {
  const ctx = { range, days: PRESET_DAYS[range] };
  return Promise.all(
    client.sources.map(async (source, i): Promise<ConnectorResult> => {
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
  );
}

export * from "./types";
