import { describe, expect, it } from "vitest";
import { rng, mockSeries, mockDelta } from "./mock";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = rng("seed-x");
    const b = rng("seed-x");
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    expect(rng("a")()).not.toBe(rng("b")());
  });

  it("stays within [0, 1)", () => {
    const r = rng("range-check");
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("mockSeries", () => {
  it("returns one point per day with a matching total", () => {
    const { points, total } = mockSeries(rng("series"), 14, 300);
    expect(points).toHaveLength(14);
    expect(total).toBe(points.reduce((a, p) => a + p.y, 0));
    expect(points.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.x))).toBe(true);
  });

  it("is reproducible for the same seed", () => {
    expect(mockSeries(rng("dup"), 7, 100)).toEqual(mockSeries(rng("dup"), 7, 100));
  });
});

describe("mockDelta", () => {
  it("produces a believable percentage range", () => {
    const r = rng("delta");
    for (let i = 0; i < 200; i++) {
      const d = mockDelta(r);
      expect(d).toBeGreaterThanOrEqual(-12);
      expect(d).toBeLessThanOrEqual(28);
    }
  });
});
