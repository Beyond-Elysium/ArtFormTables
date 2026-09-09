import { describe, it, expect } from "vitest";
import { matchAiSource, isAiSource, computeAiScore, type AiSignals } from "./aiSources";

describe("matchAiSource", () => {
  it("recognizes AI assistant hosts", () => {
    expect(matchAiSource("chatgpt.com")?.label).toBe("ChatGPT");
    expect(matchAiSource("chat.openai.com")?.label).toBe("ChatGPT");
    expect(matchAiSource("www.perplexity.ai")?.label).toBe("Perplexity");
    expect(matchAiSource("gemini.google.com")?.label).toBe("Gemini");
    expect(matchAiSource("copilot.microsoft.com")?.label).toBe("Copilot");
    expect(matchAiSource("edgeservices.bing.com")?.label).toBe("Copilot");
    expect(matchAiSource("claude.ai")?.label).toBe("Claude");
  });
  it("does not treat plain search engines / referrers as AI", () => {
    expect(isAiSource("google")).toBe(false);
    expect(isAiSource("bing")).toBe(false);
    expect(isAiSource("(direct)")).toBe(false);
    expect(isAiSource("t.co")).toBe(false);
    expect(isAiSource(undefined)).toBe(false);
  });
});

describe("computeAiScore", () => {
  const base: AiSignals = {
    aiSessions: 0,
    totalSessions: 1000,
    prevAiSessions: 0,
    aiEngagedSessions: 0,
    siteEngagementRate: 0.6,
    distinctSources: 0,
    distinctPages: 0,
  };

  it("scores an empty AI footprint low", () => {
    const s = computeAiScore(base);
    expect(s.score).toBeLessThanOrEqual(20); // only the flat-momentum baseline
    expect(s.share).toBe(0);
    expect(s.grade).toBe("D");
  });

  it("rewards strong, growing, well-covered AI traffic", () => {
    const s = computeAiScore({
      aiSessions: 40, // 4% share, above the 3% target
      totalSessions: 1000,
      prevAiSessions: 20, // +100% momentum
      aiEngagedSessions: 32, // 80% engaged vs 60% site
      siteEngagementRate: 0.6,
      distinctSources: 5,
      distinctPages: 25,
    });
    expect(s.score).toBeGreaterThanOrEqual(85);
    expect(s.grade).toBe("A+");
    expect(s.share).toBeCloseTo(0.04, 3);
    expect(s.trendPct).toBe(100);
  });

  it("keeps the score within 0..100 and weights summing to 1", () => {
    const s = computeAiScore({ ...base, aiSessions: 999, prevAiSessions: 1, distinctSources: 99, distinctPages: 999 });
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
    const totalWeight = s.components.reduce((a, c) => a + c.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 6);
  });
});
