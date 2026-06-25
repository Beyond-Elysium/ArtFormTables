import { NextRequest, NextResponse } from "next/server";
import { getClientBySlug } from "@/config/clients";
import { fetchClientData } from "@/lib/connectors";
import { resolveRange } from "@/lib/range";
import { hasServiceAccount, serviceAccountJson } from "@/lib/connectors/googleAuth";

// Live diagnostic — runs each source and reports demo/live + any error, plus
// the service-account status. Bypasses ISR caching so it shows the real state.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: { client: string } }) {
  // If a secret is configured, require it; otherwise leave open (dev).
  const secret = process.env.CRON_SECRET ?? process.env.REPORT_TOKEN;
  if (secret) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const client = getClientBySlug(params.client);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  // Service-account status (never returns the key itself, only the email).
  const serviceAccount: Record<string, unknown> = { present: hasServiceAccount() };
  if (hasServiceAccount()) {
    try {
      const json = serviceAccountJson();
      serviceAccount.valid = Boolean(json.client_email && json.private_key);
      serviceAccount.clientEmail = json.client_email ?? null;
      serviceAccount.projectId = json.project_id ?? null;
    } catch (err) {
      serviceAccount.valid = false;
      serviceAccount.parseError = String(err);
    }
  }

  const results = await fetchClientData(client, resolveRange({}));
  const sources = results.map((r) => ({
    sourceId: r.sourceId,
    label: r.label,
    category: r.category,
    status: r.isMock ? "demo" : "live",
    error: r.error ?? null,
  }));

  return NextResponse.json({ slug: client.slug, serviceAccount, sources });
}
