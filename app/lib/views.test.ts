import { describe, expect, it } from "vitest";
import { filterForView, groupViews, matchesView } from "./views";

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

describe("groupViews", () => {
  it("buckets views with no group as ungrouped, in original order", () => {
    const views = [
      { name: "CISR/IRI", types: ["ga4"] },
      { name: "Other", types: ["ga4"] },
    ];
    const { groups, ungrouped } = groupViews(views);
    expect(groups).toEqual([]);
    expect(ungrouped.map((v) => v.name)).toEqual(["CISR/IRI", "Other"]);
  });

  it("buckets same-group views together in first-seen group order", () => {
    const views = [
      { name: "CCC", types: ["ga4"], group: "Programs" },
      { name: "Solo", types: ["ga4"] },
      { name: "Census", types: ["ga4"], group: "Programs" },
      { name: "Defense", types: ["ga4"], group: "Programs" },
    ];
    const { groups, ungrouped } = groupViews(views);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Programs");
    expect(groups[0].views.map((v) => v.name)).toEqual(["CCC", "Census", "Defense"]);
    expect(ungrouped.map((v) => v.name)).toEqual(["Solo"]);
  });

  it("preserves multiple distinct groups in first-seen order", () => {
    const views = [
      { name: "A", types: ["ga4"], group: "Beta" },
      { name: "B", types: ["ga4"], group: "Alpha" },
      { name: "C", types: ["ga4"], group: "Beta" },
    ];
    const { groups } = groupViews(views);
    expect(groups.map((g) => g.name)).toEqual(["Beta", "Alpha"]);
  });

  it("returns no groups for an empty view list", () => {
    expect(groupViews([])).toEqual({ groups: [], ungrouped: [] });
  });
});
