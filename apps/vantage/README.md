# Vantage

GovCon market opportunity intelligence SaaS. "See what's coming before the
RFP drops."

Vantage tracks federal market opportunities (via SAM.gov and USASpending),
scores them for fit, surfaces the key contacts and competitors around each
one, and rolls it all up into alerts and a monthly market brief — so a GovCon
BD team sees a solicitation coming before it's even posted.

Built on Next.js 14 (App Router) + TypeScript, [Clerk](https://clerk.com) for
auth, Prisma + Postgres for storage (landing from concurrent work), and the
ArtForm-branded [`@tabler/core`](../../core) design system via the shared
[`@artform/suite-ui`](../../packages/suite-ui) package — no Tailwind/shadcn
here, same as the rest of this monorepo's products.

## Status

| Piece | State |
| --- | --- |
| App shell, nav, route stubs | Done |
| Auth (Clerk) | Wired |
| Database (Prisma schema) | TODO — landing from concurrent work |
| SAM.gov / USASpending sync | TODO — landing from concurrent work |
| HubSpot connection | TODO — not yet scoped |
| Billing (Stripe tiers/checkout) | TODO — not yet scoped, env vars reserved |

This pass covers the app shell, every route stub, and auth only — it
type-checks (`pnpm --filter @artform/vantage typecheck`) and a real
`next build` with dummy-but-valid credentials compiles and prerenders every
route cleanly. No page reads from a database yet; every stat and list below
is a static placeholder pending the concurrent Prisma schema and sync work.

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
| `DATABASE_URL` | Persist opportunities, contacts, and alerts | TODO — landing from concurrent Prisma-schema work. |
| `SAM_GOV_API_KEY` / `USASPENDING_API_KEY` | Sync opportunities and award history | TODO — landing from concurrent SAM.gov/USASpending sync work. |
| `HUBSPOT_ACCESS_TOKEN` | Sync contacts/opportunities into HubSpot | TODO — not yet scoped. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing | TODO — not yet scoped. |
| `STRIPE_PRICE_ID_TIER1` / `_TIER2` / `_TIER3` | Know which Stripe Price to check out for each tier | Reserved names only for now — create the products in [dashboard.stripe.com](https://dashboard.stripe.com) once billing work starts, matching `lib/pricing.ts` ($499 / $1,499 / $4,999). |

**Minimum to run the app and click through every page right now:** just the
two Clerk keys. Every other page is a static placeholder shell until the
database and sync work land.

### Running typecheck / build

```sh
pnpm --filter @artform/vantage typecheck
pnpm --filter @artform/vantage build
```
