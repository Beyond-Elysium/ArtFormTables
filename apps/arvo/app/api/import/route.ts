import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { campaignDataRowSchema, computeDerivedMetrics, type CampaignDataRow } from "@/lib/import/campaign-data-row";

export const runtime = "nodejs";

/**
 * POST { rows: Record<string, string>[] } — validates every row against
 * campaignDataRowSchema and, only if all rows pass, bulk-inserts them into
 * CampaignData in a single createMany. No workspace model exists yet (see
 * prisma/schema.prisma), so workspaceId mirrors userId, same as the Stripe
 * webhook's fallback.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { rows?: unknown } | null;
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "no rows provided" }, { status: 400 });
  }

  const errors: { row: number; message: string }[] = [];
  const validRows: CampaignDataRow[] = [];

  rows.forEach((raw, index) => {
    const result = campaignDataRowSchema.safeParse(raw);
    if (!result.success) {
      errors.push({ row: index + 1, message: result.error.issues.map((i) => i.message).join("; ") });
    } else {
      validRows.push(result.data);
    }
  });

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  const data = validRows.map((row) => {
    const { ctr, cpl, cpm } = computeDerivedMetrics(row);
    return {
      userId,
      workspaceId: userId,
      platform: row.platform,
      campaignName: row.campaign_name,
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: row.conversions,
      spend: row.spend,
      ctr,
      cpl,
      cpm,
      sector: row.sector,
      objective: row.objective,
    };
  });

  const { count } = await db.campaignData.createMany({ data });
  return NextResponse.json({ imported: count });
}
