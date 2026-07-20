import { describe, expect, it } from "vitest";
import { filterForView, matchesView } from "./views";

const sources = [
  { sourceId: "ga4-0", type: "ga4", label: "Main" },
  { sourceId: "ga4-cisr", type: "ga4", label: "CISR/IRI" },
  { sourceId: "search-console-2", type: "search-console", label: "Search" },
  { sourceId: "bing-webmaster-3", type: "bing-webmaster", label: "Bing" },
];

describe("matchesView", () => {
  it("matches by explicit source id", () => {
    const view = { name: "CISR/IRI", sourceIds: ["ga4-cisr"] };
    expect(matchesView(view, sources[1])).toBe(true);
    expect(matchesView(view, sources[0])).toBe(false);
  });

  it("matches by connector type", () => {
    const view = { name: "Analytics", types: ["ga4"] };
    expect(matchesView(view, sources[0])).toBe(true);
    expect(matchesView(view, sources[1])).toBe(true);
    expect(matchesView(view, sources[2])).toBe(false);
  });

  it("includes a source matching either selector (union)", () => {
    const view = { name: "Mixed", sourceIds: ["bing-webmaster-3"], types: ["ga4"] };
    expect(matchesView(view, sources[0])).toBe(true); // by type
    expect(matchesView(view, sources[3])).toBe(true); // by id
    expect(matchesView(view, sources[2])).toBe(false);
  });

  it("never type-matches a source without a type", () => {
    const view = { name: "Analytics", types: ["ga4"] };
    expect(matchesView(view, { sourceId: "ga4-0" })).toBe(false);
  });
});

describe("filterForView", () => {
  it("keeps only selected sources, in original order", () => {
    const view = { name: "Search", types: ["search-console", "bing-webmaster"] };
    expect(filterForView(sources, view).map((s) => s.sourceId)).toEqual([
      "search-console-2",
      "bing-webmaster-3",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterForView(sources, { name: "Empty", sourceIds: ["nope"] })).toEqual([]);
  });

  it("the BBBNP CISR/IRI view selects only the second GA4 source", () => {
    const view = { name: "CISR/IRI", sourceIds: ["ga4-cisr"] };
    const visible = filterForView(sources, view);
    expect(visible).toHaveLength(1);
    expect(visible[0].label).toBe("CISR/IRI");
  });
});
