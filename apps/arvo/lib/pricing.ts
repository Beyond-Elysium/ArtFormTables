export type PricingTier = {
  name: string;
  priceMonthly: number;
  seats: string;
  features: string[];
};

// TODO(billing): the concurrent Stripe work will wire these to real Price IDs
// (see lib/billing.ts, not yet created) — this is the static catalog only.
export const pricingTiers: PricingTier[] = [
  {
    name: "Practitioner",
    priceMonthly: 299,
    seats: "1 seat",
    features: ["Scenario benchmarking", "Campaign data import"],
  },
  {
    name: "Team",
    priceMonthly: 599,
    seats: "3 seats",
    features: ["Everything in Practitioner", "Shared scenarios", "Integrations"],
  },
  {
    name: "Agency",
    priceMonthly: 1499,
    seats: "Unlimited seats",
    features: ["Everything in Team", "White-label"],
  },
];
