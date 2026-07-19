import { describe, it, expect } from "vitest";
import { isPlaceholderSiteUrl, isPlaceholderId, isPlaceholderAccountId } from "./placeholder";

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

describe("isPlaceholderAccountId", () => {
  it("flags the registry's 5000000xx LinkedIn filler block", () => {
    expect(isPlaceholderAccountId("500000000")).toBe(true);
    expect(isPlaceholderAccountId("500000003")).toBe(true);
    expect(isPlaceholderAccountId("500000006")).toBe(true);
    expect(isPlaceholderAccountId("500000099")).toBe(true);
  });
  it("also flags everything isPlaceholderId flags", () => {
    expect(isPlaceholderAccountId("00000")).toBe(true);
    expect(isPlaceholderAccountId("")).toBe(true);
    expect(isPlaceholderAccountId(undefined)).toBe(true);
  });
  it("allows real account ids", () => {
    expect(isPlaceholderAccountId("512345678")).toBe(false); // outside the filler block
    expect(isPlaceholderAccountId("500000100")).toBe(false);
    expect(isPlaceholderAccountId("98765432")).toBe(false);
  });
});
