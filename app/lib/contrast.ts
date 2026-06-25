/** Color contrast helpers (WCAG relative luminance). Pure, client-safe. */

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Relative luminance (0 = black, 1 = white) of a #rrggbb color. */
export function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Returns a near-black or white foreground that meets contrast against the
 * given background — so a badge/nav painted with any brand color stays legible.
 */
export function readableTextColor(bgHex: string): string {
  return luminance(bgHex) > 0.45 ? "#1a1a1a" : "#ffffff";
}
