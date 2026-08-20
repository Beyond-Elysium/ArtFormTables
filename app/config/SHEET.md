# Editing the client registry in a Google Sheet

The registry now lives in **`clients.json`** (data) with **`clients.ts`** holding
only the schema. That split is what lets a non-developer edit which clients
exist and what feeds them — from a spreadsheet, an admin form, or by hand —
without touching TypeScript.

This doc covers the spreadsheet route: what the tabs are, how to set up the
dropdowns and colour-coding, and the rules that keep a bad edit from taking a
client dashboard down.

> **Status:** the sheet *layout* and the seed export exist today. The
> sheet → `clients.json` sync and the Publish button are not built yet — see
> [Not built yet](#not-built-yet).

## Seeding the sheet

```sh
node scripts/registry-to-sheet.mjs          # writes ./sheet-seed/*.tsv
```

Four TSVs, one per tab, exported from whatever is currently deployed. In
Google Sheets: **File → Import → Upload**, choose *Insert new sheet*, and
rename the tab to match the filename. Re-run any time you want to re-seed the
sheet from what's actually live.

## The tabs

### `Clients` — one row per dashboard

| Column | Meaning |
| --- | --- |
| `slug` | The URL. `maximus` → `/maximus`. **Changing this changes the client's link.** |
| `name` | Display name in the header |
| `brand_primary` / `brand_accent` | `#rrggbb`. Drives buttons, charts, badges |
| `logo` | Optional image URL; falls back to the name |
| `report_enabled` | `TRUE` puts the client in the weekly PDF cron |
| `report_recipients` | Comma-separated emails |
| `notes` | Internal only — never shown to a viewer |

### `Sources` — one row per data feed

This is the tab you'll spend time in. One row = one panel section on a
dashboard.

| Column | Meaning |
| --- | --- |
| `client_slug` | Which client this feeds — must match a `Clients` row |
| `source_id` | Stable id. Only needed if a `Views` row references it; otherwise the app assigns `<type>-<index>` |
| `type` | Which connector (dropdown) |
| `label` | Optional heading override, e.g. "Census — Web" |
| `account_or_url` | **The one that means different things per type** — see below |
| `page_path_prefix` | GA4 only: scope to a section, e.g. `/federal-government/fed-defense` |
| `page_title_contains` | GA4 only: scope by page title when the URL path isn't known |
| `campaign_filter` | Ads only: which campaigns to include |
| `geo_scope` | GA4 only: `world` / `us` / `none` — which map to draw |
| `strategy` | PageSpeed only: `mobile` / `desktop` |
| `hide_spend` | Ads only: `TRUE` hides spend figures entirely |
| `ai_insights` | GA4 only: `FALSE` suppresses the AI block on a secondary property |
| `currency` | Ads only, e.g. `USD` |
| `extra_json` | Escape hatch for any option without a column, e.g. `{"foo":"bar"}` |
| `notes` | Internal only |

**`account_or_url` by type** (also on the `Reference` tab):

| Type | What goes in the cell |
| --- | --- |
| `ga4` | GA4 property id, e.g. `302350399` |
| `search-console`, `bing-webmaster` | Site URL, e.g. `https://maximus.com/` |
| `google-ads` | Customer id, e.g. `111-111-1111` |
| `linkedin-ads`, `microsoft-ads` | Ad account id |
| `pagespeed` | The page URL to measure |
| `nocodb` | Table id |
| `hubspot` | Name of the env var holding that portal's token |

**`campaign_filter` by type:** Google Ads matches campaign **names**
(substring); Microsoft Ads matches campaign **names**; LinkedIn needs numeric
**campaign ids** from Campaign Manager, comma-separated — its API returns ids,
not names.

### `Views` — the named tabs

| Column | Meaning |
| --- | --- |
| `client_slug` | Which client |
| `view_name` | Tab label, e.g. `Census` |
| `group` | Optional. Views sharing a group collapse into one dropdown tab (Maximus's five verticals share `Programs`) |
| `source_ids` | Comma-separated `source_id`s this tab shows |
| `types` | Alternative to ids: include every source of these types |

### `Reference` — the dropdown lists

Every registered connector type, plus the option lists. Don't edit by hand;
re-run the seed script when connectors change.

## Making it readable (dropdowns + colour)

**Dropdowns** — *Data → Data validation → Dropdown (from a range)*:

| On | Range |
| --- | --- |
| `Sources!C:C` (type) | `Reference!A2:A` |
| `Sources!I:I` (geo_scope) | `Reference!C2:C4` |
| `Sources!J:J` (strategy) | `Reference!E2:E3` |
| `Sources!K:K`, `Sources!L:L`, `Clients!F:F` | `Reference!D2:D3` |

Set **"Reject input"** so a typo can't reach the config at all.

**Colour-coding** — *Format → Conditional formatting* on `Sources!A:O`, using
custom formulas so the whole row colours. This is what gives you the "blocks"
read as you scroll:

| Formula | Colour | Reads as |
| --- | --- | --- |
| `=$C1="ga4"` | light blue | Analytics |
| `=REGEXMATCH($C1,"search-console\|bing-webmaster\|pagespeed")` | light green | Search / SEO |
| `=REGEXMATCH($C1,"-ads$")` | light yellow | Advertising |
| `=REGEXMATCH($C1,"hubspot\|mailchimp\|nocodb")` | light grey | CRM / Ops |
| `=REGEXMATCH($O1,"^TODO")` | red text | Not live yet — needs a real id |

Then **View → Freeze → 1 row**, and sort by `client_slug` so each client reads
as a contiguous block.

## Rules that matter

1. **`slug` is the public URL.** Renaming one silently breaks every existing
   link to that dashboard. Treat it as permanent.
2. **A `Views` row must reference a real `source_id`.** A typo is caught at
   publish (the build fails) rather than rendering an empty tab — but that
   means a typo blocks the whole publish, so check it.
3. **Blank ≠ zero.** Leaving a cell empty means "this option isn't set", which
   is usually what you want. Don't fill columns that don't apply to the type.
4. **Placeholder ids stay on demo data.** An all-zero account id (`000-000-0000`)
   or a `5000000xx` LinkedIn id is deliberately treated as "not configured" —
   the dashboard shows sample numbers rather than erroring. The `notes` column
   flags every one of these.

## Not built yet

Phase 1 (this doc) is the layout and the seed export. Still to come:

- **`sheet-to-registry`** — a prebuild step that reads the sheet, validates it
  against the same zod schema, and writes `clients.json`. A bad sheet fails
  the build loudly and the live site keeps serving the last good config.
- **A Publish button** — Apps Script in the sheet hitting a Vercel deploy hook,
  so editing feels like: edit → Publish → live in ~90s.

Reading the sheet needs no new credentials: the `gsheets` connector already
reads Sheets with the shared Google auth (`spreadsheets.readonly`).
