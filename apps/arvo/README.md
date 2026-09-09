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

### See it as a demo

A fresh database is empty — no scenarios, no campaign data, no benchmarks —
so clicking through the wizard and importing a CSV by hand isn't a great way
to show this off. `db:seed:demo` self-populates the app with realistic,
clearly-fictional demo content in one command. Minimal path to a working
click-through demo:

1. Set up Clerk and a free Supabase/Neon Postgres database — see the Clerk
   and `DATABASE_URL` rows in the table above.
2. Create the tables:
   ```sh
   pnpm --filter @artform/arvo db:migrate
   ```
3. Run the app (`pnpm --filter @artform/arvo dev`) and sign up once through
   `/sign-up` to create a real Clerk user — then grab that user's id, either
   from the Clerk dashboard's **Users** list (click the user → copy the ID
   at the top, `user_...`) or by logging `(await auth()).userId` from any
   server component/route while signed in.
4. Seed the demo data as that user:
   ```sh
   DEMO_USER_ID=user_xxx pnpm --filter @artform/arvo db:seed:demo
   ```
5. Refresh `/scenarios` (signed in as that same Clerk user). You'll see 5
   scenarios spanning DoD/Civilian/SLED/IC sectors and every objective —
   4 active, 1 archived (to show off the archive/filter UI) — each with
   real Platform Scores, an Influence Score, and a Budget Allocation
   produced by actually running `lib/scenario-engine.ts`, not hand-typed
   numbers. Three of them have flight actuals recorded, so their Flight
   Performance Tracker and Benchmark Gauges render immediately — with a
   deliberate mix of green (over-performing) and red/yellow
   (under-performing) results, not an all-green demo. `/campaign-data` has
   18 imported-looking rows across 7 platforms and 5 sectors.

Re-running `db:seed:demo` is safe — it upserts the same demo rows instead of
duplicating them, so it's fine to run again after a schema change or to
reassign the demo data to a different `DEMO_USER_ID`.

**`prisma/seed-data/sample-benchmarks.csv` is illustrative, made-up sample
data for this demo** — plausible GovCon marketing p25/p50/p75 numbers
invented for this purpose, not ArtForm's real proprietary benchmark data
(which, per the product spec, ArtForm provides separately before a real
launch — see "To apply the database schema" below for pointing `db:seed` at
that real export instead, and `prisma/README.md` for the CSV's columns).

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

## Deploying to Vercel

Arvo is its own Vercel project, separate from the main ArtForm Dashboards
project and separate from Vantage — same pattern as `app/`'s own deploy (see
`app/DEPLOY.md`).

1. **Import this repo** into Vercel as a new project.
2. **Root Directory:** set to `apps/arvo`. (`apps/arvo/vercel.json` pins the
   framework/build/install commands; `postinstall` runs `prisma generate`
   automatically, which Vercel's build otherwise skips.)
3. **Environment variables:** add every row from the table above (Clerk,
   `DATABASE_URL`, Stripe, etc.) in the Vercel project's settings.
4. **Domain:** add a domain or use the `*.vercel.app` one Vercel assigns —
   either way, note the resulting URL.
5. Deploy.
6. **Wire it into the Suite card:** in the separate **ArtForm Dashboards**
   Vercel project (rooted at `app/`), set `ARVO_APP_URL` to the URL from step
   4, and redeploy that project. The Suite card on `/artform` will then link
   to the real deployment instead of `http://localhost:3100`.

See `prisma/README.md` for the seed CSV's expected columns.

### Running the tests

The scoring engines (`lib/scoring/`) are pure functions with no external
dependencies — their tests run without any of the keys above:

```sh
pnpm --filter @artform/arvo test
```
