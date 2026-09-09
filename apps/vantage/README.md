# Vantage

GovCon market opportunity intelligence SaaS. "See what's coming before the
RFP drops."

Vantage tracks federal market opportunities (via SAM.gov and USASpending),
scores them for fit, surfaces the key contacts and competitors around each
one, and rolls it all up into alerts and a monthly market brief — so a GovCon
BD team sees a solicitation coming before it's even posted.

Built on Next.js 14 (App Router) + TypeScript, [Clerk](https://clerk.com) for
auth, Prisma + Postgres for storage, and the ArtForm-branded
[`@tabler/core`](../../core) design system via the shared
[`@artform/suite-ui`](../../packages/suite-ui) package — no Tailwind/shadcn
here, same as the rest of this monorepo's products.

## Status

| Piece | State |
| --- | --- |
| App shell, nav, route stubs | Done |
| Auth (Clerk) | Wired |
| Database (Prisma schema) | Done — Opportunity/Contact/Alert/CompetitorActivity/FitScoreConfig, `lib/db.ts` |
| SAM.gov / USASpending sync engine | Done — `lib/sync/`, 26 unit tests against real-API fixtures, wired to a real Prisma-backed `SyncDbClient` (`lib/sync/db.ts`), `/api/cron/sync` |
| Opportunity Feed / Contacts / Alerts / Market Brief pages | Static placeholders — not yet querying the database (next piece of work, same shape as Arvo's scenario wizard) |
| Per-workspace settings (tracked agencies/NAICS) | Not started — `/api/cron/sync`'s `getWorkspaceConfigs()` returns `[]` until this exists, so the sync has nothing to iterate yet even though it's fully wired |
| HubSpot connection | TODO — not yet scoped |
| Billing (Stripe tiers/checkout) | TODO — not yet scoped, env vars reserved |

Everything marked "Done" type-checks (`pnpm --filter @artform/vantage typecheck`),
passes its tests (`pnpm --filter @artform/vantage test`), and a real
`next build` with dummy-but-valid credentials. The sync engine has not made a
live call to sam.gov or usaspending.gov (no API key, no live DB in this
environment) — correctness is verified against hand-built fixtures matching
each API's documented response shape; see `lib/sync/README.md`.

## Routes

| Route | Page |
| --- | --- |
| `/` | Dashboard |
| `/opportunities` | Opportunity Feed |
| `/opportunities/[id]` | Opportunity Detail |
| `/contacts` | Contact Intelligence |
| `/competitors` | Competitive Landscape |
| `/alerts` | Alert Center |
| `/market-brief` | Market Brief |
| `/settings` | Settings (alert preferences, tracked agencies/NAICS, HubSpot, plans) |
| `/sign-in`, `/sign-up` | Clerk auth |

## Pricing tiers

| Tier | Price | Includes |
| --- | --- | --- |
| Tier 1 — Intelligence | $499/mo | Opportunity feed, contact intelligence, alerts |
| Tier 2 — + Outreach Playbook | $1,499/mo | Everything in Tier 1, plus competitive landscape and market brief |
| Tier 3 — Full Program | $4,999/mo | Everything in Tier 2, plus Orbit |

## Getting it running

From the repo root:

```sh
pnpm install
cp apps/vantage/.env.example apps/vantage/.env.local   # then fill in the keys below
pnpm --filter @artform/vantage dev
```

The dev server runs on **http://localhost:3200** (Arvo runs on 3100, so both
can run at once).

### What you need, and where to get it

Everything below goes in `apps/vantage/.env.local` (copy `.env.example` as a
starting point — it has the exact variable names).

| Variable | Required to... | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | See the app at all — every route except `/sign-in`/`/sign-up` requires a logged-in user | Create a project at [dashboard.clerk.com](https://dashboard.clerk.com) → **API Keys** page. Use a *test* instance key while developing. |
| `CLERK_SECRET_KEY` | Same as above (server-side) | Same Clerk **API Keys** page, right next to the publishable key. Never expose this one client-side or commit it. |
| `NEXT_PUBLIC_APP_URL` | Build correct redirect URLs | Already defaults to `http://localhost:3200` in `.env.example` — only change it for a deployed environment. |
| `DATABASE_URL` | Persist opportunities, contacts, and alerts | A Postgres connection string — same setup as Arvo's. Easiest: a free project at [supabase.com](https://supabase.com) → **Project Settings → Database → Connection string** (pooled, port 6543, `?pgbouncer=true`). [Neon](https://neon.tech) works the same way. |
| `SAM_GOV_API_KEY` | Sync opportunities from SAM.gov | Free key at [sam.gov/data-services](https://sam.gov/data-services). Rate-limited to 1,000 requests/day — see `lib/sync/README.md`. |
| `CRON_SECRET` | Authorize `GET /api/cron/sync` (and Vercel Cron) | Any random string you generate yourself — set the same value in your Vercel Cron config's headers. |
| `HUBSPOT_ACCESS_TOKEN` | Sync contacts/opportunities into HubSpot | TODO — not yet scoped. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing | TODO — not yet scoped. |
| `STRIPE_PRICE_ID_TIER1` / `_TIER2` / `_TIER3` | Know which Stripe Price to check out for each tier | Reserved names only for now — create the products in [dashboard.stripe.com](https://dashboard.stripe.com) once billing work starts, matching `lib/pricing.ts` ($499 / $1,499 / $4,999). |

Note: USASpending needs no API key — it's a public, unauthenticated endpoint.

**Minimum to run the app and click through every page right now:** just the
two Clerk keys. `DATABASE_URL` is required the moment the Opportunity Feed /
Contacts / Alerts pages are wired to real data (next piece of work) — right
now they're static placeholders regardless of whether a database is
configured.

### Running typecheck / tests / build

```sh
pnpm --filter @artform/vantage typecheck
pnpm --filter @artform/vantage test
pnpm --filter @artform/vantage build
```

### Applying the database schema

```sh
pnpm --filter @artform/vantage db:migrate
```

See `prisma/README.md` for details.
