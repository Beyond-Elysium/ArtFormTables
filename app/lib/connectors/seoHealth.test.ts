import { describe, it, expect } from "vitest";
import { searchConsoleConnector } from "./searchConsole";
import { bingWebmasterConnector } from "./bingWebmaster";
import { mergeResults } from "./merge";
import type { BreakdownPanel, ConnectorResult, StatPanel } from "./types";

const ctx = { range: "28d", days: 28 };

describe("searchConsole mock output", () => {
  it("includes index/crawl-health panels", async () => {
    const res = await searchConsoleConnector.fetch({ siteUrl: "https://demo.example/" }, ctx);
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).toContain("Index coverage");
    expect(statLabels).toContain("Crawl errors");
    // keyword breakdown carries position/CTR in the sublabel
    const kw = res.panels.find((p) => p.kind === "breakdown" && (p as BreakdownPanel).title === "Keyword breakdown") as BreakdownPanel | undefined;
    expect(kw?.rows[0]?.sublabel).toMatch(/Pos .* CTR/);
  });

  it("index-health stats participate in key-based compare merging", async () => {
    // Two different windows produce different (seeded) sitemap numbers; the
    // key-based merge must pair the index-health stats by label and attach a
    // compareValue + delta, honoring invertDelta semantics downstream (B5).
    const primary = (await searchConsoleConnector.fetch(
      { siteUrl: "https://demo.example/" },
      { range: "2026-06-01_2026-06-28", days: 28 },
    )) as ConnectorResult;
    const comparison = (await searchConsoleConnector.fetch(
      { siteUrl: "https://demo.example/" },
      { range: "2026-05-04_2026-05-31", days: 28 },
    )) as ConnectorResult;

    const [merged] = mergeResults([primary], [comparison], []);
    for (const label of ["Index coverage", "Not indexed", "Crawl errors"]) {
      const stat = merged.panels.find((p) => p.kind === "stat" && p.label === label) as StatPanel | undefined;
      expect(stat, label).toBeTruthy();
      expect(stat?.compareValue, label).toBeDefined();
      expect(typeof stat?.delta, label).toBe("number");
    }
    const notIndexed = merged.panels.find((p) => p.kind === "stat" && p.label === "Not indexed") as StatPanel;
    expect(notIndexed.invertDelta).toBe(true);
  });
});

describe("bingWebmaster mock output", () => {
  it("includes backlinks + crawl errors", async () => {
    const res = await bingWebmasterConnector.fetch({ siteUrl: "https://demo.example/" }, ctx);
    const statLabels = res.panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(statLabels).toContain("Backlinks");
    expect(statLabels).toContain("Crawl errors");
    const linked = res.panels.find((p) => p.kind === "breakdown" && (p as BreakdownPanel).title === "Top linked pages");
    expect(linked).toBeTruthy();
  });
});
