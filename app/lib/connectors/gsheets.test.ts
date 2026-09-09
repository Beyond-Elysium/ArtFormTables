import { describe, expect, it } from "vitest";
import { MAX_ROWS, parseSheetNumber, sheetToPanels } from "./gsheets";
import type { BreakdownPanel, StatPanel, TimeseriesPanel } from "./types";

describe("parseSheetNumber", () => {
  it("parses plain and formatted numbers", () => {
    expect(parseSheetNumber("42")).toBe(42);
    expect(parseSheetNumber("1,234")).toBe(1234);
    expect(parseSheetNumber("$12.50")).toBe(12.5);
    expect(parseSheetNumber("45%")).toBe(45);
    expect(parseSheetNumber(" 7 ")).toBe(7);
    expect(parseSheetNumber(-3)).toBe(-3);
  });

  it("returns null for empty or non-numeric cells", () => {
    expect(parseSheetNumber("")).toBeNull();
    expect(parseSheetNumber(null)).toBeNull();
    expect(parseSheetNumber(undefined)).toBeNull();
    expect(parseSheetNumber("n/a")).toBeNull();
    expect(parseSheetNumber("-")).toBeNull();
  });
});

describe("sheetToPanels — timeseries mode (date column)", () => {
  const values = [
    ["Date", "Followers", "Engagements", "Notes"],
    ["2026-07-02", "1,010", "52", "spike"],
    ["2026-07-01", "1000", "40", ""],
    ["2026-07-03", "1020", "61", ""],
  ];

  it("makes numeric columns a timeseries, sorted by date", () => {
    const panels = sheetToPanels(values);
    const ts = panels.find((p) => p.kind === "timeseries") as TimeseriesPanel;
    expect(ts).toBeDefined();
    expect(ts.series.map((s) => s.name)).toEqual(["Followers", "Engagements"]);
    expect(ts.series[0].points).toEqual([
      { x: "2026-07-01", y: 1000 },
      { x: "2026-07-02", y: 1010 },
      { x: "2026-07-03", y: 1020 },
    ]);
  });

  it("ignores non-numeric columns", () => {
    const ts = sheetToPanels(values).find((p) => p.kind === "timeseries") as TimeseriesPanel;
    expect(ts.series.some((s) => s.name === "Notes")).toBe(false);
  });

  it("adds a total stat from the first numeric column", () => {
    const stat = sheetToPanels(values).find((p) => p.kind === "stat") as StatPanel;
    expect(stat.label).toBe("Followers");
    expect(stat.value).toBe(3030);
  });
});

describe("sheetToPanels — breakdown mode (no date column)", () => {
  const values = [
    ["Platform", "Followers"],
    ["LinkedIn", "5,200"],
    ["Instagram", "3100"],
    ["X", "900"],
  ];

  it("renders rows as a table: first column label, numeric column value", () => {
    const panels = sheetToPanels(values);
    const table = panels.find((p) => p.kind === "breakdown") as BreakdownPanel;
    expect(table.display).toBe("table");
    expect(table.valueLabel).toBe("Followers");
    expect(table.rows).toEqual([
      { label: "LinkedIn", value: 5200 },
      { label: "Instagram", value: 3100 },
      { label: "X", value: 900 },
    ]);
  });

  it("adds a total stat summing the value column", () => {
    const stat = sheetToPanels(values).find((p) => p.kind === "stat") as StatPanel;
    expect(stat.label).toBe("Followers");
    expect(stat.value).toBe(9200);
  });
});

describe("sheetToPanels — edge cases", () => {
  it("caps ingestion at MAX_ROWS data rows", () => {
    const values: string[][] = [["Name", "Value"]];
    for (let i = 0; i < MAX_ROWS + 50; i++) values.push([`row-${i}`, "1"]);
    const stat = sheetToPanels(values).find((p) => p.kind === "stat") as StatPanel;
    expect(stat.value).toBe(MAX_ROWS);
  });

  it("reports an empty sheet honestly", () => {
    const [stat] = sheetToPanels([["Name", "Value"]]);
    expect(stat).toMatchObject({ kind: "stat", label: "Rows", value: 0 });
  });

  it("reports a sheet with no numeric columns honestly", () => {
    const [stat] = sheetToPanels([
      ["Name", "Owner"],
      ["Alpha", "Sam"],
    ]);
    expect(stat).toMatchObject({ kind: "stat", label: "Rows", value: 1 });
  });

  it("skips fully-empty rows", () => {
    const stat = sheetToPanels([
      ["Name", "Value"],
      ["a", "2"],
      ["", ""],
      ["b", "3"],
    ]).find((p) => p.kind === "stat") as StatPanel;
    expect(stat.value).toBe(5);
    expect(stat.caption).toContain("2 rows");
  });

  it("a date header without ISO values falls back to breakdown mode", () => {
    const panels = sheetToPanels([
      ["Date", "Value"],
      ["last week", "4"],
      ["this week", "6"],
    ]);
    expect(panels.some((p) => p.kind === "timeseries")).toBe(false);
    const table = panels.find((p) => p.kind === "breakdown") as BreakdownPanel;
    expect(table.rows.map((r) => r.label)).toEqual(["last week", "this week"]);
  });
});
