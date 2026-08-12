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
      { type: "hubspot", config: { tokenEnv: "HUBSPOT_TOKEN_ARTFORM" } },
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
      { type: "hubspot", config: { tokenEnv: "HUBSPOT_TOKEN_BBBNP" } },
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
    // Five BD/campaign-scoped views, migrated off separate Manus dashboards
    // (defense-dash, abmcensusview, ccc-dash). All five share Maximus's GA4
    // property, LinkedIn account (511334398), and (once configured) Google
    // Ads / Microsoft Advertising accounts — scoped per view via each
    // connector's filter config (pagePathPrefix / campaignNameFilter /
    // campaignIds / campaignFilter). See app/MIGRATION-MAXIMUS.md.
    views: [
      { name: "CCC", sourceIds: ["ga4-ccc", "google-ads-ccc", "linkedin-ads-ccc", "microsoft-ads-ccc"] },
      { name: "Census", sourceIds: ["ga4-census", "google-ads-census", "linkedin-ads-census", "microsoft-ads-census"] },
      { name: "Defense", sourceIds: ["ga4-defense", "google-ads-defense", "linkedin-ads-defense", "microsoft-ads-defense"] },
      {
        name: "National Security",
        sourceIds: ["ga4-national-security", "google-ads-national-security", "linkedin-ads-national-security", "microsoft-ads-national-security"],
      },
      {
        name: "Federal Financial",
        sourceIds: ["ga4-federal-financial", "google-ads-federal-financial", "linkedin-ads-federal-financial", "microsoft-ads-federal-financial"],
      },
    ],
    sources: [
      // --- Site-wide (Overview tab) ---------------------------------------
      { type: "ga4", config: { propertyId: "302350399" } },
      { type: "search-console", config: { siteUrl: "https://maximus.com/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://maximus.com/" } },
      // Real LinkedIn sponsored-account id (was a placeholder) — shared by
      // every BD view below via campaignIds scoping.
      { type: "linkedin-ads", config: { accountId: "511334398", currency: "USD" } },
      // customerId is still a placeholder — needs Maximus's real Google Ads
      // customer id before this (or any google-ads-* view below) goes live.
      { type: "google-ads", config: { customerId: "000-000-0000", currency: "USD" } },
      { type: "hubspot", config: { tokenEnv: "HUBSPOT_TOKEN_MAXIMUS" } },

      // --- CCC (Contact Center Consolidation) -----------------------------
      // TODO: exact page-path scope + Google/Bing/LinkedIn campaign names
      // weren't given in the CCC inventory (only generic descriptions) — fill
      // these in once confirmed. "CCC" is a reasonable Bing filter guess
      // (it appears in the export filenames) but per the inventory itself
      // must be validated against the real campaign field before trusting it.
      { type: "ga4", id: "ga4-ccc", label: "CCC — Web", config: { propertyId: "302350399", aiInsights: false } },
      {
        type: "google-ads",
        id: "google-ads-ccc",
        label: "CCC — Google Ads",
        config: { customerId: "000-000-0000", currency: "USD", hideSpend: true },
      },
      {
        type: "linkedin-ads",
        id: "linkedin-ads-ccc",
        label: "CCC — LinkedIn",
        config: { accountId: "511334398", currency: "USD", campaignIds: [], hideSpend: true },
      },
      {
        type: "microsoft-ads",
        id: "microsoft-ads-ccc",
        label: "CCC — Microsoft Ads",
        config: { accountId: "000000000", currency: "USD", campaignFilter: "CCC", hideSpend: true },
      },

      // --- Census ----------------------------------------------------------
      {
        type: "ga4",
        id: "ga4-census",
        label: "Census — Web",
        config: { propertyId: "302350399", pagePathPrefix: "/federal-government/civilian/census-support-services", aiInsights: false },
      },
      {
        type: "google-ads",
        id: "google-ads-census",
        label: "Census — Google Ads",
        // Campaign is broader than purely Census-named — confirm with the
        // media team this remains the intended Google proxy for Census.
        config: { customerId: "000-000-0000", currency: "USD", campaignNameFilter: "Big Brand Innovation Search", hideSpend: true },
      },
      {
        type: "linkedin-ads",
        id: "linkedin-ads-census",
        label: "Census — LinkedIn",
        // Real campaign name is "Big Brand Innovation - Census"; campaignIds
        // needs the numeric id from Campaign Manager (analytics responses
        // only carry the URN, not the name).
        config: { accountId: "511334398", currency: "USD", campaignIds: [], hideSpend: true },
      },
      {
        type: "microsoft-ads",
        id: "microsoft-ads-census",
        label: "Census — Microsoft Ads",
        config: { accountId: "000000000", currency: "USD", campaignFilter: "Census", hideSpend: true },
      },

      // --- Defense -----------------------------------------------------------
      {
        type: "ga4",
        id: "ga4-defense",
        label: "Defense — Web",
        config: { propertyId: "302350399", pagePathPrefix: "/federal-government/fed-defense", aiInsights: false },
      },
      {
        type: "google-ads",
        id: "google-ads-defense",
        label: "Defense — Google Ads",
        config: { customerId: "000-000-0000", currency: "USD", campaignNameFilter: ["Big Brand Innovation Search", "DoD"], hideSpend: true },
      },
      {
        type: "linkedin-ads",
        id: "linkedin-ads-defense",
        label: "Defense — LinkedIn",
        // Real campaigns: DoD Innovation, Video, Sizzle Reels, Retargeting,
        // Defense-Big Brand — campaignIds needs their numeric ids.
        config: { accountId: "511334398", currency: "USD", campaignIds: [], hideSpend: true },
      },
      {
        type: "microsoft-ads",
        id: "microsoft-ads-defense",
        label: "Defense — Microsoft Ads",
        config: { accountId: "000000000", currency: "USD", campaignFilter: "DoD", hideSpend: true },
      },

      // --- National Security -------------------------------------------------
      {
        type: "ga4",
        id: "ga4-national-security",
        label: "National Security — Web",
        config: { propertyId: "302350399", pagePathPrefix: "/federal-government/civilian/national-security-services", aiInsights: false },
      },
      {
        type: "google-ads",
        id: "google-ads-national-security",
        label: "National Security — Google Ads",
        config: {
          customerId: "000-000-0000",
          currency: "USD",
          campaignNameFilter: ["DHS/National Security Search Ads", "DHS Admin & Enforcement"],
          hideSpend: true,
        },
      },
      {
        type: "linkedin-ads",
        id: "linkedin-ads-national-security",
        label: "National Security — LinkedIn",
        // Real campaign: "National Security – Innovation" — campaignIds
        // needs its numeric id.
        config: { accountId: "511334398", currency: "USD", campaignIds: [], hideSpend: true },
      },
      {
        type: "microsoft-ads",
        id: "microsoft-ads-national-security",
        label: "National Security — Microsoft Ads",
        config: {
          accountId: "000000000",
          currency: "USD",
          campaignFilter: ["DHS/National Security", "DHS Admin & Enforcement"],
          hideSpend: true,
        },
      },

      // --- Federal Financial ---------------------------------------------------
      {
        type: "ga4",
        id: "ga4-federal-financial",
        label: "Federal Financial — Web",
        config: { propertyId: "302350399", pagePathPrefix: "/federal-government/civilian/federal-financial", aiInsights: false },
      },
      {
        type: "google-ads",
        id: "google-ads-federal-financial",
        label: "Federal Financial — Google Ads",
        config: { customerId: "000-000-0000", currency: "USD", campaignNameFilter: "Federal Financial/IRS Search Ads", hideSpend: true },
      },
      {
        type: "linkedin-ads",
        id: "linkedin-ads-federal-financial",
        label: "Federal Financial — LinkedIn",
        // Real campaigns: Federal Financial Innovation, Federal Financial
        // Retargeting — campaignIds needs their numeric ids.
        config: { accountId: "511334398", currency: "USD", campaignIds: [], hideSpend: true },
      },
      {
        type: "microsoft-ads",
        id: "microsoft-ads-federal-financial",
        label: "Federal Financial — Microsoft Ads",
        config: { accountId: "000000000", currency: "USD", campaignFilter: "Federal Financial/IRS", hideSpend: true },
      },

      // --- BD operations (surfaced under the auto "Operations" tab; not
      // gated behind a vertical view — these aren't campaign-scoped) --------
      // TODO: tableId placeholders — fill in once the NocoDB base exists.
      { type: "nocodb", id: "nocodb-conferences", label: "Conferences", config: { tableId: "TODO_CONFERENCES_TABLE_ID" } },
      { type: "nocodb", id: "nocodb-contacts", label: "Key Contacts", config: { tableId: "TODO_CONTACTS_TABLE_ID" } },
      { type: "nocodb", id: "nocodb-bd-activities", label: "BD Activities", config: { tableId: "TODO_BD_ACTIVITIES_TABLE_ID" } },
      { type: "nocodb", id: "nocodb-persona-metrics", label: "Persona Metrics", config: { tableId: "TODO_PERSONA_METRICS_TABLE_ID" } },
    ],
  },
  {
    slug: "miami-federal",
    name: "Miami Federal",
    brand: { primary: "#426fb6", accent: "#98d7eb" },
    sources: [
      { type: "ga4", config: { propertyId: "521857796" } },
      { type: "search-console", config: { siteUrl: "https://miamifed.com/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://miamifed.com/" } },
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
      { type: "search-console", config: { siteUrl: "https://sigmadefense.com/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://sigmadefense.com/" } },
      { type: "linkedin-ads", config: { accountId: "500000003", currency: "USD" } },
    ],
  },
  {
    slug: "winterscale",
    name: "Winterscale",
    brand: { primary: "#333333", accent: "#98d7eb" },
    sources: [
      { type: "ga4", config: { propertyId: "398292533" } },
      { type: "search-console", config: { siteUrl: "https://winterscale.com/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://winterscale.com/" } },
      { type: "linkedin-ads", config: { accountId: "500000005", currency: "USD" } },
    ],
  },
  {
    slug: "govcon-ideators",
    name: "GovCon IDEATORS",
    brand: { primary: "#333333", accent: "#e41679" },
    sources: [
      { type: "ga4", config: { propertyId: "395344759" } },
      { type: "search-console", config: { siteUrl: "https://govconideators.com/" } },
      { type: "bing-webmaster", config: { siteUrl: "https://govconideators.com/" } },
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
