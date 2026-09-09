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
 *
 * **Shape lives here; the data lives in `clients.json`.** This file stays the
 * single authority on what a valid entry *is*, while the data is editable
 * without touching TypeScript — with editor autocomplete, hover help and
 * inline validation via the generated `clients.schema.json` (see
 * `EDITING.md`). Nothing downstream changes: `clients` and `getClientBySlug`
 * are still the whole public surface, still validated at import, so a
 * malformed entry still fails the build loudly — see `formatIssues` below for
 * what that failure reads like.
 */

import { z } from "zod";
import clientDefs from "./clients.json";

// The registry is validated by zod at import: a malformed entry (bad slug, bad
// hex colour, missing fields) fails the build loudly rather than rendering
// something broken at request time. Types are inferred from the schemas.

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex colour");

const clientBrandSchema = z.object({
  /** Primary action colour. Defaults to ArtForm Brand Blue. */
  primary: hexColor.optional().describe("Primary action colour (#rrggbb). Buttons, links, active tabs. Defaults to ArtForm blue."),
  /** Accent colour (charts, highlights). Defaults to ArtForm Brand Pink. */
  accent: hexColor.optional().describe("Accent colour (#rrggbb). Charts and highlights. Defaults to ArtForm pink."),
  /** Optional logo URL shown in the navbar; falls back to the client name. */
  logo: z.string().url().optional().describe("Logo image URL shown in the navbar. Falls back to the client name."),
});

const clientSourceSchema = z.object({
  /** Connector type, e.g. "ga4" | "search-console" | "google-ads". */
  type: z.string().min(1).describe("Which connector feeds this section, e.g. \"ga4\", \"search-console\", \"linkedin-ads\"."),
  /**
   * Optional stable id for this source instance. Without it a source gets a
   * positional id (`<type>-<index>` — see lib/connectors/index.ts), which
   * shifts when sources are reordered. Give a source an explicit id when
   * something needs to reference it durably (e.g. a custom view's `sourceIds`).
   */
  id: z.string().regex(/^[a-z0-9-]+$/, "source id must be lowercase letters, digits or hyphens").optional(),
  /** Optional override for the section heading. */
  label: z.string().optional().describe("Overrides the section heading, e.g. \"Census — Web\"."),
  /** Connector-specific configuration. */
  config: z.record(z.string(), z.unknown()).default({}).describe("Connector-specific settings. GA4: propertyId, pagePathPrefix, pageTitleContains, geoScope, aiInsights. Search Console/Bing: siteUrl. Google Ads: customerId, campaignNameFilter, hideSpend. LinkedIn: accountId, campaignIds, hideSpend. Microsoft Ads: accountId, campaignFilter, hideSpend. PageSpeed: url, strategy. NocoDB: tableId. HubSpot: tokenEnv."),
  /**
   * Internal working note — never rendered to a viewer. Holds the things that
   * used to live in code comments and would otherwise be lost moving the data
   * to JSON: what's still a placeholder, what's blocked on a credential, why a
   * filter is set the way it is. Sits right next to the field it's about, so
   * whoever fills in a real account id sees why it was a placeholder.
   */
  notes: z.string().optional(),
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
    name: z.string().min(1).describe("Tab label, e.g. \"Census\"."),
    /** Source ids to include (explicit `id` or positional `<type>-<index>`). */
    sourceIds: z.array(z.string().min(1)).optional().describe("Source ids this tab shows. Must match a source's id, or its positional <type>-<index> fallback."),
    /** Connector types to include, e.g. ["ga4"]. */
    types: z.array(z.string().min(1)).optional().describe("Include every source of these connector types, e.g. [\"ga4\"]."),
    /**
     * Optional group label, e.g. "Programs". Views sharing a group render as
     * one dropdown tab (the group name) instead of N separate top-level
     * tabs — for a client with several similarly-shaped dashboards (BD
     * verticals, regions, brands…) where a flat tab row would get crowded.
     * Ungrouped views render as their own top-level tab, as before.
     */
    group: z.string().min(1).optional().describe("Views sharing a group collapse into one dropdown tab, e.g. \"Programs\"."),
  })
  .refine((v) => (v.sourceIds?.length ?? 0) > 0 || (v.types?.length ?? 0) > 0, {
    message: "a view needs at least one selector: sourceIds and/or types",
  });

const reportSchema = z.object({
  /** Email recipients for scheduled PDF reports. */
  recipients: z.array(z.string().email()).default([]).describe("Who receives the weekly PDF report."),
  /** Include this client in the scheduled report cron. */
  enabled: z.boolean().default(false).describe("Include this client in the scheduled report cron."),
});

const clientSchema = z.object({
  /** URL slug, e.g. "acme" for sitename.com/acme. */
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits or hyphens").describe("URL for this dashboard: \"maximus\" serves /maximus. Changing it breaks existing links."),
  /** Display name shown in the dashboard header. */
  name: z.string().min(1).describe("Display name in the dashboard header."),
  sources: z.array(clientSourceSchema),
  brand: clientBrandSchema.optional(),
  /** Optional custom named views (extra tabs after Overview). */
  views: z.array(clientViewSchema).optional(),
  /** Optional scheduled-report settings. */
  report: reportSchema.optional(),
  /** Internal working note — never rendered to a viewer. See `notes` on a source. */
  notes: z.string().optional(),
});

export const clientsSchema = z.array(clientSchema).superRefine((list, ctx) => {
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

/**
 * Turn a zod failure into something you can act on.
 *
 * The raw error is a wall of nested JSON that buries the one line that's
 * actually wrong. Since this throws during `next build`, in tests and in
 * `next dev`, a readable message here is what everyone editing the registry
 * sees when they get it wrong — no separate lint command to remember.
 *
 * Paths are rewritten from zod's `0.sources.3.type` into
 * `clients[0] (maximus) → sources[3] → type`, so the message names the
 * client rather than making you count array entries.
 */
function formatIssues(issues: z.core.$ZodIssue[], defs: unknown): string {
  const list = Array.isArray(defs) ? (defs as { slug?: string }[]) : [];
  const lines = issues.map((issue) => {
    const parts: string[] = [];
    for (const [i, key] of issue.path.entries()) {
      if (i === 0 && typeof key === "number") {
        const slug = list[key]?.slug;
        parts.push(`clients[${key}]${slug ? ` (${slug})` : ""}`);
      } else if (typeof key === "number") {
        parts.push(`[${key}]`);
      } else {
        parts.push(String(key));
      }
    }
    const where = parts.length ? parts.join(" → ").replace(/ → \[/g, "[") : "(root)";
    return `  • ${where}: ${issue.message}`;
  });
  return [
    `config/clients.json is invalid (${issues.length} problem${issues.length === 1 ? "" : "s"}):`,
    ...lines,
    "",
    "  Editing in VS Code shows these inline — clients.schema.json is wired up",
    "  in .vscode/settings.json. Run `pnpm schema` if you changed clients.ts.",
  ].join("\n");
}

/** Validated client registry (throws at import if an entry is malformed). */
export const clients: Client[] = (() => {
  const result = clientsSchema.safeParse(clientDefs);
  if (result.success) return result.data;
  throw new Error(formatIssues(result.error.issues, clientDefs));
})();

export function getClientBySlug(slug: string): Client | undefined {
  return clients.find((c) => c.slug === slug.toLowerCase());
}
