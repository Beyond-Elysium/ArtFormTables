/**
 * Client registry — the single source of truth for which clients exist, what
 * subdomain they live on, which GA4 property feeds their dashboard, and any
 * per-client brand overrides.
 *
 * Add a client = add an entry here (+ point its subdomain at the app in DNS).
 * No database needed for the MVP.
 */

export interface ClientBrand {
  /** Primary action colour. Defaults to ArtForm Brand Blue. */
  primary?: string;
  /** Accent colour (charts, highlights). Defaults to ArtForm Brand Pink. */
  accent?: string;
  /** Optional logo URL shown in the navbar; falls back to the client name. */
  logo?: string;
}

export interface Client {
  /** Subdomain label, e.g. "acme" for acme.dashboards.artform.com. */
  subdomain: string;
  /** Display name shown in the dashboard header. */
  name: string;
  /** GA4 property id, numeric (e.g. "123456789"). */
  ga4PropertyId: string;
  brand?: ClientBrand;
}

export const clients: Client[] = [
  {
    subdomain: "acme",
    name: "Acme Corporation",
    ga4PropertyId: "000000001",
    brand: { primary: "#426fb6", accent: "#e41679" },
  },
  {
    subdomain: "globex",
    name: "Globex",
    ga4PropertyId: "000000002",
    brand: { primary: "#0ca678", accent: "#f15e4d" },
  },
  {
    subdomain: "initech",
    name: "Initech",
    ga4PropertyId: "000000003",
    brand: { primary: "#333333", accent: "#98d7eb" },
  },
];

export function getClientBySubdomain(subdomain: string): Client | undefined {
  return clients.find((c) => c.subdomain === subdomain.toLowerCase());
}
