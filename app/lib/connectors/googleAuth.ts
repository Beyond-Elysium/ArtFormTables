/**
 * Shared Google auth for connectors that use the agency service account
 * (GA4, Search Console). Returns OAuth2 access tokens for arbitrary Google
 * REST APIs given the right scope — this is how new Google services get wired
 * up without adding heavyweight client libraries.
 */
import "server-only";
import { GoogleAuth } from "google-auth-library";

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

const authCache = new Map<string, GoogleAuth>();

function authFor(scopes: string[]): GoogleAuth {
  const key = scopes.join(" ");
  let auth = authCache.get(key);
  if (!auth) {
    const json = serviceAccountJson();
    auth = new GoogleAuth({
      credentials: {
        client_email: json.client_email,
        private_key: json.private_key,
      },
      scopes,
    });
    authCache.set(key, auth);
  }
  return auth;
}

/** An access token for the given scopes, or throws if no service account. */
export async function googleAccessToken(scopes: string[]): Promise<string> {
  const client = await authFor(scopes).getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain Google access token");
  return token.token;
}
