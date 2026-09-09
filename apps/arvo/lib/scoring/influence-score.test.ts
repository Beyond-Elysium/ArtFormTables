import { describe, expect, it } from "vitest";
import { calculateInfluenceScore, scoreToTier } from "./influence-score";

describe("calculateInfluenceScore", () => {
  it("weighted-averages the four components with the default weights", () => {
    const result = calculateInfluenceScore({
      engagementRate: 80,
      frequency: 60,
      reach: 90,
      contentTypeAffinity: 50,
    });
    expect(result.score).toBe(72);
    expect(result.tier).toBe("High");
    expect(result.breakdown).toEqual({
      engagementRate: 80,
      frequency: 60,
      reach: 90,
      contentTypeAffinity: 50,
    });
  });

  it("clamps out-of-range component scores into 0-100", () => {
    const result = calculateInfluenceScore({
      engagementRate: 150,
      frequency: -20,
      reach: 50,
      contentTypeAffinity: 50,
    });
    expect(result.breakdown.engagementRate).toBe(100);
    expect(result.breakdown.frequency).toBe(0);
  });
});

describe("scoreToTier", () => {
  // Boundaries match packages/suite-ui/components/ScoreRing.tsx's
  // SCORE_BANDS (0-30/31-55/56-75/76-100) so a ScoreRing rendering this
  // score always lands in the tier reported here.
  it("maps the Low band (0-30)", () => {
    expect(scoreToTier(0)).toBe("Low");
    expect(scoreToTier(30)).toBe("Low");
  });

  it("maps the Moderate band (31-55)", () => {
    expect(scoreToTier(31)).toBe("Moderate");
    expect(scoreToTier(55)).toBe("Moderate");
  });

  it("maps the High band (56-75)", () => {
    expect(scoreToTier(56)).toBe("High");
    expect(scoreToTier(75)).toBe("High");
  });

  it("maps the Very High band (76-100)", () => {
    expect(scoreToTier(76)).toBe("Very High");
    expect(scoreToTier(100)).toBe("Very High");
  });

  it("clamps out-of-range scores before banding", () => {
    expect(scoreToTier(-5)).toBe("Low");
    expect(scoreToTier(150)).toBe("Very High");
  });
});
