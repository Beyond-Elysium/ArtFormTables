import { describe, expect, it } from "vitest";
import { buildNarrative } from "./narrative";
import type { ConnectorResult } from "@/lib/connectors/types";

function result(label: string, stats: Array<[string, number, boolean?]>): ConnectorResult {
  return {
    sourceId: label,
    label,
    category: "Test",
    isMock: true,
    panels: stats.map(([l, delta, invert]) => ({
      kind: "stat" as const,
      label: l,
      value: 100,
      format: "number" as const,
      delta,
      invertDelta: invert,
    })),
  };
}

describe("buildNarrative", () => {
  it("leads with the biggest mover and tallies up/down", () => {
    const n = buildNarrative(
      [result("Analytics", [["Users", 12], ["Sessions", -3]]), result("Ads", [["Spend", 40, true]])],
      "vs prior 28d",
    );
    // Spend +40% has the largest magnitude; invertDelta makes it a decline.
    expect(n.headline).toContain("Spend up 40.0% vs prior 28d");
    expect(n.headline).toMatch(/improving, \d declining/);
    expect(n.items[0].label).toBe("Spend");
    expect(n.items[0].positive).toBe(false); // up spend is bad
  });

  it("respects invertDelta for sentiment", () => {
    const n = buildNarrative([result("Ads", [["Cost", -15, true]])], "vs prior 28d");
    expect(n.items[0].positive).toBe(true); // cost down is good
    expect(n.headline).toContain("broad gains");
  });

  it("reports steady when nothing crosses the threshold", () => {
    const n = buildNarrative([result("A", [["X", 0.2], ["Y", -0.4]])], "vs prior 7d");
    expect(n.headline).toBe("Metrics held roughly steady vs prior 7d.");
  });

  it("ignores panels without a delta", () => {
    const noDelta: ConnectorResult = {
      sourceId: "s", label: "S", category: "T", isMock: true,
      panels: [{ kind: "stat", label: "Rate", value: 0.5, format: "percent" }],
    };
    expect(buildNarrative([noDelta], "vs prior 28d").items).toHaveLength(0);
  });
});
