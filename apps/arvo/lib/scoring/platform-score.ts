// Platform Scoring Engine — scores a single platform 0-100 for a given
// scenario (sector/objective/persona) from four weighted factors. Pure: the
// caller looks up personas/benchmarks/etc. and hands in plain numbers, this
// file does no I/O.

export interface CostBenchmark {
  p25: number;
  p50: number;
  p75: number;
}

/// Field names mirror ScoringWeightsConfig in schema.prisma 1:1, so a config
/// row can be spread in directly as `weights` once an admin UI exists to
/// edit it: `calculatePlatformScore({ ...input, weights: configRow })`.
export interface PlatformScoreWeights {
  audienceFitWeight: number;
  benchmarkPositionWeight: number;
  costEfficiencyWeight: number;
  objectiveAlignmentWeight: number;
}

export const DEFAULT_PLATFORM_SCORE_WEIGHTS: PlatformScoreWeights = {
  audienceFitWeight: 0.3,
  benchmarkPositionWeight: 0.3,
  costEfficiencyWeight: 0.2,
  objectiveAlignmentWeight: 0.2,
};

export interface PlatformScoreInput {
  /// 0-100: does this platform reach the scenario's defined persona(s)?
  audienceFitScore: number;
  /// 0-100: this platform's standing vs. peers at the p50 benchmark for the
  /// sector/objective. Ranking a platform against its peers means reading
  /// every other platform's BenchmarkRollup row, which is a DB concern — so
  /// this arrives pre-computed by the caller, same as audienceFitScore and
  /// objectiveAlignmentScore below.
  benchmarkPositionScore: number;
  /// Expected/planned CPL or CPM for this platform (whichever the scenario's
  /// objective prices on).
  expectedCost: number;
  /// p25/p50/p75 for that same cost metric, this platform/sector/objective —
  /// the one factor computed here rather than pre-scored, since it only
  /// needs this platform's own BenchmarkRollup row.
  costBenchmark: CostBenchmark;
  /// 0-100: how well-suited this platform is to the stated objective.
  objectiveAlignmentScore: number;
  weights?: PlatformScoreWeights;
}

export interface PlatformScoreBreakdown {
  audienceFit: number;
  benchmarkPosition: number;
  costEfficiency: number;
  objectiveAlignment: number;
}

export interface PlatformScoreResult {
  score: number;
  breakdown: PlatformScoreBreakdown;
}

function clamp0to100(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/// Maps a raw cost value onto a 0-100 "how good is this" score using the
/// benchmark's own p25/p50/p75 as calibration anchors (25/50/75
/// respectively), linearly interpolated between anchors and linearly
/// extrapolated (then clamped to 0-100) beyond them. CPL/CPM are
/// lower_is_better, so the value and anchors are negated first — that mirrors
/// the axis so "cheaper than p25" lands in the 75-100 range the same way
/// "above p75" would for a higher_is_better metric.
export function costEfficiencyScore(expectedCost: number, benchmark: CostBenchmark): number {
  const { p25, p50, p75 } = benchmark;
  const value = -expectedCost;
  const anchor25 = -p75;
  const anchor50 = -p50;
  const anchor75 = -p25;

  if (anchor75 === anchor25) return 50;

  let score: number;
  if (value <= anchor25) {
    const slope = anchor50 === anchor25 ? 0 : 25 / (anchor50 - anchor25);
    score = 25 - (anchor25 - value) * slope;
  } else if (value <= anchor50) {
    const slope = anchor50 === anchor25 ? 0 : 25 / (anchor50 - anchor25);
    score = 25 + (value - anchor25) * slope;
  } else if (value <= anchor75) {
    const slope = anchor75 === anchor50 ? 0 : 25 / (anchor75 - anchor50);
    score = 50 + (value - anchor50) * slope;
  } else {
    const slope = anchor75 === anchor50 ? 0 : 25 / (anchor75 - anchor50);
    score = 75 + (value - anchor75) * slope;
  }

  return clamp0to100(score);
}

export function calculatePlatformScore(input: PlatformScoreInput): PlatformScoreResult {
  const weights = input.weights ?? DEFAULT_PLATFORM_SCORE_WEIGHTS;
  const totalWeight =
    weights.audienceFitWeight +
    weights.benchmarkPositionWeight +
    weights.costEfficiencyWeight +
    weights.objectiveAlignmentWeight;
  // Normalize rather than assert === 1: admin-edited weights may carry
  // floating-point rounding, and normalizing keeps the function total.
  const w = totalWeight > 0 ? totalWeight : 1;

  const breakdown: PlatformScoreBreakdown = {
    audienceFit: clamp0to100(input.audienceFitScore),
    benchmarkPosition: clamp0to100(input.benchmarkPositionScore),
    costEfficiency: costEfficiencyScore(input.expectedCost, input.costBenchmark),
    objectiveAlignment: clamp0to100(input.objectiveAlignmentScore),
  };

  const score =
    (breakdown.audienceFit * weights.audienceFitWeight +
      breakdown.benchmarkPosition * weights.benchmarkPositionWeight +
      breakdown.costEfficiency * weights.costEfficiencyWeight +
      breakdown.objectiveAlignment * weights.objectiveAlignmentWeight) /
    w;

  return { score: round2(clamp0to100(score)), breakdown };
}
