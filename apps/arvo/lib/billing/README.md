# Billing

Stripe-backed subscription billing for Arvo's three pricing tiers.

- `tiers.ts` — the pricing/feature config (single source of truth for UI and gates).
- `stripe.ts` — the Stripe client singleton (degrades gracefully with no `STRIPE_SECRET_KEY`).
- `feature-gates.ts` — `hasFeature()` / `canAddSeat()` helpers reading from `tiers.ts`.
- `subscriptions.ts` — `upsertWorkspaceSubscription()`, currently a stub (see TODO in the
  file) pending the `WorkspaceSubscription` Prisma model.
- `app/api/checkout/route.ts` — creates a Stripe Checkout Session for a tier.
- `app/api/stripe/webhook/route.ts` — verifies and routes Stripe webhook events.

## Going live

1. Create a Stripe account (or use an existing one) and, under Products, create three
   recurring monthly products matching `tiers.ts`:
   - Practitioner — $299/mo
   - Team — $599/mo
   - Agency — $1,499/mo
2. Copy each price's ID into `STRIPE_PRICE_ID_PRACTITIONER` / `_TEAM` / `_AGENCY`.
3. Copy the account's secret key into `STRIPE_SECRET_KEY`.
4. In the Stripe dashboard, add a webhook endpoint pointing at
   `<NEXT_PUBLIC_APP_URL>/api/stripe/webhook`, subscribed to at least:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
5. For local testing, run the Stripe CLI instead of step 4:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and put the
   `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.
6. Once the Prisma `WorkspaceSubscription` model lands, wire `upsertWorkspaceSubscription`
   in `subscriptions.ts` to a real `prisma.workspaceSubscription.upsert(...)` call and
   remove its TODO/stub logging.
