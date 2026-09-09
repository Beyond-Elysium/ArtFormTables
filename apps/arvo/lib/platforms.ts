// Canonical platform list for scenario planning. No platform table/enum
// exists (BenchmarkRollup.platform is freeform text, seeded from whatever
// CSV ArtForm hands over — see prisma/README.md), so this is a fixed
// front-end/back-end shared list covering the channels GovCon media plans
// typically consider. IDs follow the same lowercase-hyphenated convention as
// the seed script's example row ("linkedin-ads") so wizard input, stored
// Scenario.excludedPlatforms/requiredPlatforms, and BenchmarkRollup.platform
// values all line up as the same strings.

import type { Objective } from "@/lib/enums";

export const PLATFORM_IDS = [
  "linkedin-ads",
  "google-ads",
  "meta-ads",
  "youtube-ads",
  "programmatic-display",
  "govexec",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const platformLabels: Record<PlatformId, string> = {
  "linkedin-ads": "LinkedIn Ads",
  "google-ads": "Google Ads",
  "meta-ads": "Meta Ads",
  "youtube-ads": "YouTube Ads",
  "programmatic-display": "Programmatic Display",
  govexec: "GovExec Media",
};

export function platformLabel(platform: string): string {
  return (platformLabels as Record<string, string>)[platform] ?? platform;
}

// --- Scoring heuristics ----------------------------------------------------
//
// platform-score.ts expects an audienceFitScore and objectiveAlignmentScore
// (0-100 each) that only a real audience-overlap/performance dataset can
// answer well. The wizard doesn't collect per-platform persona-match or
// historical-conversion data (nothing in the app does yet), so these tables
// are a stand-in: a reasonable, documented guess per platform (and, for
// objective fit, per platform+objective) so scenario scoring produces a
// meaningful spread of scores today instead of blocking on data that
// doesn't exist yet.
//
// TODO: replace both tables with real data once available —
// PLATFORM_AUDIENCE_FIT_DEFAULT with actual persona/audience-overlap
// analysis (e.g. matched against CampaignData or a firmographic data
// provider), PLATFORM_OBJECTIVE_FIT with observed conversion performance by
// platform/objective (e.g. rolled up from CampaignData once enough volume
// exists). Any platform not in these tables (a required platform outside
// the fixed list, or new BenchmarkRollup data) falls back to a flat default.

export const DEFAULT_AUDIENCE_FIT = 60;
export const DEFAULT_OBJECTIVE_FIT = 60;

export const PLATFORM_AUDIENCE_FIT_DEFAULT: Record<string, number> = {
  "linkedin-ads": 80, // job-title/seniority targeting maps directly to personas
  "google-ads": 55, // keyword intent only, no persona-level targeting
  "meta-ads": 40, // weak fit for GovCon B2B/B2G personas
  "youtube-ads": 50,
  "programmatic-display": 60, // can layer firmographic data via DSP segments
  govexec: 75, // vertical publication, audience already GovCon-skewed
};

export const PLATFORM_OBJECTIVE_FIT: Record<string, Partial<Record<Objective, number>>> = {
  "linkedin-ads": { awareness: 65, consideration: 75, lead_generation: 80, recruitment: 85 },
  "google-ads": { awareness: 55, consideration: 65, lead_generation: 75, recruitment: 60 },
  "meta-ads": { awareness: 70, consideration: 55, lead_generation: 50, recruitment: 55 },
  "youtube-ads": { awareness: 80, consideration: 60, lead_generation: 40, recruitment: 50 },
  "programmatic-display": { awareness: 75, consideration: 60, lead_generation: 45, recruitment: 45 },
  govexec: { awareness: 70, consideration: 70, lead_generation: 65, recruitment: 70 },
};
