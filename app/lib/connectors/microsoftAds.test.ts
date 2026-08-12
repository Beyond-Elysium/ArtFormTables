import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import {
  filterRows,
  microsoftAdsConnector,
  parseReportCsv,
  readFirstZipEntry,
  summarize,
} from "./microsoftAds";
import type { BreakdownPanel, StatPanel, TimeseriesPanel } from "./types";

function localFileHeader(name: string, data: Buffer, method: 0 | 8): Buffer {
  const payload = method === 8 ? zlib.deflateRawSync(data) : data;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // flags
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(0, 10); // mod time
  header.writeUInt16LE(0, 12); // mod date
  header.writeUInt32LE(0, 14); // crc32 (unused by the reader)
  header.writeUInt32LE(payload.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, Buffer.from(name), payload]);
}

describe("readFirstZipEntry", () => {
  it("reads a stored (uncompressed) entry", () => {
    const data = Buffer.from("hello,world\n1,2\n");
    const zip = localFileHeader("report.csv", data, 0);
    expect(readFirstZipEntry(zip).toString("utf-8")).toBe(data.toString("utf-8"));
  });

  it("reads a deflated entry", () => {
    const data = Buffer.from("TimePeriod,CampaignName,AdDistribution,Impressions,Clicks,Spend\n2026-08-01,DoD,Search,100,5,12.5\n");
    const zip = localFileHeader("report.csv", data, 8);
    expect(readFirstZipEntry(zip).toString("utf-8")).toBe(data.toString("utf-8"));
  });

  it("throws on a non-ZIP buffer", () => {
    expect(() => readFirstZipEntry(Buffer.from("not a zip"))).toThrow();
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
