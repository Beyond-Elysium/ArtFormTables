import { describe, it, expect } from "vitest";
import { linkedinAdsConnector } from "./linkedinAds";
import type { BreakdownPanel, StatPanel, TimeseriesPanel } from "./types";

describe("linkedinAdsConnector mock output", () => {
  it("includes Spend and the spend breakdown by default", async () => {
    const res = await linkedinAdsConnector.fetch({ accountId: "511334398" }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).toEqual(["Spend", "Impressions", "Clicks", "CTR"]);
    const titles = res.panels.filter((p) => p.kind === "breakdown").map((p) => (p as BreakdownPanel).title);
    expect(titles).toContain("Top campaigns by spend");
  });

  it("hideSpend removes the Spend stat, spend breakdown, and spend series", async () => {
    const res = await linkedinAdsConnector.fetch({ accountId: "511334398", hideSpend: true }, { range: "28d", days: 28 });
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).not.toContain("Spend");
    const titles = res.panels.filter((p) => p.kind === "breakdown").map((p) => (p as BreakdownPanel).title);
    expect(titles).not.toContain("Top campaigns by spend");
    const ts = res.panels.find((p) => p.kind === "timeseries") as TimeseriesPanel;
    expect(ts.series.map((s) => s.name)).toEqual(["Clicks"]);
  });

  it("the registry's filler 5000000xx account ids always serve mock", async () => {
    const res = await linkedinAdsConnector.fetch({ accountId: "500000002", campaignIds: ["123"] }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);
  });

  it("different campaignIds produce different mock demo data", async () => {
    const a = await linkedinAdsConnector.fetch({ accountId: "511334398", campaignIds: ["111"] }, { range: "28d", days: 28 });
    const b = await linkedinAdsConnector.fetch({ accountId: "511334398", campaignIds: ["222"] }, { range: "28d", days: 28 });
    const clicksA = (a.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Clicks") as StatPanel).value;
    const clicksB = (b.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Clicks") as StatPanel).value;
    expect(clicksA).not.toBe(clicksB);
  });
});
