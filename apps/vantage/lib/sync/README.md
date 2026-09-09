# Vantage government-data sync

Two API clients plus an orchestrator that together power Vantage's daily
GovCon opportunity/competitor feed.

## `sam-gov.ts`

Client for the [SAM.gov Opportunities API v2](https://open.gsa.gov/api/get-opportunities-public-api/)
(`GET https://api.sam.gov/opportunities/v2/search`).

- `fetchSamOpportunities({ apiKey, naicsCodes, postedFrom, postedTo })` — the
  API accepts exactly one NAICS code (`ncode`) per request, so this makes one
  paginated call per code in `naicsCodes` and de-dupes the combined results by
  `noticeId` (a notice can legitimately carry more than one NAICS code).
  Pagination pages by `offset` in steps of 1000 (`limit`'s documented max)
  until a page comes back short.
- `mapSamOpportunityToRow(raw, workspaceId)` — maps a raw notice onto the
  internal `OpportunityCreateInput` shape. `SAM_TYPE_TO_SOLICITATION_TYPE` is
  the explicit table for SAM.gov's free-text `type` field
  ("Solicitation" / "Sources Sought" / "Presolicitation" / "Award Notice" / …)
  → our schema's enum-style values, with an `"OTHER"` fallback for anything
  not yet seen.
- Throws `SamGovApiError` on 401 (bad key) and 429 (rate limited, with a
  `retryAfterSeconds` hint parsed from the `Retry-After` header when present).

### SAM.gov rate-limit reality

The free API tier is capped at **1,000 requests/day**. Each `naicsCode`
consumes at least one request per sync run (more if a NAICS code has enough
active notices to paginate). Concretely, at a 1-page-per-NAICS-code steady
state that's ~40 NAICS codes syncable once an hour, or a few hundred codes
once a day — plan workspace NAICS-code lists and cron frequency around that
budget rather than assuming headroom. A paid SAM.gov Extract or a data.gov
key does not raise this limit; only an approved production API key increase
request does.

## `usaspending.ts`

Client for the public (no API key)
[USASpending.gov `spending_by_award` endpoint](https://api.usaspending.gov/docs/endpoints)
(`POST https://api.usaspending.gov/api/v2/search/spending_by_award/`).

- `fetchRecentAwards({ agency, naicsCode?, awardedFrom, awardedTo })` — builds
  the documented request body (`filters.time_period`, `filters.agencies`,
  optional `filters.naics_codes`, `fields`, `limit`, `page`) and paginates on
  `page_metadata.hasNext` until it's `false` or a short page is returned.
  Also sets `filters.award_type_codes: ["A","B","C","D"]` (procurement
  contracts) — **this isn't in every example payload in the docs, but the
  live endpoint 422s without it.**
- `mapAwardToCompetitorActivity(raw, workspaceId)` — maps a result row (whose
  keys are literally the field labels you requested, e.g. `"Award ID"`, not
  camelCase) onto the internal `CompetitorActivityCreateInput` shape.

Note the two APIs use different date formats: SAM.gov wants `MM/dd/yyyy`,
USASpending wants ISO `YYYY-MM-DD`.

## `index.ts`

`runDailySync(workspaceConfigs, { db?, samApiKey?, now?, lookbackDays? })`
orchestrates both clients per workspace, upserts opportunities (diffing
against the existing `samOpportunityId` row to distinguish genuinely new
notices from amendments — a `proposalDueDate` change on an existing notice),
records competitor awards, and returns
`{ newOpportunities, amendments, competitorAwards }` for the cron route to
turn into Alert rows.

It takes a `db: SyncDbClient` parameter rather than importing a concrete
Prisma client, so it runs (and is unit-tested) independent of whether
`apps/vantage/prisma/schema.prisma` and its generated client exist yet in a
given worktree. Omit `db` and it logs a `TODO(db)` stub instead of writing.

## Docs

- SAM.gov Opportunities API: https://open.gsa.gov/api/get-opportunities-public-api/
- USASpending API: https://api.usaspending.gov/docs/endpoints
