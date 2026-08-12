import { describe, it, expect } from "vitest";
import { aiPanels, conversionPanels, ga4Connector } from "./ga4";
import { computeAiScore } from "./aiSources";
import type { BreakdownPanel, TimeseriesPanel } from "./types";

// With no Google credentials present the connector serves mock data; assert the
// default AI insight panels ride along so every GA4 dashboard shows them.
describe("ga4Connector mock output", () => {
  it("includes the default AI panels", async () => {
    const res = await ga4Connector.fetch({ propertyId: "310586485" }, { range: "28d", days: 28 });
    expect(res.isMock).toBe(true);

    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => p.label);
    expect(statLabels).toContain("AI Score");
    expect(statLabels).toContain("AI-referred sessions");

    const titles = res.panels
      .filter((p) => p.kind === "breakdown")
      .map((p) => (p as { title: string }).title);
    expect(titles).toContain("AI-referred pages");
    expect(titles).toContain("AI assistants");

    const aiScore = res.panels.find((p) => p.kind === "stat" && p.label === "AI Score");
    expect(aiScore).toBeTruthy();
    if (aiScore && aiScore.kind === "stat") {
      expect(aiScore.value).toBeGreaterThanOrEqual(0);
      expect(aiScore.value).toBeLessThanOrEqual(100);
      expect(aiScore.caption).toMatch(/Grade [A-D]/);
    }
  });

  it("renders the avg. session duration stat with a delta", async () => {
    const res = await ga4Connector.fetch({ propertyId: "310586485" }, { range: "28d", days: 28 });
    const dur = res.panels.find((p) => p.kind === "stat" && p.label === "Avg. session duration");
    expect(dur).toBeTruthy();
    if (dur && dur.kind === "stat") {
      expect(dur.format).toBe("duration");
      expect(dur.value).toBeGreaterThan(0);
      expect(typeof dur.delta).toBe("number");
    }
  });

  it("skips the AI block when the source sets aiInsights: false", async () => {
    const res = await ga4Connector.fetch(
      { propertyId: "499713205", aiInsights: false },
      { range: "28d", days: 28 },
    );
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => p.label);
    // Core panels intact...
    expect(statLabels).toContain("Users");
    expect(statLabels).toContain("Avg. session duration");
    // ...but no AI panels.
    expect(statLabels).not.toContain("AI Score");
    expect(statLabels).not.toContain("AI-referred sessions");
    const titles = res.panels
      .filter((p) => p.kind === "breakdown")
      .map((p) => (p as { title: string }).title);
    expect(titles).not.toContain("AI-referred pages");
    expect(titles).not.toContain("AI assistants");
  });
});

describe("ga4 conversions", () => {
  it("mock output includes the conversion panels", async () => {
    const res = await ga4Connector.fetch({ propertyId: "310586485" }, { range: "28d", days: 28 });
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => p.label);
    expect(statLabels).toContain("Conversions");
    expect(statLabels).toContain("Conversion rate");

    const rate = res.panels.find((p) => p.kind === "stat" && p.label === "Conversion rate");
    if (rate && rate.kind === "stat") {
      expect(rate.format).toBe("percent");
      expect(rate.value).toBeGreaterThan(0);
      expect(rate.value).toBeLessThan(1);
    }

    const ts = res.panels.find(
      (p) => p.kind === "timeseries" && (p as TimeseriesPanel).title === "Conversions over time",
    ) as TimeseriesPanel | undefined;
    expect(ts).toBeTruthy();
    expect(ts?.series[0]?.points.length).toBe(28);

    const events = res.panels.find(
      (p) => p.kind === "breakdown" && (p as BreakdownPanel).title === "Top converting events",
    ) as BreakdownPanel | undefined;
    expect(events).toBeTruthy();
    expect(events?.rows.length).toBeGreaterThan(0);
    expect(events?.rows.length).toBeLessThanOrEqual(8);
    // Sorted by count, descending.
    const values = events?.rows.map((r) => r.value) ?? [];
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it("conversionPanels reports a property with no key events honestly", () => {
    const panels = conversionPanels({
      conversions: 0,
      rate: 0,
      deltas: {},
      ts: [{ x: "2026-07-01", y: 0 }],
      events: [],
    });
    expect(panels).toHaveLength(1);
    const stat = panels[0];
    expect(stat.kind).toBe("stat");
    if (stat.kind === "stat") {
      expect(stat.label).toBe("Conversions");
      expect(stat.value).toBe(0);
      expect(stat.caption).toBe("No key events configured in GA4");
    }
  });
});

describe("aiPanels empty state", () => {
  it("explains zero AI-referred traffic and skips the empty breakdowns", () => {
    const score = computeAiScore({
      aiSessions: 0,
      totalSessions: 5000,
      prevAiSessions: 0,
      aiEngagedSessions: 0,
      siteEngagementRate: 0.6,
      distinctSources: 0,
      distinctPages: 0,
    });
    const panels = aiPanels(score, 0, [], []);
    const labels = panels.filter((p) => p.kind === "stat").map((p) => p.label);
    expect(labels).toEqual(["AI Score", "AI-referred sessions"]);
    const aiScore = panels[0];
    if (aiScore.kind === "stat") {
      expect(aiScore.caption).toBe("No AI-referred traffic detected this period");
    }
    // No empty pages/assistants breakdowns ride along.
    expect(panels.some((p) => p.kind === "breakdown")).toBe(false);
  });
});

describe("ga4 pagePathPrefix scoping", () => {
  it("renders the full panel set when scoped to a page path", async () => {
    const res = await ga4Connector.fetch(
      { propertyId: "302350399", pagePathPrefix: "/federal-government/civilian/census-support-services", aiInsights: false },
      { range: "28d", days: 28 },
    );
    expect(res.isMock).toBe(true);
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => p.label);
    expect(statLabels).toContain("Users");
    expect(statLabels).toContain("Sessions");
  });

  it("different pagePathPrefix values produce different mock demo data (distinct tabs, not duplicates)", async () => {
    const a = await ga4Connector.fetch(
      { propertyId: "302350399", pagePathPrefix: "/federal-government/fed-defense", aiInsights: false },
      { range: "28d", days: 28 },
    );
    const b = await ga4Connector.fetch(
      { propertyId: "302350399", pagePathPrefix: "/federal-government/civilian/federal-financial", aiInsights: false },
      { range: "28d", days: 28 },
    );
    const usersA = a.panels.find((p) => p.kind === "stat" && p.label === "Users");
    const usersB = b.panels.find((p) => p.kind === "stat" && p.label === "Users");
    expect(usersA?.kind).toBe("stat");
    expect(usersB?.kind).toBe("stat");
    if (usersA?.kind === "stat" && usersB?.kind === "stat") {
      expect(usersA.value).not.toBe(usersB.value);
    }
  });
});
