import { NextRequest, NextResponse } from "next/server";
import { runDailySync, type WorkspaceSyncConfig } from "@/lib/sync";
import { prismaSyncDbClient } from "@/lib/sync/db";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * TODO(settings): tracked agencies/NAICS codes belong on a per-workspace
 * settings model (the /settings page's "tracked agencies, NAICS codes"
 * fields — not yet built, separate from this sync layer). Until that model
 * exists there's nothing to iterate here, but the sync itself is fully
 * wired: `runDailySync` + `prismaSyncDbClient` write real rows the moment
 * this returns a non-empty list.
 */
async function getWorkspaceConfigs(): Promise<WorkspaceSyncConfig[]> {
  return [];
}

/**
 * Daily SAM.gov + USASpending sync. Auth: a CRON_SECRET bearer token, or
 * Vercel's `x-vercel-cron` header — same pattern as app/app/api/cron/reports/route.ts.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && !isVercelCron) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceConfigs = await getWorkspaceConfigs();

  try {
    const summary = await runDailySync(workspaceConfigs, { db: prismaSyncDbClient });
    return NextResponse.json({ workspaceCount: workspaceConfigs.length, ...summary });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
