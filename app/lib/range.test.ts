import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRange, formatWindow, windowDates, RANGE_PRESETS } from "./range";

describe("resolveRange", () => {
  it("defaults to the 28-day preset", () => {
    const r = resolveRange({});
    expect(r.preset).toBe("28d");
    expect(r.window.days).toBe(28);
    expect(windowDates(r.window)).toHaveLength(28);
    expect(r.compareMode).toBe("none");
    expect(r.compare).toBeUndefined();
  });

  it("resolves a preset's day count", () => {
    expect(resolveRange({ range: "7d" }).window.days).toBe(7);
    expect(resolveRange({ range: "90d" }).window.days).toBe(90);
    expect(resolveRange({ range: "12mo" }).window.days).toBe(365);
  });

  it("honours an explicit custom window (inclusive)", () => {
    const r = resolveRange({ range: "custom", from: "2026-03-01", to: "2026-03-15" });
    expect(r.preset).toBe("custom");
    expect(r.window.start).toBe("2026-03-01");
    expect(r.window.end).toBe("2026-03-15");
    expect(r.window.days).toBe(15);
  });

  it("normalises a reversed custom window", () => {
    const r = resolveRange({ range: "custom", from: "2026-03-15", to: "2026-03-01" });
    expect(r.window.start).toBe("2026-03-01");
    expect(r.window.end).toBe("2026-03-15");
  });

  it("builds a previous-period comparison immediately before the window", () => {
    const r = resolveRange({ range: "custom", from: "2026-03-08", to: "2026-03-14", compare: "previous" });
    expect(r.compareMode).toBe("previous");
    expect(r.compare?.end).toBe("2026-03-07");
    expect(r.compare?.start).toBe("2026-03-01");
    expect(r.compare?.days).toBe(7);
  });

  it("shifts a previous-year comparison back a calendar year", () => {
    const r = resolveRange({ range: "custom", from: "2026-03-01", to: "2026-03-15", compare: "year" });
    expect(r.compare?.start).toBe("2025-03-01");
    expect(r.compare?.end).toBe("2025-03-15");
  });
});

describe("calendar-month presets (tm/lm)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 19, 12)); // Jul 19, 2026 (local noon)
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers both presets", () => {
    expect(RANGE_PRESETS.map((p) => p.id)).toContain("tm");
    expect(RANGE_PRESETS.map((p) => p.id)).toContain("lm");
  });

  it("'This month' runs month-to-date (clamped to today)", () => {
    const r = resolveRange({ range: "tm" });
    expect(r.preset).toBe("tm");
    expect(r.window.start).toBe("2026-07-01");
    expect(r.window.end).toBe("2026-07-19");
    expect(r.window.days).toBe(19);
  });

  it("'Last month' covers the full previous calendar month", () => {
    const r = resolveRange({ range: "lm" });
    expect(r.window.start).toBe("2026-06-01");
    expect(r.window.end).toBe("2026-06-30");
    expect(r.window.days).toBe(30);
  });

  it("'This month' on the 1st is a single day", () => {
    vi.setSystemTime(new Date(2026, 6, 1, 12));
    const r = resolveRange({ range: "tm" });
    expect(r.window.start).toBe("2026-07-01");
    expect(r.window.end).toBe("2026-07-01");
    expect(r.window.days).toBe(1);
  });

  it("prior period for 'This month' is the previous calendar month in full", () => {
    const r = resolveRange({ range: "tm", compare: "previous" });
    expect(r.compare?.start).toBe("2026-06-01");
    expect(r.compare?.end).toBe("2026-06-30");
    expect(r.compare?.days).toBe(30);
  });

  it("prior period for 'Last month' is the month before, in full", () => {
    const r = resolveRange({ range: "lm", compare: "previous" });
    expect(r.compare?.start).toBe("2026-05-01");
    expect(r.compare?.end).toBe("2026-05-31");
    expect(r.compare?.days).toBe(31);
  });

  it("prior year for 'Last month' is the same month last year", () => {
    const r = resolveRange({ range: "lm", compare: "year" });
    expect(r.compare?.start).toBe("2025-06-01");
    expect(r.compare?.end).toBe("2025-06-30");
  });

  it("prior year for 'This month' is month-to-date, same month last year", () => {
    const r = resolveRange({ range: "tm", compare: "year" });
    expect(r.compare?.start).toBe("2025-07-01");
    expect(r.compare?.end).toBe("2025-07-19");
  });
});

describe("formatWindow", () => {
  it("drops the year on the start when both ends share it", () => {
    expect(
      formatWindow({ key: "", days: 0, start: "2026-06-01", end: "2026-06-28" }),
    ).toBe("Jun 1 – Jun 28, 2026");
  });

  it("keeps both years when the window spans a boundary", () => {
    expect(
      formatWindow({ key: "", days: 0, start: "2025-12-20", end: "2026-01-10" }),
    ).toBe("Dec 20, 2025 – Jan 10, 2026");
  });
});

describe("windowDates", () => {
  it("enumerates every day oldest-first", () => {
    const dates = windowDates({ key: "", days: 3, start: "2026-02-27", end: "2026-03-01" });
    // Crosses a month boundary in a non-leap year.
    expect(dates).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});
