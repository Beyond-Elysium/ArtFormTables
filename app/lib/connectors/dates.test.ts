import { describe, it, expect } from "vitest";
import {
  clampWindowEnd,
  dateNDaysAgo,
  filterByWindow,
  inclusiveDays,
  previousWindow,
  resolveWindow,
} from "./dates";

// Fixed "today" so assertions are deterministic.
const TODAY = new Date(2026, 6, 15); // 2026-07-15 (local)

describe("resolveWindow", () => {
  it("uses explicit start/end when both are present", () => {
    const w = resolveWindow({ days: 28, start: "2026-03-01", end: "2026-03-31" }, TODAY);
    expect(w).toEqual({ start: "2026-03-01", end: "2026-03-31", days: 31 });
  });

  it("falls back to a trailing window ending today when bounds are absent", () => {
    const w = resolveWindow({ days: 7 }, TODAY);
    expect(w).toEqual({ start: "2026-07-09", end: "2026-07-15", days: 7 });
  });

  it("falls back when only one bound is present", () => {
    const w = resolveWindow({ days: 28, start: "2026-03-01" }, TODAY);
    expect(w.end).toBe("2026-07-15");
    expect(w.days).toBe(28);
  });

  it("recomputes days from explicit bounds (ignores ctx.days)", () => {
    const w = resolveWindow({ days: 90, start: "2026-06-01", end: "2026-06-07" }, TODAY);
    expect(w.days).toBe(7);
  });
});

describe("previousWindow", () => {
  it("is the immediately-preceding window of equal length", () => {
    const p = previousWindow({ start: "2026-03-01", end: "2026-03-31", days: 31 });
    expect(p).toEqual({ start: "2026-01-29", end: "2026-02-28", days: 31 });
  });

  it("is adjacent (prev.end is the day before start) across month boundaries", () => {
    const p = previousWindow({ start: "2026-07-01", end: "2026-07-07", days: 7 });
    expect(p).toEqual({ start: "2026-06-24", end: "2026-06-30", days: 7 });
  });

  it("handles a single-day window", () => {
    const p = previousWindow({ start: "2026-01-01", end: "2026-01-01", days: 1 });
    expect(p).toEqual({ start: "2025-12-31", end: "2025-12-31", days: 1 });
  });
});

describe("clampWindowEnd", () => {
  it("leaves fully-past windows untouched", () => {
    const w = { start: "2026-03-01", end: "2026-03-31", days: 31 };
    expect(clampWindowEnd(w, "2026-07-13")).toEqual(w);
  });

  it("trims only the end when the window runs past the horizon", () => {
    const w = { start: "2026-06-18", end: "2026-07-15", days: 28 };
    expect(clampWindowEnd(w, "2026-07-13")).toEqual({
      start: "2026-06-18",
      end: "2026-07-13",
      days: 26,
    });
  });

  it("collapses to a single day when the whole window is past the horizon", () => {
    const w = { start: "2026-07-14", end: "2026-07-15", days: 2 };
    expect(clampWindowEnd(w, "2026-07-13")).toEqual({
      start: "2026-07-13",
      end: "2026-07-13",
      days: 1,
    });
  });
});

describe("dateNDaysAgo / inclusiveDays", () => {
  it("formats offsets from a fixed date", () => {
    expect(dateNDaysAgo(0, TODAY)).toBe("2026-07-15");
    expect(dateNDaysAgo(2, TODAY)).toBe("2026-07-13");
  });

  it("counts inclusive days", () => {
    expect(inclusiveDays("2026-07-01", "2026-07-01")).toBe(1);
    expect(inclusiveDays("2026-07-01", "2026-07-28")).toBe(28);
  });
});

describe("filterByWindow", () => {
  it("keeps only in-window rows (inclusive bounds)", () => {
    const rows = [
      { x: "2026-06-30", y: 1 },
      { x: "2026-07-01", y: 2 },
      { x: "2026-07-03", y: 3 },
      { x: "2026-07-04", y: 4 },
    ];
    const w = { start: "2026-07-01", end: "2026-07-03", days: 3 };
    expect(filterByWindow(rows, w).map((r) => r.y)).toEqual([2, 3]);
  });
});
