# Vantage database

Prisma schema for Vantage, ArtForm's GovCon market-intelligence product. See
`schema.prisma` for the models: `Opportunity`, `FitScoreConfig`, `Contact`,
`Alert`, `CompetitorActivity`.

Clerk owns user identity and there is no `workspaces` table in this pass, so
`workspaceId` throughout is a plain indexed string — not a foreign key.

## Setup

1. Provision a Postgres database (Supabase or Neon both work fine).
2. Copy `apps/vantage/.env.example` to `apps/vantage/.env` and set
   `DATABASE_URL` to that database's connection string.

## Migrations

Run from the repo root (pnpm workspace filter):

```bash
pnpm --filter @artform/vantage exec prisma migrate dev
```

This creates the initial migration from `schema.prisma`, applies it, and
regenerates the Prisma client. Re-run it any time the schema changes.

Other useful commands:

```bash
# Validate the schema without needing a live database
pnpm --filter @artform/vantage exec prisma validate

# Auto-format schema.prisma
pnpm --filter @artform/vantage exec prisma format

# Regenerate the client only (no migration)
pnpm --filter @artform/vantage exec prisma generate

# Open Prisma Studio against DATABASE_URL
pnpm --filter @artform/vantage exec prisma studio
```

## What a human still needs to do

- Provision a real Postgres database (Supabase or Neon) and set
  `DATABASE_URL` — nothing in this repo can create that for you.
- Run `prisma migrate dev` against it to create the tables (not run as part
  of this scaffolding — no live database is available in this environment).
- Insert a starting `FitScoreConfig` row per workspace (or let app code
  create one on first access) — the schema defaults each weight to an even
  0.2 split across the five factors.
