import { describe, expect, it } from "vitest";
import {
  chartPalette,
  clampLabel,
  mixHex,
  seriesColors,
  shade,
  tint,
  withAlpha,
} from "./chartPalette";

const BRAND = { primary: "#426fb6", accent: "#e41679" };

describe("mixHex / tint / shade", () => {
  it("mixes linearly between the endpoints", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("tint moves toward white, shade toward black", () => {
    expect(tint("#426fb6", 1)).toBe("#ffffff");
    expect(shade("#426fb6", 1)).toBe("#000000");
    expect(shade("#426fb6", 0.35)).toBe("#2b4876");
    expect(tint("#e41679", 0.45)).toBe("#f07fb5");
  });

  it("withAlpha produces an rgba() string", () => {
    expect(withAlpha("#426fb6", 0.65)).toBe("rgba(66, 111, 182, 0.65)");
  });
});

describe("chartPalette", () => {
  it("yields 8 distinct colors for the default brand", () => {
    const p = chartPalette(BRAND);
    expect(p).toHaveLength(8);
    expect(new Set(p).size).toBe(8);
  });

  it("starts with the brand colors", () => {
    const p = chartPalette(BRAND);
    expect(p[0]).toBe(BRAND.primary);
    expect(p[1]).toBe(BRAND.accent);
  });

  it("derives valid hex colors throughout", () => {
    for (const c of chartPalette(BRAND)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("seriesColors", () => {
  const palette = chartPalette(BRAND);

  it("assigns palette slots in order to solid series", () => {
    const colors = seriesColors(
      [{ name: "Users" }, { name: "Sessions" }],
      palette,
    );
    expect(colors).toEqual([palette[0], palette[1]]);
  });

  it("pairs a dashed '(prev)' series with its primary's color", () => {
    const colors = seriesColors(
      [
        { name: "Users" },
        { name: "Sessions" },
        { name: "Users (prev)", dashed: true },
        { name: "Sessions (prev)", dashed: true },
      ],
      palette,
    );
    expect(colors[2]).toBe(withAlpha(palette[0], 0.65)); // pairs with Users
    expect(colors[3]).toBe(withAlpha(palette[1], 0.65)); // pairs with Sessions
  });

  it("does not let dashed series consume primary slots", () => {
    const colors = seriesColors(
      [
        { name: "Users" },
        { name: "Users (prev)", dashed: true },
        { name: "Sessions" },
      ],
      palette,
    );
    // Sessions still gets the second slot even though the overlay sits between.
    expect(colors[2]).toBe(palette[1]);
  });

  it("falls back to a fresh slot for a dashed series with no primary", () => {
    const colors = seriesColors(
      [{ name: "Users" }, { name: "Orphan (prev)", dashed: true }],
      palette,
    );
    expect(colors[1]).toBe(withAlpha(palette[1], 0.65));
  });
});

describe("clampLabel", () => {
  it("returns short labels unchanged", () => {
    expect(clampLabel("Organic Search")).toBe("Organic Search");
  });

  it("clamps long labels to ~28 chars with an ellipsis", () => {
    const long = "/collections/spring-2026-newsletter-signups-landing";
    const out = clampLabel(long);
    expect(out.length).toBeLessThanOrEqual(28);
    expect(out.endsWith("…")).toBe(true);
  });

  it("respects a custom max", () => {
    expect(clampLabel("abcdefghij", 5)).toBe("abcd…");
  });
});
