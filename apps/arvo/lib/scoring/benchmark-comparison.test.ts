import { describe, expect, it } from "vitest";
import { compareToBenchmark } from "./benchmark-comparison";

describe("compareToBenchmark — higher_is_better (e.g. CTR, conversion_rate)", () => {
  const benchmark = { p25: 2, p50: 4, p75: 6 };

  it("classifies above p50 as green", () => {
    const result = compareToBenchmark(5, benchmark, "higher_is_better");
    expect(result.band).toBe("above_p50");
    expect(result.color).toBe("green");
    expect(result.deltaFromP50Pct).toBe(25);
  });

  it("classifies between p25 and p50 as yellow", () => {
    const result = compareToBenchmark(3, benchmark, "higher_is_better");
    expect(result.band).toBe("p25_to_p50");
    expect(result.color).toBe("yellow");
    expect(result.deltaFromP50Pct).toBe(-25);
  });

  it("classifies below p25 as red", () => {
    const result = compareToBenchmark(1, benchmark, "higher_is_better");
    expect(result.band).toBe("below_p25");
    expect(result.color).toBe("red");
    expect(result.deltaFromP50Pct).toBe(-75);
  });
});

describe("compareToBenchmark — lower_is_better (e.g. CPL, CPM): color must invert", () => {
  const benchmark = { p25: 20, p50: 30, p75: 40 };

  it("classifies a cost below p25 (cheaper than 75% of campaigns) as green, not red", () => {
    const result = compareToBenchmark(15, benchmark, "lower_is_better");
    expect(result.band).toBe("below_p25");
    expect(result.color).toBe("green");
    expect(result.deltaFromP50Pct).toBe(-50);
  });

  it("classifies a cost above p50 (pricier than typical) as red, not green", () => {
    const result = compareToBenchmark(35, benchmark, "lower_is_better");
    expect(result.band).toBe("above_p50");
    expect(result.color).toBe("red");
    expect(result.deltaFromP50Pct).toBeCloseTo(16.67, 2);
  });

  it("keeps the p25-p50 middle band yellow regardless of direction", () => {
    const result = compareToBenchmark(25, benchmark, "lower_is_better");
    expect(result.band).toBe("p25_to_p50");
    expect(result.color).toBe("yellow");
  });
});

describe("compareToBenchmark — edge cases", () => {
  it("handles a zero p50 without dividing by zero", () => {
    const benchmark = { p25: -1, p50: 0, p75: 1 };
    expect(compareToBenchmark(0, benchmark, "higher_is_better").deltaFromP50Pct).toBe(0);
    expect(compareToBenchmark(2, benchmark, "higher_is_better").deltaFromP50Pct).toBe(Infinity);
    expect(compareToBenchmark(-2, benchmark, "higher_is_better").deltaFromP50Pct).toBe(-Infinity);
  });
});
