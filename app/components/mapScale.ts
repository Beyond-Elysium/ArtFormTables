/**
 * Pure color/bucketing helpers for choropleth map panels.
 *
 * Framework-free (no React, no jsvectormap) so the logic is unit-testable,
 * same convention as chartPalette.ts.
 *
 * Two jobs:
 *  - `sequentialRamp` builds the light→dark single-hue ramp a magnitude map
 *    needs. (Categorical hues would be wrong here: a map encodes *how much*,
 *    not *which one*.)
 *  - `bucketRegions` turns raw values into ordinal step keys, because
 *    jsvectormap 1.x has **no continuous scale** — its `OrdinalScale.getValue`
 *    is a plain `scale[value]` lookup, so `series.regions[].values` must map a
 *    region code to a *scale key name*, not a number.
 *
 * The ramp is built to satisfy four invariants (asserted in mapScale.test.ts):
 * monotone lightness, a visible gap between adjacent steps, a palest step that
 * still reads against a white card, and a single hue end to end. Steps are
 * therefore spaced by **OKLab lightness**, not by a linear RGB blend — an even
 * RGB blend produces uneven perceptual gaps (badly so on saturated hues like
 * the brand pink, whose dark end compresses), which is exactly what the
 * adjacent-gap invariant catches.
 */
import { mixHex, shade, tint } from "./chartPalette";

/** Number of steps in a map's color ramp (and its legend). */
export const MAP_STEPS = 5;

/** Fill for regions with no data — neutral, and distinct from the palest step. */
export const MAP_EMPTY_FILL = "#eef0f2";

/** Minimum OKLab-lightness gap between adjacent steps (the ramp's step size). */
const MIN_STEP_GAP = 0.078;

/** Minimum contrast the palest step must keep against the card behind it. */
const LIGHT_END_MIN_CONTRAST = 2.05;

/** ArtForm brand blue — the fallback hue when a brand has no chromatic color. */
const FALLBACK_HUE = "#426fb6";

function channels(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

/** Rough sRGB saturation (0..1): 0 for grays/black/white. */
function saturation(hex: string): number {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** OKLab lightness (0..1) — perceptual, unlike raw RGB or WCAG luminance. */
export function oklabLightness(hex: string): number {
  const [R, G, B] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** WCAG relative luminance. */
function relativeLuminance(hex: string): number {
  const [R, G, B] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio between two colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * One monotonic "darkening" axis through a hue: k<0 tints toward white, k=0 is
 * the hue itself, k>0 shades toward black. Lets a single search cover pale
 * hues (whose ramp must *start* below the pure hue) and dark ones alike.
 */
function atDarkness(hue: string, k: number): string {
  return k < 0 ? tint(hue, -k) : shade(hue, k);
}

const K_MIN = -0.95;
const K_MAX = 0.9;

/** The lightest point on the axis still clearing `minContrast` vs `surface`. */
function lightestPassing(hue: string, surface: string, minContrast: number): number | null {
  if (contrastRatio(atDarkness(hue, K_MAX), surface) < minContrast) return null;
  let lo = K_MIN;
  let hi = K_MAX;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(atDarkness(hue, mid), surface) >= minContrast) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The point on the axis whose OKLab lightness is closest to `target`. */
function darknessForLightness(hue: string, target: number, lo: number, hi: number): number {
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (oklabLightness(atDarkness(hue, mid)) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The single hue a map ramp is built from.
 *
 * A sequential ramp must be one hue — but a brand's `primary` isn't always
 * chromatic enough to make one (several clients here use ink `#333333` as
 * primary, which would yield a gray ramp that reads as "disabled" rather than
 * as data). So: prefer primary, fall back to accent when primary is
 * near-achromatic, and to brand blue if neither has any chroma.
 */
export function mapHue(brand: { primary: string; accent: string }): string {
  if (saturation(brand.primary) >= 0.25) return brand.primary;
  if (saturation(brand.accent) >= 0.25) return brand.accent;
  return FALLBACK_HUE;
}

/**
 * `steps` colors, light→dark, in one hue derived from the brand.
 *
 * Spans only as much lightness as the step gaps require rather than the whole
 * available range — running to the floor would end the ramp at near-black,
 * where the hue (and with it the sense that the map is "brand blue") is lost.
 */
export function sequentialRamp(
  brand: { primary: string; accent: string },
  steps: number = MAP_STEPS,
  surface = "#ffffff",
): string[] {
  const hue = mapHue(brand);
  const kLight = lightestPassing(hue, surface, LIGHT_END_MIN_CONTRAST) ?? 0;
  if (steps <= 1) return [atDarkness(hue, kLight)];

  const lightestL = oklabLightness(atDarkness(hue, kLight));
  const darkestL = oklabLightness(atDarkness(hue, K_MAX));
  const span = Math.min(Math.max(0, lightestL - darkestL), (steps - 1) * MIN_STEP_GAP);

  return Array.from({ length: steps }, (_, i) => {
    const target = lightestL - span * (i / (steps - 1));
    return atDarkness(hue, darknessForLightness(hue, target, kLight, K_MAX));
  });
}

/** The scale key for step `i` — jsvectormap looks values up by these names. */
export function stepKey(i: number): string {
  return `step${i + 1}`;
}

/** `{ step1: color, … }` — the `scale` object jsvectormap's OrdinalScale needs. */
export function rampScale(ramp: string[]): Record<string, string> {
  return Object.fromEntries(ramp.map((color, i) => [stepKey(i), color]));
}

export interface MapRow {
  code: string;
  label: string;
  value: number;
}

/**
 * Assign each row a ramp step, linearly by share of the largest value.
 *
 * Linear-on-max (rather than quantile) is deliberate: it keeps the map
 * *honest* about a dominant region. Web analytics geography is usually
 * one-region-dominant, and quantile buckets would inflate a long tail of
 * near-zero regions into mid-tones that imply traffic that isn't there. The
 * legend (see `bucketRanges`) states the ranges so the encoding stays readable.
 *
 * Zero/negative values get no step at all (left as the "no data" fill) rather
 * than the palest step, so "nobody visited" and "a few visited" stay distinct.
 */
export function bucketRegions(rows: MapRow[], steps: number = MAP_STEPS): Record<string, string> {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (max <= 0) return {};
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!(r.value > 0) || !r.code) continue;
    // share ∈ (0,1] → index 0..steps-1; the largest value lands in the darkest.
    const idx = Math.min(steps - 1, Math.ceil((r.value / max) * steps) - 1);
    out[r.code] = stepKey(Math.max(0, idx));
  }
  return out;
}

/**
 * Inclusive upper bound of each step, for the legend — step `i` covers values
 * up to `max * (i+1)/steps`.
 */
export function bucketRanges(rows: MapRow[], steps: number = MAP_STEPS): number[] {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return Array.from({ length: steps }, (_, i) => (max * (i + 1)) / steps);
}
