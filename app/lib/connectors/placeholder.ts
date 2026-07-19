/**
 * Placeholder detection.
 *
 * The client registry ships with placeholder config for sources that aren't
 * wired to a real account yet (e.g. `siteUrl: "https://foo.example/"`, an
 * all-zero GA4 property id, a `000-000-0000` Ads customer id). Those values
 * can never resolve live — a live fetch just wastes an API round-trip and logs
 * a guaranteed 403/404. Connectors call these guards to serve mock data
 * directly for placeholder config, even when credentials are present.
 */
import "server-only";

/** A `*.example` host (RFC 2606 reserved TLD) is never a real property. */
export function isPlaceholderSiteUrl(siteUrl: string | undefined): boolean {
  if (!siteUrl) return true;
  const host = siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "");
  return /(^|\.)example(\/|$|:)/i.test(host) || /\.(example|test|invalid|localhost)(\/|$)/i.test(host);
}

/**
 * A GA4 property id / Ads customer id with a leading zero is a placeholder:
 * real ids are assigned without leading zeros, so the registry's fillers
 * ("000000014", "000-000-0000") all start with 0. Empty counts too.
 */
export function isPlaceholderId(id: string | undefined): boolean {
  if (!id) return true;
  const d = id.replace(/\D/g, "");
  return d === "" || d.startsWith("0");
}

/**
 * The registry's filler LinkedIn sponsored-account ids are sequential
 * "5000000xx" values (500000000–500000006 today). Real LinkedIn account ids
 * are effectively arbitrary, so we only flag that exact filler block (plus
 * anything isPlaceholderId already catches, e.g. leading zeros / empty).
 */
export function isPlaceholderAccountId(id: string | undefined): boolean {
  if (isPlaceholderId(id)) return true;
  return /^5000000\d{2}$/.test(id!.replace(/\D/g, ""));
}
