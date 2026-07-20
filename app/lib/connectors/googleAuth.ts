/**
 * Shared Google auth for connectors that use the agency's Google credentials
 * (GA4, Search Console, Google Sheets). Supports two methods, preferring OAuth
 * when present:
 *
 *   - OAuth Web client: GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REFRESH_TOKEN.
 *     The refresh token carries the scopes granted at consent — grant every
 *     scope the connectors need when minting it:
 *       https://www.googleapis.com/auth/analytics.readonly
 *       https://www.googleapis.com/auth/webmasters.readonly
 *       https://www.googleapis.com/auth/spreadsheets.readonly  (gsheets)
 *   - Service account: GA_SERVICE_ACCOUNT_KEY (raw or base64 JSON). Scopes are
 *     requested per call via `googleAccessToken(scopes)`.
 */
import "server-only";
import { GoogleAuth, OAuth2Client } from "google-auth-library";

/* ------------------------------- OAuth ---------------------------------- */

export function hasOAuth(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

let oauthClient: OAuth2Client | null = null;

/** A configured OAuth2 client (auto-refreshes access tokens). */
export function googleOAuthClient(): OAuth2Client {
  if (oauthClient) return oauthClient;
  const client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  oauthClient = client;
  return client;
}

/* --------------------------- Service account ---------------------------- */

export function hasServiceAccount(): boolean {
  return Boolean(process.env.GA_SERVICE_ACCOUNT_KEY);
}

export function serviceAccountJson(): {
  client_email: string;
  private_key: string;
  project_id?: string;
} {
  const raw = process.env.GA_SERVICE_ACCOUNT_KEY!.trim();
  // Accept either raw JSON or base64-encoded JSON, so it works however the key
  // was pasted into the env var.
  const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const json = JSON.parse(text);
  // Vercel sometimes stores the PEM with literal "\n"; normalise to real newlines.
  if (typeof json.private_key === "string") {
    json.private_key = json.private_key.replace(/\\n/g, "\n");
  }
  return json;
}

/* ------------------------------- Shared --------------------------------- */

/** True when any Google credential (OAuth or service account) is configured. */
export function hasGoogleAuth(): boolean {
  return hasOAuth() || hasServiceAccount();
}

/** Which method is active, for diagnostics. */
export function googleAuthMethod(): "oauth" | "service-account" | "none" {
  if (hasOAuth()) return "oauth";
  if (hasServiceAccount()) return "service-account";
  return "none";
}

const authCache = new Map<string, GoogleAuth>();

function serviceAccountAuth(scopes: string[]): GoogleAuth {
  const key = scopes.join(" ");
  let auth = authCache.get(key);
  if (!auth) {
    const json = serviceAccountJson();
    auth = new GoogleAuth({
      credentials: { client_email: json.client_email, private_key: json.private_key },
      scopes,
    });
    authCache.set(key, auth);
  }
  return auth;
}

/**
 * An access token for the given scopes (REST connectors). Uses OAuth when
 * configured (scopes come from the refresh token's grant), else the service
 * account. Throws if neither is configured.
 */
export async function googleAccessToken(scopes: string[]): Promise<string> {
  if (hasOAuth()) {
    const { token } = await googleOAuthClient().getAccessToken();
    if (!token) throw new Error("Failed to obtain Google OAuth access token");
    return token;
  }
  const client = await serviceAccountAuth(scopes).getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain Google access token");
  return token.token;
}
