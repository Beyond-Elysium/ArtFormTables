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

const reportSchema = z.object({
  /** Email recipients for scheduled PDF reports. */
  recipients: z.array(z.string().email()).default([]),
  /** Include this client in the scheduled report cron. */
  enabled: z.boolean().default(false),
});

const clientSchema = z.object({
  /** URL slug, e.g. "acme" for sitename.com/acme. */
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits or hyphens"),
  /** Display name shown in the dashboard header. */
  name: z.string().min(1),
  sources: z.array(clientSourceSchema),
  brand: clientBrandSchema.optional(),
  /** Optional scheduled-report settings. */
  report: reportSchema.optional(),
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
export type ClientReport = z.infer<typeof reportSchema>;
export type Client = z.infer<typeof clientSchema>;

// NOTE: the per-source `config` values below (propertyId, siteUrl, account IDs)
// are placeholders. Replace each with the client's real value as you connect a
// source; until credentials + real config are present a source shows demo data.
const clientDefs = [
  {
    slug: "artform",
    name: "ArtForm Agency",
    brand: { primary: "#426fb6", accent: "#e41679" },
    report: { recipients: ["reports@artformagency.com"], enabled: false },
    sources: [
      { type: "ga4", config: { propertyId: "310586485" } },
      { type: "search-console", config: { siteUrl: "https://artformagency.com/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://artformagency.com/" } },
      { type: "google-ads", config: { customerId: "000-000-0000", currency: "USD" } },
      { type: "linkedin-ads", config: { accountId: "500000000", currency: "USD" } },
      { type: "mailchimp", config: {} },
    ],
  },
  {
    slug: "bbbnp",
    name: "BBB National Programs",
    brand: { primary: "#333333", accent: "#426fb6" },
    sources: [
      { type: "ga4", config: { propertyId: "302989852" } },
      // BBBNP CISR/IRI — separate GA4 property; candidate for its own view later.
      { type: "ga4", label: "BBBNP CISR/IRI", config: { propertyId: "499713205" } },
      { type: "search-console", config: { siteUrl: "https://bbbprograms.org/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://bbbprograms.org/" } },
      { type: "google-ads", config: { customerId: "000-000-0000", currency: "USD" } },
      { type: "mailchimp", config: {} },
    ],
  },
  {
    slug: "isea",
    name: "ISEA",
    brand: { primary: "#426fb6", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "333478304" } },
      { type: "search-console", config: { siteUrl: "https://safetyequipment.org/" } },
      { type: "linkedin-ads", config: { accountId: "500000001", currency: "USD" } },
      { type: "mailchimp", config: {} },
    ],
  },
  {
    slug: "maximus",
    name: "Maximus",
    brand: { primary: "#333333", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "302350399" } },
      { type: "search-console", config: { siteUrl: "https://maximus.com/" } },
      { type: "linkedin-ads", config: { accountId: "500000002", currency: "USD" } },
    ],
  },
  {
    slug: "miami-federal",
    name: "Miami Federal",
    brand: { primary: "#426fb6", accent: "#98d7eb" },
    sources: [
      { type: "ga4", config: { propertyId: "521857796" } },
      { type: "search-console", config: { siteUrl: "https://miamifederal.example/" } },
      { type: "google-ads", config: { customerId: "000-000-0000", currency: "USD" } },
    ],
  },
  {
    slug: "moveinterstate",
    name: "MoveInterstate",
    brand: { primary: "#426fb6", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "223367126" } },
      { type: "search-console", config: { siteUrl: "https://www.moveinterstate.com/" } },
      { type: "google-ads", config: { customerId: "000-000-0000", currency: "USD" } },
    ],
  },
  {
    slug: "sigma-defense",
    name: "Sigma Defense",
    brand: { primary: "#333333", accent: "#426fb6" },
    sources: [
      { type: "ga4", config: { propertyId: "298141839" } },
      { type: "search-console", config: { siteUrl: "https://sigmadefense.example/" } },
      { type: "linkedin-ads", config: { accountId: "500000003", currency: "USD" } },
    ],
  },
  {
    slug: "winterscale",
    name: "Winterscale",
    brand: { primary: "#333333", accent: "#98d7eb" },
    sources: [
      { type: "ga4", config: { propertyId: "398292533" } },
      { type: "search-console", config: { siteUrl: "https://winterscale.example/" } },
      { type: "linkedin-ads", config: { accountId: "500000005", currency: "USD" } },
    ],
  },
  {
    slug: "govcon-ideators",
    name: "GovCon IDEATORS",
    brand: { primary: "#333333", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "395344759" } },
      { type: "search-console", config: { siteUrl: "https://govconideators.example/" } },
      { type: "linkedin-ads", config: { accountId: "500000006", currency: "USD" } },
      { type: "hubspot", config: {} },
    ],
  },
];

/** Validated client registry (throws at import if an entry is malformed). */
export const clients: Client[] = clientsSchema.parse(clientDefs);

export function getClientBySlug(slug: string): Client | undefined {
  return clients.find((c) => c.slug === slug.toLowerCase());
}
