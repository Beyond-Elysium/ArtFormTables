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
  const raw = process.env.GA_SERVICE_ACCOUNT_KEY!;
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
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
