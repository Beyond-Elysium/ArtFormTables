import { describe, it, expect } from "vitest";
import {
  MAP_STEPS,
  bucketRanges,
  bucketRegions,
  contrastRatio,
  mapHue,
  oklabLightness,
  rampScale,
  sequentialRamp,
  stepKey,
} from "./mapScale";
import { clients } from "@/config/clients";

/**
 * The four invariants a sequential (ordinal) ramp must hold, mirroring the
 * dataviz guidance's `validateOrdinal` checks. Encoded here so CI catches a
 * regression in the ramp math — or a new client brand colour that the ramp
 * can't build a legible scale from.
 */
function assertOrdinalRamp(ramp: string[], surface = "#ffffff") {
  const ls = ramp.map(oklabLightness);

  // 1. Monotone lightness (light → dark).
  for (let i = 1; i < ls.length; i++) {
    expect(ls[i]).toBeLessThan(ls[i - 1]);
  }

  // 2. Adjacent steps visibly distinct (the validator's floor is 0.06).
  for (let i = 1; i < ls.length; i++) {
    expect(ls[i - 1] - ls[i]).toBeGreaterThanOrEqual(0.06);
  }

  // 3. The palest step still reads against the card behind it.
  expect(contrastRatio(ramp[0], surface)).toBeGreaterThanOrEqual(2);

  // 4. Single hue — no categorical hue jump along the ramp.
  const hues = ramp.map((hex) => {
    const m = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
    return (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
  });
  const spread = Math.max(...hues) - Math.min(...hues);
  expect(Math.min(spread, 360 - spread)).toBeLessThanOrEqual(40);
}

describe("sequentialRamp", () => {
  it("holds the ordinal-ramp invariants for the default brand", () => {
    assertOrdinalRamp(sequentialRamp({ primary: "#426fb6", accent: "#e41679" }));
  });

  // The real guard: every brand actually in the registry must produce a legible
  // ramp, including the several whose `primary` is near-achromatic ink.
  it.each(clients.map((c) => [c.slug, c.brand?.primary ?? "#426fb6", c.brand?.accent ?? "#e41679"]))(
    "holds the invariants for client %s",
    (_slug, primary, accent) => {
      assertOrdinalRamp(sequentialRamp({ primary, accent }));
    },
  );

  it("falls back off a near-achromatic primary to the accent hue", () => {
    expect(mapHue({ primary: "#333333", accent: "#e41679" })).toBe("#e41679");
    expect(mapHue({ primary: "#426fb6", accent: "#e41679" })).toBe("#426fb6");
  });

  it("falls back to brand blue when neither brand colour has chroma", () => {
    expect(mapHue({ primary: "#333333", accent: "#ffffff" })).toBe("#426fb6");
  });

  it("returns the requested number of steps", () => {
    expect(sequentialRamp({ primary: "#426fb6", accent: "#e41679" }, 7)).toHaveLength(7);
    expect(sequentialRamp({ primary: "#426fb6", accent: "#e41679" }, 1)).toHaveLength(1);
  });
});

describe("rampScale", () => {
  it("keys colours by step name for jsvectormap's ordinal scale", () => {
    expect(rampScale(["#111111", "#222222"])).toEqual({ step1: "#111111", step2: "#222222" });
  });
});

describe("bucketRegions", () => {
  const rows = [
    { code: "US", label: "United States", value: 1000 },
    { code: "GB", label: "United Kingdom", value: 400 },
    { code: "DE", label: "Germany", value: 10 },
  ];

  it("puts the largest value in the darkest step", () => {
    expect(bucketRegions(rows, 5).US).toBe(stepKey(MAP_STEPS - 1));
  });

  it("scales the rest by share of the max", () => {
    // 400/1000 = 40% → step 2 of 5.
    expect(bucketRegions(rows, 5).GB).toBe("step2");
    // 10/1000 = 1% → palest step.
    expect(bucketRegions(rows, 5).DE).toBe("step1");
  });

  it("leaves zero-value regions unmapped so 'none' differs from 'a few'", () => {
    const out = bucketRegions([...rows, { code: "FR", label: "France", value: 0 }], 5);
    expect(out.FR).toBeUndefined();
    expect(out.DE).toBe("step1");
  });

  it("returns nothing when every value is zero", () => {
    expect(bucketRegions([{ code: "US", label: "US", value: 0 }])).toEqual({});
  });

  it("ignores rows with no region code", () => {
    expect(bucketRegions([{ code: "", label: "(not set)", value: 50 }])).toEqual({});
  });
});

describe("bucketRanges", () => {
  it("reports each step's upper bound for the legend", () => {
    const ranges = bucketRanges([{ code: "US", label: "US", value: 100 }], 5);
    expect(ranges).toEqual([20, 40, 60, 80, 100]);
  });
});
