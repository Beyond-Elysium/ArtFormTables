import { describe, it, expect } from "vitest";
import { indexHealthPanels, pagePath, queryPageRows, searchConsoleConnector } from "./searchConsole";
import { bingWebmasterConnector, seoPanels } from "./bingWebmaster";
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

  it("includes the query→page pairing breakdown", async () => {
    const res = await searchConsoleConnector.fetch({ siteUrl: "https://demo.example/" }, ctx);
    const pairs = res.panels.find(
      (p) => p.kind === "breakdown" && (p as BreakdownPanel).title === "Keywords by page",
    ) as BreakdownPanel | undefined;
    expect(pairs).toBeTruthy();
    expect(pairs?.rows.length).toBeGreaterThan(0);
    expect(pairs?.rows.length).toBeLessThanOrEqual(10);
    // sublabel = "page-path · Pos X.X · N impr" (path only, no scheme/host)
    expect(pairs?.rows[0]?.sublabel).toMatch(/^\/\S* · Pos \d+\.\d · [\d,]+ impr$/);
    // Sorted by clicks, descending.
    const values = pairs?.rows.map((r) => r.value) ?? [];
    expect([...values].sort((a, b) => b - a)).toEqual(values);
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

describe("query→page helpers", () => {
  it("pagePath trims URLs to path (+query), passing non-URLs through", () => {
    expect(pagePath("https://acme.com/blog/guide")).toBe("/blog/guide");
    expect(pagePath("https://acme.com/")).toBe("/");
    expect(pagePath("https://acme.com/search?q=x")).toBe("/search?q=x");
    expect(pagePath("(unknown)")).toBe("(unknown)");
  });

  it("queryPageRows keeps the top 10 pairs by clicks with the display sublabel", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      keys: [`query ${i}`, `https://acme.com/page-${i}`],
      clicks: i,
      impressions: i * 20,
      position: 3.14,
    }));
    const out = queryPageRows(rows);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({
      label: "query 24",
      value: 24,
      sublabel: "/page-24 · Pos 3.1 · 480 impr",
    });
    // Strictly descending by clicks.
    const values = out.map((r) => r.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});

describe("searchConsole empty states", () => {
  it("explains an empty sitemaps list instead of rendering 0% coverage", () => {
    const panels = indexHealthPanels([]);
    expect(panels).toHaveLength(1);
    const stat = panels[0] as StatPanel;
    expect(stat.kind).toBe("stat");
    expect(stat.label).toBe("Sitemaps");
    expect(stat.value).toBe(0);
    expect(stat.caption).toBe("No sitemaps submitted in Search Console");
  });

  it("still renders full index-health panels when sitemaps exist", () => {
    const panels = indexHealthPanels([
      { path: "https://demo.example/sitemap.xml", errors: 0, warnings: 0, contents: [{ submitted: 100, indexed: 90 }] },
    ]);
    const labels = panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(labels).toEqual(["Index coverage", "Not indexed", "Crawl errors"]);
  });
});

describe("bingWebmaster empty states", () => {
  it("flags a likely-unverified site (zero backlinks AND no crawl data)", () => {
    const panels = seoPanels(null, { total: 0, topPages: [] });
    const backlinks = panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Backlinks") as StatPanel;
    expect(backlinks.value).toBe(0);
    expect(backlinks.caption).toBe("Site not yet verified in Bing Webmaster?");
  });

  it("renders a real zero as-is when crawl data is present", () => {
    const panels = seoPanels(
      { crawlErrors: 3, blocked: 1, inIndex: 250 },
      { total: 0, topPages: [] },
    );
    const backlinks = panels.find((p) => p.kind === "stat" && (p as StatPanel).label === "Backlinks") as StatPanel;
    expect(backlinks.value).toBe(0);
    expect(backlinks.caption).toBe("Inbound links (Bing)");
    const labels = panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
    expect(labels).toContain("Crawl errors");
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
