import { describe, expect, it } from "vitest";
import {
  aggregateAiWeeks,
  aiTrendPanelFromRows,
  isoWeekStart,
  scoreAiWeeks,
  type AiDailyRow,
} from "./aiTrend";

// 2026-07-13 is a Monday; 2026-07-06 the Monday before.
const week1: AiDailyRow[] = [
  { date: "2026-07-06", ai_sessions: 10, total_sessions: 400, ai_engaged: 6, distinct_ai_sources: 2, distinct_ai_pages: 8 },
  { date: "2026-07-08", ai_sessions: 20, total_sessions: 600, ai_engaged: 12, distinct_ai_sources: 3, distinct_ai_pages: 10 },
];
const week2: AiDailyRow[] = [
  { date: "2026-07-13", ai_sessions: 60, total_sessions: 1000, ai_engaged: 30, distinct_ai_sources: 5, distinct_ai_pages: 20 },
];

describe("isoWeekStart", () => {
  it("maps any day to its ISO Monday", () => {
    expect(isoWeekStart("2026-07-13")).toBe("2026-07-13"); // Monday → itself
    expect(isoWeekStart("2026-07-15")).toBe("2026-07-13"); // Wednesday
    expect(isoWeekStart("2026-07-19")).toBe("2026-07-13"); // Sunday
    expect(isoWeekStart("2026-07-12")).toBe("2026-07-06"); // previous Sunday
  });

  it("crosses month/year boundaries", () => {
    expect(isoWeekStart("2026-01-01")).toBe("2025-12-29"); // Thu → prior year's Monday
  });
});

describe("aggregateAiWeeks", () => {
  it("sums session counts and takes the max of daily distincts per week", () => {
    const weeks = aggregateAiWeeks([...week2, ...week1]); // out of order on purpose
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-07-06", "2026-07-13"]);
    expect(weeks[0]).toEqual({
      weekStart: "2026-07-06",
      aiSessions: 30,
      totalSessions: 1000,
      aiEngaged: 18,
      distinctSources: 3,
      distinctPages: 10,
    });
    expect(weeks[1].aiSessions).toBe(60);
  });

  it("tolerates junk values and missing dates", () => {
    const weeks = aggregateAiWeeks([
      { date: "2026-07-06", ai_sessions: "12", total_sessions: null, ai_engaged: "x" },
      { date: "" } as AiDailyRow,
    ]);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ aiSessions: 12, totalSessions: 0, aiEngaged: 0 });
  });
});

describe("scoreAiWeeks", () => {
  it("computes the shared composite per week (hand-checked)", () => {
    const scored = scoreAiWeeks(aggregateAiWeeks([...week1, ...week2]));
    // Week 1 (flat momentum: no prior week): share 30/1000 = 3% → full share
    // credit; engagement 0.6 vs 0.55 baseline; 3/5 sources; 10/20 pages.
    // 0.35·1 + 0.2·0.5 + 0.15·(0.6/0.55·0.5) + 0.15·0.6 + 0.15·0.5 ≈ 0.697 → 70.
    expect(scored[0]).toEqual({ weekStart: "2026-07-06", score: 70 });
    // Week 2: +100% momentum → full trend credit; 6% share; engagement 0.5;
    // 5/5 sources; 20/20 pages → ≈ 0.918 → 92.
    expect(scored[1]).toEqual({ weekStart: "2026-07-13", score: 92 });
  });

  it("scores the first week with flat momentum even when it grew from nothing", () => {
    const [first] = scoreAiWeeks(
      aggregateAiWeeks([{ date: "2026-07-06", ai_sessions: 5, total_sessions: 100 }]),
    );
    // prev == current → trend component is exactly 0.5, never the +100% bonus.
    const again = scoreAiWeeks(
      aggregateAiWeeks([
        { date: "2026-06-29", ai_sessions: 5, total_sessions: 100 },
        { date: "2026-07-06", ai_sessions: 5, total_sessions: 100 },
      ]),
    );
    expect(first.score).toBe(again[1].score);
  });
});

describe("aiTrendPanelFromRows", () => {
  it("builds a weekly TimeseriesPanel", () => {
    const panel = aiTrendPanelFromRows([...week1, ...week2]);
    expect(panel).not.toBeNull();
    expect(panel!.kind).toBe("timeseries");
    expect(panel!.title).toBe("AI Score trend");
    expect(panel!.series).toHaveLength(1);
    expect(panel!.series[0].points).toEqual([
      { x: "2026-07-06", y: 70 },
      { x: "2026-07-13", y: 92 },
    ]);
  });

  it("returns null for empty or single-week data (no trend to show)", () => {
    expect(aiTrendPanelFromRows([])).toBeNull();
    expect(aiTrendPanelFromRows(week1)).toBeNull();
  });
});
