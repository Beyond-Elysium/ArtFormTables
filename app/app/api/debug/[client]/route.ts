import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/config/clients";
import { fetchClientDataUncached } from "@/lib/connectors";
import { resolveRange } from "@/lib/range";
import { requireSharedSecret } from "@/lib/routeAuth";
import {
  googleAuthMethod,
  hasOAuth,
  hasServiceAccount,
  serviceAccountJson,
} from "@/lib/connectors/googleAuth";

// Live diagnostic — runs each source and reports demo/live + any error, plus
// the service-account status. Bypasses ISR caching so it shows the real state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: { client: string } }) {
  const authError = requireSharedSecret(req, {
    env: ["CRON_SECRET", "REPORT_TOKEN"],
    allowDevQueryToken: true,
  });
  if (authError) return authError;

  const client = getClientBySlug(params.client);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  // Google auth status (never returns the secret/key itself).
  const googleAuth: Record<string, unknown> = {
    method: googleAuthMethod(),
    oauthConfigured: hasOAuth(),
    serviceAccountConfigured: hasServiceAccount(),
  };
  if (hasServiceAccount()) {
    try {
      const json = serviceAccountJson();
      googleAuth.serviceAccountValid = Boolean(json.client_email && json.private_key);
      googleAuth.clientEmail = json.client_email ?? null;
    } catch (err) {
      googleAuth.serviceAccountValid = false;
      googleAuth.parseError = String(err);
    }
  }

  // Uncached on purpose: diagnostics must show the real provider state, not a
  // (up to 1h stale) cached window.
  const results = await fetchClientDataUncached(client, resolveRange({}));
  const sources = results.map((r) => ({
    sourceId: r.sourceId,
    label: r.label,
    category: r.category,
    status: r.isMock ? "demo" : "live",
    error: r.error ?? null,
  }));

  return NextResponse.json({ slug: client.slug, googleAuth, sources });
}
