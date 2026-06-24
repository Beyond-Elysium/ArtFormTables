/**
 * Client registry — the single source of truth for which clients exist, what
 * subdomain they live on, which data sources feed their dashboard, and any
 * per-client brand overrides.
 *
 * Each client has one or more `sources`. A source names a connector `type`
 * (see lib/connectors) plus the type-specific `config` that connector needs
 * (e.g. a GA4 property id, a Search Console site URL, a Google Ads customer id).
 *
 * Add a client = add an entry. Add a data source to a client = add to `sources`.
 * Hook up a brand-new API = add a connector in lib/connectors, then reference
 * its `type` here. No database needed for the MVP.
 */

export interface ClientBrand {
  /** Primary action colour. Defaults to ArtForm Brand Blue. */
  primary?: string;
  /** Accent colour (charts, highlights). Defaults to ArtForm Brand Pink. */
  accent?: string;
  /** Optional logo URL shown in the navbar; falls back to the client name. */
  logo?: string;
}

/** One data source on a client dashboard. */
export interface ClientSource {
  /** Connector type, e.g. "ga4" | "search-console" | "google-ads" | "bing-webmaster". */
  type: string;
  /** Optional override for the section heading. */
  label?: string;
  /** Connector-specific configuration. */
  config: Record<string, unknown>;
}

export interface Client {
  /** Subdomain label, e.g. "acme" for acme.dashboards.artform.com. */
  subdomain: string;
  /** Display name shown in the dashboard header. */
  name: string;
  sources: ClientSource[];
  brand?: ClientBrand;
}

export const clients: Client[] = [
  {
    subdomain: "acme",
    name: "Acme Corporation",
    brand: { primary: "#426fb6", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "000000001" } },
      { type: "search-console", config: { siteUrl: "https://acme.example/" } },
      { type: "google-ads", config: { customerId: "111-111-1111", currency: "USD" } },
      { type: "meta-ads", config: { adAccountId: "1234567890", currency: "USD" } },
      { type: "mailchimp", config: {} },
    ],
  },
  {
    subdomain: "globex",
    name: "Globex",
    brand: { primary: "#0ca678", accent: "#f15e4d" },
    sources: [
      { type: "ga4", config: { propertyId: "000000002" } },
      { type: "search-console", config: { siteUrl: "https://globex.example/" } },
      { type: "linkedin-ads", config: { accountId: "503012345", currency: "EUR" } },
      { type: "plausible", config: { siteId: "globex.example" } },
    ],
  },
  {
    subdomain: "initech",
    name: "Initech",
    brand: { primary: "#333333", accent: "#98d7eb" },
    sources: [
      { type: "ga4", config: { propertyId: "000000003" } },
      { type: "google-ads", config: { customerId: "222-222-2222", currency: "GBP" } },
      { type: "bing-webmaster", config: { siteUrl: "https://initech.example/" } },
    ],
  },
  {
    subdomain: "northwind",
    name: "Northwind Traders",
    brand: { primary: "#d6336c", accent: "#f59f00" },
    sources: [
      { type: "ga4", config: { propertyId: "000000004" } },
      { type: "shopify", config: { shop: "northwind", currency: "USD" } },
      { type: "stripe", config: { currency: "USD" } },
      { type: "meta-ads", config: { adAccountId: "9876543210", currency: "USD" } },
    ],
  },
];

export function getClientBySubdomain(subdomain: string): Client | undefined {
  return clients.find((c) => c.subdomain === subdomain.toLowerCase());
}
