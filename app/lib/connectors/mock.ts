/**
 * Deterministic mock helpers shared by every connector so dashboards render
 * fully without any live credentials. Seeded by source + config so a given
 * client always sees the same demo numbers.
 */
import "server-only";

export function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small, fast seeded PRNG (mulberry32). */
export function rng(seedStr: string): () => number {
  let seed = seedFrom(seedStr);
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A plausible daily series with a weekend dip; returns points + total. */
export function mockSeries(
  rand: () => number,
  days: number,
  base: number,
): { points: { x: string; y: number }[]; total: number } {
  const points: { x: string; y: number }[] = [];
  let total = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const y = Math.max(
      0,
      Math.floor(base * (weekend ? 0.6 : 1) * (0.7 + rand() * 0.6)),
    );
    total += y;
    points.push({ x: d.toISOString().slice(0, 10), y });
  }
  return { points, total };
}

/** Random period-over-period delta in a believable range. */
export function mockDelta(rand: () => number): number {
  return Math.round((rand() * 40 - 12) * 10) / 10;
}
