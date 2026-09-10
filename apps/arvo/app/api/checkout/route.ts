import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/billing/stripe";
import { isTierId, type TierId } from "@/lib/billing/tiers";

export const runtime = "nodejs";

const PRICE_ENV_VAR: Record<TierId, string> = {
  practitioner: "STRIPE_PRICE_ID_PRACTITIONER",
  team: "STRIPE_PRICE_ID_TEAM",
  agency: "STRIPE_PRICE_ID_AGENCY",
};

function priceIdFor(tierId: TierId): string | undefined {
  return process.env[PRICE_ENV_VAR[tierId]];
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000/arvo";
}

/** POST { tierId } — creates a Stripe Checkout Session for the signed-in user. */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "billing is not configured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { tierId?: string };
  if (!body.tierId || !isTierId(body.tierId)) {
    return NextResponse.json({ error: "invalid tierId" }, { status: 400 });
  }
  const tierId = body.tierId;

  const priceId = priceIdFor(tierId);
  if (!priceId) {
    return NextResponse.json(
      { error: `no Stripe price configured for tier "${tierId}" (set ${PRICE_ENV_VAR[tierId]})` },
      { status: 500 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/billing/canceled`,
      metadata: { tierId, clerkUserId: userId },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
