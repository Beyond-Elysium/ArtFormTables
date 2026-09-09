// Flight Performance Tracker math — where does an actual metric value sit
// relative to a BenchmarkRollup's p25/p50/p75, and is that good or bad? Pure:
// caller passes the actual value and the rollup's percentiles.

export type BenchmarkBand = "below_p25" | "p25_to_p50" | "above_p50";
export type BenchmarkColor = "red" | "yellow" | "green";
export type MetricDirection = "higher_is_better" | "lower_is_better";

export interface BenchmarkPercentiles {
  p25: number;
  p50: number;
  p75: number;
}

export interface BenchmarkComparisonResult {
  band: BenchmarkBand;
  color: BenchmarkColor;
  /// Signed raw percentage difference from p50: (actual - p50) / p50 * 100.
  /// Deliberately not direction-adjusted — "actual is 12% below p50" is true
  /// regardless of whether that's good (CPL) or bad (CTR); band/color are
  /// what carry the good-or-bad judgment.
  deltaFromP50Pct: number;
}

/// `band` always reflects literal numeric position against the raw
/// percentiles — it means the same thing for every metric. `color` is the
/// judgment layer and is what flips for lower_is_better metrics: below_p25
/// is green for a cost metric (cheaper than 75% of comparable campaigns) but
/// red for a rate metric (worse than 75% of comparable campaigns); the
/// p25_to_p50 middle band stays yellow either way.
export function compareToBenchmark(
  actual: number,
  benchmark: BenchmarkPercentiles,
  direction: MetricDirection,
): BenchmarkComparisonResult {
  const { p25, p50, p75 } = benchmark;

  let band: BenchmarkBand;
  if (actual < p25) {
    band = "below_p25";
  } else if (actual < p50) {
    band = "p25_to_p50";
  } else {
    band = "above_p50";
  }

  const higherIsBetterColor: Record<BenchmarkBand, BenchmarkColor> = {
    below_p25: "red",
    p25_to_p50: "yellow",
    above_p50: "green",
  };
  const lowerIsBetterColor: Record<BenchmarkBand, BenchmarkColor> = {
    below_p25: "green",
    p25_to_p50: "yellow",
    above_p50: "red",
  };
  const color = (direction === "higher_is_better" ? higherIsBetterColor : lowerIsBetterColor)[band];

  const deltaFromP50Pct = p50 === 0 ? (actual === 0 ? 0 : actual > 0 ? Infinity : -Infinity) : ((actual - p50) / p50) * 100;

  // p75 is part of the BenchmarkRollup shape and is accepted for API
  // symmetry / future use (e.g. a finer above_p50/above_p75 split), but
  // isn't needed by the current 3-band spec.
  void p75;

  return { band, color, deltaFromP50Pct };
}
