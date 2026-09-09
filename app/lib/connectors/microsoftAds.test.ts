import { describe, it, expect } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  filterRows,
  microsoftAdsConnector,
  parseReportCsv,
  readFirstZipEntry,
  summarize,
} from "./microsoftAds";
import type { BreakdownPanel, StatPanel, TimeseriesPanel } from "./types";

/** Build a real ZIP (central directory and all), the way Microsoft's download is. */
function zip(files: Record<string, string>, level: 0 | 6 = 6): Buffer {
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [name, [strToU8(content), { level }] as const]),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(zipSync(entries as any));
}

describe("readFirstZipEntry", () => {
  it("reads a stored (uncompressed) entry", () => {
    const csv = "hello,world\n1,2\n";
    expect(readFirstZipEntry(zip({ "report.csv": csv }, 0)).toString("utf-8")).toBe(csv);
  });

  it("reads a deflated entry", () => {
    const csv =
      "TimePeriod,CampaignName,AdDistribution,Impressions,Clicks,Spend\n2026-08-01,DoD,Search,100,5,12.5\n";
    expect(readFirstZipEntry(zip({ "report.csv": csv }, 6)).toString("utf-8")).toBe(csv);
  });

  it("skips empty entries and returns the first file with content", () => {
    const csv = "TimePeriod,CampaignName\n2026-08-01,DoD\n";
    // Real report archives sometimes carry a placeholder/dir entry first.
    expect(readFirstZipEntry(zip({ "empty.txt": "", "report.csv": csv })).toString("utf-8")).toBe(csv);
  });

  it("throws a clear error on a non-ZIP buffer", () => {
    expect(() => readFirstZipEntry(Buffer.from("not a zip"))).toThrow(/unreadable report archive/i);
  });
});

describe("parseReportCsv", () => {
  const csv = [
    `"Report Name","Account report"`,
    `"Report Time","2026-08-10"`,
    "",
    `TimePeriod,CampaignName,AdDistribution,Impressions,Clicks,Spend`,
    `2026-08-01,Big Brand Innovation Search,Search,1000,50,120.5`,
    `2026-08-02,DoD,Audience,500,10,30`,
    "",
    `,,Grand Total,1500,60,150.5`,
  ].join("\n");

  it("skips the preamble and trailing summary row", () => {
    const rows = parseReportCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-08-01", campaignName: "Big Brand Innovation Search", adDistribution: "Search", impressions: 1000, clicks: 50, spend: 120.5 });
    expect(rows[1]).toMatchObject({ date: "2026-08-02", campaignName: "DoD", adDistribution: "Audience", impressions: 500, clicks: 10, spend: 30 });
  });

  it("returns [] when no header row is found", () => {
    expect(parseReportCsv("garbage\nmore garbage")).toEqual([]);
  });
});

describe("filterRows", () => {
  const rows = parseReportCsv(
    [
      `TimePeriod,CampaignName,AdDistribution,Impressions,Clicks,Spend`,
      `2026-08-01,Big Brand Innovation - Census,Search,100,5,10`,
      `2026-08-01,DoD Innovation,Search,200,8,20`,
    ].join("\n"),
  );

  it("passes rows through unfiltered when no filter is set", () => {
    expect(filterRows(rows)).toHaveLength(2);
  });

  it("matches case-insensitively by substring", () => {
    expect(filterRows(rows, "census")).toHaveLength(1);
    expect(filterRows(rows, "census")[0].campaignName).toBe("Big Brand Innovation - Census");
  });

  it("matches any of an array of filters", () => {
    expect(filterRows(rows, ["dod", "nonexistent"])).toHaveLength(1);
  });
});

describe("summarize", () => {
  const current = parseReportCsv(
    [
      `TimePeriod,CampaignName,AdDistribution,Impressions,Clicks,Spend`,
      `2026-08-01,DoD,Search,1000,50,120`,
      `2026-08-01,DoD,Audience,200,10,15`,
    ].join("\n"),
  );
  const prev = parseReportCsv(
    [`TimePeriod,CampaignName,AdDistribution,Impressions,Clicks,Spend`, `2026-07-01,DoD,Search,800,40,100`].join("\n"),
  );

  it("includes Spend and a Search vs Audience breakdown by default", () => {
    const panels = summarize("USD", current, prev, false);
    const statLabels = panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).toContain("Spend");
    const dist = panels.find((p) => p.kind === "breakdown" && (p as BreakdownPanel).title === "Search vs Audience") as
      | BreakdownPanel
      | undefined;
    expect(dist).toBeTruthy();
    expect(dist!.rows.map((r) => r.label).sort()).toEqual(["Audience", "Search"]);
  });

  it("hideSpend removes the Spend stat and the spend breakdown/series", () => {
    const panels = summarize("USD", current, prev, true);
    const statLabels = panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).not.toContain("Spend");
    const titles = panels.filter((p) => p.kind === "breakdown").map((p) => (p as BreakdownPanel).title);
    expect(titles).not.toContain("Top campaigns by spend");
    const ts = panels.find((p) => p.kind === "timeseries") as TimeseriesPanel;
    expect(ts.series.map((s) => s.name)).toEqual(["Clicks"]);
  });
});

describe("microsoftAdsConnector mock output", () => {
  it("serves deterministic mock data with no credentials configured", async () => {
    const res = await microsoftAdsConnector.fetch({ accountId: "123456789" }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).toEqual(["Spend", "Impressions", "Clicks", "CTR"]);
  });

  it("honors hideSpend in mock mode", async () => {
    const res = await microsoftAdsConnector.fetch({ accountId: "123456789", hideSpend: true }, { range: "28d", days: 28 });
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).not.toContain("Spend");
  });

  it("serves mock for a placeholder (leading-zero) account id even with a filter set", async () => {
    const res = await microsoftAdsConnector.fetch({ accountId: "000000000", campaignFilter: "Census" }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);
  });
});
