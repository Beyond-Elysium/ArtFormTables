import { describe, expect, it } from "vitest";
import {
  buildExploreQuery,
  clientScopeDecision,
  encodeFilters,
  decodeFilters,
  forceClientFilter,
  isModelExplorable,
  toggleFilter,
  filtersFromRow,
  isTimeseries,
  type ExploreState,
} from "./explore";

const base: ExploreState = {
  model: "ga4",
  dimensions: ["channel"],
  measures: ["users"],
  filters: [],
  timeDimension: "date",
};

describe("buildExploreQuery", () => {
  it("maps dimensions, measures and equality filters", () => {
    const q = buildExploreQuery({ ...base, filters: [{ field: "device", value: "mobile" }] });
    expect(q.model).toBe("ga4");
    expect(q.dimensions).toEqual(["channel"]);
    expect(q.measures).toEqual(["users"]);
    expect(q.filters).toEqual([{ field: "device", op: "=", value: "mobile" }]);
  });

  it("orders by the first measure descending for a categorical view", () => {
    const q = buildExploreQuery(base);
    expect(q.orderBy).toEqual([["users", "desc"]]);
  });

  it("orders by the time dimension ascending for a timeseries view", () => {
    const q = buildExploreQuery({ ...base, dimensions: ["date"] });
    expect(q.orderBy).toEqual([["date", "asc"]]);
  });

  it("includes a time range only when a bound is set", () => {
    expect(buildExploreQuery(base).timeRange).toBeUndefined();
    const q = buildExploreQuery({ ...base, from: "2026-01-01", to: "2026-02-01" });
    expect(q.timeRange).toEqual({ start: "2026-01-01", end: "2026-02-01" });
  });

  it("falls back to ordering by the first dimension when no measures", () => {
    const q = buildExploreQuery({ ...base, measures: [] });
    expect(q.orderBy).toEqual([["channel", "asc"]]);
  });
});

describe("buildExploreQuery sort + limit", () => {
  const multi = { ...base, measures: ["users", "sessions"] };

  it("sorts by the chosen measure descending", () => {
    const q = buildExploreQuery({ ...multi, sortBy: "sessions" });
    expect(q.orderBy).toEqual([["sessions", "desc"]]);
  });

  it("ignores a stale sortBy that is no longer a selected measure", () => {
    const q = buildExploreQuery({ ...multi, sortBy: "revenue" });
    expect(q.orderBy).toEqual([["users", "desc"]]);
  });

  it("applies the Top-N row cap to categorical views", () => {
    expect(buildExploreQuery({ ...multi, limit: 20 }).limit).toBe(20);
    expect(buildExploreQuery({ ...multi, limit: 100 }).limit).toBe(100);
  });

  it("defaults to the 500-row ceiling and clamps out-of-range caps", () => {
    expect(buildExploreQuery(multi).limit).toBe(500);
    expect(buildExploreQuery({ ...multi, limit: 9999 }).limit).toBe(500);
    expect(buildExploreQuery({ ...multi, limit: 0 }).limit).toBe(500);
  });

  it("timeseries views keep time ordering and the full window", () => {
    const q = buildExploreQuery({
      ...multi,
      dimensions: ["date"],
      sortBy: "sessions",
      limit: 20,
    });
    expect(q.orderBy).toEqual([["date", "asc"]]);
    expect(q.limit).toBe(500);
  });
});

describe("forceClientFilter", () => {
  const q = { model: "ga4", dimensions: ["channel"], measures: ["users"] };

  it("appends the client equality filter", () => {
    expect(forceClientFilter(q, "acme").filters).toEqual([
      { field: "client", op: "=", value: "acme" },
    ]);
  });

  it("overwrites any caller-supplied client filter (no spoofing)", () => {
    const spoofed = {
      ...q,
      filters: [
        { field: "client", op: "=" as const, value: "other-client" },
        { field: "client", op: "in" as const, value: ["a", "b"] },
        { field: "device", op: "=" as const, value: "mobile" },
      ],
    };
    expect(forceClientFilter(spoofed, "acme").filters).toEqual([
      { field: "device", op: "=", value: "mobile" },
      { field: "client", op: "=", value: "acme" },
    ]);
  });

  it("does not mutate the input query", () => {
    const spoofed = { ...q, filters: [{ field: "client", value: "other" }] };
    forceClientFilter(spoofed, "acme");
    expect(spoofed.filters).toEqual([{ field: "client", value: "other" }]);
  });
});

