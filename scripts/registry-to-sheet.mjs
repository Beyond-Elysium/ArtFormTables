#!/usr/bin/env node
/**
 * Seed the registry Google Sheet from the committed registry.
 *
 *   node scripts/registry-to-sheet.mjs [outDir]      (default: ./sheet-seed)
 *
 * Emits one TSV per sheet tab, ready to File → Import into Google Sheets.
 * This is the *code → sheet* direction, used once to populate the sheet (and
 * again any time you want to re-seed it from what's actually deployed). The
 * everyday direction is the reverse — sheet → clients.json at build time.
 *
 * Why a flat-ish shape: the registry is nested (a client has many sources,
 * each with type-specific config), which a single grid can't express. So it
 * splits across tabs the way you'd model it relationally — Clients, Sources
 * (linked by client_slug), Views — and folds the 17 different config keys
 * into columns grouped by what they *mean* rather than one column per key:
 *
 *   account_or_url   → propertyId | siteUrl | accountId | customerId | url |
 *                      tableId | tokenEnv   (whichever the type uses)
 *   campaign_filter  → campaignNameFilter | campaignIds | campaignFilter
 *
 * `extra_json` is the escape hatch for anything not given a column, so a new
 * connector option never requires reshaping the sheet.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..", "app");
const outDir = resolve(process.argv[2] ?? join(here, "..", "sheet-seed"));

/** Which config key the "account_or_url" column maps to, per connector type. */
const ACCOUNT_KEY = {
  ga4: "propertyId",
  "search-console": "siteUrl",
  "bing-webmaster": "siteUrl",
  "google-ads": "customerId",
  "linkedin-ads": "accountId",
  "microsoft-ads": "accountId",
  pagespeed: "url",
  nocodb: "tableId",
  hubspot: "tokenEnv",
};

/** Which config key the "campaign_filter" column maps to, per connector type. */
const CAMPAIGN_KEY = {
  "google-ads": "campaignNameFilter",
  "linkedin-ads": "campaignIds",
  "microsoft-ads": "campaignFilter",
};

/** Keys that get their own column; everything else lands in extra_json. */
const COLUMN_KEYS = new Set([
  "pagePathPrefix",
  "pageTitleContains",
  "geoScope",
  "strategy",
  "hideSpend",
  "aiInsights",
  "currency",
]);

/** Every registered connector type, for the sheet's dropdown list. */
function connectorTypes() {
  const dir = join(appDir, "lib", "connectors");
  const types = new Set();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file === "TEMPLATE.ts") continue;
    const src = readFileSync(join(dir, file), "utf8");
    // The `type: "..."` on the exported Connector object.
    const m = src.match(/^\s{2}type:\s*"([a-z0-9-]+)"/m);
    if (m) types.add(m[1]);
  }
  return [...types].sort();
}

/** TSV-safe: tabs and newlines would break the grid. */
function cell(v) {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join(", ") : String(v);
  return s.replace(/[\t\r\n]+/g, " ").trim();
}

function tsv(headers, rows) {
  return [headers.join("\t"), ...rows.map((r) => r.map(cell).join("\t"))].join("\n") + "\n";
}

const clients = JSON.parse(readFileSync(join(appDir, "config", "clients.json"), "utf8"));

/* ------------------------------- Clients ------------------------------- */
const clientRows = clients.map((c) => [
  c.slug,
  c.name,
  c.brand?.primary,
  c.brand?.accent,
  c.brand?.logo,
  c.report ? String(c.report.enabled) : "",
  c.report?.recipients,
  c.notes,
]);

/* ------------------------------- Sources ------------------------------- */
const sourceRows = [];
for (const c of clients) {
  for (const [i, s] of c.sources.entries()) {
    const cfg = { ...(s.config ?? {}) };
    const take = (key) => {
      if (key == null) return undefined;
      const v = cfg[key];
      delete cfg[key];
      return v;
    };
    const account = take(ACCOUNT_KEY[s.type]);
    const campaign = take(CAMPAIGN_KEY[s.type]);
    const col = {};
    for (const k of COLUMN_KEYS) col[k] = take(k);
    // Whatever has no column keeps working via the escape hatch.
    const extra = Object.keys(cfg).length ? JSON.stringify(cfg) : "";

    sourceRows.push([
      c.slug,
      // Blank means "let the orchestrator assign <type>-<index>" — show what
      // that resolves to so a Views tab reference is never a guess.
      s.id ?? `${s.type}-${i}`,
      s.type,
      s.label,
      account,
      col.pagePathPrefix,
      col.pageTitleContains,
      campaign,
      col.geoScope,
      col.strategy,
      col.hideSpend == null ? "" : String(col.hideSpend),
      col.aiInsights == null ? "" : String(col.aiInsights),
      col.currency,
      extra,
      s.notes,
    ]);
  }
}

/* -------------------------------- Views -------------------------------- */
const viewRows = [];
for (const c of clients) {
  for (const v of c.views ?? []) {
    viewRows.push([c.slug, v.name, v.group, v.sourceIds, v.types]);
  }
}

/* ------------------------------ Reference ------------------------------ */
const types = connectorTypes();
const refRows = types.map((t, i) => [
  t,
  ACCOUNT_KEY[t] ?? "",
  // Small parallel lists the sheet's other dropdowns point at.
  ["world", "us", "none"][i] ?? "",
  ["TRUE", "FALSE"][i] ?? "",
  ["mobile", "desktop"][i] ?? "",
]);

mkdirSync(outDir, { recursive: true });
const files = {
  "Clients.tsv": tsv(
    ["slug", "name", "brand_primary", "brand_accent", "logo", "report_enabled", "report_recipients", "notes"],
    clientRows,
  ),
  "Sources.tsv": tsv(
    [
      "client_slug",
      "source_id",
      "type",
      "label",
      "account_or_url",
      "page_path_prefix",
      "page_title_contains",
      "campaign_filter",
      "geo_scope",
      "strategy",
      "hide_spend",
      "ai_insights",
      "currency",
      "extra_json",
      "notes",
    ],
    sourceRows,
  ),
  "Views.tsv": tsv(["client_slug", "view_name", "group", "source_ids", "types"], viewRows),
  "Reference.tsv": tsv(
    ["connector_type", "account_column_means", "geo_scope_options", "boolean_options", "strategy_options"],
    refRows,
  ),
};
for (const [name, body] of Object.entries(files)) writeFileSync(join(outDir, name), body);

console.log(`Wrote ${Object.keys(files).length} TSVs to ${outDir}`);
console.log(`  Clients   ${clientRows.length} rows`);
console.log(`  Sources   ${sourceRows.length} rows`);
console.log(`  Views     ${viewRows.length} rows`);
console.log(`  Reference ${types.length} connector types`);
