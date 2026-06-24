import { NextRequest, NextResponse } from "next/server";

/**
 * Subdomain-based multi-tenancy.
 *
 * acme.dashboards.artform.com/...  ->  rewrite to /client/acme/...
 * The apex / www host falls through to the marketing landing page.
 *
 * This is host-based routing only; the client registry (config/clients.ts) is
 * the source of truth for which subdomains are valid (a 404 is rendered by the
 * page when the subdomain is unknown).
 */
export const config = {
  // Skip Next internals and static assets.
  matcher: ["/((?!_next/|favicon.ico|robots.txt|.*\\..*).*)"],
};

function extractSubdomain(host: string): string | null {
  // Strip port; lower-case.
  const hostname = host.split(":")[0].toLowerCase();

  // Local development: acme.localhost
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    const label = hostname.replace(/\.?localhost$/, "");
    return label.length ? label : null;
  }

  // Vercel preview deploys (*.vercel.app) have no client subdomain.
  if (hostname.endsWith(".vercel.app")) return null;

  const parts = hostname.split(".");
  // Need at least sub.domain.tld to have a subdomain.
  if (parts.length < 3) return null;

  const label = parts[0];
  if (label === "www") return null;
  return label;
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const subdomain = extractSubdomain(host);

  if (!subdomain) return NextResponse.next();

  const url = req.nextUrl.clone();
  // Avoid double-rewriting (and let direct /client/* paths through).
  if (url.pathname.startsWith("/client/")) return NextResponse.next();
  url.pathname = `/client/${subdomain}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}
