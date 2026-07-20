import { NextResponse } from "next/server";
import { semanticConfigured, semanticModels } from "@/lib/semantic";

// Browser → this route → semantic service. The server injects the bearer token,
// so the Explore UI can load the schema (dimensions/measures per model) without
// ever holding a credential.
//
// Deliberately NOT client-scoped: the schema (model/dimension/measure NAMES) is
// structural metadata, not client data — rows only flow through /api/semantic,
// which force-injects the client filter.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!semanticConfigured()) {
    return NextResponse.json({ error: "semantic layer not configured" }, { status: 503 });
  }
  const models = await semanticModels();
  if (!models) {
    return NextResponse.json({ error: "models fetch failed" }, { status: 502 });
  }
  return NextResponse.json(models);
}
