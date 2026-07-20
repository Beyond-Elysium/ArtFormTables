import { describe, expect, it } from "vitest";
import { breakdownCsv, csvEscape, csvFilename, timeseriesCsv, toCsv } from "./csv";

describe("csvEscape", () => {
  it("passes plain fields through unquoted", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("1234.5")).toBe("1234.5");
    expect(csvEscape("")).toBe("");
  });

  it("quotes fields containing commas", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes fields containing line breaks", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(
      toCsv([
        ["Name", "Clicks"],
        ["homepage, main", 42],
      ]),
    ).toBe('Name,Clicks\r\n"homepage, main",42');
  });

  it("renders null/undefined cells as empty", () => {
    expect(toCsv([["a", null, undefined, 0]])).toBe("a,,,0");
  });
});

describe("csvFilename", () => {
  it("slugifies parts and joins with hyphens", () => {
    expect(csvFilename("Google Search", "Keyword breakdown", "Jun 22 – Jul 19, 2026")).toBe(
      "google-search-keyword-breakdown-jun-22-jul-19-2026.csv",
    );
  });

  it("skips empty and undefined parts", () => {
    expect(csvFilename("GA4", undefined, "7d")).toBe("ga4-7d.csv");
  });

  it("falls back to a generic name when everything is empty", () => {
    expect(csvFilename(undefined, "—")).toBe("export.csv");
  });
});

describe("timeseriesCsv", () => {
  it("emits Date + one column per series", () => {
    const csv = timeseriesCsv([
      { name: "Clicks", points: [{ x: "2026-07-01", y: 5 }, { x: "2026-07-02", y: 7 }] },
      { name: "Impressions", points: [{ x: "2026-07-01", y: 50 }, { x: "2026-07-02", y: 70 }] },
    ]);
    expect(csv).toBe(
      "Date,Clicks,Impressions\r\n2026-07-01,5,50\r\n2026-07-02,7,70",
    );
  });

  it("leaves cells empty when a series is missing a date", () => {
    const csv = timeseriesCsv([
      { name: "A", points: [{ x: "2026-07-01", y: 1 }] },
      { name: "B (prev)", points: [{ x: "2026-07-02", y: 2 }] },
    ]);
    expect(csv).toBe("Date,A,B (prev)\r\n2026-07-01,1,\r\n2026-07-02,,2");
  });
});

describe("breakdownCsv", () => {
  it("emits Name + the panel's value label", () => {
    expect(breakdownCsv([{ label: "Organic", value: 120 }], "Sessions")).toBe(
      "Name,Sessions\r\nOrganic,120",
    );
  });

  it("adds a Details column when any row has a sublabel", () => {
    const csv = breakdownCsv(
      [
        { label: "brand name", value: 30, sublabel: "Pos 1.2 · 4.0% CTR" },
        { label: "widgets", value: 12 },
      ],
      "Clicks",
    );
    expect(csv).toBe(
      "Name,Clicks,Details\r\nbrand name,30,Pos 1.2 · 4.0% CTR\r\nwidgets,12,",
    );
  });

  it("defaults the value header to Value", () => {
    expect(breakdownCsv([{ label: "x", value: 1 }])).toBe("Name,Value\r\nx,1");
  });
});
