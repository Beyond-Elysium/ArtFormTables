/**
 * Shared HTTP client for connector live paths.
 *
 * ofetch gives every connector timeouts + retries with backoff for free, so a
 * single slow or flaky provider can't hang a client's dashboard. `fetchJson`
 * additionally validates the response with a zod schema, turning an unexpected
 * payload shape into a clean error (which the connector catches and falls back
 * to mock) instead of a downstream `undefined`/`NaN`.
 */
import "server-only";
import { ofetch } from "ofetch";
import type { ZodType } from "zod";

export const http = ofetch.create({
  // Retry idempotent reads a couple of times on transient failures.
  retry: 2,
  retryDelay: 300, // ms, backed off by ofetch
  retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  timeout: 10_000, // ms
});

/** Fetch JSON and validate it against a zod schema. Throws on a bad shape. */
export async function fetchJson<T>(
  schema: ZodType<T>,
  url: string,
  opts?: Parameters<typeof http>[1],
): Promise<T> {
  const data = await http(url, { ...opts, responseType: "json" });
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Unexpected response from ${url}: ${parsed.error.message}`);
  }
  return parsed.data;
}
