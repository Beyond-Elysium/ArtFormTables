import { describe, expect, it } from "vitest";
import { allocateBudget } from "./budget-allocation";

function sum(allocations: { amount: number }[]): number {
  return Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
}

describe("allocateBudget", () => {
  it("splits proportionally to score among eligible platforms", () => {
    const result = allocateBudget(10000, [
      { platform: "A", score: 80 },
      { platform: "B", score: 60 },
      { platform: "C", score: 20 },
    ]);
    expect(result).toEqual([
      { platform: "A", amount: 5714.29 },
      { platform: "B", amount: 4285.71 },
    ]);
    expect(sum(result)).toBe(10000);
  });

  it("excludes every platform below the threshold except the one that clears it", () => {
    const result = allocateBudget(3000, [
      { platform: "X", score: 75 },
      { platform: "Y", score: 10 },
      { platform: "Z", score: 5 },
    ]);
    expect(result).toEqual([{ platform: "X", amount: 3000 }]);
  });

  it("includes a required platform below threshold and floors it, redistributing the rest", () => {
    const result = allocateBudget(2000, [
      { platform: "A", score: 80 },
      { platform: "B", score: 10, required: true },
    ]);
    expect(result).toEqual([
      { platform: "A", amount: 1500 },
      { platform: "B", amount: 500 },
    ]);
    expect(sum(result)).toBe(2000);
  });

  it("includes a required platform even when it is the only eligible one", () => {
    const result = allocateBudget(1000, [
      { platform: "A", score: 20, required: true },
      { platform: "B", score: 15 },
    ]);
    expect(result).toEqual([{ platform: "A", amount: 1000 }]);
  });

  it("degrades gracefully when the budget can't float every eligible platform to the floor", () => {
    // Two eligible platforms need $500 each ($1000 total) but the budget is
    // only $800 — nobody can reach the floor, so it falls back to a plain
    // proportional split of the whole budget instead of overshooting it.
    const result = allocateBudget(800, [
      { platform: "A", score: 80 },
      { platform: "B", score: 60 },
    ]);
    expect(result).toEqual([
      { platform: "A", amount: 457.14 },
      { platform: "B", amount: 342.86 },
    ]);
    expect(sum(result)).toBe(800);
  });

  it("reconciles rounding drift onto one platform so the total matches exactly", () => {
    const result = allocateBudget(1000, [
      { platform: "A", score: 40 },
      { platform: "B", score: 40 },
      { platform: "C", score: 40 },
    ]);
    expect(sum(result)).toBe(1000);
    expect(result.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1000, 2);
  });

  it("returns an empty array when nothing is eligible", () => {
    expect(allocateBudget(5000, [{ platform: "A", score: 10 }])).toEqual([]);
  });
});
