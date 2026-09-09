import { TIERS, type Tier, type TierId } from "./tiers";

/** Whether a tier includes the given feature. */
export function hasFeature(tierId: TierId, feature: keyof Tier["features"]): boolean {
  return TIERS[tierId].features[feature];
}

/** Whether a workspace on this tier can add one more seat given its current seat count. */
export function canAddSeat(tierId: TierId, currentSeatCount: number): boolean {
  const seats = TIERS[tierId].seats;
  if (seats === "unlimited") return true;
  return currentSeatCount < seats;
}
