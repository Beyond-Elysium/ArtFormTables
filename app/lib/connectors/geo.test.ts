import { describe, it, expect } from "vitest";
import { allUsStateCodes, usStateCode } from "./geo";

describe("usStateCode", () => {
  it("maps GA4 region names to ISO 3166-2 codes", () => {
    expect(usStateCode("Virginia")).toBe("US-VA");
    expect(usStateCode("California")).toBe("US-CA");
    expect(usStateCode("District of Columbia")).toBe("US-DC");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(usStateCode("  new york  ")).toBe("US-NY");
    expect(usStateCode("NEW MEXICO")).toBe("US-NM");
  });

  // GA4's `region` dimension emits plenty the US map has no region for.
  it("returns undefined for territories, unset values and non-states", () => {
    expect(usStateCode("Puerto Rico")).toBeUndefined();
    expect(usStateCode("Guam")).toBeUndefined();
    expect(usStateCode("(not set)")).toBeUndefined();
    expect(usStateCode("Ontario")).toBeUndefined();
    expect(usStateCode(undefined)).toBeUndefined();
    expect(usStateCode("")).toBeUndefined();
  });
});

describe("allUsStateCodes", () => {
  it("covers the 50 states plus DC", () => {
    const codes = allUsStateCodes();
    expect(codes).toHaveLength(51);
    expect(new Set(codes).size).toBe(51);
    expect(codes.every((c) => /^US-[A-Z]{2}$/.test(c))).toBe(true);
  });
});
