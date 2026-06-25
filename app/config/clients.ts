/**
 * Client registry — the single source of truth for which clients exist, what
 * URL slug they live at (sitename.com/<slug>), which data sources feed their
 * dashboard, and any per-client brand overrides.
 *
 * Each client has one or more `sources`. A source names a connector `type`
 * (see lib/connectors) plus the type-specific `config` that connector needs
 * (e.g. a GA4 property id, a Search Console site URL, a Google Ads customer id).
 *
 * Add a client = add an entry. Add a data source to a client = add to `sources`.
 * Hook up a brand-new API = add a connector in lib/connectors, then reference
 * its `type` here. No database needed for the MVP.
 */

import { z } from "zod";

// The registry is validated by zod at import: a malformed entry (bad slug, bad
// hex colour, missing fields) fails the build loudly rather than rendering
// something broken at request time. Types are inferred from the schemas.

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex colour");

const clientBrandSchema = z.object({
  /** Primary action colour. Defaults to ArtForm Brand Blue. */
  primary: hexColor.optional(),
  /** Accent colour (charts, highlights). Defaults to ArtForm Brand Pink. */
  accent: hexColor.optional(),
  /** Optional logo URL shown in the navbar; falls back to the client name. */
  logo: z.string().url().optional(),
});

const clientSourceSchema = z.object({
  /** Connector type, e.g. "ga4" | "search-console" | "google-ads". */
  type: z.string().min(1),
  /** Optional override for the section heading. */
  label: z.string().optional(),
  /** Connector-specific configuration. */
  config: z.record(z.string(), z.unknown()).default({}),
});

const clientSchema = z.object({
  /** URL slug, e.g. "acme" for sitename.com/acme. */
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits or hyphens"),
  /** Display name shown in the dashboard header. */
  name: z.string().min(1),
  sources: z.array(clientSourceSchema),
  brand: clientBrandSchema.optional(),
});

const clientsSchema = z.array(clientSchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  for (const c of list) {
    if (seen.has(c.slug)) {
      ctx.addIssue({ code: "custom", message: `duplicate slug "${c.slug}"` });
    }
    seen.add(c.slug);
  }
});

export type ClientBrand = z.infer<typeof clientBrandSchema>;
export type ClientSource = z.infer<typeof clientSourceSchema>;
export type Client = z.infer<typeof clientSchema>;

const clientDefs = [
  {
    slug: "acme",
    name: "Acme Corporation",
    brand: { primary: "#426fb6", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "000000001" } },
      { type: "search-console", config: { siteUrl: "https://acme.example/" } },
      { type: "google-ads", config: { customerId: "111-111-1111", currency: "USD" } },
      { type: "meta-ads", config: { adAccountId: "1234567890", currency: "USD" } },
      { type: "mailchimp", config: {} },
      { type: "twilio", config: {} },
    ],
  },
  {
    slug: "globex",
    name: "Globex",
    brand: { primary: "#0ca678", accent: "#f15e4d" },
    sources: [
      { type: "ga4", config: { propertyId: "000000002" } },
      { type: "search-console", config: { siteUrl: "https://globex.example/" } },
      { type: "linkedin-ads", config: { accountId: "503012345", currency: "EUR" } },
      { type: "plausible", config: { siteId: "globex.example" } },
      { type: "matomo", config: { siteId: 1 } },
    ],
  },
  {
    slug: "initech",
    name: "Initech",
    brand: { primary: "#333333", accent: "#98d7eb" },
    sources: [
      { type: "ga4", config: { propertyId: "000000003" } },
      { type: "google-ads", config: { customerId: "222-222-2222", currency: "GBP" } },
      { type: "bing-webmaster", config: { siteUrl: "https://initech.example/" } },
    ],
  },
  {
    slug: "northwind",
    name: "Northwind Traders",
    brand: { primary: "#d6336c", accent: "#f59f00" },
    sources: [
      { type: "ga4", config: { propertyId: "000000004" } },
      { type: "shopify", config: { shop: "northwind", currency: "USD" } },
      { type: "stripe", config: { currency: "USD" } },
      { type: "meta-ads", config: { adAccountId: "9876543210", currency: "USD" } },
      { type: "square", config: { currency: "USD" } },
      { type: "paypal", config: { currency: "USD" } },
      { type: "klaviyo", config: {} },
    ],
  },
  {
    // SaaS client — product, CRM, transactional email, payments.
    slug: "umbrella",
    name: "Umbrella Software",
    brand: { primary: "#7048e8", accent: "#12b886" },
    sources: [
      { type: "ga4", config: { propertyId: "000000005" } },
      { type: "posthog", config: { projectId: "12345" } },
      { type: "hubspot", config: {} },
      { type: "sendgrid", config: {} },
      { type: "stripe", config: { currency: "USD" } },
      { type: "zendesk", config: { subdomain: "umbrella", email: "ops@umbrella.example" } },
      { type: "github", config: { owner: "umbrella", repo: "platform" } },
      { type: "calendly", config: { organization: "https://api.calendly.com/organizations/AAAA" } },
      { type: "intercom", config: {} },
      { type: "typeform", config: { formId: "AbC123" } },
      { type: "cloudflare", config: { zoneTag: "0123456789abcdef0123456789abcdef" } },
      { type: "sentry", config: { organization: "umbrella" } },
      { type: "linear", config: {} },
    ],
  },
  {
    // Operations-heavy agency client.
    slug: "vandelay",
    name: "Vandelay Industries",
    brand: { primary: "#1864ab", accent: "#e8590c" },
    sources: [
      { type: "ga4", config: { propertyId: "000000007" } },
      { type: "airtable", config: { baseId: "appXXXXXXXXXXXXXX", tableName: "Leads" } },
      { type: "zoom", config: {} },
      { type: "activecampaign", config: {} },
      { type: "amplitude", config: {} },
    ],
  },
  {
    // Media/creator client — video + social advertising.
    slug: "hooli",
    name: "Hooli Media",
    brand: { primary: "#e8590c", accent: "#1c7ed6" },
    sources: [
      { type: "ga4", config: { propertyId: "000000006" } },
      { type: "youtube", config: { channelId: "UC_x5XG1OV2P6uZZ5FSM9Ttw" } },
      { type: "tiktok-ads", config: { advertiserId: "7000000000001", currency: "USD" } },
      { type: "meta-ads", config: { adAccountId: "5555555555", currency: "USD" } },
      { type: "pinterest-ads", config: { adAccountId: "549755813888", currency: "USD" } },
      { type: "snapchat-ads", config: { adAccountId: "22225555-6666-7777-8888-99990000aaaa", currency: "USD" } },
    ],
  },
];

/** Validated client registry (throws at import if an entry is malformed). */
export const clients: Client[] = clientsSchema.parse(clientDefs);

export function getClientBySlug(slug: string): Client | undefined {
  return clients.find((c) => c.slug === slug.toLowerCase());
}
