import { describe, expect, it } from "vitest";
import { formatValue, formatDelta, formatCompact, formatDuration } from "./format";

describe("formatValue", () => {
  it("formats each StatFormat", () => {
    expect(formatValue(1234, "number")).toBe("1,234");
    expect(formatValue(12345, "compact")).toBe("12.3K");
    expect(formatValue(0.611, "percent")).toBe("61.1%");
    expect(formatValue(3.14159, "decimal")).toBe("3.1");
    expect(formatValue(1500, "currency", "USD")).toBe("$1,500");
    expect(formatValue(125, "duration")).toBe("2m 05s");
  });

  it("respects the currency code", () => {
    expect(formatValue(1000, "currency", "EUR")).toBe("€1,000");
  });
});

describe("formatDelta", () => {
  it("signs and rounds", () => {
    expect(formatDelta(7.14)).toEqual({ label: "+7.1%", positive: true });
    expect(formatDelta(-12.3)).toEqual({ label: "-12.3%", positive: false });
    expect(formatDelta(0)).toEqual({ label: "+0.0%", positive: true });
  });
});

describe("formatCompact / formatDuration", () => {
  it("compacts large numbers", () => {
    expect(formatCompact(1_500_000)).toBe("1.5M");
  });
  it("pads seconds", () => {
    expect(formatDuration(65)).toBe("1m 05s");
  });
});
