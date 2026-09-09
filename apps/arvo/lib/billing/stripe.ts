/**
 * Stripe client singleton. Follows the repo's connector convention (see
 * app/lib/connectors/stripe.ts, app/lib/report/email.ts): a missing key never
 * throws at import time — callers get a clear error only when they actually
 * try to use Stripe, so pages/build steps that don't touch billing still work
 * with no env configured.
 */
import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

/** True when STRIPE_SECRET_KEY is configured. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Returns the Stripe client, or null with a console warning if unconfigured. */
export function getStripe(): Stripe | null {
  if (cached) return cached;
  if (!isStripeConfigured()) {
    console.warn("[billing/stripe] STRIPE_SECRET_KEY not set — Stripe is disabled");
    return null;
  }
  cached = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return cached;
}

/** Returns the Stripe client, or throws with a clear reason. Use where Stripe is required to proceed. */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY");
  return stripe;
}
