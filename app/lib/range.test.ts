import { describe, expect, it } from "vitest";
import { resolveRange, formatWindow, windowDates } from "./range";

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
