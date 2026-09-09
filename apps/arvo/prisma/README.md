# Arvo database

Prisma schema for Arvo, ArtForm's GovCon campaign-benchmarking product. See
`schema.prisma` for the models: `Scenario`, `CampaignData`,
`BenchmarkRollup`, `ScoringWeightsConfig`.

Clerk owns user identity and there is no `workspaces` table in this pass, so
`userId`/`workspaceId` on `Scenario` and `CampaignData` are plain indexed
strings — not foreign keys.

## Setup

1. Provision a Postgres database (Supabase or Neon both work fine).
2. Copy `apps/arvo/.env.example` to `apps/arvo/.env` and set `DATABASE_URL`
   to that database's connection string.

## Migrations

Run from the repo root (pnpm workspace filter):

```bash
pnpm --filter @artform/arvo exec prisma migrate dev
```

This creates the initial migration from `schema.prisma`, applies it, and
regenerates the Prisma client. Re-run it any time the schema changes.

Other useful commands:

```bash
# Validate the schema without needing a live database
pnpm --filter @artform/arvo exec prisma validate

# Auto-format schema.prisma
pnpm --filter @artform/arvo exec prisma format

# Regenerate the client only (no migration)
pnpm --filter @artform/arvo exec prisma generate

# Open Prisma Studio against DATABASE_URL
pnpm --filter @artform/arvo exec prisma studio
```

## Seeding benchmarks

`scripts/seed-benchmarks.ts` reads a CSV of ArtForm's benchmark data and
upserts it into `BenchmarkRollup`, keyed on the natural key
`(platform, sector, objective, metric, period)` — safe to re-run whenever a
fresh export arrives.

```bash
pnpm --filter @artform/arvo exec tsx scripts/seed-benchmarks.ts path/to/benchmarks.csv
```

Omitting the path defaults to `./benchmarks.csv` in the current directory.

### Expected CSV columns

Snake_case headers, matching the DB columns:

| column        | example           | notes                                                    |
| ------------- | ----------------- | --------------------------------------------------------- |
| `platform`    | `linkedin-ads`    | free text                                                  |
| `sector`      | `dod`             | one of: `dod`, `ic`, `civilian`, `sled`, `higher_ed`       |
| `objective`   | `lead_generation` | one of: `awareness`, `consideration`, `lead_generation`, `recruitment` |
| `metric`      | `cpl`             | one of: `ctr`, `cpl`, `cpm`, `conversion_rate`             |
| `p25`         | `12.40`           | number                                                     |
| `p50`         | `18.75`           | number                                                     |
| `p75`         | `27.10`           | number                                                     |
| `sample_size` | `142`             | integer                                                    |
| `period`      | `Q2 2026`         | free text                                                  |

Example row:

```csv
platform,sector,objective,metric,p25,p50,p75,sample_size,period
linkedin-ads,dod,lead_generation,cpl,12.40,18.75,27.10,142,Q2 2026
```

Invalid rows (bad enum value, missing/non-numeric fields) are logged and
skipped rather than aborting the whole run; the script prints a summary of
rows read / upserted / skipped at the end.

## What a human still needs to do

- Provision a real Postgres database (Supabase or Neon) and set
  `DATABASE_URL` — nothing in this repo can create that for you.
- Run `prisma migrate dev` against it to create the tables (not run as part
  of this scaffolding — no live database is available in this environment).
- Get an actual benchmarks CSV export from ArtForm and run the seed script
  against it. `ScoringWeightsConfig` also has no seed step here — insert a
  starting row by hand (or via a follow-up seed script) with the default
  weights (0.30 / 0.30 / 0.20 / 0.20) before the scoring logic depends on it.
