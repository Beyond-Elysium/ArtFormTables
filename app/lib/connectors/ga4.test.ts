import { describe, it, expect } from "vitest";
import { ga4Connector } from "./ga4";

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
});
