/**
 * The ArtForm Intelligence Suite — Arvo, Vantage, Orbit, Pulse — are separate
 * Next.js apps/deployments (see /apps in the repo root), not part of this
 * product. This is just the list ArtForm's own dashboard (/artform) links out
 * to, so the suite is discoverable without hunting for a URL.
 *
 * Each href falls back to that app's local dev port when its *_APP_URL env
 * var is unset, so this renders something clickable in dev with no config.
 * In production, set the matching env var in this project (app/)'s Vercel
 * settings to that app's real deployed URL — see each app's own README,
 * "Deploying to Vercel" section, for the exact steps.
 *
 * Orbit and Pulse have no app behind them yet (no code under /apps at all) —
 * their links are placeholders until those products are actually built.
 */

export interface SuiteProduct {
  slug: "arvo" | "vantage" | "orbit" | "pulse";
  name: string;
  tagline: string;
  href: string;
}

export const SUITE_PRODUCTS: SuiteProduct[] = [
  {
    slug: "arvo",
    name: "Arvo",
    tagline: "Know if your campaigns are winning before the results come in.",
    href: process.env.ARVO_APP_URL || "http://localhost:3100",
  },
  {
    slug: "vantage",
    name: "Vantage",
    tagline: "See what's coming before the RFP drops.",
    href: process.env.VANTAGE_APP_URL || "http://localhost:3200",
  },
  {
    slug: "orbit",
    name: "Orbit",
    tagline: "One dashboard. Every signal. Every pursuit.",
    href: process.env.ORBIT_APP_URL || "http://localhost:3300",
  },
  {
    slug: "pulse",
    name: "Pulse",
    tagline: "If AI can't find you, neither can your next client.",
    href: process.env.PULSE_APP_URL || "http://localhost:3400",
  },
];
