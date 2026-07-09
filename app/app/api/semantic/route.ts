import { NextRequest, NextResponse } from "next/server";
import { semanticConfigured, runSemanticQuery, type SemanticQuery } from "@/lib/semantic";

// Browser → this route → semantic service. The server holds the token, so
// interactive cross-filtering/drill-down never exposes a credential to viewers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!semanticConfigured()) {
    return NextResponse.json({ error: "semantic layer not configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as SemanticQuery | null;
  if (!body?.model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }
  const outcome = await runSemanticQuery(body);
  if (!outcome.ok) {
    // Relay the upstream reason (e.g. "401 unauthorized", "unknown model 'ga4'")
    // so 502s are debuggable instead of opaque.
    return NextResponse.json(
      { error: outcome.message ?? "query failed", upstreamStatus: outcome.status },
      { status: outcome.status >= 400 && outcome.status < 600 ? outcome.status : 502 },
    );
  }
  return NextResponse.json(outcome.result);
}
