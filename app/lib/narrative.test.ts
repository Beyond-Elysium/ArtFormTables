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

/** Build a result from full stat panels (value/caption control for AI/SEO). */
function seoResult(
  label: string,
  stats: Array<{ label: string; value: number; delta?: number; caption?: string }>,
): ConnectorResult {
  return {
    sourceId: label,
    label,
    category: "SEO",
    isMock: true,
    panels: stats.map((s) => ({
      kind: "stat" as const,
      label: s.label,
      value: s.value,
      format: "number" as const,
      delta: s.delta,
      caption: s.caption,
    })),
  };
}

describe("buildNarrative AI/SEO facts", () => {
  it("surfaces the AI-sessions trend with the AI Score grade when significant", () => {
    const n = buildNarrative(
      [
        seoResult("AI visibility", [
          { label: "AI Score", value: 78, caption: "B+" },
          { label: "AI-referred sessions", value: 420, delta: 25 },
        ]),
      ],
      "vs prior 28d",
    );
    const ai = n.items.find((i) => i.text.includes("AI-referred sessions"));
    expect(ai).toBeDefined();
    expect(ai?.text).toContain("up 25.0%");
    expect(ai?.text).toContain("AI Score B+");
    expect(ai?.positive).toBe(true);
    // The AI stats are consumed — no duplicate generic mover for them.
    expect(n.items.filter((i) => i.text.includes("AI-referred"))).toHaveLength(1);
  });

  it("stays quiet about AI when the sessions trend is insignificant", () => {
    const n = buildNarrative(
      [
        seoResult("AI visibility", [
          { label: "AI Score", value: 78, caption: "B+" },
          { label: "AI-referred sessions", value: 420, delta: 0.4 },
        ]),
      ],
      "vs prior 28d",
    );
    expect(n.items.some((i) => i.text.includes("AI Score"))).toBe(false);
  });

  it("flags crawl errors > 0 as a caution", () => {
    const n = buildNarrative(
      [seoResult("Search health", [{ label: "Crawl errors", value: 12, delta: 8 }])],
      "vs prior 28d",
    );
    const caution = n.items.find((i) => i.text.includes("crawl errors"));
    expect(caution?.text).toBe("Search health: 12 crawl errors need attention");
    expect(caution?.positive).toBe(false);
  });

  it("says nothing when crawl errors are zero", () => {
    const n = buildNarrative(
      [seoResult("Search health", [{ label: "Crawl errors", value: 0 }])],
      "vs prior 28d",
    );
    expect(n.items.some((i) => i.text.includes("crawl"))).toBe(false);
  });

  it("mentions the backlinks total exactly once", () => {
    const n = buildNarrative(
      [
        seoResult("SEO A", [{ label: "Backlinks", value: 3400, delta: 2 }]),
        seoResult("SEO B", [{ label: "Backlinks", value: 900, delta: 5 }]),
      ],
      "vs prior 28d",
    );
    const mentions = n.items.filter((i) => i.text.includes("backlinks"));
    expect(mentions).toHaveLength(1);
    expect(mentions[0].text).toBe("SEO A: 3,400 backlinks");
  });

  it("keeps the item cap with specials and movers combined", () => {
    const n = buildNarrative(
      [
        seoResult("SEO", [
          { label: "AI Score", value: 70, caption: "B" },
          { label: "AI-referred sessions", value: 100, delta: 30 },
          { label: "Crawl errors", value: 3 },
          { label: "Backlinks", value: 1200, delta: 2 },
        ]),
        result("Analytics", [["Users", 12], ["Sessions", -9], ["Revenue", 7]]),
      ],
      "vs prior 28d",
    );
    expect(n.items.length).toBeLessThanOrEqual(4);
    // Specials come first: AI trend, crawl caution, backlinks.
    expect(n.items[0].text).toContain("AI-referred sessions");
    expect(n.items[1].text).toContain("crawl error");
  });
});
