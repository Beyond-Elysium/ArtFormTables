import type { MetadataRoute } from "next";

/**
 * Client dashboards are public-by-URL by design (unlisted), but nothing on
 * this app should ever appear in a search index. Belt-and-braces with the
 * per-page robots metadata and the X-Robots-Tag header (next.config.mjs).
 *
 * The PDF renderer is unaffected: headless Chromium fetches pages directly
 * with ?print=1 and does not consult robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
