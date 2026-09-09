# Arvo

GovCon campaign-benchmarking SaaS. "Know if your campaigns are winning before
the results come in."

Arvo lets GovCon marketers model a planned campaign (objective, audience,
budget & flight) and see how it's likely to perform, benchmarked against
comparable government-contracting campaigns, before it launches.

Built on Next.js 14 (App Router) + TypeScript, [Clerk](https://clerk.com) for
auth, and the ArtForm-branded [`@tabler/core`](../../core) design system via
the shared [`@artform/suite-ui`](../../packages/suite-ui) package — no
Tailwind/shadcn here, same as the rest of this monorepo's products.

## Status

This is a scaffold: route stubs for every planned page, Clerk auth wiring,
and the dashboard shell/navigation. Two pieces are being built out in
parallel, in separate worktrees, and are stubbed with `TODO` comments where
they'll plug in:

- **Database** — a Prisma schema. Look for `TODO(db)` comments (e.g. in
  `app/(dashboard)/scenarios/page.tsx`) marking where a `lib/db.ts` import
  will replace static/empty placeholder data.
- **Billing** — Stripe. Look for `TODO(billing)` comments (e.g. in
  `app/(dashboard)/settings/page.tsx`) marking where a `lib/billing.ts`
  import will wire up the plans in `lib/pricing.ts` to real checkout/portal
  flows.

`packages/suite-ui` is also a placeholder scaffold (added here so this app
has something real to depend on) — a separate, parallel effort owns the real
implementation.

## Routes

| Route | Page |
| --- | --- |
| `/` | Dashboard |
| `/scenarios` | Saved Scenarios |
| `/scenarios/new` | New Scenario (wizard stub) |
| `/scenarios/[id]` | Scenario Results |
| `/campaign-data` | Campaign Data |
| `/import` | Import Data |
| `/integrations` | Integrations |
| `/settings` | Settings (plans) |
| `/sign-in`, `/sign-up` | Clerk auth |

## Running it

From the repo root:

```sh
pnpm install
pnpm --filter @artform/arvo dev
```

The dev server runs on **port 3100**.

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — required for
  auth to work at all. Create a project at
  [dashboard.clerk.com](https://dashboard.clerk.com) and copy its API keys.
  Without these, the app builds but Clerk will throw at request time.

The commented-out `DATABASE_URL` and `STRIPE_*` vars are placeholders for the
concurrent database and billing work — not needed to see the current stubs
running.