describe("clientScopeDecision", () => {
  const schemas = {
    ga4: { dimensions: ["client", "date", "channel"] },
    blended: { dimensions: ["date", "channel"] },
  };

  it("scopes models that carry a client dimension", () => {
    expect(clientScopeDecision("ga4", schemas)).toEqual({ action: "scope" });
  });

  it("rejects models without a client dimension (empty allowlist)", () => {
    const d = clientScopeDecision("blended", schemas);
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.status).toBe(400);
  });

  it("forwards models without a client dimension when allowlisted", () => {
    expect(clientScopeDecision("blended", schemas, ["blended"])).toEqual({
      action: "forward",
    });
  });

  it("rejects unknown models", () => {
    const d = clientScopeDecision("nope", schemas);
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.status).toBe(404);
  });

  it("rejects everything when the schema is unavailable (deny by default)", () => {
    const d = clientScopeDecision("ga4", null);
    expect(d.action).toBe("reject");
    if (d.action === "reject") expect(d.status).toBe(502);
  });
});

describe("isModelExplorable", () => {
  it("mirrors the server policy", () => {
    expect(isModelExplorable("ga4", { dimensions: ["client", "date"] })).toBe(true);
    expect(isModelExplorable("blended", { dimensions: ["date"] })).toBe(false);
    expect(isModelExplorable("blended", { dimensions: ["date"] }, ["blended"])).toBe(true);
  });
});

describe("isTimeseries", () => {
  it("is true only when grouped by the time dimension", () => {
    expect(isTimeseries({ dimensions: ["date"], timeDimension: "date" })).toBe(true);
    expect(isTimeseries({ dimensions: ["channel"], timeDimension: "date" })).toBe(false);
    expect(isTimeseries({ dimensions: ["date"], timeDimension: null })).toBe(false);
  });
});

describe("filter (de)serialisation", () => {
  it("round-trips through encode/decode", () => {
    const filters = [
      { field: "channel", value: "Organic" },
      { field: "country", value: "US" },
    ];
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it("survives values with delimiters", () => {
    const filters = [{ field: "channel", value: "a;b:c" }];
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it("decodes empty/garbage safely", () => {
    expect(decodeFilters("")).toEqual([]);
    expect(decodeFilters(null)).toEqual([]);
    expect(decodeFilters("junkwithnokv")).toEqual([]);
  });
});

describe("toggleFilter", () => {
  it("adds a new filter", () => {
    expect(toggleFilter([], "channel", "Organic")).toEqual([
      { field: "channel", value: "Organic" },
    ]);
  });

  it("removes when clicking the active value again", () => {
    const f = [{ field: "channel", value: "Organic" }];
    expect(toggleFilter(f, "channel", "Organic")).toEqual([]);
  });

  it("replaces the value for an already-filtered field", () => {
    const f = [{ field: "channel", value: "Organic" }];
    expect(toggleFilter(f, "channel", "Paid")).toEqual([
      { field: "channel", value: "Paid" },
    ]);
  });
});

describe("filtersFromRow", () => {
  it("applies every field/value pair from a row", () => {
    const next = filtersFromRow([], [
      { field: "channel", value: "Paid" },
      { field: "device", value: "mobile" },
    ]);
    expect(next).toEqual([
      { field: "channel", value: "Paid" },
      { field: "device", value: "mobile" },
    ]);
  });

  it("narrows without toggling off an already-active field", () => {
    const start = [{ field: "channel", value: "Organic" }];
    const next = filtersFromRow(start, [
      { field: "channel", value: "Organic" },
      { field: "device", value: "desktop" },
    ]);
    expect(next).toEqual([
      { field: "channel", value: "Organic" },
      { field: "device", value: "desktop" },
    ]);
  });
});
