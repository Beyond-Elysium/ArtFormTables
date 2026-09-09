import { describe, expect, it } from "vitest";
import { calculatePlatformScore, costEfficiencyScore } from "./platform-score";

describe("costEfficiencyScore", () => {
  const benchmark = { p25: 40, p50: 60, p75: 80 };

  it("scores the p50 cost at 50", () => {
    expect(costEfficiencyScore(60, benchmark)).toBe(50);
  });

  it("scores a cost midway between p25 and p50 at the interpolated midpoint", () => {
    expect(costEfficiencyScore(50, benchmark)).toBe(62.5);
  });

  it("extrapolates and clamps for costs cheaper than p25", () => {
    expect(costEfficiencyScore(20, benchmark)).toBe(100);
  });

  it("extrapolates and clamps for costs beyond p75", () => {
    expect(costEfficiencyScore(100, benchmark)).toBe(0);
  });
});

describe("calculatePlatformScore", () => {
  const baseInput = {
    audienceFitScore: 80,
    benchmarkPositionScore: 70,
    expectedCost: 50,
    costBenchmark: { p25: 40, p50: 60, p75: 80 },
    objectiveAlignmentScore: 90,
  };

  it("weighted-averages the four factors with the default weights", () => {
    const result = calculatePlatformScore(baseInput);
    expect(result.breakdown).toEqual({
      audienceFit: 80,
      benchmarkPosition: 70,
      costEfficiency: 62.5,
      objectiveAlignment: 90,
    });
    expect(result.score).toBe(75.5);
  });

  it("normalizes weights that don't sum to 1", () => {
    const result = calculatePlatformScore({
      ...baseInput,
      weights: {
        audienceFitWeight: 1,
        benchmarkPositionWeight: 1,
        costEfficiencyWeight: 1,
        objectiveAlignmentWeight: 1,
      },
    });
    expect(result.score).toBe(75.63);
  });

  it("clamps out-of-range component scores into 0-100", () => {
    const result = calculatePlatformScore({
      ...baseInput,
      audienceFitScore: 150,
      objectiveAlignmentScore: -10,
    });
    expect(result.breakdown.audienceFit).toBe(100);
    expect(result.breakdown.objectiveAlignment).toBe(0);
  });
});
