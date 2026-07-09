import { NextResponse } from "next/server";
import { semanticHealth } from "@/lib/semantic";

// Connection diagnostic for the semantic layer. Hit this after setting
// SEMANTIC_API_URL/_TOKEN to confirm the app can reach the service. Never
// returns the token — only the URL, reachability, and the model list.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await semanticHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 502 });
}
