import { NextRequest, NextResponse } from "next/server";
import { semanticConfigured, semanticQuery, type SemanticQuery } from "@/lib/semantic";

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
  const result = await semanticQuery(body);
  if (!result) {
    return NextResponse.json({ error: "query failed" }, { status: 502 });
  }
  return NextResponse.json(result);
}
