import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import { isTierId, type TierId } from "@/lib/billing/tiers";
import { upsertWorkspaceSubscription } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";

const PRICE_ID_TO_TIER: Record<string, TierId> = {
  [process.env.STRIPE_PRICE_ID_PRACTITIONER ?? ""]: "practitioner",
  [process.env.STRIPE_PRICE_ID_TEAM ?? ""]: "team",
  [process.env.STRIPE_PRICE_ID_AGENCY ?? ""]: "agency",
};

function tierForPriceId(priceId: string | undefined): TierId | undefined {
  if (!priceId) return undefined;
  return PRICE_ID_TO_TIER[priceId];
}

async function handleCheckoutCompleted(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  const workspaceId = session.client_reference_id ?? session.metadata?.clerkUserId ?? "unknown";
  const tierId =
    (session.metadata?.tierId && isTierId(session.metadata.tierId) ? session.metadata.tierId : undefined) ??
    "practitioner";
  const customerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? "unknown");
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? "unknown");

  await upsertWorkspaceSubscription({
    workspaceId,
    tierId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent | Stripe.CustomerSubscriptionDeletedEvent,
) {
  const subscription = event.data.object;
  const priceId = subscription.items.data[0]?.price?.id;
  const tierId = tierForPriceId(priceId) ?? "practitioner";
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await upsertWorkspaceSubscription({
    workspaceId: subscription.metadata?.workspaceId ?? customerId,
    tierId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  });
}

/** POST — Stripe webhook endpoint. Verifies the signature, then routes by event type. */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "billing is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: `invalid signature: ${String(err)}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionUpdated(event);
        break;
      default:
        // Ignore event types we don't act on.
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe/webhook] handler failed for ${event.type}:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
