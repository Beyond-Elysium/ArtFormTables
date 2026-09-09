/**
 * The ArtForm Intelligence Suite — Arvo, Vantage, Orbit, Pulse — are separate
 * Next.js apps/deployments (see /apps in the repo root), not part of this
 * product. This is just the list ArtForm's own dashboard (/artform) links out
 * to, so the suite is discoverable without hunting for a URL.
 */

export interface SuiteProduct {
  slug: "arvo" | "vantage" | "orbit" | "pulse";
  name: string;
  tagline: string;
  href: string;
  status: "live" | "coming-soon";
}

export const SUITE_PRODUCTS: SuiteProduct[] = [
  {
    slug: "arvo",
    name: "Arvo",
    tagline: "Know if your campaigns are winning before the results come in.",
    href: process.env.ARVO_APP_URL || "http://localhost:3100",
    status: "live",
  },
  {
    slug: "vantage",
    name: "Vantage",
    tagline: "See what's coming before the RFP drops.",
    href: "#",
    status: "coming-soon",
  },
  {
    slug: "orbit",
    name: "Orbit",
    tagline: "One dashboard. Every signal. Every pursuit.",
    href: "#",
    status: "coming-soon",
  },
  {
    slug: "pulse",
    name: "Pulse",
    tagline: "If AI can't find you, neither can your next client.",
    href: "#",
    status: "coming-soon",
  },
];
