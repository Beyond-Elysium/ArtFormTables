import { describe, expect, it } from "vitest";
import { forceClientFilter } from "@/lib/explore";
import {
  buildNlqSchema,
  buildSystemPrompt,
  explainQuery,
  extractJson,
  toSemanticQuery,
  type NlqQuery,
} from "./translate";

const schemas = {
  ga4: {
    dimensions: ["client", "date", "channel", "device"],
    measures: ["users", "sessions", "revenue"],
    time_dimension: "date",
  },
  ai: {
    dimensions: ["client", "date"],
    measures: ["ai_sessions", "total_sessions"],
    time_dimension: "date",
  },
};

const valid = {
  model: "ga4",
  dimensions: ["channel"],
  measures: ["users"],
  filters: [{ field: "device", op: "=", value: "mobile" }],
  time_range: { start: "2026-04-01", end: "2026-06-30" },
  order_by: [["users", "desc"]],
  limit: 10,
};

describe("buildNlqSchema (strict validation against live schemas)", () => {
  const schema = buildNlqSchema(schemas);

  it("accepts a well-formed query", () => {
    const r = schema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("fills defaults for omitted optional keys", () => {
    const r = schema.safeParse({ model: "ga4", measures: ["users"] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dimensions).toEqual([]);
      expect(r.data.filters).toEqual([]);
      expect(r.data.time_range).toBeNull();
      expect(r.data.limit).toBeNull();
    }
  });

  it("rejects unknown models", () => {
    expect(schema.safeParse({ ...valid, model: "billing" }).success).toBe(false);
  });

  it("rejects unknown dimensions, measures, filter and order fields", () => {
    expect(schema.safeParse({ ...valid, dimensions: ["nope"] }).success).toBe(false);
    expect(schema.safeParse({ ...valid, measures: ["nope"] }).success).toBe(false);
    expect(
      schema.safeParse({ ...valid, filters: [{ field: "nope", value: 1 }] }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...valid, order_by: [["nope", "desc"]] }).success).toBe(false);
  });

  it("rejects fields that belong to a different model", () => {
    // ai_sessions is an 'ai' measure, not a 'ga4' one.
    expect(schema.safeParse({ ...valid, measures: ["ai_sessions"] }).success).toBe(false);
  });

  it("rejects unknown keys, bad ops, bad dates and out-of-range limits", () => {
    expect(schema.safeParse({ ...valid, sql: "DROP TABLE" }).success).toBe(false);
    expect(
      schema.safeParse({ ...valid, filters: [{ field: "device", op: "like", value: "m" }] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...valid, time_range: { start: "last week" } }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...valid, limit: 10_000 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, limit: 0 }).success).toBe(false);
  });

  it("rejects a query that selects nothing", () => {
    expect(
      schema.safeParse({ model: "ga4", dimensions: [], measures: [] }).success,
    ).toBe(false);
  });
});

describe("toSemanticQuery + client-filter forcing (chunk 22 parity)", () => {
  const schema = buildNlqSchema(schemas);

  it("maps the wire shape to SemanticQuery", () => {
    const parsed = schema.parse(valid) as NlqQuery;
    const q = toSemanticQuery(parsed);
    expect(q).toEqual({
      model: "ga4",
      dimensions: ["channel"],
      measures: ["users"],
      filters: [{ field: "device", op: "=", value: "mobile" }],
      timeRange: { start: "2026-04-01", end: "2026-06-30" },
      orderBy: [["users", "desc"]],
      limit: 10,
    });
  });

  it("defaults the limit to 500 when Claude omits it", () => {
    const parsed = schema.parse({ model: "ga4", measures: ["users"] }) as NlqQuery;
    expect(toSemanticQuery(parsed).limit).toBe(500);
  });

  it("overwrites any Claude-generated client filter with the page's slug", () => {
    const parsed = schema.parse({
      ...valid,
      filters: [
        { field: "client", op: "=", value: "some-other-client" },
        { field: "device", op: "=", value: "mobile" },
      ],
    }) as NlqQuery;
    const forced = forceClientFilter(toSemanticQuery(parsed), "acme");
    expect(forced.filters).toEqual([
      { field: "device", op: "=", value: "mobile" },
      { field: "client", op: "=", value: "acme" },
    ]);
  });

  it("appends the client filter when Claude generated none", () => {
    const parsed = schema.parse(valid) as NlqQuery;
    const forced = forceClientFilter(toSemanticQuery(parsed), "acme");
    expect(forced.filters?.at(-1)).toEqual({ field: "client", op: "=", value: "acme" });
  });
});

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson('{"model":"ga4"}')).toEqual({ model: "ga4" });
  });

  it("strips code fences", () => {
    expect(extractJson('```json\n{"model":"ga4"}\n```')).toEqual({ model: "ga4" });
  });

  it("recovers a JSON object wrapped in prose", () => {
    expect(extractJson('Here you go: {"model":"ga4"} — enjoy!')).toEqual({ model: "ga4" });
  });

  it("returns null for garbage", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("")).toBeNull();
  });
});

describe("buildSystemPrompt", () => {
  it("embeds every model, its fields, and today's date", () => {
    const p = buildSystemPrompt(schemas, "2026-07-20");
    expect(p).toContain('model "ga4"');
    expect(p).toContain('model "ai"');
    expect(p).toContain("ai_sessions");
    expect(p).toContain("2026-07-20");
    expect(p).toContain("ONLY a JSON object");
  });
});

describe("explainQuery", () => {
  it("describes the query without exposing the client scope filter", () => {
    const text = explainQuery({
      model: "ga4",
      dimensions: ["channel"],
      measures: ["users"],
      filters: [
        { field: "device", op: "=", value: "mobile" },
        { field: "client", op: "=", value: "acme" },
      ],
      timeRange: { start: "2026-04-01", end: "2026-06-30" },
    });
    expect(text.toLowerCase()).toContain("users");
    expect(text).toContain("2026-04-01");
    expect(text).not.toContain("acme");
  });
});
