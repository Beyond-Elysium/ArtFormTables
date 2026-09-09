/**
 * Single source of truth for Arvo's pricing tiers. UI, checkout, and the
 * feature-gate helpers all read from here — nothing should hardcode a price
 * or a feature flag elsewhere.
 */

export interface TierFeatures {
  influenceScore: boolean;
  csvImport: boolean;
  pdfExport: boolean;
  pdfExportWhiteLabel: boolean;
  clientWorkspaces: boolean;
  scenarioSharing: boolean;
  unlimitedSavedScenarios: boolean;
}

export interface Tier {
  id: "practitioner" | "team" | "agency";
  name: string;
  priceMonthly: number;
  seats: number | "unlimited";
  features: TierFeatures;
}

export type TierId = Tier["id"];

export const TIERS: Record<TierId, Tier> = {
  practitioner: {
    id: "practitioner",
    name: "Practitioner",
    priceMonthly: 299,
    seats: 1,
    features: {
      influenceScore: false,
      csvImport: true,
      pdfExport: true,
      pdfExportWhiteLabel: false,
      clientWorkspaces: false,
      scenarioSharing: false,
      unlimitedSavedScenarios: true,
    },
  },
  team: {
    id: "team",
    name: "Team",
    priceMonthly: 599,
    seats: 3,
    features: {
      influenceScore: true,
      csvImport: true,
      pdfExport: true,
      pdfExportWhiteLabel: false,
      clientWorkspaces: false,
      scenarioSharing: true,
      unlimitedSavedScenarios: true,
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 1499,
    seats: "unlimited",
    features: {
      influenceScore: true,
      csvImport: true,
      pdfExport: true,
      pdfExportWhiteLabel: true,
      clientWorkspaces: true,
      scenarioSharing: true,
      unlimitedSavedScenarios: true,
    },
  },
};

export const TIER_LIST: Tier[] = Object.values(TIERS);

export function getTier(id: TierId): Tier {
  return TIERS[id];
}

export function isTierId(value: string): value is TierId {
  return value in TIERS;
}
