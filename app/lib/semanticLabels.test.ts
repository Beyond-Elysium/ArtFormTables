import { describe, expect, it } from "vitest";
import { fieldLabel, modelLabel, prettifyName } from "./semanticLabels";

describe("modelLabel", () => {
  it("maps known models to friendly names", () => {
    expect(modelLabel("ga4")).toBe("Website analytics");
    expect(modelLabel("blended")).toBe("Cross-source");
  });

  it("prettifies unknown models", () => {
    expect(modelLabel("search_console")).toBe("Search Console");
  });
});

describe("fieldLabel", () => {
  it("maps GA4-style raw names", () => {
    expect(fieldLabel("totalUsers")).toBe("Users");
    expect(fieldLabel("sessionDefaultChannelGroup")).toBe("Channel");
    expect(fieldLabel("session_date")).toBe("Date");
  });

  it("proper-cases the acronym KPIs", () => {
    expect(fieldLabel("cac")).toBe("CAC");
    expect(fieldLabel("roas")).toBe("ROAS");
    expect(fieldLabel("ctr")).toBe("CTR");
    expect(fieldLabel("cost")).toBe("Cost");
  });

  it("maps semantic-layer names", () => {
    expect(fieldLabel("users")).toBe("Users");
    expect(fieldLabel("conversion_rate")).toBe("Conversion rate");
  });

  it("falls back to a prettified name for unknowns", () => {
    expect(fieldLabel("avgSessionDuration")).toBe("Avg Session Duration");
    expect(fieldLabel("crawl_errors")).toBe("Crawl Errors");
  });
});

describe("prettifyName", () => {
  it("splits camelCase into Title Case", () => {
    expect(prettifyName("newUsersPerDay")).toBe("New Users Per Day");
  });

  it("splits snake_case and kebab-case", () => {
    expect(prettifyName("cost_per_lead")).toBe("Cost Per Lead");
    expect(prettifyName("page-views")).toBe("Page Views");
  });

  it("preserves all-caps runs", () => {
    expect(prettifyName("pageURL")).toBe("Page URL");
    expect(prettifyName("AI_score")).toBe("AI Score");
  });

  it("handles single words and empty input", () => {
    expect(prettifyName("sessions")).toBe("Sessions");
    expect(prettifyName("")).toBe("");
  });
});
