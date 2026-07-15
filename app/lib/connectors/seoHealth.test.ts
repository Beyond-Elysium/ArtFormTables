import { describe, it, expect } from "vitest";
import { searchConsoleConnector } from "./searchConsole";
import { bingWebmasterConnector } from "./bingWebmaster";
import type { BreakdownPanel, StatPanel } from "./types";

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
