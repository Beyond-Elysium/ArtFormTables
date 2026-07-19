/**
 * Pure chart-color helpers for the ApexCharts wrappers.
 *
 * Framework-free (no React, no Apex) so the color science is unit-testable:
 * - `chartPalette` derives 8 distinct brand colors (tints/shades of the four
 *   ArtForm hues) — enough for the busiest donut without cycling.
 * - `seriesColors` pairs comparison overlays ("Users (prev)") with their
 *   primary series' color so dashed lines visually belong to their solid line.
 * - `clampLabel` shortens long horizontal-bar categories (full text lives in
 *   the tooltip).
 *
 * The 8-slot default-brand palette was checked with a CVD-separation validator:
 * every adjacent pair keeps ΔE ≥ 10 under protan/deutan/tritan simulation and
 * ≥ 22 for normal vision, and legend/label text always renders in ink on white
 * (AA) — the light slots (sky, pink tint) never carry text.
 */

const SKY = "#98d7eb";
const INK = "#333333";

/** Linear mix of two #rrggbb colors; t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Lighten toward white by `amount` (0..1). */
export function tint(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount);
}

/** Darken toward black by `amount` (0..1). */
export function shade(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}

/** #rrggbb → rgba() string (Apex accepts any CSS color). */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function parseHex(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

/**
 * 8 distinct brand-derived colors. Ordered so adjacent donut slices stay
 * distinguishable: the four brand hues first, then alternating light/dark
 * derivations (pink tint, navy shade, sky shade, pink shade).
 */
export function chartPalette(brand: { primary: string; accent: string }): string[] {
  return [
    brand.primary, // brand blue      #426fb6
    brand.accent, //  brand pink      #e41679
    SKY, //           brand sky       #98d7eb
    INK, //           brand ink       #333333
    tint(brand.accent, 0.45), // light pink   #f07fb5
    shade(brand.primary, 0.35), // dark navy  #2b4876
    shade(SKY, 0.35), //           slate teal #638c99
    shade(brand.accent, 0.3), //   deep pink  #a00f55
  ];
}

/** Comparison overlays are appended with this suffix (see lib/connectors). */
export const PREV_SUFFIX = " (prev)";

/** Opacity applied to dashed comparison lines (dash + opacity differentiate). */
export const PREV_ALPHA = 0.65;

/**
 * One color per series, in order. Primary (solid) series take palette slots in
 * sequence; a dashed series named "<primary> (prev)" reuses its primary's color
 * at reduced opacity, so overlay lines pair visually with their solid line.
 * A dashed series with no matching primary falls back to the next free slot.
 */
export function seriesColors(
  series: { name: string; dashed?: boolean }[],
  palette: string[],
): string[] {
  const primaryColor = new Map<string, string>();
  let slot = 0;
  const nextSlot = () => palette[slot++ % palette.length];

  // First pass: solid series claim slots in order.
  const solid = series.map((s) => {
    if (s.dashed) return null;
    const color = nextSlot();
    if (!primaryColor.has(s.name)) primaryColor.set(s.name, color);
    return color;
  });

  // Second pass: dashed series pair by name prefix (before " (prev)").
  return series.map((s, i) => {
    if (!s.dashed) return solid[i] as string;
    const base = s.name.endsWith(PREV_SUFFIX)
      ? s.name.slice(0, -PREV_SUFFIX.length)
      : s.name;
    const paired = primaryColor.get(base) ?? nextSlot();
    return withAlpha(paired, PREV_ALPHA);
  });
}

/** Clamp a category label to `max` chars with an ellipsis (default ~28). */
export function clampLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1).trimEnd()}…`;
}
