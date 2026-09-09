export type PricingTier = {
  name: string;
  priceMonthly: number;
  tagline: string;
  features: string[];
};

// TODO(billing): billing itself is out of scope for this pass — Stripe wiring
// will hang off STRIPE_PRICE_ID_TIER1/_TIER2/_TIER3 (see .env.example) once
// that work lands. This is the static catalog only.
export const pricingTiers: PricingTier[] = [
  {
    name: "Tier 1 — Intelligence",
    priceMonthly: 499,
    tagline: "The opportunity feed, scored and filtered.",
    features: [
      "Full opportunity feed with fit scoring",
      "Contact intelligence",
      "Alert center",
    ],
  },
  {
    name: "Tier 2 — + Outreach Playbook",
    priceMonthly: 1499,
    tagline: "Everything in Tier 1, plus who to call and what to say.",
    features: [
      "Everything in Tier 1",
      "Competitive landscape & award history",
      "Monthly market brief",
    ],
  },
  {
    name: "Tier 3 — Full Program",
    priceMonthly: 4999,
    tagline: "The complete program, including Orbit.",
    features: ["Everything in Tier 2", "Orbit included", "Priority support"],
  },
];
