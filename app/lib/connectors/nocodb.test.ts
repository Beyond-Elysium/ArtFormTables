import { describe, it, expect } from "vitest";
import { nocodbConnector } from "./nocodb";
import type { StatPanel, TimeseriesPanel } from "./types";

describe("nocodbConnector mock output", () => {
  it("serves deterministic mock data with no token/baseUrl configured", async () => {
    const res = await nocodbConnector.fetch({ tableId: "tbl_conferences" }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);

    const total = res.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Total records") as
      | StatPanel
      | undefined;
    expect(total).toBeTruthy();
    expect(total!.value).toBeGreaterThan(0);

    const ts = res.panels.find((p) => p.kind === "timeseries") as TimeseriesPanel | undefined;
    expect(ts).toBeTruthy();
    expect(ts!.series[0].points.length).toBeGreaterThan(0);
  });

  it("is not live without NOCODB_API_TOKEN/NOCODB_BASE_URL", () => {
    expect(nocodbConnector.isLive({ tableId: "tbl_conferences" })).toBe(false);
  });

  it("different tableIds produce different mock series (distinct demo data per table)", async () => {
    const a = await nocodbConnector.fetch({ tableId: "tbl_conferences" }, { range: "28d", days: 28 });
    const b = await nocodbConnector.fetch({ tableId: "tbl_contacts" }, { range: "28d", days: 28 });
    const totalA = (a.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Total records") as StatPanel).value;
    const totalB = (b.panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Total records") as StatPanel).value;
    expect(totalA).not.toBe(totalB);
  });
});
