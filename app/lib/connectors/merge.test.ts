import { describe, it, expect } from "vitest";
import { mergeResults, mergePanel } from "./merge";
import type { ConnectorResult, Panel, StatPanel, TimeseriesPanel } from "./types";

function stat(label: string, value: number): StatPanel {
  return { kind: "stat", label, value, format: "number" };
}

function series(title: string, name: string, ys: number[], startDay = 1): TimeseriesPanel {
  return {
    kind: "timeseries",
    title,
    series: [
      {
        name,
        points: ys.map((y, i) => ({ x: `2026-06-${String(startDay + i).padStart(2, "0")}`, y })),
      },
    ],
  };
}

function result(sourceId: string, panels: Panel[]): ConnectorResult {
  return { sourceId, label: sourceId, category: "Analytics", panels, isMock: true };
}

const AXIS = ["2026-07-01", "2026-07-02", "2026-07-03"];

describe("mergeResults (key-based compare merge)", () => {
  it("merges every shared stat correctly when the primary has extra AI panels", () => {
    // Primary: core stats + AI block (AI panels sit BETWEEN core panels and the
    // timeseries to force positional misalignment).
    const primary = [
      result("ga4-0", [
        stat("Users", 100),
        stat("Sessions", 200),
        stat("AI Score", 62),
        stat("AI-referred sessions", 12),
        { kind: "breakdown", title: "AI-referred pages", display: "table", rows: [{ label: "/", value: 5 }] } as Panel,
        series("Traffic over time", "Users", [10, 20, 30], 1),
      ]),
    ];
    // Comparison: AI insights failed → only core panels, at different indices.
    const comparison = [
      result("ga4-0", [
        stat("Users", 50),
        stat("Sessions", 100),
        series("Traffic over time", "Users", [5, 10, 15], 10),
      ]),
    ];

    const [merged] = mergeResults(primary, comparison, AXIS);
    const stats = merged.panels.filter((p): p is StatPanel => p.kind === "stat");

    const users = stats.find((s) => s.label === "Users")!;
    expect(users.compareValue).toBe(50);
    expect(users.delta).toBe(100);

    const sessions = stats.find((s) => s.label === "Sessions")!;
    expect(sessions.compareValue).toBe(100);
    expect(sessions.delta).toBe(100);

    // Unmatched AI panels pass through untouched.
    const aiScore = stats.find((s) => s.label === "AI Score")!;
    expect(aiScore.compareValue).toBeUndefined();
    expect(aiScore.value).toBe(62);
    const aiSessions = stats.find((s) => s.label === "AI-referred sessions")!;
    expect(aiSessions.compareValue).toBeUndefined();
    const aiPages = merged.panels.find((p) => p.kind === "breakdown");
    expect(aiPages).toEqual(primary[0].panels[4]);

    // The timeseries still gets its dashed overlay, aligned on the primary axis.
    const ts = merged.panels.find((p): p is TimeseriesPanel => p.kind === "timeseries")!;
    expect(ts.series.map((s) => s.name)).toEqual(["Users", "Users (prev)"]);
    const prev = ts.series[1];
    expect(prev.dashed).toBe(true);
    expect(prev.points.map((p) => p.x)).toEqual(AXIS);
    expect(prev.points.map((p) => p.y)).toEqual([5, 10, 15]);
  });

  it("matches timeseries by title even when order differs", () => {
    const primary = [
      result("src-0", [
        series("Search performance", "Clicks", [1, 2, 3]),
        series("Other", "Clicks", [9, 9, 9]),
      ]),
    ];
    const comparison = [
      result("src-0", [
        series("Other", "Clicks", [7, 7, 7]),
        series("Search performance", "Clicks", [4, 5, 6]),
      ]),
    ];
    const [merged] = mergeResults(primary, comparison, AXIS);
    const sp = merged.panels[0] as TimeseriesPanel;
    expect(sp.series[1].points.map((p) => p.y)).toEqual([4, 5, 6]);
    const other = merged.panels[1] as TimeseriesPanel;
    expect(other.series[1].points.map((p) => p.y)).toEqual([7, 7, 7]);
  });

  it("never merges a stat against a same-named panel of a different kind", () => {
    const primary = [result("src-0", [stat("Clicks", 10)])];
    const comparison = [
      result("src-0", [series("Clicks", "Clicks", [1, 2, 3])]),
    ];
    const [merged] = mergeResults(primary, comparison, AXIS);
    const s = merged.panels[0] as StatPanel;
    expect(s.compareValue).toBeUndefined();
    expect(s.delta).toBeUndefined();
  });

  it("passes results through when a comparison result is missing entirely", () => {
    const primary = [result("a-0", [stat("Users", 1)]), result("b-1", [stat("Users", 2)])];
    const comparison = [result("a-0", [stat("Users", 4)])];
    const merged = mergeResults(primary, comparison, AXIS);
    expect((merged[0].panels[0] as StatPanel).compareValue).toBe(4);
    expect((merged[1].panels[0] as StatPanel).compareValue).toBeUndefined();
  });

  it("consumes a comparison panel so duplicates don't merge the same partner", () => {
    const primary = [result("src-0", [stat("Users", 10), stat("Users", 20)])];
    const comparison = [result("src-0", [stat("Users", 5)])];
    const [merged] = mergeResults(primary, comparison, AXIS);
    const [first, second] = merged.panels as StatPanel[];
    expect(first.compareValue).toBe(5);
    expect(second.compareValue).toBeUndefined();
  });
});

describe("mergePanel", () => {
  it("computes the delta from the comparison value", () => {
    const merged = mergePanel(stat("Users", 150), stat("Users", 100), AXIS) as StatPanel;
    expect(merged.compareValue).toBe(100);
    expect(merged.delta).toBe(50);
  });

  it("guards divide-by-zero comparison values", () => {
    const merged = mergePanel(stat("Users", 5), stat("Users", 0), AXIS) as StatPanel;
    expect(merged.delta).toBe(100);
  });
});
