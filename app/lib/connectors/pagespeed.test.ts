import { describe, it, expect } from "vitest";
import {
  buildPanels,
  extractOpportunities,
  extractVitals,
  pagespeedConnector,
} from "./pagespeed";
import type { BreakdownPanel, StatPanel } from "./types";

const statLabels = (panels: ReturnType<typeof buildPanels>) =>
  panels.filter((p) => p.kind === "stat").map((p) => (p as StatPanel).label);
const stat = (panels: ReturnType<typeof buildPanels>, label: string) =>
  panels.find((p) => p.kind === "stat" && (p as StatPanel).label === label) as StatPanel | undefined;

describe("extractVitals", () => {
  it("prefers real-user field data and converts its units", () => {
    const v = extractVitals({
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2400 },
          // CrUX reports CLS x100 — 5 here means 0.05.
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5 },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180 },
        },
      },
    });
    expect(v.field).toBe(true);
    expect(v.lcp).toBeCloseTo(2.4); // ms -> seconds
    expect(v.cls).toBeCloseTo(0.05); // x100 -> unitless
    expect(v.inp).toBe(180); // stays in ms
  });

  it("falls back to lab audits when a URL has no field data", () => {
    const v = extractVitals({
      lighthouseResult: {
        audits: {
          "largest-contentful-paint": { numericValue: 3100 },
          // Lab CLS is already unitless — must NOT be divided by 100.
          "cumulative-layout-shift": { numericValue: 0.12 },
        },
      },
    });
    expect(v.field).toBe(false);
    expect(v.lcp).toBeCloseTo(3.1);
    expect(v.cls).toBeCloseTo(0.12);
    // No lab equivalent of INP — omitted rather than mislabelled.
    expect(v.inp).toBeUndefined();
  });

  it("returns an empty-but-usable shape when the payload has neither", () => {
    const v = extractVitals({});
    expect(v).toEqual({ lcp: undefined, cls: undefined, inp: undefined, field: false });
  });
});

describe("extractOpportunities", () => {
  it("keeps only audits with a real saving, biggest first", () => {
    const rows = extractOpportunities({
      lighthouseResult: {
        audits: {
          a: { title: "Small win", details: { overallSavingsMs: 120 } },
          b: { title: "Big win", details: { overallSavingsMs: 900 } },
          c: { title: "Nothing to do", details: { overallSavingsMs: 0 } },
          d: { title: "No details" },
        },
      },
    });
    expect(rows.map((r) => r.label)).toEqual(["Big win", "Small win"]);
    expect(rows[0].value).toBe(900);
  });

  it("falls back to the audit id when it has no title", () => {
    const rows = extractOpportunities({
      lighthouseResult: { audits: { "unused-css-rules": { details: { overallSavingsMs: 300 } } } },
    });
    expect(rows[0].label).toBe("unused-css-rules");
  });

  it("returns [] for an empty payload", () => {
    expect(extractOpportunities({})).toEqual([]);
  });
});

describe("buildPanels", () => {
  const vitals = { lcp: 2.4, cls: 0.05, inp: 180, field: true };

  it("renders scores out of 100 with a Lighthouse-style rating", () => {
    const panels = buildPanels({ performance: 95, seo: 60, accessibility: 30 }, vitals, [], "mobile");
    expect(stat(panels, "Performance")?.caption).toMatch(/^Good/);
    expect(stat(panels, "SEO score")?.caption).toMatch(/^Needs improvement/);
    expect(stat(panels, "Accessibility")?.caption).toMatch(/^Poor/);
  });

  it("omits scores the API didn't return rather than showing zero", () => {
    const panels = buildPanels({ performance: 80 }, vitals, [], "mobile");
    expect(statLabels(panels)).toContain("Performance");
    expect(statLabels(panels)).not.toContain("SEO score");
  });

  it("carries no deltas — it's a point-in-time measurement", () => {
    const panels = buildPanels({ performance: 80, seo: 90 }, vitals, [], "mobile");
    for (const p of panels.filter((x) => x.kind === "stat")) {
      expect((p as StatPanel).delta).toBeUndefined();
    }
  });

  it("marks vitals as good-when-low so a rise reads as bad", () => {
    const panels = buildPanels({}, vitals, [], "mobile");
    expect(stat(panels, "Largest Contentful Paint")?.invertDelta).toBe(true);
    expect(stat(panels, "Layout shift (CLS)")?.invertDelta).toBe(true);
  });

  it("uses one-decimal formatting for LCP, not duration", () => {
    // formatDuration would render 2.4s as "0m 02s".
    expect(stat(buildPanels({}, vitals, [], "mobile"), "Largest Contentful Paint")?.format).toBe("decimal");
  });

  it("says whether vitals came from real users or a lab run", () => {
    const lab = buildPanels({}, { lcp: 3, cls: 0.1, field: false }, [], "mobile");
    expect(stat(lab, "Largest Contentful Paint")?.caption).toMatch(/Lab test/);
    expect(stat(buildPanels({}, vitals, [], "mobile"), "Largest Contentful Paint")?.caption).toMatch(
      /Real users/,
    );
  });

  it("notes the strategy it measured", () => {
    expect(stat(buildPanels({ performance: 80 }, vitals, [], "desktop"), "Performance")?.caption).toMatch(
      /Desktop/,
    );
  });

  it("skips the opportunities table when there's nothing to fix", () => {
    expect(buildPanels({ performance: 100 }, vitals, [], "mobile").some((p) => p.kind === "breakdown")).toBe(
      false,
    );
  });
});

describe("pagespeedConnector", () => {
  it("is not live without PAGESPEED_API_KEY", () => {
    expect(pagespeedConnector.isLive({ url: "https://example.org/" })).toBe(false);
  });

  it("serves deterministic mock data with no key configured", async () => {
    const res = await pagespeedConnector.fetch(
      { url: "https://artformagency.com/" },
      { range: "28d", days: 28 },
    );
    expect(res.isMock).toBe(true);
    expect(res.category).toBe("Search");
    expect(statLabels(res.panels)).toEqual(
      expect.arrayContaining(["Performance", "SEO score", "Largest Contentful Paint"]),
    );
    const opps = res.panels.find((p) => p.kind === "breakdown") as BreakdownPanel;
    expect(opps.rows.length).toBeGreaterThan(0);
    // Sorted biggest saving first.
    expect(opps.rows.map((r) => r.value)).toEqual([...opps.rows.map((r) => r.value)].sort((a, b) => b - a));
  });

  it("gives different demo numbers per URL, so two clients don't look identical", async () => {
    const a = await pagespeedConnector.fetch({ url: "https://a.test/" }, { range: "28d", days: 28 });
    const b = await pagespeedConnector.fetch({ url: "https://b.test/" }, { range: "28d", days: 28 });
    expect(stat(a.panels, "Performance")?.value).not.toBe(stat(b.panels, "Performance")?.value);
  });
});
