# Arvo

GovCon campaign-benchmarking SaaS. "Know if your campaigns are winning before
the results come in."

Arvo lets GovCon marketers model a planned campaign (objective, audience,
budget & flight) and see how it's likely to perform, benchmarked against
comparable government-contracting campaigns, before it launches.

Built on Next.js 14 (App Router) + TypeScript, [Clerk](https://clerk.com) for
auth, [Prisma](https://prisma.io) + Postgres for storage, [Stripe](https://stripe.com)
for billing, and the ArtForm-branded [`@tabler/core`](../../core) design
system via the shared [`@artform/suite-ui`](../../packages/suite-ui) package
— no Tailwind/shadcn here, same as the rest of this monorepo's products.

## Status

| Piece | State |
| --- | --- |
| App shell, nav, route stubs | Done |
| Auth (Clerk) | Wired |
| Database (Prisma schema + seed script) | Wired, no live DB yet |
| Billing (Stripe tiers/checkout/webhook) | Wired, no live Stripe account yet |
| Scoring engines (Platform Score, Influence Score, budget allocation, benchmark comparison) | Done — pure functions, 28 unit tests, `lib/scoring/` |
| CSV import → database | Done — real parsing, validation, bulk insert, live Campaign Data table |
| PDF report export | Done — `/api/report/[id]`, not yet runtime-tested against real Chromium |
| Scenario wizard + saved/compare/archive (CRUD) | Done — 4-step wizard, list with search/filter/archive, side-by-side compare, Flight Performance Tracker |

Everything marked "Done" type-checks (`pnpm --filter @artform/arvo typecheck`),
passes its tests (`pnpm --filter @artform/arvo test`), and a real `next build`
with dummy-but-valid credentials.

**Known heuristic gap:** scoring a scenario needs an "audience fit" and an
"objective alignment" input per platform that the wizard doesn't collect yet
(the spec doesn't define where those numbers come from either). `lib/platforms.ts`
and `lib/scenario-engine.ts` fill them with a documented flat default for now
— search those two files for `TODO` before trusting a scenario's Platform
Score or Influence Score as real signal rather than a placeholder.

## Routes

| Route | Page |
| --- | --- |
| `/` | Dashboard |
| `/scenarios` | Saved Scenarios |
| `/scenarios/new` | New Scenario (4-step wizard) |
| `/scenarios/[id]` | Scenario Results |
| `/campaign-data` | Campaign Data |
| `/import` | Import Data |
| `/integrations` | Integrations |
| `/settings` | Settings (plans) |
| `/sign-in`, `/sign-up` | Clerk auth |

## Getting it running

From the repo root:

```sh
pnpm install
cp apps/arvo/.env.example apps/arvo/.env.local   # then fill in the keys below
pnpm --filter @artform/arvo dev
```

The dev server runs on **http://localhost:3100**.

### What you need, and where to get it

Everything below goes in `apps/arvo/.env.local` (copy `.env.example` as a
starting point — it has the exact variable names).

| Variable | Required to... | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | See the app at all — every route except `/sign-in`/`/sign-up` requires a logged-in user | Create a project at [dashboard.clerk.com](https://dashboard.clerk.com) → **API Keys** page. Use a *test* instance key while developing. |
| `CLERK_SECRET_KEY` | Same as above (server-side) | Same Clerk **API Keys** page, right next to the publishable key. Never expose this one client-side or commit it. |
| `DATABASE_URL` | Persist scenarios, campaign data, and benchmarks — without it, every DB-backed page will 500 once that work lands | A Postgres connection string. Easiest: create a free project at [supabase.com](https://supabase.com) → **Project Settings → Database → Connection string** (use the *pooled* connection, port 6543, and append `?pgbouncer=true`). [Neon](https://neon.tech) works the same way. |
| `STRIPE_SECRET_KEY` | Create checkout sessions / verify webhooks — without it, upgrading a plan won't work, but the rest of the app runs fine | [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API keys**. Use a *test mode* key while developing. |
| `STRIPE_WEBHOOK_SECRET` | Let Stripe tell Arvo when a subscription changes | Only exists once you register a webhook endpoint — see below. |
| `STRIPE_PRICE_ID_PRACTITIONER` / `_TEAM` / `_AGENCY` | Know which Stripe Price to check out for each tier | [dashboard.stripe.com](https://dashboard.stripe.com) → **Product catalog** → create 3 recurring monthly products ($299 / $599 / $1,499, matching `lib/billing/tiers.ts`) → copy each one's Price ID (starts `price_...`). |
| `NEXT_PUBLIC_APP_URL` | Build correct redirect URLs after checkout | Already defaults to `http://localhost:3100` in `.env.example` — only change it for a deployed environment. |
| `CHROMIUM_EXECUTABLE_PATH` | Render PDF reports (`/api/report/[id]`) when running locally | Optional. Point it at a local Chromium/Chrome binary path. Leave unset on Vercel — it falls back automatically to the bundled `@sparticuz/chromium`. |

**Minimum to run the app and click through every page:** just the two Clerk
keys. `DATABASE_URL` is required the moment you touch Campaign Data or
Import (both are now real, DB-backed pages) or PDF export. Stripe helpers
no-op with a logged warning when unset, so billing can stay unconfigured
until you're ready to test checkout.

**To test Stripe webhooks locally**, install the [Stripe CLI](https://stripe.com/docs/stripe-cli)
and run:

```sh
stripe listen --forward-to localhost:3100/api/stripe/webhook
```

It prints a `whsec_...` value the first time you run it — put that in
`STRIPE_WEBHOOK_SECRET`.

**To apply the database schema** once `DATABASE_URL` is set:

```sh
pnpm --filter @artform/arvo db:migrate   # creates the tables
pnpm --filter @artform/arvo db:seed path/to/benchmarks.csv   # ArtForm-provided p25/p50/p75 data
```

See `prisma/README.md` for the seed CSV's expected columns.

### Running the tests

The scoring engines (`lib/scoring/`) are pure functions with no external
dependencies — their tests run without any of the keys above:

```sh
pnpm --filter @artform/arvo test
```
