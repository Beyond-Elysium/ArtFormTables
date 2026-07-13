import { describe, it, expect } from "vitest";
import { isPlaceholderSiteUrl, isPlaceholderId } from "./placeholder";

describe("isPlaceholderSiteUrl", () => {
  it("flags *.example placeholders", () => {
    expect(isPlaceholderSiteUrl("https://isea.example/")).toBe(true);
    expect(isPlaceholderSiteUrl("https://govconideators.example/")).toBe(true);
    expect(isPlaceholderSiteUrl("sc-domain:foo.example")).toBe(true);
    expect(isPlaceholderSiteUrl(undefined)).toBe(true);
  });
  it("allows real site URLs", () => {
    expect(isPlaceholderSiteUrl("https://artformagency.com/")).toBe(false);
    expect(isPlaceholderSiteUrl("https://www.cisa.gov/")).toBe(false);
    expect(isPlaceholderSiteUrl("sc-domain:maximus.com")).toBe(false);
  });
});

describe("isPlaceholderId", () => {
  it("flags all-zero ids", () => {
    expect(isPlaceholderId("000000014")).toBe(true);
    expect(isPlaceholderId("000-000-0000")).toBe(true);
    expect(isPlaceholderId("")).toBe(true);
    expect(isPlaceholderId(undefined)).toBe(true);
  });
  it("allows real ids", () => {
    expect(isPlaceholderId("310586485")).toBe(false);
    expect(isPlaceholderId("395344759")).toBe(false);
    expect(isPlaceholderId("123-456-7890")).toBe(false);
  });
});
