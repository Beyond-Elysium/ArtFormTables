# Migrating the Manus dashboards into Maximus

Three Manus-built dashboards — `defense-dash`, `abmcensusview-artformdraft`,
`ccc-dash` — are being retired in favor of five BD/campaign-scoped views on
the existing `/maximus` client: **CCC, Census, Defense, National Security,
Federal Financial**. Per the source-of-truth inventories the client provided,
all five share Maximus's GA4 property, LinkedIn account (`511334398`), and
(once configured) Google Ads / Microsoft Advertising accounts — they're
different *slices* of the same underlying data, not different data sources.
This is a data/connector migration only: layout, copy, and chart types are
**not** carried over 1:1 (see `DashboardPlan.md` §2F / the platform's panel
model — timeseries/donut/bar/table only).

## What shipped

- **`pagePathPrefix` / `pageTitleContains` scoping on `ga4.ts`** — restricts
  every GA4 report (overview, timeseries, sources/devices/pages, conversions,
  AI insights) to rows whose `pagePath` begins with a prefix and/or whose
  `pageTitle` contains a substring, via a GA4 `dimensionFilter` (`BEGINS_WITH`
  / `CONTAINS`, `AND`-ed together and with the existing AI-source filter
  where both apply). `pageTitleContains` exists because the exact URL
  structure isn't always known up front (CCC's scope came as a page-title
  pattern, not a path) — one property now powers per-vertical views either
  way.
- **`campaignNameFilter` + `hideSpend` on `googleAds.ts`** — a GAQL
  `campaign.name LIKE '%…%'` clause (string or array, OR'd), applied to both
  the current and previous-period queries (the previous-period query was
  switched from `FROM customer` to `FROM campaign` so the filter applies to
  both windows identically — with no filter this still sums to the same
  account total as before).
- **`campaignIds` + `hideSpend` on `linkedinAds.ts`** — scopes aggregation to
  specific numeric campaign ids. This is **id-based, not name-based**: the
  LinkedIn `adAnalytics` response only carries campaign URNs, not names, so
  there's no name to filter on without an extra Campaign entity lookup (not
  implemented here — see Open items).
- **New connector: `microsoftAds.ts`** — Microsoft Advertising (Bing Ads)
  Reporting Service v13. OAuth refresh-token exchange, then the SOAP
  submit/poll/download report flow, a hand-rolled minimal ZIP reader (Node
  has no built-in PKZIP support), CSV parsing, and a `campaignFilter`
  (substring match on the parsed `CampaignName` column — Microsoft's API
  scopes by account, not by name, so this is applied client-side after the
  report downloads). Also surfaces the Search-vs-Audience split the CCC/BD
  inventories called out. See the file's header comment for the caveats:
  SOAP field names are written from documented shape and should be verified
  against the current WSDL, and report generation is async/slow — the
  connector caps its poll loop and falls back to mock rather than hanging a
  page load.
- **New connector: `nocodb.ts`** — open-source, self-hosted database for the
  BD/CRM tables (conferences, contacts, BD activities, persona metrics) that
  had no live source in the Manus app either (hand-entered via in-app forms).
  Modeled directly on `airtable.ts`.
- **`hideSpend`** is set on every new Google/LinkedIn/Microsoft Ads instance
  below per the BD inventory's explicit "no spend data is used or displayed"
  policy. Flip it off per-source if that's wrong for a given view.
- **Registry**: `config/clients.ts`'s `maximus` entry gained a `views` array
  (CCC / Census / Defense / National Security / Federal Financial) and ~27
  sources — the site-wide ones plus 4-5 scoped instances per vertical (GA4,
  Google Ads, LinkedIn Ads, Microsoft Ads) and 4 NocoDB sources for the BD
  tables. Every new source safely renders deterministic mock data today
  (`isPlaceholderId` guards on placeholder account/customer ids; no
  connector throws without a mock fallback) and switches to correctly-scoped
  live data the moment real credentials + ids land — no further code changes
  needed. Verified: `pnpm test` (221 passing), `tsc --noEmit`, `pnpm build`,
  and a runtime check of `/maximus` + `/api/debug/maximus` (27/27 sources
  report `status: "demo"`, no errors).

## Real filter values wired in (from the inventories provided)

| Vertical | GA4 scope | Google Ads campaign filter | Microsoft Ads campaign filter |
|---|---|---|---|
| Census | path: `/federal-government/civilian/census-support-services` | "Big Brand Innovation Search" | "Census" |
| Defense | path: `/federal-government/fed-defense` | ["Big Brand Innovation Search", "DoD"] | "DoD" |
| National Security | path: `/federal-government/civilian/national-security-services` | ["DHS/National Security Search Ads", "DHS Admin & Enforcement"] | ["DHS/National Security", "DHS Admin & Enforcement"] |
| Federal Financial | path: `/federal-government/civilian/federal-financial` | "Federal Financial/IRS Search Ads" | "Federal Financial/IRS" |
| CCC | title contains: "Omnichannel Contact Center" | *(not given)* | "CCC" *(guessed from export filenames; validate)* |

## Open items — human input needed

1. **CCC's ad-platform scope.** GA4 is now scoped by page title
   ("Omnichannel Contact Center" — no exact URL path was available, so
   `pageTitleContains` was used instead of `pagePathPrefix`; see below). The
   Google Ads and LinkedIn campaign names still weren't given — those two
   sources remain unscoped until provided.
2. **LinkedIn campaign ids**, for all five verticals. The inventories named
   campaigns ("Big Brand Innovation - Census", "DoD Innovation", "National
   Security – Innovation", "Federal Financial Innovation/Retargeting", …) but
   `campaignIds` needs the *numeric* id from Campaign Manager on account
   `511334398`. Until filled in, every LinkedIn vertical source shows the
   whole account (harmless, just not scoped yet).
3. **Google Ads customer id** for Maximus — still the registry's placeholder
   `000-000-0000`. Nothing Google-Ads-related on `/maximus` goes live until
   this is real.
4. **Microsoft Advertising credentials** — `MICROSOFT_ADS_*` env vars,
   `accountId` (currently the placeholder `000000000`), and confirmation of
   the exact `AdDistribution`/report field names against a real account. Per
   the earlier conversation, developer-token approval against an
   ad-spend-having account is the real blocker here, not code.
5. **NocoDB base** — doesn't exist yet. `nocodb-conferences` /
   `nocodb-contacts` / `nocodb-bd-activities` / `nocodb-persona-metrics` have
   placeholder `tableId`s pending the base being stood up and `NOCODB_API_TOKEN`
   / `NOCODB_BASE_URL` being set.
6. **Google Ads campaign-name confirmation** — the inventory itself flags
   "Big Brand Innovation Search" as broader than a purely Census-named
   campaign; confirm with the media team it's still the right Google proxy
   for Census before trusting the number.

## Deliberately not built in this pass

- **SAM.gov live integration** — the Manus app's `sam_opportunities` table
  has no live pull either (despite the name); left as a future connector,
  not attempted here.
- **Keyword-level Microsoft Ads reporting** (`Keyword_CCC.zip` detail) — a
  separate report type (`KeywordPerformanceReport`); only campaign-level
  performance + Search/Audience split shipped.
- **LinkedIn campaign-name resolution** — could be added (one more API call
  to the Campaigns entity endpoint, mapping id→name) to both improve the
  "Campaign {id}" breakdown labels and enable name-based filtering to match
  Google/Microsoft Ads. Not done here to keep the LinkedIn diff smaller and
  lower-risk; worth a follow-up once campaign ids are in hand anyway.
