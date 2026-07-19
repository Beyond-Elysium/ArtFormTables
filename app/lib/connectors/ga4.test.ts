import { describe, it, expect } from "vitest";
import { aiPanels, ga4Connector } from "./ga4";
import { computeAiScore } from "./aiSources";

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
