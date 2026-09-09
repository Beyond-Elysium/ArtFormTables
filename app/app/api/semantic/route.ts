import { NextRequest, NextResponse } from "next/server";
import { semanticConfigured, runSemanticQuery, type SemanticQuery } from "@/lib/semantic";
import { getClientBySlug } from "@/config/clients";

// Browser → this route → semantic service. The server holds the token, so
// interactive cross-filtering/drill-down never exposes a credential to viewers.
//
// SECURITY (finding E5): the body must name the requesting page's `client`
// slug; the server validates it against the registry and force-injects a
// `client = slug` filter into every query (inside runSemanticQuery), so the
// shared bearer token can never read another client's rows. Dashboards are
// public-by-URL, so knowing a valid slug IS the viewing grant — this scoping
// stops cross-client reads through the query body, which the slug never
// authorized.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!semanticConfigured()) {
    return NextResponse.json({ error: "semantic layer not configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as
    | (SemanticQuery & { client?: unknown })
    | null;
  if (!body?.model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }
  if (typeof body.client !== "string" || !body.client) {
    return NextResponse.json({ error: "client is required" }, { status: 400 });
  }
  const client = getClientBySlug(body.client);
  if (!client) {
    return NextResponse.json({ error: `unknown client '${body.client}'` }, { status: 400 });
  }
  const { client: _client, ...query } = body;
  const outcome = await runSemanticQuery(query as SemanticQuery, client.slug);
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
