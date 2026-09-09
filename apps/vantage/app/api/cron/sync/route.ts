import { NextRequest, NextResponse } from "next/server";
import { runDailySync, type WorkspaceSyncConfig } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * TODO(schema)/TODO(db): workspace NAICS codes and tracked agencies live in
 * the Prisma schema being authored concurrently (Workspace / WorkspaceConfig
 * models). Until that and its generated client are available in this
 * worktree, this cron route has nothing to iterate — `runDailySync` is fully
 * wired and unit-tested (see lib/sync/*.test.ts) and ready to run for real
 * the moment a `getWorkspaceConfigs()` and a `SyncDbClient` implementation
 * exist.
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
    const summary = await runDailySync(workspaceConfigs);
    return NextResponse.json({ workspaceCount: workspaceConfigs.length, ...summary });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
