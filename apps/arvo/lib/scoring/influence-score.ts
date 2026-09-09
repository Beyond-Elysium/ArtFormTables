// ArtForm Influence Score — a 0-100 composite of how much reach and
// resonance a platform/creator/channel carries, from four pre-scored (0-100)
// components. Pure: the caller computes each component score however it
// sees fit (engagement math, historical cadence, audience size normalized
// against a reach curve, etc.) and hands in plain numbers.

export type InfluenceTier = "Low" | "Moderate" | "High" | "Very High";

/// Boundaries and colors mirror packages/suite-ui/components/ScoreRing.tsx's
/// SCORE_BANDS exactly (0-30/31-55/56-75/76-100, same four colors) so a
/// ScoreRing rendering this score always lands in the tier this file reports
/// — only the labels differ, using this spec's own tier names instead of
/// ScoreRing's generic ones.
export const INFLUENCE_SCORE_BANDS = [
  { min: 0, max: 30, tier: "Low", color: "#94A3B8" },
  { min: 31, max: 55, tier: "Moderate", color: "#F59E0B" },
  { min: 56, max: 75, tier: "High", color: "#00B4CC" },
  { min: 76, max: 100, tier: "Very High", color: "#16A34A" },
] as const satisfies ReadonlyArray<{ min: number; max: number; tier: InfluenceTier; color: string }>;

/// No config-table equivalent of ScoringWeightsConfig exists for these
/// weights yet (that model only covers the Platform Score's four factors) —
/// TODO for whoever wires an admin UI for this: add an
/// InfluenceScoreWeightsConfig model (or extend ScoringWeightsConfig) with
/// these four fields. Until then these are plain function defaults.
export interface InfluenceScoreWeights {
  engagementRateWeight: number;
  frequencyWeight: number;
  reachWeight: number;
  contentTypeAffinityWeight: number;
}

export const DEFAULT_INFLUENCE_SCORE_WEIGHTS: InfluenceScoreWeights = {
  engagementRateWeight: 0.25,
  frequencyWeight: 0.25,
  reachWeight: 0.3,
  contentTypeAffinityWeight: 0.2,
};

export interface InfluenceScoreInput {
  /// 0-100 each, pre-scored by the caller.
  engagementRate: number;
  frequency: number;
  reach: number;
  contentTypeAffinity: number;
  weights?: InfluenceScoreWeights;
}

export interface InfluenceScoreBreakdown {
  engagementRate: number;
  frequency: number;
  reach: number;
  contentTypeAffinity: number;
}

export interface InfluenceScoreResult {
  score: number;
  tier: InfluenceTier;
  breakdown: InfluenceScoreBreakdown;
}

function clamp0to100(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreToTier(score: number): InfluenceTier {
  const clamped = clamp0to100(score);
  const band = INFLUENCE_SCORE_BANDS.find((b) => clamped >= b.min && clamped <= b.max);
  return (band ?? INFLUENCE_SCORE_BANDS[0]).tier;
}

export function calculateInfluenceScore(input: InfluenceScoreInput): InfluenceScoreResult {
  const weights = input.weights ?? DEFAULT_INFLUENCE_SCORE_WEIGHTS;
  const totalWeight =
    weights.engagementRateWeight +
    weights.frequencyWeight +
    weights.reachWeight +
    weights.contentTypeAffinityWeight;
  const w = totalWeight > 0 ? totalWeight : 1;

  const breakdown: InfluenceScoreBreakdown = {
    engagementRate: clamp0to100(input.engagementRate),
    frequency: clamp0to100(input.frequency),
    reach: clamp0to100(input.reach),
    contentTypeAffinity: clamp0to100(input.contentTypeAffinity),
  };

  const score =
    (breakdown.engagementRate * weights.engagementRateWeight +
      breakdown.frequency * weights.frequencyWeight +
      breakdown.reach * weights.reachWeight +
      breakdown.contentTypeAffinity * weights.contentTypeAffinityWeight) /
    w;

  const finalScore = round2(clamp0to100(score));
  return { score: finalScore, tier: scoreToTier(finalScore), breakdown };
}
