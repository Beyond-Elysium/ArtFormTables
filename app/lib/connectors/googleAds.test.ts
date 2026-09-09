import { describe, it, expect } from "vitest";
import { googleAdsConnector } from "./googleAds";
import type { BreakdownPanel, StatPanel, TimeseriesPanel } from "./types";

describe("googleAdsConnector mock output", () => {
  it("includes Spend and the spend breakdown by default", async () => {
    const res = await googleAdsConnector.fetch({ customerId: "111-111-1111" }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).toEqual(["Spend", "Clicks", "Conversions", "CTR"]);
    const titles = res.panels.filter((p) => p.kind === "breakdown").map((p) => (p as BreakdownPanel).title);
    expect(titles).toContain("Top campaigns by spend");
  });

  it("hideSpend removes the Spend stat, spend breakdown, and spend series", async () => {
    const res = await googleAdsConnector.fetch({ customerId: "111-111-1111", hideSpend: true }, { range: "28d", days: 28 });
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).not.toContain("Spend");
    const titles = res.panels.filter((p) => p.kind === "breakdown").map((p) => (p as BreakdownPanel).title);
    expect(titles).not.toContain("Top campaigns by spend");
    const ts = res.panels.find((p) => p.kind === "timeseries") as TimeseriesPanel;
    expect(ts.series.map((s) => s.name)).toEqual(["Clicks"]);
  });

  it("a placeholder (leading-zero) customer id always serves mock", async () => {
    const res = await googleAdsConnector.fetch(
      { customerId: "000-000-0000", campaignNameFilter: "Census" },
      { range: "28d", days: 28 },
    );
    expect(res.isMock).toBe(true);
  });

  it("different campaignNameFilter values produce different mock demo data", async () => {
    const a = await googleAdsConnector.fetch({ customerId: "111-111-1111", campaignNameFilter: "Census" }, { range: "28d", days: 28 });
    const b = await googleAdsConnector.fetch({ customerId: "111-111-1111", campaignNameFilter: "Defense" }, { range: "28d", days: 28 });
    const clicksA = (a.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Clicks") as StatPanel).value;
    const clicksB = (b.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Clicks") as StatPanel).value;
    expect(clicksA).not.toBe(clicksB);
  });
});
