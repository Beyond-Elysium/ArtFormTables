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
  /**
   * Optional stable id for this source instance. Without it a source gets a
   * positional id (`<type>-<index>` — see lib/connectors/index.ts), which
   * shifts when sources are reordered. Give a source an explicit id when
   * something needs to reference it durably (e.g. a custom view's `sourceIds`).
   */
  id: z.string().regex(/^[a-z0-9-]+$/, "source id must be lowercase letters, digits or hyphens").optional(),
  /** Optional override for the section heading. */
  label: z.string().optional(),
  /** Connector-specific configuration. */
  config: z.record(z.string(), z.unknown()).default({}),
});

/**
 * A custom named dashboard view: a tab (rendered after Overview, before the
 * auto category tabs) that shows only the sources it selects. Selects by
 * source id (`sourceIds`, matching an explicit source `id` or the positional
 * `<type>-<index>` fallback) and/or by connector type (`types`); a source
 * matching either selector is included.
 */
const clientViewSchema = z
  .object({
    /** Tab label, e.g. "CISR/IRI". */
    name: z.string().min(1),
    /** Source ids to include (explicit `id` or positional `<type>-<index>`). */
    sourceIds: z.array(z.string().min(1)).optional(),
    /** Connector types to include, e.g. ["ga4"]. */
    types: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => (v.sourceIds?.length ?? 0) > 0 || (v.types?.length ?? 0) > 0, {
    message: "a view needs at least one selector: sourceIds and/or types",
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
  /** Optional custom named views (extra tabs after Overview). */
  views: z.array(clientViewSchema).optional(),
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

    // Effective source ids: explicit `id` or the positional fallback the
    // orchestrator assigns (`<type>-<index>`). Views must reference real ones —
    // a typo should fail the build, not silently render an empty tab.
    const effectiveIds = c.sources.map((s, i) => s.id ?? `${s.type}-${i}`);
    const dupes = effectiveIds.filter((id, i) => effectiveIds.indexOf(id) !== i);
    for (const d of dupes) {
      ctx.addIssue({ code: "custom", message: `client "${c.slug}": duplicate source id "${d}"` });
    }
    const types = new Set(c.sources.map((s) => s.type));
    for (const v of c.views ?? []) {
      for (const id of v.sourceIds ?? []) {
        if (!effectiveIds.includes(id)) {
          ctx.addIssue({
            code: "custom",
            message: `client "${c.slug}": view "${v.name}" references unknown source id "${id}"`,
          });
        }
      }
      for (const t of v.types ?? []) {
        if (!types.has(t)) {
          ctx.addIssue({
            code: "custom",
            message: `client "${c.slug}": view "${v.name}" references unknown source type "${t}"`,
          });
        }
      }
    }
  }
});

export type ClientBrand = z.infer<typeof clientBrandSchema>;
export type ClientSource = z.infer<typeof clientSourceSchema>;
export type ClientView = z.infer<typeof clientViewSchema>;
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
    // The CISR/IRI GA4 property gets its own named tab via the explicit
    // source id + view below.
    views: [{ name: "CISR/IRI", sourceIds: ["ga4-cisr"] }],
    sources: [
      { type: "ga4", config: { propertyId: "302989852" } },
      // BBBNP CISR/IRI — separate GA4 property with its own "CISR/IRI" view.
      // aiInsights:false — the secondary property's section should not repeat
      // the full AI block (AI Score etc.) under the main property's.
      { type: "ga4", id: "ga4-cisr", label: "BBBNP CISR/IRI", config: { propertyId: "499713205", aiInsights: false } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://safetyequipment.org/" } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://maximus.com/" } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://miamifederal.example/" } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://www.moveinterstate.com/" } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://sigmadefense.example/" } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://winterscale.example/" } },
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
      { type: "bing-webmaster", config: { siteUrl: "https://govconideators.example/" } },
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
